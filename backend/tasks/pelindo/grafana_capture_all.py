"""
tasks/pelindo/grafana_capture_all.py
-- Weekly Capture Grafana ALL Dashboards (Pelindo, GCP, OCI, Huawei, Alibaba, SLA) --

Dijalankan seminggu sekali. Setiap generate otomatis deteksi week1/week2/week3/week4
berdasarkan tanggal end_date, lalu simpan PNG ke folder bulan yang sama.

Struktur output:
  /shared/reports/grafana_all/YYYY-MM/{site}/{group}/{category}/{name}_week1.png
  /shared/reports/grafana_all/YYYY-MM/{site}/{group}/{category}/{name}_week2.png
  ... dst sampai week4

Week ditentukan dari tanggal end_date:
  1–7   → week1
  8–14  → week2
  15–21 → week3
  22–31 → week4
"""
import os, time, json, re
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO
from urllib.parse import urljoin, urlparse

from PIL import Image
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.by import By

GRAFANA_BASE  = os.getenv("GRAFANA_URL",  "https://monitoring.ilcs.co.id")
GRAFANA_USER  = os.getenv("GRAFANA_USER", "icscompute")
GRAFANA_PASS  = os.getenv("GRAFANA_PASS", "icsW4tch!")

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "grafana_config_all.json")

INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

def safe_name(value):
    text = INVALID_CHARS.sub("_", str(value).strip()).rstrip(" .")
    return text or "_"

def week_suffix(day: int) -> str:
    """Tentukan suffix week dari tanggal hari (1-31)."""
    if day <= 7:   return "week1"
    if day <= 14:  return "week2"
    if day <= 21:  return "week3"
    return "week4"

def build_url(base_url, dashboard_url, from_ts, to_ts):
    if urlparse(dashboard_url).scheme:
        full_url = dashboard_url
    else:
        full_url = urljoin(base_url.rstrip("/") + "/", dashboard_url.lstrip("/"))
    sep = "&" if "?" in full_url else "?"
    return f"{full_url}{sep}from={from_ts}&to={to_ts}&kiosk=tv&theme=dark&timezone=Asia%2FJakarta"


