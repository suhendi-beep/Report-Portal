import React, { useState, useEffect, useRef, useCallback } from "react";

function parseLog(line) {
  const ts = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
  const time = ts ? ts[1] : "";
  const rest = ts ? line.slice(ts[0].length).trim() : line.trim();
  return { time, msg: rest };
}

/* Mini line chart */
function LineChart({ data, color="#B11226", width=400, height=100 }) {
  if (!data||data.length<2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*(width-20)+10;
    const y = height - 10 - (v/max)*(height-20);
    return `${x},${y}`;
  }).join(" ");
  const area = `10,${height-10} ` + pts + ` ${width-10},${height-10}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",height:"100%"}} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#lg)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"/>
      {data.map((v,i)=>{
        const x=(i/(data.length-1))*(width-20)+10;
        const y=height-10-(v/max)*(height-20);
        return <circle key={i} cx={x} cy={y} r="3" fill={color}/>;
      })}
    </svg>
  );
}

/* Donut chart */
function DonutChart({ completed, inProgress, pending, overdue }) {
  const total = completed+inProgress+pending+overdue||1;
  const r = 52, cx = 60, cy = 60, stroke = 12;
  const circ = 2*Math.PI*r;
  const slices = [
    {val:completed,  color:"#B11226"},
    {val:inProgress, color:"#F59E0B"},
    {val:pending,    color:"#3B82F6"},
    {val:overdue,    color:"#EF4444"},
  ];
  let offset = 0;
  const paths = slices.map((s,i)=>{
    const pct = s.val/total;
    const dash = circ*pct;
    const el = (
      <circle key={i} cx={cx} cy={cy} r={r}
        fill="none" stroke={s.color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ-dash}`}
        strokeDashoffset={-offset*circ+circ/4}
        strokeLinecap="butt" opacity={s.val>0?.9:.12}/>
    );
    offset += pct;
    return el;
  });
  return (
    <svg viewBox="0 0 120 120" width="120" height="120">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface2)" strokeWidth={stroke}/>
      {paths}
      <text x={cx} y={cy-8} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="Inter">Total</text>
      <text x={cx} y={cy+10} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)" fontFamily="Inter">
        {completed+inProgress+pending+overdue}
      </text>
      <text x={cx} y={cy+24} textAnchor="middle" fontSize="9" fill="var(--muted2)" fontFamily="Inter">Tasks</text>
    </svg>
  );
}

