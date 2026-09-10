import React, { useState, useEffect, useCallback } from "react";
import { logActivity } from "../activityLog.js";

/* ── Constants ── */
const OLD_STORAGE_KEY = "portal_report_daily_tasks";
const STATUS_OPTIONS  = ["In Progress", "Close", "Pending", "Cancelled"];
const STATUS_STYLE    = {
  "Close":       { bg:"rgba(34,197,94,.1)",  text:"#4ADE80", border:"rgba(34,197,94,.25)"  },
  "In Progress": { bg:"rgba(59,130,246,.1)", text:"#60A5FA", border:"rgba(59,130,246,.25)" },
  "Pending":     { bg:"rgba(245,158,11,.1)", text:"#FBBF24", border:"rgba(245,158,11,.25)" },
  "Cancelled":   { bg:"rgba(239,68,68,.1)",  text:"#F87171", border:"rgba(239,68,68,.25)"  },
};

/* ── API helpers ── */
const apiGet = () =>
  fetch("/api/tasks")
    .then(r => r.json())
    .then(tasks =>
      Array.isArray(tasks)
        ? tasks.filter(t => String(t?.start || "").trim() !== "")
        : []
    );
const apiCreate = (task)        => fetch("/api/tasks",            { method:"POST",   headers:{"Content-Type":"application/json"}, body:JSON.stringify(task)   }).then(r => r.json());
const apiUpdate = (id, changes) => fetch(`/api/tasks/${id}`,      { method:"PUT",    headers:{"Content-Type":"application/json"}, body:JSON.stringify(changes)}).then(r => r.json());
const apiDelete = (id)          => fetch(`/api/tasks/${id}`,      { method:"DELETE" }).then(r => r.json());
const apiRequestDelete  = (id, user) => fetch(`/api/tasks/${id}/request-delete`,  { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(user)  }).then(r => r.json());
const apiApproveDelete  = (id, action) => fetch(`/api/tasks/${id}/approve-delete`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action}) }).then(r => r.json());
const apiPendingDeletes = ()    => fetch("/api/tasks/pending-deletes").then(r => r.json());

/* ── One-time migration: DISABLED — data lama sudah dibersihkan ── */
async function migrateLocalStorage() {
  localStorage.removeItem("pr_tasks_migrated"); // reset flag juga
}

