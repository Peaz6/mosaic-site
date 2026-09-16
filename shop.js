(function () {
  "use strict";

  var ITEMS = {
    mohinga: { name: "Mohinga", price: 12 },
    laphet: { name: "Tea leaf salad", price: 9 },
  };
  var FREE_DELIVERY_OVER = 40;
  var DELIVERY_FEE = 4;

  var cart = {};
  var listEl = document.getElementById("cart-list");
  var emptyEl = document.getElementById("cart-empty");
  var subtotalEl = document.getElementById("cart-subtotal");
  var deliveryEl = document.getElementById("cart-delivery");
  var totalEl = document.getElementById("cart-total");
  var freeDeliveryEl = document.getElementById("free-delivery");
  var statusEl = document.getElementById("order-status");
  var form = document.getElementById("order-form");

  function money(n) {
    return "$" + n.toFixed(2);
  }

  function buyable() {
    return listEl && subtotalEl && deliveryEl && totalEl && emptyEl && form && statusEl;
  }

  function render() {
    var keys = Object.keys(cart);

    var itemsHtml = keys
      .map(function (id) {
        var qty = cart[id];
        var it = ITEMS[id];
        var line = qty * it.price;
        return (
          '<li class="cart-item" data-id="' + id + '">' +
            '<div class="cart-item-info">' +
              '<span class="cart-item-name">' + it.name + '</span>' +
              '<span class="cart-item-price">' + money(it.price) + ' each</span>' +
            '</div>' +
            '<div class="cart-item-actions">' +
              '<button type="button" class="cart-btn" data-minus="' + id + '" aria-label="Decrease ' + it.name + '">-</button>' +
              '<span class="cart-item-qty">' + qty + '</span>' +
              '<button type="button" class="cart-btn" data-plus="' + id + '" aria-label="Increase ' + it.name + '">+</button>' +
              '<button type="button" class="cart-remove" data-remove="' + id + '" aria-label="Remove ' + it.name + '">Remove</button>' +
            '</div>' +
            '<span class="cart-item-line">' + money(line) + '</span>' +
          '</li>'
        );
      })
      .join("");

    listEl.innerHTML = itemsHtml || (
      '<li class="cart-empty" id="cart-empty">Your order is empty. Add a dish above.</li>'
    );

    var subtotal = keys.reduce(function (sum, id) {
      return sum + cart[id] * ITEMS[id].price;
    }, 0);
    var delivery = subtotal === 0 ? 0 : subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;

    subtotalEl.textContent = money(subtotal);
    deliveryEl.textContent = delivery === 0 && subtotal > 0 ? "Free" : money(delivery);
    totalEl.textContent = money(subtotal + delivery);
    freeDeliveryEl.hidden = delivery === 0;

    Object.keys(ITEMS).forEach(function (id) {
      var countEl = document.getElementById("count-" + id);
      if (countEl) countEl.textContent = cart[id] || 0;
    });
  }

  function add(id, qty) {
    cart[id] = (cart[id] || 0) + qty;
    render();
  }

  function minus(id) {
    var cur = cart[id] || 0;
    if (cur <= 1) delete cart[id];
    else cart[id] = cur - 1;
    render();
  }

  document.querySelectorAll(".stepper").forEach(function (stepper) {
    stepper.addEventListener("click", function (event) {
      var t = event.target;
      if (t.dataset.plus) add(t.dataset.plus, 1);
      else if (t.dataset.minus) minus(t.dataset.minus);
    });
  });

  listEl.addEventListener("click", function (event) {
    var t = event.target;
    var id, cur;
    if (t.dataset.plus) { id = t.dataset.plus; cart[id] = (cart[id] || 0) + 1; render(); }
    else if (t.dataset.minus) {
      id = t.dataset.minus; cur = cart[id] || 1;
      if (cur <= 1) delete cart[id]; else cart[id] = cur - 1;
      render();
    } else if (t.dataset.remove) { delete cart[t.dataset.remove]; render(); }
  });

  function buildMessage() {
    var keys = Object.keys(cart);
    var lines = keys.map(function (id) {
      return "  - " + cart[id] + " x " + ITEMS[id].name + " (" + money(cart[id] * ITEMS[id].price) + ")";
    });
    var subtotal = keys.reduce(function (s, id) { return s + cart[id] * ITEMS[id].price; }, 0);
    var delivery = subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
    return (
      "New order:\n" + lines.join("\n") +
      "\nSubtotal: " + money(subtotal) +
      "\nDelivery: " + (delivery === 0 ? "Free" : money(delivery)) +
      "\nTotal: " + money(subtotal + delivery) +
      "\nDeliver to: " + document.getElementById("order-address").value.trim()
    );
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = form.name.value.trim();
    var email = form.email.value.trim();
    var address = form.address.value.trim();

    statusEl.classList.remove("success", "error");

    if (Object.keys(cart).length === 0) {
      statusEl.textContent = "Your order is empty. Add a dish first.";
      statusEl.className = "form-status error";
      return;
    }
    if (!name || !email || !address) {
      statusEl.textContent = "Please fill in all fields.";
      statusEl.className = "form-status error";
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      statusEl.textContent = "Please enter a valid email address.";
      statusEl.className = "form-status error";
      return;
    }

    var message = buildMessage();

    fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, email: email, message: message }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("static");
        statusEl.textContent = "Order placed! It's waiting in our inbox. We'll confirm by email.";
        statusEl.className = "form-status success";
        form.reset();
        cart = {};
        render();
      })
      .catch(function () {
        var confirmSend = window.confirm(
          "This demo opens your email app. Run 'node server.js' locally to save orders to the SQLite inbox."
        );
        if (confirmSend) {
          var mailto = "mailto:hello@reminisce.example?subject=" +
            encodeURIComponent("Reminisce order from " + name) +
            "&body=" + encodeURIComponent(message + "\n\n- " + name + " (" + email + ")");
          window.location.href = mailto;
        }
        statusEl.textContent = "Thanks! Your order is ready to send.";
        statusEl.className = "form-status success";
        form.reset();
        cart = {};
        render();
      });
  });

  render();
})();