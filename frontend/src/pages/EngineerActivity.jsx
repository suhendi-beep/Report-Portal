import React, { useState, useEffect, useMemo } from "react";

/* ── CSV Export helpers ── */
function buildKpiRows(engineers, logs) {
  return engineers.map(u => {
    const ul    = logs.filter(l => l.username === u.username);
    const rep   = ul.filter(l => l.category === "report").length;
    const alert = ul.filter(l => l.category === "alert" && l.action === "Laporkan Alert").length;
    const taskC = ul.filter(l => l.category === "task"  && l.action === "Create Task").length;
    const taskD = ul.filter(l => l.category === "task"  && l.action === "Update Task Status" && l.detail?.includes("→ Close")).length;
    return { username: u.username, display: u.display, total: ul.length, reports: rep, alerts: alert, taskCreated: taskC, taskClosed: taskD };
  });
}

function fmtCsvVal(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/** Export semua aktivitas detail satu engineer */
function downloadSingleCsv(u, logs, filterFrom, filterTo) {
  const ul = logs.filter(l => l.username === u.username)
    .slice().sort((a,b) => (a.ts||"") < (b.ts||"") ? -1 : 1);

  const headers = ["No","Timestamp","Engineer","Username","Category","Action","Detail"];
  const body    = ul.map((l, i) => [
    i + 1,
    l.ts ? new Date(l.ts).toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "-",
    l.display || l.username,
    l.username,
    (l.category || "").toUpperCase(),
    l.action || "-",
    l.detail  || "-",
  ].map(fmtCsvVal).join(","));

  const csv  = [headers.join(","), ...body].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `activity_${u.username}_${filterFrom}_${filterTo}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/** Export semua aktivitas detail semua engineer */
function downloadAllCsv(engineers, logs, filterFrom, filterTo) {
  const sorted = [...logs].sort((a,b) => (a.ts||"") < (b.ts||"") ? -1 : 1);

  const headers = ["No","Timestamp","Engineer","Username","Category","Action","Detail"];
  const body    = sorted.map((l, i) => [
    i + 1,
    l.ts ? new Date(l.ts).toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "-",
    l.display || l.username,
    l.username,
    (l.category || "").toUpperCase(),
    l.action || "-",
    l.detail  || "-",
  ].map(fmtCsvVal).join(","));

  const csv  = [headers.join(","), ...body].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `activity_all_engineers_${filterFrom}_${filterTo}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const CATEGORY_COLOR = {
  report:  "#B11226",
  alert:   "#EF4444",
  task:    "#3B82F6",
  auth:    "#22C55E",
  general: "#6B7280",
};
const CATEGORY_LABEL = {
  report:  "Report",
  alert:   "Alert",
  task:    "Task",
  auth:    "Auth",
  general: "General",
};

function fmtTs(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts.slice(0, 16).replace("T", " "); }
}

/* ── KPI Card ── */
function KpiCard({ icon, label, value, sub, color, bg, bd }) {
  return (
    <div style={{
      background: "var(--bg2)", border: `1px solid ${bd}`,
      borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 9, background: bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: "-.03em", lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{label}</div>
          {sub && <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: `${color}22` }}>
        <div style={{ height: "100%", width: "100%", borderRadius: 2, background: color, opacity: .5 }}/>
      </div>
    </div>
  );
}

/* ── Engineer KPI row ── */
function EngineerKpiRow({ u, logs, filterFrom, filterTo }) {
  const ul    = logs.filter(l => l.username === u.username);
  const rep   = ul.filter(l => l.category === "report").length;
  const alert = ul.filter(l => l.category === "alert" && l.action === "Laporkan Alert").length;
  const taskC = ul.filter(l => l.category === "task"   && l.action === "Create Task").length;
  const taskD = ul.filter(l => l.category === "task"   && l.action === "Update Task Status" && l.detail?.includes("→ Close")).length;
  const total = ul.length;

  const initials = u.display.slice(0, 2).toUpperCase();
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={tdS}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: "#B11226",
            color: "#fff", fontSize: 11, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>{initials}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text3)" }}>{u.display}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "monospace" }}>{u.username}</div>
          </div>
        </div>
      </td>
      <td style={{ ...tdS, textAlign: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{total}</span>
      </td>
      <td style={{ ...tdS, textAlign: "center" }}>
        <span style={badge("#B11226")}>{rep}</span>
      </td>
      <td style={{ ...tdS, textAlign: "center" }}>
        <span style={badge("#EF4444")}>{alert}</span>
      </td>
      <td style={{ ...tdS, textAlign: "center" }}>
        <span style={badge("#3B82F6")}>{taskC}</span>
      </td>
      <td style={{ ...tdS, textAlign: "center" }}>
        <span style={badge("#22C55E")}>{taskD}</span>
      </td>
      <td style={{ ...tdS }}>
        <button
          onClick={() => downloadSingleCsv(u, logs, filterFrom, filterTo)}
          title={`Download KPI CSV for ${u.display}`}
          style={{
            background: "rgba(177,18,38,.1)", border: "1px solid rgba(177,18,38,.3)",
            borderRadius: 5, color: "#B11226", fontFamily: "inherit",
            fontSize: 10, fontWeight: 600, padding: "4px 10px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
          }}>
          ⬇ CSV
        </button>
      </td>
    </tr>
  );
}

export default function EngineerActivity({ navigate }) {
  const role    = sessionStorage.getItem("pr_role") || "admin";
  const user    = sessionStorage.getItem("pr_user") || "admin";
  const isAdmin = role === "admin" || user === "admin";

  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [users,      setUsers]      = useState([]);
  const [filterUser, setFilterUser] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo,   setFilterTo]   = useState("");
  const [filterCat,  setFilterCat]  = useState("");
  const [tab,        setTab]        = useState("kpi"); // "kpi" | "log"

  const today        = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);

  useEffect(() => {
    setFilterFrom(firstOfMonth);
    setFilterTo(today);
    fetch("/api/auth/users").then(r => r.json()).then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadLogs();
  }, [filterUser, filterFrom, filterTo, isAdmin]);

  const loadLogs = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filterUser) p.set("user", filterUser);
    if (filterFrom) p.set("from", filterFrom);
    if (filterTo)   p.set("to",   filterTo);
    fetch(`/api/activity?${p}`)
      .then(r => r.json())
      .then(d => { setLogs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const filtered = useMemo(() =>
    filterCat ? logs.filter(l => l.category === filterCat) : logs,
    [logs, filterCat]
  );

  // ── Global KPI ──
  const totalActivities = filtered.length;
  const totalReports    = filtered.filter(l => l.category === "report").length;
  const totalAlerts     = filtered.filter(l => l.category === "alert" && l.action === "Laporkan Alert").length;
  const totalTaskCreate = filtered.filter(l => l.category === "task"  && l.action === "Create Task").length;
  const totalTaskClose  = filtered.filter(l => l.category === "task"  && l.action === "Update Task Status" && l.detail?.includes("→ Close")).length;

  const engineers = users.filter(u => u.role === "engineer");

  // ── Access Denied ──
  if (!isAdmin) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "var(--bg)", fontFamily: "'Inter',system-ui,sans-serif",
        gap: 16, padding: 40, textAlign: "center",
      }}>
        <div style={{ fontSize: 48, opacity: .3 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text2)" }}>Access Restricted</div>
        <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 380, lineHeight: 1.7 }}>
          You do not have permission to view Engineer Activity logs.
          This feature is only accessible by administrators.
          Please contact your admin to request access.
        </div>
        <button onClick={() => navigate("dashboard")} style={{
          marginTop: 8, background: "#B11226", color: "#fff", border: "none",
          fontFamily: "inherit", fontSize: 12, fontWeight: 600,
          padding: "9px 22px", borderRadius: 7, cursor: "pointer",
        }}>← Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "var(--bg)", fontFamily: "'Inter',system-ui,sans-serif", overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: "14px 24px 12px", borderBottom: "1px solid var(--border)",
        background: "var(--bg2)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text2)" }}>Engineer Activity</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            Monitor engineer performance — reports, alerts, tasks
          </div>
        </div>
        <button onClick={loadLogs} style={{
          background: "var(--surface2)", border: "1px solid var(--border2)",
          borderRadius: 6, color: "var(--muted)", fontSize: 11,
          padding: "5px 14px", cursor: "pointer", fontFamily: "inherit",
        }}>↻ Refresh</button>
      </div>

      {/* ── Filters ── */}
      <div style={{
        padding: "10px 24px", borderBottom: "1px solid var(--border)",
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
        flexShrink: 0, background: "var(--bg2)",
      }}>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={fIn}>
          <option value="">All Engineers</option>
          {engineers.map(u => <option key={u.username} value={u.username}>{u.display}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <label style={{ fontSize: 10, color: "var(--muted)" }}>From</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={fIn}/>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <label style={{ fontSize: 10, color: "var(--muted)" }}>To</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={fIn}/>
        </div>
        {/* Tab switch */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[["kpi","📊 KPI"],["log","📋 Activity Log"]].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab===t ? "#B11226" : "var(--surface2)",
              border: `1px solid ${tab===t ? "#B11226" : "var(--border2)"}`,
              color: tab===t ? "#fff" : "var(--muted)",
              fontFamily: "inherit", fontSize: 11, fontWeight: 600,
              padding: "5px 14px", borderRadius: 6, cursor: "pointer",
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ════ TAB: KPI ════ */}
        {tab === "kpi" && (
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ── Global KPI Cards ── */}
            <div>
              <div style={secLbl}>OVERVIEW — {filterFrom} s/d {filterTo}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
                <KpiCard icon="⚡" label="Total Activities"    value={totalActivities} color="#6B7280" bg="rgba(107,114,128,.1)"  bd="rgba(107,114,128,.2)"/>
                <KpiCard icon="📄" label="Reports Generated"   value={totalReports}    color="#B11226" bg="rgba(177,18,38,.1)"    bd="rgba(177,18,38,.2)"/>
                <KpiCard icon="📣" label="Alerts Escalated"    value={totalAlerts}     color="#EF4444" bg="rgba(239,68,68,.1)"    bd="rgba(239,68,68,.2)"/>
                <KpiCard icon="✏️" label="Tasks Created"       value={totalTaskCreate} color="#3B82F6" bg="rgba(59,130,246,.1)"   bd="rgba(59,130,246,.2)"/>
                <KpiCard icon="✅" label="Tasks Closed"        value={totalTaskClose}  color="#22C55E" bg="rgba(34,197,94,.1)"    bd="rgba(34,197,94,.2)"/>
              </div>
            </div>

            {/* ── Per-Engineer KPI Table ── */}
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <div style={secLbl}>PER ENGINEER</div>
                <button onClick={() => downloadAllCsv(engineers, filtered, filterFrom, filterTo)}
                  style={{
                    background:"#B11226", color:"#fff", border:"none",
                    fontFamily:"inherit", fontSize:11, fontWeight:600,
                    padding:"5px 14px", borderRadius:6, cursor:"pointer",
                    display:"flex", alignItems:"center", gap:5,
                  }}>
                  ⬇ Export All CSV
                </button>
              </div>
              <div style={{
                background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: 10, overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg3)" }}>
                      {["Engineer","Total","Reports","Alerts Escalated","Tasks Created","Tasks Closed","Export"].map(h => (
                        <th key={h} style={{
                          padding: "10px 16px", textAlign: h==="Engineer"||h==="Export" ? "left" : "center",
                          fontSize: 9, fontWeight: 700, letterSpacing: ".09em",
                          textTransform: "uppercase", color: "var(--muted3)",
                          borderBottom: "1px solid var(--border)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {engineers.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign:"center", padding:"24px", color:"var(--muted)", fontSize:12 }}>
                        No engineer data
                      </td></tr>
                    ) : engineers.map(u => (
                      <EngineerKpiRow key={u.username} u={u} logs={filtered}
                        filterFrom={filterFrom} filterTo={filterTo}/>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Category breakdown ── */}
            <div>
              <div style={secLbl}>ACTIVITY BREAKDOWN</div>
              <div style={{ display: "flex", gap: 10 }}>
                {Object.entries(CATEGORY_LABEL).filter(([k]) => k !== "auth" && k !== "general").map(([k, v]) => {
                  const cnt    = filtered.filter(l => l.category === k).length;
                  const pct    = totalActivities > 0 ? Math.round(cnt / totalActivities * 100) : 0;
                  const color  = CATEGORY_COLOR[k];
                  return (
                    <div key={k} style={{
                      flex: 1, background: "var(--bg2)", border: `1px solid ${color}33`,
                      borderRadius: 9, padding: "14px 16px",
                    }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color }}>{cnt}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop:2 }}>{v}</div>
                      <div style={{ marginTop: 8, height: 4, background: "var(--bg3)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width .4s" }}/>
                      </div>
                      <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>{pct}% of total</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB: ACTIVITY LOG ════ */}
        {tab === "log" && (
          <div>
            {/* category filter only for log tab */}
            <div style={{
              padding: "8px 24px", borderBottom: "1px solid var(--border)",
              display: "flex", gap: 8, alignItems: "center",
              background: "var(--bg2)",
            }}>
              {[["","All"],["report","Report"],["alert","Alert"],["task","Task"],["auth","Auth"]].map(([k,l]) => (
                <button key={k} onClick={() => setFilterCat(k)} style={{
                  background: filterCat===k ? CATEGORY_COLOR[k]||"#B11226" : "var(--surface2)",
                  border: `1px solid ${filterCat===k ? (CATEGORY_COLOR[k]||"#B11226") : "var(--border2)"}`,
                  color: filterCat===k ? "#fff" : "var(--muted)",
                  fontFamily: "inherit", fontSize: 10, fontWeight: 600,
                  padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                }}>{l}</button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>
                {filtered.length} entries
              </span>
            </div>

            {loading ? (
              <div style={cMsg}>
                <span className="spinner" style={{ width:20,height:20,margin:"0 auto 10px",display:"block" }}/>
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div style={cMsg}>
                <div style={{ fontSize:32,opacity:.15,marginBottom:8 }}>📋</div>
                No activity found for the selected period.
              </div>
            ) : (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"var(--bg3)", position:"sticky", top:0, zIndex:1 }}>
                    {["Timestamp","Engineer","Category","Action","Detail"].map(h => (
                      <th key={h} style={thS}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l, i) => {
                    const cc = CATEGORY_COLOR[l.category] || "#6B7280";
                    return (
                      <tr key={l.id||i} style={{
                        borderBottom: "1px solid var(--border)",
                        background: i%2===0 ? "transparent" : "var(--row-alt)",
                      }}>
                        <td style={{ ...tdS, fontFamily:"monospace", fontSize:10, color:"var(--muted)", whiteSpace:"nowrap" }}>
                          {fmtTs(l.ts)}
                        </td>
                        <td style={tdS}>
                          <div style={{ fontSize:11,fontWeight:600,color:"var(--text3)" }}>{l.display||l.username}</div>
                          <div style={{ fontSize:9,color:"var(--muted)",fontFamily:"monospace" }}>{l.username}</div>
                        </td>
                        <td style={tdS}>
                          <span style={{
                            fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,
                            textTransform:"uppercase",background:cc+"22",color:cc,border:`1px solid ${cc}44`,
                          }}>
                            {CATEGORY_LABEL[l.category]||l.category}
                          </span>
                        </td>
                        <td style={{ ...tdS,fontWeight:600,color:"var(--text3)",fontSize:11 }}>{l.action}</td>
                        <td style={{ ...tdS,fontSize:10,color:"var(--muted)",maxWidth:360 }}>
                          <div style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}
                            title={l.detail}>{l.detail||"-"}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const fIn = {
  background:"var(--surface2)",border:"1px solid var(--border2)",
  color:"var(--text4)",fontFamily:"inherit",fontSize:11,
  padding:"5px 10px",borderRadius:6,outline:"none",cursor:"pointer",
};
const secLbl = {
  fontSize:9,fontWeight:700,letterSpacing:".12em",color:"var(--muted3)",
  textTransform:"uppercase",marginBottom:10,
};
const thS = {
  textAlign:"left",padding:"8px 16px",fontSize:9,fontWeight:700,
  letterSpacing:".09em",textTransform:"uppercase",color:"var(--muted3)",
  borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",
};
const tdS = {
  padding:"9px 16px",fontSize:11,color:"var(--text4)",
  borderBottom:"1px solid var(--border)",verticalAlign:"middle",
};
const cMsg = {
  display:"flex",flexDirection:"column",alignItems:"center",
  justifyContent:"center",padding:"60px 0",
  fontSize:12,color:"var(--muted)",fontStyle:"italic",textAlign:"center",
};
function badge(color) {
  return {
    display:"inline-block",fontSize:13,fontWeight:700,
    color,background:color+"18",border:`1px solid ${color}44`,
    padding:"2px 10px",borderRadius:6,minWidth:30,textAlign:"center",
  };
}
