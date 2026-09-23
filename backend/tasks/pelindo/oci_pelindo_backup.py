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
    """
    Args:
        log_path: Path ke log file
        args: Dict arguments (tidak digunakan untuk sekarang)
        driver: Selenium WebDriver yang sudah login (dikirim dari
            celery_worker.py via run_automation_with_login, sama seperti
            oci_ilcs_backup.py). Sebelumnya function ini membuat driver
            sendiri dan login pakai cookies session — itu sudah tidak
            konsisten dengan flow kredensial inline yang dipakai UI
            sekarang, dan menyebabkan TypeError karena celery_worker.py
            memanggil run(..., driver=driver) tapi signature lama tidak
            menerima parameter itu.
    """
    def log(msg):
        if log_path:
            with open(log_path, "a") as f:
                f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        print(msg)

    # Driver sudah login dari celery_worker.py — tidak perlu login lagi di sini.
    wait   = WebDriverWait(driver, 60)
    saved_files = []
    TODAY = datetime.now().strftime("%Y-%m-%d")

    try:
        log("Session valid, starting capture...")

        for name, url in URL_LIST:
            log(f"Opening: {name}")
            driver.get(url)
            wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
            # Wait for OCI console to be fully loaded (reduced from 8s to 3s)
            time.sleep(3)
            driver.execute_script("window.scrollTo(0,300)")
            # Wait for any lazy-loaded content (reduced from 5s to 2s)
            time.sleep(2)

            png   = driver.get_screenshot_as_png()
            image = Image.open(io.BytesIO(png))
            w, h  = image.size

            left_crop   = 200 if "dbaas" in url.lower() else 30
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
        # Driver akan di-quit oleh celery_worker (sama seperti
        # oci_ilcs_backup.py) — bukan di sini, supaya tidak di-quit dua kali.
        pass

    log(f"Total captured: {len(saved_files)} — Generating Word report...")

    output_dir = "/app/shared/reports"
    os.makedirs(output_dir, exist_ok=True)
    doc_name = f"{output_dir}/pelindo_oci_pelindo_{TODAY}.docx"

    document = Document()
    document.add_heading(f"Oracle Backup Report Pelindo - {TODAY}", level=1)

    for i in range(0, len(saved_files), 2):
        table       = document.add_table(rows=2, cols=1)
        name1, img1 = saved_files[i]
        cell1       = table.rows[0].cells[0]
        cell1.add_paragraph(name1)
        cell1.paragraphs[-1].add_run().add_picture(img1, width=Inches(6))
        if i + 1 < len(saved_files):
            name2, img2 = saved_files[i + 1]
            cell2       = table.rows[1].cells[0]
            cell2.add_paragraph(name2)
            cell2.paragraphs[-1].add_run().add_picture(img2, width=Inches(6))
        document.add_page_break()

    document.save(doc_name)
    log(f"Report saved: {doc_name}")
    return f"DONE: {os.path.basename(doc_name)}"
