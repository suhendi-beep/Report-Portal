from flask import Flask, jsonify, request
from flask_cors import CORS
import os, glob
from datetime import datetime
import oci_session

# ── Load secrets before Celery imports and configures Redis ──
from ssm_config import load_all_into_env

load_all_into_env()
from celery_worker import REDIS_URL, celery, run_automation, run_oci_login

app = Flask(__name__)
CORS(app)

# Grafana alerts cache — avoid repeated external calls
_grafana_cache = {"data": None, "ts": 0}
_GRAFANA_CACHE_TTL = 30  # detik — refresh tiap 30 detik

REGISTRY = {
    "pelindo": {
        "id": "pelindo", "name": "Pelindo", "platform": "OCI", "status": "active",
        "automations": [
            {
                "id": "grafana_capture",
                "name": "Weekly Capture Grafana HO",
                "description": "Screenshot semua dashboard Grafana HO dan generate PPTX",
                "schedule": "Weekly", "output_type": "pptx",
                "requires_oci_login": False,
                "args": [
                    {"key": "start_date", "label": "Start Date", "type": "date"},
                    {"key": "start_time", "label": "Start Time", "type": "time", "default": "00:00"},
                    {"key": "end_date",   "label": "End Date",   "type": "date"},
                    {"key": "end_time",   "label": "End Time",   "type": "time", "default": "23:59"},
                ],
            },
            {
                "id": "grafana_weekly_report",
                "name": "Weekly Grafana Report Pelindo",
                "description": "Screenshot semua dashboard Grafana Pelindo (GCP/OCI/Huawei/Alibaba) per minggu → ZIP",
                "schedule": "Weekly", "output_type": "zip",
                "requires_oci_login": False,
                "args": [
                    {"key": "week_num",   "label": "Week",       "type": "select", "default": "1",
                     "options": [{"value":"1","label":"Week 1"},{"value":"2","label":"Week 2"},
                                 {"value":"3","label":"Week 3"},{"value":"4","label":"Week 4"}]},
                    {"key": "month_num",  "label": "Month",      "type": "select",
                     "options": [
                         {"value":"1","label":"Januari"},{"value":"2","label":"Februari"},
                         {"value":"3","label":"Maret"},  {"value":"4","label":"April"},
                         {"value":"5","label":"Mei"},    {"value":"6","label":"Juni"},
                         {"value":"7","label":"Juli"},   {"value":"8","label":"Agustus"},
                         {"value":"9","label":"September"},{"value":"10","label":"Oktober"},
                         {"value":"11","label":"November"},{"value":"12","label":"Desember"},
                     ], "default": str(datetime.now().month)},
                    {"key": "year_num",   "label": "Year",       "type": "text",
                     "default": str(datetime.now().year)},
                    {"key": "start_date", "label": "Start Date", "type": "date"},
                    {"key": "start_time", "label": "Start Time", "type": "time", "default": "00:00"},
                    {"key": "end_date",   "label": "End Date",   "type": "date"},
                    {"key": "end_time",   "label": "End Time",   "type": "time", "default": "23:59"},
                ],
            },
            {
                "id": "oci_ilcs_backup",
                "name": "Weekly Backup Report OCI ILCS",
                "description": "Screenshot halaman backup OCI semua resource ILCS → Word report",
                "schedule": "Weekly", "output_type": "docx",
                "requires_oci_login": False,
                "requires_oci_credentials": True,
                "args": [],
            },
            {
                "id": "oci_pelindo_backup",
                "name": "Weekly Backup Report OCI Pelindo",
                "description": "Screenshot halaman backup OCI semua resource Pelindo → Word report",
                "schedule": "Weekly", "output_type": "docx",
                "requires_oci_login": False,
                "requires_oci_credentials": True,
                "args": [],
            },
            {
                "id": "daily_ilcs_status",
                "name": "Daily Backup Status ILCS",
                "description": "Cek status backup harian via OCI CLI — volume + database ILCS & Pelindo",
                "schedule": "Daily", "output_type": "report",
                "requires_oci_login": False, "args": [],
            },
        ],
    },
    "nikp": {
        "id": "nikp", "name": "NIKP", "platform": "AWS", "status": "active",
        "automations": [
            {
                "id": "nikp_monthly_report",
                "name": "Monthly Report NIKP",
                "description": "Generate laporan bulanan NIKP AWS — cost, usage, instance summary → PPTX",
                "schedule": "Monthly", "output_type": "pptx",
                "requires_oci_login": False,
                "args": [
                    {"key": "month", "label": "Month (YYYY-MM)", "type": "month",
                     "default": datetime.now().strftime("%Y-%m")},
                ],
            },
        ],
    },
}



