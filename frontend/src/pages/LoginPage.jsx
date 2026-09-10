import React, { useState } from "react";

/* ── Enterprise SVG Dashboard Illustration ── */
function DashIllustration() {
  return (
    <svg viewBox="0 0 560 380" xmlns="http://www.w3.org/2000/svg"
      style={{width:"100%",maxWidth:540,height:"auto"}}>
      <defs>
        <radialGradient id="bg-glow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#B11226" stopOpacity=".15"/>
          <stop offset="100%" stopColor="#B11226" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B11226" stopOpacity=".9"/>
          <stop offset="100%" stopColor="#7F0D1B" stopOpacity=".7"/>
        </linearGradient>
        <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B11226"/>
          <stop offset="100%" stopColor="#EF4444"/>
        </linearGradient>
      </defs>

      {/* Background glow */}
      <ellipse cx="280" cy="150" rx="260" ry="180" fill="url(#bg-glow)"/>

      {/* ── Main window ── */}
      <rect x="60" y="30" width="440" height="280" rx="14"
        fill="var(--surface)" stroke="var(--border2)" strokeWidth="1.5"/>
      {/* Title bar */}
      <rect x="60" y="30" width="440" height="42" rx="14" fill="var(--surface2)"/>
      <rect x="60" y="58" width="440" height="14" fill="var(--surface2)"/>
      {/* Window controls */}
      <circle cx="85"  cy="51" r="6" fill="#EF4444" opacity=".8"/>
      <circle cx="103" cy="51" r="6" fill="#F59E0B" opacity=".8"/>
      <circle cx="121" cy="51" r="6" fill="#22C55E" opacity=".8"/>
      {/* Title bar text */}
      <rect x="215" y="44" width="130" height="14" rx="4" fill="var(--surface3)"/>
      <rect x="390" y="44" width="80"  height="14" rx="4" fill="var(--surface3)"/>

      {/* ── Sidebar ── */}
      <rect x="60" y="72" width="80" height="238" fill="var(--bg3)"/>
      {/* Sidebar accent */}
      <rect x="60" y="72" width="2" height="238" fill="#B11226" opacity=".6"/>
      {/* Sidebar nav items */}
      <rect x="68" y="85"  width="64" height="11" rx="4" fill="#B11226" opacity=".7"/>
      {[102,118,134,150,166,182,198].map((y,i)=>(
        <rect key={i} x="68" y={y} width={i===2||i===4?64:48} height="9" rx="4"
          fill="var(--surface3)" opacity=".6"/>
      ))}
      {/* Sidebar bottom user */}
      <circle cx="80" cy="285" r="8" fill="#B11226" opacity=".7"/>
      <rect x="92" y="280" width="44" height="7" rx="3" fill="var(--surface3)"/>
      <rect x="92" y="291" width="32" height="5" rx="2.5" fill="var(--surface2)"/>

      {/* ── Content area ── */}
      {/* KPI cards row */}
      {[0,1,2,3].map(i=>(
        <g key={i}>
          <rect x={148+i*98} y="78" width="88" height="52" rx="8"
            fill="var(--surface2)" stroke="var(--border2)" strokeWidth="1"/>
          {/* Left accent */}
          <rect x={148+i*98} y="78" width="2" height="52" rx="8"
            fill={["#B11226","#3B82F6","#22C55E","#F59E0B"][i]} opacity=".8"/>
          <rect x={156+i*98} y="88"  width={[28,24,32,20][i]} height="7" rx="3" fill="var(--border2)"/>
          <rect x={156+i*98} y="100" width={[18,14,22,12][i]} height="14" rx="3"
            fill={["#B11226","#3B82F6","#22C55E","#F59E0B"][i]} opacity=".7"/>
          <rect x={156+i*98} y="118" width={[22,18,26,16][i]} height="6" rx="2.5" fill="var(--surface3)"/>
        </g>
      ))}

      {/* ── Left panel: Jobs list ── */}
      <rect x="148" y="143" width="250" height="152" rx="8"
        fill="var(--surface2)" stroke="var(--border2)" strokeWidth="1"/>
      {/* Panel header */}
      <rect x="158" y="153" width="80" height="9" rx="3" fill="#363636"/>
      <rect x="338" y="155" width="50" height="7" rx="3" fill="var(--surface3)"/>
      {/* Job rows */}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="158" y={172+i*22} width="230" height="17" rx="5"
            fill={i===2?"rgba(177,18,38,.06)":"var(--surface)"}
            stroke={i===2?"rgba(177,18,38,.3)":"var(--border)"} strokeWidth=".8"/>
          {/* icon */}
          <rect x="162" y={175+i*22} width="10" height="10" rx="2.5" fill="var(--surface3)"/>
          {/* name */}
          <rect x="176" y={176+i*22} width={[90,80,70,85,75][i]} height="5" rx="2" fill="#363636"/>
          <rect x="176" y={183+i*22} width={[60,55,48,58,52][i]} height="4" rx="1.5" fill="var(--surface3)"/>
          {/* status */}
          <rect x={330} y={177+i*22} width="28" height="8" rx="3"
            fill={i===2?"rgba(245,158,11,.2)":i===4?"rgba(34,197,94,.12)":"rgba(177,18,38,.12)"}/>
          <rect x={320} y={176+i*22} width="15" height="10" rx="3" fill="#B11226" opacity=".5"/>
        </g>
      ))}

      {/* ── Right panel: Chart ── */}
      <rect x="408" y="143" width="180" height="95" rx="8"
        fill="var(--surface2)" stroke="var(--border2)" strokeWidth="1"/>
      {/* Chart header */}
      <rect x="418" y="153" width="60" height="9" rx="3" fill="#363636"/>
      {/* Bar chart */}
      {[
        {x:418,h:32},{x:432,h:45},{x:446,h:28},{x:460,h:52},
        {x:474,h:38},{x:488,h:62},{x:502,h:44},{x:516,h:55},
        {x:530,h:48},{x:544,h:58},{x:558,h:40},{x:572,h:65},
      ].filter(b=>b.x<580).map((b,i)=>(
        <rect key={i} x={b.x} y={207-b.h} width="9" height={b.h} rx="2"
          fill={i>=8?"url(#bar-grad)":"var(--border2)"} opacity=".8"/>
      ))}
      {/* Line overlay */}
      <polyline
        points="418,198 432,188 446,202 460,178 474,192 488,165 502,178 516,172 530,182 544,168 558,175"
        fill="none" stroke="url(#line-grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Dot */}
      <circle cx="545" cy="168" r="3" fill="#B11226"/>
      <circle cx="545" cy="168" r="6" fill="#B11226" opacity=".2"/>

      {/* ── Right panel: Activity ── */}
      <rect x="408" y="247" width="180" height="48" rx="8"
        fill="var(--surface2)" stroke="var(--border2)" strokeWidth="1"/>
      <rect x="418" y="255" width="60" height="8" rx="3" fill="#363636"/>
      {[0,1].map(i=>(
        <g key={i}>
          <circle cx="422" cy={271+i*14} r="3"
            fill={["#22C55E","#22C55E"][i]}
            style={{filter:`drop-shadow(0 0 3px ${["#22C55E","22C55E"][i]})`}}/>
          <rect x="429" y={268+i*14} width={[90,75][i]} height="6" rx="2.5" fill="var(--surface3)"/>
          <rect x={480} y={269+i*14} width="30" height="5" rx="2" fill="rgba(34,197,94,.12)"/>
        </g>
      ))}

      {/* ── Log panel ── */}
      <rect x="148" y="304" width="440" height="0" rx="0" fill="none"/>
      {/* Log stream bar at bottom of main window */}
      <rect x="148" y="304" width="440" height="6" fill="var(--bg)"/>
      <rect x="148" y="304" width="440" height="1" fill="var(--border)"/>

      {/* ── Floating cards ── */}
      {/* Card: Report ready */}
      <g transform="translate(10,35)">
        <rect width="130" height="55" rx="10" fill="var(--surface2)"
          stroke="var(--border2)" strokeWidth="1"/>
        <rect x="0" y="0" width="130" height="2" rx="2" fill="#B11226"/>
        <rect x="10" y="12"  width="70" height="8" rx="3" fill="#363636"/>
        <rect x="10" y="25"  width="50" height="6" rx="2.5" fill="var(--surface3)"/>
        <rect x="10" y="36"  width="65" height="12" rx="5" fill="rgba(34,197,94,.12)"/>
        <rect x="18" y="40"  width="40" height="5" rx="2" fill="rgba(34,197,94,.4)"/>
      </g>

      {/* Card: Jobs active */}
      <g transform="translate(420,5)">
        <rect width="130" height="55" rx="10" fill="var(--surface2)"
          stroke="var(--border2)" strokeWidth="1"/>
        <rect x="0" y="0" width="130" height="2" rx="2" fill="#3B82F6"/>
        <rect x="10" y="12" width="50" height="8" rx="3" fill="#363636"/>
        <rect x="10" y="26" width="36" height="18" rx="5" fill="rgba(59,130,246,.1)"/>
        <rect x="18" y="31" width="20" height="8" rx="3" fill="#3B82F6" opacity=".6"/>
        <rect x="60" y="12" width="26" height="26" rx="6" fill="var(--surface2)" stroke="var(--border2)" strokeWidth="1"/>
        <text x="73" y="28" textAnchor="middle" fontSize="12" fontWeight="700"
          fill="#22C55E" fontFamily="Inter,sans-serif">✓</text>
      </g>

      {/* Card: Alert */}
      <g transform="translate(10,290)">
        <rect width="130" height="50" rx="10" fill="var(--surface2)"
          stroke="var(--border2)" strokeWidth="1"/>
        <rect x="10" y="12" width="55" height="8" rx="3" fill="#363636"/>
        <rect x="10" y="26" width="80" height="6" rx="2.5" fill="var(--surface3)"/>
        <rect x="10" y="36" width="50" height="6" rx="2.5" fill="var(--surface2)"/>
        <rect x="100" y="12" width="20" height="20" rx="5"
          fill="rgba(177,18,38,.15)" stroke="rgba(177,18,38,.3)" strokeWidth="1"/>
        <text x="110" y="25" textAnchor="middle" fontSize="10"
          fill="#B11226" fontFamily="Inter,sans-serif">!</text>
      </g>
    </svg>
  );
}

