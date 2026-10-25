/* ShopEasy front-end logic (vanilla JavaScript).
   One file; each page sets <body data-page="..."> and the matching init runs. */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (paise) => "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let currentUser = null;

/* ---------- API helper ---------- */
async function api(url, options = {}) {
  const opts = { credentials: "same-origin", headers: {}, ...options };
  if (opts.body && typeof opts.body !== "string") {
    opts.body = JSON.stringify(opts.body);
    opts.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Cart (stored in localStorage as {productId: qty}) ---------- */
const Cart = {
  get() {
    try { return JSON.parse(localStorage.getItem("cart") || "{}"); } catch (_) { return {}; }
  },
  save(c) { localStorage.setItem("cart", JSON.stringify(c)); renderBadge(); },
  add(id, qty = 1) { const c = this.get(); c[id] = Math.min((c[id] || 0) + qty, 99); this.save(c); },
  set(id, qty) { const c = this.get(); if (qty <= 0) delete c[id]; else c[id] = Math.min(qty, 99); this.save(c); },
  remove(id) { const c = this.get(); delete c[id]; this.save(c); },
  clear() { localStorage.removeItem("cart"); renderBadge(); },
  count() { return Object.values(this.get()).reduce((a, b) => a + b, 0); },
};

function renderBadge() {
  const el = $("#cart-count");
  if (el) el.textContent = Cart.count();
}

function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- Shared layout: header + footer ---------- */
async function renderLayout() {
  try { currentUser = (await api("/api/me")).user; } catch (_) { currentUser = null; }
  const q = new URLSearchParams(location.search).get("q") || "";
  const authLinks = currentUser
    ? `<span class="user-name">Hi, ${esc(currentUser.name.split(" ")[0])}</span>
       <a href="/orders">My Orders</a>
       <a href="#" id="logout-link">Logout</a>`
    : `<a href="/login">Login / Register</a>`;
  $("#site-header").innerHTML = `
    <div class="nav">
      <a class="brand" href="/">🛍️ ShopEasy</a>
      <form class="search" id="search-form">
        <input type="search" name="q" placeholder="Search products…" value="${esc(q)}" aria-label="Search products">
        <button class="btn" type="submit">Search</button>
      </form>
      <nav class="nav-links">
        <a href="/">Home</a>
        ${authLinks}
        <a href="/cart">🛒 Cart<span class="badge" id="cart-count">0</span></a>
      </nav>
    </div>`;
  $("#site-footer").textContent = "ShopEasy — College project built with HTML, CSS, JavaScript, Python (Flask) and SQLite.";
  renderBadge();
  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = new FormData(e.target).get("q").trim();
    location.href = v ? "/?q=" + encodeURIComponent(v) : "/";
  });
  const lo = $("#logout-link");
  if (lo) lo.addEventListener("click", async (e) => {
    e.preventDefault();
    await api("/api/logout", { method: "POST" });
    location.href = "/";
  });
}

/* ---------- Product card (used on home + related products) ---------- */
function productCard(p) {
  const stock = p.stock === 0 ? `<span class="stock-out">Out of stock</span>`
    : p.stock <= 5 ? `<span class="stock-low">Only ${p.stock} left</span>` : "";
  return `
    <div class="card product-card">
      <a href="/product/${p.id}"><div class="thumb">${esc(p.emoji)}</div></a>
      <div class="info">
        <span class="cat">${esc(p.category)}</span>
        <h3><a href="/product/${p.id}">${esc(p.name)}</a></h3>
        ${stock}
        <div class="bottom">
          <span class="price">${money(p.price_paise)}</span>
          <button class="btn" data-add="${p.id}" ${p.stock === 0 ? "disabled" : ""}>Add</button>
        </div>
      </div>
    </div>`;
}

function bindAddButtons(root) {
  root.querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", () => { Cart.add(Number(b.dataset.add)); toast("Added to cart"); })
  );
}

