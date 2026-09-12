import React, { useState, useEffect, useCallback } from "react";
import { logActivity } from "../activityLog.js";
import { isAlertMuted, setAlertMuted, onAlertMuteChange } from "../alertMute.js";

/* ── Alert sound ── */
let alertAudioContext = null;

function playAlertSound() {
  if (isAlertMuted()) return;
  try {
    const audio = new Audio("/warning.mp3");
    audio.onerror = () => { new Audio("/alert.mp3").play().catch(()=>{}); };
    audio.volume = 0.8;
    audio.play().catch(() => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = "square"; osc.frequency.value = 880;
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      } catch(e2) {}
    });
  } catch(err) { console.warn("[ALERT SOUND]", err); }
}


/* ─── helpers ─────────────────────────────────────────── */
function nowWIB() {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
  });
}

function todayWIB() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function timeWIB(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateTimeWIB(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function fmtDur(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function fmtTime(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit", month: "short",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso.slice(0,16).replace("T"," "); }
}
function shortInstance(inst) {
  if (!inst || inst === "-") return "-";
  return inst.replace(/:\d+$/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}
function shortName(name) {
  return (name||"")
    .replace(/^Resource\s+/i, "")
    .replace(/^Uptime\s+-\s+/i, "Uptime - ")
    .replace(/^DatasourceNoData$/i, "Datasource No Data")
    .replace(/^\[ALERT\]\s*/i, "")
    .replace(/\s{2,}/g, " ").trim();
}

/* ─── folder display map ─────────────────────────────── */
const FOLDER_DISPLAY = {
  "DMDC":                 "DMDC",
  "OCI-ILCS":             "OCI-ILCS",
  "OCI-ILCS/YMS":         "OCI-ILCS/YMS",
  "Centralized/OCI - HO": "Centralized/OCI - HO",
  "alerts-BTP":           "alerts-BTP",
  "OCI-HO":               "OCI-HO",
  "GCP":                  "GCP",
  "Huawei":               "Huawei",
};
function folderDisplay(f) { return FOLDER_DISPLAY[f] || f; }

const FOLDER_COLORS = {
  "DMDC":                 "#F59E0B",
  "OCI-ILCS":             "#3B82F6",
  "OCI-ILCS/YMS":         "#06B6D4",
  "Centralized/OCI - HO": "#8B5CF6",
  "alerts-BTP":           "#EC4899",
  "OCI-HO":               "#A78BFA",
  "GCP":                  "#34D399",
  "Huawei":               "#F97316",
};
function folderColor(f) { return FOLDER_COLORS[f] || "#6B7280"; }

function getSeverity(name, sev) {
  // pakai severity dari label Prometheus kalau ada
  if (sev && sev !== "-") {
    const s = sev.toLowerCase();
    if (s.includes("critical")) return "critical";
    if (s.includes("warn"))     return "warning";
    if (s.includes("high"))     return "high";
    return s;
  }
  // fallback: detect dari nama alert
  const n = (name||"").toLowerCase();
  if (n.includes("critical") || n.includes("down") || n.includes("disk")) return "critical";
  if (n.includes("high") || n.includes("cpu") || n.includes("ram") || n.includes("memory")) return "high";
  if (n.includes("warn") || n.includes("utilization") || n.includes("uptime")) return "warning";
  return "info";
}
const SEV_COLOR = { critical:"#EF4444", high:"#F97316", warning:"#F59E0B", info:"#6B7280" };

function greetingByTime() {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false }).format(new Date()));
  if (h >= 5  && h < 12) return "pagi";
  if (h >= 12 && h < 15) return "siang";
  if (h >= 15 && h < 19) return "sore";
  return "malam";
}

/* ─── Ticket number generator ────────────────────────── */
const TICKET_KEY       = "pr_ticket_counter";
const TICKET_MAP_KEY   = "pr_alert_tickets"; // alertKey → ticketNumber

/** Generate nomor ticket dari backend/server */
async function generateTicketNumber() {
  const res = await fetch("/api/tickets/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Gagal generate ticket: HTTP ${res.status}`);
  }

  const data = await res.json();

  if (!data?.ticket) {
    throw new Error("Backend tidak mengembalikan nomor ticket");
  }

  return data.ticket;
}

/**
 * Ambil ticket untuk alert ini kalau sudah pernah dibuat,
 * atau generate baru dan simpan supaya konsisten dengan Daily Task.
 * Jika alert berulang dalam < 1 jam, kembalikan nomor lama (tidak generate baru).
 */
async function getOrCreateTicket(alertKey) {
  if (!alertKey) {
    throw new Error("alertKey diperlukan");
  }

  // Ticket dikelola server agar sama untuk semua user/laptop.
  const username = localStorage.getItem("username") || "unknown";

  const res = await fetch("/api/tickets/map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: alertKey,
      username,
    }),
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil ticket: HTTP ${res.status}`);
  }

  const data = await res.json();

  if (!data?.ticket) {
    throw new Error("Backend tidak mengembalikan nomor ticket");
  }

  // Cache lokal hanya untuk kompatibilitas UI lama.
  // Sumber utama ticket sekarang adalah server.
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(TICKET_MAP_KEY) || "{}");
  } catch {
    map = {};
  }

  map[alertKey] = data.ticket;
  localStorage.setItem(TICKET_MAP_KEY, JSON.stringify(map));

  if (!data.existing) {
    recordTicketCreated(alertKey);
  }

  return data.ticket;
}

function buildTemplate(a, ticketNum) {
  const sev      = getSeverity(a.name, a.severity);
  const inst     = a.resource && a.resource !== "-" ? a.resource : (a.labels?.instance || "-");
  const nodename = a.labels?.nodename || a.labels?.node || a.labels?.hostname || "-";
  const cluster  = a.labels?.cluster  || a.labels?.kubernetes_cluster || a.labels?.k8s_cluster || "-";
  const namespace= a.labels?.namespace || "-";
  const job      = a.labels?.job       || "-";

  // Bangun baris detail — hanya tampilkan yang ada nilainya (tidak "-")
  const lines = [
    `Folder     : ${folderDisplay(a.folder)}`,
    `Alertname  : ${shortName(a.name)}`,
    inst      !== "-" ? `Instance   : ${inst}`      : null,
    cluster   !== "-" ? `Cluster    : ${cluster}`   : null,
    `Severity   : ${sev.toUpperCase()}`,
    `Duration   : ${fmtDur(a.duration_min)}`,
    nodename  !== "-" ? `Nodename   : ${nodename}`  : null,
    namespace !== "-" ? `Namespace  : ${namespace}` : null,
    job       !== "-" ? `Job        : ${job}`        : null,
  ].filter(Boolean).join("\n");

  return `Selamat ${greetingByTime()} tim, izin menginformasikan saat ini terdapat alert

#Ticket     : ${ticketNum}

${lines}

Mohon untuk segera ditindaklanjuti. Terima kasih.`;
}

/* ─── Report Modal ─────────────────────────────────── */
function ReportModal({ alert, alreadyEskalasi, onClose, onEskalasi }) {
  const [copied, setCopied] = useState(false);
  const [ticket, setTicket] = useState("");

  // Ambil/buat ticket dari backend setelah modal dibuka
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const num = await getOrCreateTicket(alert._key);
        if (!cancelled) setTicket(num);
      } catch (err) {
        console.error("Gagal mengambil ticket:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [alert._key]);
  // Klik "Copy Template" berkali-kali dalam satu sesi modal yang sama harus
  // tetap bisa menyalin teksnya, tapi eskalasi + log activity hanya boleh
  // tercatat SEKALI — tanpa guard ini, "Alerts Escalated" di Engineer
  // Activity jadi lebih besar dari jumlah tiket unik yang benar-benar ada.
  const loggedRef = React.useRef(alreadyEskalasi);

  const text = buildTemplate(alert, ticket);

  const markDoneOnce = () => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    onEskalasi(alert._key, alert);
    logActivity(
      "Report Alert",
      "alert",
      [
        `Ticket: ${ticket}`,
        `Alert: ${shortName(alert.name)}`,
        `Folder: ${folderDisplay(alert.folder)}`,
        alert.resource && alert.resource !== "-" ? `Instance: ${alert.resource}` : null,
        (alert.labels?.nodename || alert.labels?.node) ? `Nodename: ${alert.labels?.nodename || alert.labels?.node}` : null,
        (alert.labels?.cluster || alert.labels?.kubernetes_cluster) ? `Cluster: ${alert.labels?.cluster || alert.labels?.kubernetes_cluster}` : null,
        `Severity: ${getSeverity(alert.name, alert.severity).toUpperCase()}`,
      ].filter(Boolean).join(" | ")
    );
  };

  const doCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const el = document.getElementById("laporkan-textarea");
      if (el) { el.select(); document.execCommand("copy"); }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, padding:20 }}
      onClick={onClose}>
      <div style={{ background:"var(--surface)", border:"1px solid var(--border2)", borderRadius:10,
        width:"100%", maxWidth:520, padding:0, overflow:"hidden" }}
        onClick={e => e.stopPropagation()}>

        {/* header */}
        <div style={{ display:"flex", alignItems:"center", gap:10,
          padding:"12px 16px", borderBottom:"1px solid var(--border)",
          background:"var(--bg3)" }}>
          <span style={{ fontSize:14 }}>📣</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text2)" }}>Report Alert</div>
            <div style={{ fontSize:10, color:"var(--muted)", marginTop:1 }}>Copy template and send to team</div>
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", color:"var(--muted)",
              fontSize:16, cursor:"pointer", lineHeight:1 }}>✕</button>
        </div>

        {/* alert info strip */}
        <div style={{ padding:"10px 16px", background:"rgba(177,18,38,.06)",
          borderBottom:"1px solid var(--border)", display:"flex", gap:10, flexWrap:"wrap",
          alignItems:"center" }}>
          <span style={{ fontSize:10, color:folderColor(alert.folder), fontWeight:700,
            background:folderColor(alert.folder)+"22", padding:"2px 8px", borderRadius:4 }}>
            {folderDisplay(alert.folder)}
          </span>
          <span style={{ fontSize:10, color:"var(--text3)", flex:1, minWidth:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {shortName(alert.name)}
          </span>
          <span style={{ fontSize:10, color:"#B11226", fontWeight:700, flexShrink:0 }}>
            ⏱ {fmtDur(alert.duration_min)}
          </span>
        </div>

        {/* ticket number row */}
        <div style={{ padding:"10px 16px", borderBottom:"1px solid var(--border)",
          display:"flex", alignItems:"center", gap:10 }}>
          <label style={{ fontSize:10, color:"var(--muted)", textTransform:"uppercase",
            letterSpacing:".07em", flexShrink:0, fontWeight:700 }}>
            No. Ticket
          </label>
          <input
            value={ticket}
            onChange={e => setTicket(e.target.value)}
            spellCheck={false}
            style={{ flex:1, background:"var(--bg3)", border:"1px solid var(--border2)",
              borderRadius:6, color:"#F59E0B", fontFamily:"'Courier New', monospace",
              fontSize:12, fontWeight:700, padding:"5px 10px", outline:"none",
              letterSpacing:".03em" }}
          />
          <button
            onClick={async () => {
              const num = await generateTicketNumber();
              // Simpan ke map supaya task juga update kalau di-sync ulang
              let map = {};
              try { map = JSON.parse(localStorage.getItem(TICKET_MAP_KEY) || "{}"); } catch {}
              map[alert._key] = num;
              localStorage.setItem(TICKET_MAP_KEY, JSON.stringify(map));
              setTicket(num);
            }}
            title="Generate nomor baru"
            style={{ background:"var(--surface2)", border:"1px solid var(--border2)", borderRadius:5,
              color:"var(--muted)", fontSize:11, padding:"5px 9px", cursor:"pointer",
              flexShrink:0, fontFamily:"inherit" }}>
            ↺
          </button>
        </div>

        {/* template text */}
        <div style={{ padding:"12px 16px" }}>
          <div style={{ fontSize:10, color:"var(--muted2)", marginBottom:6,
            textTransform:"uppercase", letterSpacing:".06em" }}>Template Pesan</div>
          <textarea id="laporkan-textarea" readOnly value={text}
            style={{ width:"100%", height:210, background:"var(--bg3)",
              border:"1px solid var(--border2)", borderRadius:6, color:"var(--text3)",
              fontFamily:"'Courier New', monospace", fontSize:11,
              padding:"10px 12px", resize:"none", outline:"none",
              boxSizing:"border-box", lineHeight:1.75 }}/>
        </div>

        {/* actions */}
        <div style={{ display:"flex", gap:10, padding:"0 16px 16px", alignItems:"center" }}>
          <button onClick={() => { doCopy(); markDoneOnce(); }}
            style={{ flex:1, background: copied ? "#15803D" : "#B11226",
              border:"none", borderRadius:6, color:"#fff",
              fontFamily:"inherit", fontSize:12, fontWeight:600,
              padding:"9px 0", cursor:"pointer", transition:"background .2s",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            {copied ? "✓ Reported!" : "📣 Report"}
          </button>
          <button onClick={onClose}
            style={{ background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:6, color:"var(--muted)", fontFamily:"inherit",
              fontSize:12, padding:"9px 16px", cursor:"pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Label badge colors ─────────────────────────────── */
const LABEL_COLORS = [
  "#3B82F6","#8B5CF6","#EC4899","#F97316","#06B6D4",
  "#84CC16","#F59E0B","#14B8A6","#6366F1","#EF4444",
];
function labelColor(key) {
  let h = 0;
  for (let i=0; i<key.length; i++) h = (h*31 + key.charCodeAt(i)) & 0xFFFFFF;
  return LABEL_COLORS[Math.abs(h) % LABEL_COLORS.length];
}

/* ─── Alert Row ──────────────────────────────────────── */
function AlertRow({ a, isNew, eskalasi, dismissed, onReport, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const fc      = folderColor(a.folder);
  const sev     = getSeverity(a.name, a.severity);
  const sc      = SEV_COLOR[sev];
  const done       = eskalasi.has(a._key);
  const isDismissed = dismissed ? dismissed.has(a._key) : false;
  const isOld   = a.duration_min > 720;
  const labels  = a.labels || {};
  // Label paling penting tampil langsung, sisanya di expand
  const PRIORITY = ["instance","nodename","node","cluster","namespace","deployment",
                    "job","service","resourceName","hostName","mountpoint","volume","pod"];
  const allLabelEntries = Object.entries(labels);
  const priorityEntries = allLabelEntries.filter(([k])=>PRIORITY.includes(k));
  const otherEntries    = allLabelEntries.filter(([k])=>!PRIORITY.includes(k));
  const visibleEntries  = [...priorityEntries, ...otherEntries].slice(0,4);
  const hiddenCount     = allLabelEntries.length - visibleEntries.length;

  const rowBg = isOld ? "var(--row-alt)" : isNew ? "rgba(239,68,68,.04)" : "none";

  return (
    <>
      <tr style={{ borderBottom: expanded ? "none" : "1px solid var(--border)",
        background: rowBg, opacity: isOld ? 0.6 : 1 }}>

        {/* alert name + expand toggle */}
        <td style={{ padding:"8px 10px", verticalAlign:"middle" }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:7 }}>
            <button onClick={()=>setExpanded(v=>!v)}
              style={{ background:"none", border:"none", color:"var(--muted2)",
                cursor:"pointer", fontSize:10, padding:"0 2px", flexShrink:0,
                lineHeight:1, marginTop:1 }}>
              {expanded ? "▾" : "▸"}
            </button>
            {isNew && !isOld && (
              <span style={{ width:7,height:7,borderRadius:"50%",background:"#EF4444",
                flexShrink:0,boxShadow:"0 0 6px #EF4444",
                animation:"pulse 1.2s infinite",marginTop:3 }}/>
            )}
            {isOld && (
              <span style={{ fontSize:9,fontWeight:700,color:"#5A3A3A",
                background:"#2A1A1A",border:"1px solid #3A1A1A",
                padding:"1px 5px",borderRadius:3,whiteSpace:"nowrap",flexShrink:0 }}>
                LONG
              </span>
            )}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11,fontWeight:600,
                color: isOld?"#555":isNew?"#F87171":"var(--text3)",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                {shortName(a.name)}
              </div>
              {/* label badges inline */}
              {visibleEntries.length > 0 && (
                <div style={{ display:"flex",flexWrap:"wrap",gap:3,marginTop:4 }}>
                  {visibleEntries.map(([k,v])=>{
                    const c = labelColor(k);
                    return (
                      <span key={k} style={{ fontSize:9,borderRadius:3,padding:"1px 5px",
                        background:c+"22",border:`1px solid ${c}44`,color:c,
                        whiteSpace:"nowrap",maxWidth:140,overflow:"hidden",
                        textOverflow:"ellipsis",display:"inline-block" }}
                        title={`${k}=${v}`}>
                        <span style={{opacity:.7}}>{k} </span>{v}
                      </span>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <span style={{ fontSize:9,color:"var(--muted)",padding:"1px 4px",
                      border:"1px solid var(--border2)",borderRadius:3 }}>
                      +{hiddenCount} more
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* folder */}
        <td style={{ padding:"8px 10px", verticalAlign:"top", paddingTop:10 }}>
          <span style={{ fontSize:10,fontWeight:700,
            color:isOld?"var(--muted3)":fc,background:isOld?"var(--surface2)":fc+"22",
            padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap" }}>
            {folderDisplay(a.folder)}
          </span>
        </td>

        {/* severity */}
        <td style={{ padding:"8px 10px", verticalAlign:"top", paddingTop:10 }}>
          {a.state==="NoData" ? (
            <span style={{ fontSize:10,fontWeight:700,color:"var(--muted)",
              background:"var(--surface2)",padding:"2px 7px",borderRadius:4 }}>NO DATA</span>
          ) : (
            <span style={{ fontSize:10,fontWeight:700,
              color:isOld?"var(--muted3)":sc,background:isOld?"var(--surface2)":sc+"22",
              padding:"2px 7px",borderRadius:4,textTransform:"uppercase" }}>
              {sev}
            </span>
          )}
        </td>

        {/* since */}
        <td style={{ padding:"8px 10px", verticalAlign:"top", paddingTop:10,
          color:isOld?"var(--muted3)":"var(--muted)", fontSize:10, whiteSpace:"nowrap" }}>
          {fmtTime(a.active_at)}
        </td>

        {/* duration */}
        <td style={{ padding:"8px 10px", verticalAlign:"top", paddingTop:10, textAlign:"right" }}>
          <span style={{ fontWeight:700,fontSize:11,whiteSpace:"nowrap",
            color:isOld?"#5A2A2A":a.duration_min>60?"#EF4444":"#F59E0B" }}>
            ⏱ {fmtDur(a.duration_min)}
          </span>
        </td>

        {/* action */}
        <td style={{ padding:"8px 10px", verticalAlign:"top", paddingTop:8, textAlign:"right" }}>
          {isDismissed ? (
            <span style={{ fontSize:10,color:"var(--muted3)",fontWeight:600,
              display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end" }}>
              <span>x</span> Dismissed
            </span>
          ) : done ? (
            <span style={{ fontSize:10,color:"#22C55E",fontWeight:600,
              display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end" }}>
              <span>v</span> Escalated
            </span>
          ) : (
            <div style={{ display:"flex",gap:4,justifyContent:"flex-end" }}>
              <button onClick={()=>onReport(a)}
                style={{ background:isOld?"rgba(60,30,30,.4)":"rgba(177,18,38,.15)",
                  border:isOld?"1px solid #3A1A1A":"1px solid #B11226",
                  borderRadius:5,color:isOld?"#5A3A3A":"#F87171",
                  fontFamily:"inherit",fontSize:10,fontWeight:600,
                  padding:"4px 8px",cursor:"pointer",whiteSpace:"nowrap" }}
                onMouseEnter={e=>e.currentTarget.style.background=isOld?"rgba(60,30,30,.7)":"rgba(177,18,38,.3)"}
                onMouseLeave={e=>e.currentTarget.style.background=isOld?"rgba(60,30,30,.4)":"rgba(177,18,38,.15)"}>
                Report
              </button>
              <button onClick={()=>onDismiss(a)}
                title="Dismiss - Cancelled, no ticket"
                style={{ background:"rgba(100,100,120,.1)",border:"1px solid rgba(100,100,120,.3)",
                  borderRadius:5,color:"var(--muted)",fontFamily:"inherit",fontSize:10,fontWeight:600,
                  padding:"4px 8px",cursor:"pointer",whiteSpace:"nowrap" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(100,100,120,.25)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(100,100,120,.1)"}>
                Dismiss
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* ── Expanded: semua label ── */}
      {expanded && (
        <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--bg3)" }}>
          <td colSpan={6} style={{ padding:"8px 14px 10px 30px" }}>
            <div style={{ fontSize:9,color:"var(--muted2)",marginBottom:5,
              textTransform:"uppercase",letterSpacing:".08em" }}>
              All Labels
            </div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
              {allLabelEntries.map(([k,v])=>{
                const c = labelColor(k);
                return (
                  <span key={k} style={{ fontSize:9,borderRadius:3,padding:"2px 7px",
                    background:c+"22",border:`1px solid ${c}55`,color:c,
                    whiteSpace:"nowrap",maxWidth:280,overflow:"hidden",
                    textOverflow:"ellipsis",display:"inline-block" }}
                    title={`${k}=${v}`}>
                    <span style={{opacity:.65,fontWeight:600}}>{k}</span>
                    <span style={{color:"var(--muted)"}}> = </span>
                    {v}
                  </span>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Ringtone playback itself now lives in components/AlertWatcher.jsx, which
// is mounted globally in App.jsx so it keeps ringing on every page — not
// just while this Alert Monitor page happens to be open. This page only
// reads/writes the shared mute flag via alertMute.js.

// Urutan folder sesuai format handover
const REPORT_FOLDER_ORDER = [
  "OCI-ILCS", "OCI-HO", "GCP", "Huawei",
  "Centralized/OCI - HO", "alerts-BTP", "DMDC", "OCI-ILCS/YMS",
];
const REPORT_FOLDER_LABELS = {
  "OCI-ILCS":             "Alert OCI ILCS",
  "OCI-HO":               "Alert OCI HO",
  "GCP":                  "Alert GCP",
  "Huawei":               "Alert Huawei",
  "Centralized/OCI - HO": "Alert Non Prometheus",
  "alerts-BTP":           "Alert EIC",
  "DMDC":                 "Alert DMDC",
  "OCI-ILCS/YMS":         "Alert OCI ILCS/YMS",
};

function fmtDateForReport(dateStr, shift) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" });
  } catch { return dateStr; }
}

async function buildDailyReport(alerts, opts) {
  const { tanggal, shift, engineer, closedTickets, backupStatus } = opts;
  const shiftLabel = shift === "1" ? "Shift 1 ( 09:00 - 21:00)" : "Shift 2 ( 21:00 - 09:00)";

  // Ambil task ALERT dari backend agar Daily Report juga mengetahui
  // task yang masih Pending. Sumber ticket tetap dari task yang sudah ada.
  let alertTasks = [];
  try {
    const taskRes = await fetch("/api/tasks");
    if (taskRes.ok) {
      const data = await taskRes.json();
      if (Array.isArray(data)) {
        alertTasks = data.filter(t =>
          String(t?.description || "").startsWith("[ALERT]")
        );
      }
    }
  } catch (err) {
    console.warn("Gagal mengambil task ALERT untuk Daily Report:", err);
  }

  // Task ALERT yang masih Pending.
  // Jangan membuat ticket baru di sini.
  const pendingAlertTasks = alertTasks.filter(t => t.status === "Pending");

  // group by folder
  const byFolder = {};
  for (const a of alerts) {
    if (!byFolder[a.folder]) byFolder[a.folder] = [];
    byFolder[a.folder].push(a);
  }

  // semua folder dari order list
  const allReportFolders = [
    ...REPORT_FOLDER_ORDER,
    ...Object.keys(byFolder).filter(f => !REPORT_FOLDER_ORDER.includes(f)),
  ];

  let detail = "";
  let totalAlert = 0;
  for (const folder of allReportFolders) {
    const label = REPORT_FOLDER_LABELS[folder] || `Alert ${folder}`;
    const items = byFolder[folder] || [];
    totalAlert += items.length;
    detail += `${label}\n`;
    if (items.length === 0) {
      detail += `- (tidak ada alert)\n`;
    } else {
      for (const a of items) {
        const res  = a.resource && a.resource !== "-" ? a.resource : "";
        const time = a.active_at ? ` [${fmtTime(a.active_at)}]` : "";
        // Ambil nomor ticket. Jika endpoint ticket gagal, jangan gagalkan seluruh Daily Report.
        const alertKey = `${a.name}||${a.resource}||${a.active_at}`;
        let ticketNum = "";
        try {
          ticketNum = await getOrCreateTicket(alertKey);
        } catch (err) {
          console.warn("Ticket map tidak tersedia, Daily Report tetap dibuat:", err);
          try {
            const cached = JSON.parse(localStorage.getItem(TICKET_MAP_KEY) || "{}");
            ticketNum = cached[alertKey] || "";
          } catch {
            ticketNum = "";
          }
        }
        const ticketStr = ticketNum ? ` [${ticketNum}]` : "";
        detail += `* ${shortName(a.name)}${res ? " -> " + res : ""}${ticketStr}${time}\n`;
      }
    }
    detail += "\n";
  }

  // ── Alert Pending ──
  let pendingSection = "";
  if (pendingAlertTasks.length > 0) {
    pendingSection = `\\n*2. Alert Pending*\\nTotal : ${pendingAlertTasks.length}\\n\\n`;

    pendingAlertTasks.forEach((t, i) => {
      const ticketNum =
        String(t.detail || "").match(/INC-\d{8}-\d{4}/i)?.[0] || "-";

      const desc = String(t.description || "")
        .replace(/^\\[ALERT\\]\\s*/, "")
        .trim();

      const pic = t.pic ? ` | PIC: ${t.pic}` : " | PIC: -";

      pendingSection += `${i + 1}. ${ticketNum} | ${desc}${pic}\\n`;
    });
  } else {
    pendingSection = `\\n*2. Alert Pending*\\nTotal : 0\\n- (tidak ada alert pending)\\n`;
  }

  // ── Ticket Close ──
  let ticketSection = "";
  if (closedTickets && closedTickets.length > 0) {
    ticketSection = `\n*2. Ticket Close*\nTotal : ${closedTickets.length}\n\n`;
    closedTickets.forEach((t, i) => {
      const ticketNum =
        t.ticket ||
        String(t.detail || "").match(/INC-\d{8}-\d{4}/i)?.[0] ||
        "-";
      ticketSection += `${i + 1}. ${ticketNum}\n`;
    });
  } else {
    ticketSection = `\n*2. Ticket Close*\nTotal : 0\n- (tidak ada ticket close shift ini)\n`;
  }

  // ── Daily Backup Status ──
  let backupSection = "";
  if (backupStatus) {
    const { total, success, failed, rate, health, period, generated, fetchedAt } = backupStatus;
    const icon = health === "HEALTHY" ? "🟢" : health === "WARNING" ? "🟡" : health ? "🔴" : "";
    // Tanggal period yang dicek
    const periodStr = period || (fetchedAt ? new Date(fetchedAt).toISOString().slice(0,10) : "-");
    // Waktu generate dari log, fallback ke fetchedAt
    const generatedStr = generated || (fetchedAt
      ? new Date(fetchedAt).toLocaleString("id-ID", { timeZone:"Asia/Jakarta", day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) + " WIB"
      : "-");
    backupSection = `\n*3. Status Daily Backup*\n`;
    backupSection += `Periode      : ${periodStr}\n`;
    backupSection += `Generate     : ${generatedStr}\n`;
    backupSection += `Status       : ${icon} ${health || "-"}\n`;
    backupSection += `Total        : ${total ?? "-"}\n`;
    backupSection += `Success      : ${success ?? "-"}\n`;
    backupSection += `Failed       : ${failed ?? "-"}\n`;
    backupSection += `Success Rate : ${rate ?? "-"}\n`;
  } else {
    backupSection = `\n*3. Status Daily Backup*\n- (data belum tersedia)\n`;
  }

  const sep  = "━━━━━━━━━━━━━━━━";
  const sep2 = "━━━━━━━━━━";
  return `*Daily Report | Handover Monitoring standby*
${sep}
Tanggal  : ${tanggal || "(isi tanggal)"}
Shift    : ${shiftLabel}
Engineer : ${engineer || "(isi nama)"}
${sep2}
*1. Grafana Alert*
Total Alert : ${totalAlert}

Detail:
${detail.trimEnd()}
${pendingSection.trimEnd()}
${ticketSection.trimEnd()}
${backupSection.trimEnd()}
${sep2}`;
}

function DailyReportModal({ alerts, onClose }) {
  const today = todayWIB();
  const [tanggal,       setTanggal]       = useState(today);
  const [shift,         setShift]         = useState("malam");
  const [engineer,      setEngineer]      = useState(
    sessionStorage.getItem("pr_display") || sessionStorage.getItem("pr_user") || ""
  );
  const [copied,        setCopied]        = useState(false);
  const [closedTickets, setClosedTickets] = useState([]);

  // ============================================================
  // TICKET CLOSE UNTUK DAILY REPORT
  //
  // Shift 1 : tanggal 09:00 -> 21:00
  // Shift 2 : tanggal 21:00 -> H+1 09:00
  //
  // Sumber utama: /api/tasks
  // Hanya task ALERT dengan status Close yang dihitung.
  // ============================================================
  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) throw new Error("Gagal mengambil tasks");

        const tasks = await res.json();
        if (!Array.isArray(tasks)) {
          setClosedTickets([]);
          return;
        }

        const alertClosed = tasks.filter(t =>
          t?.status === "Close" &&
          /INC-\d{8}-\d{4}/i.test(String(t?.detail || ""))
        );

        // Ambil timestamp close.
        // Auto-close menyimpan waktu pada end, tetapi tanggal task
        // adalah tanggal ketika task dibuat.
        const parseTaskClose = (t) => {
          const date = String(t?.date || "").slice(0, 10);
          const end = String(t?.end || "").trim();

          if (!date || !end) return null;

          // Format end biasanya HH.MM
          const m = end.match(/^(\d{1,2})[.:](\d{2})$/);
          if (!m) return null;

          const hh = Number(m[1]);
          const mm = Number(m[2]);

          if (hh > 23 || mm > 59) return null;

          // Buat timestamp lokal Jakarta.
          return new Date(
            `${date}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00+07:00`
          );
        };

        // Boundary shift dalam waktu Jakarta.
        const base = new Date(
          `${tanggal}T00:00:00+07:00`
        );

        let shiftStart;
        let shiftEnd;

        if (shift === "1") {
          // 09:00 -> 21:00 hari yang sama
          shiftStart = new Date(base);
          shiftStart.setHours(9, 0, 0, 0);

          shiftEnd = new Date(base);
          shiftEnd.setHours(21, 0, 0, 0);
        } else {
          // Shift 2 pada report tanggal 5 September berarti:
          // 21:00 tanggal 4 -> 09:00 tanggal 5.
          shiftStart = new Date(base);
          shiftStart.setDate(shiftStart.getDate() - 1);
          shiftStart.setHours(21, 0, 0, 0);

          shiftEnd = new Date(base);
          shiftEnd.setHours(9, 0, 0, 0);
        }

        const filtered = alertClosed
          .map(t => {
            const closeTime = parseTaskClose(t);

            const ticket =
              String(t?.detail || "")
                .match(/Ticket\s*:\s*(INC-\d{8}-\d{4})/i)?.[1] || "";

            return {
              ...t,
              ticket,
              closeTime,
            };
          })
          .filter(t => {
            if (!t.closeTime) return false;

            // start inclusive, end exclusive
            return (
              t.closeTime >= shiftStart &&
              t.closeTime < shiftEnd
            );
          })
          .sort((a, b) => a.closeTime - b.closeTime);

        setClosedTickets(filtered);

        console.log(
          "[DAILY REPORT] Ticket Close",
          {
            tanggal,
            shift,
            start: shiftStart.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
            end: shiftEnd.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
            total: filtered.length,
            tickets: filtered.map(t => t.ticket),
          }
        );

      } catch (err) {
        console.error("Gagal mengambil ticket close:", err);
        setClosedTickets([]);
      }
    };

    fetchTickets();
  }, [tanggal, shift]);

  const [backupStatus,  setBackupStatus]  = useState(() => {
    // Langsung baca dari cache — hasil generate terakhir siapapun yang run
    try {
      const cached = localStorage.getItem("pr_backup_status_cache");
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });

  // Fetch terbaru dari log sebagai update (tidak blocking — cache sudah terisi)
  useEffect(() => {
    fetch("/api/logs/pelindo/daily_ilcs_status")
      .then(r => r.json())
      .then(d => {
        const full = (d.logs || []).join("\n");
        // File log menumpuk terus lintas run (append, bukan overwrite).
        // Ambil hanya blok SUMMARY paling akhir — kalau tidak, .match() bisa
        // menangkap ringkasan run lama yang masih ikut dalam 300 baris terakhir.
        const summaryIdx = full.lastIndexOf("DAILY BACKUP REPORT SUMMARY");
        const text = summaryIdx !== -1 ? full.slice(summaryIdx) : full;
        const total   = text.match(/📦 Total\s*:\s*(\d+)/)?.[1]   || text.match(/Total\s*:\s*(\d+)/)?.[1];
        const success = text.match(/✅ Success\s*:\s*(\d+)/)?.[1]  || text.match(/Success\s*:\s*(\d+)/)?.[1];
        const failed  = text.match(/❌ Failed\s*:\s*(\d+)/)?.[1]   || text.match(/Failed\s*:\s*(\d+)/)?.[1];
        const rate    = text.match(/📈 Success Rate\s*:\s*([\d.]+%)/)?.[1] || text.match(/Success Rate\s*:\s*([\d.]+%)/)?.[1];
        const health  = text.match(/\b(HEALTHY|CRITICAL|WARNING)\b/)?.[0];
        const period    = text.match(/Period\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1]    || null;
        const generated = text.match(/Generated\s*:\s*([\d-]+ [\d:]+ WIB)/)?.[1] || null;
        if (total || success || failed) {
          const parsed = { total, success, failed, rate, health, period, generated, fetchedAt: new Date().toISOString() };
          setBackupStatus(parsed);
          try { localStorage.setItem("pr_backup_status_cache", JSON.stringify(parsed)); } catch(_){}
        }
      })
      .catch(() => {});
  }, []);

  const [text, setText] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await buildDailyReport(alerts, {
          tanggal: fmtDateForReport(tanggal, shift), shift, engineer,
          closedTickets, backupStatus,
        });
        if (!cancelled) setText(result);
      } catch (err) {
        console.error("Gagal membuat daily report:", err);
        if (!cancelled) setText("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [alerts, tanggal, shift, engineer, closedTickets, backupStatus]);

  const doCopy = () => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(()=>setCopied(false),2000);
        logActivity("Copy Daily Report", "report", `Shift ${shift} — ${tanggal}`);
      })
      .catch(() => {
        const el = document.getElementById("dr-textarea");
        if (el) { el.select(); document.execCommand("copy"); }
        setCopied(true); setTimeout(()=>setCopied(false),2000);
      });
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.8)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, padding:20 }}
      onClick={onClose}>
      <div style={{ background:"var(--surface)", border:"1px solid var(--border2)", borderRadius:10,
        width:"100%", maxWidth:640, maxHeight:"90vh", display:"flex",
        flexDirection:"column", overflow:"hidden" }}
        onClick={e=>e.stopPropagation()}>

        {/* header */}
        <div style={{ display:"flex", alignItems:"center", gap:10,
          padding:"12px 16px", borderBottom:"1px solid var(--border)", background:"var(--bg3)", flexShrink:0 }}>
          <span style={{ fontSize:14 }}>📋</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--text2)" }}>Daily Report — Handover Monitoring</div>
            <div style={{ fontSize:10, color:"var(--muted)", marginTop:1 }}>Generate & copy template laporan harian</div>
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", color:"var(--muted)",
              fontSize:16, cursor:"pointer" }}>✕</button>
        </div>

        {/* form */}
        <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)",
          display:"flex", gap:12, flexWrap:"wrap", flexShrink:0 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:4, flex:1, minWidth:140 }}>
            <label style={{ fontSize:9, color:"var(--muted2)", textTransform:"uppercase",
              letterSpacing:".06em" }}>Tanggal</label>
            <input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)}
              style={{ background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:6,
                color:"var(--text3)", fontSize:11, padding:"5px 8px", fontFamily:"inherit",
                outline:"none" }}/>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, flex:1, minWidth:140 }}>
            <label style={{ fontSize:9, color:"var(--muted2)", textTransform:"uppercase",
              letterSpacing:".06em" }}>Shift</label>
            <select value={shift} onChange={e=>setShift(e.target.value)}
              style={{ background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:6,
                color:"var(--text3)", fontSize:11, padding:"5px 8px", fontFamily:"inherit",
                outline:"none" }}>
              <option value="1">Shift 1 (09:00-21:00)</option>
              <option value="malam">Shift 2 (21:00-09:00)</option>
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4, flex:1, minWidth:140 }}>
            <label style={{ fontSize:9, color:"var(--muted2)", textTransform:"uppercase",
              letterSpacing:".06em" }}>Nama Engineer</label>
            <input value={engineer} onChange={e=>setEngineer(e.target.value)}
              placeholder="Nama engineer..."
              style={{ background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:6,
                color:"var(--text3)", fontSize:11, padding:"5px 8px", fontFamily:"inherit",
                outline:"none" }}/>
          </div>
          {/* Info row: ticket close + backup status */}
          <div style={{ width:"100%", display:"flex", gap:8, flexWrap:"wrap", marginTop:2 }}>
            <span style={{ fontSize:10, color:"var(--muted)",
              background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:5,
              padding:"3px 10px" }}>
              🎫 Ticket close shift ini: <strong style={{color:"#22C55E"}}>{closedTickets.length}</strong>
              <span style={{color:"var(--muted3)",fontSize:9,marginLeft:4}}>
                {shift==="1" ? "(09:00–21:00)" : "(21:00–09:00)"}
              </span>
            </span>
            {backupStatus ? (
              <span style={{ fontSize:10,
                color: backupStatus.health==="HEALTHY" ? "#22C55E"
                     : backupStatus.health==="WARNING"  ? "#F59E0B" : "#EF4444",
                background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:5,
                padding:"3px 10px" }}>
                💾 Backup ILCS: {backupStatus.health} ({backupStatus.success}/{backupStatus.total})
                {backupStatus.fetchedAt && (
                  <span style={{ color:"var(--muted3)", marginLeft:6, fontSize:9 }}>
                    · {new Date(backupStatus.fetchedAt).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ fontSize:10, color:"var(--muted2)",
                background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:5,
                padding:"3px 10px" }}>
                💾 Backup ILCS: loading…
              </span>
            )}
          </div>
        </div>

        {/* preview */}
        <div style={{ flex:1, overflow:"auto", padding:"12px 16px" }}>
          <div style={{ fontSize:9, color:"var(--muted2)", marginBottom:6,
            textTransform:"uppercase", letterSpacing:".06em" }}>Preview Laporan</div>
          <textarea id="dr-textarea" readOnly value={text}
            style={{ width:"100%", height:420, background:"var(--bg3)",
              border:"1px solid var(--border2)", borderRadius:6, color:"var(--text3)",
              fontFamily:"'Courier New', monospace", fontSize:11,
              padding:"10px 12px", resize:"none", outline:"none",
              boxSizing:"border-box", lineHeight:1.75 }}/>
        </div>

        {/* actions */}
        <div style={{ display:"flex", gap:10, padding:"0 16px 16px", flexShrink:0 }}>
          <button onClick={doCopy}
            style={{ flex:1, background: copied ? "#15803D" : "#B11226",
              border:"none", borderRadius:6, color:"#fff", fontFamily:"inherit",
              fontSize:12, fontWeight:600, padding:"9px 0", cursor:"pointer",
              transition:"background .2s", display:"flex", alignItems:"center",
              justifyContent:"center", gap:6 }}>
            {copied ? "✓ Berhasil Dicopy!" : "📋 Copy Laporan"}
          </button>
          <button onClick={onClose}
            style={{ background:"var(--surface2)", border:"1px solid var(--border2)",
              borderRadius:6, color:"var(--muted)", fontFamily:"inherit",
              fontSize:12, padding:"9px 16px", cursor:"pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Alert Table (reusable section) ────────────────── */
function AlertTable({ alerts, newSet, eskalasi, dismissed, onReport, onDismiss, title, titleColor, headerBg, dim }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginTop:14, border:`1px solid ${dim?"#1E0A0A":"var(--border)"}`,
      borderRadius:8, overflow:"hidden" }}>
      {/* section header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px",
        background: headerBg||"var(--bg3)", cursor:"pointer", userSelect:"none",
        borderBottom: open ? `1px solid ${dim?"#1E0A0A":"var(--border)"}` : "none" }}
        onClick={()=>setOpen(v=>!v)}>
        <span style={{ width:8, height:8, borderRadius:2,
          background:titleColor, flexShrink:0 }}/>
        <span style={{ flex:1, fontSize:11, fontWeight:700, color:titleColor }}>
          {title}
        </span>
        <span style={{ fontSize:9, color:"var(--muted2)",
          transform:open?"rotate(90deg)":"none",
          transition:"transform .15s", display:"inline-block" }}>▶</span>
      </div>
      {open && (
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${dim?"#1E0A0A":"var(--border)"}`,
              background: dim?"#080303":"var(--bg3)" }}>
              {[
                { label:"Alert Name / Labels", align:"left"  },
                { label:"Folder",              align:"left"  },
                { label:"Severity",            align:"left"  },
                { label:"Since",               align:"left"  },
                { label:"Duration",            align:"right" },
                { label:"Action",              align:"right" },
              ].map(h => (
                <th key={h.label} style={{ padding:"6px 10px", textAlign:h.align,
                  fontSize:9, fontWeight:700,
                  color: dim ? "#3A2020" : "#383838",
                  letterSpacing:".1em", textTransform:"uppercase",
                  whiteSpace:"nowrap" }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map((a,i) => (
              <AlertRow key={i} a={a}
                isNew={newSet.has(a._key)}
                eskalasi={eskalasi}
                dismissed={dismissed}
                onReport={onReport}
                onDismiss={onDismiss}/>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── MAIN ───────────────────────────────────────────── */
const ESKALASI_KEY        = "pr_alert_eskalasi";
const ALERT_TASK_KEY      = "pr_alert_task_ids";
const TICKET_COOLDOWN_KEY = "pr_alert_ticket_cooldown";
const COOLDOWN_MS         = 60 * 60 * 1000; // 1 jam

/** Cek apakah alert boleh dapat ticket/task baru */
function canCreateTicket(alertKey) {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(TICKET_COOLDOWN_KEY) || "{}"); } catch {}
  const last = map[alertKey];
  if (!last) return true;
  return (Date.now() - new Date(last).getTime()) > COOLDOWN_MS;
}

/** Catat timestamp pembuatan ticket */
function recordTicketCreated(alertKey) {
  let map = {};
  try { map = JSON.parse(localStorage.getItem(TICKET_COOLDOWN_KEY) || "{}"); } catch {}
  map[alertKey] = new Date().toISOString();
  localStorage.setItem(TICKET_COOLDOWN_KEY, JSON.stringify(map));
}

/* ── API helpers for tasks ── */
const taskApiCreate = async (task) => {
  const r = await fetch("/api/tasks", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(task),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || data.message || `POST /api/tasks gagal (${r.status})`);
  }
  return data;
};
const taskApiUpdate = (id, changes) =>
  fetch(`/api/tasks/${id}`, { method:"PUT",  headers:{"Content-Type":"application/json"}, body:JSON.stringify(changes) }).then(r=>r.json());

async function createTaskFromAlert(alert) {
  const resource = alert.resource && alert.resource !== "-" ? ` → ${alert.resource}` : "";
  const folder   = folderDisplay(alert.folder);
  const alertKey = alert._key || `${alert.name}||${alert.resource}||${alert.active_at}`;
  const ticket   = await getOrCreateTicket(alertKey);
  // Alert otomatis masuk sebagai Pending tanpa PIC.
  // PIC baru diisi ketika engineer benar-benar klik "Report".
  const pic      = "";
  const task     = {
    id:          `alert_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    customer:    folder,
    description: `[ALERT] ${shortName(alert.name)}${resource}`,
    alertKey,
    date:        todayWIB(),
    start:       timeWIB(),
    end:         "",
    pic,
    status:      "Pending",
    detail:      `Ticket: ${ticket}\nSeverity: ${alert.severity || "-"}\nDuration: ${fmtDur(alert.duration_min)}\nSince: ${fmtTime(alert.active_at)}\nFolder: ${folder}`,
    createdAt:   new Date().toISOString(),
  };
  await taskApiCreate(task);
  return task.id;
}

async function syncAlertsToDailyTask(alerts) {
  // Fetch existing tasks dari API
  let existing = [];
  try {
    const res = await fetch("/api/tasks");
    existing  = await res.json();
    if (!Array.isArray(existing)) existing = [];
  } catch { return { added:0, resolved:0 }; }

  // Hanya task ALERT yang masih aktif dianggap duplikat.
  // Task lama yang sudah Close/Cancelled boleh dibuat ulang
  // ketika alert yang sama muncul kembali.
  const existingDescs = new Set(
    existing
      .filter(t => t.status !== "Close" && t.status !== "Cancelled")
      .map(t => t.description)
  );
  const tracked = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(ALERT_TASK_KEY) || "[]")); } catch { return new Set(); }
  })();
  const newKeys = new Set(tracked);

  // ── 1. Tambah task untuk alert baru ──
  let added = 0;
  for (const a of alerts) {
    const key      = `${a.name}||${a.resource}||${a.active_at}`;
    const resource = a.resource && a.resource !== "-" ? ` → ${a.resource}` : "";
    const desc     = `[ALERT] ${shortName(a.name)}${resource}`;

    // Jangan gunakan localStorage tracked sebagai penentu task sudah ada.
    // Sumber kebenaran adalah /api/tasks:
    // - task aktif ada  -> jangan duplikat
    // - task sudah Close/Cancelled -> boleh dibuat lagi untuk occurrence aktif.
    if (existingDescs.has(desc)) {
      newKeys.add(key);
      continue;
    }

    // Buat Daily Task otomatis untuk alert baru.
    // Task dibuat Pending tanpa PIC.
    try {
      const taskId = await createTaskFromAlert(a);
      if (taskId) {
        added++;
        newKeys.add(key);
      }
    } catch (e) {
      console.error("[ALERT TASK] gagal membuat Daily Task:", e);
    }
  }

  // ── 2. Mark Close untuk alert yang sudah resolved ──
  const activeDescs = new Set(
    alerts.map(a => {
      const resource = a.resource && a.resource !== "-" ? ` → ${a.resource}` : "";
      return `[ALERT] ${shortName(a.name)}${resource}`;
    })
  );

  let resolved = 0;
  for (const t of existing) {
    if (!t.description?.startsWith("[ALERT]")) continue;
    if (t.status === "Close" || t.status === "Cancelled") continue;
    if (!activeDescs.has(t.description)) {
      await taskApiUpdate(t.id, {
        status: "Close",
        end:    timeWIB(),
        detail: (t.detail || "") + `\n\nResolved: ${dateTimeWIB()}`,
      });
      // Auto-close by the alert sync must also be recorded, otherwise
      // Engineer Activity KPI's "Tasks Closed" undercounts — it only reads
      // from the activity log, not from task status directly.
      logActivity("Update Task Status", "task", `${t.description} → Close`);
      resolved++;
    }
  }

  if (added > 0 || resolved > 0) {
    localStorage.setItem(ALERT_TASK_KEY, JSON.stringify([...newKeys]));
  }
  return { added, resolved };
}

export default function AlertPage() {
  const [allAlerts,  setAllAlerts]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [search,     setSearch]     = useState("");
  const [folderFil,  setFolderFil]  = useState("");
  const [modal,      setModal]      = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [muted,      setMutedState] = useState(() => isAlertMuted());
  const [toast,      setToast]      = useState(null); // {msg, count}
  // eskalasi: Set of _key strings — shared di backend supaya semua
  // engineer melihat alert yang sudah dilaporkan oleh siapa pun.
  const [eskalasi, setEskalasi] = useState(() => new Set());
  const [dismissed, setDismissed] = useState(() => new Set());
  // Track alert _key yang sudah dibuat task — hindari duplikat
  const [alertTaskIds, setAlertTaskIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(ALERT_TASK_KEY)||"[]")); }
    catch { return new Set(); }
  });

  const loadEskalasi = useCallback(() => {
    fetch("/api/alerts/eskalasi")
      .then(r => r.json())
      .then(d => setEskalasi(new Set(Object.keys(d || {}))))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/grafana/alerts")
      .then(r => r.json())
      .then(d => {
        const rawAlerts = d.alerts || [];

        // Hanya alert yang SUDAH LEBIH DARI 5 MENIT
        // yang boleh masuk Alert Monitor dan Daily Task.
        // Filter dilakukan SEBELUM setAllAlerts() agar auto-sync
        // tidak pernah melihat alert yang masih < 5 menit.
        const alerts = rawAlerts.filter(a => { const dur=Number(a.duration_min||0); const st=(a.state||"").toLowerCase(); return dur>5 && st!=="pending" && st!=="nodata" && a.state!=="NoData"; });

        // Bunyi hanya untuk alert yang benar-benar baru muncul,
        // bukan setiap polling 30 detik.
        const currentKeys = new Set(
          alerts.map(a => `${a.name}||${a.resource}||${a.active_at}`)
        );

        const previousKeys = window.__automationHubAlertKeys || new Set();

        const newAlertKeys = [...currentKeys].filter(
          key => !previousKeys.has(key)
        );

        // Jangan bunyi saat initial load halaman.
        if (window.__automationHubAlertKeys) {
          if (newAlertKeys.length > 0) {
            playAlertSound();
            console.log(
              `[ALERT SOUND] ${newAlertKeys.length} alert baru`
            );
          }
        }

        window.__automationHubAlertKeys = currentKeys;

        setAllAlerts(alerts);
        setLastUpdate(new Date());

        // SATU-SATUNYA trigger auto Alert -> Daily Task.
        // Backend melakukan dedup berdasarkan alertKey agar polling
        // berulang tidak membuat task/ticket spam.
        syncAlertsToDailyTask(alerts).catch(e =>
          console.error("[ALERT TASK] auto-sync gagal:", e)
        );

      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    loadEskalasi();
    const iv = setInterval(load, 5000); // refresh alert tiap 5 detik
    const ivEsk = setInterval(loadEskalasi, 30000); // sync status eskalasi antar user
    return () => { clearInterval(iv); clearInterval(ivEsk); };
  }, [load, loadEskalasi]);

  const markEskalasi = async (key, alert) => {
    setEskalasi(prev => new Set(prev).add(key));
    const by = sessionStorage.getItem("pr_display") || sessionStorage.getItem("pr_user") || "";

    fetch("/api/alerts/eskalasi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, by }),
    }).catch(() => {});

    // Daily Task BARU dibuat saat engineer klik "Report".
    if (!alert) return;

    const resource = alert.resource && alert.resource !== "-" ? ` → ${alert.resource}` : "";
    const desc = `[ALERT] ${shortName(alert.name)}${resource}`;
    const folder = folderDisplay(alert.folder);

    try {
      const res = await fetch("/api/tasks");
      const tasks = await res.json();
      if (!Array.isArray(tasks)) return;

      // Jangan duplikat task untuk alert yang sama.
      const existing = tasks.find(
        t => t.description === desc &&
             t.status !== "Close" &&
             t.status !== "Cancelled"
      );

      if (existing) {
        if (by && existing.pic !== by) {
          await taskApiUpdate(existing.id, { pic: by });
        }
        return;
      }

      const ticket = await getOrCreateTicket(key);
      const task = {
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        customer: folder,
        description: desc,
        alertKey: key,
        date: todayWIB(),
        start: timeWIB(),
        end: "",
        pic: by,
        status: "Pending",
        detail: `Ticket: ${ticket}\nSeverity: ${alert.severity || "-"}\nDuration: ${fmtDur(alert.duration_min)}\nSince: ${fmtTime(alert.active_at)}\nFolder: ${folder}`,
        createdAt: new Date().toISOString(),
      };

      await taskApiCreate(task);
      logActivity("Create Task", "task", `[${folder}] ${desc}`);
      recordTicketCreated(key);
    } catch (err) {
      console.error("[LAPORKAN → TASK] gagal:", err);
    }
  };

  const markDismiss = async (alert) => {
    if (!alert) return;
    const key = alert._key;
    setDismissed(prev => new Set(prev).add(key));
    const by = sessionStorage.getItem("pr_display") || sessionStorage.getItem("pr_user") || "";
    const resource = alert.resource && alert.resource !== "-" ? " -> " + alert.resource : "";
    const desc = "[ALERT] " + shortName(alert.name) + resource;
    const folder = folderDisplay(alert.folder);
    try {
      const allTasks = await fetch("/api/tasks").then(r=>r.json());
      if (!Array.isArray(allTasks)) return;
      const existing = allTasks.find(t => t.description===desc && t.status!=="Close" && t.status!=="Cancelled");
      if (existing) {
        await taskApiUpdate(existing.id, { status:"Cancelled", end:timeWIB(), pic:by||"Dismissed" });
      } else {
        await taskApiCreate({
          id: "alert_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
          customer: folder, description: desc, alertKey: key,
          date: todayWIB(), start: timeWIB(), end: timeWIB(),
          pic: by||"Dismissed", status: "Cancelled",
          detail: "Severity: "+(alert.severity||"-")+"\nDuration: "+fmtDur(alert.duration_min)+"\nSince: "+fmtTime(alert.active_at)+"\nFolder: "+folder+"\nAction: Dismissed by "+(by||"engineer"),
          createdAt: new Date().toISOString(),
        });
      }
      logActivity("Dismiss Alert", "task", desc+" dismissed by "+(by||"engineer"));
    } catch(err) { console.error("[DISMISS]", err); }
  };

  // Stay in sync if mute is toggled from elsewhere (e.g. another tab/page).
  useEffect(() => onAlertMuteChange(setMutedState), []);
  const toggleMuted = () => {
    const nextMuted = !muted;

    // Klik user dipakai untuk unlock AudioContext browser.
    if (!nextMuted) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          if (!alertAudioContext) {
            alertAudioContext = new AudioCtx();
          }
          if (alertAudioContext.state === "suspended") {
            alertAudioContext.resume().catch(() => {});
          }
        }
      } catch (err) {
        console.warn("[ALERT SOUND] unlock gagal:", err);
      }
    }

    setAlertMuted(nextMuted); // persists + notifies AlertWatcher
  };

  // add _key, filter hanya > 5 menit (tidak ada batas atas)
  const withKey = allAlerts
    .map(a => ({ ...a, _key: `${a.name}||${a.resource}||${a.active_at}` }))
    .filter(a => a.duration_min > 5);

  const newSet = new Set(withKey.filter(a => a.duration_min <= 30).map(a => a._key));

  const filtered = withKey.filter(a => {
    if (folderFil && a.folder !== folderFil) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!a.name.toLowerCase().includes(s) &&
          !(a.resource||"").toLowerCase().includes(s) &&
          !folderDisplay(a.folder).toLowerCase().includes(s)) return false;
    }
    return true;
  });

  // sort: new first, then active (<12h) by duration desc, then old (>12h) at bottom
  const activeAlerts = filtered.filter(a => a.duration_min <= 720)
    .sort((a,b) => {
      const aN = newSet.has(a._key), bN = newSet.has(b._key);
      if (aN !== bN) return aN ? -1 : 1;
      return b.duration_min - a.duration_min;
    });
  const oldAlerts = filtered.filter(a => a.duration_min > 720)
    .sort((a,b) => b.duration_min - a.duration_min);
  const sorted = [...activeAlerts, ...oldAlerts];
  const allFolders = [...new Set(withKey.map(a => a.folder))].sort();

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden",
      background:"var(--bg)", fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ padding:"14px 24px 12px", borderBottom:"1px solid var(--border)",
        display:"flex", alignItems:"center", gap:16, flexShrink:0,
        background:"var(--bg2)" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:"var(--text2)" }}>Alert Monitor</div>
          <div style={{ fontSize:10, color:"var(--muted2)", marginTop:2 }}>
            Grafana alerts firing &gt; 5 menit
            {lastUpdate && (
              <span style={{ marginLeft:8, color:"var(--muted3)" }}>
                · {lastUpdate.toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",second:"2-digit"})}
              </span>
            )}
          </div>
        </div>

        <div style={{ display:"flex", gap:8, marginLeft:"auto", alignItems:"center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search alert / resource…"
            style={{ background:"var(--surface2)", border:"1px solid var(--border2)", borderRadius:6,
              color:"var(--text3)", fontSize:11, padding:"5px 10px",
              fontFamily:"inherit", outline:"none", width:200 }}/>
          <select value={folderFil} onChange={e => setFolderFil(e.target.value)}
            style={{ background:"var(--surface2)", border:"1px solid var(--border2)", borderRadius:6,
              color:"var(--text3)", fontSize:11, padding:"5px 10px",
              fontFamily:"inherit", outline:"none" }}>
            <option value="">All Folders</option>
            {allFolders.map(f => (
              <option key={f} value={f}>{folderDisplay(f)}</option>
            ))}
          </select>
          <button onClick={load} disabled={loading}
            style={{ background:"var(--surface2)", border:"1px solid var(--border2)", borderRadius:6,
              color:"var(--text4)", fontSize:11, padding:"5px 12px", cursor:"pointer",
              fontFamily:"inherit" }}>
            <span style={{ display:"inline-block",
              animation: loading ? "spin 1s linear infinite" : "none" }}>⟳</span>
            {" "}Refresh
          </button>
          <button onClick={() => setShowReport(true)}
            style={{ background:"rgba(177,18,38,.15)", border:"1px solid #B11226",
              borderRadius:6, color:"#F87171", fontSize:11, fontWeight:600,
              padding:"5px 12px", cursor:"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5 }}>
            📋 Daily Report
          </button>
          <button onClick={() => {
              setToast({ msg: "Auto-sync dihentikan", count: 0 });
              setTimeout(() => setToast(null), 4000);
            }}
            style={{ background:"rgba(34,197,94,.1)", border:"1px solid #22C55E",
              borderRadius:6, color:"#4ADE80", fontSize:11, fontWeight:600,
              padding:"5px 12px", cursor:"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5 }}>
            📌 Sync ke Task
          </button>
          <button onClick={toggleMuted}
            title={muted ? "Aktifkan suara alert" : "Matikan suara alert"}
            style={{ background: muted ? "var(--surface2)" : "rgba(234,179,8,.1)",
              border: muted ? "1px solid var(--border2)" : "1px solid #EAB308",
              borderRadius:6, color: muted ? "var(--muted)" : "#EAB308",
              fontSize:13, padding:"5px 10px", cursor:"pointer",
              display:"flex", alignItems:"center", gap:4 }}>
            {muted ? "🔇" : "🔔"}
            <span style={{ fontSize:10, fontWeight:600 }}>{muted ? "Mute" : "Unmute"}</span>
          </button>
        </div>
      </div>

      {/* ── Stat bar ── */}
      <div style={{ display:"flex", gap:10, padding:"10px 24px 8px", flexShrink:0,
        background:"var(--bg)" }}>
        {[
          { label:"Firing (> 5m)",  value: withKey.length,                                                                  color:"#EF4444" },
          { label:"Active < 12h",  value: activeAlerts.length,                                                             color:"#EF4444" },
          { label:"New (5–30m)",   value: newSet.size,                                                                     color:"#F87171" },
          { label:"Escalated", value: [...eskalasi].filter(k=>withKey.find(a=>a._key===k)).length,                     color:"#22C55E" },
          { label:"> 12 Jam",      value: oldAlerts.length,                                                                color:"#6B3A3A", dim:true },
        ].map(s => (
          <div key={s.label} style={{ background: s.dim ? "var(--bg3)" : "var(--bg2)",
            border: `1px solid ${s.dim ? "var(--border)" : "var(--border)"}`,
            borderRadius:7, padding:"7px 14px",
            display:"flex", flexDirection:"column", alignItems:"center", minWidth:90 }}>
            <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:9, color:"var(--muted2)", marginTop:1,
              textTransform:"uppercase", letterSpacing:".06em", textAlign:"center" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, overflow:"auto", padding:"0 24px 20px",
        background:"var(--bg)" }}>
        {loading && !allAlerts.length ? (
          <div style={{ textAlign:"center", color:"var(--muted2)", paddingTop:60, fontSize:12 }}>
            Loading alerts…
          </div>
        ) : withKey.length === 0 ? (
          <div style={{ textAlign:"center", paddingTop:60 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:13, color:"var(--muted)" }}>Tidak ada alert firing &gt; 10 menit</div>
          </div>
        ) : (
          <>
            {/* ── Section Active (< 12 jam) ── */}
            {activeAlerts.length > 0 && (
              <AlertTable
                alerts={activeAlerts} newSet={newSet}
                eskalasi={eskalasi} dismissed={dismissed} onReport={setModal} onDismiss={markDismiss}
                title={`Active Alerts  (< 12 jam) — ${activeAlerts.length} firing`}
                titleColor="#EF4444"
                headerBg="var(--bg3)"
              />
            )}

            {/* ── Section Long Running (> 12 jam) ── */}
            {oldAlerts.length > 0 && (
              <AlertTable
                alerts={oldAlerts} newSet={newSet}
                eskalasi={eskalasi} dismissed={dismissed} onReport={setModal} onDismiss={markDismiss}
                title={`Long Running  (> 12 jam) — ${oldAlerts.length} alert`}
                titleColor="#6B3A3A"
                headerBg="#0A0505"
                dim
              />
            )}
          </>
        )}
      </div>

      {/* ── Report Modal ── */}
      {modal && (
        <ReportModal
          alert={modal}
          alreadyEskalasi={eskalasi.has(modal._key)}
          onClose={() => setModal(null)}
          onEskalasi={(key, a) => { markEskalasi(key, a); }}/>
      )}

      {/* ── Daily Report Modal ── */}
      {showReport && (
        <DailyReportModal
          alerts={withKey}
          onClose={() => setShowReport(false)}/>
      )}

      {/* ── Toast notif ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:2000,
          background:"var(--surface)", border:"1px solid #22C55E",
          borderRadius:8, padding:"10px 16px", display:"flex",
          alignItems:"center", gap:10, boxShadow:"0 4px 20px rgba(0,0,0,.4)",
          animation:"slideIn .3s ease" }}>
          <span style={{ fontSize:16 }}>✅</span>
          <span style={{ fontSize:12, color:"var(--text2)" }}>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