export default function LoginPage({ onLogin }) {
  const REMEMBER_KEY = "pr_remember_credentials";

  // Load saved credentials on mount
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(REMEMBER_KEY) || "{}"); } catch { return {}; }
  })();

  const [username,  setUsername]  = useState(saved.username || "");
  const [password,  setPassword]  = useState(saved.password || "");
  const [remember,  setRemember]  = useState(!!saved.username);
  const [showPwd,   setShowPwd]   = useState(false);
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.ok) {
        // Save atau hapus credentials sesuai pilihan remember
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, password }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
        sessionStorage.setItem("pr_auth",    "1");
        sessionStorage.setItem("pr_user",    data.username);
        sessionStorage.setItem("pr_display", data.display);
        sessionStorage.setItem("pr_role",    data.role);
        fetch("/api/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: data.username, display: data.display,
            action: "Login", category: "auth",
            detail: `Logged in as ${data.role}`,
          }),
        }).catch(() => {});
        onLogin();
      } else {
        setError(data.error || "Invalid username or password.");
      }
    } catch (_) {
      setError("Cannot connect to server. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={L.root}>

      {/* ── LEFT: Form ── */}
      <div style={L.left}>
        {/* Accent top bar */}
        <div style={L.accentBar}/>

        {/* Form body — tanpa brand header */}
        <div style={L.formBody}>
          {/* Logo block */}
          <div style={{textAlign:"center",marginBottom:22}}>
            <img src="/logo.svg" alt="ICS Compute"
              style={{width:64,height:64,borderRadius:14,
                marginBottom:12,display:"block",margin:"0 auto 12px"}}/>
            <h1 style={L.heading}>Welcome back</h1>
            <p style={L.subheading}>
              Sign in to your enterprise automation and report management platform.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={L.form}>
            <div style={L.fieldGroup}>
              <label style={L.label}>USERNAME</label>
              <input style={L.input} type="text" value={username}
                onChange={e=>setUsername(e.target.value)}
                autoFocus autoComplete="username" placeholder="Enter your username"/>
            </div>

            <div style={L.fieldGroup}>
              <label style={L.label}>PASSWORD</label>
              <div style={{position:"relative"}}>
                <input style={{...L.input,paddingRight:44}}
                  type={showPwd?"text":"password"} value={password}
                  onChange={e=>setPassword(e.target.value)}
                  autoComplete="current-password" placeholder="Enter your password"/>
                <button type="button" onClick={()=>setShowPwd(v=>!v)}
                  style={{position:"absolute",right:12,top:"50%",
                    transform:"translateY(-50%)",background:"none",border:"none",
                    cursor:"pointer",fontSize:14,color:"var(--muted2)",lineHeight:1}}>
                  {showPwd?"🙈":"👁"}
                </button>
              </div>
            </div>

            {error && (
              <div style={L.errBox}>
                <span>⚠</span> {error}
              </div>
            )}
            {/* Remember me */}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input
                id="remember-me"
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{ width:14, height:14, cursor:"pointer", accentColor:"#B11226" }}
              />
              <label htmlFor="remember-me"
                style={{ fontSize:11, color:"var(--muted)", cursor:"pointer", userSelect:"none" }}>
                Remember me
              </label>
            </div>

            <button type="submit" style={{
              ...L.submitBtn,
              opacity:(loading||!username||!password)?.4:1,
              cursor:(loading||!username||!password)?"not-allowed":"pointer",
            }} disabled={loading||!username||!password}>
              {loading
                ? <><span className="spinner" style={{width:12,height:12,borderWidth:1.5}}/> Signing in…</>
                : "Sign In →"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div style={L.footer}>
          <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:8}}>
            {[
              {n:"Oracle OCI",  c:"#F97316"},
              {n:"AWS",         c:"#F59E0B"},
              {n:"Huawei Cloud",c:"#EF4444"},
            ].map(p=>(
              <span key={p.n} style={{fontSize:9,fontWeight:700,
                padding:"2px 8px",borderRadius:99,
                background:`${p.c}12`,color:p.c,
                border:`1px solid ${p.c}20`}}>
                {p.n}
              </span>
            ))}
          </div>
          <div style={{fontSize:10,color:"#363636",textAlign:"center"}}>
            ICS Compute · Portal Report · v2.0
          </div>
        </div>
      </div>

      {/* ── RIGHT: Illustration + Info ── */}
      <div style={L.right}>
        {/* Grid background */}
        <div style={L.gridBg}/>
        {/* Radial glow */}
        <div style={L.glow}/>

        <div style={L.rightContent}>
          {/* Hero */}
          <div style={{textAlign:"center",marginBottom:20}}>
            <h2 style={L.heroTitle}>Portal Report</h2>
            <p style={L.heroSub}>by ICS Compute</p>
            <p style={L.heroDesc}>
              Centralize, automate, and monitor all your cloud infrastructure
              reports across Oracle OCI, AWS, and Huawei Cloud in real-time.
            </p>
          </div>

          {/* Illustration */}
          <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",
            justifyContent:"center",padding:"0 10px"}}>
            <DashIllustration/>
          </div>

          {/* Stats strip */}
          <div style={L.statsStrip}>
            {[
              {val:"99.9%", label:"Uptime"},
              {val:"24/7",  label:"Monitoring"},
              {val:"Multi", label:"Cloud"},
              {val:"Auto",  label:"Reporting"},
            ].map((s,i)=>(
              <div key={i} style={L.statItem}>
                <div style={{fontSize:14,fontWeight:700,color:"var(--text)",letterSpacing:"-.02em"}}>{s.val}</div>
                <div style={{fontSize:9,color:"var(--muted2)",textTransform:"uppercase",letterSpacing:".07em"}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Trust badges */}
          <div style={L.trustRow}>
            {["🔒 Data Secured","🔗 End-to-End Encrypted","🛡 Restricted Access","📜 Audit Trail"].map((t,i)=>(
              <span key={i} style={{fontSize:9,color:"var(--border2)"}}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const L = {
  root:       {width:"100vw",height:"100vh",display:"flex",overflow:"hidden",
               background:"var(--bg)",fontFamily:"'Inter',system-ui,sans-serif",color:"var(--text)"},
  /* left */
  left:       {width:"30%",minWidth:280,maxWidth:340,background:"var(--bg2)",
               borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",flexShrink:0},
  accentBar:  {height:2,background:"linear-gradient(90deg,#7F0D1B,#B11226,#7F0D1B)",flexShrink:0},
  brand:      {display:"flex",alignItems:"center",gap:10,padding:"16px 24px 14px",
               borderBottom:"1px solid var(--border)"},
  brandMark:  {width:32,height:32,borderRadius:8,background:"#B11226",
               display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  brandName:  {fontSize:13,fontWeight:700,letterSpacing:"-.02em",color:"var(--text)"},
  brandSub:   {fontSize:9,color:"var(--muted2)",marginTop:1},
  formBody:   {flex:1,display:"flex",flexDirection:"column",justifyContent:"center",
               padding:"0 28px",paddingBottom:"10%",overflow:"hidden"},
  heading:    {fontSize:20,fontWeight:700,letterSpacing:"-.03em",marginBottom:6,color:"var(--text)"},
  subheading: {fontSize:11,color:"var(--muted)",lineHeight:1.65,maxWidth:230,margin:"0 auto"},
  form:       {display:"flex",flexDirection:"column",gap:14},
  fieldGroup: {display:"flex",flexDirection:"column",gap:5},
  label:      {fontSize:9,fontWeight:700,letterSpacing:".1em",color:"var(--muted2)"},
  input:      {width:"100%",background:"var(--surface2)",border:"1px solid var(--border2)",
               color:"var(--text)",fontFamily:"inherit",fontSize:12,
               padding:"10px 13px",borderRadius:8,outline:"none",
               boxSizing:"border-box",transition:"border-color .15s,box-shadow .15s"},
  errBox:     {display:"flex",alignItems:"center",gap:7,fontSize:11,
               background:"var(--red-dim)",color:"#F87171",
               border:"1px solid rgba(239,68,68,.2)",padding:"9px 12px",borderRadius:7},
  submitBtn:  {background:"#B11226",color:"#fff",border:"none",fontFamily:"inherit",
               fontSize:12,fontWeight:600,padding:"11px",borderRadius:8,
               display:"flex",alignItems:"center",justifyContent:"center",gap:7,
               transition:"background .15s",marginTop:2,letterSpacing:".02em"},
  footer:     {padding:"14px 24px 18px",borderTop:"1px solid var(--border)"},
  /* right */
  right:      {flex:1,background:"var(--bg)",overflow:"hidden",position:"relative",display:"flex"},
  gridBg:     {position:"absolute",inset:0,
               backgroundImage:"linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
               backgroundSize:"40px 40px",opacity:.5,pointerEvents:"none"},
  glow:       {position:"absolute",width:"60%",height:"60%",borderRadius:"50%",
               background:"radial-gradient(circle,rgba(177,18,38,.1) 0%,transparent 70%)",
               top:"-10%",left:"20%",pointerEvents:"none"},
  rightContent:{position:"relative",zIndex:1,flex:1,display:"flex",flexDirection:"column",
               padding:"24px 32px 20px",overflow:"hidden"},
  heroLabel:  {fontSize:9,fontWeight:700,letterSpacing:".15em",color:"#B11226",
               textTransform:"uppercase",marginBottom:8},
  heroTitle:  {fontSize:26,fontWeight:700,letterSpacing:"-.03em",marginBottom:4,color:"var(--text)"},
  heroSub:    {fontSize:12,color:"#B11226",fontWeight:600,marginBottom:10},
  heroDesc:   {fontSize:11,color:"var(--muted)",lineHeight:1.7,maxWidth:420,margin:"0 auto"},
  statsStrip: {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12,flexShrink:0},
  statItem:   {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,
               padding:"10px 8px",textAlign:"center"},
  trustRow:   {display:"flex",justifyContent:"space-between",paddingTop:10,
               borderTop:"1px solid var(--border)",flexShrink:0},
};
