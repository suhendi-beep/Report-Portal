"""
tasks/pelindo/daily_ilcs_status.py
-- Daily Backup Status ILCS --
Migrated dari: status_backup_ilcs_pelindo.py

Requires: OCI CLI config di /root/.oci/ (mount dari ./oci_config)
Output: /app/shared/reports/pelindo_daily_status_YYYY-MM-DD.txt
"""
import subprocess, json, os
from datetime import datetime, timedelta, timezone


PROFILE_ILCS   = "DEFAULT"
PROFILE_PELINDO = "PELINDO-SIN"

# Compartment IDs per site
COMP_APPTOS        = "ocid1.compartment.oc1..aaaaaaaa4tgwottsjvkitvfkr7o6re7peql4hs2jibte2a4lmizyujpfgeyq"
COMP_T009_PROD     = "ocid1.compartment.oc1..aaaaaaaaq2kf2degttsbdwibcqth3ab5qnahm3shpu5javc5iad37gsbdeta"
COMP_BELAWAN_PROD  = "ocid1.compartment.oc1..aaaaaaaa2ljc3vauaol7oyio2qmfx2ijgn6fb73wjvetjx2555hu4qwbef6a"
COMP_TPM_PROD      = "ocid1.compartment.oc1..aaaaaaaao6sa4glvzydgw4a4tqjsz3w4izraihkn6x53m26tbnqcriakrixq"
COMP_TELUKBAYUR    = "ocid1.compartment.oc1..aaaaaaaafdrhbbsr7utuddunf2rgkrweklavoxr65dj6dgr4s2emd64ftj6q"

