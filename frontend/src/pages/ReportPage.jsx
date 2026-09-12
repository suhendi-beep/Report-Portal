import React, { useState, useEffect, useCallback } from "react";
import { logActivity } from "../activityLog.js";

const MN=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const FOLDERS=["OCI-ILCS","OCI-HO","GCP","Huawei","DMDC","alerts-BTP","OCI-ILCS/YMS"];
const FOLDER_LABELS={"OCI-ILCS":"Alert OCI ILCS","OCI-HO":"Alert OCI HO","GCP":"Alert GCP","Huawei":"Alert Huawei","DMDC":"Alert DMDC","alerts-BTP":"Alert EIC","OCI-ILCS/YMS":"Alert OCI ILCS/YMS","Non Prometheus":"Alert Non Prometheus"};

function todayWIB(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function fmtDateID(d){try{const dt=new Date(d);return dt.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"});}catch{return d||"";}}
const S={inp:{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:6,color:"var(--text3)",fontSize:11,padding:"5px 8px",fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"},bp:{background:"#B11226",color:"#fff",border:"none",borderRadius:6,fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"8px 16px",cursor:"pointer"},bs:{background:"var(--surface2)",color:"var(--muted)",border:"1px solid var(--border2)",borderRadius:6,fontFamily:"inherit",fontSize:12,padding:"6px 12px",cursor:"pointer"}};

async function makeDR(tanggal,shift,engineer){
  let tasks=[];
  try{const d=await fetch("/api/tasks").then(r=>r.json());if(Array.isArray(d))tasks=d.filter(t=>(t.description||"").startsWith("[ALERT]")&&(t.date||"").slice(0,10)===tanggal);}catch(e){}
  const closed=tasks.filter(t=>t.status==="Close");
  const sep="\u2501".repeat(16);
  // Format tanggal: 12 September 2026
  const tgl=new Date(tanggal+"T00:00:00");
  const tglStr=tgl.getDate()+" "+MN[tgl.getMonth()]+" "+tgl.getFullYear();
  const shiftStr=shift==="1"?"Shift 1 ( 09:00 - 21:00 )":"Shift 2 ( 21:00 - 09:00 )";
  // Group by folder
  const byFolder={};
  tasks.forEach(t=>{
    const f=t.customer||"Non Prometheus";
    if(!byFolder[f])byFolder[f]=[];
    byFolder[f].push(t);
  });
  // All folders to show (including empty ones)
  const allFolders=[...FOLDERS,"Non Prometheus"];
  // Add any folder in tasks not in allFolders
  Object.keys(byFolder).forEach(f=>{if(!allFolders.includes(f))allFolders.push(f);});
  let alertSec="";
  allFolders.forEach(f=>{
    const label=FOLDER_LABELS[f]||"Alert "+f;
    const arr=byFolder[f]||[];
    alertSec+=label+"\n";
    if(arr.length===0){alertSec+="- (tidak ada alert)\n";}
    else arr.forEach(t=>{
      const tk=(t.detail||"").match(/Ticket:\s*(INC-\S+)/)?.[1]||"-";
      const desc=(t.description||"").replace(/^\[ALERT\]\s*/,"");
      // Format: * SEVERITY_AlertName -> instance [TICKET] [DD Mon, HH.MM]
      let since="-";
      try{const m=(t.detail||"").match(/Since:\s*(\d{2} \w+,\s*[\d.]+)/);since=m?m[1]:t.start||"";}catch{}
      alertSec+="* "+desc+" ["+tk+"] ["+since+"]\n";
    });
    alertSec+="\n";
  });
  // Ticket close section
  const tcSection="*2. Ticket Close*\nTotal : "+closed.length;
  // Backup status
  let bk="\n*3. Status Daily Backup*\n- (data belum tersedia)";
  try{const c=localStorage.getItem("pr_backup_status_cache");if(c){const b=JSON.parse(c);
    const hIco=b.health==="HEALTHY"?"\uD83D\uDFE2":b.health==="WARNING"?"\uD83D\uDFE1":"\uD83D\uDD34";
    bk="\n*3. Status Daily Backup*\nPeriode      : "+(b.period||"-")+"\nGenerate     : "+(b.generated||"-")+"\nStatus       : "+hIco+" "+(b.health||"-")+"\nTotal        : "+(b.total||"-")+"\nSuccess      : "+(b.success||"-")+"\nFailed       : "+(b.failed!==null&&b.failed!==undefined?b.failed:"-")+"\nSuccess Rate : "+(b.rate||"-");
  }}catch(e){}
  return "*Daily Report | Handover Monitoring standby*\n"+sep+"\nTanggal  : "+tglStr+"\nShift    : "+shiftStr+"\nEngineer : "+(engineer||"(isi nama)")+"\n"+sep+"\n\n*1. Grafana Alert*\nTotal Alert : "+tasks.length+"\n\nDetail:\n"+alertSec+tcSection+bk+"\n"+sep;
}

function DailyReportSection(){
  const [tanggal,setTanggal]=useState(todayWIB());
  const [shift,setShift]=useState("malam");
  const [engineer,setEngineer]=useState(sessionStorage.getItem("pr_display")||sessionStorage.getItem("pr_user")||"");
  const [text,setText]=useState("");
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(false);
  const gen=useCallback(async()=>{setLoading(true);try{setText(await makeDR(tanggal,shift,engineer));}catch(e){setText("Error:"+e.message);}setLoading(false);},[tanggal,shift,engineer]);
  useEffect(()=>{gen();},[tanggal,shift,engineer]);
  const copy=()=>{navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);logActivity("Copy Daily Report","report",tanggal);}).catch(()=>{try{const e=document.getElementById("rp-ta");e.select();document.execCommand("copy");}catch(x){}setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  return(<div><div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:14}}><div style={{flex:1,minWidth:120}}><div style={{fontSize:9,color:"var(--muted2)",textTransform:"uppercase",marginBottom:4}}>Tanggal</div><input type="date" value={tanggal} onChange={e=>setTanggal(e.target.value)} style={S.inp}/></div><div style={{flex:1,minWidth:120}}><div style={{fontSize:9,color:"var(--muted2)",textTransform:"uppercase",marginBottom:4}}>Shift</div><select value={shift} onChange={e=>setShift(e.target.value)} style={S.inp}><option value="1">Shift 1 (09:00-21:00)</option><option value="malam">Shift 2 (21:00-09:00)</option></select></div><div style={{flex:1,minWidth:120}}><div style={{fontSize:9,color:"var(--muted2)",textTransform:"uppercase",marginBottom:4}}>Nama Engineer</div><input value={engineer} onChange={e=>setEngineer(e.target.value)} placeholder="Nama engineer..." style={S.inp}/></div></div><textarea id="rp-ta" value={text} readOnly style={{width:"100%",height:360,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:7,color:"var(--text3)",fontFamily:"monospace",fontSize:11,padding:"12px",resize:"none",outline:"none",boxSizing:"border-box",lineHeight:1.75}}/><div style={{display:"flex",gap:8,marginTop:10}}><button onClick={gen} disabled={loading} style={{...S.bs,opacity:loading?.6:1}}>{loading?"Generating...":"\u21BB Refresh"}</button><button onClick={copy} style={{...S.bp,flex:1,background:copied?"#15803D":"#B11226"}}>{copied?"\u2713 Berhasil Disalin!":"\uD83D\uDCCB Copy Daily Report"}</button></div></div>);
}

function BackupStatusSection(){
  const [raw,setRaw]=useState("");
  const [loading,setLoading]=useState(true);
  const [summary,setSummary]=useState(null);
  const load=useCallback(async()=>{setLoading(true);try{
    const d=await fetch("/api/logs/pelindo/daily_ilcs_status").then(r=>r.json());
    const ls=d.logs||[];
    // Find DAILY BACKUP REPORT SUMMARY block
    const txt=ls.join("\n");
    const idx=txt.lastIndexOf("DAILY BACKUP REPORT SUMMARY");
    if(idx>=0){setRaw(txt.slice(idx));}
    else{setRaw(txt.slice(-2000));}
    // Parse for cards
    const tot=txt.match(/Total\s*:\s*(\d+)/)?.[1];
    const suc=txt.match(/Success\s*:\s*(\d+)/)?.[1];
    const fai=txt.match(/Failed\s*:\s*(\d+)/)?.[1];
    const rat=txt.match(/Success Rate\s*:\s*([\d.]+%)/)?.[1];
    const hlt=txt.match(/\b(HEALTHY|CRITICAL|WARNING)\b/)?.[0];
    const per=txt.match(/Period\s*:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    const gen=txt.match(/Generated\s*:\s*([\d-]+ [\d:]+ WIB)/)?.[1];
    if(tot||suc){
      const p={total:tot?parseInt(tot):null,success:suc?parseInt(suc):null,failed:fai?parseInt(fai):null,rate:rat||null,health:hlt||null,period:per,generated:gen};
      setSummary(p);
      try{localStorage.setItem("pr_backup_status_cache",JSON.stringify({...p,fetchedAt:new Date().toISOString()}));}catch(_){}
    }
  }catch(e){}setLoading(false);},[]);
  useEffect(()=>{load();},[]);
  const hc=h=>h==="HEALTHY"?"#22C55E":h==="WARNING"?"#F59E0B":"#EF4444";
  const lc=l=>/error|fail|failed/i.test(l)?"#F87171":/success|done|healthy/i.test(l)?"#4ADE80":/warn|critical/i.test(l)?"#F59E0B":"var(--text4)";
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",letterSpacing:".1em",textTransform:"uppercase"}}>DAILY BACKUP REPORT SUMMARY</div>
      <button onClick={load} disabled={loading} style={{...S.bs,padding:"4px 10px",fontSize:10}}>{loading?"...":"\u21BB"} Refresh</button>
    </div>
    {loading&&!raw&&<div style={{textAlign:"center",padding:"40px",color:"var(--muted)"}}>Loading...</div>}
    {!loading&&!raw&&<div style={{textAlign:"center",padding:"40px",color:"var(--muted3)",fontStyle:"italic"}}>Belum ada data. Jalankan Generate Report &#x2192; Daily Backup Status ILCS.</div>}
    {raw&&<>
      {summary&&<div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{padding:"6px 14px",borderRadius:20,background:hc(summary.health)+"22",border:"1px solid "+hc(summary.health)+"66",color:hc(summary.health),fontSize:12,fontWeight:700}}>{summary.health==="HEALTHY"?"\u2705":summary.health==="WARNING"?"\u26A0":"\uD83D\uDD34"} {summary.health||"UNKNOWN"}</div>
        {summary.rate&&<div style={{padding:"6px 14px",borderRadius:20,background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.2)",color:"#22C55E",fontSize:11,fontWeight:600}}>Rate: {summary.rate}</div>}
        {summary.period&&<div style={{padding:"6px 14px",borderRadius:20,background:"var(--surface2)",border:"1px solid var(--border2)",color:"var(--muted)",fontSize:11}}>Period: {summary.period}</div>}
      </div>}
      <div style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:8,padding:"12px 14px",fontFamily:"monospace",fontSize:11,lineHeight:1.8,whiteSpace:"pre-wrap",maxHeight:400,overflowY:"auto"}}>{raw.split("\n").map((l,i)=>{
        const c=/HEALTHY|SUCCESS|\u2705/i.test(l)?"#4ADE80":/CRITICAL|FAILED|\u274C|\uD83D\uDD34/i.test(l)?"#F87171":/WARNING|\u26A0|\uD83D\uDFE1/i.test(l)?"#F59E0B":/SUCCESS RATE|Rate/i.test(l)?"#22C55E":/===|DAILY BACKUP|RESOURCE|RESULT|FAILED|STATUS/i.test(l)?"#B11226":"var(--text4)";
        return <div key={i} style={{color:c}}>{l}</div>;
      })}</div>
    </>}
  </div>);
}

function MonthlyReportSection(){
  const now=new Date();
  const [selMonth,setSelMonth]=useState(now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0"));
  const [tasks,setTasks]=useState([]),[history,setHistory]=useState([]),[bkFail,setBkFail]=useState([]),[loading,setLoading]=useState(true);
  const [detail,setDetail]=useState(null);
  useEffect(()=>{(async()=>{setLoading(true);try{const[tr,hr,lr]=await Promise.all([fetch("/api/tasks").then(r=>r.json()),fetch("/api/history").then(r=>r.json()),fetch("/api/logs/pelindo/daily_ilcs_status").then(r=>r.json())]);setTasks(Array.isArray(tr)?tr:[]);setHistory(Array.isArray(hr)?hr:[]);setBkFail((lr.logs||[]).filter(l=>/FAILED|ERROR/i.test(l)&&!/SUCCESS/i.test(l)).slice(-10));}catch(e){}setLoading(false);})();},[]);
  const mt=tasks.filter(t=>(t.date||"").slice(0,7)===selMonth);
  const at=mt.filter(t=>(t.description||"").startsWith("[ALERT]"));
  const mh=history.filter(h=>{const d=new Date(h.last_run);return(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"))===selMonth;});
  const aC=at.filter(t=>t.status==="Close").length,aP=at.filter(t=>t.status=="Pending").length,aI=at.filter(t=>t.status==="In Progress").length;
  const rt=at.filter(t=>t.status==="Close"&&t.start&&t.end).map(t=>{const[h1,m1]=(t.start||"").split(/[.:]/);const[h2,m2]=(t.end||"").split(/[.:]/);const m=(parseInt(h2||0)*60+parseInt(m2||0))-(parseInt(h1||0)*60+parseInt(m1||0));return m>0?m:null;}).filter(Boolean);
  const avg=rt.length>0?Math.round(rt.reduce((a,b)=>a+b,0)/rt.length):null;
  // Top Folder Alerts (not engineer)
  const cf={};at.forEach(t=>{if(t.customer)cf[t.customer]=(cf[t.customer]||0)+1;});
  const tCust=Object.entries(cf).sort((a,b)=>b[1]-a[1]).slice(0,5);
  // Alert Incident Trend Top 5 with tasks for click
  const freq={};at.forEach(t=>{const dm=(t.description||"").match(/\u2192\s*(.+)$/);const ifd=dm?dm[1].trim():"";const dn=((t.detail||"").match(/Nodename\s*:\s*(.+)/)||[])[1]?.trim()||"";const di=((t.detail||"").match(/Instance\s*:\s*(.+)/)||[])[1]?.trim()||"";const rn=(t.description||"").replace(/^\[ALERT\]\s*/,"").replace(/\s*\u2192.*$/,"").trim();const key=dn||di||ifd||rn;if(!key)return;if(!freq[key])freq[key]={count:0,alertName:rn,folder:t.customer||"",tasks:[]};freq[key].count++;freq[key].tasks.push(t);});
  const top5=Object.entries(freq).sort((a,b)=>b[1].count-a[1].count).slice(0,5);
  const BC=["#EF4444","#F97316","#F59E0B","#84CC16","#3B82F6"];
  const exp=()=>{const lines=["Monthly Report - "+MN[parseInt(selMonth.slice(5))-1]+" "+selMonth.slice(0,4),"Generated: "+new Date().toLocaleString("id-ID"),"","ALERT","Total:"+at.length+" Close:"+aC+" Pending:"+aP+" InProgress:"+aI+(avg?" AvgResolve:"+avg+"m":""),"","TASKS","Total:"+mt.length+" Close:"+mt.filter(t=>t.status==="Close").length,"","REPORTS","Generated:"+mh.length+" Failed:"+mh.filter(h=>h.size_kb===0).length,"","TOP FOLDER ALERTS",...tCust.map(([k,v],i)=>"#"+(i+1)+" "+k+" "+v),"","ALERT INCIDENT TREND TOP 5",...top5.map(([k,v],i)=>"#"+(i+1)+" "+k+" - "+v.count+"x | "+v.folder),"","FAILED BACKUP",...(bkFail.length>0?bkFail:["(none)"])];const b=new Blob([lines.join("\n")],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="monthly_"+selMonth+".txt";a.click();URL.revokeObjectURL(u);};
  const Card=({l,v,c})=>(<div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:20,fontWeight:700,color:c,letterSpacing:"-.02em"}}>{v}</div><div style={{fontSize:9,color:"var(--muted2)",marginTop:3,textTransform:"uppercase",letterSpacing:".04em"}}>{l}</div></div>);
  const Bar=({name,cnt,max,c})=>(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><div style={{flex:1,minWidth:0}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:11,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span><span style={{fontSize:11,fontWeight:700,color:c,flexShrink:0,marginLeft:6}}>{cnt}</span></div><div style={{height:3,background:"var(--surface2)",borderRadius:2}}><div style={{height:"100%",width:(cnt/max*100)+"%",background:c,borderRadius:2,transition:"width .5s"}}/></div></div></div>);
  return(<div>
    <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:16}}><div><div style={{fontSize:9,color:"var(--muted2)",textTransform:"uppercase",marginBottom:4}}>Bulan</div><input type="month" value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:6,color:"var(--text3)",fontSize:11,padding:"5px 8px",fontFamily:"inherit",outline:"none"}}/></div><div style={{flex:1}}/><button onClick={exp} style={S.bp}>&#x2B07; Export TXT</button></div>
    {loading?<div style={{textAlign:"center",padding:40,color:"var(--muted)"}}>Loading...</div>:<>
      <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",textTransform:"uppercase",marginBottom:6,letterSpacing:".1em"}}>Alert Overview</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}><Card l="Total Alert" v={at.length} c="#EF4444"/><Card l="Close" v={aC} c="#22C55E"/><Card l="Pending" v={aP} c="#F59E0B"/><Card l="In Progress" v={aI} c="#60A5FA"/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}><Card l="Total Tasks" v={mt.length} c="var(--text2)"/><Card l="Report Generated" v={mh.length} c="#B11226"/><Card l="Avg Resolve" v={avg?avg+"m":"-"} c="#8B5CF6"/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:12}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",textTransform:"uppercase",marginBottom:10,letterSpacing:".08em"}}>Top Folder Alerts</div>
          {tCust.length===0?<div style={{color:"var(--muted3)",fontSize:10,fontStyle:"italic"}}>Tidak ada data</div>:tCust.map(([n,c])=><Bar key={n} name={n} cnt={c} max={tCust[0][1]} c="#EF4444"/>)}
        </div>
        <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:12}}>
          <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",textTransform:"uppercase",marginBottom:10,letterSpacing:".08em"}}>Failed Backup (Recent)</div>
          {bkFail.length===0?<div style={{color:"var(--muted3)",fontSize:10,fontStyle:"italic"}}>Tidak ada</div>:<div style={{maxHeight:120,overflowY:"auto"}}>{bkFail.map((l,i)=><div key={i} style={{fontSize:10,color:"#F87171",fontFamily:"monospace",lineHeight:1.6}}>{l}</div>)}</div>}
        </div>
      </div>
      <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"14px"}}>
        <div style={{fontSize:9,fontWeight:700,color:"var(--muted3)",textTransform:"uppercase",marginBottom:12,letterSpacing:".08em"}}>&#x1F525; Alert Incident Trend &#x2014; Top 5</div>
        {top5.length===0?<div style={{color:"var(--muted3)",textAlign:"center",padding:"16px",fontStyle:"italic"}}>Tidak ada data</div>:
          top5.map(([name,info],i)=>{
            const pct=(info.count/top5[0][1].count)*100;
            const c=BC[i]||"#6B7280";
            return(<div key={name} onClick={()=>setDetail(detail?.name===name?null:{name,info})} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px",borderRadius:7,cursor:"pointer",marginBottom:4,background:detail?.name===name?"var(--bg3)":"transparent",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"} onMouseLeave={e=>e.currentTarget.style.background=detail?.name===name?"var(--bg3)":"transparent"}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--muted3)",minWidth:20,textAlign:"right",flexShrink:0,marginTop:2}}>#{i+1}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:"var(--text3)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={name}>{name}</span>
                  <span style={{fontSize:12,fontWeight:700,color:c,flexShrink:0,marginLeft:8}}>{info.count}x</span>
                </div>
                <div style={{height:4,background:"var(--surface2)",borderRadius:2,marginBottom:detail?.name===name?6:0}}><div style={{height:"100%",width:pct+"%",background:c,borderRadius:2,transition:"width .5s",boxShadow:"0 0 6px "+c+"66"}}/></div>
                <div style={{fontSize:9,color:"var(--muted2)"}}>{info.folder}</div>
                {detail?.name===name&&<div style={{marginTop:8,borderTop:"1px solid var(--border)",paddingTop:8}}>
                  {info.tasks.slice().sort((a,b)=>(b.date||"")<(a.date||"")?-1:1).slice(0,5).map((t,j)=>{
                    const tk=(t.detail||"").match(/Ticket:\s*(INC-\S+)/)?.[1]||"-";
                    const since=(t.detail||"").match(/Since:\s*([^\n]+)/)?.[1]||(t.start?t.date+" "+t.start:"-");
                    const sev=(t.detail||"").match(/Severity\s*:\s*(\w+)/)?.[1]||"";
                    const sevC=sev.toLowerCase()==="critical"?"#EF4444":sev.toLowerCase()==="warning"?"#F59E0B":"var(--muted)";
                    return(<div key={j} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:j<Math.min(info.tasks.length,5)-1?"1px solid var(--border)":"none"}}>
                      <span style={{fontSize:9,fontWeight:700,color:sevC,flexShrink:0,textTransform:"uppercase",minWidth:50}}>{sev||"alert"}</span>
                      <span style={{fontSize:10,color:"var(--muted)",fontFamily:"monospace",flexShrink:0}}>{tk}</span>
                      <span style={{fontSize:10,color:"var(--muted2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{since}</span>
                      <span style={{fontSize:10,color:t.status==="Close"?"#22C55E":"#F59E0B",flexShrink:0,fontWeight:600}}>{t.status}</span>
                    </div>);
                  })}
                  {info.tasks.length>5&&<div style={{fontSize:9,color:"var(--muted3)",textAlign:"center",marginTop:4}}>+{info.tasks.length-5} more occurrences</div>}
                </div>}
              </div>
            </div>);
          })
        }
      </div>
    </>}
  </div>);
}

