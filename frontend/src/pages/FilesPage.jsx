import React, { useState, useEffect } from "react";

// Map automation ID → folder name
const FOLDER_MAP = {
  grafana_capture:    "Weekly Capture Grafana HO",
  grafana_capture_all:"Monthly Capture Grafana ALL",
  oci_ilcs_backup:    "Weekly Backup Report OCI ILCS",
  oci_pelindo_backup: "Weekly Backup Report OCI Pelindo",
  daily_ilcs_status:  "Daily Backup Status ILCS",
  nikp_monthly_report:"Monthly Report NIKP",
};

const FILE_FILTER = {
  grafana_capture:    n => n.includes("grafana") && !n.includes("_all_"),
  grafana_capture_all:n => n.includes("grafana_all") || (n.includes("grafana") && n.endsWith(".zip")),
  oci_ilcs_backup:    n => n.includes("ilcs") && !n.includes("status"),
  oci_pelindo_backup: n => n.includes("oci_pelindo"),
  daily_ilcs_status:  n => n.includes("status") || n.includes("daily"),
  nikp_monthly_report:n => n.includes("nikp"),
};

function fileIcon(name) {
  if (name.endsWith(".pptx")) return "📊";
  if (name.endsWith(".docx")) return "📝";
  if (name.endsWith(".zip"))  return "🗜️";
  return "📄";
}

function fmtSize(kb) {
  if (kb >= 1024) return (kb/1024).toFixed(1) + " MB";
  return kb + " KB";
}

