import React, { useState, useEffect, useRef } from "react";

const LVL = { INFO:"#3b6ef5", SUCCESS:"#16a34a", WARN:"#d97706", ERROR:"#dc2626" };

export default function CustomerPage({
  customerId, navigate, ociSession,
  running, setRunning, statuses, setStatuses,
  logs, setLogs, activeLog, setActiveLog
}) {
  const [customer,     setCustomer]     = useState(null);
  const [argsModal,    setArgsModal]    = useState(null);
  const [credModal,    setCredModal]    = useState(null);
  const [history,      setHistory]      = useState([]);
  const logRef = useRef(null);
  const scrolled = useRef(false);

  const fetchHistory = () =>
    fetch("/api/history").then(r=>r.json()).then(setHistory).catch(()=>{});

  useEffect(() => {
    fetch("/api/customers/"+customerId).then(r=>r.json()).then(setCustomer).catch(()=>{});
    fetchHistory();
  }, [customerId]);

  useEffect(() => { scrolled.current = false; }, [activeLog]);
  useEffect(() => {
    if (logRef.current && !scrolled.current && logs[activeLog]) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
      scrolled.current = true;
    }
  }, [logs, activeLog]);

  // poll task status
  useEffect(() => {
    const entries = Object.entries(running||{});
    if (!entries.length) return;
    const iv = setInterval(async () => {
      for (const [aid, tid] of entries) {
        try {
          const d = await fetch("/api/status/"+tid).then(r=>r.json());
          if (d.status==="SUCCESS"||d.status==="FAILURE") {
            setStatuses(p=>({...p,[aid]:d.status}));
            setRunning(p=>{ const n={...p}; delete n[aid]; return n; });
            fetchLogs(aid); fetchHistory();
          } else { setStatuses(p=>({...p,[aid]:d.status})); }
        } catch(_) {}
      }
    }, 2500);
    return () => clearInterval(iv);
  }, [running]);

  // live log refresh
  useEffect(() => {
    if (!activeLog || !Object.keys(running||{}).includes(activeLog)) return;
    const iv = setInterval(() => fetchLogs(activeLog), 3000);
    return () => clearInterval(iv);
  }, [activeLog, running]);

  const fetchLogs = async (aid) => {
    try {
      const d = await fetch(`/api/logs/${customerId}/${aid}`).then(r=>r.json());
      setLogs(p=>({...p,[aid]:(d.logs||[]).join("")}));
    } catch(_) {}
  };

  const copyLog = () => {
    const t = logs[activeLog]||"";
    navigator.clipboard.writeText(t).catch(()=>{
      const ta = document.createElement("textarea"); ta.value=t;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    });
  };

  const handleRun = async (auto, args, creds) => {
    args = args||{};
    if (auto.requires_oci_login && !ociSession?.logged_in) {
      alert("This automation requires OCI login. Use the sidebar OCI button first.");
      return;
    }
    if (auto.args?.length && !Object.keys(args).length) { setArgsModal(auto); return; }
    setStatuses(p=>({...p,[auto.id]:"QUEUED"}));
    setActiveLog(auto.id);
    try {
      if (!creds) {
        const d = await fetch("/api/run",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({customer:customerId,automation:auto.id,args})}).then(r=>r.json());
        if (d.need_credentials) {
          setStatuses(p=>{const n={...p};delete n[auto.id];return n;});
          setCredModal({auto,args}); return;
        }
        if (d.task_id) { setRunning(p=>({...p,[auto.id]:d.task_id})); setTimeout(()=>fetchLogs(auto.id),1000); }
        return;
      }
      const d = await fetch("/api/run_with_credentials",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({customer:customerId,automation:auto.id,args,...creds})}).then(r=>r.json());
      if (d.task_id) {
        setRunning(p=>({...p,[auto.id]:d.task_id}));
        setCredModal(prev=>prev?{...prev,taskId:d.task_id}:null);
        setTimeout(()=>fetchLogs(auto.id),1000);
      }
    } catch(_) {}
  };

  const filesFor = () => []; // unused — files are now in FilesPage


  if (!customer) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--muted3)",fontFamily:"Inter,sans-serif"}}>
      <span className="spinner" style={{width:20,height:20,borderColor:"var(--muted3)",borderTopColor:"transparent",marginRight:10}}/> Loading…
    </div>
  );

  return (
    <div style={C.root}>

      {/* ── TOPBAR ── */}
      <header style={C.topbar}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button style={C.backBtn} onClick={()=>navigate("dashboard")}>← Dashboard</button>
          <div style={C.divider}/>
          <div>
            <div style={{fontSize:16,fontWeight:700,letterSpacing:"-.01em",color:"var(--text2)"}}>{customer.name}</div>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>
              {customer.platform} · {customer.automations.length} automations
              {history.length>0 && " · Last run: "+new Date(history[0].last_run).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button style={C.iconBtn} onClick={()=>fetchHistory()} title="Refresh">↻ Refresh</button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={C.body}>

        {/* LEFT: automation list */}
        <div style={C.left}>
          <div style={C.secHead}>
            <span style={C.secLabel}>Automation Jobs</span>
            <span style={{fontSize:11,color:"var(--muted)"}}>{customer.automations.length} jobs</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10,overflowY:"auto",flex:1,paddingRight:2}}>
            {customer.automations.map(auto => {
              const st     = statuses[auto.id];
              const isRun  = !!(running||{})[auto.id];
              const showLog= activeLog === auto.id;
              const noAuth = auto.requires_oci_login && !ociSession?.logged_in;
              const ICON   = {pptx:"📊",docx:"📝",report:"📋"}[auto.output_type]||"📄";
              const aFiles = filesFor(auto.id);
              const ST_STYLE = {
                QUEUED:   {bg:"rgba(217,119,6,.12)",  c:"#d97706"},
                STARTED:  {bg:"rgba(59,110,245,.12)", c:"#3b6ef5"},
                PENDING:  {bg:"rgba(59,110,245,.12)", c:"#3b6ef5"},
                SUCCESS:  {bg:"rgba(22,163,74,.12)",  c:"#16a34a"},
                FAILURE:  {bg:"rgba(220,38,38,.12)",  c:"#ef4444"},
                ERROR:    {bg:"rgba(220,38,38,.12)",  c:"#ef4444"},
              };
              const ss = ST_STYLE[st] || {};

              return (
                <div key={auto.id} style={{
                  ...C.jobCard,
                  ...(showLog ? {borderColor:"rgba(192,0,26,.4)"} : {}),
                  ...(noAuth  ? {opacity:.55} : {}),
                }}>
                  {/* header row */}
                  <div style={C.jobHeader}>
                    <div style={C.jobMark}>{ICON}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text2)",marginBottom:3,lineHeight:1.3}}>{auto.name}</div>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:7,lineHeight:1.5}}>{auto.description}</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        <Tag>{auto.schedule}</Tag>
                        <Tag>{auto.output_type}</Tag>
                        <Tag mono>{auto.id}</Tag>
                        {auto.requires_oci_credentials && (
                          <Tag color="amber">🔑 OCI Credentials</Tag>
                        )}
                        {auto.requires_oci_login && (
                          <Tag color={ociSession?.logged_in?"green":"amber"}>
                            {ociSession?.logged_in ? "🔓 OCI Ready" : "🔒 OCI Required"}
                          </Tag>
                        )}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0,marginLeft:8}}>
                      {st && (
                        <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:99,
                          textTransform:"uppercase",letterSpacing:".04em",
                          background:ss.bg||"var(--border)",color:ss.c||"var(--text4)",
                          display:"flex",alignItems:"center",gap:5}}>
                          {isRun && <span className="spinner" style={{width:8,height:8,borderWidth:1.5,borderColor:ss.c,borderTopColor:"transparent"}}/>}
                          {st}
                        </span>
                      )}
                      <button style={{
                        ...C.runBtn,
                        ...(isRun||noAuth ? {opacity:.4,cursor:"not-allowed"} : {}),
                      }} disabled={isRun||noAuth} onClick={()=>handleRun(auto)}>
                        {isRun
                          ? <><span className="spinner" style={{width:8,height:8,borderWidth:1.5,borderColor:"#fff",borderTopColor:"transparent"}}/> Running</>
                          : "▶ Run"}
                      </button>
                      <button style={{...C.logBtn,...(showLog?C.logBtnOn:{})}}
                        onClick={()=>{ setActiveLog(showLog?null:auto.id); if(!showLog) fetchLogs(auto.id); }}>
                        {showLog ? "✕" : "📄 Log"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: log viewer */}
        <div style={C.right}>
          <div style={C.secHead}>
            <span style={C.secLabel}>
              {activeLog
                ? <span style={{fontFamily:"monospace",fontSize:11,color:"var(--text4)"}}>{customerId}_{activeLog}.log</span>
                : "Log Viewer"
              }
            </span>
            {activeLog && (
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {(running||{})[activeLog] && (
                  <span style={{fontSize:10,color:"#3b6ef5",display:"flex",alignItems:"center",gap:4}}>
                    <span className="spinner" style={{width:8,height:8,borderWidth:1.5,borderColor:"#3b6ef5",borderTopColor:"transparent"}}/> live
                  </span>
                )}
                <button style={C.tinyBtn} onClick={copyLog} title="Copy">⎘</button>
                <button style={C.tinyBtn} onClick={()=>fetchLogs(activeLog)}>↻</button>
                <button style={C.tinyBtn} onClick={()=>setActiveLog(null)}>✕</button>
              </div>
            )}
          </div>
          {activeLog ? (
            <pre style={C.logPre} ref={logRef}>
              {logs[activeLog] || "Waiting for logs…"}
            </pre>
          ) : (
            <div style={C.logEmpty}>
              <div style={{fontSize:36,opacity:.15,marginBottom:12}}>📋</div>
              <div style={{fontSize:12,color:"var(--muted3)",lineHeight:1.7}}>
                Click <strong style={{color:"var(--muted)"}}>📄 Log</strong> on any automation<br/>to view its output here.
              </div>
            </div>
          )}
        </div>
      </div>

      {argsModal && (
        <ArgsModal auto={argsModal}
          onClose={()=>setArgsModal(null)}
          onRun={args=>{ setArgsModal(null); handleRun(argsModal,args); }}/>
      )}
      {credModal && (
        <OciCredModal
          auto={credModal.auto} args={credModal.args}
          taskId={credModal.taskId} customerId={customerId}
          onClose={()=>setCredModal(null)}
          onSubmit={creds=>handleRun(credModal.auto,credModal.args,creds)}/>
      )}
    </div>
  );
}