# ── Ticket mapping untuk Grafana Alert ──
@app.route("/api/tickets/map", methods=["POST"])
def ticket_map():
    import json
    import hashlib

    data = request.json or {}
    key = (data.get("key") or "").strip()
    username = (data.get("username") or "unknown").strip()

    if not key:
        return jsonify({"error": "key diperlukan"}), 400

    ticket_file = "/app/shared/logs/alert_ticket_map.json"

    try:
        if os.path.exists(ticket_file):
            with open(ticket_file, "r") as f:
                mapping = json.load(f)
        else:
            mapping = {}
    except Exception:
        mapping = {}

    # Alert yang sama selalu mendapatkan ticket yang sama.
    if key in mapping:
        item = mapping[key]
        if isinstance(item, str):
            ticket = item
        else:
            ticket = item.get("ticket")
        if ticket:
            return jsonify({
                "ticket": ticket,
                "existing": True
            })

    # Counter ticket harian.
    today = datetime.now().strftime("%Y%m%d")
    counter_file = "/app/shared/logs/alert_ticket_counter.json"

    try:
        if os.path.exists(counter_file):
            with open(counter_file, "r") as f:
                counter = json.load(f)
        else:
            counter = {}
    except Exception:
        counter = {}

    if counter.get("date") != today:
        counter = {"date": today, "seq": 0}

    counter["seq"] = int(counter.get("seq", 0)) + 1
    ticket = f"INC-{today}-{counter['seq']:04d}"

    mapping[key] = {
        "ticket": ticket,
        "username": username,
        "created_at": datetime.now().isoformat()
    }

    os.makedirs(os.path.dirname(ticket_file), exist_ok=True)

    tmp = ticket_file + ".tmp"
    with open(tmp, "w") as f:
        json.dump(mapping, f, indent=2)
    os.replace(tmp, ticket_file)

    tmp = counter_file + ".tmp"
    with open(tmp, "w") as f:
        json.dump(counter, f, indent=2)
    os.replace(tmp, counter_file)

    return jsonify({
        "ticket": ticket,
        "existing": False
    }), 200

