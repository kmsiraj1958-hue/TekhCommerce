from flask import Flask, render_template, request, redirect, url_for, session, flash, send_file
from functools import wraps
import os, json, urllib.parse, hmac, hashlib, base64, re, uuid, csv, io
from datetime import datetime
from werkzeug.utils import secure_filename

import requests
import openpyxl  # XLSX import for M&P reports

# ================= CONFIG =================
WHATSAPP_NUMBER = "923284270904"  # wa.me number (no +)
WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_API_VERSION = "v23.0"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static"
)
app.secret_key = "super_secret_key_123"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PRODUCTS_FILE = os.path.join(BASE_DIR, "products.json")

# Orders file auto-detect
ORDERS_FILE_A = os.path.join(BASE_DIR, "orders.json")
ORDERS_FILE_B = os.path.join(BASE_DIR, "orders_json")  # if you have a file named orders_json

def get_orders_file():
    if os.path.exists(ORDERS_FILE_B):
        return ORDERS_FILE_B
    return ORDERS_FILE_A

AD_SPEND_FILE = os.path.join(BASE_DIR, "ad_spend.json")

REPORT_UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(REPORT_UPLOAD_FOLDER, exist_ok=True)

AUTO_REPORT_FOLDER = os.path.join(REPORT_UPLOAD_FOLDER, "auto_reports")
AUTO_ARCHIVE_FOLDER = os.path.join(REPORT_UPLOAD_FOLDER, "archive")
WEEKLY_REPORT_FILE = os.path.join(BASE_DIR, "weekly_reports.json")

os.makedirs(AUTO_REPORT_FOLDER, exist_ok=True)
os.makedirs(AUTO_ARCHIVE_FOLDER, exist_ok=True)

# Report storage json files
MNP_DAILY_IMPORT_LOG_FILE = os.path.join(BASE_DIR, "mnp_daily_reports.json")   # import logs only
MNP_PAYOUT_ROWS_FILE      = os.path.join(BASE_DIR, "mnp_payout_reports.json")  # payout rows