export default function Dashboard({ customers, navigate, currentUser, darkMode, toggleDark }) {
  const [history,  setHistory]  = useState([]);
  const [apiOk,    setApiOk]    = useState(null);
  const [allFiles, setAllFiles] = useState([]);
  const [showUser, setShowUser] = useState(false);
  const [runMap,   setRunMap]   = useState({});
  const [taskMap,  setTaskMap]  = useState({});
  const [alertCount, setAlertCount] = useState(null);
  // Daily Backup Status widget data
  const [dailySummary, setDailySummary] = useState({
    total:null, success:null, failed:null, rate:null, health:null, lastRun:null
  });

  useEffect(() => {
    refresh(); checkApi(); fetchDailyLog(); fetchAlertCount();
    const ivMain  = setInterval(() => { refresh(); fetchDailyLog(); }, 60000); // history tiap 60s
    const ivAlert = setInterval(fetchAlertCount, 30000); // alert tiap 30s
    return () => { clearInterval(ivMain); clearInterval(ivAlert); };
  }, []);
  useEffect(() => { if (customers.length) fetchFiles(); }, [customers]);
  useEffect(() => {
    const entries = Object.entries(runMap);
    if (!entries.length) return;
    const iv = setInterval(async()=>{
      for (const [key,tid] of entries) {
        try {
          const d = await fetch("/api/status/"+tid).then(r=>r.json());
          if (["SUCCESS","FAILURE"].includes(d.status)) {
            setTaskMap(p=>({...p,[tid]:d.status}));
            setRunMap(p=>{const n={...p};delete n[key];return n;});
            refresh();
          } else setTaskMap(p=>({...p,[tid]:d.status}));
        } catch(_){}
      }
    }, 2500);
    return () => clearInterval(iv);
  }, [runMap]);

  const refresh      = () => { fetchHistory(); fetchDailyLog(); };
  const checkApi     = () => fetch("/api/ping").then(r=>r.json()).then(d=>setApiOk(d.status==="ok")).catch(()=>setApiOk(false));
  const fetchHistory = () => fetch("/api/history").then(r=>r.json()).then(setHistory).catch(()=>{});
  const fetchAlertCount = () => fetch("/api/grafana/alerts").then(r=>r.json())
    .then(d=>setAlertCount((d.alerts||[]).filter(a=>a.duration_min>=10).length))
    .catch(()=>{});

  const parseDailyStatus = (hist) => {
    // Get last run date from history
    const last = (hist||[]).find(h=>h.automation==="daily_ilcs_status");
    if (last) setDailySummary(p=>({...p, lastRun: last.last_run}));
  };

  const fetchDailyLog = async () => {
    try {
      const d = await fetch("/api/logs/pelindo/daily_ilcs_status").then(r=>r.json());
      const text = (d.logs||[]).join("\n");
      const total     = text.match(/Total\s+:\s+(\d+)/)?.[1];
      const success   = text.match(/Success\s+:\s+(\d+)/)?.[1];
      const failed    = text.match(/Failed\s+:\s+(\d+)/)?.[1];
      const rate      = text.match(/Success Rate\s+:\s+([\d.]+%)/)?.[1];
      const health    = text.match(/🟢\s*(HEALTHY)|🔴\s*(CRITICAL)|🟡\s*(WARNING)/)?.[0]?.replace(/🟢|🔴|🟡/,"").trim()
                     || text.match(/\b(HEALTHY|CRITICAL|WARNING)\b/)?.[0];
      const period    = text.match(/Period\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1]    || null;
      const generated = text.match(/Generated\s*:\s*([\d-]+ [\d:]+ WIB)/)?.[1] || null;
      if (total||success||failed) {
        const parsed = {
          total:   total   ? parseInt(total)   : null,
          success: success ? parseInt(success) : null,
          failed:  failed  ? parseInt(failed)  : null,
          rate:    rate    || null,
          health:  health  || null,
          period,
          generated,
          fetchedAt: new Date().toISOString(),
        };
        setDailySummary(p=>({...p, ...parsed}));
        // Cache ke localStorage — dipakai DailyReportModal di AlertPage
        try { localStorage.setItem("pr_backup_status_cache", JSON.stringify(parsed)); } catch(_){}
      }
    } catch(_){}
  };
  const fetchFiles   = async () => {
    const all=[];
    for (const c of customers) {
      try {
        const d = await fetch("/api/files/"+c.id).then(r=>r.json());
        [...(d.reports||[]),...(d.screenshots||[])].forEach(f=>all.push({...f,customer:c.name,cid:c.id}));
      } catch(_){}
    }
    setAllFiles(all.sort((a,b)=>new Date(b.created)-new Date(a.created)));
  };

  const runJob = async (cid, auto) => {
    const key = `${cid}_${auto.id}`;
    if (runMap[key]) return;
    if (auto.args?.length||auto.requires_oci_credentials) { navigate("generate-report"); return; }
    try {
      const d = await fetch("/api/run",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({customer:cid,automation:auto.id,args:{}})}).then(r=>r.json());
      if (d.need_credentials||d.task_id===undefined) { navigate("generate-report"); return; }
      if (d.task_id) { setRunMap(p=>({...p,[key]:d.task_id})); setTaskMap(p=>({...p,[d.task_id]:"STARTED"})); }
    } catch(_){}
  };

  const AUTOS     = customers.flatMap(c=>(c.automations||[]).map(a=>({...a,cid:c.id,cname:c.name})));
  const totalRuns = history.length;
  const okRuns    = history.filter(h=>h.size_kb>0).length;
  const failRuns  = totalRuns-okRuns;
  const activeCust= customers.filter(c=>c.status==="active").length;

  // ── Daily Task stats dari API (shared across all users) ──
  const [alertTasks, setAlertTasks] = React.useState([]);

  const fetchTasks = React.useCallback(() => {
    fetch("/api/tasks")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAlertTasks(data); })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    fetchTasks();
    const iv = setInterval(fetchTasks, 30000); // refresh tiap 30 detik
    return () => clearInterval(iv);
  }, [fetchTasks]);

  const todayStr = new Date().toISOString().slice(0,10);
  const thisMonth = new Date().getMonth();
  const thisYear  = new Date().getFullYear();

  // Task stats (semua task, bukan hanya alert)
  const tasksDone    = alertTasks.filter(t => t.status==="Close").length;
  const tasksInProg  = alertTasks.filter(t => t.status==="In Progress").length;
  const tasksPending = alertTasks.filter(t => t.status==="Pending").length;
  const tasksOverdue = alertTasks.filter(t => t.status==="Cancelled").length;
  const totalTasks   = alertTasks.length;
  const todayTasks   = alertTasks.filter(t => (t.date||"").slice(0,10) === todayStr).length;

  // ── Alert ticket stats (hanya task yang berasal dari alert, prefix [ALERT]) ──
  const alertOnlyTasks = alertTasks.filter(t => (t.description||"").startsWith("[ALERT]"));
  const ticketCloseHarian  = alertOnlyTasks.filter(t =>
    t.status === "Close" && (t.date||"").slice(0,10) === todayStr
  ).length;
  const ticketCloseBulanan = alertOnlyTasks.filter(t => {
    if (t.status !== "Close") return false;
    const d = new Date(t.date || t.createdAt || "");
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const alertHarian  = alertOnlyTasks.filter(t => (t.date||"").slice(0,10) === todayStr).length;
  const alertBulanan = alertOnlyTasks.filter(t => {
    const d = new Date(t.date || t.createdAt || "");
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;

  // ── Report generated stats ──
  const reportHarian  = history.filter(h => new Date(h.last_run).toISOString().slice(0,10) === todayStr).length;
  const reportBulanan = history.filter(h => {
    const d = new Date(h.last_run);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;

  const toggleDark_unused = null; // now handled by App.jsx

  // ── Theme tokens via CSS variables ──
  const T = {
    bg:    "var(--bg)",    bg2:"var(--bg2)",    bg3:"var(--bg3)",
    border:"var(--border)",border2:"var(--border2)",
    text:  "var(--text)",  text2:"var(--text2)", text3:"var(--text3)",
    muted: "var(--muted)", muted2:"var(--muted2)", muted3:"var(--muted3)",
    row:   "var(--row-alt)",
  };

  const runCount  = Object.keys(runMap).length;
  const hour      = new Date().getHours();
  const greet     = hour<12?"Good morning,":hour<17?"Good afternoon,":"Good evening,";
  const initials  = (currentUser||"?").slice(0,2).toUpperCase();
  const signOut   = ()=>{sessionStorage.removeItem("pr_auth");sessionStorage.removeItem("pr_user");window.location.reload();};

  // Build chart data (last 7 days run count)
  const chartData = React.useMemo(() => {
    const days = Array(7).fill(0);
    history.forEach(h => {
      const d = new Date(h.last_run);
      const diff = Math.floor((Date.now()-d.getTime())/(1000*86400));
      if (diff<7) days[6-diff]++;
    });
    return days;
  }, [history]);

  const dayLabels = Array(7).fill(0).map((_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-(6-i));
    return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  });

  /* ── Upcoming tasks (automation jobs not yet run today) ── */
  const upcoming = AUTOS.filter(a=>{
    const last = history.find(h=>h.customer===a.cid&&h.automation===a.id);
    if (!last) return true;
    const lastDate = new Date(last.last_run).toDateString();
    return lastDate !== new Date().toDateString();
  }).slice(0,5);

  /* ── Recent reports ── */
  const recentReports = history.slice(0,6);

  /* ── Report summary chart stats ── */
  const monthlyCount  = history.filter(h=>{ const d=new Date(h.last_run); return d.getMonth()===new Date().getMonth(); }).length;
  const weeklyCount   = history.filter(h=>{ const d=new Date(h.last_run); const diff=(Date.now()-d.getTime())/(1000*86400); return diff<7; }).length;
  const onDemandCount = history.filter(h=>{ const d=new Date(h.last_run); const diff=(Date.now()-d.getTime())/(1000*86400); return diff<1; }).length;

  return (
    <div style={{...D.root, background:T.bg, color:T.text}}>

      {/* ══ TOPBAR ══ */}
      <header style={{...D.topbar, background:T.bg2, borderColor:T.border}}>
        <div>
          <div style={{...D.greetSmall, color:T.muted}}>{greet}</div>
          <div style={{...D.greetName, color:T.text}}>
            {currentUser}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* System status */}
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,
            padding:"5px 12px",borderRadius:6,
            background:apiOk===null?"var(--surface)":apiOk?"rgba(34,197,94,.06)":"rgba(239,68,68,.06)",
            border:`1px solid ${apiOk===null?"var(--border)":apiOk?"rgba(34,197,94,.2)":"rgba(239,68,68,.2)"}`,
            color:apiOk===null?"#363636":apiOk?"#4ADE80":"#F87171"}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:"currentColor",
              boxShadow:apiOk?"0 0 6px currentColor":"none",display:"inline-block"}}/>
            {apiOk===null?"Checking":apiOk?"API Online":"API Error"}
          </div>
          {runCount>0&&(
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,
              padding:"5px 12px",borderRadius:6,
              background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.2)",color:"#FBBF24"}}>
              <span className="spinner" style={{width:9,height:9,borderWidth:1.5,borderColor:"#FBBF24",borderTopColor:"transparent"}}/>
              {runCount} running
            </div>
          )}
          {/* User — admin button dengan login/logout */}
          <div style={{position:"relative"}}>
            <button style={{display:"flex",alignItems:"center",gap:8,background:T.bg2,
              border:`1px solid ${T.border2}`,borderRadius:7,padding:"6px 12px",
              cursor:"pointer",fontFamily:"inherit",transition:"border-color .15s"}}
              onClick={()=>setShowUser(v=>!v)}>
              <div style={{width:24,height:24,borderRadius:"50%",background:"#B11226",
                color:"#fff",fontSize:10,fontWeight:700,display:"flex",
                alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {initials}
              </div>
              <span style={{fontSize:12,fontWeight:500,color:T.text2}}>{currentUser}</span>
              <span style={{color:T.muted3,fontSize:9}}>▾</span>
            </button>
            {showUser&&(
              <div style={{...D.dropdown,background:T.bg2,border:`1px solid ${T.border2}`}}>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:12,fontWeight:600,color:T.text2}}>{currentUser}</div>
                  <div style={{fontSize:9,color:T.muted2}}>Administrator</div>
                </div>
                <button style={{...D.ddItem,color:T.muted}} onClick={()=>setShowUser(false)}>👤 Profile</button>
                <button style={{...D.ddItem,color:T.muted}} onClick={()=>setShowUser(false)}>⚙ Settings</button>
                <div style={{borderTop:`1px solid ${T.border}`}}/>
                <button style={{...D.ddItem,color:"#F87171"}} onClick={signOut}>🚪 Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div style={{...D.content, background:T.bg}}>

        {/* ── OVERVIEW LABEL ── */}
        <div style={{...D.sectionLabel, color:T.muted3}}>OVERVIEW</div>

        {/* ── KPI CARDS — 2 rows x 3 cols ── */}
        <div style={{...D.kpiGrid, gridTemplateColumns:"repeat(3,1fr)"}}>
          {/* Row 1 */}
          {[
            {
              icon:"📄", label:"Report Generated",
              val: totalRuns,
              sub: `Hari ini: ${reportHarian} · Bulan ini: ${reportBulanan}`,
              trend: `${okRuns} success · ${failRuns} failed`,
              c:"#B11226", bg:"rgba(177,18,38,.12)", bd:"rgba(177,18,38,.25)",
              onClick: ()=>navigate("generate-report"),
            },
            {
              icon:"🔔", label:"Active Alerts",
              val: alertCount===null ? "…" : alertCount,
              sub: `Hari ini: ${alertHarian} ticket · Bulan ini: ${alertBulanan}`,
              trend: alertCount > 0 ? `${alertCount} perlu ditindaklanjuti` : "Semua normal",
              c: alertCount > 0 ? "#EF4444" : "#22C55E",
              bg: alertCount > 0 ? "rgba(239,68,68,.12)" : "rgba(34,197,94,.12)",
              bd: alertCount > 0 ? "rgba(239,68,68,.28)" : "rgba(34,197,94,.28)",
              onClick: ()=>navigate("alert-monitor"),
            },
            {
              icon:"🎫", label:"Ticket Close",
              val: ticketCloseHarian,
              sub: `Hari ini: ${ticketCloseHarian} · Bulan ini: ${ticketCloseBulanan}`,
              trend: `${ticketCloseBulanan} closed this month`,
              c:"#22C55E", bg:"rgba(34,197,94,.12)", bd:"rgba(34,197,94,.28)",
              onClick: ()=>navigate("alert-monitor"),
            },
            {
              icon:"✅", label:"Daily Tasks",
              val: totalTasks,
              sub: `${tasksDone} done · ${tasksInProg} in progress · ${todayTasks} today`,
              trend: `${tasksDone} completed`,
              c:"#3B82F6", bg:"rgba(59,130,246,.12)", bd:"rgba(59,130,246,.28)",
              onClick: ()=>navigate("daily-task"),
            },
            {
              icon:"📊", label:"Alert Harian / Bulanan",
              val: `${alertHarian} / ${alertBulanan}`,
              sub: `Ticket close hari ini: ${ticketCloseHarian}`,
              trend: `${alertBulanan} total alert bulan ini`,
              c:"#F59E0B", bg:"rgba(245,158,11,.12)", bd:"rgba(245,158,11,.28)",
              onClick: ()=>navigate("alert-monitor"),
            },
            {
              icon:"👥", label:"Active Customers",
              val: activeCust,
              sub: `${customers.length} total customers`,
              trend: `${activeCust} aktif`,
              c:"#8B5CF6", bg:"rgba(139,92,246,.12)", bd:"rgba(139,92,246,.28)",
              onClick: ()=>navigate("customers"),
            },
          ].map((s,i)=>(
            <div key={i} style={{...D.kpiCard, borderColor:s.bd, cursor:"pointer",
              background:`linear-gradient(135deg, var(--bg2) 0%, ${s.bg} 100%)`,
              position:"relative", overflow:"hidden"}}
              onClick={s.onClick}>
              {/* Decorative background circle */}
              <div style={{position:"absolute",top:-18,right:-18,width:80,height:80,
                borderRadius:"50%",background:s.c,opacity:.06,pointerEvents:"none"}}/>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {/* Circular ring */}
                <div style={{flexShrink:0,position:"relative",width:52,height:52}}>
                  <svg width="52" height="52" viewBox="0 0 52 52">
                    <circle cx="26" cy="26" r="21" fill="none"
                      stroke={s.c} strokeOpacity=".15" strokeWidth="4"/>
                    <circle cx="26" cy="26" r="21" fill="none"
                      stroke={s.c} strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={`${2*Math.PI*21*0.75} ${2*Math.PI*21*0.25}`}
                      strokeDashoffset={2*Math.PI*21*0.25}
                      transform="rotate(-90 26 26)"/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",
                    alignItems:"center",justifyContent:"center",
                    fontSize:typeof s.val==="number"&&s.val>999?9:11,
                    fontWeight:700,color:s.c,lineHeight:1,textAlign:"center"}}>
                    {typeof s.val==="string"&&s.val.includes("/")?
                      <span style={{fontSize:9,fontWeight:700}}>{s.val}</span>
                      : s.val}
                  </div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--text2)",
                    letterSpacing:"-.01em",lineHeight:1.2}}>{s.label}</div>
                  <div style={{fontSize:9,color:"var(--muted2)",marginTop:3,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.sub}</div>
                  <div style={{display:"flex",alignItems:"center",gap:4,marginTop:5,
                    fontSize:9,color:s.c,fontWeight:600}}>
                    <span style={{width:4,height:4,borderRadius:"50%",background:s.c,
                      display:"inline-block",flexShrink:0}}/>
                    {s.trend}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── MIDDLE ROW ── */}
        <div style={D.midRow}>

          {/* Report Summary chart */}
          <div style={{...D.chartCard, background:T.bg2, borderColor:T.border}}>
            <div style={D.cardHead}>
              <div style={D.cardTitle}>REPORT SUMMARY</div>
              <select style={D.miniSelect}>
                <option>This Week</option>
                <option>This Month</option>
              </select>
            </div>
            <div style={{height:90,marginBottom:6}}>
              <LineChart data={chartData} color="#B11226" width={400} height={80}/>
            </div>
            {/* X axis labels */}
            <div style={{display:"flex",justifyContent:"space-between",
              fontSize:9,color:"#363636",padding:"0 10px"}}>
              {dayLabels.map(d=><span key={d}>{d}</span>)}
            </div>
            {/* Summary stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0,
              borderTop:"1px solid var(--border)",marginTop:12}}>
              {[
                {label:"Monthly Reports",  val:monthlyCount,  c:"var(--text2)"},
                {label:"Weekly Reports",   val:weeklyCount,   c:"var(--text2)"},
                {label:"On Demand",        val:onDemandCount, c:"var(--text2)"},
                {label:"Failed Reports",   val:failRuns,      c:"#F87171"},
              ].map((s,i)=>(
                <div key={i} style={{padding:"10px 0",textAlign:"center",
                  borderRight:i<3?"1px solid var(--border)":"none"}}>
                  <div style={{fontSize:18,fontWeight:700,color:s.c,letterSpacing:"-.02em"}}>{s.val}</div>
                  <div style={{fontSize:9,color:"var(--muted2)",marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Task Overview donut */}
          <div style={{...D.donutCard, background:T.bg2, borderColor:T.border}}>
            <div style={D.cardHead}>
              <div style={D.cardTitle}>TASK OVERVIEW</div>
              <span style={{fontSize:10,color:"var(--muted2)"}}>{totalTasks} total tasks</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <DonutChart completed={tasksDone} inProgress={tasksInProg}
                pending={tasksPending} overdue={tasksOverdue}/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {label:"Close",      val:tasksDone,   c:"#B11226",  pct:totalTasks?Math.round(tasksDone/totalTasks*100):0},
                  {label:"In Progress",val:tasksInProg, c:"#F59E0B",  pct:totalTasks?Math.round(tasksInProg/totalTasks*100):0},
                  {label:"Pending",    val:tasksPending,c:"#3B82F6",  pct:totalTasks?Math.round(tasksPending/totalTasks*100):0},
                  {label:"Overdue",    val:tasksOverdue,c:"#EF4444",  pct:totalTasks?Math.round(tasksOverdue/totalTasks*100):0},
                ].map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:s.c,flexShrink:0}}/>
                    <span style={{fontSize:11,color:"var(--text4)",flex:1}}>{s.label}</span>
                    <span style={{fontSize:11,fontWeight:600,color:"var(--text2)",minWidth:30,textAlign:"right"}}>{s.val}</span>
                    <span style={{fontSize:10,color:"var(--muted2)",minWidth:36,textAlign:"right"}}>({s.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
            <button style={D.gotoBtn} onClick={()=>navigate("daily-task")}>
              Go to Daily Task <span>→</span>
            </button>
          </div>
        </div>

        {/* ── ALERT INCIDENT TREND — Top 10 ── */}
        {(() => {
          const [trendMonth, setTrendMonth] = React.useState(() => {
            const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;
          });
          const [trendDetail, setTrendDetail] = React.useState(null); // alert name clicked

          const MONTH_NAMES_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

          // Filter tasks sesuai bulan yang dipilih
          const monthTasks = alertTasks
            .filter(t => (t.description||"").startsWith("[ALERT]"))
            .filter(t => (t.date||t.createdAt||"").slice(0,7) === trendMonth);

          // Hitung frekuensi + kumpulkan semua detail per nama alert
          const freq = {};
          monthTasks.forEach(t => {
            // Prioritaskan instance/nodename dari description (format: [ALERT] name → instance)
            // atau dari detail field
            const descMatch = (t.description||"").match(/→\s*(.+)$/);
            const instanceFromDesc = descMatch ? descMatch[1].trim() : "";
            const detailInstance = (()=>{
              const m = (t.detail||"").match(/Instance\s*:\s*(.+)/);
              return m ? m[1].trim() : "";
            })();
            const detailNodename = (()=>{
              const m = (t.detail||"").match(/Nodename\s*:\s*(.+)/);
              return m ? m[1].trim() : "";
            })();
            // Pilih: nodename > instance dari detail > instance dari desc > nama alert
            const rawAlertName = (t.description||"").replace(/^\[ALERT\]\s*/,"").replace(/\s*→.*$/,"").trim();
            const displayKey = detailNodename || detailInstance || instanceFromDesc || rawAlertName;
            if (!displayKey) return;
            if (!freq[displayKey]) freq[displayKey] = { count:0, lastSeen:"", folder:t.customer||"", tasks:[], alertName:rawAlertName };
            freq[displayKey].count++;
            const d = t.date || t.createdAt || "";
            if (!freq[displayKey].lastSeen || d > freq[displayKey].lastSeen) freq[displayKey].lastSeen = d;
            freq[displayKey].tasks.push(t);
          });

          const top10 = Object.entries(freq)
            .sort((a,b) => b[1].count - a[1].count)
            .slice(0, 5);

          const maxCount = top10.length > 0 ? top10[0][1].count : 1;

          const BAR_COLORS = ["#EF4444","#F97316","#F59E0B","#84CC16","#3B82F6"];

          // CSV export
          const exportTrendCsv = () => {
            const headers = ["Rank","Alert Name","Folder","Count","Last Seen","Ticket(s)","Detail"];
            const rows = top10.map(([name, info], i) => {
              const tickets = info.tasks.map(t => {
                const m = (t.detail||"").match(/Ticket:\s*(INC-\S+)/);
                return m ? m[1] : "";
              }).filter(Boolean).join("; ");
              const detail = info.tasks[0]?.detail?.replace(/\n/g," | ") || "";
              return [i+1, name, info.folder, info.count,
                info.lastSeen ? new Date(info.lastSeen).toLocaleDateString("id-ID") : "-",
                tickets, detail];
            });
            const csv = [headers, ...rows]
              .map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))
              .join("\n");
            const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href=url; a.download=`alert_trend_${trendMonth}.csv`; a.click();
            URL.revokeObjectURL(url);
          };

          return (
            <>
              <div style={{ marginBottom:10, background:T.bg2,
                border:`1px solid ${T.border}`, borderRadius:8, padding:"14px" }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={D.cardTitle}>🔥 ALERT INCIDENT TREND — TOP 5</div>
                    <span style={{ fontSize:10, color:"var(--muted2)" }}>
                      {monthTasks.length} alerts · {Object.keys(freq).length} unique
                    </span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {/* Month picker */}
                    <input type="month" value={trendMonth}
                      onChange={e => setTrendMonth(e.target.value)}
                      style={{ background:"var(--surface2)", border:"1px solid var(--border2)",
                        color:"var(--text4)", fontFamily:"inherit", fontSize:10,
                        padding:"3px 8px", borderRadius:5, outline:"none", cursor:"pointer" }}/>
                    {/* Export CSV */}
                    {top10.length > 0 && (
                      <button onClick={exportTrendCsv}
                        style={{ background:"#B11226", color:"#fff", border:"none",
                          fontFamily:"inherit", fontSize:10, fontWeight:600,
                          padding:"4px 11px", borderRadius:5, cursor:"pointer",
                          display:"flex", alignItems:"center", gap:4 }}>
                        ⬇ CSV
                      </button>
                    )}
                  </div>
                </div>

                {top10.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"20px 0",
                    fontSize:11, color:"var(--muted3)", fontStyle:"italic" }}>
                    No alert data for {MONTH_NAMES_ID[parseInt(trendMonth.slice(5))-1]} {trendMonth.slice(0,4)}
                  </div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"5px 20px" }}>
                    {top10.map(([name, info], i) => {
                      const pct   = (info.count / maxCount) * 100;
                      const color = BAR_COLORS[i] || "#6B7280";
                      const lastDate = info.lastSeen
                        ? new Date(info.lastSeen).toLocaleDateString("id-ID",
                            { day:"2-digit", month:"short", year:"numeric" })
                        : "-";
                      // ambil info detail dari task terbaru
                      const latestTask = info.tasks.slice().sort((a,b) => (b.date||"") > (a.date||"") ? 1 : -1)[0];
                      const ticketMatch = (latestTask?.detail||"").match(/Ticket:\s*(INC-\S+)/);
                      const ticket = ticketMatch ? ticketMatch[1] : null;
                      return (
                        <div key={name}
                          style={{ display:"flex", alignItems:"center", gap:8,
                            padding:"4px 6px", borderRadius:6, cursor:"pointer",
                            transition:"background .15s" }}
                          onClick={() => setTrendDetail({ name, info })}
                          onMouseEnter={e => e.currentTarget.style.background="var(--row-hover)"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          {/* Rank */}
                          <span style={{ fontSize:10, fontWeight:700, color:"var(--muted3)",
                            minWidth:18, textAlign:"right", flexShrink:0 }}>
                            #{i+1}
                          </span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center",
                              justifyContent:"space-between", marginBottom:2 }}>
                              <div style={{ minWidth:0, flex:1 }}>
                                <span style={{ fontSize:10, color:"var(--text3)", fontWeight:600,
                                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                                  display:"block" }} title={name}>
                                  {name}
                                </span>
                                <span style={{ fontSize:9, color:"var(--muted2)" }}>
                                  {info.alertName ? `${info.alertName.slice(0,30)}${info.alertName.length>30?"…":""}` : info.folder}{ticket ? ` · ${ticket}` : ""}
                                </span>
                              </div>
                              <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0, marginLeft:6 }}>
                                <span style={{ fontSize:9, color:"var(--muted3)" }}>{lastDate}</span>
                                <span style={{ fontSize:11, fontWeight:700, color,
                                  minWidth:20, textAlign:"right" }}>
                                  {info.count}×
                                </span>
                              </div>
                            </div>
                            <div style={{ height:3, background:"var(--surface2)", borderRadius:2 }}>
                              <div style={{ height:"100%", width:`${pct}%`, background:color,
                                borderRadius:2, transition:"width .4s",
                                boxShadow: i < 3 ? `0 0 5px ${color}88` : "none" }}/>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Detail Modal ── */}
              {trendDetail && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  zIndex:1000, padding:20 }}
                  onClick={() => setTrendDetail(null)}>
                  <div style={{ background:"var(--surface)", border:"1px solid var(--border2)",
                    borderRadius:10, width:"100%", maxWidth:580, maxHeight:"80vh",
                    display:"flex", flexDirection:"column", overflow:"hidden" }}
                    onClick={e => e.stopPropagation()}>
                    {/* Modal header */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"12px 16px", borderBottom:"1px solid var(--border)",
                      background:"var(--bg3)" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"var(--text2)" }}>
                          {trendDetail.name}
                        </div>
                        <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>
                          {trendDetail.info.folder} · {trendDetail.info.count}× occurrences in {trendMonth}
                        </div>
                      </div>
                      <button onClick={() => setTrendDetail(null)}
                        style={{ background:"none", border:"none", color:"var(--muted)",
                          fontSize:16, cursor:"pointer" }}>✕</button>
                    </div>
                    {/* Modal body — list semua task */}
                    <div style={{ flex:1, overflowY:"auto", padding:"10px 16px" }}>
                      {trendDetail.info.tasks
                        .slice().sort((a,b) => (b.date||"") > (a.date||"") ? 1 : -1)
                        .map((t, i) => {
                          const lines = (t.detail||"").split("\n").filter(Boolean);
                          return (
                            <div key={i} style={{ marginBottom:10, padding:"10px 12px",
                              background:"var(--bg3)", border:"1px solid var(--border)",
                              borderRadius:7 }}>
                              <div style={{ display:"flex", alignItems:"center",
                                justifyContent:"space-between", marginBottom:6 }}>
                                <span style={{ fontSize:9, fontWeight:700, color:"var(--muted3)",
                                  textTransform:"uppercase", letterSpacing:".06em" }}>
                                  Occurrence #{trendDetail.info.tasks.length - i}
                                </span>
                                <span style={{ fontSize:9, color:"var(--muted)", fontFamily:"monospace" }}>
                                  {t.date || "-"} · {t.start || ""}
                                </span>
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                {lines.map((line, j) => {
                                  const [key, ...val] = line.split(":");
                                  const v = val.join(":").trim();
                                  return (
                                    <div key={j} style={{ display:"flex", gap:8, fontSize:11 }}>
                                      <span style={{ color:"var(--muted2)", minWidth:90, flexShrink:0,
                                        fontWeight:600, fontSize:10 }}>{key}</span>
                                      <span style={{ color:"var(--text3)", wordBreak:"break-all" }}>{v}</span>
                                    </div>
                                  );
                                })}
                                <div style={{ display:"flex", gap:8, fontSize:11 }}>
                                  <span style={{ color:"var(--muted2)", minWidth:90, flexShrink:0,
                                    fontWeight:600, fontSize:10 }}>Status</span>
                                  <span style={{
                                    color: t.status==="Close" ? "#22C55E" : t.status==="In Progress" ? "#3B82F6" : "#F59E0B",
                                    fontWeight:600, fontSize:10 }}>
                                    {t.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ── BOTTOM ROW ── */}
        <div style={D.bottomRow}>

          {/* Recent Reports table */}
          <div style={{...D.tableCard, background:T.bg2, borderColor:T.border}}>
            <div style={D.cardHead}>
              <div style={D.cardTitle}>RECENT REPORTS</div>
              <button style={D.viewAllBtn} onClick={()=>navigate("generate-report")}>
                View All <span>→</span>
              </button>
            </div>
            {/* Table header */}
            <div style={D.tableHead}>
              {["Report Name","Customer","Type","Generated At","Status"].map(h=>(
                <div key={h} style={D.th}>{h}</div>
              ))}
            </div>
            {recentReports.length===0
              ? <div style={{fontSize:11,color:"#363636",padding:"16px 0",fontStyle:"italic",textAlign:"center"}}>
                  No reports yet — go to Generate Report to create one
                </div>
              : recentReports.map((h,i)=>{
                const ok = h.size_kb>0;
                const autoName = AUTOS.find(a=>a.cid===h.customer&&a.id===h.automation)?.name || h.automation.replace(/_/g," ");
                const sched = AUTOS.find(a=>a.cid===h.customer&&a.id===h.automation)?.schedule||"—";
                return (
                  <div key={i} style={{...D.tableRow,...(i%2===1?{background:"rgba(255,255,255,.01)"}:{})}}
                    onClick={()=>navigate("files",h.customer)}>
                    <div style={D.td}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14,opacity:.7}}>
                          {h.automation.includes("grafana")?"📊":h.automation.includes("backup")?"📝":"📋"}
                        </span>
                        <span style={{fontSize:11,fontWeight:500,color:"var(--text3)",overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{autoName}</span>
                      </div>
                    </div>
                    <div style={D.td}><span style={D.custChip}>{h.customer}</span></div>
                    <div style={D.td}><span style={{fontSize:10,color:"var(--muted)"}}>{sched}</span></div>
                    <div style={{...D.td,fontFamily:"monospace",fontSize:10,color:"var(--muted2)"}}>
                      {new Date(h.last_run).toLocaleString("en-GB",{
                        day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                    </div>
                    <div style={D.td}>
                      <span style={{fontSize:10,fontWeight:600,padding:"3px 10px",borderRadius:4,
                        background:ok?"rgba(34,197,94,.12)":"rgba(239,68,68,.12)",
                        color:ok?"#4ADE80":"#F87171",
                        border:`1px solid ${ok?"rgba(34,197,94,.25)":"rgba(239,68,68,.25)"}`}}>
                        {ok?"Success":"Failed"}
                      </span>
                    </div>
                  </div>
                );
              })
            }
          </div>

          {/* Right col: Daily Backup Status */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* ── Daily Backup Status Widget ── */}
          <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",color:T.muted3,textTransform:"uppercase"}}>
                DAILY BACKUP STATUS
              </div>
              {dailySummary.lastRun && (
                <span style={{fontSize:9,color:"#363636"}}>
                  Last: {new Date(dailySummary.lastRun).toLocaleDateString("en-GB",
                    {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})} WIB
                </span>
              )}
            </div>

            {dailySummary.total===null ? (
              <div style={{textAlign:"center",padding:"16px 0",fontSize:11,color:"#363636",fontStyle:"italic"}}>
                Run Daily Task to see backup status
              </div>
            ) : (
              <>
                {/* 4 stat cards in 2x2 grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  {[
                    {label:"TOTAL RESOURCES", val:dailySummary.total,   c:"#B11226", border:"#B11226"},
                    {label:"SUCCESSFUL",       val:dailySummary.success, c:"#22C55E", border:"#22C55E"},
                    {label:"FAILED",           val:dailySummary.failed,  c:"#EF4444", border:"#EF4444"},
                    {label:"SUCCESS RATE",     val:dailySummary.rate,    c:"#F59E0B", border:"#F59E0B"},
                  ].map((s,i)=>(
                    <div key={i} style={{
                      background:"var(--bg3)",border:"1px solid var(--border)",
                      borderLeft:`3px solid ${s.border}`,
                      borderRadius:8,padding:"10px 12px",
                    }}>
                      <div style={{fontSize:8,fontWeight:700,letterSpacing:".1em",
                        color:"var(--muted2)",textTransform:"uppercase",marginBottom:6}}>{s.label}</div>
                      <div style={{fontSize:22,fontWeight:700,color:s.c,
                        letterSpacing:"-.03em",lineHeight:1}}>{s.val||"—"}</div>
                    </div>
                  ))}
                </div>

                {/* Health status */}
                {dailySummary.health && (
                  <div style={{
                    padding:"10px 14px",borderRadius:8,marginBottom:10,
                    display:"flex",alignItems:"center",gap:10,
                    background: dailySummary.health==="HEALTHY"?"rgba(34,197,94,.06)":
                                dailySummary.health==="WARNING"?"rgba(245,158,11,.06)":"rgba(239,68,68,.06)",
                    border: `1px solid ${dailySummary.health==="HEALTHY"?"rgba(34,197,94,.2)":
                             dailySummary.health==="WARNING"?"rgba(245,158,11,.2)":"rgba(239,68,68,.2)"}`,
                  }}>
                    <span style={{
                      width:14,height:14,borderRadius:"50%",flexShrink:0,
                      background: dailySummary.health==="HEALTHY"?"#22C55E":
                                  dailySummary.health==="WARNING"?"#F59E0B":"#EF4444",
                      boxShadow: `0 0 10px ${dailySummary.health==="HEALTHY"?"#22C55E":
                                  dailySummary.health==="WARNING"?"#F59E0B":"#EF4444"}`,
                    }}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--text2)"}}>{dailySummary.health}</div>
                      <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>
                        {dailySummary.health==="HEALTHY"
                          ? "All backup resources are healthy"
                          : "Some resources need attention"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Run history */}
                <div style={{borderTop:"1px solid var(--border)",paddingTop:10}}>
                  <div style={{fontSize:8,fontWeight:700,letterSpacing:".1em",color:"#363636",
                    textTransform:"uppercase",marginBottom:8}}>RUN HISTORY</div>
                  {history
                    .filter(h=>h.automation==="daily_ilcs_status")
                    .slice(0,3)
                    .map((h,i)=>{
                      const ok = h.size_kb>0;
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                          padding:"6px 0",borderBottom:i<2?"1px solid #111":"none"}}>
                          <span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,
                            background:ok?"#22C55E":"#EF4444",
                            boxShadow:`0 0 6px ${ok?"#22C55E":"#EF4444"}`}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,fontWeight:500,color:"var(--text3)"}}>
                              Daily Backup Status Check
                            </div>
                            <div style={{fontSize:9,color:"var(--muted2)"}}>
                              {new Date(h.last_run).toLocaleString("en-GB",{
                                day:"2-digit",month:"short",year:"numeric",
                                hour:"2-digit",minute:"2-digit"})} WIB
                            </div>
                          </div>
                          <span style={{fontSize:9,fontWeight:700,padding:"2px 9px",borderRadius:99,
                            background:ok?"rgba(34,197,94,.1)":"rgba(239,68,68,.1)",
                            color:ok?"#4ADE80":"#F87171",
                            border:`1px solid ${ok?"rgba(34,197,94,.25)":"rgba(239,68,68,.25)"}`}}>
                            {ok?"SUCCESS":"FAILED"}
                          </span>
                        </div>
                      );
                    })
                  }
                  {history.filter(h=>h.automation==="daily_ilcs_status").length===0 && (
                    <div style={{fontSize:10,color:"#363636",fontStyle:"italic"}}>No runs yet</div>
                  )}
                </div>
              </>
            )}
          </div>

          </div>{/* end right col */}
        </div>

      </div>

      {/* ── FOOTER ── */}
      <div style={D.footer}>
        <span style={{fontSize:10,color:"#B11226",fontStyle:"italic"}}>ICS Compute Platform</span>
        <span style={{fontSize:10,color:"var(--border)"}}>© 2025 Portal Report. All rights reserved.</span>
      </div>
    </div>
  );
}