@app.route("/api/grafana/alerts")
def grafana_alerts():
    """Ambil semua alert dari dashboard Grafana (semua datasource). Cached 60s."""
    import urllib.request, base64, json, time
    from datetime import datetime, timezone

    now_ts = time.time()
    if _grafana_cache["data"] is not None and (now_ts - _grafana_cache["ts"]) < _GRAFANA_CACHE_TTL:
        return jsonify(_grafana_cache["data"])

    creds   = base64.b64encode(b"icscompute:icsW4tch!").decode()
    headers = {"Authorization": f"Basic {creds}", "Accept": "application/json"}
    now     = datetime.now(timezone.utc)
    result  = []

    def make_req(url):
        return urllib.request.Request(url, headers=headers)

    # ── 1. Prometheus datasources (OCI-ILCS, OCI-HO, GCP, Huawei) ──────────
    PROM_DATASOURCES = [
        {"folder": "OCI-ILCS", "uid": "bdy31xghxyh34d"},
        {"folder": "OCI-HO",   "uid": "deyx07ukt7nk0e"},
        {"folder": "GCP",      "uid": "eey4rwzgb9ibke"},
        {"folder": "Huawei",   "uid": "eey51w20ssn40e"},
    ]
    for ds in PROM_DATASOURCES:
        url = f"https://monitoring.ilcs.co.id/api/datasources/proxy/uid/{ds['uid']}/api/v1/alerts"
        try:
            with urllib.request.urlopen(make_req(url), timeout=10) as r:
                data = json.load(r)
            for a in data.get("data", {}).get("alerts", []):
                if a.get("state") not in ("firing", "pending"):
                    continue
                lbl          = a.get("labels", {})
                active_at    = a.get("activeAt", "")
                try:
                    dt           = datetime.fromisoformat(active_at.replace("Z", "+00:00"))
                    duration_min = (now - dt).total_seconds() / 60
                except Exception:
                    duration_min = 0
                result.append({
                    "name":         lbl.get("alertname", "Unknown"),
                    "folder":       ds["folder"],
                    "resource":     lbl.get("instance") or lbl.get("resourceName") or "-",
                    "severity":     lbl.get("severity", "-"),
                    "active_at":    active_at if active_at.endswith("Z") else active_at + "Z",
                    "duration_min": round(duration_min),
                    "duration_sec": round(max(0, (now - dt).total_seconds())),
                    "state":        a.get("state", "firing"),
                    "labels":       {k: v for k, v in lbl.items()
                                     if k not in ("alertname", "severity")
                                     and not k.startswith("__")},
                })
        except Exception:
            pass

    # ── 2. Grafana native alerts — replicate panel filters dari dashboard ───
    # Panel "Alert Non Prometheus": grafana_folder tidak mengandung DMDC atau alerts-BTP
    # Panel "Active Alerts - DMDC": alertname tidak mengandung "DMDCDEV"
    # Panel "Active Alerts - EIC": semua (tidak ada filter tambahan, tapi folder = alerts-BTP)
    url_native = "https://monitoring.ilcs.co.id/api/prometheus/grafana/api/v1/alerts"
    try:
        with urllib.request.urlopen(make_req(url_native), timeout=15) as r:
            data = json.load(r)
        import re
        for a in data.get("data", {}).get("alerts", []):
            if a.get("state") not in ("Alerting", "NoData"):
                continue
            if "[ALERT] Uptime - MCH ADHARA" in json.dumps(a, ensure_ascii=False):
                continue
            active_at_str = a.get("activeAt", "")
            try:
                dt           = datetime.fromisoformat(active_at_str.replace("Z", "+00:00"))
                duration_min = (now - dt).total_seconds() / 60
            except Exception:
                continue
            lbl    = a.get("labels", {})
            folder = lbl.get("grafana_folder", "-")
            aname  = lbl.get("alertname", "")

            # Replicate panel filter logic:
            # Panel "Alert Non Prometheus": folder bukan DMDC dan bukan alerts-BTP
            non_prom = (folder not in ("DMDC", "alerts-BTP"))
            # Panel "Active Alerts - DMDC": folder=DMDC, alertname tidak mengandung "DMDCDEV"
            dmdc_ok  = (folder == "DMDC" and not re.search(r"DMDCDEV", aname))
            # Panel "Active Alerts - EIC": folder=alerts-BTP
            eic_ok   = (folder == "alerts-BTP" and aname == "EIC")

            if not (non_prom or dmdc_ok or eic_ok):
                continue  # difilter keluar seperti di Grafana

            result.append({
                "name":         aname or "Unknown",
                "folder":       folder,
                "resource":     (lbl.get("resourceName") or lbl.get("hostName") or
                                 lbl.get("instance") or "-"),
                "severity":     lbl.get("severity", "-"),
                "active_at":    active_at_str if active_at_str.endswith("Z") else active_at_str + "Z",
                "duration_min": round(duration_min),
                "duration_sec": round(max(0, (now - dt).total_seconds())),
                "state":        a.get("state"),
                "labels":       {k: v for k, v in lbl.items()
                                 if k not in ("alertname", "grafana_folder", "severity")
                                 and not k.startswith("__")},
            })
    except Exception:
        pass

    result.sort(key=lambda x: -x["duration_min"])
    payload = {"alerts": result, "total": len(result)}
    _grafana_cache["data"] = payload
    _grafana_cache["ts"]   = now_ts
    return jsonify(payload)


