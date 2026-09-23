import React, { useState, useEffect } from "react";
import Dashboard    from "./pages/Dashboard.jsx";
import GenerateReport from "./pages/GenerateReport.jsx";
import DailyTask    from "./pages/DailyTask.jsx";
import CustomerPage from "./pages/CustomerPage.jsx";
import FilesPage    from "./pages/FilesPage.jsx";
import LoginPage    from "./pages/LoginPage.jsx";
import AlertPage    from "./pages/AlertPage.jsx";
import EngineerActivity from "./pages/EngineerActivity.jsx";
import ReportPage    from "./pages/ReportPage.jsx";
import ReminderNotif from "./components/ReminderNotif.jsx";
import AlertWatcher  from "./components/AlertWatcher.jsx";
import "./styles.css";

import OCILoginModal from "./components/OCILoginModal";

export default function App() {
  // ── One-time cleanup of old localStorage keys (task data now lives in backend) ──
  React.useEffect(() => {
    const KEYS_TO_CLEAR = [
      "portal_report_daily_tasks",
      "pr_tasks_migrated",
      "pr_daily_tasks",
      // JANGAN hapus: pr_alert_tickets, pr_alert_task_ids, pr_alert_ticket_cooldown
      // karena masih dipakai untuk tracking nomor ticket alert
    ];
    KEYS_TO_CLEAR.forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
  }, []);
  // ── Persist page state across browser refresh ──
  const [page,     setPage]     = useState(() => sessionStorage.getItem("pr_page") || "dashboard");
  const [custId,   setCustId]   = useState(() => sessionStorage.getItem("pr_custid") || null);
  const [customers,setCustomers]= useState([]);
  const [ociSess,  setOciSess]  = useState(null);
  const [running,  setRunning]  = useState({});
  const [statuses, setStatuses] = useState({});
  const [logs,     setLogs]     = useState({});
  const [activeLog,setActiveLog]= useState(null);
  const [authed,   setAuthed]   = useState(!!sessionStorage.getItem("pr_auth"));
  const [fullCust, setFullCust] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("pr_theme") !== "light"; } catch { return true; }
  });
  const currentUser = sessionStorage.getItem("pr_user")    || "admin";
  const currentRole = sessionStorage.getItem("pr_role")    || "admin";
  const displayName = sessionStorage.getItem("pr_display") || currentUser;

  // Apply theme class to <body> whenever darkMode changes
  useEffect(() => {
    document.body.classList.toggle("light", !darkMode);
  }, [darkMode]);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    try { localStorage.setItem("pr_theme", next ? "dark" : "light"); } catch {}
  };

  useEffect(() => {
    if (!authed) return;
    fetch("/api/customers").then(r=>r.json()).then(setCustomers).catch(()=>{});
    fetch("/api/oci/session").then(r=>r.json()).then(setOciSess).catch(()=>{});
  }, [authed]);

  useEffect(() => {
    if (!custId) return;
    fetch("/api/customers/"+custId).then(r=>r.json()).then(setFullCust).catch(()=>{});
  }, [custId]);

  const navigate = (p, id) => {
    setPage(p);
    setCustId(id||null);
    sessionStorage.setItem("pr_page", p);
    if (id) sessionStorage.setItem("pr_custid", id);
    else sessionStorage.removeItem("pr_custid");
  };
  const refreshOci = () => fetch("/api/oci/session").then(r=>r.json()).then(setOciSess).catch(()=>{});

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",
      background:"var(--bg)",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <Sidebar
        customers={customers} page={page} navigate={navigate}
        custId={custId} ociSess={ociSess} onOciChange={refreshOci}
        running={running} currentUser={currentUser} displayName={displayName}
        currentRole={currentRole} darkMode={darkMode} toggleDark={toggleDark}
      />
      <main style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minWidth:0}}>
        {page==="dashboard"       && <Dashboard customers={customers} navigate={navigate} currentUser={currentUser} darkMode={darkMode} toggleDark={toggleDark}/>}
        {page==="generate-report" && <GenerateReport customers={customers} navigate={navigate} darkMode={darkMode}/>}
        {page==="daily-task"      && <DailyTask customers={customers} navigate={navigate} darkMode={darkMode}/>}
        {page==="alert-monitor"   && <AlertPage darkMode={darkMode}/>}
        {page==="engineer-activity" && <EngineerActivity navigate={navigate}/>}
        {page==="report"         && <ReportPage />}
        {page==="customer"  && custId && <CustomerPage customerId={custId} navigate={navigate} ociSession={ociSess} running={running} setRunning={setRunning} statuses={statuses} setStatuses={setStatuses} logs={logs} setLogs={setLogs} activeLog={activeLog} setActiveLog={setActiveLog} darkMode={darkMode}/>}
        {page==="files"     && custId && <FilesPage customer={fullCust} navigate={navigate} darkMode={darkMode}/>}
        {["customers","accounts","grafana","credentials","schedules","logs-page","settings"].includes(page) && (
          <ComingSoon page={page} navigate={navigate}/>
        )}
      </main>
      {/* Global reminder notifications — shown on all pages */}
      {authed && <ReminderNotif />}
      {/* Global alert ringtone + new-alert toasts — active on every page,
          not just while "Alert Monitor" is open */}
      {authed && <AlertWatcher />}
    </div>
  );
}