UPLOAD_FOLDER = os.path.join(BASE_DIR, "static", "images")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# Upload folder for XLSX report files
REPORT_UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(REPORT_UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

# Shopify webhook secrets (set in PythonAnywhere WSGI env)
SHOPIFY_SECRET_VOGUE = os.environ.get("SHOPIFY_SECRET_VOGUE", "")
SHOPIFY_SECRET_SNS   = os.environ.get("SHOPIFY_SECRET_SNS", "")

# M&P API base
MNP_BASE = "https://mnpcourier.com/mycodapi"

# ================= HELPERS =================
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def safe_number(value) -> float:
    try:
        if value is None:
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        v = str(value).strip().replace(",", "")
        return float(v) if v else 0.0
    except Exception:
        return 0.0

def load_json_file(path, default):
    try:
        if not os.path.exists(path):
            return default
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read().strip()
            if not raw:
                return default
            return json.loads(raw)
    except Exception:
        return default

def save_json_file(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def load_products():
    return load_json_file(PRODUCTS_FILE, [])

def save_products(data):
    save_json_file(PRODUCTS_FILE, data)

def load_orders():
    return load_json_file(get_orders_file(), [])

def save_orders(data):
    save_json_file(get_orders_file(), data)

def load_ad_spend():
    return load_json_file(AD_SPEND_FILE, {})

def save_ad_spend(data):
    save_json_file(AD_SPEND_FILE, data)

def load_daily_import_logs():
    return load_json_file(MNP_DAILY_IMPORT_LOG_FILE, [])

def save_daily_import_logs(data):
    save_json_file(MNP_DAILY_IMPORT_LOG_FILE, data)

def load_weekly_reports():
    return load_json_file(WEEKLY_REPORT_FILE, [])

def save_weekly_reports(data):
    save_json_file(WEEKLY_REPORT_FILE, data)

def generate_weekly_report():
    orders = load_orders()
    payouts = load_payout_rows()
    reports = load_weekly_reports()

    today = datetime.now().date()
    start_of_week = today.fromordinal(today.toordinal() - today.weekday())
    end_of_week = today

    week_start = start_of_week.strftime("%Y-%m-%d")
    week_end = end_of_week.strftime("%Y-%m-%d")

    total_orders = 0
    delivered_orders = 0
    returned_orders = 0
    shipped_orders = 0
    total_sale = 0.0
    total_cod = 0.0
    payout_received = 0.0

    for o in orders:
        created = parse_date_prefix(o.get("created_at", ""))
        if not created:
            continue
        if not (week_start <= created <= week_end):
            continue

        total_orders += 1
        status = (o.get("status") or "").strip().title()

        if status == "Delivered":
            delivered_orders += 1
            total_sale += safe_number(o.get("price"))
            total_cod += safe_number(o.get("mnp_cod_amount"))

        elif status == "Returned":
            returned_orders += 1

        elif status == "Shipped":
            shipped_orders += 1

    for p in payouts:
        paid_on = parse_date_prefix(str(p.get("Paid On") or ""))
        if paid_on and (week_start <= paid_on <= week_end):
            payout_received += safe_number(p.get("Net Payable"))

    report = {
        "week_start": week_start,
        "week_end": week_end,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_orders": total_orders,
        "delivered_orders": delivered_orders,
        "returned_orders": returned_orders,
        "shipped_orders": shipped_orders,
        "delivery_success_rate": round((delivered_orders / total_orders * 100), 2) if total_orders else 0,
        "return_rate": round((returned_orders / total_orders * 100), 2) if total_orders else 0,
        "total_sale": round(total_sale, 2),
        "total_cod": round(total_cod, 2),
        "payout_received": round(payout_received, 2),
        "balance_with_courier": round(total_cod - payout_received, 2)
    }

    reports = [r for r in reports if not (r.get("week_start") == week_start and r.get("week_end") == week_end)]
    reports.append(report)
    save_weekly_reports(reports)

    return report

def load_payout_rows():
    return load_json_file(MNP_PAYOUT_ROWS_FILE, [])

def save_payout_rows(data):
    save_json_file(MNP_PAYOUT_ROWS_FILE, data)

def generate_order_id(orders):
    max_num = 0
    for o in orders:
        oid = str(o.get("order_id", "")).replace("ORD-", "")
        try:
            n = int(oid)
            max_num = max(max_num, n)
        except:
            pass
    return f"ORD-{str(max_num + 1).zfill(4)}"

def login_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrap

def extract_code_from_title(title: str) -> str:
    """
    Extract code from patterns like (VCK - 006) or (SWW - 205)
    Returns: VCK-006 / SWW-205
    """
    if not title:
        return ""
    m = re.search(r"\(\s*([A-Za-z]{2,8})\s*-\s*(\d{2,6})\s*\)", title)
    if not m:
        return ""
    return f"{m.group(1).upper()}-{m.group(2)}"

def clean_consignment(no: str) -> str:
    if not no:
        return ""
    return re.sub(r"\D+", "", str(no).strip())

def parse_date_prefix(dt_str: str) -> str:
    # returns YYYY-MM-DD if possible
    s = (dt_str or "").strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    return ""

def to_yyyy_mm_dd(value) -> str:
    # Handles excel date, datetime, string
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    s = str(value).strip()
    # already yyyy-mm-dd
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    return s

INVENTORY_FILE = os.path.join(BASE_DIR, "inventory_movements.json")


def load_inventory():
    if not os.path.exists(INVENTORY_FILE):
        return []
    with open(INVENTORY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_inventory(data):
    with open(INVENTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

def add_stock_movement(code, qty, mtype, note="", store=""):
    movements = load_inventory()

    movements.append({
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "code": code,
        "qty": qty,
        "type": mtype,
        "store": store,
        "note": note
    })

    save_inventory(movements)

def add_inventory_movement(entry):
    data = load_inventory()
    data.append(entry)
    save_inventory(data)

def calculate_inventory():
    products = load_products()
    movements = load_inventory()

    summary = {}

    for p in products:
        code = p.get("code", "").strip()
        if not code:
            continue

        summary[code] = {
            "name": p.get("name", ""),
            "opening": int(p.get("opening_stock", 0) or 0),
            "stock_in": 0,
            "dispatch": 0,
            "return_in": 0,
            "damage": 0,
            "adjustment_plus": 0,
            "adjustment_minus": 0,
            "reorder_level": int(p.get("reorder_level", 0) or 0),
        }

    for m in movements:
        code = str(m.get("code", "")).strip()
        qty = int(m.get("qty", 0) or 0)
        mtype = str(m.get("type", "")).strip().lower()

        if code not in summary:
            continue

        if mtype in ("purchase", "manual_add", "stock_in"):
            summary[code]["stock_in"] += qty

        elif mtype in ("dispatch", "stock_out"):
            summary[code]["dispatch"] += qty

        elif mtype in ("return", "return_in"):
            summary[code]["return_in"] += qty

        elif mtype == "damage":
            summary[code]["damage"] += qty

        elif mtype == "adjustment":
            # positive adjustment for now
            summary[code]["adjustment_plus"] += qty

    for code in summary:
        s = summary[code]
        s["balance"] = (
            s["opening"]
            + s["stock_in"]
            + s["return_in"]
            + s["adjustment_plus"]
            - s["dispatch"]
            - s["damage"]
            - s["adjustment_minus"]
        )

    return summary

@app.route("/inventory")
def inventory_page():
    summary = calculate_inventory()
    return render_template("inventory.html", summary=summary)

@app.route("/inventory-entry", methods=["GET", "POST"])
@login_required
def inventory_entry():
    products = load_products()

    if request.method == "POST":
        code = (request.form.get("code") or "").strip()
        qty = int(request.form.get("qty") or 0)
        mtype = (request.form.get("type") or "").strip().lower()
        note = (request.form.get("note") or "").strip()

        allowed_types = ["purchase", "manual_add", "return_in", "damage", "adjustment"]

        if not code:
            flash("Please select product code.")
            return redirect(url_for("inventory_entry"))

        if qty <= 0:
            flash("Quantity must be greater than zero.")
            return redirect(url_for("inventory_entry"))

        if mtype not in allowed_types:
            flash("Invalid movement type.")
            return redirect(url_for("inventory_entry"))

        movements = load_inventory()
        movements.append({
            "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "code": code,
            "qty": qty,
            "type": mtype,
            "store": "",
            "note": note
        })
        save_inventory(movements)

        flash(f"Inventory entry added for {code}.")
        return redirect(url_for("inventory_page"))

    return render_template("inventory_entry.html", products=products)

def has_stock_reserved(order):
    return bool(order.get("stock_reserved", False))

def has_stock_restocked(order):
    return bool(order.get("stock_restocked", False))

def reserve_stock_for_order(order):
    """
    Reduce stock once when order becomes Confirmed.
    Uses inventory movements instead of directly changing product stock.
    """
    if has_stock_reserved(order):
        return False

    items = order.get("items") or []
    if items:
        for item in items:
            code = (item.get("sku") or "").strip()
            qty = int(item.get("qty") or 0)
            if code and qty > 0:
                add_stock_movement(
                    code=code,
                    qty=qty,
                    mtype="dispatch",
                    note=f"Order confirmed: {order.get('order_id')}",
                    store=(order.get("store") or "")
                )
    else:
        code = (order.get("product_code") or "").strip()
        qty = int(order.get("qty") or 0)
        if code and qty > 0:
            add_stock_movement(
                code=code,
                qty=qty,
                mtype="dispatch",
                note=f"Order confirmed: {order.get('order_id')}",
                store=(order.get("store") or "")
            )

    order["stock_reserved"] = True
    order["stock_reserved_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    return True


def restore_stock_for_order(order):
    """
    Add stock back once when confirmed/booked/shipped order becomes Returned
    or when a reserved order is deleted/cancelled.
    """
    if not has_stock_reserved(order):
        return False

    if has_stock_restocked(order):
        return False

    items = order.get("items") or []
    if items:
        for item in items:
            code = (item.get("sku") or "").strip()
            qty = int(item.get("qty") or 0)
            if code and qty > 0:
                add_stock_movement(
                    code=code,
                    qty=qty,
                    mtype="return_in",
                    note=f"Stock restored: {order.get('order_id')}",
                    store=(order.get("store") or "")
                )
    else:
        code = (order.get("product_code") or "").strip()
        qty = int(order.get("qty") or 0)
        if code and qty > 0:
            add_stock_movement(
                code=code,
                qty=qty,
                mtype="return_in",
                note=f"Stock restored: {order.get('order_id')}",
                store=(order.get("store") or "")
            )

    order["stock_restocked"] = True
    order["stock_restocked_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    return True

def clean_phone_for_whatsapp(phone: str) -> str:
    phone = re.sub(r"\D+", "", str(phone or "").strip())

    # Pakistan local format: 03XXXXXXXXX -> 923XXXXXXXXX
    if phone.startswith("03") and len(phone) == 11:
        phone = "92" + phone[1:]

    # already 92...
    if phone.startswith("92"):
        return phone

    return phone

def send_whatsapp_text_message(phone: str, message: str) -> bool:
    if not WHATSAPP_ACCESS_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        print("WhatsApp API config missing")
        return False

    to_number = clean_phone_for_whatsapp(phone)
    if not to_number:
        print("WhatsApp phone missing")
        return False

    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {
            "body": message
        }
    }

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=25)
        print("WhatsApp response:", r.status_code, r.text)
        return r.status_code in (200, 201)
    except Exception as e:
        print("WhatsApp send error:", str(e))
        return False

def build_order_status_message(order: dict, status: str) -> str:
    order_id = order.get("order_id", "")
    tracking = order.get("tracking_number", "") or "Not assigned"

    status = (status or "").strip().title()

    if status == "Confirmed":
        return f"Dear Customer, your order {order_id} has been confirmed. We will ship it soon."

    if status == "Shipped":
        return f"Dear Customer, your order {order_id} has been shipped. Tracking number: {tracking}."

    if status == "Delivered":
        return f"Dear Customer, your order {order_id} has been delivered. Thank you for shopping with us."

    if status == "Returned":
        return f"Dear Customer, your order {order_id} has been returned. Please contact us for details."

    return f"Dear Customer, your order {order_id} status is now {status}."

 # ================= AUTO IMPORT MNP REPORTS =================
def auto_import_mnp_reports():
    folder = AUTO_REPORT_FOLDER
    archive = AUTO_ARCHIVE_FOLDER

    os.makedirs(folder, exist_ok=True)
    os.makedirs(archive, exist_ok=True)

    imported_daily_updates = 0
    imported_payout_rows = 0
    moved_files = 0

    files = os.listdir(folder)

    for f in files:
        if not f.lower().endswith(".xlsx"):
            continue

        path = os.path.join(folder, f)
        name = f.lower()

        try:
            handled = False

            if "daily" in name:
               # imported_daily_updates += import_mnp_daily_auto(path)
                handled = True

            elif "payout" in name or "settlement" in name or "weekly" in name or "paymentinstrument" in name:
                imported_payout_rows += import_mnp_payout_auto(path)
                handled = True

            if handled:
                new_name = datetime.now().strftime("%Y%m%d_%H%M%S_") + f
                new_path = os.path.join(archive, new_name)
                os.rename(path, new_path)
                moved_files += 1

        except Exception as e:
            print("AUTO IMPORT ERROR:", f, str(e))

    try:
        generate_weekly_report()
    except Exception as e:
        print("WEEKLY REPORT ERROR:", str(e))

    return {
        "imported_daily_updates": imported_daily_updates,
        "imported_payout_rows": imported_payout_rows,
        "moved_files": moved_files
    }

def new_func(path):
   # imported_daily_updates += import_mnp_daily_auto(path)
   # return imported_daily_updates

def import_mnp_payout_auto(filepath):
    rows = read_xlsx_first_sheet(filepath)
    payouts = load_payout_rows()
    added = 0

    store = "SNS" if "sns" in filepath.lower() else "VOGUE"

    for r in rows:
        payouts.append({
            "store": store,
            "filename": os.path.basename(filepath),
            "Payment ID": str(r.get("Payment ID") or ""),
            "Paid On": str(r.get("Paid On") or r.get("Paid on.") or ""),
            "RR Amount": safe_number(r.get("RR Amount")),
            "Tax Amount": safe_number(r.get("Tax Amount")),
            "Net Payable": safe_number(r.get("Net Payable")),
            "Instrument Number": str(r.get("Instrument Number") or "")
        })
        added += 1

    save_payout_rows(payouts)
    return added

# ================= XLSX IMPORT HELPERS =================
def read_xlsx_first_sheet(filepath: str):
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    out = []
    for r in rows[1:]:
        if r is None:
            continue
        row = {}
        empty = True
        for i, h in enumerate(headers):
            if not h:
                continue
            val = r[i] if i < len(r) else None
            if val not in (None, ""):
                empty = False
            row[h] = val
        if not empty:
            out.append(row)
    return out

def mnp_status_to_order_status(mnp_status: str):
    s = (mnp_status or "").strip().lower()
    if "deliver" in s:
        return "Delivered"
    if "return" in s or "rts" in s or "undeliver" in s:
        return "Returned"
    return ""

# ================= SHOPIFY SIGNATURE VERIFY =================
def verify_shopify_webhook(secret: str, data: bytes, hmac_header: str) -> bool:
    if not secret or not hmac_header:
        return False
    digest = hmac.new(secret.encode("utf-8"), data, hashlib.sha256).digest()
    calculated = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(calculated, hmac_header)

def get_shopify_secret(store: str) -> str:
    store = store.lower().strip()
    return SHOPIFY_SECRET_VOGUE if store == "vogue" else SHOPIFY_SECRET_SNS

# ================= SHOPIFY → CREATE ORDER =================
def create_order_from_shopify(store: str, payload: dict):
    store = store.lower().strip()
    store_label = store.upper()

    orders = load_orders()

    shopify_order_id = payload.get("id")
    shopify_order_name = payload.get("name") or ""

    customer = payload.get("customer") or {}
    customer_name = (
        f"{(customer.get('first_name') or '').strip()} {(customer.get('last_name') or '').strip()}".strip()
        or payload.get("contact_email", "")
        or "Customer"
    )
    phone = payload.get("phone") or (customer.get("phone") if isinstance(customer, dict) else "") or ""

    ship = payload.get("shipping_address") or {}
    address_parts = [
        ship.get("address1") or "",
        ship.get("address2") or "",
        ship.get("city") or "",
        ship.get("province") or "",
        ship.get("zip") or "",
        ship.get("country") or "",
    ]
    customer_address = " ".join([str(p).strip() for p in address_parts if str(p).strip()])

    line_items = payload.get("line_items") or []
    items = []
    total_qty = 0

    for it in line_items:
        title = it.get("title") or ""
        variant = it.get("variant_title") or ""
        sku = it.get("sku") or ""
        if sku in ("None", None):
            sku = ""
        if not sku:
            sku = extract_code_from_title(title)

        qty = int(it.get("quantity") or 1)
        price = safe_number(it.get("price"))

        total_qty += qty
        display = f"{title} ({variant})" if variant else title

        items.append({
            "title": title,
            "variant": variant,
            "display": display,
            "sku": sku,
            "qty": qty,
            "price": price
        })

    total_price = safe_number(payload.get("total_price"))

    new_order = {
        "id": str(uuid.uuid4()),
        "order_id": generate_order_id(orders),
        "store": store_label,
        "source": "shopify",

        "shopify_order_id": str(shopify_order_id) if shopify_order_id else "",
        "shopify_order_name": shopify_order_name,

        "items": items,
        "product_name": items[0]["display"] if items else "Shopify Order",
        "product_code": items[0]["sku"] if items else "",
        "qty": total_qty if total_qty else 1,

        "price": f"{total_price:.2f}",
        "customer_name": customer_name,
        "customer_phone": phone,
        "customer_address": customer_address,

        "status": "Pending",
        "courier": "",
        "tracking_number": "",
        "stock_reserved": False,
        "stock_restocked": False,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
    }

    orders.append(new_order)
    save_orders(orders)

# ================= SHOPIFY → UPDATE TRACKING FROM FULFILLMENT =================
def update_order_from_shopify_fulfillment(store: str, payload: dict):
    store = store.lower().strip()
    orders = load_orders()

    fulfillment = payload.get("fulfillment") if isinstance(payload.get("fulfillment"), dict) else payload
    shopify_order_id = fulfillment.get("order_id") or payload.get("order_id")
    if shopify_order_id is None:
        return False
    shopify_order_id = str(shopify_order_id)

    tracking_numbers = fulfillment.get("tracking_numbers") or []
    tracking_company = fulfillment.get("tracking_company") or ""
    tracking_number = ""

    if isinstance(tracking_numbers, list) and tracking_numbers:
        tracking_number = str(tracking_numbers[0] or "")
    if not tracking_number and fulfillment.get("tracking_number"):
        tracking_number = str(fulfillment.get("tracking_number") or "")

    updated = False
    for o in orders:
        if str(o.get("store", "")).strip().lower() == store and str(o.get("shopify_order_id", "")) == shopify_order_id:
            if tracking_company:
                o["courier"] = tracking_company
            if tracking_number:
                o["tracking_number"] = tracking_number
                o["status"] = "Shipped"
                o["shipped_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            updated = True
            break

    if updated:
        save_orders(orders)

    return updated

# ================= M&P API (Delivered / Returned) =================
def mnp_credentials_for_store(store: str):
    store = (store or "").strip().lower()
    if store == "sns":
        return (os.environ.get("MNP_USER_SNS", ""), os.environ.get("MNP_PASS_SNS", ""))
    return (os.environ.get("MNP_USER_VOGUE", ""), os.environ.get("MNP_PASS_VOGUE", ""))

def fetch_mnp_final_status(store: str, tracking_number: str) -> dict:
    user, pwd = mnp_credentials_for_store(store)
    consignment = clean_consignment(tracking_number)
    if not (user and pwd and consignment):
        return {"isSuccess": "false", "message": "Missing credentials or tracking number"}

    url = f"{MNP_BASE}/api/Tracking/Consignment_Tracking_Status_Final"
    params = {"Username": user, "password": pwd, "consignment": consignment}
    r = requests.get(url, params=params, timeout=25)
    return r.json()

def is_delivered(status_text: str) -> bool:
    t = (status_text or "").strip().lower()
    return "deliver" in t

def is_returned(status_text: str) -> bool:
    t = (status_text or "").strip().lower()
    return ("return" in t) or ("rts" in t) or ("undeliver" in t)

def sync_orders_with_mnp():
    orders = load_orders()
    updated = 0

    for o in orders:
        store = (o.get("store") or "").strip().lower()
        if store not in ("sns", "vogue"):
            continue

        tracking = clean_consignment(o.get("tracking_number") or "")
        if not tracking:
            continue

        if o.get("status") in ("Delivered", "Returned"):
            continue

        resp = fetch_mnp_final_status(store, tracking)
        if str(resp.get("isSuccess", "")).lower() != "true":
            continue

        status = resp.get("Status") or ""
        dt = resp.get("DateTime") or datetime.now().strftime("%Y-%m-%d %H:%M")

        if is_delivered(status):
            o["status"] = "Delivered"
            o["delivered_at"] = dt
            updated += 1
        elif is_returned(status):
            o["status"] = "Returned"
            o["returned_at"] = dt
            updated += 1

        o["mnp_status"] = status

    if updated:
        save_orders(orders)

    return updated

# ================= PUBLIC ROUTES =================
@app.route("/")
def home():
    return redirect(url_for("products_public"))

@app.route("/products")
def products_public():
    try:
        products = load_products()
        categories = sorted(list({p.get("category") for p in products if p.get("category")}))
        return render_template("products_public.html", products=products, categories=categories)
    except Exception as e:
        return f"Error loading products page: {str(e)}"

@app.route("/product/<code>")
def product_details(code):
    products = load_products()
    product = next((p for p in products if p.get("code") == code), None)
    if not product:
        return "Product Not Found", 404
    return render_template("product_details.html", product=product)

# ================= CART SYSTEM =================
@app.route("/cart")
def view_cart():
    cart = session.get("cart", {})

    cart_items = []
    total_qty = 0
    total_price = 0

    for code, item in cart.items():
        qty = int(item.get("qty", 1))
        price = float(item.get("price", 0))

        line_total = qty * price

        cart_items.append({
            "code": code,
            "name": item.get("name"),
            "price": price,
            "qty": qty,
            "image": item.get("image"),
            "line_total": line_total
        })

        total_qty += qty
        total_price += line_total

    return render_template(
        "cart.html",
        cart_items=cart_items,
        total_qty=total_qty,
        total_price=total_price
    )

@app.route("/cart/add/<code>")
def add_to_cart(code):
    products = load_products()
    product = next((p for p in products if p.get("code") == code), None)

    if not product:
        return "Product not found", 404

    cart = session.get("cart", {})

    if code in cart:
        cart[code]["qty"] += 1
    else:
        cart[code] = {
            "name": product.get("name"),
            "price": product.get("price"),
            "image": product.get("image"),
            "qty": 1
        }

    session["cart"] = cart
    session.modified = True

    return redirect(url_for("view_cart"))


@app.route("/cart/remove/<code>")
def remove_from_cart(code):
    cart = session.get("cart", {})

    if code in cart:
        del cart[code]

    session["cart"] = cart
    session.modified = True

    return redirect(url_for("view_cart"))


@app.route("/cart/clear")
def clear_cart():
    session["cart"] = {}
    session.modified = True
    return redirect(url_for("view_cart"))

@app.route("/checkout", methods=["GET", "POST"])
def checkout():
    cart = session.get("cart", {})
    if not cart:
        flash("Your cart is empty.")
        return redirect(url_for("products_public"))

    if request.method == "POST":
        orders = load_orders()

        name = request.form.get("name", "").strip()
        phone = request.form.get("phone", "").strip()
        address = request.form.get("address", "").strip()

        if not name or not phone or not address:
            flash("Please fill all fields.")
            return redirect(url_for("checkout"))

        # Build items list for the order
        items = []
        total_price = 0
        total_qty = 0
        for code, item in cart.items():
            qty = int(item.get("qty", 1))
            price = float(item.get("price", 0))
            total_price += price * qty
            total_qty += qty
            items.append({
                "title": item.get("name"),
                "variant": "",
                "display": item.get("name"),
                "sku": code,
                "qty": qty,
                "price": price
            })

        # Create order
        new_order = {
            "id": str(uuid.uuid4()),
            "order_id": generate_order_id(orders),
            "store": "LOCAL",
            "source": "website",
            "items": items,
            "product_name": ", ".join([i["display"] for i in items]),
            "product_code": ", ".join([i["sku"] for i in items]),
            "qty": total_qty,
            "price": f"{total_price:.2f}",
            "customer_name": name,
            "customer_phone": phone,
            "customer_address": address,
            "status": "Pending",
            "courier": "",
            "tracking_number": "",
            "stock_reserved": False,
            "stock_restocked": False,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        }

        orders.append(new_order)
        save_orders(orders)

        # Clear cart
        session["cart"] = {}
        session.modified = True

        # Redirect to WhatsApp confirmation
        msg = f"""Order Received:
ID: {new_order['order_id']}
Products: {new_order['product_name']}
Qty: {new_order['qty']}
Price: {new_order['price']}

Customer: {name}
Phone: {phone}
Address: {address}

Reply YES to confirm.
"""
        wa_url = f"https://wa.me/{WHATSAPP_NUMBER}?text={urllib.parse.quote(msg)}"
        return redirect(wa_url)

    # GET request → show checkout page
    cart_items = []
    total_qty = 0
    total_price = 0
    for code, item in cart.items():
        qty = int(item.get("qty", 1))
        price = float(item.get("price", 0))
        line_total = qty * price
        cart_items.append({
            "code": code,
            "name": item.get("name"),
            "price": price,
            "qty": qty,
            "line_total": line_total
        })
        total_qty += qty
        total_price += line_total

    return render_template("checkout.html", cart_items=cart_items, total_qty=total_qty, total_price=total_price)

# ================= ORDER (WEBSITE) =================
@app.route("/order/<code>", methods=["GET", "POST"])
def order_form(code):
    products = load_products()
    product = next((p for p in products if p.get("code") == code), None)
    if not product:
        return "Product Not Found", 404

    if request.method == "POST":
        orders = load_orders()

        name = request.form.get("name", "").strip()
        phone = request.form.get("phone", "").strip()
        address = request.form.get("address", "").strip()

        if not name or not phone or not address:
            flash("Please fill all fields.")
            return redirect(url_for("order_form", code=code))

        new_order = {
            "id": str(uuid.uuid4()),
            "order_id": generate_order_id(orders),
            "store": "LOCAL",
            "source": "website",
            "product_code": product.get("code", ""),
            "product_name": product.get("name", ""),
            "price": str(product.get("price", "")),
            "qty": 1,
            "items": [{
                "title": product.get("name", ""),
                "variant": "",
                "display": product.get("name", ""),
                "sku": product.get("code", ""),
                "qty": 1,
                "price": safe_number(product.get("price"))
            }],
            "customer_name": name,
            "customer_phone": phone,
            "customer_address": address,
            "status": "Pending",
            "courier": "",
            "tracking_number": "",
            "stock_reserved": False,
            "stock_restocked": False,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
        }
        orders.append(new_order)
        save_orders(orders)

        msg = f"""Order Received:
ID: {new_order['order_id']}
Product: {new_order['product_name']}
Code: {new_order['product_code']}
Price: {new_order['price']}

Customer: {name}
Phone: {phone}
Address: {address}

Reply YES to confirm.
"""
        wa_url = f"https://wa.me/{WHATSAPP_NUMBER}?text={urllib.parse.quote(msg)}"
        return redirect(wa_url)

    return render_template("order_form.html", product=product)

# ================= TIKTOK =================
@app.route("/tiktok")
def tiktok_page():
    products = load_products()
    return render_template("tiktok.html", products=products)

@app.route("/tiktok-order", methods=["POST"])
def tiktok_order():
    code = request.form.get("code", "").strip()
    products = load_products()
    product = next((p for p in products if p.get("code") == code), None)
    if not product:
        return "Product Not Found", 404

    orders = load_orders()
    name = request.form.get("customer_name", "").strip()
    phone = request.form.get("phone", "").strip()
    address = request.form.get("address", "").strip()

    if not name or not phone or not address:
        flash("Please fill all fields.")
        return redirect(url_for("tiktok_page"))

    new_order = {
        "id": str(uuid.uuid4()),
        "order_id": generate_order_id(orders),
        "store": "LOCAL",
        "source": "tiktok",
        "product_code": product.get("code", ""),
        "product_name": product.get("name", ""),
        "price": str(product.get("price", "")),
        "qty": 1,
        "items": [{
            "title": product.get("name", ""),
            "variant": "",
            "display": product.get("name", ""),
            "sku": product.get("code", ""),
            "qty": 1,
            "price": safe_number(product.get("price"))
        }],
        "customer_name": name,
        "customer_phone": phone,
        "customer_address": address,
        "status": "Pending",
        "courier": "",
        "tracking_number": "",
        "stock_reserved": False,
        "stock_restocked": False,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    orders.append(new_order)
    save_orders(orders)

    msg = f"""TikTok Order:
ID: {new_order['order_id']}
Product: {new_order['product_name']}
Code: {new_order['product_code']}
Price: {new_order['price']}

Customer: {name}
Phone: {phone}
Address: {address}

Reply YES to confirm.
"""
    wa_url = f"https://wa.me/{WHATSAPP_NUMBER}?text={urllib.parse.quote(msg)}"
    return redirect(wa_url)

# ================= SHOPIFY WEBHOOKS =================
@app.route("/webhook/shopify/<store>/orders-create", methods=["POST"])
def webhook_shopify_orders_create(store):
    store = store.lower().strip()
    if store not in ("vogue", "sns"):
        return "Invalid store", 400

    secret = get_shopify_secret(store)
    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")
    raw = request.get_data()

    if not verify_shopify_webhook(secret, raw, hmac_header):
        return "Unauthorized", 401

    payload = request.get_json(silent=True) or {}
    create_order_from_shopify(store, payload)
    return "OK", 200

@app.route("/webhook/shopify/<store>/fulfillments-create", methods=["POST"])
@app.route("/webhook/shopify/<store>/fulfillments-update", methods=["POST"])
def webhook_shopify_fulfillments(store):
    store = store.lower().strip()
    if store not in ("vogue", "sns"):
        return "Invalid store", 400

    secret = get_shopify_secret(store)
    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256", "")
    raw = request.get_data()

    if not verify_shopify_webhook(secret, raw, hmac_header):
        return "Unauthorized", 401

    payload = request.get_json(silent=True) or {}
    update_order_from_shopify_fulfillment(store, payload)
    return "OK", 200

    # ================= STATUS UPDATE =================
@app.route("/set-status/<order_id>/<status>")
@app.route("/set_status/<order_id>/<status>")
@login_required
def set_status(order_id, status):
    status = (status or "").strip().title()
    allowed = {"Pending", "Confirmed", "Booked", "Shipped", "Delivered", "Returned"}

    if status not in allowed:
        flash("Invalid status")
        return redirect(url_for("admin"))

    orders = load_orders()
    found = False

    for o in orders:
        if str(o.get("order_id", "")).strip() == str(order_id).strip():
            old_status = (o.get("status") or "").strip().title()
            o["status"] = status
            o["status_updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")

            if status == "Confirmed" and not o.get("stock_reserved", False):
                reserve_stock_for_order(o)

            if status == "Returned" and o.get("stock_reserved", False) and not o.get("stock_restocked", False):
                restore_stock_for_order(o)

            found = True
            break
                # Auto WhatsApp for important statuses
        if status in {"Confirmed", "Shipped", "Delivered", "Returned"}:
                phone = o.get("customer_phone", "")
                message = build_order_status_message(o, status)
                send_whatsapp_text_message(phone, message)

    if found:
        save_orders(orders)
        flash(f"{order_id} updated to {status}")
    else:
        flash("Order not found")

    return redirect(url_for("admin"))

@app.route("/test-whatsapp")
@login_required
def test_whatsapp():
    phone = "923064440488"   # put your test number
    message = "Test message from your software."

    if not WHATSAPP_ACCESS_TOKEN:
        return "WhatsApp failed: ACCESS TOKEN missing"

    if not WHATSAPP_PHONE_NUMBER_ID:
        return "WhatsApp failed: PHONE NUMBER ID missing"

    to_number = clean_phone_for_whatsapp(phone)

    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {
            "body": message
        }
    }

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=25)
        return f"Status: {r.status_code}<br><pre>{r.text}</pre>"
    except Exception as e:
        return f"Exception: {str(e)}"

# ================= ADMIN AUTH =================
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        if username == "kmsiraj" and password == "1234":
            session["logged_in"] = True
            return redirect(url_for("admin"))
        flash("Invalid Login")
    return render_template("login.html")

    # ================= DELETE ORDER =================
@app.route("/delete-order/<order_id>")
@login_required
def delete_order(order_id):
    orders = load_orders()
    target = next((o for o in orders if o.get("order_id") == order_id), None)

    if not target:
        flash("Order not found.")
        return redirect(url_for("admin"))

    # If stock was already reserved and not yet restocked, restore it before delete
    restore_stock_for_order(target)

    new_orders = [o for o in orders if o.get("order_id") != order_id]
    save_orders(new_orders)

    flash(f"Order {order_id} deleted successfully.")
    return redirect(url_for("admin"))

    # ================= TRACK ORDER (Public) =================
@app.route("/track", methods=["GET"])
def track_home():
    return render_template("track_order.html", order=None, error=None)

@app.route("/track/search", methods=["POST"])
def track_search():
    oid = (request.form.get("order_id") or "").strip()
    if not oid:
        return render_template("track_order.html", order=None, error="Please enter Order ID")
    return redirect(url_for("track_order", order_id=oid))

@app.route("/track/<order_id>", methods=["GET"])
def track_order(order_id):
    orders = load_orders()
    order = next((o for o in orders if str(o.get("order_id")) == str(order_id)), None)

    if not order:
        return render_template("track_order.html", order=None, error="Order not found")

    return render_template("track_order.html", order=order, error=None)

@app.route("/logout")
@login_required
def logout():
    session.clear()
    return redirect(url_for("login"))

# ================= ADMIN DASHBOARD =================
@app.route("/admin")
@login_required
def admin():
    products = load_products() or []
    orders = load_orders() or []
    inventory_summary = calculate_inventory()
    delivered_orders = [o for o in orders if o.get("status") == "Delivered"]
    total_sale = sum(
    sum(float(item.get("price", 0) or 0) * float(item.get("qty", 1) or 1) for item in o.get("items", []))
    for o in orders
    if o.get("status") == "Delivered"
)

    # ---- Dashboard stats ----
    total_products = len(products)
    total_orders = len(orders)
    pending_orders = len([o for o in orders if (o.get("status") or "") == "Pending"])
    booked_orders = len([o for o in orders if (o.get("status") or "") == "Booked"])
    shipped_orders = len([o for o in orders if (o.get("status") or "") == "Shipped"])
    delivered_orders = len([o for o in orders if (o.get("status") or "") == "Delivered"])
    returned_orders = len([o for o in orders if (o.get("status") or "") == "Returned"])

    total_sale = sum(
        safe_number(o.get("price"))
        for o in orders
        if (o.get("status") or "") == "Delivered"
    )

    # ---- Products ----
    page = int(request.args.get("page", 1))
    per_page = 10
    total_pages = (len(products) + per_page - 1) // per_page
    start = (page - 1) * per_page
    end = start + per_page
    products_paginated = products[start:end]

    search_query = (request.args.get("search") or "").lower()
    if search_query:
        products_paginated = [
            p for p in products_paginated
            if search_query in (p.get("name") or "").lower() or search_query in (p.get("code") or "").lower()
        ]

    # attach live inventory balance to products
    for p in products_paginated:
        code = (p.get("code") or "").strip()
        inv = inventory_summary.get(code, {})
        p["live_stock"] = inv.get("balance", int(p.get("opening_stock", 0) or 0))

    # ---- Orders ----
    status_filter = (request.args.get("status") or "").lower()
    store_filter = (request.args.get("store") or "").upper()

    filtered_orders = orders
    if search_query:
        filtered_orders = [o for o in filtered_orders if search_query in str(o).lower()]
    if status_filter:
        filtered_orders = [o for o in filtered_orders if (o.get("status") or "").lower() == status_filter]
    if store_filter:
        filtered_orders = [o for o in filtered_orders if (o.get("store") or "").upper() == store_filter]

    # ---- Reports summary ----
    total_sale_report = sum(safe_number(o.get("price")) for o in orders if (o.get("status") or "") == "Delivered")
    total_orders_report = len(orders)
    pending_orders_report = pending_orders

    return render_template(
        "admin.html",
        # Dashboard
        total_products=total_products,
        total_orders=total_orders,
        pending_orders=pending_orders,
        booked_orders=booked_orders,
        shipped_orders=shipped_orders,
        delivered_orders=delivered_orders,
        returned_orders=returned_orders,
        total_sale=total_sale,
        # Products
        products=products_paginated,
        page=page,
        total_pages=total_pages,
        search_query=search_query,
        # Orders
        orders=filtered_orders,
        status_filter=status_filter,
        store_filter=store_filter,
        # Reports
        total_sale_report=total_sale_report,
        total_orders_report=total_orders_report,
        pending_orders_report=pending_orders_report,
    )



# ================= CLEANUP PAYOUT DUPLICATES =================
@app.route("/cleanup-payouts")
@login_required
def cleanup_payouts():
    payouts = load_payout_rows()
    cleaned = []
    seen = set()
    removed = 0

    for p in payouts:
        store = str(p.get("store", "")).upper().strip()
        paid_on = str(p.get("Paid On", "")).strip()
        payment_id = str(p.get("Payment ID", "")).strip()
        instrument_no = str(p.get("Instrument Number", "")).strip()

        rr = safe_number(p.get("RR Amount"))
        tax = safe_number(p.get("Tax Amount"))
        net = safe_number(p.get("Net Payable"))

        # remove junk/empty rows
        if (not payment_id and not paid_on) and rr == 0 and tax == 0 and net == 0:
            removed += 1
            continue

        # remove duplicates
        key = (store, paid_on, payment_id, instrument_no)
        if key in seen:
            removed += 1
            continue

        seen.add(key)
        cleaned.append(p)

    save_payout_rows(cleaned)
    flash(f"Payout cleanup done. Removed {removed} duplicate/junk rows.")
    return redirect(url_for("payout_report"))


# ================= VIEW IMPORTS (Daily) =================
@app.route("/imports")
@login_required
def view_imports():
    logs = load_daily_import_logs()
    logs = list(reversed(logs))  # newest first
    return render_template("imports.html", logs=logs)


# ================= DELETE IMPORT (Daily) =================
@app.route("/delete-import/<import_id>")
@login_required
def delete_import(import_id):
    logs = load_daily_import_logs()
    keep = []
    deleted = None

    for x in logs:
        if str(x.get("id")) == str(import_id) and x.get("type") == "daily":
            deleted = x
        else:
            keep.append(x)

    if not deleted:
        flash("Import not found.")
        return redirect(url_for("view_imports"))

    # delete saved file if exists
    saved_name = deleted.get("saved_name") or ""
    if saved_name:
        fpath = os.path.join(REPORT_UPLOAD_FOLDER, saved_name)
        try:
            if os.path.exists(fpath):
                os.remove(fpath)
        except Exception:
            pass

    save_daily_import_logs(keep)
    flash(f"Deleted import: {deleted.get('filename')} ({deleted.get('store')})")

@app.route("/run-auto-import")
@login_required
def run_auto_import():
    try:
        result = auto_import_mnp_reports()
        flash(
            f"Auto import completed. "
            f"Daily updates: {result.get('imported_daily_updates', 0)}, "
            f"Payout rows: {result.get('imported_payout_rows', 0)}, "
            f"Files moved: {result.get('moved_files', 0)}"
        )
    except Exception as e:
        flash(f"Auto import error: {str(e)}")
        print("RUN AUTO IMPORT ERROR:", str(e))
    return redirect(url_for("admin"))


# ================= REBUILD MNP DATA FROM UPLOADS =================
@app.route("/rebuild-mnp")
@login_required
def rebuild_mnp():
    # 1) Clear MNP fields from orders
    orders = load_orders()
    for o in orders:
        for k in ["mnp_status", "mnp_cod_amount", "mnp_delivery_date", "mnp_payment_id", "mnp_attempts"]:
            o.pop(k, None)

    # 2) Re-apply by reading every uploaded daily xlsx still present
    logs = load_daily_import_logs()
    logs_sorted = sorted(
        [x for x in logs if x.get("type") == "daily"],
        key=lambda a: a.get("imported_at", "")
    )

    updated = 0

    def pick(row, keys):
        for k in keys:
            if k in row and row.get(k) not in (None, ""):
                return row.get(k)
        return None

    consignment_keys   = ["Consignment Number", "Consignment (Tracking No)", "Consignment", "Consignment (Tracking No.)"]
    status_keys        = ["Status"]
    cod_keys           = ["COD Amount", "COD"]
    delivery_date_keys = ["Delivery Date", "Delivery date", "Delivery Date "]
    payment_id_keys    = ["Payment Id", "Payment ID", "Payment Id "]
    attempts_keys      = ["Attempts"]

    for log in logs_sorted:
        store = (log.get("store") or "").upper()
        saved_name = log.get("saved_name") or ""
        if not saved_name:
            continue

        path = os.path.join(REPORT_UPLOAD_FOLDER, saved_name)
        if not os.path.exists(path):
            continue

        rows = read_xlsx_first_sheet(path)

        for r in rows:
            consignment = clean_consignment(str(pick(r, consignment_keys) or ""))
            if not consignment:
                continue

            mnp_status = str(pick(r, status_keys) or "").strip()
            mapped = mnp_status_to_order_status(mnp_status)

            cod_amount = safe_number(pick(r, cod_keys))
            delivery_date = pick(r, delivery_date_keys)
            payment_id = pick(r, payment_id_keys)
            attempts = pick(r, attempts_keys)

            for o in orders:
                tracking = clean_consignment(o.get("tracking_number") or "")
                if (o.get("store") or "").upper() == store and tracking == consignment:

                    if mapped:
                        o["mnp_status"] = mnp_status
                        o["status"] = mapped

                    if cod_amount:
                        o["mnp_cod_amount"] = cod_amount

                    if delivery_date:
                        o["mnp_delivery_date"] = to_yyyy_mm_dd(delivery_date)

                    if payment_id:
                        o["mnp_payment_id"] = str(payment_id)

                    if attempts:
                        o["mnp_attempts"] = attempts

                    updated += 1

    save_orders(orders)
    flash(f"MNP rebuild complete. Updated {updated} orders.")
    return redirect(url_for("admin"))


# ================= M&P API SYNC ROUTE =================
@app.route("/sync-mnp")
@login_required
def sync_mnp_now():
    count = sync_orders_with_mnp()
    flash(f"M&P API Sync Done. Updated {count} orders.")
    return redirect(url_for("admin"))


# ================= IMPORT M&P DAILY XLSX =================
@app.route("/import-mnp-daily", methods=["POST"])
@login_required
def import_mnp_daily():
    store = (request.form.get("store") or "").strip().upper()
    if store not in ("VOGUE", "SNS"):
        flash("Select store VOGUE or SNS")
        return redirect(url_for("admin"))

    file = request.files.get("file")
    if not file or not file.filename:
        flash("Please choose M&P Daily XLSX file")
        return redirect(url_for("admin"))

    filename = secure_filename(file.filename)
    import_id = str(uuid.uuid4())

    logs = load_daily_import_logs()
    if any((x.get("store") == store and x.get("filename") == filename) for x in logs):
        flash(f"Already imported this file for {store}: {filename}")
        return redirect(url_for("admin"))

    saved_name = f"{store}_DAILY_{import_id}_{filename}"
    path = os.path.join(REPORT_UPLOAD_FOLDER, saved_name)
    file.save(path)

    rows = read_xlsx_first_sheet(path)

    logs.append({
        "id": import_id,
        "type": "daily",
        "store": store,
        "filename": filename,
        "saved_name": saved_name,
        "imported_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "rows_count": len(rows),
    })
    save_daily_import_logs(logs)

    orders = load_orders()
    updated = 0

    def pick(row, keys):
        for k in keys:
            if k in row and row.get(k) not in (None, ""):
                return row.get(k)
        return None

    consignment_keys = ["Consignment Number", "Consignment (Tracking No)", "Consignment", "Consignment (Tracking No.)"]
    status_keys = ["Status"]
    cod_keys = ["COD Amount", "COD"]
    delivery_date_keys = ["Delivery Date", "Delivery date", "Delivery Date "]
    payment_id_keys = ["Payment Id", "Payment ID", "Payment Id "]
    attempts_keys = ["Attempts"]
    consignee_keys = ["Consignee"]
    phone_keys = ["Consignee Phone No", "Consignee Phone. No.", "Consignee Phone No.", "Consignee Phone"]

    for r in rows:
        consignment = clean_consignment(str(pick(r, consignment_keys) or ""))
        if not consignment:
            continue

        mnp_status = str(pick(r, status_keys) or "").strip()
        mapped = mnp_status_to_order_status(mnp_status)

        cod_amount = safe_number(pick(r, cod_keys))
        delivery_date = pick(r, delivery_date_keys)
        payment_id = pick(r, payment_id_keys)
        attempts = pick(r, attempts_keys)
        consignee = pick(r, consignee_keys)
        consignee_phone = pick(r, phone_keys)

        for o in orders:
            if (o.get("store") or "").upper() != store:
                continue
            if clean_consignment(o.get("tracking_number") or "") != consignment:
                continue

            o["mnp_status"] = mnp_status
            o["mnp_cod_amount"] = cod_amount
            o["mnp_delivery_date"] = str(delivery_date) if delivery_date else ""
            o["mnp_payment_id"] = str(payment_id) if payment_id else ""
            o["mnp_attempts"] = str(attempts) if attempts is not None else ""

            if consignee and not (o.get("customer_name") or "").strip():
                o["customer_name"] = str(consignee)
            if consignee_phone and not (o.get("customer_phone") or "").strip():
                o["customer_phone"] = str(consignee_phone)

            if mapped in ("Delivered", "Returned"):
                if o.get("status") != mapped:
                    o["status"] = mapped
                    stamp = str(delivery_date) if delivery_date else datetime.now().strftime("%Y-%m-%d %H:%M")
                    if mapped == "Delivered":
                        o["delivered_at"] = stamp
                    else:
                        o["returned_at"] = stamp

            updated += 1
            break

    save_orders(orders)
    flash(f"M&P Daily Imported ({store}). Updated {updated} orders.")
    return redirect(url_for("admin"))

# ================= IMPORT M&P PAYOUT XLSX =================
@app.route("/import-mnp-payout", methods=["POST"])
@login_required
def import_mnp_payout():
    store = (request.form.get("store") or "").strip().upper()
    if store not in ("VOGUE", "SNS"):
        flash("Select store VOGUE or SNS")
        return redirect(url_for("admin"))

    file = request.files.get("file")
    if not file or not file.filename:
        flash("Please choose M&P Payout XLSX file")
        return redirect(url_for("admin"))

    filename = secure_filename(file.filename)
    import_id = str(uuid.uuid4())

    saved_name = f"{store}_PAYOUT_{import_id}_{filename}"
    path = os.path.join(REPORT_UPLOAD_FOLDER, saved_name)
    file.save(path)

    rows = read_xlsx_first_sheet(path)
    payouts = load_payout_rows()

    for r in rows:
        payouts.append({
            "import_id": import_id,
            "store": store,
            "filename": filename,
            "imported_at": datetime.now().strftime("%Y-%m-%d %H:%M"),

            "Payment ID": str(r.get("Payment ID") or ""),
            "Paid On": str(r.get("Paid On") or r.get("Paid on.") or ""),
            "RR Amount": safe_number(r.get("RR Amount")),
            "Invoice Amount": safe_number(r.get("Invoice Amount") or r.get("Ivoice Amount")),
            "IBFT Fee": safe_number(r.get("IBFT Fee")),
            "Tax Amount": safe_number(r.get("Tax Amount")),
            "Net Payable": safe_number(r.get("Net Payable")),
            "Instrument Mode": str(r.get("Instrument Mode") or ""),
            "Instrument Number": str(r.get("Instrument Number") or ""),
        })

    save_payout_rows(payouts)
    flash(f"M&P Payout Imported ({store}). Rows: {len(rows)}")
    return redirect(url_for("admin"))


# ================= PAYOUT REPORT =================
@app.route("/payout-report")
@login_required
def payout_report():
    payouts = list(reversed(load_payout_rows()))
    return render_template("payout_report.html", payouts=payouts)


# ================= MASTER REPORT =================
@app.route("/master-report")
@login_required
def master_report():
    orders = load_orders()
    products = load_products()

    cost_map = {}
    for p in products:
        code = (p.get("code") or "").strip()
        if code:
            cost_map[code] = safe_number(p.get("cost"))

    start_date = (request.args.get("start") or "2026-02-01").strip()
    end_date   = (request.args.get("end") or datetime.now().strftime("%Y-%m-%d")).strip()
    store_f    = (request.args.get("store") or "").strip().upper()
    status_f   = (request.args.get("status") or "").strip().title()

    def in_range(created_at: str):
        d = parse_date_prefix(created_at)
        if not d:
            return False
        return (d >= start_date) and (d <= end_date)

    rows = []
    s_no = 0
    total_sale = 0.0
    total_cost = 0.0
    delivered_count = 0
    returned_count = 0

    for o in orders:
        created_at = str(o.get("created_at") or "")
        if not in_range(created_at):
            continue

        store = (o.get("store") or "LOCAL").upper()
        status = (o.get("status") or "").strip().title()

        if store_f and store != store_f:
            continue
        if status_f and status != status_f:
            continue

        s_no += 1
        tracking = clean_consignment(o.get("tracking_number") or "")
        qty = int(o.get("qty") or 1)
        code = (o.get("product_code") or "").strip()
        sale = safe_number(o.get("price"))
        cost = cost_map.get(code, 0.0) * qty

        if status == "Delivered":
            total_sale += sale
            total_cost += cost
            delivered_count += 1
        elif status == "Returned":
            total_cost += cost
            returned_count += 1

        rows.append({
            "sno": s_no,
            "date": parse_date_prefix(created_at),
            "store": store,
            "order_id": o.get("order_id", ""),
            "consignment": tracking,
            "customer": o.get("customer_name", ""),
            "phone": o.get("customer_phone", ""),
            "product": o.get("product_name", ""),
            "code": code,
            "qty": qty,
            "status": status,
            "delivered": "Yes" if status == "Delivered" else "",
            "returned": "Yes" if status == "Returned" else "",
            "sale": sale if status == "Delivered" else 0.0,
            "cost": cost,
            "mnp_status": o.get("mnp_status", ""),
            "mnp_delivery_date": o.get("mnp_delivery_date", ""),
            "mnp_cod_amount": safe_number(o.get("mnp_cod_amount")),
            "mnp_payment_id": o.get("mnp_payment_id", ""),
        })

    summary = {
        "start": start_date,
        "end": end_date,
        "store": store_f,
        "status": status_f,
        "count": len(rows),
        "delivered_count": delivered_count,
        "returned_count": returned_count,
        "total_sale": round(total_sale, 2),
        "total_cost": round(total_cost, 2),
    }

    return render_template("master_report.html", rows=rows, summary=summary)


# Optional CSV export
@app.route("/master-report.csv")
@login_required
def master_report_csv():
    orders = load_orders()
    products = load_products()

    cost_map = {}
    for p in products:
        code = (p.get("code") or "").strip()
        if code:
            cost_map[code] = safe_number(p.get("cost"))

    start_date = (request.args.get("start") or "2026-02-01").strip()
    end_date   = (request.args.get("end") or datetime.now().strftime("%Y-%m-%d")).strip()
    store_f    = (request.args.get("store") or "").strip().upper()
    status_f   = (request.args.get("status") or "").strip().title()

    def in_range(created_at: str):
        d = parse_date_prefix(created_at)
        if not d:
            return False
        return (d >= start_date) and (d <= end_date)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "S.No", "Date", "Store", "Order ID", "Consignment", "Customer", "Phone",
        "Product", "Code", "Qty", "Status", "Delivered", "Returned", "Total Sale", "Total Cost",
        "MNP Status", "MNP Delivery Date", "COD Amount", "Payment ID"
    ])

    s_no = 0
    for o in orders:
        created_at = str(o.get("created_at") or "")
        if not in_range(created_at):
            continue

        store = (o.get("store") or "LOCAL").upper()
        status = (o.get("status") or "").strip().title()

        if store_f and store != store_f:
            continue
        if status_f and status != status_f:
            continue

        s_no += 1
        tracking = clean_consignment(o.get("tracking_number") or "")
        qty = int(o.get("qty") or 1)
        code = (o.get("product_code") or "").strip()
        sale = safe_number(o.get("price")) if status == "Delivered" else 0.0
        cost = cost_map.get(code, 0.0) * qty

        writer.writerow([
            s_no,
            parse_date_prefix(created_at),
            store,
            o.get("order_id", ""),
            tracking,
            o.get("customer_name", ""),
            o.get("customer_phone", ""),
            o.get("product_name", ""),
            code,
            qty,
            status,
            "Yes" if status == "Delivered" else "",
            "Yes" if status == "Returned" else "",
            sale,
            cost,
            o.get("mnp_status", ""),
            o.get("mnp_delivery_date", ""),
            safe_number(o.get("mnp_cod_amount")),
            o.get("mnp_payment_id", ""),
        ])

    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode("utf-8")),
        mimetype="text/csv",
        as_attachment=True,
        download_name="master_report.csv",
    )

