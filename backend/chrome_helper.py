from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

def get_driver(width=2560, height=1440, headless=True, page_load_timeout=45):
    """
    Get Chrome WebDriver instance.
    Args:
        width: browser width
        height: browser height
        headless: if True, run headless; if False, show browser window (for manual OTP input)
        page_load_timeout: detik sebelum driver.get() dianggap gagal.
            Halaman OCI database (dbaas/dbsystems) merender chart/widget
            yang berat di bawah software rendering (tidak ada GPU di
            container) — bisa butuh lebih dari 45s. Naikkan ini per
            pemanggilan untuk script yang capture halaman database.
    """
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument(f"--window-size={width},{height}")
    options.add_argument("--force-device-scale-factor=0.5")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.binary_location = "/usr/bin/chromium"
    service = Service("/usr/bin/chromedriver")
    driver = webdriver.Chrome(service=service, options=options)
    # Tanpa batas ini, driver.get(url) bisa menunggu tanpa akhir kalau
    # halaman punya widget/chart yang terus-menerus polling (misal halaman
    # database di OCI Console) dan tidak pernah benar-benar mencapai
    # "load" event. Default Selenium page load timeout terlalu longgar
    # (bisa 300s+) — 45s cukup untuk halaman normal tapi tetap gagal cepat
    # kalau memang macet, supaya loop di atas (backup scripts) bisa
    # menangkap exception dan lanjut ke resource berikutnya alih-alih hang.
    driver.set_page_load_timeout(page_load_timeout)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
            window.chrome = {runtime: {}};
        """
    })
    driver.set_window_size(width, height)
    return driver
