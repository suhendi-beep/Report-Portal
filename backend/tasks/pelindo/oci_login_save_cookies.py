"""
tasks/pelindo/oci_login_save_cookies.py
-- OCI Login Manual + Save Cookies --
User login via browser (dengan OTP manual), script save cookies untuk reuse
Output: Cookie count + expiry info
"""
import time, oci_session
from chrome_helper import get_driver

# Direct OCI login URL (with session picker)
OCI_LOGIN_URL = "https://login.oci.oraclecloud.com/v2/ui/sessionPicker?referer=eyJyZWZlcmVyIjoiaHR0cHM6Ly9jbG91ZC5vcmFjbGUuY29tIiwic2lnbmF0dXJlU3RyaW5nIjoiZXlKcmFXUWlPaUpoYzNkZmMybHVYekUzTVRNeU1UYzVOemd4TURBaUxDSjBlWEFpT2lKeVpXWmxjbkpsY2lJc0ltRnNaeUk2SWxKVE1qVTJJbjAuZXlKemRXSWlPaUp5WldabGNuSmxjbFJ2YTJWdUlpd2lZWFZrSWpvaWIyTnBJaXdpY21WbVpYSmxjaUk2SW1oMGRIQnpPaTh2WTJ4dmRXUXViM0poWTJ4bExtTnZiU0lzSW1semMzVmxjbDl5WldkcGIyNWZkWEpzSWpvaWFIUjBjSE02THk5c2IyZHBiaTVoY0MxemFXNW5ZWEJ2Y21VdE1TNXZjbUZqYkdWamJHOTFaQzVqYjIwdklpd2lkSFI1Y0dVaU9pSnlaV1psY25KbGNpSXNJbWx6Y3lJNkltRjFkR2hUWlhKMmFXTmxMbTl5WVdOc1pTNWpiMjBpTENKbGVIQWlPakUzT0RrMk5EUTRNak1zSW1saGRDSTZNVGM0T1RZME1USXlNeXdpYW5ScElqb2lZMlJqWkRJd01UZ3RNV1F6TWkwME5Ea3pMV0UxWldNdFpUWmhNR1JrTWpFeVpUVTJJaXdpZEdWdVlXNTBJam9pY21WbVpYSnlaWEpVYjJ0bGJpSXNJbU5zYVdWdWRGOXBaQ0k2SW1saFlYTmZZMjl1YzI5c1pTSjkuYXlIRzZKWHpqSk9WYzZUcDJqX3RzNmtZcHV4VkFxcXZPWElCcFpFalBRMjJHLXd5djZ1T1k2UlNQZ1hMZmtoYTFPN19hdDQ0Nm1DQUN4eFM1VlZsc0pnOVJVME9EYldiNC1mSEZlS2NmWHJWZUt4ZzFVOVh3Qk1IWFBjdVhfdUdBWmNGVEhjdFhoUkxqTWlmd1ZjdzQwQ3k1TTQtYmVtbmUzMy1RVkhkc3pjb2JFeUtLY253QmZsU005aHZNR3kzZjFDal9HcHh5ZXB4R2JJOFcwRFhpOUVndlpCSGRMSi1fTkdqTm5BN0w5eUhweU1FUmJ3VGRreklGaTlBNk11UDJjUk1JdUZnYjI4MlpqRkZJWUp5SVpTcXdOUDdHMTU0LUhpWGk3VUxHZ0FiMEhlWGRLenl3SnZEVWpUSVlNd2h2NFlQdGFnUGNxTTNFVEkzZXpfOENBIn0%3D&prompt=login_kmsi&no_global_redirect=false"

def run(log_path=None, args=None, driver=None):
    def log(msg):
        if log_path:
            import datetime
            with open(log_path, 'a') as f:
                f.write(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        print(msg)

    own_driver = driver is None
    if own_driver:
        driver = get_driver(1920, 1080)
    
    try:
        log("Opening OCI login page (session picker)...")
        driver.get(OCI_LOGIN_URL)
        time.sleep(4)
        
        log("=== MANUAL LOGIN REQUIRED ===")
        log("Browser terbuka dengan OCI login page")
        log("1. Pilih tenancy jika ada session picker")
        log("2. Input username & password (jika diminta)")
        log("3. Complete OTP verification")
        log("4. Wait sampai masuk OCI Console (https://cloud.oracle.com)")
        log("")
        log("Waiting for OCI Console URL... (max 10 menit)")
        
        # Wait for console URL (max 600 seconds = 10 menit)
        for i in range(300):
            time.sleep(2)
            try:
                url = driver.current_url
            except:
                url = "unknown"
            
            # Check if already at console
            if "cloud.oracle.com" in url and all(x not in url for x in ["sign-in", "login", "signin", "sessionPicker"]):
                log(f"Console detected: {url[:80]}")
                break
            
            # Progress log every 60 seconds
            if i % 30 == 0 and i > 0:
                log(f"Still waiting... ({i*2}s elapsed)")
        else:
            try:
                final_url = driver.current_url
                return f"TIMEOUT: Login tidak selesai dalam 10 menit. Current URL: {final_url[:100]}"
            except:
                return "TIMEOUT: Login tidak selesai dalam 10 menit."
        
        time.sleep(5)  # Wait for all cookies to settle
        
        # Save cookies
        count = oci_session.save_cookies(driver)
        info = oci_session.cookies_info()
        
        log(f"SUCCESS: {count} cookies saved at {info['saved_at']}")
        log("Cookies akan valid 7-14 hari")
        log("Weekly OCI Backup sekarang bisa jalan tanpa OTP!")
        
        return f"SUCCESS: {count} cookies disimpan. Weekly OCI Backup automation sekarang bisa jalan tanpa OTP popup!"
        
    except Exception as e:
        log(f"ERROR: {e}")
        import traceback
        log(traceback.format_exc())
        return f"ERROR: {str(e)}"
    finally:
        if own_driver:
            log("Closing browser in 3 seconds...")
            time.sleep(3)
            driver.quit()
