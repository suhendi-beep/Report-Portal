"""
tasks/pelindo/oci_pelindo_backup.py
-- Weekly Backup Report OCI Pelindo --
Migrated dari: weekly_capture_backup_pelindo.py

Requires: OCI session cookies
Output: /app/shared/reports/pelindo_oci_pelindo_YYYY-MM-DD.docx
"""
import io, os, time
from datetime import datetime
from io import BytesIO

from PIL import Image
from docx import Document
from docx.shared import Inches
from selenium.webdriver.support.ui import WebDriverWait

URL_LIST = [
    ("Madra",   "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrgw2c2riaizw4ntgi46vew7aht3xtghijplsonhbi6copacjols3q/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riascm3p7rdbzg2zstlpcnuoqc5an3ws45zhhhibuoyrfnq/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riascm3p7rdbzg2zstlpcnuoqc5an3ws45zhhhibuoyrfnq/backups?region=ap-singapore-1"),
    ("Pancala", "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrgw2c2riaak2pxhc323heaxvvd3fmq56awubvuwl3xcktqkzjga4a/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2rialxqd3rdpby5yajtlou4l2kv4kxrb6scs74ri6ooplfwq/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2rialxqd3rdpby5yajtlou4l2kv4kxrb6scs74ri6ooplfwq/backups?region=ap-singapore-1"),
    ("Hastina", "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrgw2c2riavv2ppscsgoeimwcduw42aj4j5vdlfwlzu5f7fghpt5fa/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riawsduojbdiodiple5urxg3yiwyck3jq6jwvvsfl4bwbfa/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riawsduojbdiodiple5urxg3yiwyck3jq6jwvvsfl4bwbfa/backups?region=ap-singapore-1"),
    ("Ayodya",  "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrgw2c2riadvhoglb24qlrrikritcmzij43i4drz3eli7h6a7glxvq/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riakgo4g2zqxofwj5pdlkrtylezwceoakyzohdzy3jtpt6q/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riakgo4g2zqxofwj5pdlkrtylezwceoakyzohdzy3jtpt6q/backups?region=ap-singapore-1"),
    ("Alengka", "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrgw2c2riaogqoikvlcbbo3ns6tpsgmteb3fuk5kqee4m4isxi5nba/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riapgn55d3g5laxum5jsdcbwchfzagho3hjpjhctst4d3lq/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riapgn55d3g5laxum5jsdcbwchfzagho3hjpjhctst4d3lq/backups?region=ap-singapore-1"),
    ("DevPeo",  "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrgw2c2riap6s7sffy3sezsoz6mxfjxtss4ap2vralain4tfwin32a/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riaa6mqhng54s4cv2evjihbxeahqsx4y7djwhe44mekorua/ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riaa6mqhng54s4cv2evjihbxeahqsx4y7djwhe44mekorua/backups?region=ap-singapore-1"),
]


def run(log_path=None, args=None, driver=None):
    def log(msg):
        if log_path:
            with open(log_path, "a") as f:
                f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        print(msg)

    from chrome_helper import get_driver

    own_driver = driver is None
    if own_driver:
        # Mode lama: pakai cookies
        import oci_session
        driver = get_driver(2560, 1440)
        if not oci_session.load_cookies(driver):
            driver.quit()
            return "ERROR: OCI cookies tidak ditemukan. Login OCI dari dashboard dulu."
        driver.get("https://cloud.oracle.com")
        time.sleep(8)
        if "sign-in" in driver.current_url or "login" in driver.current_url:
            driver.quit()
            return "ERROR: OCI session expired. Silakan login ulang."

    wait       = WebDriverWait(driver, 60)
    saved_files = []
    TODAY      = datetime.now().strftime("%Y-%m-%d")

    try:
        log("Session valid, starting capture...")

        for idx, (name, url) in enumerate(URL_LIST):
            log(f"Opening: {name}")
            driver.get(url)

            # Halaman pertama perlu waktu lebih lama (browser cold start)
            base_wait = 5 if idx == 0 else 3
            time.sleep(base_wait)

            if "sign-in" in driver.current_url or "login" in driver.current_url:
                log(f"  SKIP: {name} — session expired")
                continue

            # Tunggu tabel backup muncul dengan data (max 10 detik)
            try:
                from selenium.webdriver.support import expected_conditions as EC2
                from selenium.webdriver.common.by import By as BY2
                WebDriverWait(driver, 10).until(
                    EC2.presence_of_element_located((BY2.CSS_SELECTOR,
                        "table tbody tr, .oui-table tbody tr, [role='row']"))
                )
                time.sleep(1)  # tunggu data render
            except Exception:
                time.sleep(2)

            driver.execute_script("window.scrollTo(0, 150)")
            time.sleep(0.5)

            png   = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(png))
            w, h  = image.size

            left_crop   = 30 if "dbaas" in url.lower() else 30
            top_crop    = 80
            right_crop  = max(w - 20, left_crop + 1)
            bottom_crop = max(h - 90, top_crop + 1)

            cropped = image.crop((left_crop, top_crop, right_crop, bottom_crop))
            stream  = BytesIO()
            cropped.save(stream, format="PNG")
            stream.seek(0)
            saved_files.append((name, stream))
            log(f"Captured: {name}")

    finally:
        if own_driver:
            driver.quit()

    if not saved_files:
        return "ERROR: Tidak ada halaman berhasil di-capture."

    log(f"Total captured: {len(saved_files)} — Generating Word report...")

    output_dir = "/app/shared/reports"
    os.makedirs(output_dir, exist_ok=True)
    doc_name = f"{output_dir}/pelindo_oci_pelindo_{TODAY}.docx"

    document = Document()
    document.add_heading(f"Oracle Backup Report Pelindo - {TODAY}", level=1)

    for i in range(0, len(saved_files), 2):
        # Tambah nama + gambar pertama
        name1, img1 = saved_files[i]
        document.add_paragraph(name1, style="Heading 3")
        p1 = document.add_paragraph()
        p1.add_run().add_picture(img1, width=Inches(6.5))

        # Tambah nama + gambar kedua kalau ada
        if i + 1 < len(saved_files):
            name2, img2 = saved_files[i + 1]
            document.add_paragraph(name2, style="Heading 3")
            p2 = document.add_paragraph()
            p2.add_run().add_picture(img2, width=Inches(6.5))

        document.add_page_break()

    document.save(doc_name)
    log(f"Report saved: {doc_name}")

    # Hapus file lama, sisakan 2 terbaru
    try:
        all_files = sorted(
            [f for f in os.listdir(output_dir) if f.startswith("pelindo_oci_pelindo_") and f.endswith(".docx")],
            reverse=True
        )
        for old in all_files[2:]:
            if old != os.path.basename(doc_name):
                os.remove(os.path.join(output_dir, old))
                log(f"Deleted old file: {old}")
    except Exception as e:
        log(f"Cleanup warning: {e}")

    return f"DONE: {os.path.basename(doc_name)}"
