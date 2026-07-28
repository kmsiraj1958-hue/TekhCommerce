import os
import shutil
import json

# ----------------- Paths -----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_FILE = os.path.join(BASE_DIR, "products.json")

UPLOADS_DIR = os.path.join(BASE_DIR, "static", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ----------------- Load products -----------------
with open(PRODUCTS_FILE, "r", encoding="utf-8") as f:
    products = json.load(f)

# ----------------- Source folder -----------------
# Put all your images temporarily in a folder, e.g., "all_images/"
# Example: BASE_DIR/all_images/WhatsApp_Image_2026-01-02_at_6.23.54_PM_1.jpeg
SOURCE_DIR = os.path.join(BASE_DIR, "all_images")

if not os.path.exists(SOURCE_DIR):
    print("❌ Source folder 'all_images' not found. Please create it and put all your images there.")
    exit()

# ----------------- Copy images -----------------
for product in products:
    img_name = product.get("image")
    if not img_name:
        continue
    src_path = os.path.join(SOURCE_DIR, img_name)
    dst_path = os.path.join(UPLOADS_DIR, img_name)
    if os.path.exists(src_path):
        shutil.copy(src_path, dst_path)
        print(f"✅ Copied: {img_name}")
    else:
        print(f"⚠️ Image not found in source folder: {img_name}")

# ----------------- Done -----------------
print("\nAll images copied to 'static/uploads' successfully!")