function Tag({ children, color, mono }) {
  const p = {
    green: {bg:"rgba(22,163,74,.1)",c:"#16a34a",b:"rgba(22,163,74,.25)"},
    amber: {bg:"rgba(217,119,6,.1)",c:"#d97706",b:"rgba(217,119,6,.25)"},
    red:   {bg:"rgba(220,38,38,.1)",c:"#ef4444",b:"rgba(220,38,38,.25)"},
  }[color] || {bg:"var(--border)",c:"var(--muted)",b:"var(--border2)"};
  return (
    <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:p.bg,color:p.c,
      border:`1px solid ${p.b}`,fontFamily:mono?"monospace":"inherit",fontWeight:600}}>
      {children}
    </span>
  );
}

const C = {
  root:    {height:"100%",display:"flex",flexDirection:"column",background:"var(--bg)",fontFamily:"Inter,system-ui,sans-serif",overflow:"hidden"},
  topbar:  {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",borderBottom:"1px solid var(--border)",flexShrink:0,background:"var(--bg2)"},
  backBtn: {background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--text4)",fontFamily:"Inter,sans-serif",fontSize:12,padding:"6px 13px",borderRadius:6,cursor:"pointer",transition:"all .15s"},
  iconBtn: {background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--text4)",fontFamily:"Inter,sans-serif",fontSize:11,padding:"5px 10px",borderRadius:5,cursor:"pointer"},
  divider: {width:1,height:24,background:"var(--border2)"},
  body:    {flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",overflow:"hidden",minHeight:0},
  left:    {display:"flex",flexDirection:"column",padding:"14px 12px 14px 24px",overflow:"hidden",borderRight:"1px solid var(--border)"},
  right:   {display:"flex",flexDirection:"column",padding:"14px 24px 14px 12px",overflow:"hidden",background:"var(--bg3)"},
  secHead: {display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexShrink:0},
  secLabel:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".09em",color:"var(--muted3)"},

  jobCard: {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden",transition:"border-color .18s",flexShrink:0},
  jobHeader:{display:"flex",alignItems:"flex-start",gap:11,padding:"13px 15px"},
  jobMark: {width:34,height:34,borderRadius:8,background:"var(--surface2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0},
  runBtn:  {background:"#1d4ed8",color:"#fff",border:"none",fontFamily:"Inter,sans-serif",fontSize:11,fontWeight:600,padding:"6px 14px",borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",transition:"opacity .15s"},
  logBtn:  {background:"var(--surface2)",color:"var(--text4)",border:"1px solid var(--border2)",fontFamily:"Inter,sans-serif",fontSize:11,padding:"5px 12px",borderRadius:6,cursor:"pointer",whiteSpace:"nowrap"},
  logBtnOn:{background:"var(--surface3)",color:"var(--text2)"},

  fileZone:    {borderTop:"1px solid var(--border)",padding:"12px 16px",background:"var(--bg3)"},
  fileZoneHead:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10},
  fileRow: {display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid var(--border)"},
  fileName:{flex:1,fontSize:11,color:"var(--text4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"monospace"},
  fileSz:  {fontSize:10,color:"var(--muted3)",flexShrink:0},
  dlBtn:   {background:"rgba(192,0,26,.1)",color:"#e53030",border:"1px solid rgba(192,0,26,.25)",fontSize:10,fontWeight:600,padding:"2px 9px",borderRadius:4,textDecoration:"none",flexShrink:0,transition:"all .15s"},
  tinyBtn: {background:"none",border:"1px solid var(--border2)",color:"var(--muted)",fontSize:10,padding:"2px 7px",borderRadius:4,cursor:"pointer",fontFamily:"Inter,sans-serif"},

  logPre:  {flex:1,overflowY:"auto",fontFamily:"'JetBrains Mono','Fira Code',monospace",fontSize:11,lineHeight:1.7,color:"#4ade80",padding:"12px 14px",margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"},
  logEmpty:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:32},
};

/* ── ArgsModal ── */
function ArgsModal({ auto, onClose, onRun }) {
  const today = new Date().toISOString().split("T")[0];
  const [vals, setVals] = useState(() => {
    const init = {};
    (auto.args||[]).forEach(a => {
      init[a.key] = a.default || (a.type==="date" ? today : a.type==="select" ? (a.options?.[0]?.value||"") : "");
    });
    return init;
  });

  const handleChange = (key, value) => {
    // Kalau month berubah, reset week_num ke "1" (week selalu 1-4 per bulan)
    if (key === "month_num") {
      setVals(p => ({ ...p, [key]: value, week_num: "1" }));
    } else {
      setVals(p => ({ ...p, [key]: value }));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><span>⚙️ {auto.name}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p className="modal-note">Set parameters before running:</p>
          {(auto.args||[]).map(arg => (
            <div key={arg.key}>
              <label className="form-label">{arg.label}</label>
              {arg.type === "select" ? (
                <select
                  className="form-input"
                  value={vals[arg.key] || ""}
                  onChange={e => handleChange(arg.key, e.target.value)}
                  style={{appearance:"auto"}}
                >
                  {(arg.options||[]).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  type={arg.type||"text"}
                  value={vals[arg.key]||""}
                  onChange={e => handleChange(arg.key, e.target.value)}
                />
              )}
            </div>
          ))}
          <button className="btn-primary" style={{marginTop:16}} onClick={()=>onRun(vals)}>▶ Run Now</button>
        </div>
      </div>
    </div>
  );
}

/* ── OciCredModal ── */
const OCI_KEY = "oci_cred_hist";
const loadHist = () => { try { return JSON.parse(localStorage.getItem(OCI_KEY)||"[]"); } catch { return []; } };
const saveHist = (t,u) => { const p=loadHist().filter(h=>!(h.tenancy===t&&h.username===u)); localStorage.setItem(OCI_KEY,JSON.stringify([{tenancy:t,username:u},...p].slice(0,5))); };

function OciCredModal({ auto, taskId:initTid, onClose, onSubmit }) {
  const hist = loadHist();
  const [tenancy,  setTenancy]  = useState(hist[0]?.tenancy||"");
  const [username, setUsername] = useState(hist[0]?.username||"");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [otp,      setOtp]      = useState("");
  const [taskId,   setTaskId]   = useState(initTid||null);
  const [step,     setStep]     = useState("creds"); // creds|otp|running|done|error
  const [msg,      setMsg]      = useState("");

  useEffect(() => { if (initTid && !taskId) setTaskId(initTid); }, [initTid]);

  useEffect(() => {
    if (!taskId || ["done","error","creds"].includes(step)) return;
    const iv = setInterval(async () => {
      try {
        const d = await fetch("/api/oci/login_state/"+taskId).then(r=>r.json());
        if (d.state==="otp_required" && step!=="otp") { setStep("otp"); setMsg("OTP sent to email. Enter the code:"); }
        else if (d.state==="running")  { setStep("running"); setMsg("Login OK — capturing screenshots…"); }
        else if (d.state==="success")  { clearInterval(iv); setStep("done"); setMsg("Done! File is ready."); setTimeout(onClose,2000); }
        else if (d.state==="error")    { clearInterval(iv); setStep("error"); setMsg((d.msg||"Unknown error").slice(0,250)); }
      } catch(_) {}
    }, 2000);
    return () => clearInterval(iv);
  }, [taskId, step]);

  const submit = () => {
    if (!username||!password) return;
    saveHist(tenancy,username); setStep("running"); setMsg("Submitting credentials…");
    onSubmit({tenancy,username,password});
  };

  const submitOtp = async () => {
    if (!otp||!taskId) return;
    setStep("running"); setMsg("Verifying OTP…");
    await fetch("/api/oci/otp",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({task_id:taskId,otp})});
    setMsg("OTP submitted — waiting for verification…");
  };

  return (
    <div className="modal-overlay" onClick={step==="creds"?onClose:undefined}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span>🔐 OCI Login — {auto.name}</span>
          {step==="creds" && <button className="modal-close" onClick={onClose}>✕</button>}
        </div>
        <div className="modal-body">

          {step==="creds" && (<>
            <p className="modal-note">Enter OCI credentials to run this automation.</p>
            <label className="form-label">Tenancy Name</label>
            <div style={{position:"relative"}}>
              <input className="form-input" value={tenancy} onChange={e=>setTenancy(e.target.value)}
                placeholder="tenancy-name" style={{paddingRight:hist.length?36:undefined}}/>
              {hist.length>0 && (
                <button onClick={()=>setShowHist(v=>!v)} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:13,color:"var(--muted)"}}>▾</button>
              )}
              {showHist && (
                <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:"var(--border)",border:"1px solid #32323e",borderRadius:7,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,.6)"}}>
                  {hist.map((h,i) => (
                    <div key={i} onClick={()=>{setTenancy(h.tenancy);setUsername(h.username);setShowHist(false);}}
                      style={{padding:"8px 13px",cursor:"pointer",fontSize:12,borderBottom:i<hist.length-1?"1px solid var(--border2)":"none"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#222"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <div style={{color:"var(--text2)",fontWeight:500}}>{h.tenancy||"—"}</div>
                      <div style={{color:"var(--muted)",fontSize:10}}>{h.username}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="form-label" style={{marginTop:10}}>Username / Email</label>
            <input className="form-input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="user@example.com"/>
            <label className="form-label" style={{marginTop:10}}>Password</label>
            <div style={{position:"relative"}}>
              <input className="form-input" type={showPwd?"text":"password"} value={password}
                onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={{paddingRight:40}}/>
              <button onClick={()=>setShowPwd(v=>!v)} style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:"var(--muted)"}}>
                {showPwd?"🙈":"👁"}
              </button>
            </div>
            <button className="btn-primary" style={{marginTop:16}} onClick={submit} disabled={!username||!password}>
              ▶ Login & Run
            </button>
          </>)}

          {step==="otp" && (<>
            <p className="modal-note">{msg}</p>
            <label className="form-label">OTP Code</label>
            <input className="form-input" type="text" value={otp} onChange={e=>setOtp(e.target.value)}
              placeholder="6-digit OTP" autoFocus/>
            <button className="btn-primary" style={{marginTop:16}} onClick={submitOtp} disabled={!otp}>
              ✓ Verify OTP
            </button>
          </>)}

          {step==="running" && (
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <span className="spinner" style={{width:24,height:24,margin:"0 auto 14px",display:"block",borderWidth:2.5}}/>
              <p className="modal-note">{msg||"Processing…"}</p>
            </div>
          )}

          {step==="done" && (
            <div style={{textAlign:"center",padding:"20px 0",fontSize:14,fontWeight:600,color:"#16a34a"}}>
              ✅ {msg}
            </div>
          )}

          {step==="error" && (
            <div>
              <div style={{color:"#f87171",fontSize:12,padding:"8px 0",lineHeight:1.6}}>{msg}</div>
              <button className="btn-danger" style={{marginTop:12}} onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
