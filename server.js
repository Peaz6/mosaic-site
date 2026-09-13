const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "mosaic.db");
const SESSION_DAYS = 7;
const RESET_TOKEN_TTL = 30 * 60 * 1000;

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function getSessionUser(req) {
  const header = req.headers.cookie || "";
  const match = header.match(/(?:^|;\s*)mosaic_session=([^;]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const row = db
    .prepare("SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?")
    .get(token);
  if (!row) return null;
  const created = db.prepare("SELECT created_at FROM sessions WHERE token = ?").get(token).created_at;
  const ageMs = Date.now() - new Date(created + "Z").getTime();
  if (ageMs > SESSION_DAYS * 24 * 60 * 60 * 1000) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return row;
}

function setSessionCookie(res, token, remember) {
  let cookie = `mosaic_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`;
  if (remember) {
    cookie += "; Max-Age=" + 30 * 24 * 60 * 60;
  }
  res.setHeader("Set-Cookie", cookie);
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, mode: "local" });
    return;
  }

  if (url.pathname === "/api/auth/signup" && req.method === "POST") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const remember = Boolean(body.remember);

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
      sendJson(res, 400, { error: "Invalid name, email, or password (min 6 chars)." });
      return;
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      sendJson(res, 409, { error: "An account with this email already exists." });
      return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    const user = db
      .prepare("INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)")
      .run(name, email, passwordHash, salt);
    const userId = Number(user.lastInsertRowid);

    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId);
    setSessionCookie(res, token, remember);
    sendJson(res, 201, { id: userId, name, email });
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const remember = Boolean(body.remember);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: "Please enter a valid email address." });
      return;
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || hashPassword(password, user.salt) !== user.password_hash) {
      sendJson(res, 401, { error: "Incorrect email or password." });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, user.id);
    setSessionCookie(res, token, remember);
    sendJson(res, 200, { id: user.id, name: user.name, email: user.email });
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const header = req.headers.cookie || "";
    const match = header.match(/(?:^|;\s*)mosaic_session=([^;]+)/);
    if (match) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(decodeURIComponent(match[1]));
    }
    res.setHeader("Set-Cookie", "mosaic_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: "Not logged in." });
      return;
    }
    sendJson(res, 200, user);
    return;
  }

  if (url.pathname === "/api/auth/reset/request" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();

    let resetToken = null;
    if (email) {
      const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (user) {
        db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
        resetToken = crypto.randomBytes(32).toString("hex");
        db.prepare("INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)").run(
          user.id,
          resetToken,
          Date.now() + RESET_TOKEN_TTL
        );
      }
    }
    sendJson(res, 200, { ok: true, reset_token: resetToken });
    return;
  }

  if (url.pathname === "/api/auth/reset" && req.method === "POST") {
    const body = await readBody(req);
    const token = String(body.token || "");
    const password = String(body.password || "");

    if (password.length < 6) {
      sendJson(res, 400, { error: "Password must be at least 6 characters." });
      return;
    }

    const row = db.prepare("SELECT user_id, expires_at FROM password_resets WHERE token = ?").get(token);
    if (!row) {
      sendJson(res, 400, { error: "This reset link is invalid or has already been used." });
      return;
    }
    if (Date.now() > row.expires_at) {
      db.prepare("DELETE FROM password_resets WHERE token = ?").run(token);
      sendJson(res, 400, { error: "This reset link has expired. Request a new one." });
      return;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(passwordHash, salt, row.user_id);
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(row.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/messages" && req.method === "POST") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email || !message) {
      sendJson(res, 400, { error: "Please fill in all fields." });
      return;
    }

    db.prepare("INSERT INTO messages (name, email, message) VALUES (?, ?, ?)").run(name, email, message);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (url.pathname === "/api/messages" && req.method === "GET") {
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: "Log in to view the inbox." });
      return;
    }
    const rows = db.prepare("SELECT id, name, email, message, created_at FROM messages ORDER BY created_at DESC, id DESC").all();
    sendJson(res, 200, rows);
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safe = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safe);

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": data.length,
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      sendJson(res, err.message === "invalid JSON" ? 400 : 500, { error: err.message });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Mosaic local server running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});