VOLUMES_ILCS = [
    ("TPK-009-WAS01 (Boot Volume)",     "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrhigqqnunxjj4reamy4pg6jszsmri5vhimytbzple377tlukongca",  COMP_T009_PROD),
    ("TPK-009-WAS01-sitectx",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrxnw7itanexusx3woqvz4e6zwqbodaullcg3afd26wje7ifwx64iq",      COMP_T009_PROD),
    ("TPK-009-MEMCACHE (Boot Volume)",  "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrhigqqnunxjj4reamy4pg6jszsmri5vhimytbzple377tlukongca",  COMP_T009_PROD),
    ("TPK-009-WAS01-sitelog",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljr4kgmjbesk6st5fwuxs4u2lpsh5k7tzcna7dzhbevit42wnvwcjtq",      COMP_T009_PROD),
    ("TPK-009-WAS01-wasarch",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrkwlnsfzycwp2a6axwq4uvxpqthis2657fghkvi7bi6wdsvpr36da",      COMP_T009_PROD),
    ("TPK-009-WAS02 (Boot Volume)",     "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrmwoz3sj5o54mv2g5qx5lpn2dcc6xtmxpp5xn4cchy76ikjgnf3oq",  COMP_T009_PROD),
    ("TPK-009-WAS02-sitectx",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrah4pgwoeqbntyz7dbdtlp2zqieprmtuh54abjkikhgwd7l2fuxpq",      COMP_T009_PROD),
    ("TPK-009-WAS02-sitelog",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljr6nwsnemvi6qatqp7dbgtlemykkxamdghis6lzwy35ogbu47flppa",      COMP_T009_PROD),
    ("TPK-009-WAS02-wasarch",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrbfb3jqy3hv55rm7iq5c6xhrz6dnd7olgozd5sy7ug2lptnxqx4yq",      COMP_T009_PROD),
    ("tos-memcache (Boot Volume)",      "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6htai5wsn6nte5e36yl4hrxh632huiqltvxhphngy6ecrhqsnjaa",  COMP_TPM_PROD),
    ("tosprod-instance-01 (Boot Volume)","boot", "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrlz7g42uxmhddjie6gqdxjqjwsv2o7jbxhtexascw2tczuwlvckja",  COMP_APPTOS),
    ("tos1_sitectx",                    "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrls3r6q63xd2q24rxhdaliov2ew42spor2hngpbz4lzhemn2pdsta",      COMP_APPTOS),
    ("tos1_sitelog",                    "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrzzcrorbxx3nryfvi7sawwjc2yv3xmy5t2iysxonye7oi6o5jysaa",      COMP_APPTOS),
    ("tos1_wasarch",                    "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrdoxhqikz2xf5g5lotagkddcpjfizanfpdcodubsojitxwjjayzfa",      COMP_APPTOS),
    ("tosprod-instance-02 (Boot Volume)","boot", "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrwtyp5a2bznpblmwefdof3jws6rf22si2qlqrkenjzidkjoy7eetq",  COMP_APPTOS),
    ("tos2_sitectx",                    "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrpszqf52au7xxqfvyqgxlry6322snpbeukjolak7wjyc2ou3hixra",      COMP_APPTOS),
    ("tos2_sitelog",                    "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrxjnsiylb4w4lrjc25qb3uwzie2me75gerfaw6r2syvajn3kurcya",      COMP_APPTOS),
    ("tos2_wasarch",                    "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljraz3ncu3orx5iy7kpprf5hmgvkr7iz2uwwewyukkkvya6zy65srca",      COMP_APPTOS),
    ("belawan-memcache (Boot Volume)",  "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrv7fottrvgmbwtqjjotrrivxjxymgdgg63cevux4kcgxbwndxtdmq",  COMP_BELAWAN_PROD),
    ("Belawan-tosprod-01 (Boot Volume)","boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrekcmj6fag6md6tog6bl6guctz5g3p2feb26tzr5skfmxoj372jfa",  COMP_BELAWAN_PROD),
    ("Belawan01-sitectx",               "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljryypgyzyaghornraa26pw7sck3cv4rl7wdjamv27hicylpbp22pla",      COMP_BELAWAN_PROD),
    ("Belawan01-sitelog",               "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrqxgqsidibdlzw2b7ide4vpggcq42nr6lmfvkbxq5gt7nffikk2ma",      COMP_BELAWAN_PROD),
    ("Belawan01-wasarch",               "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrk6ugiwpgkhlrl53xh7nouwyrolugxcxuqo434ris4t57tbllsqka",      COMP_BELAWAN_PROD),
    ("Belawan-tosprod-02 (Boot Volume)","boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6ywons3wn5okxp5tq4sc4x6hfg6ywahapxpuexhpit723azecp3a",  COMP_BELAWAN_PROD),
    ("Belawan02-sitectx",               "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrnlaweozuqrrhhekrfavf4el5sf6wh3sytw6jpnhyvoengyiutb2a",      COMP_BELAWAN_PROD),
    ("Belawan02-sitelog",               "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrje4mcvlq7okhxnswasrhtbodhvtdqfr6e6lrx7lpasrbok3kui4a",      COMP_BELAWAN_PROD),
    ("Belawan02-wasarch",               "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrnit33ras4epeo233p2gzcgabiool4px7zpjvurcbdiiztzkolaya",      COMP_BELAWAN_PROD),
    ("TPK-TOS-MEMCACHE (Boot Volume)",  "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr6xyrxdjwzkqz3gupkhlg76gmqhn62nia4pzrgjpm6xxi5wcfegiq",  COMP_TELUKBAYUR),
    ("TPK-TOS-WAS01 (Boot Volume)",     "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljrqx6cvgxjwkzk4dpfnqm5mh5bmbtt6nkjqnommd3othrnpu3lpjoa",  COMP_TELUKBAYUR),
    ("TPK-TOS-WAS01-sitectx",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrzpni7e6oyesqvlzr3giyh6zxw2mdmfvie5uq2bb5bvthx2wgsp2q",      COMP_TELUKBAYUR),
    ("TPK-TOS-WAS01-sitelog",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljruacmkap467mknksdvircw6lfti46advflqntvvzhjkto374jdb4q",      COMP_TELUKBAYUR),
    ("TPK-TOS-WAS01-wasarch",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljr76mlybznoescrqsqlcnbiddbjxfakpm3kncioq66nwdisd33yv5a",      COMP_TELUKBAYUR),
    ("TPK-TOS-WAS02 (Boot Volume)",     "boot",  "ocid1.bootvolume.oc1.ap-singapore-1.abzwsljr2wqlnclsrymeveqoslmqw7ur3tvpxjtwi5jxf37yfxhvd4vruhsq",  COMP_TELUKBAYUR),
    ("TPK-TOS-WAS02-sitectx",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrqci7xvgsjjimb34nlvq6eetrcktbzobadcm352gdz44z53hqa7da",      COMP_TELUKBAYUR),
    ("TPK-TOS-WAS02-sitelog",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrjgso2dyz6ia4warlthdyjhp2q4vfijbyhnlvpmzg236rfhql7gfa",      COMP_TELUKBAYUR),
    ("TPK-TOS-WAS02-wasarch",           "block", "ocid1.volume.oc1.ap-singapore-1.abzwsljrexi3tgxxl5gvwzcvuh4qtreqzzlwoxhwolmxv6ton7ofiqkhvlna",      COMP_TELUKBAYUR),
]

DATABASES_ILCS = [
    ("DBTOSBLW",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyayhb45sjeieethxvd5ukuqij4btl5w62h2pb2pbkbmnla"),
    ("dbtosjkttpk", "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyafw4kkstuqw7rgngg6cs6xfxjfc2yvojpqv436ujjactq"),
    ("DBTOSTPM",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyamlf3xp6ttrzc4wegunsfisyvzkia5avjx3tqpdqmdbpa"),
    ("DBTOSTBR",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyauklgsn7f62xihvmuz5xzq32fhnj3r5v5tb32hqvdccpa"),
    ("prayar2",   "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyanbf7wu7rji4klgfo2hk6qsf5emrcuai5m42af2ophpnq"),
    ("billdb",    "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyauh5xvxmtxxvhqwmzhj2f3lmz3qhl4omdsqijeqr6nxxq"),
    ("prayablw",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyab6vxpcvooxf4mla3xhbule573c54flgp7x7aledtc6uq"),
    ("prayatpk",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyanev43vjkl4ojl6utqvcbvtelnq2zumrn6phxtdwncdka"),
    ("custdb",    "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyapycubsyralwog3kq6qcwslzc5hmawscyf3h7pxfu534a"),
    ("phns",      "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyaadlpjobydlhq57b5gvz3lbw2rc5ium7nwngfav4z4m5a"),
    ("dbptosm",   "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcya7ijqcnsvvdm6zq7pljdo6zk4j3btr77hbicbdpjiebyq"),
    ("ptosc",     "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyagvjy5rd2shhqutffxo47m2pwwxavhebdncvhsxqa5kja"),
    ("ptor",      "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyap4pfziver6s6qrwimrduqrjsec3shhqlyl2c7rkohquq"),
    ("autogate",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyalkfsj4aq6mo34y7ld4cq6nzvsznx6dztg66x63zjed7q"),
    ("dbtoshub",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyatuwuzm3afc3etjz6ofa6nq5khiz6d2vkntldor46jdua"),
    ("pptospk",   "ocid1.database.oc1.ap-batam-1.anrguljrp7dotcyad3rvz3xqflqgjcf4kjlxszbb4nupgynnivetsipvdwva"),
    ("gpass",     "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyadeb2quaxvjewgb7vpq5bt4bull5o63yya6v6rhthy24a"),
    ("gatepass",  "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyat46kestvwusebulvqpd6s6polusyc6axnhrse3aomukq"),
    ("gate",      "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyavqxexgt75yrym3hng53dazetx74tfczlnytohdrlwqba"),
    ("ptosdev",   "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcya4f723dls2pifzieonn4is7pyrs3ume4lkmnhfajdwvua"),
    ("dtosdev",   "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyans2x7fc7ecq72o3we332spvcgfvho7h5cp63vhrh4kzq"),
    ("dbrepo",    "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyav2ts5za64g73ujvj6lybgfbqysmg3h6ofdxf3v6dytdq"),
    ("dbstag",    "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyajeqrtpzm5zymbljwia5r2y4v3ocesndcz66tihk2g6uq"),
    ("DBTOSQA",   "ocid1.database.oc1.ap-singapore-1.anzwsljrp7dotcyad4tlxuiagninoqgmydko7m7fovkq4bruuochsh2mwv7q"),
]

DATABASES_PELINDO = [
    ("madra",   "ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riascm3p7rdbzg2zstlpcnuoqc5an3ws45zhhhibuoyrfnq"),
    ("pancala", "ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2rialxqd3rdpby5yajtlou4l2kv4kxrb6scs74ri6ooplfwq"),
    ("hastina", "ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riawsduojbdiodiple5urxg3yiwyck3jq6jwvvsfl4bwbfa"),
    ("ayodya",  "ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riakgo4g2zqxofwj5pdlkrtylezwceoakyzohdzy3jtpt6q"),
    ("alengka", "ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riapgn55d3g5laxum5jsdcbwchfzagho3hjpjhctst4d3lq"),
    ("devpeo",  "ocid1.database.oc1.ap-singapore-1.anzwsljrgw2c2riaa6mqhng54s4cv2evjihbxeahqsx4y7djwhe44mekorua"),
]


def _run_cmd(cmd, log):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        log(f"Error: {cmd}\n{result.stderr}")
        return None
    return result.stdout


def run(log_path=None, args=None):
    def log(msg):
        if log_path:
            with open(log_path, "a") as f:
                f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        print(msg)

    now_wib     = datetime.now(timezone(timedelta(hours=7)))
    target_date = now_wib.date() - timedelta(days=1)
    window_start = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone(timedelta(hours=7)))
    window_end   = window_start + timedelta(days=1, hours=6)

    log(f"Checking backup period: {target_date} (WIB)")

    status_table    = []
    total_success   = 0
    total_failed    = 0
    total_inprogress = 0
    failed_list     = []

    # ── Volumes ──────────────────────────────────────────────
    log("=== BOOT & BLOCK VOLUME CHECK ===")
    for name, vol_type, ocid, comp_id in VOLUMES_ILCS:
        log(f"Checking: {name}")
        if vol_type == "boot":
            cmd = f"oci bv boot-volume-backup list --profile {PROFILE_ILCS} --boot-volume-id {ocid} --compartment-id {comp_id} --all"
        else:
            cmd = f"oci bv backup list --profile {PROFILE_ILCS} --volume-id {ocid} --compartment-id {comp_id} --all"

        output = _run_cmd(cmd, log)
        found  = False

        if output:
            data    = json.loads(output)
            backups = sorted(data.get("data", []), key=lambda x: x.get("time-created", ""), reverse=True)
            for backup in backups:
                tc = backup.get("time-created")
                if not tc:
                    continue
                finish_wib = datetime.fromisoformat(tc.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7)))
                if window_start <= finish_wib <= window_end:
                    found       = True
                    status      = backup.get("lifecycle-state", "UNKNOWN")
                    finish_str  = finish_wib.strftime("%H:%M")
                    tr = backup.get("time-request-received")
                    start_str   = datetime.fromisoformat(tr.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7))).strftime("%H:%M") if tr else "--"
                    if status == "AVAILABLE":
                        total_success += 1; short = "OK"
                    elif status == "FAILED":
                        total_failed += 1; failed_list.append(name); short = "FAIL"
                    else:
                        total_inprogress += 1; short = "RUN"
                    log(f"  {status} | Start: {start_str} | Finish: {finish_str}")
                    status_table.append((name, short, start_str, finish_str))
                    break

        if not found:
            log(f"  FAIL — Backup {target_date} tidak ditemukan")
            total_failed += 1; failed_list.append(name)
            status_table.append((name, "FAIL", "--", "--"))

    # ── Databases ─────────────────────────────────────────────
    for label, databases, profile in [
        ("ILCS", DATABASES_ILCS, PROFILE_ILCS),
        ("PELINDO", DATABASES_PELINDO, PROFILE_PELINDO),
    ]:
        log(f"\n=== DATABASE BACKUP CHECK ({label}) ===")
        for db_name, db_ocid in databases:
            region = "ap-batam-1" if db_name.lower() == "pptospk" else "ap-singapore-1"
            log(f"Checking: {db_name}")
            cmd    = f"oci db backup list --profile {profile} --database-id {db_ocid} --region {region} --all"
            output = _run_cmd(cmd, log)
            found  = False

            if not output:
                total_failed += 1; failed_list.append(db_name)
                status_table.append((db_name, "FAIL", "--", "--"))
                continue
            try:
                data = json.loads(output)
            except Exception:
                total_failed += 1; failed_list.append(db_name)
                status_table.append((db_name, "FAIL", "--", "--"))
                continue

            valid = [b for b in data.get("data", []) if b.get("time-ended")]
            if not valid:
                total_failed += 1; failed_list.append(db_name)
                status_table.append((db_name, "FAIL", "--", "--"))
                continue

            backups = sorted(valid, key=lambda x: x["time-ended"], reverse=True)
            for backup in backups:
                finish_wib = datetime.fromisoformat(backup["time-ended"].replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7)))
                if window_start <= finish_wib <= window_end:
                    found      = True
                    status     = backup.get("lifecycle-state", "UNKNOWN")
                    finish_str = finish_wib.strftime("%H:%M")
                    ts = backup.get("time-started")
                    start_str  = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7))).strftime("%H:%M") if ts else "--"
                    if status in ["ACTIVE", "COMPLETED"]:
                        total_success += 1; short = "OK"
                    elif status == "FAILED":
                        total_failed += 1; failed_list.append(db_name); short = "FAIL"
                    else:
                        total_inprogress += 1; short = "RUN"
                    log(f"  {status} | Start: {start_str} | Finish: {finish_str}")
                    status_table.append((db_name, short, start_str, finish_str))
                    break

            if not found:
                log(f"  FAIL — Backup {target_date} tidak ditemukan")
                total_failed += 1; failed_list.append(db_name)
                status_table.append((db_name, "FAIL", "--", "--"))

    # SUMMARY
    volume_total     = len(VOLUMES_ILCS)
    db_ilcs_total    = len(DATABASES_ILCS)
    db_pelindo_total = len(DATABASES_PELINDO)
    total_resource   = volume_total + db_ilcs_total + db_pelindo_total
    success_rate     = (total_success / total_resource) * 100 if total_resource else 0

    generated_str = now_wib.strftime("%Y-%m-%d %H:%M:%S") + " WIB"

    # STATUS
    if total_failed > 0:
        status_icon    = "🔴"
        overall_status = "CRITICAL"
    elif total_inprogress > 0:
        status_icon    = "🟡"
        overall_status = "WARNING"
    else:
        status_icon    = "🟢"
        overall_status = "HEALTHY"

    sep = "──────────────────────────────"

    summary  = "\n"
    summary += "=" * 40 + "\n"
    summary += "DAILY BACKUP REPORT SUMMARY\n"
    summary += "=" * 40 + "\n"
    summary += f"Period    : {target_date}\n"
    summary += f"Generated : {generated_str}\n\n"

    summary += f"RESOURCE {sep}\n"
    summary += f"💾 Volume           : {volume_total}\n"
    summary += f"🗄  Database ILCS    : {db_ilcs_total}\n"
    summary += f"🗄  Database Pelindo : {db_pelindo_total}\n"
    summary += f"📦 Total            : {total_resource}\n\n"

    summary += f"RESULT {sep}\n"
    summary += f"✅ Success       : {total_success}\n"
    summary += f"❌ Failed        : {total_failed}\n"
    summary += f"⏳ Progress      : {total_inprogress}\n"
    summary += f"📈 Success Rate  : {success_rate:.2f}%\n\n"

    summary += f"FAILED {sep}\n"
    if failed_list:
        for item in failed_list:
            summary += f"❌ {item}\n"
    else:
        summary += "✅ Tidak ada resource gagal\n"

    summary += f"\nSTATUS {sep}\n"
    summary += f"{status_icon} {overall_status}\n"

    log(summary)