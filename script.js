const toggle = document.querySelector(".nav-toggle");
const menu = document.getElementById("nav-menu");

toggle.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});

menu.querySelectorAll("a, button").forEach((el) => {
  el.addEventListener("click", () => {
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  });
});

document.getElementById("year").textContent = new Date().getFullYear();

/* Search */
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");

const sections = Array.from(document.querySelectorAll("main section[id]"))
  .map((section) => ({
    id: section.id,
    title: section.querySelector("h1, h2")?.textContent.trim() || section.id,
    text: section.textContent.replace(/\s+/g, " ").trim(),
  }));

function highlight(text, query) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text.slice(0, 120);
  const start = Math.max(0, index - 30);
  return (start > 0 ? "…" : "") + text.slice(start, index + query.length + 50) + "…";
}

function runSearch(query) {
  const q = query.trim();
  if (!q) {
    searchResults.hidden = true;
    return;
  }

  const matches = sections
    .filter((s) => s.title.toLowerCase().includes(q.toLowerCase()) || s.text.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6);

  searchResults.innerHTML = "";

  if (matches.length === 0) {
    const li = document.createElement("li");
    li.className = "search-empty";
    li.textContent = "No results found.";
    searchResults.append(li);
  } else {
    matches.forEach((m) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${m.id}`;
      const strong = document.createElement("strong");
      strong.textContent = m.title;
      const span = document.createElement("span");
      span.textContent = highlight(m.text, q);
      a.append(strong, span);
      li.append(a);
      searchResults.append(li);
    });
  }

  searchResults.hidden = false;
}

searchInput.addEventListener("input", () => runSearch(searchInput.value));

searchResults.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (link) {
    searchInput.value = "";
    runSearch("");
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#nav-search")) {
    searchResults.hidden = true;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchResults.hidden = true;
  }
});

/* Mode detection: local (Node server + SQLite) or static (GitHub Pages) */
let mode = "static";

async function detectMode() {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    if (res.ok && (await res.json()).mode === "local") {
      mode = "local";
      document.documentElement.dataset.mode = "local";
    }
  } catch {
    mode = "static";
  }
}

function isLocal() {
  return mode === "local";
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

/* Contact form */
const form = document.getElementById("contact-form");
const status = document.getElementById("form-status");

if (form && status) {
  async function submitLocalMessage(name, email, message) {
    await api("/api/messages", { method: "POST", body: { name, email, message } });
    status.textContent = "Message saved to the database. Thanks!";
    status.className = "form-status success";
    form.reset();
    const inboxEl = document.getElementById("inbox");
    if (inboxEl && !inboxEl.hidden) {
      loadInbox();
    }
  }

  function submitStaticMessage(name, email, message) {
    const mailto = `mailto:hello@reminisce.example?subject=${encodeURIComponent(
      `Reminisce enquiry from ${name}`
    )}&body=${encodeURIComponent(`${message}\n\n— ${name} (${email})`)}`;

    const sent = window.confirm(
      "This demo opens your email app. Run 'node server.js' locally to save messages to a real SQLite database."
    );
    if (sent) {
      window.location.href = mailto;
    }

    status.textContent = "Thanks! Your email app should open.";
    status.className = "form-status success";
    form.reset();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const message = form.message.value.trim();

    status.classList.remove("success", "error");

    if (!name || !email || !message) {
      status.textContent = "Please fill in all fields.";
      status.className = "form-status error";
      return;
    }

    try {
      if (isLocal()) {
        await submitLocalMessage(name, email, message);
      } else {
        submitStaticMessage(name, email, message);
      }
    } catch (err) {
      status.textContent = err.message;
      status.className = "form-status error";
    }
  });
}

/* Inbox (local mode only) */
const inbox = document.getElementById("inbox");
const inboxList = document.getElementById("inbox-list");
const inboxRefresh = document.getElementById("inbox-refresh");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadInbox() {
  if (!isLocal() || !inbox) return;
  try {
    const messages = await api("/api/messages");
    inbox.hidden = false;
    if (messages.length === 0) {
      inboxList.innerHTML = "<li class='inbox-empty'>No messages yet.</li>";
      return;
    }
    inboxList.innerHTML = messages
      .map(
        (m) =>
          `<li class="inbox-item">
            <p class="inbox-meta"><strong>${escapeHtml(m.name)}</strong> &lt;${escapeHtml(m.email)}&gt; · ${escapeHtml(m.created_at)}</p>
            <p class="inbox-body">${escapeHtml(m.message)}</p>
          </li>`
      )
      .join("");
  } catch {
    inbox.hidden = true;
  }
}

if (inboxRefresh && inboxList) {
  inboxRefresh.addEventListener("click", loadInbox);
}

/* Account login */
const STORAGE_KEY_USERS = "mosaic_users";
const STORAGE_KEY_SESSION = "mosaic_session";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authModal = document.getElementById("auth-modal");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubmit = document.getElementById("auth-submit");
const authStatus = document.getElementById("auth-status");
const nameRow = document.getElementById("signup-name-row");
const loginBtn = document.getElementById("login-open");
const logoutBtn = document.getElementById("logout");
const navUser = document.getElementById("nav-user");
const navUserName = document.getElementById("nav-user-name");
const forgotLink = document.getElementById("forgot-link");
const backToLogin1 = document.getElementById("back-to-login");
const backToLogin2 = document.getElementById("back-to-login-2");
const backToLogin3 = document.getElementById("back-to-login-3");
const forgotForm = document.getElementById("forgot-form");
const forgotStatus = document.getElementById("forgot-status");
const forgotSubmit = document.getElementById("forgot-submit");
const forgotEmail = document.getElementById("forgot-email");
const emailSentTo = document.getElementById("email-sent-to");
const emailPreviewBody = document.getElementById("email-preview-body");
const openResetBtn = document.getElementById("open-reset");
const mailtoReset = document.getElementById("mailto-reset");
const resetForm = document.getElementById("reset-form");
const resetStatus = document.getElementById("reset-status");
const resetSubmitBtn = document.getElementById("reset-submit");
const authTabs = document.querySelectorAll(".auth-tab");

let authMode = "login";
let lastFocused = null;
let resetToken = null;
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

let localSession = null;
const staticUsers = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || "{}");

function getStaticSession() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION) || "null");
}

function setStaticSession(email, name) {
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ email, name }));
  renderAuthState();
}

function clearStaticSession() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
  renderAuthState();
}

const panels = {
  login: document.getElementById("auth-login-panel"),
  forgot: document.getElementById("auth-forgot-panel"),
  email: document.getElementById("auth-email-panel"),
  reset: document.getElementById("auth-reset-panel"),
};

function showPanel(name) {
  Object.values(panels).forEach((p) => (p.hidden = true));
  panels[name].hidden = false;
}

function showLogin(tabMode) {
  authMode = tabMode || authMode;
  authStatus.textContent = "";
  authStatus.className = "auth-status";
  authTabs.forEach((tab) => {
    const selected = tab.dataset.tab === authMode;
    tab.setAttribute("aria-selected", String(selected));
  });
  nameRow.style.display = authMode === "signup" ? "" : "none";
  authTitle.textContent = authMode === "signup" ? "Create account" : "Log in";
  authSubmit.textContent = authMode === "signup" ? "Create account" : "Log in";
  showPanel("login");
  setTimeout(() => document.getElementById("auth-email").focus(), 50);
}

/* Loading helper */
function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.classList.toggle("is-busy", busy);
}

/* Focus trap */
authModal.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || authModal.hidden) return;
  const focusables = Array.from(authModal.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null && !el.disabled
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !authModal.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !authModal.contains(active)) {
    event.preventDefault();
    first.focus();
  }
});

function openModal(tabMode) {
  lastFocused = document.activeElement;
  showLogin(tabMode);
  authModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  authModal.hidden = true;
  document.body.style.overflow = "";
  authForm.reset();
  forgotForm.reset();
  resetForm.reset();
  authStatus.textContent = "";
  forgotStatus.textContent = "";
  resetStatus.textContent = "";
  resetToken = null;
  if (lastFocused && lastFocused.isConnected) {
    lastFocused.focus();
  }
}

document.querySelectorAll("[data-auth-close]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !authModal.hidden) {
    closeModal();
  }
});

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => showLogin(tab.dataset.tab));
});

loginBtn.addEventListener("click", () => openModal("login"));
logoutBtn.addEventListener("click", logout);

/* Password toggle */
document.querySelectorAll("[data-pwd-toggle]").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const input = toggle.previousElementSibling;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(show));
    input.focus();
  });
});

/* Forgot password links */
forgotLink.addEventListener("click", () => {
  if (!isLocal()) {
    authStatus.textContent = "Password reset requires the local SQLite server. Run 'node server.js' locally.";
    authStatus.className = "auth-status error";
    return;
  }
  forgotStatus.textContent = "";
  showPanel("forgot");
  setTimeout(() => forgotEmail.focus(), 50);
});

backToLogin1.addEventListener("click", () => showLogin(authMode));
backToLogin2.addEventListener("click", () => showLogin(authMode));
backToLogin3.addEventListener("click", () => showLogin(authMode));

/* Forgot form */
forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = forgotEmail.value.trim().toLowerCase();
  forgotStatus.textContent = "";
  forgotStatus.className = "auth-status";

  if (!email || !EMAIL_RE.test(email)) {
    forgotStatus.textContent = "Please enter a valid email address.";
    forgotStatus.className = "auth-status error";
    return;
  }

  setBusy(forgotSubmit, true);
  try {
    const data = await api("/api/auth/reset/request", { method: "POST", body: { email } });
    resetToken = data.reset_token || null;

    emailSentTo.textContent = `We sent a reset link to ${email}. Since email delivery isn't wired up yet, here's a preview for the demo:`;
    const resetUrl = location.origin + location.pathname + "#reset=" + (resetToken || "DEMO_TOKEN");
    emailPreviewBody.textContent =
      resetToken
        ? `You requested a password reset. Click below to choose a new password. The link expires in 30 minutes.`
        : `If an account exists for ${email}, a reset link was sent. Check your spam folder.`;

    mailtoReset.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Reminisce — reset your password")}&body=${encodeURIComponent("You requested a Reminisce password reset. Use this link within 30 minutes:\n\n" + resetUrl)}`;
    openResetBtn.disabled = !resetToken;
    openResetBtn.style.opacity = resetToken ? "1" : "0.4";

    showPanel("email");
  } catch (err) {
    forgotStatus.textContent = err.message;
    forgotStatus.className = "auth-status error";
  } finally {
    setBusy(forgotSubmit, false);
  }
});