/* ---------- Pages ---------- */
const pages = {
  async home() {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    const category = params.get("category") || "";
    const data = await api("/api/products?" + new URLSearchParams({ q, category }));
    const chips = ["", ...data.categories].map((c) => {
      const href = "/?" + new URLSearchParams({ ...(q && { q }), ...(c && { category: c }) });
      return `<a class="chip ${c === category ? "active" : ""}" href="${href}">${c || "All"}</a>`;
    }).join("");
    $("#chips").innerHTML = chips;
    $("#heading").textContent = q ? `Results for “${q}”` : category || "All Products";
    $("#grid").innerHTML = data.products.length
      ? data.products.map(productCard).join("")
      : `<div class="empty" style="grid-column:1/-1">No products found.</div>`;
    bindAddButtons($("#grid"));
  },

  async product() {
    const id = location.pathname.split("/").pop();
    const root = $("#product");
    try {
      const { product: p, related } = await api("/api/products/" + id);
      document.title = p.name + " — ShopEasy";
      let qty = 1;
      root.innerHTML = `
        <div class="detail">
          <div class="thumb">${esc(p.emoji)}</div>
          <div>
            <span class="muted">${esc(p.category)}</span>
            <h1>${esc(p.name)}</h1>
            <div class="price-big">${money(p.price_paise)}</div>
            <p>${esc(p.description)}</p>
            <p>${p.stock === 0 ? '<span class="stock-out">Out of stock</span>'
              : p.stock <= 5 ? `<span class="stock-low">Only ${p.stock} left in stock</span>`
              : `<span style="color:var(--success)">In stock</span>`}</p>
            ${p.stock > 0 ? `
            <div class="qty"><button id="minus" aria-label="Decrease">−</button><span id="qty">1</span><button id="plus" aria-label="Increase">+</button></div>
            <div class="actions">
              <button class="btn" id="add">Add to Cart</button>
              <button class="btn secondary" id="buy">Buy Now</button>
            </div>` : ""}
          </div>
        </div>
        ${related.length ? `<h2 class="section-title">You may also like</h2><div class="grid" id="related">${related.map(productCard).join("")}</div>` : ""}`;
      if (p.stock > 0) {
        const show = () => ($("#qty").textContent = qty);
        $("#minus").onclick = () => { qty = Math.max(1, qty - 1); show(); };
        $("#plus").onclick = () => { qty = Math.min(p.stock, qty + 1); show(); };
        $("#add").onclick = () => { Cart.add(p.id, qty); toast("Added to cart"); };
        $("#buy").onclick = () => { Cart.add(p.id, qty); location.href = "/checkout"; };
      }
      if ($("#related")) bindAddButtons($("#related"));
    } catch (e) {
      root.innerHTML = `<div class="empty">${esc(e.message)}<br><br><a class="btn" href="/">Back to shop</a></div>`;
    }
  },

  async cart() {
    const root = $("#cart");
    async function draw() {
      const cart = Cart.get();
      if (!Object.keys(cart).length) {
        root.innerHTML = `<div class="card empty">Your cart is empty.<br><br><a class="btn" href="/">Continue shopping</a></div>`;
        return;
      }
      const data = await api("/api/cart/validate", { method: "POST", body: { cart } });
      // Sync local cart with what the server says is valid (stock / removed items)
      const synced = {};
      data.items.forEach((i) => (synced[i.id] = i.quantity));
      localStorage.setItem("cart", JSON.stringify(synced));
      renderBadge();
      if (!data.items.length) return draw();
      root.innerHTML = `
        <div class="two-col">
          <div class="card">
            ${data.items.map((i) => `
              <div class="cart-row">
                <div class="thumb">${esc(i.emoji)}</div>
                <div><a href="/product/${i.id}"><strong>${esc(i.name)}</strong></a><div class="muted">${money(i.price_paise)} each</div></div>
                <div class="qty">
                  <button data-dec="${i.id}" aria-label="Decrease">−</button>
                  <span>${i.quantity}</span>
                  <button data-inc="${i.id}" aria-label="Increase" ${i.quantity >= i.stock ? "disabled" : ""}>+</button>
                </div>
                <div><strong>${money(i.line_paise)}</strong> <button class="btn link" data-rm="${i.id}">Remove</button></div>
              </div>`).join("")}
          </div>
          <div class="card">
            <h2 style="margin-top:0">Order Summary</h2>
            <div class="summary-line"><span>Items</span><span>${data.items.reduce((a, i) => a + i.quantity, 0)}</span></div>
            <div class="summary-line"><span>Shipping</span><span>Free</span></div>
            <div class="summary-line summary-total"><span>Total</span><span>${money(data.total_paise)}</span></div>
            <a class="btn block" href="/checkout" style="margin-top:14px">Proceed to Checkout</a>
          </div>
        </div>`;
      root.querySelectorAll("[data-inc]").forEach((b) => (b.onclick = () => { Cart.set(+b.dataset.inc, (synced[b.dataset.inc] || 0) + 1); draw(); }));
      root.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => { Cart.set(+b.dataset.dec, (synced[b.dataset.dec] || 0) - 1); draw(); }));
      root.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { Cart.remove(+b.dataset.rm); draw(); }));
    }
    draw();
  },

  async checkout() {
    const root = $("#checkout");
    if (!currentUser) {
      root.innerHTML = `<div class="card empty">Please log in to place your order.<br><br><a class="btn" href="/login?next=/checkout">Login / Register</a></div>`;
      return;
    }
    const cart = Cart.get();
    if (!Object.keys(cart).length) {
      root.innerHTML = `<div class="card empty">Your cart is empty.<br><br><a class="btn" href="/">Continue shopping</a></div>`;
      return;
    }
    const data = await api("/api/cart/validate", { method: "POST", body: { cart } });
    if (!data.items.length) {
      root.innerHTML = `<div class="card empty">Items in your cart are unavailable.<br><br><a class="btn" href="/">Continue shopping</a></div>`;
      return;
    }
    root.innerHTML = `
      <div class="two-col">
        <form class="card" id="order-form">
          <h2 style="margin-top:0">Shipping Details</h2>
          <label for="name">Full name</label>
          <input id="name" name="name" required maxlength="80" value="${esc(currentUser.name)}">
          <label for="phone">Phone</label>
          <input id="phone" name="phone" required placeholder="10-digit mobile number" inputmode="tel">
          <label for="address">Address</label>
          <textarea id="address" name="address" rows="3" required placeholder="House no, street, city, PIN"></textarea>
          <label>Payment method</label>
          <div class="radio-row">
            <label><input type="radio" name="payment" value="cod" checked> Cash on Delivery</label>
            <label><input type="radio" name="payment" value="upi"> UPI</label>
            <label><input type="radio" name="payment" value="card"> Card</label>
          </div>
          <p class="muted" style="font-size:.85rem">Demo project: no real payment is taken.</p>
          <div id="form-error"></div>
          <button class="btn block" id="place" type="submit">Place Order</button>
        </form>
        <div class="card">
          <h2 style="margin-top:0">Summary</h2>
          ${data.items.map((i) => `<div class="summary-line"><span>${esc(i.emoji)} ${esc(i.name)} × ${i.quantity}</span><span>${money(i.line_paise)}</span></div>`).join("")}
          <div class="summary-line summary-total"><span>Total</span><span>${money(data.total_paise)}</span></div>
        </div>
      </div>`;
    $("#order-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = $("#place");
      btn.disabled = true;
      $("#form-error").innerHTML = "";
      try {
        const res = await api("/api/orders", {
          method: "POST",
          body: { cart: Cart.get(), name: f.get("name"), phone: f.get("phone"), address: f.get("address"), payment: f.get("payment") },
        });
        Cart.clear();
        location.href = "/orders?placed=" + res.order_id;
      } catch (err) {
        $("#form-error").innerHTML = `<div class="error">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
  },

  async login() {
    const next = new URLSearchParams(location.search).get("next") || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    if (currentUser) { location.href = safeNext; return; }
    let mode = "login";
    const root = $("#auth");
    function draw() {
      root.innerHTML = `
        <div class="tabs">
          <button class="tab ${mode === "login" ? "active" : ""}" data-mode="login">Login</button>
          <button class="tab ${mode === "register" ? "active" : ""}" data-mode="register">Register</button>
        </div>
        <form id="auth-form">
          ${mode === "register" ? `<label for="name">Name</label><input id="name" name="name" required maxlength="80">` : ""}
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="email">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required minlength="${mode === "register" ? 6 : 1}" autocomplete="${mode === "register" ? "new-password" : "current-password"}">
          <div id="form-error"></div>
          <button class="btn block" type="submit" style="margin-top:16px">${mode === "login" ? "Login" : "Create account"}</button>
        </form>`;
      root.querySelectorAll(".tab").forEach((t) => (t.onclick = () => { mode = t.dataset.mode; draw(); }));
      $("#auth-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        try {
          await api(mode === "login" ? "/api/login" : "/api/register", { method: "POST", body: f });
          location.href = safeNext;
        } catch (err) {
          $("#form-error").innerHTML = `<div class="error">${esc(err.message)}</div>`;
        }
      });
    }
    draw();
  },

  async orders() {
    const root = $("#orders");
    if (!currentUser) {
      root.innerHTML = `<div class="card empty">Please log in to see your orders.<br><br><a class="btn" href="/login?next=/orders">Login</a></div>`;
      return;
    }
    const placed = new URLSearchParams(location.search).get("placed");
    const { orders } = await api("/api/orders");
    const banner = placed ? `<div class="success">🎉 Order #${esc(placed)} placed successfully! Thank you for shopping with us.</div>` : "";
    if (!orders.length) {
      root.innerHTML = banner + `<div class="card empty">You have no orders yet.<br><br><a class="btn" href="/">Start shopping</a></div>`;
      return;
    }
    const payLabel = { cod: "Cash on Delivery", upi: "UPI", card: "Card" };
    root.innerHTML = banner + orders.map((o) => `
      <div class="card order">
        <div class="order-head">
          <div><strong>Order #${o.id}</strong> <span class="muted">· ${esc(o.created_at)} UTC</span></div>
          <span class="status">${esc(o.status)}</span>
        </div>
        <table>
          <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.price_paise)}</td><td class="num">${money(i.price_paise * i.quantity)}</td></tr>`).join("")}</tbody>
        </table>
        <div class="summary-line summary-total"><span>Total</span><span>${money(o.total_paise)}</span></div>
        <p class="muted" style="margin-bottom:0">Ship to: ${esc(o.ship_name)}, ${esc(o.ship_addr)} · ${esc(o.ship_phone)} · ${esc(payLabel[o.payment] || o.payment)}</p>
      </div>`).join("");
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  await renderLayout();
  const page = document.body.dataset.page;
  if (pages[page]) {
    try { await pages[page](); } catch (e) { console.error(e); toast(e.message); }
  }
});