export default function ReportPage(){
  const [tab,setTab]=useState("daily");
  const TABS=[{key:"daily",label:"Daily Report"},{key:"backup",label:"Status Backup"},{key:"monthly",label:"Monthly Report"}];
  return(<div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg)",fontFamily:"'Inter',system-ui,sans-serif"}}><div style={{display:"flex",alignItems:"center",padding:"16px 24px 12px",borderBottom:"1px solid var(--border)",flexShrink:0,background:"var(--bg2)"}}><div><h1 style={{fontSize:18,fontWeight:700,color:"var(--text)",margin:0}}>Report</h1><p style={{fontSize:11,color:"var(--muted2)",marginTop:2,marginBottom:0}}>Daily Report \u00b7 Status Backup \u00b7 Monthly Report</p></div></div><div style={{display:"flex",padding:"0 24px",borderBottom:"1px solid var(--border)",flexShrink:0,background:"var(--bg2)"}}>{TABS.map(t=>(<button key={t.key} onClick={()=>setTab(t.key)} style={{background:"none",border:"none",borderBottom:tab===t.key?"2px solid #B11226":"2px solid transparent",color:tab===t.key?"var(--text2)":"var(--muted)",fontFamily:"inherit",fontSize:12,fontWeight:tab===t.key?600:400,padding:"10px 18px",cursor:"pointer",marginBottom:-1}}>{t.label}</button>))}</div><div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>{tab==="daily"&&<DailyReportSection/>}{tab==="backup"&&<BackupStatusSection/>}{tab==="monthly"&&<MonthlyReportSection/>}</div></div>);
}