@app.route("/api/ping")
def ping():
    return jsonify({"status": "ok"})


@app.route("/api/customers")
def get_customers():
    return jsonify([
        {"id": cid, "name": c["name"], "platform": c["platform"],
         "status": c["status"], "automation_count": len(c["automations"])}
        for cid, c in REGISTRY.items()
    ])


@app.route("/api/customers/<cid>")
def get_customer(cid):
    c = REGISTRY.get(cid)
    return jsonify(c) if c else (jsonify({"error": "Not found"}), 404)


@app.route("/api/run", methods=["POST"])
def trigger_run():
    data   = request.json or {}
    cid    = data.get("customer")
    aid    = data.get("automation")
    args   = data.get("args", {})

    if cid not in REGISTRY:
        return jsonify({"error": "Customer not found"}), 404
    auto = next((a for a in REGISTRY[cid]["automations"] if a["id"] == aid), None)
    if not auto:
        return jsonify({"error": "Automation not found"}), 404
    if auto.get("requires_oci_login") and not oci_session.cookies_exist():
        return jsonify({"error": "Belum login OCI. Gunakan tombol Login OCI terlebih dahulu.", "need_login": True}), 400

    # Automation yang butuh credentials inline
    if auto.get("requires_oci_credentials"):
        return jsonify({"need_credentials": True}), 200

    task = run_automation.delay(cid, aid, args)
    return jsonify({"task_id": task.id, "status": "queued", "queued_at": datetime.utcnow().isoformat()})


@app.route("/api/run_with_credentials", methods=["POST"])
def trigger_run_with_credentials():
    """Jalankan automation dengan login OCI inline (tanpa cookies)."""
    data    = request.json or {}
    cid     = data.get("customer")
    aid     = data.get("automation")
    args    = data.get("args", {})
    tenancy  = data.get("tenancy", "")
    username = data.get("username", "")
    password = data.get("password", "")

    if cid not in REGISTRY:
        return jsonify({"error": "Customer not found"}), 404
    auto = next((a for a in REGISTRY[cid]["automations"] if a["id"] == aid), None)
    if not auto:
        return jsonify({"error": "Automation not found"}), 404
    if not username or not password:
        return jsonify({"error": "Username dan password diperlukan"}), 400

    # Pass credentials ke args
    args["_tenancy"]  = tenancy
    args["_username"] = username
    args["_password"] = password

    from celery_worker import run_automation_with_login
    task = run_automation_with_login.delay(cid, aid, args)
    return jsonify({"task_id": task.id, "status": "queued", "queued_at": datetime.utcnow().isoformat()})


@app.route("/api/status/<task_id>")
def task_status(task_id):
    r = celery.AsyncResult(task_id)
    return jsonify({"task_id": task_id, "status": r.status, "result": r.result if r.ready() else None})


@app.route("/api/logs/<cid>/<aid>")
def get_logs(cid, aid):
    path = f"/app/shared/logs/{cid}_{aid}.log"
    if not os.path.exists(path):
        return jsonify({"logs": []})
    with open(path) as f:
        lines = f.readlines()
    return jsonify({"logs": lines[-300:]})