/* Open reset panel from email preview */
openResetBtn.addEventListener("click", () => {
  if (!resetToken) return;
  resetStatus.textContent = "";
  resetStatus.className = "auth-status";
  showPanel("reset");
  setTimeout(() => document.getElementById("reset-password").focus(), 50);
});

/* Reset form */
resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("reset-password").value;
  const password2 = document.getElementById("reset-password2").value;
  resetStatus.textContent = "";
  resetStatus.className = "auth-status";

  if (password.length < 6) {
    resetStatus.textContent = "Password must be at least 6 characters.";
    resetStatus.className = "auth-status error";
    return;
  }

  if (password !== password2) {
    resetStatus.textContent = "Passwords do not match.";
    resetStatus.className = "auth-status error";
    return;
  }

  setBusy(resetSubmitBtn, true);
  try {
    await api("/api/auth/reset", { method: "POST", body: { token: resetToken, password } });
    resetToken = null;
    resetStatus.textContent = "Password updated! You can now log in.";
    resetStatus.className = "auth-status success";
    setTimeout(() => {
      showLogin("login");
      authStatus.textContent = "Password updated. Log in with your new password.";
      authStatus.className = "auth-status success";
      document.getElementById("auth-password").focus();
    }, 900);
  } catch (err) {
    resetStatus.textContent = err.message;
    resetStatus.className = "auth-status error";
  } finally {
    setBusy(resetSubmitBtn, false);
  }
});

