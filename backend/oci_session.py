"""Simpan/muat cookies OCI Console ke file JSON."""
import json, os
from datetime import datetime

COOKIE_FILE = "/app/shared/cookies/oci_cookies.json"


def save_cookies(driver):
    os.makedirs(os.path.dirname(COOKIE_FILE), exist_ok=True)
    data = {"saved_at": datetime.now().isoformat(), "cookies": driver.get_cookies()}
    with open(COOKIE_FILE, "w") as f:
        json.dump(data, f, indent=2)
    return len(data["cookies"])


def load_cookies(driver, url="https://cloud.oracle.com"):
    if not os.path.exists(COOKIE_FILE):
        return False
    with open(COOKIE_FILE) as f:
        data = json.load(f)
    driver.get(url)
    for cookie in data.get("cookies", []):
        cookie.pop("sameSite", None)
        try:
            driver.add_cookie(cookie)
        except Exception:
            pass
    return True


def cookies_exist():
    return os.path.exists(COOKIE_FILE)


def cookies_info():
    if not os.path.exists(COOKIE_FILE):
        return None
    with open(COOKIE_FILE) as f:
        data = json.load(f)
    return {"saved_at": data.get("saved_at"), "count": len(data.get("cookies", []))}


def delete_cookies():
    if os.path.exists(COOKIE_FILE):
        os.remove(COOKIE_FILE)
