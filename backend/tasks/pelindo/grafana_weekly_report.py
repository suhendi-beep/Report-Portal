"""
tasks/pelindo/grafana_weekly_report.py
-- Weekly Grafana Report Pelindo --

Screenshot semua dashboard dari config.shared.json
Output: /app/shared/grafana_weekly/{year}/{month}. {month_name}/{site}/{group}/{category}/{name}/weekX.png
Bundle: ZIP di /app/shared/reports/

Pakai Selenium + Chromium yang sudah ada di container (tidak perlu install tambahan).
"""
import os, json, time, zipfile
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO
from urllib.parse import urlparse, urlencode, parse_qsl, urlunparse, urljoin

from PIL import Image

GRAFANA_USER = os.getenv("GRAFANA_USER", "icscompute")
GRAFANA_PASS = os.getenv("GRAFANA_PASS", "icsW4tch!")
CONFIG_FILE  = "/app/tasks/pelindo/grafana_weekly_config.json"
OUTPUT_BASE  = "/app/shared/grafana_weekly"

INDONESIAN_MONTHS = [
    "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]

# Week blocks: day ranges per week number
WEEK_RANGES = {1:(1,7), 2:(8,14), 3:(15,21), 4:(22,31)}


def _safe(value):
    """Sanitize string for use as folder/file name."""
    import re
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(value).strip()).rstrip(' .')


def _build_url(base_url, dashboard_url, from_ts, to_ts, org_id=1, kiosk=True):
    """Build final Grafana URL with time range."""
    raw = dashboard_url if urlparse(dashboard_url).scheme else urljoin(
        base_url.rstrip("/") + "/", dashboard_url.lstrip("/")
    )
    parsed = urlparse(raw)
    pairs  = parse_qsl(parsed.query, keep_blank_values=True)
    def setq(pairs, key, val):
        return [(k,v) for k,v in pairs if k != key] + [(key, str(val))]
    pairs = setq(pairs, "from",   from_ts)
    pairs = setq(pairs, "to",     to_ts)
    pairs = setq(pairs, "orgId",  org_id)
    pairs = setq(pairs, "theme",  "dark")
    if kiosk:
        pairs = setq(pairs, "kiosk", "tv")
    return urlunparse(parsed._replace(query=urlencode(pairs)))