def run(log_path=None, args=None):
    def log(msg):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        if log_path:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")

    args       = args or {}
    start_date = args.get("start_date", datetime.now().strftime("%Y-%m-%d"))
    start_time = args.get("start_time", "00:00")
    end_date   = args.get("end_date",   datetime.now().strftime("%Y-%m-%d"))
    end_time   = args.get("end_time",   "23:59")
    # Filter site opsional (kosong = semua)
    filter_site = args.get("site", "").strip().lower()

    def to_ts(d, t):
        dt = datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M").replace(
            tzinfo=ZoneInfo("Asia/Jakarta"))
        return int(dt.timestamp() * 1000)

    FROM_TS = to_ts(start_date, start_time)
    TO_TS   = to_ts(end_date,   end_time)
    MONTH   = datetime.strptime(start_date, "%Y-%m-%d").strftime("%Y-%m")

    # Load config
    if not os.path.exists(CONFIG_FILE):
        return f"ERROR: Config file tidak ada: {CONFIG_FILE}"

    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        config = json.load(f)

    dashboards = config.get("dashboards", [])
    if filter_site:
        dashboards = [d for d in dashboards if d.get("site","").lower() == filter_site]
        log(f"Filter site='{filter_site}': {len(dashboards)} dashboards")

    if not dashboards:
        return "ERROR: Tidak ada dashboard yang ditemukan"

    log(f"Total dashboards: {len(dashboards)}")
    log(f"Period: {start_date} {start_time} — {end_date} {end_time}")

    # Output dir
    output_root = f"/app/shared/reports/grafana_all/{MONTH}"
    os.makedirs(output_root, exist_ok=True)

    from chrome_helper import get_driver
    driver = get_driver(3440, 1220)
    wait   = WebDriverWait(driver, 60)

    captured   = []
    failed     = []

    try:
        # ── Login ──────────────────────────────────────────────────
        log(f"Login ke {GRAFANA_BASE}...")
        driver.get(f"{GRAFANA_BASE}/login")
        wait.until(lambda d: d.find_element(By.NAME, "user"))
        driver.find_element(By.NAME, "user").send_keys(GRAFANA_USER)
        driver.find_element(By.NAME, "password").send_keys(GRAFANA_PASS)
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        time.sleep(8)
        log("Login OK")

        wait_seconds = config.get("grafana", {}).get("wait_seconds", 8)

        for idx, dash in enumerate(dashboards):
            site     = safe_name(dash.get("site",     "Unknown"))
            group    = safe_name(dash.get("group",    "Unknown"))
            category = safe_name(dash.get("category", "Unknown"))
            name     = safe_name(dash.get("name",     f"dashboard_{idx}"))

            # Build folder path
            folder = os.path.join(output_root, site, group, category)
            os.makedirs(folder, exist_ok=True)
            filepath = os.path.join(folder, f"{name}.png")

            log(f"[{idx+1}/{len(dashboards)}] {site}/{group}/{category}/{name}")

            try:
                url = build_url(GRAFANA_BASE, dash["url"], FROM_TS, TO_TS)

                # Override viewport per dashboard jika ada
                vp = dash.get("viewport", {})
                vp_w = int(vp.get("width",  config.get("grafana",{}).get("viewport",{}).get("width",  3440)))
                vp_h = int(vp.get("height", config.get("grafana",{}).get("viewport",{}).get("height", 1220)))
                driver.set_window_size(vp_w + 100, vp_h + 200)

                driver.get(url)
                wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
                time.sleep(wait_seconds)

                # Scroll to top
                driver.execute_script("window.scrollTo(0,0)")
                time.sleep(1)

                # Screenshot
                png   = driver.get_screenshot_as_png()
                image = Image.open(BytesIO(png))
                w, h  = image.size

                # Crop sedikit bagian bawah (footer Grafana)
                cropped = image.crop((0, 0, w, max(int(h * 0.93), 100)))
                cropped.save(filepath, format="PNG", optimize=True)

                log(f"  ✓ Saved: {os.path.relpath(filepath, output_root)}")
                captured.append(filepath)

            except Exception as e:
                log(f"  ✗ FAILED: {name} — {e}")
                failed.append(f"{site}/{group}/{category}/{name}: {e}")

    finally:
        driver.quit()

    # ── Buat ZIP ────────────────────────────────────────────────────
    if captured:
        log(f"\nTotal captured: {len(captured)}, failed: {len(failed)}")
        log("Membuat ZIP file...")

        zip_dir  = "/app/shared/reports"
        zip_name = f"pelindo_grafana_all_{start_date}_to_{end_date}.zip"
        zip_path = os.path.join(zip_dir, zip_name)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fpath in captured:
                arcname = os.path.relpath(fpath, output_root)
                zf.write(fpath, arcname)

        size_mb = round(os.path.getsize(zip_path) / (1024*1024), 1)
        log(f"ZIP saved: {zip_path} ({size_mb} MB)")

        # Log failures
        if failed:
            log(f"\n=== FAILED ({len(failed)}) ===")
            for f in failed:
                log(f"  ✗ {f}")

        # Hapus ZIP lama, sisakan 2
        try:
            all_zips = sorted(
                [f for f in os.listdir(zip_dir)
                 if f.startswith("pelindo_grafana_all_") and f.endswith(".zip")],
                reverse=True)
            for old in all_zips[2:]:
                os.remove(os.path.join(zip_dir, old))
                log(f"Deleted old ZIP: {old}")
        except Exception as e:
            log(f"Cleanup warning: {e}")

        return f"DONE: {zip_name} ({len(captured)} screenshots, {len(failed)} failed)"
    else:
        return f"ERROR: Tidak ada screenshot berhasil. Failed: {len(failed)}"