/* Main login/signup */
function renderAuthState() {
  const session = isLocal() ? localSession : getStaticSession();

  if (session) {
    loginBtn.hidden = true;
    navUser.hidden = false;
    navUserName.textContent = session.name || session.email;
  } else {
    loginBtn.hidden = false;
    navUser.hidden = true;
  }

  if (isLocal()) {
    if (session) {
      loadInbox();
    } else if (inbox) {
      inbox.hidden = true;
    }
  } else if (inbox) {
    inbox.hidden = true;
  }
}

async function restoreSession() {
  if (isLocal()) {
    try {
      const me = await api("/api/auth/me");
      localSession = { name: me.name, email: me.email };
    } catch {
      localSession = null;
    }
  }
  renderAuthState();
}

async function logout() {
  if (isLocal()) {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    localSession = null;
  } else {
    clearStaticSession();
  }
  renderAuthState();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = authForm["auth-email"].value.trim().toLowerCase();
  const password = authForm["auth-password"].value;
  const name = authForm["auth-name"].value.trim();
  const remember = document.getElementById("auth-remember").checked;

  authStatus.classList.remove("success", "error");
  authStatus.textContent = "";

  if (!email || !password) {
    authStatus.textContent = "Please fill in all fields.";
    authStatus.classList.add("error");
    return;
  }

  if (!EMAIL_RE.test(email)) {
    authStatus.textContent = "Please enter a valid email address.";
    authStatus.classList.add("error");
    return;
  }

  if (password.length < 6) {
    authStatus.textContent = "Password must be at least 6 characters.";
    authStatus.classList.add("error");
    return;
  }

  setBusy(authSubmit, true);

  try {
    if (isLocal()) {
      if (authMode === "signup") {
        if (!name) {
          authStatus.textContent = "Please enter your full name.";
          authStatus.classList.add("error");
          setBusy(authSubmit, false);
          return;
        }
        await api("/api/auth/signup", { method: "POST", body: { name, email, password, remember } });
        localSession = { name, email };
      } else {
        await api("/api/auth/login", { method: "POST", body: { email, password, remember } });
        localSession = { name, email };
      }
    } else {
      if (authMode === "signup") {
        if (!name) {
          authStatus.textContent = "Please enter your full name.";
          authStatus.classList.add("error");
          setBusy(authSubmit, false);
          return;
        }
        if (staticUsers[email]) {
          authStatus.textContent = "An account with this email already exists.";
          authStatus.classList.add("error");
          setBusy(authSubmit, false);
          return;
        }
        staticUsers[email] = { name, password };
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(staticUsers));
        setStaticSession(email, name);
      } else {
        const user = staticUsers[email];
        if (!user || user.password !== password) {
          authStatus.textContent = "Incorrect email or password.";
          authStatus.classList.add("error");
          setBusy(authSubmit, false);
          return;
        }
        setStaticSession(email, user.name);
      }
    }

    closeModal();
    renderAuthState();
  } catch (err) {
    authStatus.textContent = err.message;
    authStatus.classList.add("error");
  } finally {
    setBusy(authSubmit, false);
  }
});

async function init() {
  await detectMode();
  await restoreSession();

  const hash = location.hash;
  if (hash.startsWith("#reset=") && isLocal()) {
    resetToken = decodeURIComponent(hash.slice(7));
    openModal("login");
    resetStatus.textContent = "";
    showPanel("reset");
    setTimeout(() => document.getElementById("reset-password").focus(), 100);
    history.replaceState(null, "", location.pathname + location.search);
  }
}

init();