def run(log_path=None, args=None):
    def log(msg):
        ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        if log_path:
            with open(log_path, "a") as f:
                f.write(line + "\n")

    args       = args or {}
    raw_week   = str(args.get("week_num", "1")).replace("week", "").strip()
    week_num   = int(raw_week) if raw_week.isdigit() else 1
    month_num  = int(args.get("month_num", datetime.now().month))
    year_num   = int(args.get("year_num",  datetime.now().year))
    start_date = args.get("start_date", datetime.now().strftime("%Y-%m-%d"))
    start_time = args.get("start_time", "00:00")
    end_date   = args.get("end_date",   datetime.now().strftime("%Y-%m-%d"))
    end_time   = args.get("end_time",   "23:59")

    tz = ZoneInfo("Asia/Jakarta")
    def to_ts(d, t):
        dt = datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M").replace(tzinfo=tz)
        return int(dt.timestamp() * 1000)

    FROM_TS    = to_ts(start_date, start_time)
    TO_TS      = to_ts(end_date,   end_time)
    week_label = f"week{week_num}"
    month_name = INDONESIAN_MONTHS[month_num]
    month_dir  = f"{month_num}. {month_name}"

    # Load config
    if not os.path.exists(CONFIG_FILE):
        return f"ERROR: Config tidak ada: {CONFIG_FILE}"

    with open(CONFIG_FILE) as f:
        config = json.load(f)

    grafana    = config["grafana"]
    base_url   = grafana["base_url"]
    dashboards = config.get("dashboards", [])
    active     = [d for d in dashboards if d.get("url")]

    log(f"Total dashboards: {len(active)} | Week: {week_label} | {month_dir} {year_num}")
    log(f"Period: {start_date} {start_time} → {end_date} {end_time}")

    from chrome_helper import get_driver
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.common.by import By

    # Default viewport
    vp_w = int(grafana.get("viewport", {}).get("width",  1920))
    vp_h = int(grafana.get("viewport", {}).get("height", 1080))

    driver  = get_driver(vp_w, vp_h)
    wait    = WebDriverWait(driver, 60)
    results = []

    try:
        # ── Login ──────────────────────────────────────────
        log("Login Grafana...")
        driver.get(f"{base_url.rstrip('/')}/login")
        wait.until(lambda d: d.find_element(By.NAME, "user"))
        driver.find_element(By.NAME, "user").send_keys(GRAFANA_USER)
        driver.find_element(By.NAME, "password").send_keys(GRAFANA_PASS)
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        time.sleep(8)
        log("Login OK")

        # ── Capture ────────────────────────────────────────
        for idx, dash in enumerate(active):
            name     = dash.get("name", f"dashboard_{idx}")
            site     = dash.get("site",     dash.get("folder", {}).get("site",     "default"))
            group    = dash.get("group",    dash.get("folder", {}).get("group",    "default"))
            category = dash.get("category", dash.get("folder", {}).get("category", ""))

            # Set window besar supaya semua panel muat — height 2x dari config
            # agar 2 baris utilisasi panel ikut terscreenshot
            d_vp_h = int(dash.get("viewport", {}).get("height") or vp_h)
            d_vp_w = int(dash.get("viewport", {}).get("width")  or vp_w)
            # Tambah 400px extra untuk memastikan panel bawah tidak terpotong
            render_h = d_vp_h + 400
            driver.set_window_size(d_vp_w, render_h)

            url = _build_url(base_url, dash["url"], FROM_TS, TO_TS,
                             org_id=grafana.get("org_id", 1),
                             kiosk=grafana.get("kiosk", True))

            log(f"[{idx+1}/{len(active)}] {site}/{group}/{category}/{name}")

            try:
                driver.get(url)
                wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
                time.sleep(int(float(grafana.get("wait_seconds", 8))))
                # Scroll ke bawah supaya lazy panels ikut load, lalu scroll kembali ke atas
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(2)
                driver.execute_script("window.scrollTo(0, 0)")
                time.sleep(2)

                png   = driver.get_screenshot_as_png()
                image = Image.open(BytesIO(png))

                # Simpan full page — tidak crop, semua panel terlihat
                w, h  = image.size
                # Hanya crop bagian kanan kalau ada overflow horizontal
                if w > d_vp_w:
                    image = image.crop((0, 0, d_vp_w, h))

                # Build output path: {year}/{month_dir}/{site}/{group}/{category}/{name}/weekX.png
                parts = [str(year_num), month_dir]
                if site:     parts.append(_safe(site))
                if group:    parts.append(_safe(group))
                if category: parts.append(_safe(category))
                parts.append(_safe(name))

                out_dir  = os.path.join(OUTPUT_BASE, *parts)
                os.makedirs(out_dir, exist_ok=True)
                out_path = os.path.join(out_dir, f"{week_label}.png")
                image.save(out_path, format="PNG", optimize=True)

                results.append({"path": out_path, "rel": os.path.join(*parts, f"{week_label}.png"), "status": "ok"})
                log(f"  ✓ {out_path}")

            except Exception as e:
                log(f"  ✗ ERROR {name}: {e}")
                results.append({"path": "", "rel": name, "status": "error", "error": str(e)})

    finally:
        driver.quit()

    ok_count  = sum(1 for r in results if r["status"] == "ok")
    err_count = len(results) - ok_count
    log(f"Captured: {ok_count} success, {err_count} error")

    # ── Bundle ZIP — include semua week yang sudah ada ───────
    os.makedirs("/app/shared/reports", exist_ok=True)
    zip_name = os.path.join(
        "/app/shared/reports",
        f"pelindo_grafana_{month_num}_{month_name}_{week_label}_{start_date}_to_{end_date}.zip"
    )

    # Scan semua weekX.png dari OUTPUT_BASE/{year}/{month_dir}/...
    month_base = os.path.join(OUTPUT_BASE, str(year_num), month_dir)
    all_week_files = []
    if os.path.exists(month_base):
        for root, dirs, files in os.walk(month_base):
            for fname in files:
                if fname.startswith("week") and fname.endswith(".png"):
                    full_path = os.path.join(root, fname)
                    rel_path  = os.path.relpath(full_path, OUTPUT_BASE)
                    all_week_files.append((full_path, rel_path))

    log(f"Total file di ZIP (semua week): {len(all_week_files)}")
    with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_DEFLATED) as zf:
        for full_path, rel_path in all_week_files:
            zf.write(full_path, rel_path)
    log(f"ZIP: {zip_name} ({os.path.getsize(zip_name)//1024} KB)")

    # ── Cleanup ZIP lama (keep 3) ──────────────────────────
    try:
        report_dir = "/app/shared/reports"
        zips = sorted(
            [f for f in os.listdir(report_dir)
             if f.startswith("pelindo_grafana_") and f.endswith(".zip")],
            reverse=True
        )
        for old in zips[3:]:
            os.remove(os.path.join(report_dir, old))
            log(f"Deleted old: {old}")
    except Exception as e:
        log(f"Cleanup warning: {e}")

    return f"DONE: {ok_count}/{len(active)} captured → {os.path.basename(zip_name)} ({len(all_week_files)} files total)"