@app.route("/api/history")
def get_history():
    history = []
    for p in sorted(glob.glob("/app/shared/logs/*.log"), reverse=True):
        name = os.path.basename(p).replace(".log", "")
        if name.startswith("_"):
            continue
        parts = name.split("_", 1)
        if len(parts) != 2:
            continue
        stat = os.stat(p)
        history.append({
            "customer": parts[0], "automation": parts[1],
            "last_run": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "size_kb": round(stat.st_size / 1024, 1),
        })
    return jsonify(history)


@app.route("/api/files/<cid>")
def list_files(cid):
    results = {}
    for folder in ["reports", "screenshots"]:
        files = []
        for f in glob.glob(f"/app/shared/{folder}/{cid}_*"):
            stat = os.stat(f)
            files.append({
                "name": os.path.basename(f),
                "size_kb": round(stat.st_size / 1024, 1),
                "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "download": f"/api/download/{folder}/{os.path.basename(f)}",
            })
        results[folder] = sorted(files, key=lambda x: x["created"], reverse=True)
    return jsonify(results)


@app.route("/api/download/<folder>/<filename>")
def download_file(folder, filename):
    from flask import send_from_directory
    safe_folder = folder if folder in ["reports", "screenshots"] else "reports"
    return send_from_directory(f"/app/shared/{safe_folder}", filename, as_attachment=True)


# ── OCI Session ──────────────────────────────────────────────
@app.route("/api/oci/session")
def oci_status():
    info = oci_session.cookies_info()
    return jsonify({"logged_in": bool(info), **(info or {})})


@app.route("/api/oci/save_cookies", methods=["POST"])
def oci_save_cookies():
    """Simpan cookies dari export EditThisCookie."""
    import json as _json
    data = request.json or {}
    raw  = data.get("cookies", "")
    try:
        cookies = _json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(cookies, list):
            return jsonify({"error": "Format cookies tidak valid, harus array JSON"}), 400
        # Simpan ke file
        import os
        COOKIE_FILE = "/app/shared/cookies/oci_cookies.json"
        os.makedirs(os.path.dirname(COOKIE_FILE), exist_ok=True)
        from datetime import datetime
        _data = {"saved_at": datetime.now().isoformat(), "cookies": cookies}
        with open(COOKIE_FILE, "w") as f:
            _json.dump(_data, f, indent=2)
        return jsonify({"status": "ok", "count": len(cookies)})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/oci/login", methods=["POST"])
def oci_login():
    data = request.json or {}
    u, p = data.get("username", ""), data.get("password", "")
    tenancy = data.get("tenancy", "")
    if not u or not p:
        return jsonify({"error": "Username dan password diperlukan"}), 400
    from celery_worker import run_oci_login_with_otp
    task = run_oci_login_with_otp.delay(tenancy, u, p)
    return jsonify({"task_id": task.id, "status": "queued"})


@app.route("/api/oci/otp", methods=["POST"])
def oci_submit_otp():
    """Terima OTP dari frontend dan simpan ke Redis untuk diambil task."""
    data = request.json or {}
    task_id = data.get("task_id", "")
    otp     = data.get("otp", "")
    if not task_id or not otp:
        return jsonify({"error": "task_id dan otp diperlukan"}), 400
    import redis
    r = redis.from_url(REDIS_URL)
    r.setex(f"oci_login_otp:{task_id}", 120, otp)
    return jsonify({"status": "ok"})


@app.route("/api/oci/login_state/<task_id>")
def oci_login_state(task_id):
    """Cek state login — apakah butuh OTP, sukses, atau error."""
    import redis, json
    r   = redis.from_url(REDIS_URL)
    raw = r.get(f"oci_login_state:{task_id}")
    if raw:
        return jsonify(json.loads(raw))
    # Kalau belum ada state, cek Celery task result
    result = celery.AsyncResult(task_id)
    if result.ready():
        res = result.result or {}
        if isinstance(res, dict) and res.get("status") == "success":
            return jsonify({"state": "success", "cookies": res.get("cookies", 0)})
        return jsonify({"state": "error", "msg": str(res)})
    return jsonify({"state": "pending"})