function ComingSoon({ page, navigate }) {
  const labels = {
    customers:"Customers",accounts:"Accounts",grafana:"Grafana Dashboards",
    credentials:"Credentials",schedules:"Schedules","logs-page":"Activity Logs",settings:"Settings"
  };
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",gap:16,color:"var(--muted2)"}}>
      <div style={{fontSize:40,opacity:.15}}>🚧</div>
      <div style={{fontSize:15,fontWeight:600,color:"var(--muted)"}}>{labels[page]||page}</div>
      <div style={{fontSize:12,color:"#363636"}}>Coming soon</div>
      <button onClick={()=>navigate("dashboard")}
        style={{background:"#B11226",color:"#fff",border:"none",fontFamily:"inherit",
          fontSize:12,fontWeight:500,padding:"8px 20px",borderRadius:6,cursor:"pointer"}}>
        ← Dashboard
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR — sesuai desain gambar
══════════════════════════════════════════════════════════ */
function Sidebar({ customers, page, navigate, custId, ociSess, onOciChange, running, currentUser, displayName, currentRole, darkMode, toggleDark }) {
  const [showOci,   setShowOci]   = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const runCount = Object.keys(running||{}).length;
  const initials = (currentUser||"?").slice(0,2).toUpperCase();

  const signOut = () => {
    const u = sessionStorage.getItem("pr_user");
    const d = sessionStorage.getItem("pr_display");
    if (u) {
      fetch("/api/activity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, display: d || u, action: "Logout", category: "auth", detail: "" }),
      }).catch(() => {});
    }
    sessionStorage.removeItem("pr_auth");
    sessionStorage.removeItem("pr_user");
    sessionStorage.removeItem("pr_display");
    sessionStorage.removeItem("pr_role");
    window.location.reload();
  };

  return (
    <aside style={{...SB.root, borderColor:"var(--sidebar-border)"}} className="app-sidebar">
      {/* Logo */}
      <div style={{...SB.logoWrap, borderColor:"var(--sidebar-border)"}}>
        <img src="/logo.svg" alt="ICS Compute"
          style={{width:34,height:34,borderRadius:8,flexShrink:0}}/>
        <div>
          <div style={{...SB.logoName}}>PORTAL REPORT</div>
          <div style={{...SB.logoSub}}>ICS Compute</div>
        </div>
      </div>

      {/* Main nav */}
      <nav style={SB.nav}>
        <NavItem icon={DashIcon}   label="Dashboard"       id="dashboard"       active={page==="dashboard"}       onClick={()=>navigate("dashboard")}/>
        <NavItem icon={ReportIcon} label="Generate Report"  id="generate-report" active={page==="generate-report"} onClick={()=>navigate("generate-report")}/>
        <NavItem icon={TaskIcon}   label="Daily Task"       id="daily-task"      active={page==="daily-task"}      onClick={()=>navigate("daily-task")}/>
        <NavItem icon={AlertIcon}  label="Alert Monitor"    id="alert-monitor"   active={page==="alert-monitor"}   onClick={()=>navigate("alert-monitor")}/>
        <NavItem icon={ActivityIcon} label="Engineer Activity" id="engineer-activity" active={page==="engineer-activity"} onClick={()=>navigate("engineer-activity")}/>
        <NavItem icon={ReportNavIcon} label="Report"          id="report"          active={page==="report"}        onClick={()=>navigate("report")}/>

        <div style={SB.sectionLabel}>MANAGEMENT</div>
        <NavItem icon={CustomerIcon}  label="Customers"         id="customers"   active={page==="customers"}   onClick={()=>navigate("customers")}/>
        <NavItem icon={AccountIcon}   label="Accounts"          id="accounts"    active={page==="accounts"}    onClick={()=>navigate("accounts")}/>
        <NavItem icon={GrafanaIcon}   label="Grafana Dashboards" id="grafana"     active={page==="grafana"}     onClick={()=>navigate("grafana")}/>
        <NavItem icon={CredIcon}      label="Credentials"       id="credentials" active={page==="credentials"} onClick={()=>navigate("credentials")}/>
        <NavItem icon={ScheduleIcon}  label="Schedules"         id="schedules"   active={page==="schedules"}   onClick={()=>navigate("schedules")}/>
        <NavItem icon={LogIcon}       label="Activity Logs"     id="logs-page"   active={page==="logs-page"}   onClick={()=>navigate("logs-page")}/>
        <NavItem icon={SettingsIcon}  label="Settings"          id="settings"    active={page==="settings"}    onClick={()=>navigate("settings")}/>
      </nav>

      {/* Theme toggle */}
      <div style={{padding:"8px 12px", borderTop:"1px solid var(--border)"}}>
        <button onClick={toggleDark}
          style={{width:"100%",display:"flex",alignItems:"center",gap:8,
            background:"var(--surface2)",border:"1px solid var(--border2)",
            borderRadius:6,padding:"6px 10px",cursor:"pointer",
            fontFamily:"inherit",fontSize:11,color:"var(--muted)",transition:"all .2s"}}>
          <span style={{fontSize:13}}>{darkMode ? "🌙" : "☀️"}</span>
          <span style={{flex:1,textAlign:"left"}}>{darkMode ? "Dark Mode" : "Light Mode"}</span>
          <span style={{fontSize:9,background:"rgba(177,18,38,.15)",color:"#B11226",
            padding:"1px 6px",borderRadius:3,fontWeight:700}}>
            {darkMode ? "ON" : "OFF"}
          </span>
        </button>
      </div>

      {/* OCI status */}
      <div style={{...SB.ociBar, borderColor:"var(--border)"}} onClick={()=>setShowOci(true)}>
        <span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,
          background: ociSess?.logged_in ? "#22C55E" : "var(--muted2)",
          boxShadow:  ociSess?.logged_in ? "0 0 8px #22C55E" : "none"}}/>
        <span style={{flex:1,fontSize:10,color:"var(--muted)"}}>
          {ociSess?.logged_in ? "OCI Connected" : "OCI Not Connected"}
        </span>
        <span style={{fontSize:9,color:"#B11226",fontWeight:600}}>
          {ociSess?.logged_in ? "Manage" : "Connect →"}
        </span>
      </div>

      {showOci && (
        <OCILoginModal onClose={()=>setShowOci(false)}
          onSuccess={()=>{ setShowOci(false); onOciChange(); }}/>
      )}
    </aside>
  );
}

