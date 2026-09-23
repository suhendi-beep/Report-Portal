"""
oci_login_helper.py
Helper untuk OCI login dengan OTP support (tanpa Celery)
Dipanggil langsung dari automation script
"""
import time, json, os, traceback
from chrome_helper import get_driver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
import oci_session
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

def login_with_otp(tenancy, username, password, task_id, log_func=print):
    """
    Login OCI dengan OTP support.
    Returns: (driver, success_bool, error_msg)
    """
    r = redis.from_url(REDIS_URL)
    STATE_KEY = f"oci_login_state:{task_id}"

    driver = None
    try:
        driver = get_driver(2560, 1440)
        wait = WebDriverWait(driver, 30)

        log_func("Opening OCI login page...")
        driver.get("https://www.oracle.com/cloud/sign-in.html")
        time.sleep(3)

        # Input tenancy
        try:
            tf = wait.until(EC.presence_of_element_located((By.ID, "cloudAccountName")))
            tf.clear()
            tf.send_keys(tenancy)
            driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
            time.sleep(3)
            log_func(f"Tenancy submitted: {tenancy}")
        except Exception as e:
            log_func(f"Tenancy input skip: {e}")

        # Input username
        try:
            u = wait.until(EC.presence_of_element_located((By.ID, "username")))
            u.clear()
            u.send_keys(username)
            log_func(f"Username entered: {username}")
        except Exception as e:
            log_func(f"Username input skip: {e}")

        # Input password
        try:
            p = wait.until(EC.presence_of_element_located((By.ID, "password")))
            p.clear()
            p.send_keys(password)
            driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
            log_func("Password submitted")
        except Exception as e:
            log_func(f"Password submit skip: {e}")

        time.sleep(5)

        # Cek OTP
        otp_needed = False
        otp_field = None
        try:
            otp_field = driver.find_element(By.ID, "totp-field")
            if otp_field.is_displayed():
                otp_needed = True
        except Exception:
            try:
                otp_field = driver.find_element(By.CSS_SELECTOR, "input[name='passcode']")
                if otp_field.is_displayed():
                    otp_needed = True
            except Exception:
                pass

        if otp_needed:
            log_func("OTP required GÇö waiting for user input...")
            r.setex(STATE_KEY, 300, json.dumps({"state": "otp_required"}))

            # Tunggu OTP (max 5 menit)
            otp_code = None
            for i in range(150):  # 150 x 2s = 5 min
                time.sleep(2)
                raw = r.get(f"oci_login_otp:{task_id}")
                if raw:
                    otp_code = raw.decode()
                    r.delete(f"oci_login_otp:{task_id}")
                    break
                # Auto-request resend OTP setiap 30 detik
                if i > 0 and i % 15 == 0:
                    log_func(f"Still waiting for OTP... ({i*2}s elapsed)")

            if not otp_code:
                r.setex(STATE_KEY, 60, json.dumps({"state": "error", "msg": "OTP timeout (5 min)"}))
                driver.quit()
                return (None, False, "OTP timeout")

            # Submit OTP
            log_func(f"OTP received, submitting...")
            r.setex(STATE_KEY, 120, json.dumps({"state": "running"}))
            log_func("[DEBUG] State updated to running")
            # Update state to running before button click
            otp_field.clear()
            otp_field.send_keys(otp_code)
            try:
                driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
            except Exception:
                pass
            time.sleep(5)

        # Tunggu redirect ke console
        log_func("Waiting for console redirect...")
        for _ in range(30):
            time.sleep(2)
            url = driver.current_url
            if "cloud.oracle.com" in url and "sign-in" not in url and "login" not in url:
                break

        time.sleep(3)

        # Verify login sukses
        if "sign-in" in driver.current_url or "login" in driver.current_url:
            r.setex(STATE_KEY, 60, json.dumps({"state": "error", "msg": "Login failed"}))
            driver.quit()
            return (None, False, "Login failed - still on login page")

        # Save cookies (opsional, untuk next run)
        count = oci_session.save_cookies(driver)
        r.setex(STATE_KEY, 60, json.dumps({"state": "success", "cookies": count}))
        log_func(f"Login SUCCESS | {count} cookies saved")

        return (driver, True, None)

    except Exception:
        tb = traceback.format_exc()
        log_func(f"Login ERROR:\n{tb}")
        try:
            r.setex(STATE_KEY, 60, json.dumps({"state": "error", "msg": tb}))
        except Exception:
            pass
        if driver:
            driver.quit()
        return (None, False, tb)