@app.route("/api/oci/logout", methods=["POST"])
def oci_logout():
    oci_session.delete_cookies()
    return jsonify({"status": "ok"})


# ══════════════════════════════════════════════════════════
#  AUTH — Multi-user with roles
# ══════════════════════════════════════════════════════════
USERS = {
    "admin":         {"password": "admin2026!",  "role": "admin",    "display": "Admin"},
    "suhendi":       {"password": "m7Kx9pQ3nRvL2wZt", "role": "engineer", "display": "Suhendi"},
    "Priyanto":      {"password": "bF4hJeU8cYsA6dNp", "role": "engineer", "display": "Priyanto"},
    "neal.hotama":   {"password": "Tg5zXw1kMrD0qVjH", "role": "engineer", "display": "Neal Hotama"},
    "nazran.hisyami": {"password": "Wy2nLf6uBsC9eKoP", "role": "engineer", "display": "Nazran Hisyami"},
}

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data     = request.json or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    user     = USERS.get(username)
    if not user or user["password"] != password:
        return jsonify({"ok": False, "error": "Invalid username or password"}), 401
    return jsonify({
        "ok":      True,
        "username": username,
        "display":  user["display"],
        "role":     user["role"],
    })

@app.route("/api/auth/users")
def auth_users():
    """Return list of users (no passwords) — for admin UI."""
    return jsonify([
        {"username": u, "display": v["display"], "role": v["role"]}
        for u, v in USERS.items()
    ])


# ══════════════════════════════════════════════════════════
#  ACTIVITY LOG — Store / retrieve engineer activity
# ══════════════════════════════════════════════════════════
import json as _json

ACTIVITY_LOG_PATH = "/app/shared/logs/activity_log.json"

def _load_activity():
    try:
        with open(ACTIVITY_LOG_PATH) as f:
            return _json.load(f)
    except Exception:
        return []

def _save_activity(logs):
    os.makedirs(os.path.dirname(ACTIVITY_LOG_PATH), exist_ok=True)
    with open(ACTIVITY_LOG_PATH, "w") as f:
        _json.dump(logs, f, ensure_ascii=False, indent=2)

@app.route("/api/activity", methods=["GET"])
def get_activity():
    logs    = _load_activity()
    user    = request.args.get("user", "")
    date_from = request.args.get("from", "")
    date_to   = request.args.get("to",   "")
    if user:
        logs = [l for l in logs if l.get("username") == user]
    if date_from:
        logs = [l for l in logs if l.get("date", "") >= date_from]
    if date_to:
        logs = [l for l in logs if l.get("date", "") <= date_to]
    # newest first
    logs = sorted(logs, key=lambda x: x.get("ts", ""), reverse=True)
    return jsonify(logs)

@app.route("/api/activity", methods=["POST"])
def post_activity():
    data = request.json or {}
    logs = _load_activity()
    entry = {
        "id":       f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
        "ts":       datetime.utcnow().isoformat() + "Z",
        "date":     datetime.utcnow().strftime("%Y-%m-%d"),
        "username": data.get("username", "unknown"),
        "display":  data.get("display",  "Unknown"),
        "action":   data.get("action",   ""),
        "category": data.get("category", "general"),
        "detail":   data.get("detail",   ""),
    }
    logs.append(entry)
    if len(logs) > 5000:
        logs = logs[-5000:]
    _save_activity(logs)
    return jsonify({"ok": True, "id": entry["id"]})


# ══════════════════════════════════════════════════════════
#  DAILY TASKS — Shared across all users
# ══════════════════════════════════════════════════════════
TASKS_PATH = "/app/shared/logs/daily_tasks.json"

def _load_tasks():
    try:
        with open(TASKS_PATH) as f:
            return _json.load(f)
    except Exception:
        return []

