import os, importlib, traceback
from datetime import datetime
from celery import Celery

# ── Load secrets dari AWS SSM Parameter Store (fallback ke env var) ──
from ssm_config import get_secret, load_all_into_env

load_all_into_env()
REDIS_URL = get_secret("REDIS_URL").strip()
if not REDIS_URL:
    raise RuntimeError(
        "REDIS_URL is required. Set /portal-report/REDIS_URL in AWS SSM "
        "or provide an authenticated REDIS_URL environment variable."
    )

celery = Celery("automation_hub", broker=REDIS_URL, backend=REDIS_URL)
celery.conf.update(
    task_serializer="json", result_serializer="json",
    accept_content=["json"], timezone="Asia/Jakarta", enable_utc=False,
    task_soft_time_limit=7200, task_time_limit=7500,
)


def _log(path, msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    line = f"[{ts}] {msg}\n"
    with open(path, "a", encoding="utf-8") as f:
        f.write(line)
    print(line, end="")


@celery.task(bind=True)
def run_automation(self, customer_id, automation_id, args=None):
    log_path = f"/app/shared/logs/{customer_id}_{automation_id}.log"
    _log(log_path, f"=== START {customer_id}/{automation_id} | task={self.request.id} ===")
    try:
        module = importlib.import_module(f"tasks.{customer_id}.{automation_id}")
        result = module.run(log_path=log_path, args=args or {})
        _log(log_path, f"=== DONE: {result} ===")
        return {"status": "success", "result": result}
    except ModuleNotFoundError as e:
        _log(log_path, f"ERROR: module not found — {e}")
        return {"status": "error", "error": str(e)}
    except Exception:
        tb = traceback.format_exc()
        _log(log_path, f"ERROR:\n{tb}")
        return {"status": "error", "error": tb}


@celery.task(bind=True)
def run_oci_login(self, username, password):
    log_path = "/app/shared/logs/_oci_login.log"
    _log(log_path, f"=== OCI LOGIN START | task={self.request.id} ===")
    try:
        from chrome_helper import get_driver
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.common.by import By
        import oci_session, time

        driver = get_driver()
        wait   = WebDriverWait(driver, 30)

        _log(log_path, "Browser started, opening OCI...")
        driver.get("https://cloud.oracle.com")
        time.sleep(5)

        # Tenancy field
        try:
            tf = wait.until(lambda d: d.find_element(By.ID, "cloudAccountName"))
            tenancy = username.split("@")[-1] if "@" in username else ""
            if tenancy:
                tf.clear(); tf.send_keys(tenancy)
                driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
                time.sleep(3)
        except Exception:
            pass

        # Username
        try:
            u = driver.find_element(By.ID, "username")
            u.clear(); u.send_keys(username)
        except Exception:
            pass

        # Password
        try:
            p = driver.find_element(By.ID, "password")
            p.clear(); p.send_keys(password)
            driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        except Exception:
            pass

        _log(log_path, "Waiting for redirect...")
        for _ in range(30):
            time.sleep(2)
            if "cloud.oracle.com" in driver.current_url and "sign-in" not in driver.current_url:
                break

        time.sleep(5)
        count = oci_session.save_cookies(driver)
        driver.quit()

        _log(log_path, f"=== LOGIN OK | {count} cookies saved ===")
        return {"status": "success", "cookies": count}
    except Exception:
        tb = traceback.format_exc()
        _log(log_path, f"ERROR:\n{tb}")
        try: driver.quit()
        except: pass
        return {"status": "error", "error": tb}


@celery.task(bind=True)
def run_automation_with_login(self, customer_id, automation_id, args=None):
    """Jalankan automation dengan login OCI inline di dalam task."""
    log_path = f"/app/shared/logs/{customer_id}_{automation_id}.log"
    task_id  = self.request.id
    _log(log_path, f"=== START {customer_id}/{automation_id} | task={task_id} ===")

    import time, json, redis
    from chrome_helper import get_driver
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC

    r         = redis.from_url(REDIS_URL)
    STATE_KEY = f"oci_login_state:{task_id}"
    args      = args or {}

    tenancy  = args.pop("_tenancy",  "")
    username = args.pop("_username", "")
    password = args.pop("_password", "")

    driver = None
    try:
        driver = get_driver(2560, 1440)
        wait   = WebDriverWait(driver, 40)

        # ── Step 1: Buka halaman sign-in OCI ─────────────────
        _log(log_path, "Opening OCI login page...")
        driver.get("https://www.oracle.com/cloud/sign-in.html")
        time.sleep(3)

        # Tutup popup country kalau muncul
        try:
            popup_btn = driver.find_element(By.XPATH,
                "//*[contains(text(),'No, thanks') or contains(text(),\"I'll stay here\") or contains(text(),'No Thanks')]")
            if popup_btn.is_displayed():
                popup_btn.click()
                time.sleep(1)
                _log(log_path, "Dismissed country popup")
        except Exception:
            pass

        # ── Step 2: Input Tenancy ─────────────────────────────
        try:
            tf = wait.until(EC.visibility_of_element_located((By.ID, "cloudAccountName")))
            tf.clear()
            tf.send_keys(tenancy)
            tf.send_keys("\n")
            _log(log_path, f"Tenancy submitted: {tenancy}")
            time.sleep(4)
        except Exception as e:
            _log(log_path, f"Tenancy error: {e}")

        _log(log_path, f"URL after tenancy: {driver.current_url}")

        # ── Step 3: Username + Password ───────────────────────
        try:
            u = wait.until(EC.visibility_of_element_located(
                (By.CSS_SELECTOR, "input[type='text'], input[id*='username']")))
            u.clear()
            u.send_keys(username)
            _log(log_path, f"Username entered: {username}")
        except Exception as e:
            _log(log_path, f"Username error: {e}")

        time.sleep(1)

        try:
            p = wait.until(EC.visibility_of_element_located(
                (By.CSS_SELECTOR, "input[type='password']")))
            p.clear()
            p.send_keys(password)
            _log(log_path, "Password entered")
        except Exception as e:
            _log(log_path, f"Password error: {e}")

        time.sleep(1)
        try:
            sign_in = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//button[contains(text(),'Sign In') or @type='submit']")))
            sign_in.click()
            _log(log_path, "Clicked Sign In")
        except Exception as e:
            _log(log_path, f"Sign In error: {e}")
            try:
                p.send_keys("\n")
                _log(log_path, "Sign In via Enter")
            except Exception:
                pass

        time.sleep(4)
        _log(log_path, f"URL after sign in: {driver.current_url}")

        # ── Step 4: OTP (Email Verification) ─────────────────
        otp_needed = False
        try:
            otp_field = wait.until(EC.visibility_of_element_located(
                (By.CSS_SELECTOR, "input[placeholder='Enter Passcode'], input[placeholder*='Passcode'], input[placeholder*='passcode']")))
            if otp_field.is_displayed():
                otp_needed = True
                _log(log_path, "OTP required — Email Verification page detected")
        except Exception:
            pass

        if otp_needed:
            r.setex(STATE_KEY, 300, json.dumps({"state": "otp_required"}))
            _log(log_path, "Waiting for OTP from user...")

            otp_code = None
            for _ in range(150):  # max 5 menit
                time.sleep(2)
                raw = r.get(f"oci_login_otp:{task_id}")
                if raw:
                    otp_code = raw.decode()
                    r.delete(f"oci_login_otp:{task_id}")
                    break

            if not otp_code:
                r.setex(STATE_KEY, 60, json.dumps({"state": "error", "msg": "OTP timeout"}))
                driver.quit()
                return {"status": "error", "error": "OTP timeout"}

            _log(log_path, f"OTP received: {otp_code}")
            try:
                otp_input = driver.find_element(By.CSS_SELECTOR,
                    "input[placeholder='Enter Passcode'], input[placeholder*='Passcode']")
                otp_input.clear()
                otp_input.send_keys(otp_code)
                time.sleep(1)
                # Klik Verify - coba berbagai selector
                verify_clicked = False
                for btn_sel in [
                    (By.XPATH, "//button[contains(text(),'Verify')]"),
                    (By.XPATH, "//input[@type='submit']"),
                    (By.CSS_SELECTOR, "button[type='submit']"),
                    (By.XPATH, "//button[not(@disabled)]"),
                ]:
                    try:
                        btn = driver.find_element(*btn_sel)
                        if btn.is_displayed():
                            btn.click()
                            verify_clicked = True
                            _log(log_path, f"Clicked Verify via {btn_sel}")
                            break
                    except Exception:
                        pass
                if not verify_clicked:
                    otp_input.send_keys("\n")
                    _log(log_path, "Verify via Enter key")
            except Exception as e:
                _log(log_path, f"OTP submit error: {e}")

            time.sleep(5)

        # ── Step 5: Session Picker ────────────────────────────
        # Kalau ada "You have N active sessions", pilih tenancy yang sesuai
        try:
            session_header = driver.find_element(By.XPATH,
                "//*[contains(text(),'active session')]")
            if session_header.is_displayed():
                _log(log_path, "Session picker detected, selecting tenant...")
                # Cari item yang mengandung nama tenancy
                session_item = driver.find_element(By.XPATH,
                    f"//*[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'{tenancy.lower()}')]")
                session_item.click()
                _log(log_path, f"Selected session for tenancy: {tenancy}")
                time.sleep(5)
        except Exception:
            pass

        # ── Step 6: Tunggu masuk OCI Console ─────────────────
        _log(log_path, "Waiting for OCI console...")
        for _ in range(30):
            time.sleep(2)
            url = driver.current_url
            if "cloud.oracle.com" in url and "sign-in" not in url and "login" not in url and "signin" not in url:
                break

        _log(log_path, f"Console URL: {driver.current_url}")
        time.sleep(3)

        # ── Jalankan automation dengan driver yang sudah login ──
        time.sleep(3)

        # ── Jalankan automation dengan driver yang sudah login ──
        r.setex(STATE_KEY, 300, json.dumps({"state": "running"}))
        module = importlib.import_module(f"tasks.{customer_id}.{automation_id}")
        result = module.run(log_path=log_path, args=args, driver=driver)

        driver = None  # module sudah quit driver
        r.setex(STATE_KEY, 60, json.dumps({"state": "success"}))
        _log(log_path, f"=== DONE: {result} ===")
        return {"status": "success", "result": result}

    except Exception:
        tb = traceback.format_exc()
        _log(log_path, f"ERROR:\n{tb}")
        try: r.setex(STATE_KEY, 60, json.dumps({"state": "error", "msg": tb[:200]}))
        except Exception: pass
        return {"status": "error", "error": tb}
    finally:
        if driver:
            try: driver.quit()
            except Exception: pass
# State disimpan di Redis untuk komunikasi antara task dan frontend

@celery.task(bind=True)
def run_oci_login_with_otp(self, tenancy, username, password):
    """Login OCI dengan support OTP. State disimpan di Redis."""
    log_path = "/app/shared/logs/_oci_login.log"
    task_id  = self.request.id
    _log(log_path, f"=== OCI LOGIN (OTP) START | task={task_id} ===")

    import time, json
    from chrome_helper import get_driver
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    import oci_session
    import redis

    r = redis.from_url(REDIS_URL)
    STATE_KEY = f"oci_login_state:{task_id}"

    driver = None
    try:
        driver = get_driver()
        wait   = WebDriverWait(driver, 30)

        # Step 1: Buka OCI
        _log(log_path, "Opening OCI login page...")
        driver.get("https://www.oracle.com/cloud/sign-in.html")
        time.sleep(3)

        # Step 2: Input tenancy
        try:
            tf = wait.until(EC.presence_of_element_located((By.ID, "cloudAccountName")))
            tf.clear()
            tf.send_keys(tenancy)
            driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
            time.sleep(3)
            _log(log_path, f"Tenancy submitted: {tenancy}")
        except Exception as e:
            _log(log_path, f"Tenancy input skip: {e}")

        # Step 3: Input username
        try:
            u = wait.until(EC.presence_of_element_located((By.ID, "username")))
            u.clear()
            u.send_keys(username)
            _log(log_path, f"Username entered: {username}")
        except Exception as e:
            _log(log_path, f"Username input skip: {e}")

        # Step 4: Input password
        try:
            p = wait.until(EC.presence_of_element_located((By.ID, "password")))
            p.clear()
            p.send_keys(password)
            driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
            _log(log_path, "Password submitted")
        except Exception as e:
            _log(log_path, f"Password submit skip: {e}")

        time.sleep(5)

        # Step 5: Cek apakah ada OTP
        otp_needed = False
        try:
            otp_field = driver.find_element(By.ID, "totp-field")
            if otp_field.is_displayed():
                otp_needed = True
                _log(log_path, "OTP required — waiting for input from user...")
        except Exception:
            pass

        # Coba juga selector lain untuk OTP
        if not otp_needed:
            try:
                otp_field = driver.find_element(By.CSS_SELECTOR, "input[name='passcode']")
                if otp_field.is_displayed():
                    otp_needed = True
                    _log(log_path, "OTP required (passcode) — waiting for input from user...")
            except Exception:
                pass

        if otp_needed:
            # Simpan state ke Redis — frontend akan polling ini
            r.setex(STATE_KEY, 300, json.dumps({"state": "otp_required"}))

            # Tunggu OTP dari frontend (max 5 menit)
            otp_code = None
            for _ in range(150):  # 150 x 2 detik = 5 menit
                time.sleep(2)
                raw = r.get(f"oci_login_otp:{task_id}")
                if raw:
                    otp_code = raw.decode()
                    r.delete(f"oci_login_otp:{task_id}")
                    break

            if not otp_code:
                r.setex(STATE_KEY, 60, json.dumps({"state": "error", "msg": "OTP timeout"}))
                driver.quit()
                return {"status": "error", "error": "OTP timeout"}

            # Input OTP
            _log(log_path, f"OTP received: {otp_code}, submitting...")
            try:
                otp_field = driver.find_element(By.ID, "totp-field")
            except Exception:
                otp_field = driver.find_element(By.CSS_SELECTOR, "input[name='passcode']")
            otp_field.clear()
            otp_field.send_keys(otp_code)
            try:
                driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
            except Exception:
                pass
            time.sleep(5)

        # Step 6: Tunggu redirect ke console
        _log(log_path, "Waiting for console redirect...")
        for _ in range(30):
            time.sleep(2)
            url = driver.current_url
            if "cloud.oracle.com" in url and "sign-in" not in url and "login" not in url:
                break

        time.sleep(5)
        count = oci_session.save_cookies(driver)
        driver.quit()

        r.setex(STATE_KEY, 60, json.dumps({"state": "success", "cookies": count}))
        _log(log_path, f"=== LOGIN OK | {count} cookies saved ===")
        return {"status": "success", "cookies": count}

    except Exception:
        tb = traceback.format_exc()
        _log(log_path, f"ERROR:\n{tb}")
        try:
            r.setex(STATE_KEY, 60, json.dumps({"state": "error", "msg": tb}))
        except Exception:
            pass
        try:
            driver.quit()
        except Exception:
            pass
        return {"status": "error", "error": tb}


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEDULED TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@celery.task(bind=True, name="celery_worker.scheduled_daily_ilcs")
def scheduled_daily_ilcs(self):
    """Jalankan Daily Backup Status ILCS lalu kirim hasil ke email."""
    from datetime import datetime
    log_path = "/app/shared/logs/pelindo_daily_ilcs_status.log"
    _log(log_path, f"=== SCHEDULED START: daily_ilcs_status | task={self.request.id} ===")

    try:
        from tasks.pelindo.daily_ilcs_status import run as daily_run
        result = daily_run(log_path=log_path)
        _log(log_path, f"=== RUN DONE: {result} ===")
    except Exception:
        tb = traceback.format_exc()
        _log(log_path, f"ERROR running daily_ilcs_status:\n{tb}")
        result = f"ERROR: {tb[:200]}"

    # Baca isi log untuk dijadikan body email
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        # Ambil bagian summary saja (dari baris "=== START" terakhir)
        start_idx = 0
        for i, l in enumerate(lines):
            if "SCHEDULED START" in l or "=== START" in l:
                start_idx = i
        body = "".join(lines[start_idx:])[-4000:]  # max 4000 char
    except Exception:
        body = f"Result: {result}"

    today = datetime.now().strftime("%Y-%m-%d")
    subject = f"[Daily Backup] Status ILCS & Pelindo — {today}"

    from email_helper import send_report_email
    ok = send_report_email(
        to=EMAIL_TO,
        subject=subject,
        body=body,
        log=lambda m: _log(log_path, m),
    )
    status = "Email sent" if ok else "Email FAILED"
    _log(log_path, f"=== SCHEDULED DONE: {status} ===")
    return {"status": "success", "email": status}


@celery.task(bind=True, name="celery_worker.scheduled_grafana_ho")
def scheduled_grafana_ho(self):
    """Jalankan Weekly Capture Grafana HO lalu kirim file PPTX ke email."""
    from datetime import datetime, timedelta
    log_path = "/app/shared/logs/pelindo_grafana_capture.log"
    _log(log_path, f"=== SCHEDULED START: grafana_capture | task={self.request.id} ===")

    # Default: capture 7 hari terakhir
    today     = datetime.now()
    week_ago  = today - timedelta(days=7)
    args = {
        "start_date": week_ago.strftime("%Y-%m-%d"),
        "start_time": "00:00",
        "end_date":   today.strftime("%Y-%m-%d"),
        "end_time":   "23:59",
    }

    output_file = None
    try:
        from tasks.pelindo.grafana_capture import run as grafana_run
        result = grafana_run(log_path=log_path, args=args)
        _log(log_path, f"=== RUN DONE: {result} ===")

        # Cari file PPTX yang baru dibuat
        import glob, os
        files = sorted(
            glob.glob("/app/shared/reports/pelindo_grafana_*.pptx"),
            key=os.path.getmtime, reverse=True
        )
        if files:
            output_file = files[0]
            _log(log_path, f"Attachment: {output_file}")
    except Exception:
        tb = traceback.format_exc()
        _log(log_path, f"ERROR running grafana_capture:\n{tb}")
        result = f"ERROR: {tb[:200]}"

    # Email
    period  = f"{args['start_date']} s/d {args['end_date']}"
    subject = f"[Weekly Report] Grafana HO — {period}"
    body = (
        f"Grafana HO Weekly Report\n"
        f"Period  : {period}\n"
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} WIB\n\n"
        f"Laporan PPTX terlampir.\n\n"
        f"-- Portal Report · ICS Compute --"
    )

    from email_helper import send_report_email
    ok = send_report_email(
        to=EMAIL_TO,
        subject=subject,
        body=body,
        attachments=[output_file] if output_file else [],
        log=lambda m: _log(log_path, m),
    )
    status = "Email sent" if ok else "Email FAILED"
    _log(log_path, f"=== SCHEDULED DONE: {status} ===")
    return {"status": "success", "email": status}