@app.route("/weekly-report")
@login_required
def weekly_report():
    reports = list(reversed(load_weekly_reports()))
    return render_template("weekly_report.html", reports=reports)

# ================= CART =================

@app.route("/cart")
def cart():
    cart_items = session.get("cart", [])

    total_qty = sum(item["qty"] for item in cart_items)
    total_price = sum(item["price"] * item["qty"] for item in cart_items)

    for item in cart_items:
        item["line_total"] = item["price"] * item["qty"]

    return render_template(
        "cart.html",
        cart_items=cart_items,
        total_qty=total_qty,
        total_price=total_price
    )


@app.route("/cart/update", methods=["POST"])
def update_cart():
    cart = session.get("cart", {})

    for key in request.form:
        if key.startswith("qty_"):
            code = key.replace("qty_", "")
            qty = int(request.form.get(key, 1))

            if code in cart:
                cart[code]["qty"] = max(1, qty)

    session["cart"] = cart
    session.modified = True

    return redirect(url_for("view_cart"))
def cart_remove(code):
    cart_items = session.get("cart", [])
    cart_items = [i for i in cart_items if i["code"] != code]

    session["cart"] = cart_items
    return redirect(url_for("cart"))

# ================= FINANCIAL REPORT =================
@app.route("/financial-report", methods=["GET", "POST"])
@login_required
def financial_report():
    orders = load_orders()
    products = load_products()
    ad_spend_data = load_ad_spend()

    selected_date = request.form.get("date") or datetime.now().strftime("%Y-%m-%d")

    if request.method == "POST":
        ad_spend = safe_number(request.form.get("ad_spend"))
        ad_spend_data[selected_date] = ad_spend
        save_ad_spend(ad_spend_data)

    cost_map = {}
    for p in products:
        code = (p.get("code") or "").strip()
        if code:
            cost_map[code] = safe_number(p.get("cost"))

    total_orders = 0
    delivered_orders = 0
    returned_orders = 0

    revenue = 0.0
    product_cost_total = 0.0
    courier_cost_total = 0.0

    COURIER_AVG = 200.0

    for o in orders:
        created = str(o.get("created_at", ""))
        if not created.startswith(selected_date):
            continue

        total_orders += 1
        status = (o.get("status") or "").strip()

        price = safe_number(o.get("price"))
        qty = int(o.get("qty") or 1)
        code = (o.get("product_code") or "").strip()

        if status == "Delivered":
            delivered_orders += 1
            revenue += price
            product_cost_total += (cost_map.get(code, 0.0) * qty)
            courier_cost_total += COURIER_AVG

        elif status == "Returned":
            returned_orders += 1
            courier_cost_total += COURIER_AVG

    ad_spend = safe_number(ad_spend_data.get(selected_date, 0))
    net_profit = revenue - product_cost_total - courier_cost_total - ad_spend
    return_rate = (returned_orders / total_orders * 100) if total_orders > 0 else 0

    return render_template(
        "financial_report.html",
        selected_date=selected_date,
        total_orders=total_orders,
        delivered_orders=delivered_orders,
        returned_orders=returned_orders,
        return_rate=round(return_rate, 2),
        revenue=round(revenue, 2),
        product_cost_total=round(product_cost_total, 2),
        courier_cost_total=round(courier_cost_total, 2),
        ad_spend=round(ad_spend, 2),
        net_profit=round(net_profit, 2),
        orders_file_used=os.path.basename(get_orders_file()),
    )

