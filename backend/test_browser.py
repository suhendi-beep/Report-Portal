from chrome_helper import get_driver
import time
print("Starting browser test...")
try:
    driver = get_driver(1920, 1080)
    print("Browser started OK")
    driver.get("https://www.google.com")
    time.sleep(2)
    print("Page loaded:", driver.title[:40])
    driver.quit()
    print("SUCCESS")
except Exception as e:
    print("ERROR:", e)
    import traceback
    traceback.print_exc()
