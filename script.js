const toggle = document.querySelector(".nav-toggle");
const menu = document.getElementById("nav-menu");

toggle.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});

menu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  });
});

document.getElementById("year").textContent = new Date().getFullYear();

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