# ================= COURIER BALANCE =================
@app.route("/courier-balance")
@login_required
def courier_balance():
    payouts = load_payout_rows()

    store_filter = (request.args.get("store") or "").strip().upper()
    from_date = (request.args.get("from_date") or "").strip()
    to_date = (request.args.get("to_date") or "").strip()

    filtered = []

    total_cod = 0.0
    courier_charges = 0.0
    return_charges = 0.0
    withholding_tax = 0.0
    bank_paid = 0.0

    for p in payouts:
        store = (p.get("store") or "").strip().upper()
        paid_on = parse_date_prefix(str(p.get("Paid On") or ""))

        if store_filter and store != store_filter:
            continue

        if from_date and paid_on and paid_on < from_date:
            continue
        if to_date and paid_on and paid_on > to_date:
            continue

        cod_amount = safe_number(p.get("RR Amount"))
        charges = safe_number(p.get("Invoice Amount"))
        tax = safe_number(p.get("Tax Amount"))
        paid = safe_number(p.get("Net Payable"))

        ret_charge = safe_number(p.get("Return Charges", 0))

        expected_net = cod_amount - charges - ret_charge - tax
        difference = expected_net - paid

        row = {
            "store": store,
            "paid_on": p.get("Paid On", ""),
            "payment_id": p.get("Payment ID", ""),
            "cod_amount": round(cod_amount, 2),
            "courier_charges": round(charges, 2),
            "return_charges": round(ret_charge, 2),
            "withholding_tax": round(tax, 2),
            "expected_net": round(expected_net, 2),
            "bank_paid": round(paid, 2),
            "difference": round(difference, 2),
            "instrument_number": p.get("Instrument Number", "")
        }

        filtered.append(row)

        total_cod += cod_amount
        courier_charges += charges
        return_charges += ret_charge
        withholding_tax += tax
        bank_paid += paid

    expected_total = total_cod - courier_charges - return_charges - withholding_tax
    difference_total = expected_total - bank_paid

    summary = {
        "total_cod": round(total_cod, 2),
        "courier_charges": round(courier_charges, 2),
        "return_charges": round(return_charges, 2),
        "withholding_tax": round(withholding_tax, 2),
        "expected_net": round(expected_total, 2),
        "bank_paid": round(bank_paid, 2),
        "difference": round(difference_total, 2)
    }

    return render_template(
        "courier_balance.html",
        summary=summary,
        rows=list(reversed(filtered)),
        store_filter=store_filter,
        from_date=from_date,
        to_date=to_date
    )

