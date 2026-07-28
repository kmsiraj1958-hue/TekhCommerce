import imaplib
import email
from email.header import decode_header
import json, os, re
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ORDERS_FILE = os.path.join(BASE_DIR, "orders.json")

# ====== EMAIL SETTINGS (Gmail example) ======
IMAP_HOST = "imap.gmail.com"
IMAP_USER = "YOUR_EMAIL@gmail.com"
IMAP_PASS = "YOUR_APP_PASSWORD"   # Gmail App Password (not normal password)

# Search rule: you can change it to match your order emails
# Examples:
#   '(UNSEEN SUBJECT "New Order")'
#   '(UNSEEN FROM "no-reply@yourdomain.com")'
#   '(UNSEEN SUBJECT "Order Received")'
IMAP_SEARCH = '(UNSEEN)'

# ====== JSON helpers ======
def load_orders():
    if not os.path.exists(ORDERS_FILE):
        return []
    try:
        with open(ORDERS_FILE, "r", encoding="utf-8") as f:
            txt = f.read().strip()
            return json.loads(txt) if txt else []
    except Exception:
        return []

def save_orders(data):
    with open(ORDERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def next_order_id(orders):
    max_n = 0
    for o in orders:
        oid = str(o.get("order_id", ""))
        m = re.search(r"ORD-(\d+)", oid)
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"ORD-{str(max_n+1).zfill(4)}"

def clean_text(s):
    return re.sub(r"\s+", " ", (s or "")).strip()

def decode_mime_words(s):
    if not s:
        return ""
    parts = decode_header(s)
    out = ""
    for text, enc in parts:
        if isinstance(text, bytes):
            out += text.decode(enc or "utf-8", errors="ignore")
        else:
            out += text
    return out

# ====== PARSER (generic) ======
def parse_order_from_email(subject, body):
    """
    This parser tries multiple patterns.
    You can tune these regex rules once you show me ONE sample email text.
    """

    text = f"{subject}\n{body}"

    # Try to find fields in common forms:
    # Name: XYZ
    # Phone: 03xx...
    # Address: ...
    # Product: ...
    # Code: ...
    # Price: ...
    patterns = {
        "customer_name": r"(?:Customer Name|Name)\s*[:\-]\s*(.+)",
        "customer_phone": r"(?:Phone|Mobile|Contact)\s*[:\-]\s*([0-9+\-\s]+)",
        "customer_address": r"(?:Address)\s*[:\-]\s*(.+)",
        "product_name": r"(?:Product)\s*[:\-]\s*(.+)",
        "product_code": r"(?:Code|SKU|Product Code)\s*[:\-]\s*([A-Za-z0-9\-_]+)",
        "price": r"(?:Price|Total)\s*[:\-]\s*([0-9,\.]+)",
    }

    data = {}
    for k, rgx in patterns.items():
        m = re.search(rgx, text, flags=re.IGNORECASE)
        if m:
            data[k] = clean_text(m.group(1))

    # if we didn't find enough info, return None
    if not data.get("customer_phone") and not data.get("customer_name"):
        return None

    return data

# ====== IMAP reader ======
def fetch_unseen_emails():
    mail = imaplib.IMAP4_SSL(IMAP_HOST)
    mail.login(IMAP_USER, IMAP_PASS)
    mail.select("INBOX")

    status, items = mail.search(None, IMAP_SEARCH)
    if status != "OK":
        print("Search failed")
        return

    ids = items[0].split()
    if not ids:
        print("No new order emails.")
        return

    orders = load_orders()
    added = 0

    for eid in ids:
        status, msg_data = mail.fetch(eid, "(RFC822)")
        if status != "OK":
            continue

        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        subject = decode_mime_words(msg.get("Subject", ""))
        from_ = decode_mime_words(msg.get("From", ""))

        # Get body text
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                disp = str(part.get("Content-Disposition", ""))
                if ctype == "text/plain" and "attachment" not in disp:
                    body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                    break
        else:
            body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")

        parsed = parse_order_from_email(subject, body)
        if not parsed:
            # Not an order email → mark as seen? (NO) keep it unread
            print("Skipped (not matched):", subject)
            continue

        new_order = {
            "order_id": next_order_id(orders),
            "product_code": parsed.get("product_code", ""),
            "product_name": parsed.get("product_name", ""),
            "price": parsed.get("price", ""),
            "qty": 1,
            "customer_name": parsed.get("customer_name", ""),
            "customer_phone": parsed.get("customer_phone", ""),
            "customer_address": parsed.get("customer_address", ""),
            "status": "Pending",
            "courier": "",
            "tracking_number": "",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "source_email_subject": subject,
            "source_email_from": from_,
        }

        orders.append(new_order)
        added += 1

        # Mark email as seen (processed)
        mail.store(eid, "+FLAGS", "\\Seen")

    save_orders(orders)
    mail.logout()
    print(f"Imported {added} orders from email.")

if __name__ == "__main__":
    fetch_unseen_emails()