export default function FilesPage({ customer, navigate }) {
  const [files,    setFiles]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [openFolder, setOpenFolder] = useState(null); // aid or null = all open

  useEffect(() => {
    if (!customer) return;
    setLoading(true);
    fetch("/api/files/" + customer.id)
      .then(r => r.json())
      .then(d => {
        const all = [...(d.reports||[]), ...(d.screenshots||[])]
          .sort((a,b) => new Date(b.created) - new Date(a.created));
        setFiles(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [customer?.id]);

  if (!customer) return null;

  // Build folder structure
  const automations = customer.automations || [];
  const folders = automations.map(auto => {
    const filter = FILE_FILTER[auto.id] || (() => false);
    const folderFiles = files.filter(f => filter(f.name.toLowerCase()));
    return { auto, files: folderFiles };
  });

  // "Other" — files that don't match any folder
  const matched = new Set(folders.flatMap(f => f.files.map(fi => fi.name)));
  const otherFiles = files.filter(f => !matched.has(f.name));

  const totalFiles = files.length;
  const totalSize  = files.reduce((s,f) => s + f.size_kb, 0);

  return (
    <div style={F.root}>
      {/* ── TOPBAR ── */}
      <header style={F.topbar}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button style={F.backBtn} onClick={() => navigate("customer", customer.id)}>← Back</button>
          <div style={{width:1,height:24,background:"var(--border2)"}}/>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--text2)",letterSpacing:"-.01em"}}>
              📁 Output Files
            </div>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:1}}>
              {customer.name} · {totalFiles} file{totalFiles!==1?"s":""} · {fmtSize(totalSize)}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button style={F.iconBtn} onClick={() => {
            setLoading(true);
            fetch("/api/files/"+customer.id).then(r=>r.json())
              .then(d => {
                const all=[...(d.reports||[]),...(d.screenshots||[])].sort((a,b)=>new Date(b.created)-new Date(a.created));
                setFiles(all); setLoading(false);
              }).catch(()=>setLoading(false));
          }}>↻ Refresh</button>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <div style={F.content}>
        {loading ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,gap:10,color:"var(--muted3)"}}>
            <span className="spinner" style={{width:18,height:18,borderColor:"var(--muted3)",borderTopColor:"transparent"}}/>
            Loading files…
          </div>
        ) : (
          <div style={F.folderGrid}>
            {folders.map(({ auto, files: fFiles }) => {
              const isOpen = openFolder === null || openFolder === auto.id;
              const folderName = FOLDER_MAP[auto.id] || auto.name;
              const ICON = {pptx:"📊",docx:"📝",report:"📋"}[auto.output_type] || "📄";
              return (
                <div key={auto.id} style={F.folderCard}>
                  {/* Folder header */}
                  <div style={F.folderHeader} onClick={() =>
                    setOpenFolder(prev => prev === auto.id ? null : auto.id)
                  }>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:20}}>{fFiles.length > 0 ? "📂" : "📁"}</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text2)"}}>{folderName}</div>
                        <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>
                          {auto.output_type.toUpperCase()} · {fFiles.length} file{fFiles.length!==1?"s":""}
                          {fFiles.length > 0 && " · " + fmtSize(fFiles.reduce((s,f)=>s+f.size_kb,0))}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {fFiles.length > 0 && (
                        <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,
                          background:"rgba(217,119,6,.12)",color:"#d97706",
                          border:"1px solid rgba(217,119,6,.25)"}}>
                          {fFiles.length}
                        </span>
                      )}
                      <span style={{color:"var(--muted3)",fontSize:12,transition:"transform .2s",
                        transform: isOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
                    </div>
                  </div>

                  {/* File list */}
                  {isOpen && (
                    <div style={F.fileList}>
                      {fFiles.length === 0 ? (
                        <div style={F.emptyFolder}>
                          <span style={{fontSize:28,opacity:.2}}>📂</span>
                          <span>No files yet. Run the automation first.</span>
                        </div>
                      ) : (
                        fFiles.map((f, i) => {
                          const ext = f.name.split(".").pop();
                          const extColors = {pptx:"#f59e0b",docx:"#3b6ef5",pdf:"#ef4444"};
                          const extColor = extColors[ext] || "var(--text4)";
                          return (
                            <div key={i} style={{
                              ...F.fileRow,
                              borderBottom: i < fFiles.length-1 ? "1px solid var(--border)" : "none",
                            }}>
                              <span style={{fontSize:20,flexShrink:0}}>{fileIcon(f.name)}</span>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,color:"var(--text3)",fontFamily:"monospace",
                                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                                  title={f.name}>{f.name}</div>
                                <div style={{display:"flex",gap:10,marginTop:2}}>
                                  <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",
                                    color:extColor}}>{ext}</span>
                                  <span style={{fontSize:9,color:"var(--muted3)"}}>
                                    {new Date(f.created).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                                  </span>
                                </div>
                              </div>
                              <span style={{fontSize:11,color:"var(--muted)",flexShrink:0,minWidth:65,textAlign:"right"}}>
                                {fmtSize(f.size_kb)}
                              </span>
                              <a href={"/api/download/reports/"+f.name} download={f.name}
                                style={F.dlBtn}
                                onMouseEnter={e=>{e.currentTarget.style.background="#a80000"}}
                                onMouseLeave={e=>{e.currentTarget.style.background="#8b0000"}}>
                                ⬇ Download
                              </a>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Other folder */}
            {otherFiles.length > 0 && (
              <div style={F.folderCard}>
                <div style={F.folderHeader} onClick={() =>
                  setOpenFolder(prev => prev === "other" ? null : "other")
                }>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>📂</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text2)"}}>Other Files</div>
                      <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>
                        {otherFiles.length} file{otherFiles.length!==1?"s":""}
                        {" · " + fmtSize(otherFiles.reduce((s,f)=>s+f.size_kb,0))}
                      </div>
                    </div>
                  </div>
                  <span style={{color:"var(--muted3)",fontSize:12,
                    transform:(openFolder==="other")?"rotate(90deg)":"rotate(0deg)"}}>›</span>
                </div>
                {(openFolder === null || openFolder === "other") && (
                  <div style={F.fileList}>
                    {otherFiles.map((f,i) => (
                      <div key={i} style={{...F.fileRow,borderBottom:i<otherFiles.length-1?"1px solid var(--border)":"none"}}>
                        <span style={{fontSize:20,flexShrink:0}}>{fileIcon(f.name)}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,color:"var(--text3)",fontFamily:"monospace",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                          <div style={{fontSize:9,color:"var(--muted3)",marginTop:2}}>
                            {new Date(f.created).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                          </div>
                        </div>
                        <span style={{fontSize:11,color:"var(--muted)",flexShrink:0,minWidth:65,textAlign:"right"}}>
                          {fmtSize(f.size_kb)}
                        </span>
                        <a href={"/api/download/reports/"+f.name} download={f.name}
                          style={F.dlBtn}
                          onMouseEnter={e=>e.currentTarget.style.background="#a80000"}
                          onMouseLeave={e=>e.currentTarget.style.background="#8b0000"}>
                          ⬇ Download
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {folders.every(f=>f.files.length===0) && otherFiles.length===0 && (
              <div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 0",color:"var(--muted3)"}}>
                <div style={{fontSize:48,marginBottom:16,opacity:.2}}>📂</div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:6,color:"var(--muted)"}}>No output files yet</div>
                <div style={{fontSize:12}}>Run an automation from the Jobs page to generate output files.</div>
                <button style={{marginTop:16,background:"#8b0000",color:"#fff",border:"none",
                  fontFamily:"Inter,sans-serif",fontSize:12,fontWeight:600,padding:"8px 18px",
                  borderRadius:6,cursor:"pointer"}} onClick={()=>navigate("customer",customer.id)}>
                  → Go to Automation Jobs
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const F = {
  root:    {height:"100%",display:"flex",flexDirection:"column",background:"var(--bg)",fontFamily:"Inter,system-ui,sans-serif",overflow:"hidden"},
  topbar:  {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",borderBottom:"1px solid var(--border)",flexShrink:0,background:"var(--bg2)"},
  backBtn: {background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--text4)",fontFamily:"Inter,sans-serif",fontSize:12,padding:"6px 13px",borderRadius:6,cursor:"pointer"},
  iconBtn: {background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--text4)",fontFamily:"Inter,sans-serif",fontSize:11,padding:"5px 10px",borderRadius:5,cursor:"pointer"},
  content: {flex:1,overflowY:"auto",padding:"20px 24px"},
  folderGrid:{display:"flex",flexDirection:"column",gap:12,maxWidth:900},
  folderCard:{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"},
  folderHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",
    padding:"14px 18px",cursor:"pointer",transition:"background .15s",
    userSelect:"none"},
  fileList:{padding:"0 18px 10px",borderTop:"1px solid var(--border)"},
  emptyFolder:{display:"flex",alignItems:"center",gap:10,padding:"16px 0",
    fontSize:11,color:"var(--muted3)",fontStyle:"italic"},
  fileRow: {display:"flex",alignItems:"center",gap:12,padding:"10px 0"},
  dlBtn:   {display:"flex",alignItems:"center",gap:5,background:"#B11226",color:"#fff",
    border:"none",fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:5,
    textDecoration:"none",flexShrink:0,whiteSpace:"nowrap",transition:"background .15s"},
};