# ================= PACKING SLIP =================
@app.route("/packing-slip/<order_id>")
@login_required
def packing_slip(order_id):

    orders = load_orders()

    order = next((o for o in orders if o.get("order_id") == order_id), None)

    if not order:
        return "Order not found", 404

    return render_template("packing_slip.html", order=order)


# ================= ADD PRODUCT =================
@app.route("/add-product", methods=["GET", "POST"])
@login_required
def add_product():

    if request.method == "POST":

        products = load_products()

        name = request.form.get("name")
        code = request.form.get("code")
        price = float(request.form.get("price", 0))
        cost = float(request.form.get("cost", 0))
        category = request.form.get("category", "")

        opening_stock = int(request.form.get("opening_stock", 0))
        reorder_level = int(request.form.get("reorder_level", 3))

        image_file = request.files.get("image")
        filename = ""

        if image_file and image_file.filename:
            filename = secure_filename(image_file.filename)
            image_file.save(os.path.join(UPLOAD_FOLDER, filename))

        new_product = {
            "name": name,
            "code": code,
            "price": price,
            "cost": cost,
            "category": category,
            "image": filename,
            "opening_stock": opening_stock,
            "reorder_level": reorder_level
        }

        products.append(new_product)
        save_products(products)

        return redirect(url_for("admin"))

    return render_template("add_product.html")


# ================= EDIT PRODUCT =================
@app.route("/edit-product/<code>", methods=["GET", "POST"])
@login_required
def edit_product(code):

    products = load_products()

    product = next((p for p in products if p.get("code") == code), None)

    if not product:
        return "Product not found", 404

    if request.method == "POST":

        product["name"] = request.form.get("name")
        product["price"] = float(request.form.get("price", 0))
        product["cost"] = float(request.form.get("cost", 0))
        product["category"] = request.form.get("category", "")

        product["opening_stock"] = int(request.form.get("opening_stock", 0))
        product["reorder_level"] = int(request.form.get("reorder_level", 3))

        image = request.files.get("image")

        if image and image.filename:
            filename = secure_filename(image.filename)
            image.save(os.path.join(UPLOAD_FOLDER, filename))
            product["image"] = filename

        save_products(products)

        return redirect(url_for("admin"))

    return render_template("edit_product.html", product=product)


# ================= DELETE PRODUCT =================
@app.route("/delete-product/<code>")
@login_required
def delete_product(code):

    products = load_products()
    products = [p for p in products if p.get("code") != code]

    save_products(products)

    return redirect(url_for("admin"))

# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True)