function NavItem({ icon: Icon, label, id, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      style={{
        ...SB.navBtn,
        ...(active ? SB.navBtnActive : hov ? SB.navBtnHover : {}),
      }}
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}>
      <span style={{display:"flex",alignItems:"center",justifyContent:"center",
        width:16,flexShrink:0,opacity: active?1:.5}}>
        <Icon size={14}/>
      </span>
      <span style={{flex:1,textAlign:"left"}}>{label}</span>
    </button>
  );
}

const SB = {
  root:        {width:200,borderRight:"1px solid var(--sidebar-border)",
                display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",
                transition:"background .25s"},
  logoWrap:    {display:"flex",alignItems:"center",gap:10,padding:"16px 16px 13px",
                borderBottom:"1px solid var(--sidebar-border)"},
  logoHex:     {width:34,height:34,borderRadius:8,background:"#B11226",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                boxShadow:"0 0 12px rgba(177,18,38,.4)"},
  logoName:    {fontSize:11,fontWeight:700,letterSpacing:".06em",color:"var(--text)"},
  logoSub:     {fontSize:9,color:"var(--muted)",marginTop:1},
  nav:         {flex:1,padding:"6px 10px",overflowY:"auto"},
  sectionLabel:{fontSize:8,fontWeight:700,letterSpacing:".15em",color:"var(--muted3)",
                padding:"14px 8px 4px",textTransform:"uppercase"},
  navBtn:      {display:"flex",alignItems:"center",gap:9,width:"100%",background:"none",
                border:"none",color:"var(--muted)",fontFamily:"inherit",fontSize:11,
                padding:"7px 8px",borderRadius:6,cursor:"pointer",textAlign:"left",
                transition:"all .12s"},
  navBtnActive:{background:"#B11226",color:"#FFFFFF",boxShadow:"0 2px 8px rgba(177,18,38,.4)"},
  navBtnHover: {background:"var(--surface2)",color:"var(--text4)"},
  illustBox:   {padding:"0 0 0 0",borderTop:"1px solid var(--border)",overflow:"hidden"},
  illustText:  {fontSize:11,color:"var(--muted)",padding:"0 16px 1px",fontStyle:"italic"},
  illustAccent:{fontSize:12,fontWeight:700,color:"#B11226",padding:"0 16px 10px"},
  ociBar:      {display:"flex",alignItems:"center",gap:7,padding:"8px 14px",
                borderTop:"1px solid var(--border)",cursor:"pointer"},
  userRow:     {display:"flex",alignItems:"center",gap:9,padding:"10px 14px",
                borderTop:"1px solid var(--border)"},
  userAvatar:  {width:30,height:30,borderRadius:"50%",background:"#B11226",
                color:"#fff",fontSize:11,fontWeight:700,display:"flex",
                alignItems:"center",justifyContent:"center",flexShrink:0},
};

