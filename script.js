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
  }))
  .filter(() => true);

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

/* Contact form */
const form = document.getElementById("contact-form");
const status = document.getElementById("form-status");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const message = form.message.value.trim();

  if (!name || !email || !message) {
    status.textContent = "Please fill in all fields.";
    status.className = "form-status error";
    return;
  }

  const mailto = `mailto:hello@mosaic.example?subject=${encodeURIComponent(
    `Mosaic enquiry from ${name}`
  )}&body=${encodeURIComponent(`${message}\n\n— ${name} (${email})`)}`;

  const sent = window.confirm(
    "This demo opens your email app. Connect a real address (e.g. via Formspree) to collect submissions automatically."
  );
  if (sent) {
    window.location.href = mailto;
  }

  status.textContent = "Thanks! Your email app should open.";
  status.className = "form-status success";
  form.reset();
});

/* Account login */
const STORAGE_KEY_USERS = "mosaic_users";
const STORAGE_KEY_SESSION = "mosaic_session";

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
let authMode = "login";

const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || "{}");

function getSession() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION) || "null");
}

function setSession(email, name) {
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ email, name }));
  renderAuthState();
  closeModal();
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
  renderAuthState();
}

function renderAuthState() {
  const session = getSession();
  if (session) {
    loginBtn.hidden = true;
    navUser.hidden = false;
    navUserName.textContent = session.name || session.email;
  } else {
    loginBtn.hidden = false;
    navUser.hidden = true;
  }
}

function openModal(mode) {
  authMode = mode;
  authStatus.textContent = "";
  authStatus.className = "auth-status";
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const selected = tab.dataset.tab === authMode;
    tab.setAttribute("aria-selected", String(selected));
  });
  nameRow.style.display = authMode === "signup" ? "" : "none";
  authTitle.textContent = authMode === "signup" ? "Create account" : "Log in";
  authSubmit.textContent = authMode === "signup" ? "Create account" : "Log in";
  authModal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("auth-email").focus(), 50);
}

function closeModal() {
  authModal.hidden = true;
  document.body.style.overflow = "";
  authForm.reset();
}

document.querySelectorAll("[data-auth-close]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !authModal.hidden) {
    closeModal();
  }
});

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => openModal(tab.dataset.tab));
});

loginBtn.addEventListener("click", () => openModal("login"));
logoutBtn.addEventListener("click", clearSession);

authForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const email = authForm["auth-email"].value.trim().toLowerCase();
  const password = authForm["auth-password"].value;
  const name = authForm["auth-name"].value.trim();

  authStatus.classList.remove("success", "error");

  if (!email || !password || (authMode === "signup" && email.length < 3)) {
    authStatus.textContent = "Please enter your email and password.";
    authStatus.classList.add("error");
    return;
  }

  if (password.length < 6) {
    authStatus.textContent = "Password must be at least 6 characters.";
    authStatus.classList.add("error");
    return;
  }

  if (authMode === "signup") {
    if (!name) {
      authStatus.textContent = "Please enter your full name.";
      authStatus.classList.add("error");
      return;
    }
    if (users[email]) {
      authStatus.textContent = "An account with this email already exists.";
      authStatus.classList.add("error");
      return;
    }
    users[email] = { name, password };
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    setSession(email, name);
    authStatus.textContent = "Account created. Welcome!";
    authStatus.classList.add("success");
  } else {
    const user = users[email];
    if (!user || user.password !== password) {
      authStatus.textContent = "Incorrect email or password.";
      authStatus.classList.add("error");
      return;
    }
    setSession(email, user.name);
    authStatus.textContent = "Logged in. Welcome back!";
    authStatus.classList.add("success");
  }
});

renderAuthState();