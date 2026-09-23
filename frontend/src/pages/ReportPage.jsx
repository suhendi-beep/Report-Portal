import React, { useState, useEffect, useCallback } from "react";
import { logActivity } from "../activityLog.js";

/* ── WIB helpers ── */
function todayWIB() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year:"numeric", month:"2-digit", day:"2-digit",
  }).format(new Date());
}
function timeWIB(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", hour:"2-digit", minute:"2-digit",
  }).format(date);
}

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/* ── Task 1.1: Shift-based closure calculation ── */
function calculateShiftClosure(tasks, shift) {
  return tasks.filter(t => {
    if (t.status !== "Close") return false;
    if (!t.end) return false;
    
    const endTime = t.end; // format: "HH:MM"
    const parts = endTime.split(":");
    if (parts.length !== 2) {
      console.warn(`Invalid time format: ${endTime}`);
      return false;
    }
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    
    if (isNaN(hours) || isNaN(minutes)) {
      console.warn(`Invalid time format: ${endTime}`);
      return false;
    }
    
    if (shift === "1") {
      // Shift 1: 09:00 - 21:00
      return hours >= 9 && hours < 21;
    } else {
      // Shift 2: 21:00 - 09:00 (next day)
      return hours >= 21 || hours < 9;
    }
  }).length;
}

/* ── Task 1.3: Get backup status from cache ── */
function getBackupStatusFromCache() {
  try {
    const cached = localStorage.getItem("pr_backup_status_cache");
    if (!cached) return null;
    return JSON.parse(cached);
  } catch (e) {
    console.warn("Failed to parse backup status cache:", e);
    return null;
  }
}

/* ── Task 2.1: Summary parsing helpers ── */
function extractNumber(text, regex) {
  const match = text.match(regex);
  return match ? parseInt(match[1], 10) : null;
}

function extractValue(text, regex) {
  const match = text.match(regex);
  return match ? (match[1] || match[0]).trim() : null;
}

function parseSummarySection(lines) {
  const text = lines.join("\n");
  
  // Find summary section boundaries
  const summaryStart = text.indexOf("DAILY BACKUP REPORT SUMMARY");
  const summaryEnd = text.indexOf("STATUS (HEALTHY/CRITICAL)");
  
  if (summaryStart === -1) {
    // Fallback: parse key values from anywhere
    return {
      total: extractNumber(text, /Total\s+:\s+(\d+)/),
      success: extractNumber(text, /Success\s+:\s+(\d+)/),
      failed: extractNumber(text, /Failed\s+:\s+(\d+)/),
      rate: extractValue(text, /Success Rate\s+:\s+([\d.]+%)/),
      health: extractValue(text, /\b(HEALTHY|CRITICAL|WARNING)\b/),
      period: extractValue(text, /Period\s*:\s*(\d{4}-\d{2}-\d{2})/),
      generated: extractValue(text, /Generated\s*:\s*([\d-]+ [\d:]+ WIB)/)
    };
  }
  
  const summaryText = text.substring(
    summaryStart, 
    summaryEnd > summaryStart ? summaryEnd : text.length
  );
  
  return {
    total: extractNumber(summaryText, /Total\s+:\s+(\d+)/),
    success: extractNumber(summaryText, /Success\s+:\s+(\d+)/),
    failed: extractNumber(summaryText, /Failed\s+:\s+(\d+)/),
    rate: extractValue(summaryText, /Success Rate\s+:\s+([\d.]+%)/),
    health: extractValue(summaryText, /\b(HEALTHY|CRITICAL|WARNING)\b/),
    period: extractValue(summaryText, /Period\s*:\s*(\d{4}-\d{2}-\d{2})/),
    generated: extractValue(summaryText, /Generated\s*:\s*([\d-]+ [\d:]+ WIB)/)
  };
}

function getHealthColor(health) {
  if (health === "HEALTHY") return "#22C55E";
  if (health === "WARNING") return "#F59E0B";
  return "#EF4444";
}

