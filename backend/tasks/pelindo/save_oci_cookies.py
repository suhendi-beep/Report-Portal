from chrome_helper import get_driver
import pickle, time

driver = get_driver(2560, 1440)
driver.get('https://cloud.oracle.com')
print('\\n=== LOGIN OCI MANUAL DI BROWSER INI ===')
print('Setelah login berhasil, tekan ENTER...')
input()

cookies = driver.get_cookies()
with open('/app/shared/oci_cookies_ilcs.pkl', 'wb') as f:
    pickle.dump(cookies, f)
print('✅ Cookies saved!')
driver.quit()
