"""
tasks/pelindo/oci_ilcs_backup.py
-- Weekly Backup Report OCI ILCS --

Run via automation hub dengan OCI credentials (inline login)
Output: /app/shared/reports/pelindo_oci_ilcs_YYYY-MM-DD.docx
"""
import io, os, time
from datetime import datetime
from io import BytesIO

from PIL import Image
from docx import Document
from docx.shared import Inches
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.support.ui import WebDriverWait

# ══════════════════════════════════════════════════════════════════════════════
# URL LIST - 30 ILCS Resources
# ══════════════════════════════════════════════════════════════════════════════
URL_LIST = [
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01 (Boot Volume)",        "https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr56nxvn5z6nzljql3mi6wzuvnvx7q5acequlafgij2wminmjzycra/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-MEMCACHE (Boot Volume)",     "https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrhigqqnunxjj4reamy4pg6jszsmri5vhimytbzple377tlukongca/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01-sitectx",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrxnw7itanexusx3woqvz4e6zwqbodaullcg3afd26wje7ifwx64iq/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01-sitelog",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljr4kgmjbesk6st5fwuxs4u2lpsh5k7tzcna7dzhbevit42wnvwcjtq/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS01-wasarch",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrkwlnsfzycwp2a6axwq4uvxpqthis2657fghkvi7bi6wdsvpr36da/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02 (Boot Volume)",        "https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrmwoz3sj5o54mv2g5qx5lpn2dcc6xtmxpp5xn4cchy76ikjgnf3oq/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02-sitectx",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrah4pgwoeqbntyz7dbdtlp2zqieprmtuh54abjkikhgwd7l2fuxpq/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02-sitelog",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljr6nwsnemvi6qatqp7dbgtlemykkxamdghis6lzwy35ogbu47flppa/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\nTPK-009-WAS02-wasarch",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrbfb3jqy3hv55rm7iq5c6xhrz6dnd7olgozd5sy7ug2lptnxqx4yq/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.ilcs.co.id\npalapareg2 - database",              "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyacoxli746f5tdv6qme7cadm2nlshl7yn3h4zwm4m74yta/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyabx7habqlschjvblndlp3h6dhsmonyaqqxcuzs52hghfq/ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyabx7habqlschjvblndlp3h6dhsmonyaqqxcuzs52hghfq/backups?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntos-memcache (Boot Volume)",      "https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6htai5wsn6nte5e36yl4hrxh632huiqltvxhphngy6ecrhqsnjaa/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntosprod-instance-01 (Boot Volume)","https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrlz7g42uxmhddjie6gqdxjqjwsv2o7jbxhtexascw2tczuwlvckja/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntos1_sitectx",                    "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrls3r6q63xd2q24rxhdaliov2ew42spor2hngpbz4lzhemn2pdsta/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntos1_sitelog",                    "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrzzcrorbxx3nryfvi7sawwjc2yv3xmy5t2iysxonye7oi6o5jysaa/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntos1_wasarch",                    "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrdoxhqikz2xf5g5lotagkddcpjfizanfpdcodubsojitxwjjayzfa/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntosprod-instance-02 (Boot Volume)","https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrwtyp5a2bznpblmwefdof3jws6rf22si2qlqrkenjzidkjoy7eetq/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntos2_sitectx",                    "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrpszqf52au7xxqfvyqgxlry6322snpbeukjolak7wjyc2ou3hixra/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntos2_sitelog",                    "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrxjnsiylb4w4lrjc25qb3uwzie2me75gerfaw6r2syvajn3kurcya/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ntos2_wasarch",                    "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljraz3ncu3orx5iy7kpprf5hmgvkr7iz2uwwewyukkkvya6zy65srca/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara.pelindo.co.id\ndbtostpm - Database",             "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcya7uq5wjsmhfjjc67nxygu5l6zf6devynusuvr6zyrahvq/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyamlf3xp6ttrzc4wegunsfisyvzkia5avjx3tqpdqmdbpa/ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyamlf3xp6ttrzc4wegunsfisyvzkia5avjx3tqpdqmdbpa/backups?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nbelawan-memcache (Boot Volume)", "https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrv7fottrvgmbwtqjjotrrivxjxymgdgg63cevux4kcgxbwndxtdmq/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan-tosprod-01 (Boot Volume)","https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrekcmj6fag6md6tog6bl6guctz5g3p2feb26tzr5skfmxoj372jfa/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan01-sitectx",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljryypgyzyaghornraa26pw7sck3cv4rl7wdjamv27hicylpbp22pla/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan01-sitelog",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrqxgqsidibdlzw2b7ide4vpggcq42nr6lmfvkbxq5gt7nffikk2ma/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan01-wasarch",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrk6ugiwpgkhlrl53xh7nouwyrolugxcxuqo434ris4t57tbllsqka/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan-tosprod-02 (Boot Volume)","https://cloud.oracle.com/block-storage/boot-volumes/ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6ywons3wn5okxp5tq4sc4x6hfg6ywahapxpuexhpit723azecp3a/boot-volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan02-sitectx",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrnlaweozuqrrhhekrfavf4el5sf6wh3sytw6jpnhyvoengyiutb2a/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan02-sitelog",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrje4mcvlq7okhxnswasrhtbodhvtdqfr6e6lrx7lpasrbok3kui4a/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\nBelawan02-wasarch",              "https://cloud.oracle.com/block-storage/volumes/ocid1.volume.oc1.ap-singapore-1.abzwsljrnit33ras4epeo233p2gzcgabiool4px7zpjvurcbdiiztzkolaya/volume-backups-tab?region=ap-singapore-1"),
    ("tos-nusantara2.pelindo.co.id\ndbtosblw - Database",            "https://cloud.oracle.com/dbaas/dbsystems/ocid1.dbsystem.oc1.ap-singapore-1.anzwsljrp7dotcyawsaj4echvpcu4bk22w5kvdad77qnbi47n3xfnahncwsq/databases/ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyayhb45sjeieethxvd5ukuqij4btl5w62h2pb2pbkbmnla/ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyayhb45sjeieethxvd5ukuqij4btl5w62h2pb2pbkbmnla/backups?region=ap-singapore-1"),
]