/* ── Task 3.1: Failed backup parsing ── */
function normalizeDateString(dateStr) {
  if (/\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr;
  }
  if (/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
    const [day, month, year] = dateStr.split("/");
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function extractResourceName(line) {
  // Common patterns:
  // - "Failed: alengka-backup"
  // - "ERROR: Resource ptos-pk-db"
  // - "ilcs-db01 FAILED"
  
  const patterns = [
    /Failed:\s+([a-zA-Z0-9_-]+)/,
    /ERROR:\s+Resource\s+([a-zA-Z0-9_-]+)/,
    /([a-zA-Z0-9_-]+)\s+FAILED/,
    /Resource:\s+([a-zA-Z0-9_-]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  
  // Fallback: extract any word before FAILED/ERROR
  const tokens = line.split(/\s+/);
  const failIdx = tokens.findIndex(t => /FAILED|ERROR/i.test(t));
  if (failIdx > 0) {
    return tokens[failIdx - 1];
  }
  
  return null;
}

function parseFailedBackupsByDate(lines) {
  const failures = {};
  
  lines.forEach(line => {
    // Skip lines with SUCCESS (they're not actual failures)
    if (/SUCCESS/i.test(line)) return;
    
    // Match failure patterns
    if (!/FAILED|ERROR/i.test(line)) return;
    
    // Extract date (various formats)
    const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/);
    if (!dateMatch) return;
    
    const date = normalizeDateString(dateMatch[0]);
    
    // Extract resource name
    const resource = extractResourceName(line);
    if (!resource) return;
    
    // Group by date
    if (!failures[date]) {
      failures[date] = [];
    }
    if (!failures[date].includes(resource)) {
      failures[date].push(resource);
    }
  });
  
  // Convert to sorted array
  return Object.entries(failures)
    .map(([date, resources]) => ({ date, resources }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* ── Task 4.1: Mobile detection hook ── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  return isMobile;
}

/* ══════════════════════════════════════════
   DAILY REPORT SECTION (Enhanced)
══════════════════════════════════════════ */
async function buildDailyReport(opts) {
  const { tanggal, shift, engineer } = opts;
  let allAlerts = [];
  let closedCount = 0;

  try {
    // Fetch Grafana alerts (sama kayak AlertPage)
    const alertRes = await fetch("/api/grafana/alerts");
    const alertData = await alertRes.json();
    const rawAlerts = alertData.alerts || [];
    // Filter > 5 menit (sama kayak dashboard)
    allAlerts = rawAlerts.filter(a => a.duration_min > 5);

    // Fetch tasks untuk ticket close count
    const taskRes = await fetch("/api/tasks");
    const taskData = await taskRes.json();
    if (Array.isArray(taskData)) {
      const todayTasks = taskData.filter(t => (t.date||"").slice(0,10) === tanggal);
      closedCount = todayTasks.filter(t =>
        t.status === "Close" || t.status === "Cancelled"
      ).length;
    }
  } catch(e) {
    console.error("Failed to fetch data:", e);
  }

  // Build alert detail
  let pendingDetail = "";
  if (allAlerts.length === 0) {
    pendingDetail = "- Tidak ada pending alert";
  } else {
    for (const alert of allAlerts) {
      const ticketMatch = (alert.resource || "").match(/INC-\d+/);
      const nodename = alert.labels?.nodename || alert.resource || "unknown";
      const folder = alert.folder || "N/A";
      const duration = Math.floor(alert.duration_min || 0);
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
      const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      pendingDetail += `- [${folder}] ${alert.name} on ${nodename} — ${durationStr}\n`;
    }
  }

  // Get backup status from cache (updated by Daily Backup Status automation)
  function getBackupStatusFromCache() {
    try {
      const cached = localStorage.getItem("pr_backup_status_cache");
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return parsed;
    } catch (e) {
      return null;
    }
  }

  const backupStatus = getBackupStatusFromCache();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const periodDate = yesterday.toISOString().slice(0,10);

  let backupInfo = "";
  if (backupStatus && backupStatus.period) {
    const now = new Date();
    const timestamp = now.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    backupInfo += `Period 	  : ${backupStatus.period}
`;
    backupInfo += `Generated : ${timestamp} WIB
`;
    backupInfo += `Total     : ${backupStatus.total || "-"}
`;
    backupInfo += `Success   : ${backupStatus.success || "-"}
`;
    backupInfo += `Failed    : ${backupStatus.failed || "-"}
`;
    backupInfo += `Rate      : ${backupStatus.rate || "-"}
`;
    backupInfo += `Health    : ${backupStatus.health || "-"}`;
  } else {
    backupInfo = "- (data belum tersedia)";
  }

  return `*Daily Report | Handover Monitoring Standby*\n\nSelamat Malam tim, Berikut daily report hari ini\n\nTanggal  : ${tanggal}\nShift    : ${shift}\nEngineer : ${engineer}\n______________________________\n\n*1. Active Alert*\nTotal : ${allAlerts.length}\n\nDetail Alert :\n${pendingDetail}\n*2. Ticket Close*\n Total : ${closedCount} Ticket\n\n*3. Status Daily Backup*\n${backupInfo}\n______________________________`;
}

function DailyReportSection() {
  const today = todayWIB();
  const [tanggal,  setTanggal]  = useState(today);
  const [shift,    setShift]    = useState("malam");
  const [engineer, setEngineer] = useState(sessionStorage.getItem("pr_display")||sessionStorage.getItem("pr_user")||"");
  const [text,     setText]     = useState("");
  const [copied,   setCopied]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const isMobile = useIsMobile(); // Task 4.1

  const generate = useCallback(async () => {
    setLoading(true);
    try { setText(await buildDailyReport({ tanggal, shift, engineer })); }
    catch(e) { setText("Error: "+e.message); }
    setLoading(false);
  }, [tanggal, shift, engineer]);

  useEffect(() => { generate(); }, [tanggal, shift, engineer, generate]);

  const doCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(()=>setCopied(false),2000);
      logActivity("Copy Daily Report","report",`Shift ${shift} — ${tanggal}`);
    }).catch(() => {
      const el=document.getElementById("rp-dr-textarea");
      if(el){el.select();document.execCommand("copy");}
      setCopied(true); setTimeout(()=>setCopied(false),2000);
    });
  };

  return (
    <div>
      {/* Task 4.2, 4.3: Mobile-responsive form */}
      <div style={{
        display:"flex",
        gap: isMobile ? 10 : 12,
        flexWrap:"wrap",
        flexDirection: isMobile ? "column" : "row",
        marginBottom:14
      }}>
        <div style={{
          display:"flex",
          flexDirection:"column",
          gap:4,
          flex: isMobile ? "1 1 100%" : 1,
          minWidth: isMobile ? "100%" : 130
        }}>
          <label style={RP.label}>Tanggal</label>
          <input 
            type="date" 
            value={tanggal} 
            onChange={e=>setTanggal(e.target.value)} 
            style={{
              ...RP.input,
              fontSize: isMobile ? 16 : 11 // Task 4.8: Prevent iOS zoom
            }}
          />
        </div>
        <div style={{
          display:"flex",
          flexDirection:"column",
          gap:4,
          flex: isMobile ? "1 1 100%" : 1,
          minWidth: isMobile ? "100%" : 130
        }}>
          <label style={RP.label}>Shift</label>
          <select 
            value={shift} 
            onChange={e=>setShift(e.target.value)} 
            style={{
              ...RP.input,
              fontSize: isMobile ? 16 : 11 // Task 4.8
            }}
          >
            <option value="1">Shift 1 (09:00-21:00)</option>
            <option value="malam">Shift 2 (21:00-09:00)</option>
          </select>
        </div>
        <div style={{
          display:"flex",
          flexDirection:"column",
          gap:4,
          flex: isMobile ? "1 1 100%" : 1,
          minWidth: isMobile ? "100%" : 130
        }}>
          <label style={RP.label}>Nama Engineer</label>
          <input 
            value={engineer} 
            onChange={e=>setEngineer(e.target.value)}
            placeholder="Nama engineer..." 
            style={{
              ...RP.input,
              fontSize: isMobile ? 16 : 11 // Task 4.8
            }}
          />
        </div>
      </div>
      
      <textarea 
        id="rp-dr-textarea" 
        value={text} 
        readOnly
        style={{
          width:"100%",
          height: isMobile ? 250 : 300,
          background:"var(--bg3)",
          border:"1px solid var(--border2)",
          borderRadius:7,
          color:"var(--text3)",
          fontFamily:"'Courier New',monospace",
          fontSize: isMobile ? 10 : 11,
          padding:"12px",
          resize:"none",
          outline:"none",
          boxSizing:"border-box",
          lineHeight:1.75
        }}
      />
      
      {/* Task 4.9: Mobile-responsive buttons */}
      <div style={{
        display:"flex",
        gap:8,
        marginTop:10,
        flexDirection: isMobile ? "column" : "row"
      }}>
        <button 
          onClick={generate} 
          disabled={loading} 
          style={{
            ...RP.btnSecondary,
            opacity:loading?.6:1,
            minHeight: isMobile ? 44 : "auto", // Task 4.7: Touch-friendly
            width: isMobile ? "100%" : "auto"
          }}
        >
          {loading?"⏳ Generating…":"↻ Refresh"}
        </button>
        <button 
          onClick={doCopy} 
          style={{
            ...RP.btnPrimary,
            flex: isMobile ? "none" : 1,
            background:copied?"#15803D":"#B11226",
            minHeight: isMobile ? 44 : "auto", // Task 4.7
            width: isMobile ? "100%" : "auto"
          }}
        >
          {copied?"✓ Berhasil Disalin!":"📋 Copy Daily Report"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   STATUS BACKUP SECTION (Enhanced with Summary Only)
══════════════════════════════════════════ */
// Task 2.2: StatCard component
function StatCard({ label, value, color }) {
  return (
    <div style={{
      background:"var(--bg3)",
      border:"1px solid var(--border)",
      borderRadius:8,
      padding:"10px 12px",
      textAlign:"center"
    }}>
      <div style={{fontSize:16,fontWeight:700,color:color}}>{value}</div>
      <div style={{
        fontSize:9,
        color:"var(--muted2)",
        marginTop:3,
        textTransform:"uppercase",
        letterSpacing:".06em"
      }}>
        {label}
      </div>
    </div>
  );
}

// Task 2.3: Enhanced BackupStatusSection - Summary Only (Mobile Responsive)
function BackupStatusSection() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile(); // Task 4.1

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch("/api/logs/pelindo/daily_ilcs_status").then(r=>r.json());
      const lines = data.logs || [];
      
      // Parse summary section only
      const parsedSummary = parseSummarySection(lines);
      setSummary(parsedSummary);
      
      // Cache for daily report
      if (parsedSummary && (parsedSummary.total || parsedSummary.success || parsedSummary.failed)) {
        try {
          localStorage.setItem(
            "pr_backup_status_cache",
            JSON.stringify({
              ...parsedSummary,
              fetchedAt: new Date().toISOString()
            })
          );
        } catch (e) {
          console.warn("Failed to cache backup status:", e);
        }
      }
    } catch(e) {
      console.error("Failed to fetch backup logs:", e);
    }
    setLoading(false);
  }, []);

  useEffect(()=>{ fetchLogs(); },[fetchLogs]);

  return (
    <div>
      {/* Summary cards - Task 4.3: Mobile single column */}
      {summary && (
        <div style={{
          display:"grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
          gap: isMobile ? 6 : 8,
          marginBottom:14
        }}>
          <StatCard 
            label="Health" 
            value={summary.health || "-"} 
            color={getHealthColor(summary.health)} 
          />
          <StatCard 
            label="Total" 
            value={summary.total ?? "-"} 
            color="var(--text2)" 
          />
          <StatCard 
            label="Success" 
            value={summary.success ?? "-"} 
            color="#22C55E" 
          />
          <StatCard 
            label="Failed" 
            value={summary.failed ?? "-"} 
            color="#EF4444" 
          />
        </div>
      )}
      
      {/* Additional info */}
      {summary?.rate && (
        <div style={{
          marginBottom:10,
          padding:"8px 12px",
          background:"var(--bg3)",
          border:"1px solid var(--border)",
          borderRadius:7,
          fontSize: isMobile ? 10 : 11,
          display:"flex",
          gap: isMobile ? 12 : 16,
          flexWrap:"wrap"
        }}>
          <span style={{color:"var(--muted)"}}>
            Rate: <strong style={{color:"#22C55E"}}>{summary.rate}</strong>
          </span>
          {summary.period && (
            <span style={{color:"var(--muted)"}}>
              Period: <strong style={{color:"var(--text3)"}}>{summary.period}</strong>
            </span>
          )}
          {summary.generated && (
            <span style={{color:"var(--muted)"}}>
              Generated: <strong style={{color:"var(--text4)"}}>{summary.generated}</strong>
            </span>
          )}
        </div>
      )}
      
      {/* Refresh button */}
      <div style={{
        display:"flex",
        justifyContent:"space-between",
        alignItems:"center",
        marginBottom:8
      }}>
        <div style={{
          fontSize:9,
          fontWeight:700,
          color:"var(--muted3)",
          letterSpacing:".1em",
          textTransform:"uppercase"
        }}>
          DAILY BACKUP REPORT SUMMARY
        </div>
        <button 
          onClick={fetchLogs} 
          disabled={loading} 
          style={{...RP.btnSecondary,padding:"4px 10px",fontSize:10}}
        >
          {loading?"⏳":"↻"} Refresh
        </button>
      </div>
      
      {/* Loading/Empty state - NO detailed logs */}
      {loading ? (
        <div style={{
          color:"var(--muted)",
          textAlign:"center",
          padding:"40px 20px",
          background:"var(--bg3)",
          border:"1px solid var(--border2)",
          borderRadius:7
        }}>
          Loading backup summary…
        </div>
      ) : !summary || (!summary.total && !summary.success && !summary.failed) ? (
        <div style={{
          color:"var(--muted3)",
          textAlign:"center",
          padding:"40px 20px",
          fontStyle:"italic",
          background:"var(--bg3)",
          border:"1px solid var(--border2)",
          borderRadius:7
        }}>
          Belum ada data backup. Jalankan Daily Backup Status ILCS terlebih dahulu.
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════
   MONTHLY REPORT SECTION (Enhanced with Failed Backup Tracking + Mobile Responsive)
══════════════════════════════════════════ */
function MonthlyReportSection() {
  const now = new Date();
  const [selMonth, setSelMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  const [tasks,    setTasks]    = useState([]);
  const [history,  setHistory]  = useState([]);
  const [backupFailed, setBackupFailed] = useState([]);
  const [backupFailuresByDate, setBackupFailuresByDate] = useState([]); // Task 3.2
  const [loading,  setLoading]  = useState(true);
  const isMobile = useIsMobile(); // Task 4.1

  useEffect(()=>{
    const load = async () => {
      setLoading(true);
      try {
        const [tr,hr,lr] = await Promise.all([
          fetch("/api/grafana/alerts").then(r=>r.json()),
          fetch("/api/history").then(r=>r.json()),
          fetch("/api/logs/pelindo/daily_ilcs_status").then(r=>r.json()),
        ]);
        setTasks(Array.isArray(tr)?tr:[]);
        setHistory(Array.isArray(hr)?hr:[]);
        const lines=(lr.logs||[]);
        setBackupFailed(lines.filter(l=>/FAILED|ERROR/i.test(l)&&!/SUCCESS/i.test(l)).slice(-20));
        
        // Task 3.2: Parse failed backups by date
        const failuresByDate = parseFailedBackupsByDate(lines);
        setBackupFailuresByDate(failuresByDate);
      } catch(e) {
        console.error("Failed to load monthly data:", e);
      }
      setLoading(false);
    };
    load();
  },[]);

  const monthTasks    = tasks.filter(t=>(t.date||"").slice(0,7)===selMonth);
  const alertTasks    = monthTasks.filter(t=>(t.description||"").startsWith("[ALERT]"));
  const totalAlert    = alertTasks.length;
  const alertClose    = alertTasks.filter(t=>t.status==="Close").length;
  const alertPending  = alertTasks.filter(t=>t.status==="Pending").length;
  const alertInProg   = alertTasks.filter(t=>t.status==="In Progress").length;
  const totalTasks    = monthTasks.length;
  const taskClose     = monthTasks.filter(t=>t.status==="Close").length;

  const monthHistory  = history.filter(h=>{ const d=new Date(h.last_run); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`===selMonth; });
  const reportGenerated = monthHistory.length;
  const reportFailed    = monthHistory.filter(h=>h.size_kb===0).length;

  const freq = {};
  alertTasks.forEach(t=>{
    const descMatch=(t.description||"").match(/→\s*(.+)$/);
    const instanceFromDesc=descMatch?descMatch[1].trim():"";
    const detailNodename=((t.detail||"").match(/Nodename\s*:\s*(.+)/)||[])[1]?.trim()||"";
    const detailInstance=((t.detail||"").match(/Instance\s*:\s*(.+)/)||[])[1]?.trim()||"";
    const rawName=(t.description||"").replace(/^\[ALERT\]\s*/,"").replace(/\s*→.*$/,"").trim();
    const key=detailNodename||detailInstance||instanceFromDesc||rawName;
    if(!key) return;
    if(!freq[key]) freq[key]={count:0,alertName:rawName,folder:t.customer||""};
    freq[key].count++;
  });
  const top10=Object.entries(freq).sort((a,b)=>b[1].count-a[1].count).slice(0,10);
  const BAR_COLORS=["#EF4444","#F97316","#F59E0B","#EAB308","#84CC16","#22C55E","#14B8A6","#3B82F6","#8B5CF6","#EC4899"];

  // Task 3.3: Enhanced export with failed backup by date
  const exportTxt = () => {
    const lines=[
      `Monthly Report — ${MONTH_NAMES[parseInt(selMonth.slice(5))-1]} ${selMonth.slice(0,4)}`,
      `Generated: ${new Date().toLocaleString("id-ID")}`,``,
      `=== ALERT SUMMARY ===`,`Total Alert      : ${totalAlert}`,`Alert Close      : ${alertClose}`,
      `Alert Pending    : ${alertPending}`,`Alert In Progress: ${alertInProg}`,``,
      `=== TASK SUMMARY ===`,`Total Tasks : ${totalTasks}`,`Tasks Close : ${taskClose}`,``,
      `=== REPORT GENERATED ===`,`Total Generated : ${reportGenerated}`,`Failed Reports  : ${reportFailed}`,``,
      `=== ALERT INCIDENT TREND (TOP 10) ===`,
      ...top10.map(([k,v],i)=>`#${i+1} ${k} (${v.alertName}) — ${v.count}× | ${v.folder}`),
      ``,`=== FAILED BACKUP BY DATE ===`,
    ];
    
    // Add failed backups by date
    if (backupFailuresByDate.length > 0) {
      backupFailuresByDate.forEach(failure => {
        lines.push(`${failure.date}: ${failure.resources.join(", ")}`);
      });
    } else {
      lines.push("(tidak ada failed backup tercatat)");
    }
    
    lines.push(``,`=== FAILED BACKUP (RECENT LOGS) ===`);
    lines.push(...(backupFailed.length>0?backupFailed.map(l=>l.trim()):["(tidak ada data)"]));
    
    const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`monthly_report_${selMonth}.txt`;a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <label style={RP.label}>Bulan</label>
          <input 
            type="month" 
            value={selMonth} 
            onChange={e=>setSelMonth(e.target.value)} 
            style={{
              ...RP.input,
              fontSize: isMobile ? 16 : 11 // Task 4.8
            }}
          />
        </div>
        <div style={{flex:1}}/>
        <button 
          onClick={exportTxt} 
          style={{
            ...RP.btnPrimary,
            width: isMobile ? "100%" : "auto",
            minHeight: isMobile ? 44 : "auto" // Task 4.7
          }}
        >
          ⬇ Export TXT
        </button>
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:"40px",color:"var(--muted)"}}>Loading…</div>
      ) : (
        <>
          {/* KPI grid - Task 4.4: 2-column on mobile */}
          <div style={{
            display:"grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
            gap: isMobile ? 6 : 8,
            marginBottom:16
          }}>
            {[
              {label:"Total Alert",     val:totalAlert,       c:"#EF4444"},
              {label:"Alert Close",     val:alertClose,       c:"#22C55E"},
              {label:"Alert Pending",   val:alertPending,     c:"#F59E0B"},
              {label:"Total Tasks",     val:totalTasks,       c:"var(--text2)"},
              {label:"Report Generated",val:reportGenerated,  c:"#B11226"},
              {label:"Report Failed",   val:reportFailed,     c:"#F87171"},
            ].map((s,i)=>(
              <div key={i} style={{
                background:"var(--bg3)",
                border:"1px solid var(--border)",
                borderRadius:8,
                padding: isMobile ? "10px 12px" : "12px 14px"
              }}>
                <div style={{
                  fontSize: isMobile ? 20 : 24,
                  fontWeight:700,
                  color:s.c,
                  letterSpacing:"-.03em"
                }}>
                  {s.val}
                </div>
                <div style={{
                  fontSize:9,
                  color:"var(--muted2)",
                  marginTop:3,
                  textTransform:"uppercase",
                  letterSpacing:".05em"
                }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Alert Incident Trend - Task 4.5: Single column on mobile */}
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px",marginBottom:16}}>
            <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:12}}>🔥 Alert Incident Trend — Top 10</div>
            {top10.length===0 ? (
              <div style={{color:"var(--muted3)",fontSize:11,fontStyle:"italic",textAlign:"center",padding:"20px"}}>Tidak ada data alert bulan ini</div>
            ) : (
              <div style={{
                display:"grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: isMobile ? 8 : "4px 20px"
              }}>
                {top10.map(([name,info],i)=>{
                  const pct=(info.count/top10[0][1].count)*100;
                  const c=BAR_COLORS[i]||"#6B7280";
                  return (
                    <div key={name} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                      <span style={{fontSize:10,fontWeight:700,color:"var(--muted3)",minWidth:18,textAlign:"right",flexShrink:0}}>#{i+1}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                          <span style={{fontSize:10,color:"var(--text3)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"75%"}} title={name}>{name}</span>
                          <span style={{fontSize:11,fontWeight:700,color:c,flexShrink:0}}>{info.count}×</span>
                        </div>
                        <div style={{height:3,background:"var(--surface2)",borderRadius:2}}>
                          <div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:2,transition:"width .4s"}}/>
                        </div>
                        <div style={{fontSize:9,color:"var(--muted2)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{info.folder}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Task 3.2: Failed Backup by Date */}
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px",marginBottom:16}}>
            <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>💾 Failed Backup by Date</div>
            {backupFailuresByDate.length === 0 ? (
              <div style={{color:"var(--muted3)",fontSize:11,fontStyle:"italic",textAlign:"center",padding:"12px"}}>
                (tidak ada failed backup tercatat)
              </div>
            ) : (
              <div style={{
                maxHeight:200,
                overflowY:"auto",
                background:"var(--bg3)",
                border:"1px solid var(--border2)",
                borderRadius:6,
                padding:"8px 12px"
              }}>
                {backupFailuresByDate.map((failure, i) => (
                  <div key={i} style={{
                    fontSize: isMobile ? 10 : 11,
                    lineHeight:1.8,
                    borderBottom: i < backupFailuresByDate.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                    paddingBottom: i < backupFailuresByDate.length - 1 ? 6 : 0,
                    marginBottom: i < backupFailuresByDate.length - 1 ? 6 : 0
                  }}>
                    <span style={{
                      fontWeight:600,
                      color:"#F87171",
                      fontFamily:"monospace"
                    }}>
                      {failure.date}:
                    </span>
                    <span style={{
                      color:"var(--text3)",
                      marginLeft:8
                    }}>
                      {failure.resources.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Failed backup (recent logs - legacy) */}
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px"}}>
            <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>💾 Failed Backup (Recent Logs)</div>
            {backupFailed.length===0 ? (
              <div style={{color:"var(--muted3)",fontSize:11,fontStyle:"italic",textAlign:"center",padding:"12px"}}>Tidak ada failed backup tercatat</div>
            ) : (
              <div style={{maxHeight:140,overflowY:"auto",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:6,padding:"8px 12px"}}>
                {backupFailed.map((l,i)=>(
                  <div key={i} style={{
                    fontSize: isMobile ? 9 : 10,
                    color:"#F87171",
                    fontFamily:"monospace",
                    lineHeight:1.6,
                    wordBreak:"break-all"
                  }}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN REPORT PAGE (Mobile Responsive)
══════════════════════════════════════════ */
export default function ReportPage() {
  const [tab, setTab] = useState("daily");
  const isMobile = useIsMobile(); // Task 4.1
  
  const TABS = [
    {key:"daily",   label:"📋 Daily Report"},
    {key:"backup",  label:"💾 Status Backup"},
    {key:"monthly", label:"📊 Monthly Report"},
  ];

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",
      background:"var(--bg)",fontFamily:"'Inter',system-ui,sans-serif"}}>
      {/* Header - Task 4.10 */}
      <div style={{
        display:"flex",
        alignItems: isMobile ? "stretch" : "center",
        flexDirection: isMobile ? "column" : "row",
        padding: isMobile ? "12px 16px 8px" : "16px 24px 12px",
        borderBottom:"1px solid var(--border)",
        flexShrink:0,
        background:"var(--bg2)",
        gap: isMobile ? 8 : 0
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? 16 : 18,
            fontWeight:700,
            letterSpacing:"-.02em",
            color:"var(--text)",
            margin:0
          }}>
            Report
          </h1>
          <p style={{
            fontSize: isMobile ? 10 : 11,
            color:"var(--muted2)",
            marginTop:2,
            marginBottom:0
          }}>
            Daily Report · Status Backup · Monthly Report
          </p>
        </div>
      </div>

      {/* Tabs - Task 4.6 */}
      <div style={{
        display:"flex",
        gap:0,
        padding:"0 24px",
        borderBottom:"1px solid var(--border)",
        flexShrink:0,
        background:"var(--bg2)",
        overflowX: isMobile ? "auto" : "visible",
        WebkitOverflowScrolling: "touch"
      }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{
              background:"none",border:"none",
              borderBottom: tab===t.key?"2px solid #B11226":"2px solid transparent",
              color: tab===t.key?"var(--text2)":"var(--muted)",
              fontFamily:"inherit",
              fontSize: isMobile ? 11 : 12,
              fontWeight:tab===t.key?600:400,
              padding: isMobile ? "8px 12px" : "10px 18px",
              cursor:"pointer",
              transition:"all .15s",
              marginBottom:-1,
              whiteSpace: isMobile ? "nowrap" : "normal"
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        flex:1,
        overflowY:"auto",
        padding: isMobile ? "16px" : "20px 24px"
      }}>
        {tab==="daily"   && <DailyReportSection />}
        {tab==="backup"  && <BackupStatusSection />}
        {tab==="monthly" && <MonthlyReportSection />}
      </div>
    </div>
  );
}

/* ── Styles ── */
const RP = {
  label:  {fontSize:9,color:"var(--muted2)",textTransform:"uppercase",letterSpacing:".06em"},
  input:  {background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:6,
           color:"var(--text3)",fontSize:11,padding:"5px 8px",fontFamily:"inherit",
           outline:"none",width:"100%",boxSizing:"border-box"},
  btnPrimary:  {background:"#B11226",color:"#fff",border:"none",borderRadius:6,
                fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 16px",
                cursor:"pointer",display:"flex",alignItems:"center",gap:6},
  btnSecondary:{background:"var(--surface2)",color:"var(--muted)",border:"1px solid var(--border2)",
                borderRadius:6,fontFamily:"inherit",fontSize:12,padding:"8px 14px",
                cursor:"pointer",display:"flex",alignItems:"center",gap:5},
};
