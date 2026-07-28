from flask import Flask, render_template, request, redirect, url_for, session, flash
from functools import wraps
import os, json, urllib.parse
from datetime import datetime

# ================= CONFIG =================
WHATSAPP_NUMBER = "923064440488"

app = Flask(__name__)
app.secret_key = "super_secret_key_123"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PRODUCTS_FILE = os.path.join(BASE_DIR, "products.json")
ORDERS_FILE = os.path.join(BASE_DIR, "orders.json")

UPLOAD_FOLDER = os.path.join(BASE_DIR, "static/images")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ================= HELPERS =================
def load_products():
    if not os.path.exists(PRODUCTS_FILE):
        return []
    with open(PRODUCTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_products(data):
    with open(PRODUCTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

def load_orders():
    if not os.path.exists(ORDERS_FILE):
        return []
    with open(ORDERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_orders(data):
    with open(ORDERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

def generate_order_id(orders):
    return f"ORD-{str(len(orders)+1).zfill(4)}"

def login_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrap

# ================= PUBLIC PAGES =================
@app.route("/")
def home():
    return redirect(url_for("products_public"))

@app.route("/products")
def products_public():
    products = load_products()
    categories = sorted(list(set(p.get("category") for p in products if p.get("category"))))
    return render_template("products_public.html", products=products, categories=categories)

@app.route("/product/<code>")
def product_details(code):
    products = load_products()
    product = next((p for p in products if p["code"] == code), None)
    if not product:
        return "Product Not Found", 404
    return render_template("product_details.html", product=product)

# ================= NORMAL ORDER =================
@app.route("/order/<code>", methods=["GET","POST"])
def order_form(code):
    products = load_products()
    product = next((p for p in products if p["code"] == code), None)
    if not product:
        return "Product Not Found", 404

    if request.method == "POST":
        orders = load_orders()
        name = request.form["name"]
        phone = request.form["phone"]
        address = request.form["address"]

        orders.append({
            "order_id": generate_order_id(orders),
            "product_code": product["code"],
            "product_name": product["name"],
            "price": product["price"],
            "customer_name": name,
            "customer_phone": phone,
            "customer_address": address,
            "status": "Pending",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        })
        save_orders(orders)

        msg = f"""
Order Received:
ID: {orders[-1]['order_id']}
Product: {product['name']}
Price: {product['price']}

Name: {name}
Phone: {phone}
Address: {address}
"""
        url = f"https://wa.me/{WHATSAPP_NUMBER}?text={urllib.parse.quote(msg)}"
        return redirect(url)

    return render_template("order_form.html", product=product)

# ================= TIKTOK ORDER =================
@app.route("/tiktok")
def tiktok_page():
    products = load_products()
    return render_template("tiktok.html", products=products)

@app.route("/tiktok-order/<code>", methods=["POST"])
def tiktok_order(code):
    products = load_products()
    product = next((p for p in products if p["code"] == code), None)
    if not product:
        return "Product Not Found", 404

    orders = load_orders()
    name = request.form["name"]
    phone = request.form["phone"]
    address = request.form["address"]

    orders.append({
        "order_id": generate_order_id(orders),
        "product_code": product["code"],
        "product_name": product["name"],
        "price": product["price"],
        "customer_name": name,
        "customer_phone": phone,
        "customer_address": address,
        "status": "Pending",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
    })
    save_orders(orders)

    msg = f"""
TikTok Order:
ID: {orders[-1]['order_id']}
Product: {product['name']}
Price: {product['price']}

Name: {name}
Phone: {phone}
Address: {address}
"""
    url = f"https://wa.me/{WHATSAPP_NUMBER}?text={urllib.parse.quote(msg)}"
    return redirect(url)

# ================= ADMIN =================
@app.route("/admin")
@login_required
def admin():
    products = load_products()
    orders = load_orders()
    return render_template("admin.html", products=products, orders=orders)

@app.route("/add-product", methods=["GET", "POST"])
@login_required
def add_product():
    if request.method == "POST":
        name = request.form["name"]
        code = request.form["code"]
        price = request.form["price"]
        category = request.form["category"]
        image = request.files["image"]

        filename = ""
        if image:
            filename = image.filename
            path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            image.save(path)

        products = load_products()
        products.append({
            "name": name,
            "code": code,
            "price": price,
            "category": category,
            "image": filename
        })
        save_products(products)
        flash("Product added successfully!")
        return redirect(url_for("admin"))

    return render_template("add_product.html")

@app.route("/edit-product/<code>", methods=["GET","POST"])
@login_required
def edit_product(code):
    products = load_products()
    product = next((p for p in products if p["code"] == code), None)
    if not product:
        flash("Product Not Found")
        return redirect(url_for("admin"))

    if request.method == "POST":
        product["name"] = request.form["name"]
        product["price"] = request.form["price"]
        product["category"] = request.form["category"]

        image = request.files.get("image")
        if image and image.filename:
            filename = image.filename
            path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            image.save(path)
            product["image"] = filename

        save_products(products)
        flash("Product Updated Successfully!")
        return redirect(url_for("admin"))

    return render_template("edit_product.html", product=product)

@app.route("/delete-product/<code>")
@login_required
def delete_product(code):
    products = load_products()
    products = [p for p in products if p["code"] != code]
    save_products(products)
    flash("Product Deleted")
    return redirect(url_for("admin"))

@app.route("/confirm-order/<order_id>")
@login_required
def confirm_order(order_id):
    orders = load_orders()
    for o in orders:
        if o["order_id"] == order_id:
            o["status"] = "Confirmed"
            save_orders(orders)
            flash("Order Confirmed")
            break
    return redirect(url_for("admin"))

# ================= LOGIN =================
@app.route("/login", methods=["GET","POST"])
def login():
    if request.method == "POST":
        if request.form["username"] == "kmsiraj" and request.form["password"] == "1234":
            session["logged_in"] = True
            return redirect(url_for("admin"))
        flash("Invalid Login")
    return render_template("login.html")

@app.route("/logout")
@login_required
def logout():
    session.clear()
    return redirect(url_for("login"))

# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True)
