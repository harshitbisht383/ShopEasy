# ShopEasy: Simple E-Commerce Website

A college mini-project: a complete online store with a shopping cart, product details, user accounts, order processing and a database.

| Layer     | Technology                                   |
|-----------|----------------------------------------------|
| Frontend  | HTML5, CSS3, vanilla JavaScript (fetch API)  |
| Backend   | Python 3 + Flask (REST-style JSON API)       |
| Database  | SQLite (file `shop.db`, created automatically) |

## Features

- **Product catalogue** with search and category filter (10 sample products are seeded automatically)
- **Product details page** with description, stock status, quantity selector, related products
- **Shopping cart** (kept in browser `localStorage`; prices and stock are re-checked by the server)
- **User registration & login** with hashed passwords (Werkzeug) and server-side sessions
- **Checkout & order processing**: shipping details, payment choice (COD / UPI / Card, simulated), stock is reduced inside a database transaction
- **Order history** page for each logged-in user
- Input validation on both client and server, and HTML-escaping to prevent XSS

## Project structure

```
.
├── app.py              # Flask app: routes, API, DB schema + seed data
├── requirements.txt
├── shop.db             # created on first run
├── index.html          # home / product list
├── product.html
├── cart.html
├── checkout.html
├── login.html
├── orders.html
├── style.css
└── app.js              # cart, API calls, page logic
```

All project files are kept directly in this folder; Flask serves each page along
with the CSS and JavaScript without requiring extra subfolders.

## How to run

Open PowerShell in the project folder, then run:

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows PowerShell
python -m pip install -r requirements.txt
python app.py
```

In Command Prompt, activate the environment with `.venv\Scripts\activate.bat`.
On Linux/macOS, use `source .venv/bin/activate` instead.

Open **http://127.0.0.1:5000** in your browser.

## Database design

```
users (id PK, name, email UNIQUE, password_hash, created_at)
products (id PK, name, description, category, price_paise, stock, emoji, created_at)
orders (id PK, user_id FK→users, total_paise, status, ship_name, ship_phone, ship_addr, payment, created_at)
order_items (id PK, order_id FK→orders, product_id FK→products, name, price_paise, quantity)
```

- Prices are stored in **paise** (integers) to avoid floating-point errors.
- `order_items` copies the product name and price at purchase time, so old orders stay correct if a product changes later.
- Relationships: one user → many orders; one order → many order items; one product → many order items.

## API endpoints

| Method | URL                    | Purpose                              | Login needed |
|--------|------------------------|--------------------------------------|--------------|
| GET    | `/api/products`        | List/search products (`q`, `category`) | No         |
| GET    | `/api/products/<id>`   | Product details + related items      | No           |
| POST   | `/api/cart/validate`   | Re-price cart, clip to stock         | No           |
| POST   | `/api/register`        | Create account                       | No           |
| POST   | `/api/login`           | Log in                               | No           |
| POST   | `/api/logout`          | Log out                              | No           |
| GET    | `/api/me`              | Current user                         | No           |
| POST   | `/api/orders`          | Place an order                       | Yes          |
| GET    | `/api/orders`          | Your order history                   | Yes          |

## Order processing flow

1. User adds items to the cart (stored in the browser).
2. At checkout the cart is sent to `POST /api/orders` with shipping details.
3. The server opens a transaction, re-reads each product's **real price and stock**, rejects the order if stock is short, then inserts the order and its items and decrements stock. Everything commits together or rolls back.
4. The cart is cleared and the user lands on *My Orders*.

## Security notes

- Passwords are never stored in plain text (`generate_password_hash`).
- Client-sent prices are ignored; the server always uses prices from the database.
- All SQL uses parameterised queries (no SQL injection).
- Before deploying anywhere real, set a strong `SECRET_KEY` environment variable.

## Possible extensions

Admin panel to add/edit products, product images, order status updates, real payment gateway, email confirmation, reviews and ratings.