def _save_tasks(tasks):
    os.makedirs(os.path.dirname(TASKS_PATH), exist_ok=True)
    with open(TASKS_PATH, "w") as f:
        _json.dump(tasks, f, ensure_ascii=False, indent=2)

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    tasks = _load_tasks()
    # optional filters
    date_filter = request.args.get("date", "")
    if date_filter:
        tasks = [t for t in tasks if (t.get("date","") or "").startswith(date_filter)]
    return jsonify(tasks)

@app.route("/api/tasks", methods=["POST"])
def create_task():
    data  = request.json or {}

    # Hanya PIC resmi yang boleh membuat Daily Task.
    allowed_pics = {
        "admin",
        "Suhendi",
        "Priyanto",
        "Neal Hotama",
        "Nazran Hisyami",
    }
    pic = (data.get("pic") or "").strip()
    is_generate_report = bool(data.get("generateReport"))

    tasks = _load_tasks()

    # ── Prevent duplicate ALERT tasks ──────────────────────────────
    # Auto-sync alert boleh dibuat tanpa PIC.
    # PIC akan diisi saat engineer klik "Laporkan".
    description = (data.get("description") or "").strip()
    is_alert = description.startswith("[ALERT]")
    alert_key = (data.get("alertKey") or "").strip()

    # Task manual tetap wajib menggunakan PIC resmi.
    # Task ALERT boleh PIC kosong, tetapi kalau diisi harus PIC resmi.
    if is_alert:
        if pic and pic not in allowed_pics:
            return jsonify({
                "error": "PIC tidak diizinkan",
                "pic": pic
            }), 403
    elif not is_generate_report and pic not in allowed_pics:
        return jsonify({
            "error": "PIC tidak diizinkan",
            "pic": pic
        }), 403

    if is_alert:
        for existing in tasks:
            existing_status = existing.get("status")
            if existing_status in ("Close", "Cancelled"):
                continue

            # Primary dedup: immutable alert occurrence key.
            # Ini mencegah duplicate walaupun frontend melakukan
            # POST lebih dari sekali.
            if alert_key and existing.get("alertKey") == alert_key:
                return jsonify(existing), 200

            # Backward compatibility untuk task alert lama.
            existing_desc = (existing.get("description") or "").strip()
            if not alert_key and existing_desc == description:
                return jsonify(existing), 200

    # auto taskNo
    max_no = 0
    for t in tasks:
        try:
            n = int((t.get("taskNo","TSK-000")).replace("TSK-",""))
            if n > max_no: max_no = n
        except: pass
    task_no = f"TSK-{str(max_no+1).padStart if False else str(max_no+1).zfill(3)}"
    task_no = f"TSK-{str(max_no+1).zfill(3)}"
    new_task = {
        "id":          data.get("id") or f"task_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
        "taskNo":      data.get("taskNo") or task_no,
        "customer":    data.get("customer", ""),
        "description": data.get("description", ""),
        "alertKey":    alert_key,
        "date":        data.get("date", ""),
        "start":       data.get("start", ""),
        "end":         data.get("end", ""),
        "pic":         data.get("pic", ""),
        "status":      data.get("status", "In Progress"),
        "detail":      data.get("detail", ""),
        "createdAt":   data.get("createdAt") or datetime.utcnow().isoformat() + "Z",
    }
    tasks.insert(0, new_task)
    _save_tasks(tasks)
    return jsonify(new_task), 201

@app.route("/api/tasks/<task_id>", methods=["PUT"])
def update_task(task_id):
    data  = request.json or {}
    tasks = _load_tasks()
    updated = None
    for i, t in enumerate(tasks):
        if t.get("id") == task_id:
            tasks[i] = {**t, **data, "id": task_id}
            updated  = tasks[i]
            break
    if not updated:
        return jsonify({"error": "Task not found"}), 404
    _save_tasks(tasks)
    return jsonify(updated)