/* ── Icons ── */
function DashIcon({size=14})     { return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>; }
function ReportIcon({size=14})   { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1.5" width="12" height="13" rx="1.5"/><line x1="5" y1="5.5" x2="11" y2="5.5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="10.5" x2="8" y2="10.5"/></svg>; }
function TaskIcon({size=14})     { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><polyline points="5,8 7,10 11,6"/></svg>; }

function ReportNavIcon({size=14}) { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1.5" width="12" height="13" rx="1.5"/><line x1="5" y1="5.5" x2="11" y2="5.5"/><line x1="5" y1="8" x2="8" y2="8"/><circle cx="11" cy="11" r="2" stroke="currentColor" strokeWidth="1.2"/><line x1="12.4" y1="12.4" x2="14" y2="14"/></svg>; }
function CustomerIcon({size=14}) { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5.5" r="3"/><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5"/></svg>; }
function AccountIcon({size=14})  { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="2" y1="6" x2="14" y2="6"/><line x1="6" y1="6" x2="6" y2="14"/></svg>; }
function GrafanaIcon({size=14})  { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1,12 4,6 7,9 10,4 13,7 15,5"/><line x1="1" y1="14" x2="15" y2="14"/></svg>; }
function CredIcon({size=14})     { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/></svg>; }
function ScheduleIcon({size=14}) { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><polyline points="8,4.5 8,8 10.5,10"/></svg>; }
function LogIcon({size=14})      { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="14" height="12" rx="2"/><line x1="4" y1="6" x2="9" y2="6"/><line x1="4" y1="8.5" x2="12" y2="8.5"/><line x1="4" y1="11" x2="7" y2="11"/></svg>; }
function SettingsIcon({size=14}) { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>; }
function AlertIcon({size=14})    { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2L2 13h12L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r=".6" fill="currentColor" stroke="none"/></svg>; }
function ActivityIcon({size=14}) { return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1,8 4,5 6,9 9,3 12,7 15,4"/><line x1="1" y1="13" x2="15" y2="13"/></svg>; }