/* ── Export CSV ── */
function exportCSV(tasks, label) {
  const headers = ["No","Customer","Description","Date","Start","End","Engineer","Status","Detail"];
  const rows    = tasks.map((t,i) => [
    i+1, t.customer||"", t.description||"", t.date||"",
    t.start||"", t.end||"", t.pic||"", t.status||"",
    (t.detail||"").replace(/\n/g," | "),
  ]);
  const csv  = [headers,...rows].map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`daily_task_${label}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ── Download Modal ── */
function DownloadModal({ tasks, onClose }) {
  const now  = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  const [mode,  setMode]  = useState("month");
  const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const filtered  = mode==="all" ? tasks : tasks.filter(t=>(t.date||"").startsWith(month));
  const monthLabel= mode==="all" ? "semua" : (()=>{ const [y,m]=month.split("-"); return `${MONTH_NAMES[parseInt(m)-1]}_${y}`; })();

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
      <div style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,width:400,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid var(--border)",background:"var(--bg3)"}}>
          <span style={{fontSize:14}}>📥</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--text2)"}}>Download Daily Task</div>
            <div style={{fontSize:10,color:"var(--muted)"}}>Export ke CSV</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",fontSize:16,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{padding:"16px"}}>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[["month","Per Bulan"],["all","Semua Data"]].map(([v,l])=>(
              <button key={v} onClick={()=>setMode(v)} style={{flex:1,padding:"7px 0",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,background:mode===v?"#B11226":"var(--surface2)",border:mode===v?"1px solid #B11226":"1px solid var(--border2)",color:mode===v?"#fff":"var(--muted)"}}>{l}</button>
            ))}
          </div>
          {mode==="month" && (
            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,color:"var(--muted)",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:".06em"}}>Pilih Bulan</label>
              <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{width:"100%",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:6,color:"var(--text3)",fontSize:11,padding:"6px 10px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            </div>
          )}
          <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:"var(--muted)"}}>Total task</span>
            <span style={{fontSize:16,fontWeight:700,color:"var(--text2)"}}>{filtered.length}</span>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {[{label:"Close",val:filtered.filter(t=>t.status==="Close").length,c:"#4ADE80"},{label:"In Progress",val:filtered.filter(t=>t.status==="In Progress").length,c:"#60A5FA"},{label:"Pending",val:filtered.filter(t=>t.status==="Pending").length,c:"#FBBF24"},{label:"Cancelled",val:filtered.filter(t=>t.status==="Cancelled").length,c:"#F87171"}].map(s=>(
              <div key={s.label} style={{flex:1,textAlign:"center",background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:6,padding:"6px 4px"}}>
                <div style={{fontSize:15,fontWeight:700,color:s.c}}>{s.val}</div>
                <div style={{fontSize:9,color:"var(--muted2)",marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>
          <button disabled={filtered.length===0} onClick={()=>{exportCSV(filtered,monthLabel);onClose();}} style={{width:"100%",background:filtered.length===0?"var(--surface2)":"#B11226",border:"none",borderRadius:6,color:filtered.length===0?"var(--muted)":"#fff",fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"10px 0",cursor:filtered.length===0?"not-allowed":"pointer"}}>
            {filtered.length===0?"Tidak ada data":`📥 Download CSV (${filtered.length} tasks)`}
          </button>
        </div>
      </div>
    </div>
  );
}

const makeEmptyForm = () => ({
  customer:"", description:"", date:"", start:"", end:"",
  pic: sessionStorage.getItem("pr_display") || sessionStorage.getItem("pr_user") || "",
  status:"In Progress", detail:""
});

export default function DailyTask({ customers }) {
  const role    = sessionStorage.getItem("pr_role") || "admin";
  const isAdmin = role === "admin" || (sessionStorage.getItem("pr_user") || "") === "admin";
  const currentUser    = sessionStorage.getItem("pr_user")    || "";
  const currentDisplay = sessionStorage.getItem("pr_display") || currentUser;

  const [tasks,          setTasks]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showModal,      setShowModal]      = useState(false);
  const [editId,         setEditId]         = useState(null);
  const [form,           setForm]           = useState(makeEmptyForm);
  const [filterDate,     setFilterDate]     = useState("");
  const [filterCust,     setFilterCust]     = useState("");
  const [filterSt,       setFilterSt]       = useState("");
  const [viewTask,       setViewTask]       = useState(null);
  const [showDownload,   setShowDownload]   = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState([]); // [{task_id, task_desc, requested_by, ...}]
  const [showPending,    setShowPending]    = useState(false);

  const today = new Date().toISOString().split("T")[0];

  /* ── Load tasks dari API ── */
  const loadTasks = useCallback(async () => {
    try {
      const data = await apiGet();
      setTasks(Array.isArray(data) ? data : []);
    } catch(_) {}
    setLoading(false);
  }, []);

  const loadPendingDeletes = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await apiPendingDeletes();
      setPendingDeletes(Array.isArray(data) ? data : []);
    } catch(_) {}
  }, [isAdmin]);

  useEffect(() => {
    loadTasks();
    loadPendingDeletes();
    const iv = setInterval(() => { loadTasks(); loadPendingDeletes(); }, 30000);
    return () => clearInterval(iv);
  }, [loadTasks, loadPendingDeletes]);

  /* ── Create / Edit ── */
  const openCreate = () => {
    setEditId(null);
    setForm({ ...makeEmptyForm(), date: today });
    setShowModal(true);
  };
  const openEdit = (t) => { setEditId(t.id); setForm({...t}); setShowModal(true); };

  const handleSubmit = async () => {
    if (!form.customer || !form.description) return;
    if (editId) {
      await apiUpdate(editId, form);
      logActivity("Edit Task", "task", `${form.description} — ${form.customer}`);
    } else {
      await apiCreate({ ...form, createdAt: new Date().toISOString() });
      logActivity("Create Task", "task", `[${form.customer}] ${form.description}${form.detail ? " — "+form.detail.slice(0,80):""}`);
    }
    setShowModal(false);
    setEditId(null);
    loadTasks();
  };

  const handleDelete = async (id) => {
    const t = tasks.find(t => t.id === id);
    if (isAdmin) {
      // Admin langsung hapus
      if (!window.confirm(`Delete task ${t?.taskNo || id}?`)) return;
      await apiDelete(id);
      if (viewTask?.id === id) setViewTask(null);
      loadTasks();
      loadPendingDeletes();
    } else {
      // Engineer kirim request
      if (!window.confirm(`Request deletion for task ${t?.taskNo || id}?\nAdmin will need to approve.`)) return;
      const res = await apiRequestDelete(id, { username: currentUser, display: currentDisplay });
      if (res.status === "already_requested") {
        alert("Delete request already sent. Waiting for admin approval.");
      } else {
        alert("Delete request sent. Admin will review your request.");
        logActivity("Request Delete Task", "task", `${t?.description || id} (${t?.taskNo || ""})`);
      }
    }
  };

  const handleApproveDelete = async (taskId, action) => {
    await apiApproveDelete(taskId, action);
    loadTasks();
    loadPendingDeletes();
  };

  const handleStatusChange = async (id, status) => {
    const t = tasks.find(t => t.id === id);
    await apiUpdate(id, { status });
    if (t) logActivity("Update Task Status", "task", `${t.description} → ${status}`);
    // Optimistic update
    setTasks(p => p.map(x => x.id===id ? {...x,status} : x));
  };

  /* ── Filtered ── */
  const filtered = tasks.filter(t => {
    if (filterDate && t.date !== filterDate) return false;
    if (filterCust && t.customer !== filterCust) return false;
    if (filterSt   && t.status  !== filterSt)   return false;
    return true;
  });

  const total      = tasks.length;
  const done       = tasks.filter(t=>t.status==="Close").length;
  const inProg     = tasks.filter(t=>t.status==="In Progress").length;
  const pending    = tasks.filter(t=>t.status==="Pending").length;
  const todayTasks = tasks.filter(t=>t.date===today).length;
  const allCustomers = [...new Set(tasks.map(t=>t.customer).filter(Boolean))];

  return (
    <div style={T.root}>

      {/* ── HEADER ── */}
      <div style={T.header}>
        <div>
          <h1 style={T.title}>Daily Task</h1>
          <p style={T.sub}>
            {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
            {todayTasks > 0 && ` · ${todayTasks} task${todayTasks>1?"s":""} today`}
          </p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={loadTasks} style={{...T.addBtn,background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--muted)"}}>↻</button>
          <button style={{...T.addBtn,background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--muted)"}} onClick={()=>setShowDownload(true)}>📥 Download</button>
          {isAdmin && pendingDeletes.length > 0 && (
            <button onClick={()=>setShowPending(true)} style={{
              ...T.addBtn, background:"rgba(239,68,68,.12)",
              border:"1px solid rgba(239,68,68,.35)", color:"#F87171",
              display:"flex", alignItems:"center", gap:6,
            }}>
              🗑 Delete Requests
              <span style={{background:"#EF4444",color:"#fff",fontSize:10,fontWeight:700,
                padding:"1px 6px",borderRadius:10,lineHeight:1.4}}>
                {pendingDeletes.length}
              </span>
            </button>
          )}
          <button style={T.addBtn} onClick={openCreate}>+ Create Task</button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div style={T.statRow}>
        {[
          {label:"Total Tasks",  val:total,     c:"var(--text2)",bg:"rgba(255,255,255,.04)"},
          {label:"Close",        val:done,      c:"#4ADE80",    bg:"rgba(34,197,94,.06)"},
          {label:"In Progress",  val:inProg,    c:"#60A5FA",    bg:"rgba(59,130,246,.06)"},
          {label:"Pending",      val:pending,   c:"#FBBF24",    bg:"rgba(245,158,11,.06)"},
          {label:"Today's Tasks",val:todayTasks,c:"#B11226",    bg:"rgba(177,18,38,.06)"},
        ].map((s,i)=>(
          <div key={i} style={{...T.statCard,background:s.bg}}>
            <div style={{fontSize:22,fontWeight:700,color:s.c,letterSpacing:"-.03em"}}>{s.val}</div>
            <div style={{fontSize:10,color:"var(--muted2)",marginTop:4,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div style={T.filterRow}>
        <div style={T.filterLabel}>FILTER:</div>
        <input type="date" style={T.filterInput} value={filterDate} onChange={e=>setFilterDate(e.target.value)}/>
        <select style={T.filterInput} value={filterCust} onChange={e=>setFilterCust(e.target.value)}>
          <option value="">All Customers</option>
          {[...customers.map(c=>c.name),...allCustomers].filter((v,i,a)=>a.indexOf(v)===i).map(c=><option key={c}>{c}</option>)}
        </select>
        <select style={T.filterInput} value={filterSt} onChange={e=>setFilterSt(e.target.value)}>
          <option value="">All Status</option>
          {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
        </select>
        {(filterDate||filterCust||filterSt) && (
          <button style={T.clearFilterBtn} onClick={()=>{setFilterDate("");setFilterCust("");setFilterSt("");}}>× Clear</button>
        )}
        <span style={{fontSize:10,color:"var(--muted3)",marginLeft:"auto"}}>{filtered.length} of {total} tasks</span>
      </div>

      {/* ── TABLE ── */}
      <div style={T.tableWrap}>
        {loading ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"40px",color:"var(--muted)",gap:10}}>
            <span className="spinner" style={{width:16,height:16}}/>Loading tasks…
          </div>
        ) : (
          <table style={T.table}>
            <thead>
              <tr>{["Task No","Customer","Task Description","Date","Start","End","Engineer","Status","Actions"].map(h=>(
                <th key={h} style={T.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={9} style={{textAlign:"center",padding:"32px",color:"var(--muted3)",fontSize:12,fontStyle:"italic"}}>
                  {tasks.length===0 ? "No tasks yet — click \"Create Task\" to add one" : "No tasks match the current filter"}
                </td></tr>
              ) : filtered.map((t,i)=>(
                <tr key={t.id}
                  style={{background:i%2===0?"transparent":"var(--row-alt)",transition:"background .1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--row-hover)"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"var(--row-alt)"}>
                  <td style={{...T.td,fontFamily:"monospace",color:"#B11226",fontWeight:600}}>{t.taskNo}</td>
                  <td style={T.td}>
                    <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:4,background:"rgba(177,18,38,.1)",color:"#B11226",border:"1px solid rgba(177,18,38,.2)"}}>{t.customer||"—"}</span>
                  </td>
                  <td style={{...T.td,maxWidth:220}}>
                    <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:11,color:"var(--text3)"}} title={t.description}>{t.description}</div>
                    {t.detail && <div style={{fontSize:9,color:"var(--muted2)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t.detail}>{t.detail}</div>}
                  </td>
                  <td style={{...T.td,fontFamily:"monospace",fontSize:10,color:"var(--muted)"}}>{t.date||"—"}</td>
                  <td style={{...T.td,fontFamily:"monospace",fontSize:10,color:"var(--muted)"}}>{t.start||"—"}</td>
                  <td style={{...T.td,fontFamily:"monospace",fontSize:10,color:"var(--muted)"}}>{t.end||"—"}</td>
                  <td style={{...T.td,fontSize:11,color:"var(--text4)"}}>{t.pic||"—"}</td>
                  <td style={T.td}>
                    <select value={t.status} onChange={e=>handleStatusChange(t.id,e.target.value)}
                      style={{background:STATUS_STYLE[t.status]?.bg||"var(--surface2)",color:STATUS_STYLE[t.status]?.text||"var(--text4)",border:`1px solid ${STATUS_STYLE[t.status]?.border||"var(--border2)"}`,fontFamily:"inherit",fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:5,cursor:"pointer",outline:"none"}}>
                      {STATUS_OPTIONS.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={T.td}>
                    <div style={{display:"flex",gap:5}}>
                      <button style={T.editBtn} onClick={()=>openEdit(t)} title="Edit">✏</button>
                      <button style={T.viewBtn} onClick={()=>setViewTask(t)} title="View">👁</button>
                      {pendingDeletes.some(p => p.task_id === t.id) ? (
                        <span style={{...T.delBtn,cursor:"default",opacity:.5,fontSize:9,
                          width:"auto",padding:"0 5px",whiteSpace:"nowrap"}}
                          title="Waiting for admin approval">⏳ Pending</span>
                      ) : (
                        <button
                          style={{...T.delBtn,
                            ...(isAdmin ? {} : {background:"rgba(245,158,11,.08)",color:"#FBBF24",border:"1px solid rgba(245,158,11,.2)"})
                          }}
                          onClick={()=>handleDelete(t.id)}
                          title={isAdmin ? "Delete" : "Request Delete"}>
                          {isAdmin ? "✕" : "🗑"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CREATE/EDIT MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal" style={{width:540,maxWidth:"95vw"}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span>{editId ? "✏ Edit Task" : "+ Create New Task"}</span>
              <button className="modal-close" onClick={()=>setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label className="form-label">Customer *</label>
                  <select className="form-input" value={form.customer} onChange={e=>setForm(p=>({...p,customer:e.target.value}))}>
                    <option value="">— Select —</option>
                    {customers.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" >Engineer (Person In Charge)</label>
                  <select className="form-input" value={form.pic} onChange={e=>setForm(p=>({...p,pic:e.target.value}))}>
                    <option value="">— Select —</option>
                    {["Admin","Suhendi","Priyanto","Neal Hotama","Nazran Hisyami"].map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Task Description *</label>
                <input className="form-input" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Brief task description"/>
              </div>
              <div>
                <label className="form-label">Detail / Notes</label>
                <textarea className="form-input" style={{height:64,resize:"vertical",fontFamily:"inherit",fontSize:12}} value={form.detail} onChange={e=>setForm(p=>({...p,detail:e.target.value}))} placeholder="Additional details..."/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></div>
                <div><label className="form-label">Start Time</label><input className="form-input" type="time" value={form.start} onChange={e=>setForm(p=>({...p,start:e.target.value}))}/></div>
                <div><label className="form-label">End Time</label><input className="form-input" type="time" value={form.end} onChange={e=>setForm(p=>({...p,end:e.target.value}))}/></div>
              </div>
              <div>
                <label className="form-label">Status</label>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {STATUS_OPTIONS.map(s=>(
                    <button key={s} onClick={()=>setForm(p=>({...p,status:s}))} style={{background:form.status===s?STATUS_STYLE[s].bg:"rgba(255,255,255,.03)",color:form.status===s?STATUS_STYLE[s].text:"var(--muted)",border:`1px solid ${form.status===s?STATUS_STYLE[s].border:"var(--border2)"}`,fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"5px 14px",borderRadius:6,cursor:"pointer",transition:"all .15s"}}>{s}</button>
                  ))}
                </div>
              </div>
              <button className="btn-primary" onClick={handleSubmit} disabled={!form.customer||!form.description}>
                {editId ? "💾 Save Changes" : "✓ Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW DETAIL MODAL ── */}
      {viewTask && (
        <div className="modal-overlay" onClick={()=>setViewTask(null)}>
          <div className="modal" style={{width:480}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span style={{fontFamily:"monospace",color:"#B11226"}}>{viewTask.taskNo}</span>
              <button className="modal-close" onClick={()=>setViewTask(null)}>✕</button>
            </div>
            <div className="modal-body">
              {[["Customer",viewTask.customer],["Description",viewTask.description],["Date",viewTask.date],["Start",viewTask.start],["End",viewTask.end],["Engineer",viewTask.pic],["Status",viewTask.status]].map(([k,v])=>v?(
                <div key={k} style={{display:"flex",gap:12,padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
                  <span style={{fontSize:10,fontWeight:700,color:"var(--muted2)",textTransform:"uppercase",letterSpacing:".06em",minWidth:90,flexShrink:0}}>{k}</span>
                  <span style={{fontSize:11,color:"var(--text3)"}}>{v}</span>
                </div>
              ):null)}
              {viewTask.detail && (
                <div style={{marginTop:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--muted2)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>DETAIL / NOTES</div>
                  <div style={{fontSize:11,color:"var(--text4)",lineHeight:1.7,background:"var(--bg3)",padding:"10px 12px",borderRadius:6}}>{viewTask.detail}</div>
                </div>
              )}
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button className="btn-primary" style={{flex:1}} onClick={()=>{setViewTask(null);openEdit(viewTask);}}>✏ Edit Task</button>
                <button style={{flex:1,background:"rgba(239,68,68,.08)",color:"#F87171",border:"1px solid rgba(239,68,68,.2)",fontFamily:"inherit",fontSize:12,fontWeight:500,padding:"9px",borderRadius:6,cursor:"pointer"}} onClick={()=>handleDelete(viewTask.id)}>🗑 Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDownload && <DownloadModal tasks={tasks} onClose={()=>setShowDownload(false)}/>}

      {/* ── Pending Delete Requests Modal (admin only) ── */}
      {showPending && isAdmin && (
        <div className="modal-overlay" onClick={()=>setShowPending(false)}>
          <div className="modal" style={{width:560,maxWidth:"95vw"}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span>🗑 Delete Requests</span>
              <button className="modal-close" onClick={()=>setShowPending(false)}>✕</button>
            </div>
            <div className="modal-body" style={{gap:8,padding:"14px 16px"}}>
              {pendingDeletes.length === 0 ? (
                <div style={{textAlign:"center",padding:"20px",color:"var(--muted)",fontSize:12,fontStyle:"italic"}}>
                  No pending delete requests
                </div>
              ) : pendingDeletes.map((req, i) => (
                <div key={req.task_id} style={{
                  display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
                  background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,
                }}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text3)"}}>
                      <span style={{fontFamily:"monospace",color:"#B11226",marginRight:6}}>{req.task_no}</span>
                      {req.task_desc}
                    </div>
                    <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>
                      Requested by <strong style={{color:"var(--text4)"}}>{req.requested_by}</strong>
                      {" · "}{req.requested_at ? new Date(req.requested_at).toLocaleString("id-ID",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button
                      onClick={async()=>{ await handleApproveDelete(req.task_id,"approve"); setShowPending(false); }}
                      style={{background:"rgba(34,197,94,.12)",color:"#4ADE80",border:"1px solid rgba(34,197,94,.3)",
                        fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"5px 12px",
                        borderRadius:6,cursor:"pointer"}}>
                      ✓ Approve
                    </button>
                    <button
                      onClick={async()=>{ await handleApproveDelete(req.task_id,"reject"); loadPendingDeletes(); }}
                      style={{background:"rgba(239,68,68,.08)",color:"#F87171",border:"1px solid rgba(239,68,68,.2)",
                        fontFamily:"inherit",fontSize:11,fontWeight:600,padding:"5px 12px",
                        borderRadius:6,cursor:"pointer"}}>
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const T = {
  root:      {height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg)",fontFamily:"'Inter',system-ui,sans-serif"},
  header:    {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 24px 12px",borderBottom:"1px solid var(--border)",flexShrink:0,background:"var(--bg2)"},
  title:     {fontSize:18,fontWeight:700,letterSpacing:"-.02em",color:"var(--text)"},
  sub:       {fontSize:11,color:"var(--muted2)",marginTop:2},
  addBtn:    {background:"#B11226",color:"#fff",border:"none",fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 18px",borderRadius:7,cursor:"pointer",transition:"background .15s"},
  statRow:   {display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,padding:"10px 24px",flexShrink:0},
  statCard:  {background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:9,padding:"12px 16px"},
  filterRow: {display:"flex",alignItems:"center",gap:8,padding:"8px 24px",borderBottom:"1px solid var(--border)",flexShrink:0},
  filterLabel:{fontSize:9,fontWeight:700,letterSpacing:".1em",color:"var(--muted3)",textTransform:"uppercase",flexShrink:0},
  filterInput:{background:"var(--bg2)",border:"1px solid var(--border2)",color:"var(--text4)",fontFamily:"inherit",fontSize:11,padding:"5px 10px",borderRadius:5,outline:"none",cursor:"pointer"},
  clearFilterBtn:{background:"none",border:"1px solid var(--border2)",color:"var(--muted)",fontFamily:"inherit",fontSize:10,padding:"4px 10px",borderRadius:4,cursor:"pointer"},
  tableWrap: {flex:1,overflowY:"auto",padding:"0 24px 16px"},
  table:     {width:"100%",borderCollapse:"collapse",tableLayout:"fixed"},
  th:        {textAlign:"left",padding:"10px 12px",fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted3)",borderBottom:"1px solid var(--border)",background:"var(--bg3)",whiteSpace:"nowrap",position:"sticky",top:0,zIndex:1},
  td:        {padding:"8px 12px",fontSize:11,color:"var(--text4)",borderBottom:"1px solid var(--border)",verticalAlign:"middle"},
  editBtn:   {background:"rgba(59,130,246,.1)",color:"#60A5FA",border:"1px solid rgba(59,130,246,.2)",fontSize:11,width:26,height:26,borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  viewBtn:   {background:"var(--surface2)",color:"var(--muted)",border:"1px solid var(--border)",fontSize:11,width:26,height:26,borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  delBtn:    {background:"rgba(239,68,68,.08)",color:"#F87171",border:"1px solid rgba(239,68,68,.2)",fontSize:11,width:26,height:26,borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
};