const D = {
  root:      {height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",
              background:"var(--bg)",fontFamily:"'Inter',system-ui,sans-serif"},
  topbar:    {display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"10px 24px",borderBottom:"1px solid var(--border)",flexShrink:0,
              background:"var(--bg2)"},
  greetSmall:{fontSize:11,color:"var(--muted)"},
  greetName: {fontSize:18,fontWeight:700,letterSpacing:"-.03em",color:"var(--text)",
              display:"flex",alignItems:"center",gap:8},
  datePill:  {display:"flex",alignItems:"center",gap:7,background:"var(--bg2)",
              border:"1px solid var(--border2)",borderRadius:7,padding:"6px 12px",cursor:"pointer"},
  userBtn:   {display:"flex",alignItems:"center",gap:6,background:"var(--bg2)",
              border:"1px solid var(--border2)",borderRadius:7,padding:"5px 10px",cursor:"pointer"},
  avatar:    {width:26,height:26,borderRadius:"50%",background:"#B11226",color:"#fff",
              fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"},
  dropdown:  {position:"absolute",top:"calc(100% + 6px)",right:0,background:"var(--surface)",
              border:"1px solid var(--border2)",borderRadius:10,overflow:"hidden",
              boxShadow:"0 12px 40px rgba(0,0,0,.4)",zIndex:300,minWidth:180},
  ddItem:    {display:"flex",alignItems:"center",gap:8,width:"100%",background:"none",
              border:"none",color:"var(--text4)",fontFamily:"inherit",fontSize:12,
              padding:"9px 14px",cursor:"pointer",textAlign:"left"},

  content:   {flex:1,overflowY:"auto",padding:"12px 24px",minHeight:0,background:"var(--bg)"},
  sectionLabel:{fontSize:9,fontWeight:700,letterSpacing:".15em",color:"var(--muted3)",
               textTransform:"uppercase",marginBottom:8},
  cardHead:  {display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10},
  cardTitle: {fontSize:9,fontWeight:700,letterSpacing:".12em",color:"var(--muted3)",textTransform:"uppercase"},

  kpiGrid:   {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10},
  kpiCard:   {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,
              padding:"12px 14px",transition:"border-color .2s"},

  midRow:    {display:"grid",gridTemplateColumns:"1fr 280px",gap:10,marginBottom:10},
  chartCard: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px"},
  donutCard: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px"},
  miniSelect:{background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--muted)",
              fontFamily:"inherit",fontSize:10,padding:"3px 7px",borderRadius:5,outline:"none"},
  gotoBtn:   {width:"100%",background:"none",border:"1px solid var(--border2)",color:"var(--muted)",
              fontFamily:"inherit",fontSize:11,padding:"6px",borderRadius:6,cursor:"pointer",
              marginTop:10,display:"flex",alignItems:"center",justifyContent:"space-between",
              transition:"all .15s"},

  bottomRow: {display:"grid",gridTemplateColumns:"1fr 300px",gap:10,paddingBottom:12},
  tableCard: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px",overflow:"hidden"},
  tableHead: {display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1.4fr 1fr",gap:0,
              borderBottom:"1px solid var(--border)",paddingBottom:6,marginBottom:2},
  th:        {fontSize:9,fontWeight:700,letterSpacing:".08em",color:"var(--muted3)",
              textTransform:"uppercase",padding:"3px 8px"},
  tableRow:  {display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1.4fr 1fr",gap:0,
              borderBottom:"1px solid var(--border)",cursor:"pointer",transition:"background .1s"},
  td:        {fontSize:11,color:"var(--text4)",padding:"7px 8px",overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center"},
  custChip:  {fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,
              background:"rgba(177,18,38,.1)",color:"#B11226",border:"1px solid rgba(177,18,38,.2)"},
  viewAllBtn:{background:"none",border:"none",color:"#B11226",fontFamily:"inherit",
              fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4},

  upcomingCard:{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px"},

  footer:    {display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"6px 24px",borderTop:"1px solid var(--border)",flexShrink:0,
              background:"var(--bg2)"},
};
