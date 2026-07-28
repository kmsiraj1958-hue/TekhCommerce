import sqlite3
import os

# Path to your database
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")

# ================= SAMPLE PRODUCTS =================
# Replace or extend this list with all your existing products
products = [
    {
        "name": "Product 1",
        "code": "P001",
        "price": 500,
        "category": "Category A",
        "image": "product1.jpg"
    },
    {
        "name": "Product 2",
        "code": "P002",
        "price": 750,
        "category": "Category B",
        "image": "product2.jpg"
    }
    # Add more products here...
]

# ================= IMPORT TO DATABASE =================
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

for p in products:
    try:
        cur.execute('''
            INSERT INTO products (name, code, price, category, image)
            VALUES (?, ?, ?, ?, ?)
        ''', (p['name'], p['code'], p['price'], p['category'], p['image']))
        print(f"Added: {p['name']}")
    except sqlite3.IntegrityError:
        print(f"Skipped (duplicate code): {p['code']}")

conn.commit()
conn.close()
print("All products imported successfully!")