def run(log_path=None, args=None, driver=None):
    """
    Fungsi utama untuk capture backup ILCS
    
    Args:
        log_path: Path ke log file
        args: Dict arguments (tidak digunakan untuk sekarang)
        driver: Selenium WebDriver yang sudah login (dikirim dari celery_worker)
    
    Returns:
        String status result
    """
    def log(msg):
        if log_path:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        print(msg)

    # Driver sudah login dari celery_worker.py
    # Jadi tidak perlu login lagi di sini
    
    wait = WebDriverWait(driver, 60)
    saved_files = []
    TODAY = datetime.now().strftime("%Y-%m-%d")

    try:
        log("Session valid, starting capture...")

        for name, url in URL_LIST:
            short_name = name.split(chr(10))[1] if chr(10) in name else name
            log(f"Opening: {short_name}")
            try:
                # driver.set_page_load_timeout(45) di chrome_helper.py
                # membatasi driver.get() supaya tidak hang tanpa akhir
                # kalau halaman (terutama halaman database yang punya
                # widget/chart terus-menerus polling) tidak pernah
                # mencapai "load" event.
                driver.get(url)
                wait.until(lambda d: d.execute_script("return document.readyState") == "complete")

                # Optimized wait time (reduced from 8s to 3s)
                time.sleep(3)
                driver.execute_script("window.scrollTo(0,300)")

                # Optimized wait time (reduced from 5s to 2s)
                time.sleep(2)

                png   = driver.get_screenshot_as_png()
                image = Image.open(io.BytesIO(png))
                w, h  = image.size

                # Auto crop based on layout
                left_crop   = 200 if "dbaas" in url.lower() else 30
                top_crop    = 80
                right_crop  = max(w - 20, left_crop + 1)
                bottom_crop = max(h - 90, top_crop + 1)

                cropped = image.crop((left_crop, top_crop, right_crop, bottom_crop))
                stream  = BytesIO()
                cropped.save(stream, format="PNG")
                stream.seek(0)
                saved_files.append((name, stream))

                log(f"Captured: {short_name}")
            except (TimeoutException, WebDriverException) as e:
                # Satu resource lambat/error tidak boleh menggagalkan
                # seluruh report — lewati dan lanjut ke resource
                # berikutnya, supaya resource lain yang berhasil tetap
                # masuk ke laporan akhir.
                log(f"SKIPPED (timeout/error): {short_name} — {type(e).__name__}: {str(e)[:150]}")
                continue

    finally:
        # Driver akan di-quit oleh celery_worker
        pass

    log(f"Total captured: {len(saved_files)} — Generating Word report...")

    # Generate Word document
    output_dir = "/app/shared/reports"
    os.makedirs(output_dir, exist_ok=True)
    doc_name = f"{output_dir}/pelindo_oci_ilcs_{TODAY}.docx"

    document = Document()
    document.add_heading(f"Oracle Backup Report ILCS - {TODAY}", level=1)

    for i in range(0, len(saved_files), 2):
        table        = document.add_table(rows=2, cols=1)
        name1, img1  = saved_files[i]
        cell1        = table.rows[0].cells[0]
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