@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    tasks = _load_tasks()
    new   = [t for t in tasks if t.get("id") != task_id]
    if len(new) == len(tasks):
        return jsonify({"error": "Task not found"}), 404
    _save_tasks(new)
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════
#  ALERT ESCALATION — Shared across all users
#  Prevents each engineer from seeing "belum dieskalasikan" for
#  an alert another engineer already reported.
# ══════════════════════════════════════════════════════════
ESKALASI_PATH = "/app/shared/logs/alert_eskalasi.json"

def _load_eskalasi():
    try:
        with open(ESKALASI_PATH) as f:
            return _json.load(f)
    except Exception:
        return {}

def _save_eskalasi(data):
    os.makedirs(os.path.dirname(ESKALASI_PATH), exist_ok=True)
    with open(ESKALASI_PATH, "w") as f:
        _json.dump(data, f, ensure_ascii=False, indent=2)

@app.route("/api/alerts/eskalasi", methods=["GET"])
def get_eskalasi():
    """Return { alert_key: { by, at } } for every alert reported so far."""
    return jsonify(_load_eskalasi())

@app.route("/api/alerts/eskalasi", methods=["POST"])
def mark_eskalasi():
    """Mark an alert as escalated/reported so every engineer sees it."""
    data = request.json or {}
    key  = data.get("key", "").strip()
    if not key:
        return jsonify({"error": "key diperlukan"}), 400
    store = _load_eskalasi()
    store[key] = {
        "by": data.get("by", ""),
        "at": datetime.utcnow().isoformat() + "Z",
    }
    _save_eskalasi(store)
    return jsonify({"ok": True, "key": key})


# ── Delete approval flow ──────────────────────────────────
DELETE_REQ_PATH = "/app/shared/logs/delete_requests.json"

def _load_delete_reqs():
    try:
        with open(DELETE_REQ_PATH) as f:
            return _json.load(f)
    except Exception:
        return []

def _save_delete_reqs(reqs):
    os.makedirs(os.path.dirname(DELETE_REQ_PATH), exist_ok=True)
    with open(DELETE_REQ_PATH, "w") as f:
        _json.dump(reqs, f, ensure_ascii=False, indent=2)

@app.route("/api/tasks/pending-deletes", methods=["GET"])
def pending_deletes():
    return jsonify(_load_delete_reqs())

@app.route("/api/tasks/<task_id>/request-delete", methods=["POST"])
def request_delete(task_id):
    data   = request.json or {}
    tasks  = _load_tasks()
    task   = next((t for t in tasks if t.get("id") == task_id), None)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    reqs   = _load_delete_reqs()
    # Avoid duplicate
    if any(r.get("task_id") == task_id for r in reqs):
        return jsonify({"ok": True, "status": "already_requested"})
    reqs.append({
        "task_id":     task_id,
        "task_desc":   task.get("description", ""),
        "task_no":     task.get("taskNo", ""),
        "requested_by": data.get("display", data.get("username", "unknown")),
        "username":    data.get("username", "unknown"),
        "requested_at": datetime.utcnow().isoformat() + "Z",
    })
    _save_delete_reqs(reqs)
    return jsonify({"ok": True, "status": "requested"})

@app.route("/api/tasks/<task_id>/approve-delete", methods=["POST"])
def approve_delete(task_id):
    data   = request.json or {}
    action = data.get("action", "approve")  # "approve" | "reject"
    reqs   = _load_delete_reqs()
    new_reqs = [r for r in reqs if r.get("task_id") != task_id]
    _save_delete_reqs(new_reqs)
    if action == "approve":
        tasks = _load_tasks()
        new   = [t for t in tasks if t.get("id") != task_id]
        _save_tasks(new)
    return jsonify({"ok": True, "action": action})


if __name__ == "__main__":
    # Debug mode exposes Flask's interactive debugger (remote code execution
    # risk) and must stay off in production. Opt in locally with FLASK_DEBUG=1.
    debug_mode = os.getenv("FLASK_DEBUG", "0").strip().lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=5000, debug=debug_mode)
