"""ShopEasy - a small e-commerce site.

Backend: Python (Flask) + SQLite
Frontend: HTML, CSS, vanilla JavaScript (all project files in one folder)
"""
import os
import re
import sqlite3
from functools import wraps

from flask import Flask, g, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("SHOP_DB", os.path.join(BASE_DIR, "shop.db"))

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-in-production")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    emoji       TEXT NOT NULL DEFAULT '📦',
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    total_paise INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Processing',
    ship_name   TEXT NOT NULL,
    ship_phone  TEXT NOT NULL,
    ship_addr   TEXT NOT NULL,
    payment     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    product_id  INTEGER NOT NULL REFERENCES products(id),
    name        TEXT NOT NULL,
    price_paise INTEGER NOT NULL,
    quantity    INTEGER NOT NULL CHECK (quantity > 0)
);
"""

SEED_PRODUCTS = [
    ("Wireless Headphones", "Over-ear Bluetooth headphones with active noise cancellation and 30-hour battery life.", "Electronics", 299900, 25, "🎧"),
    ("Smart Watch", "Fitness tracking, heart-rate monitor, sleep tracking and 7-day battery.", "Electronics", 499900, 15, "⌚"),
    ("Mechanical Keyboard", "Hot-swappable switches, RGB backlight and a solid aluminium frame.", "Electronics", 349900, 20, "⌨️"),
    ("Running Shoes", "Lightweight breathable running shoes with responsive cushioning.", "Fashion", 189900, 40, "👟"),
    ("Backpack", "Water-resistant 25L backpack with laptop sleeve and USB charging port.", "Fashion", 129900, 30, "🎒"),
    ("Sunglasses", "UV400 polarised sunglasses with a durable lightweight frame.", "Fashion", 79900, 50, "🕶️"),
    ("Coffee Maker", "Programmable drip coffee maker with a 1.2L glass carafe.", "Home", 249900, 12, "☕"),
    ("Desk Lamp", "LED desk lamp with 5 brightness levels and touch controls.", "Home", 99900, 35, "💡"),
    ("Yoga Mat", "Non-slip 6mm eco-friendly yoga mat with carry strap.", "Sports", 69900, 45, "🧘"),
    ("Water Bottle", "Insulated stainless steel bottle, keeps drinks cold for 24 hours.", "Sports", 44900, 60, "🍶"),
]


# --------------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO products (name, description, category, price_paise, stock, emoji) VALUES (?,?,?,?,?,?)",
            SEED_PRODUCTS,
        )
    db.commit()
    db.close()


def row_to_product(r):
    return {
        "id": r["id"],
        "name": r["name"],
        "description": r["description"],
        "category": r["category"],
        "price_paise": r["price_paise"],
        "stock": r["stock"],
        "emoji": r["emoji"],
    }


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify(error="Please log in to continue."), 401
        return fn(*args, **kwargs)
    return wrapper


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------
def page(name):
    return send_from_directory(BASE_DIR, name)


@app.get("/style.css")
def stylesheet():
    return send_from_directory(BASE_DIR, "style.css")


@app.get("/app.js")
def javascript():
    return send_from_directory(BASE_DIR, "app.js")


@app.route("/")
def home():
    return page("index.html")


@app.route("/product/<int:_pid>")
def product_page(_pid):
    return page("product.html")


@app.route("/cart")
def cart_page():
    return page("cart.html")


@app.route("/checkout")
def checkout_page():
    return page("checkout.html")


@app.route("/login")
def login_page():
    return page("login.html")


@app.route("/orders")
def orders_page():
    return page("orders.html")


# --------------------------------------------------------------------------
# Auth API
# --------------------------------------------------------------------------
@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not name or len(name) > 80:
        return jsonify(error="Please enter your name."), 400
    if not EMAIL_RE.match(email):
        return jsonify(error="Please enter a valid email address."), 400
    if len(password) < 6:
        return jsonify(error="Password must be at least 6 characters."), 400
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?,?,?)",
            (name, email, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify(error="An account with this email already exists."), 409
    session.clear()
    session["user_id"] = cur.lastrowid
    return jsonify(user={"id": cur.lastrowid, "name": name, "email": email}), 201


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Incorrect email or password."), 401
    session.clear()
    session["user_id"] = user["id"]
    return jsonify(user={"id": user["id"], "name": user["name"], "email": user["email"]})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    uid = session.get("user_id")
    if not uid:
        return jsonify(user=None)
    u = get_db().execute("SELECT id, name, email FROM users WHERE id = ?", (uid,)).fetchone()
    if not u:
        session.clear()
        return jsonify(user=None)
    return jsonify(user=dict(u))


# --------------------------------------------------------------------------
# Products API
# --------------------------------------------------------------------------
@app.get("/api/products")
def list_products():
    q = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "").strip()
    sql, params = "SELECT * FROM products WHERE 1=1", []
    if q:
        sql += " AND (name LIKE ? OR description LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += " ORDER BY id"
    db = get_db()
    rows = db.execute(sql, params).fetchall()
    cats = [r[0] for r in db.execute("SELECT DISTINCT category FROM products ORDER BY category")]
    return jsonify(products=[row_to_product(r) for r in rows], categories=cats)


@app.get("/api/products/<int:pid>")
def get_product(pid):
    db = get_db()
    r = db.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if not r:
        return jsonify(error="Product not found."), 404
    related = db.execute(
        "SELECT * FROM products WHERE category = ? AND id != ? LIMIT 4", (r["category"], pid)
    ).fetchall()
    return jsonify(product=row_to_product(r), related=[row_to_product(x) for x in related])


# --------------------------------------------------------------------------
# Cart validation (cart itself lives in the browser's localStorage;
# the server is the source of truth for prices and stock)
# --------------------------------------------------------------------------
def parse_cart(raw):
    """Accepts {"<product_id>": qty} and returns [(id, qty)] with sane values."""
    items = []
    if not isinstance(raw, dict):
        return items
    for k, v in raw.items():
        try:
            pid, qty = int(k), int(v)
        except (TypeError, ValueError):
            continue
        if qty > 0:
            items.append((pid, min(qty, 99)))
    return items


@app.post("/api/cart/validate")
def cart_validate():
    data = request.get_json(silent=True) or {}
    items = parse_cart(data.get("cart"))
    db = get_db()
    out, total = [], 0
    for pid, qty in items:
        r = db.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        if not r or r["stock"] == 0:
            continue
        qty = min(qty, r["stock"])
        p = row_to_product(r)
        p["quantity"] = qty
        p["line_paise"] = qty * r["price_paise"]
        total += p["line_paise"]
        out.append(p)
    return jsonify(items=out, total_paise=total)


# --------------------------------------------------------------------------
# Orders API
# --------------------------------------------------------------------------
@app.post("/api/orders")
@login_required
def place_order():
    data = request.get_json(silent=True) or {}
    items = parse_cart(data.get("cart"))
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    addr = (data.get("address") or "").strip()
    payment = data.get("payment")

    if not items:
        return jsonify(error="Your cart is empty."), 400
    if not name or not addr:
        return jsonify(error="Please provide your name and shipping address."), 400
    if not re.fullmatch(r"[0-9+\-\s]{7,15}", phone):
        return jsonify(error="Please enter a valid phone number."), 400
    if payment not in ("cod", "upi", "card"):
        return jsonify(error="Please choose a payment method."), 400

    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")  # lock so stock checks/updates are atomic
        lines, total = [], 0
        for pid, qty in items:
            r = db.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
            if not r:
                db.rollback()
                return jsonify(error="A product in your cart no longer exists."), 400
            if r["stock"] < qty:
                db.rollback()
                return jsonify(error=f"Only {r['stock']} left of “{r['name']}”."), 409
            lines.append((r, qty))
            total += r["price_paise"] * qty

        cur = db.execute(
            "INSERT INTO orders (user_id, total_paise, status, ship_name, ship_phone, ship_addr, payment) "
            "VALUES (?,?,?,?,?,?,?)",
            (session["user_id"], total, "Processing", name, phone, addr, payment),
        )
        oid = cur.lastrowid
        for r, qty in lines:
            db.execute(
                "INSERT INTO order_items (order_id, product_id, name, price_paise, quantity) VALUES (?,?,?,?,?)",
                (oid, r["id"], r["name"], r["price_paise"], qty),
            )
            db.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (qty, r["id"]))
        db.commit()
    except sqlite3.Error:
        db.rollback()
        return jsonify(error="Could not place the order. Please try again."), 500
    return jsonify(order_id=oid, total_paise=total), 201


@app.get("/api/orders")
@login_required
def my_orders():
    db = get_db()
    orders = db.execute(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC", (session["user_id"],)
    ).fetchall()
    result = []
    for o in orders:
        items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (o["id"],)).fetchall()
        result.append({
            "id": o["id"],
            "total_paise": o["total_paise"],
            "status": o["status"],
            "payment": o["payment"],
            "ship_name": o["ship_name"],
            "ship_phone": o["ship_phone"],
            "ship_addr": o["ship_addr"],
            "created_at": o["created_at"],
            "items": [dict(i) for i in items],
        })
    return jsonify(orders=result)


init_db()

if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=int(os.environ.get("PORT", 5000)))
