'use client';
import React, {useState, useEffect, useRef} from 'react';

const API = 'http://localhost:8000/api';
const roles=[
  {id:'student',name:'Student',desc:'Apply, track, upload docs',icon:'🎓'},
  {id:'nodal',name:'Nodal Officer',desc:'Verify docs, process exceptions',icon:'🏛️'},
  {id:'admin',name:'Ministry Admin',desc:'Sanction funds, analytics',icon:'📊'},
  {id:'bank',name:'Bank / PFMS',desc:'Process DBT payments',icon:'💳'}
];

const TOP_INSTITUTES = [
  "Indian Institute of Technology (IIT), Bombay",
  "Indian Institute of Technology (IIT), Delhi",
  "Indian Institute of Technology (IIT), Madras",
  "Indian Institute of Technology (IIT), Kanpur",
  "Indian Institute of Technology (IIT), Kharagpur",
  "Indian Institute of Management (IIM), Ahmedabad",
  "Indian Institute of Management (IIM), Bangalore",
  "Indian Institute of Management (IIM), Calcutta",
  "All India Institute of Medical Sciences (AIIMS), New Delhi",
  "National Institute of Design (NID), Ahmedabad",
  "National Institute of Fashion Technology (NIFT), New Delhi",
  "National Institute of Technology (NIT), Trichy",
  "National Institute of Technology (NIT), Surathkal",
  "Jawaharlal Institute of Postgraduate Medical Education & Research (JIPMER)",
  "Indian Institute of Science (IISc), Bangalore"
];

type CVLStep = {name:string, source:string, status:'pending'|'running'|'done'|'error', time?:number};

export default function Home(){
const [mode,setMode]=useState<'login'|'register'>('login');
const [role,setRole]=useState('student');
const [identifier,setIdentifier]=useState('');
const [password,setPassword]=useState('');
const [name,setName]=useState('');
const [message,setMessage]=useState('');
const [user,setUser]=useState<any>(null);
const [tab,setTab]=useState('overview');
const [apps,setApps]=useState<any[]>([]);
const [docs,setDocs]=useState<any[]>([]);
const [notes,setNotes]=useState<any[]>([]);
const [schemes,setSchemes]=useState<any[]>([]);
const [appForm,setAppForm]=useState<any>({scheme_id:'post-matric',institution:'Tribal Institute of Technology',course:'B.Tech',academic_year:'2026-27',annual_income:120000, scenario:'happy'});
const [isFetchingDoc,setIsFetchingDoc]=useState('');
const [cvlSteps, setCvlSteps]=useState<CVLStep[]>([]);
const [showCVL, setShowCVL]=useState(false);
const [grievances, setGrievances]=useState<any[]>([]);
const [grvForm, setGrvForm]=useState({category:'', description:''});

async function call(path:string, opts:any={}){const r=await fetch(API+path,{headers:{'Content-Type':'application/json'},...opts}); const data=await r.json(); if(!r.ok) throw new Error(data.detail||'Request failed'); return data;}
function logout() {
  setUser(null);
  setApps([]);
  setDocs([]);
  setNotes([]);
  setSchemes([]);
  setCvlSteps([]);
  setShowCVL(false);
  setGrievances([]);
  setTab('overview');
  setMessage('');
}
async function auth(){
  if (!identifier.trim()) { setMessage('Please enter your mobile number or email.'); return; }
  if (!password.trim()) { setMessage('Please enter your password.'); return; }
  if (mode === 'register' && !name.trim()) { setMessage('Please enter your full name.'); return; }
  
  try{
    const data=await call('/auth',{method:'POST',body:JSON.stringify({mode,role,identifier,password,name})});
    setUser(data.user); setMessage(data.message);
    if(data.user.role==='student') loadStudent(data.user.id);
    else {
      setTab('overview'); 
      const s=await call('/schemes'); setSchemes(s);
      const allApps=await call('/applications?role='+data.user.role); setApps(allApps);
      const allG=await call('/grievances'); setGrievances(allG);
    }
  }catch(e:any){setMessage(e.message)}
}
async function loadStudent(id:string){
const d=await call('/students/'+id+'/dashboard'); setApps(d.applications);setDocs(d.documents);setNotes(d.notifications); const s=await call('/schemes');setSchemes(s);
const g=await call('/grievances?student_id='+id); setGrievances(g);
}
async function submitApp(currentDocs = docs){
  if (currentDocs.length === 0) {
    setMessage("⚠️ Please fetch your required documents in the Document Wallet first before submitting.");
    setTab('documents');
    return;
  }
try{
  let exceptionReason = '';
  if (appForm.scenario && appForm.scenario !== 'happy') {
    if (appForm.scenario === 'name_mismatch') exceptionReason = 'Aadhaar name (Ramesh) != UDISE name (Ramesh K.)';
    if (appForm.scenario === 'income_high') exceptionReason = 'State Revenue API: Income exceeds ₹2.5L limit';
    if (appForm.scenario === 'bank_unseeded') exceptionReason = 'NPCI APB: Aadhaar not seeded with bank account';
    if (appForm.scenario === 'duplicate') exceptionReason = 'NSP Cross-Check: Active state scholarship found (Double-dipping)';
  }

  const a=await call('/applications',{method:'POST',body:JSON.stringify({...appForm,student_id:user.id,category:'ST',status:'SUBMITTED',exception_reason:exceptionReason})});
  setApps([a,...apps]);
  setMessage('Application submitted! Running CVL cross-checks against your Document Wallet...');
  setTab('track');
  
  // Trigger CVL verification pipeline
  setShowCVL(true);
  await runCVL(a.id);
  
  const nextStatus = exceptionReason ? 'CVL_REVIEW' : 'NODAL_APPROVED';
  const nextRemarks = exceptionReason ? 'Exception flagged. Pending Nodal Review.' : '100% Verified by CVL. Auto-approved.';
  const updatedApp = await call(`/applications/${a.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({status: nextStatus, remarks: nextRemarks})
  });
  setApps(prevApps => prevApps.map((app:any) => app.id === a.id ? updatedApp : app));
  setMessage('CVL Verification pipeline completed.');
}catch(e:any){setMessage(e.message)}
}

async function addDoc(source:string, identifier?:string, docNameOverride?:string){
  setIsFetchingDoc(source);
  await new Promise(r => setTimeout(r, 1500));
  
  let docName = docNameOverride || 'Manual Uploaded Document';
  if (!docNameOverride) {
    if (source === 'DigiLocker' || source === 'eDistrict') docName = 'Family Income & Caste Certificate';
    if (source === 'UDISE+') docName = 'Academic Records & Institution Bonafide';
    if (source === 'UDID') docName = 'Disability Certificate (UDID)';
    if (source === 'UIDAI') docName = 'Aadhaar eKYC Identity Profile';
    if (source === 'NTA') docName = 'UGC NET / JRF Award Letter';
  }
  
  const d=await call('/documents',{method:'POST',body:JSON.stringify({student_id:user.id,name:docName,source:source+(identifier?` (${identifier})`:''),document_type:'certificate'})});
  const updatedDocs = [d,...docs];
  setDocs(updatedDocs);
  setNotes(await call('/notifications/'+user.id));
  
  setIsFetchingDoc('');
  
  if (appForm.scheme_id && docs.length === 0) {
    setMessage(`Document fetched successfully. Auto-submitting your pending application...`);
    setTimeout(() => submitApp(updatedDocs), 1500);
  } else {
    setMessage(`Document fetched from ${source} and safely stored in your wallet.`);
  }
}


async function runCVL(appId:string) {
  const steps: CVLStep[] = [
    {name:'Identity Verification', source:'UIDAI Aadhaar eKYC', status:'pending'},
    {name:'ST/PVTG Certificate', source:'State eTaal Portal', status:'pending'},
    {name:'Academic & Institution', source:'UDISE+ / APAAR Registry', status:'pending'},
    {name:'NET/JRF Qualification', source:'UGC NET Database API', status:'pending'},
    {name:'Disability Certificate', source:'UDID Portal API', status:'pending'},
    {name:'Income & Domicile', source:'State Revenue / DigiLocker', status:'pending'},
    {name:'Duplicate / Integrity Check', source:'NSP Cross-Check', status:'pending'},
    {name:'Bank Account Seeding', source:'NPCI APB Bridge', status:'pending'},
  ];
  setCvlSteps([...steps]);
  
  try {
    const r = await call('/setu/cvl-verify', {
      method: 'POST',
      body: JSON.stringify({application_id: appId, student_id: user.id})
    });
    
    // Animate each step
    for (let i = 0; i < steps.length; i++) {
      steps[i].status = 'running';
      setCvlSteps([...steps]);
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
      steps[i].status = 'done';
      steps[i].time = r.results?.[i]?.time_ms || Math.floor(80 + Math.random() * 200);
      setCvlSteps([...steps]);
    }
  } catch(e) {
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].status === 'pending' || steps[i].status === 'running') {
        steps[i].status = 'done';
        steps[i].time = Math.floor(80 + Math.random() * 200);
      }
      setCvlSteps([...steps]);
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

async function processDBT(id:string, utr?:string){
try{await call('/dbt/'+id+'/process',{method:'POST', body:JSON.stringify({utr})});setMessage('DBT payment processed successfully.'); if(user.role==='student')loadStudent(user.id); else{const allApps=await call('/applications?role='+user.role); setApps(allApps);}}catch(e:any){setMessage(e.message)}
}
async function updateAppStatus(id:string, status:string, remarks:string=''){
  try {
    const updated = await call(`/applications/${id}/status`, {method: 'PATCH', body: JSON.stringify({status, remarks})});
    setApps(apps.map((a:any) => a.id === id ? updated : a));
    setMessage(`Application marked as ${status.replace('_', ' ')}`);
  } catch(e:any) { setMessage(e.message) }
}
if(user) return <Dashboard user={user} tab={tab} setTab={setTab} apps={apps} docs={docs} setDocs={setDocs} notes={notes} schemes={schemes} form={appForm} setForm={setAppForm} submitApp={submitApp} addDoc={addDoc} isFetchingDoc={isFetchingDoc} setIsFetchingDoc={setIsFetchingDoc} processDBT={processDBT} updateAppStatus={updateAppStatus} message={message} cvlSteps={cvlSteps} showCVL={showCVL} setShowCVL={setShowCVL} logout={logout} grievances={grievances} />;
return <main className="auth">

<section className="hero" style={{padding:'60px', background:'linear-gradient(135deg, #1e1b4b, #4338ca)', color:'white', display:'flex', flexDirection:'column', justifyContent:'space-between', position:'relative', overflow:'hidden'}}>
  <div style={{position:'absolute', top:'-150px', right:'-150px', width:'400px', height:'400px', background:'rgba(255,255,255,0.05)', borderRadius:'50%', zIndex:0}}></div>
  
  <div style={{zIndex:1}}>
    <div style={{display:'flex', alignItems:'center', gap:'12px', fontSize:'22px', fontWeight:'700', marginBottom:'80px', color:'#a5b4fc'}}>
      <span style={{fontSize:'28px'}}>🌿</span> Tribal Scholarship
    </div>
    
    <div>
      <span style={{background:'rgba(255,255,255,0.1)', padding:'6px 12px', borderRadius:'999px', fontSize:'12px', fontWeight:'600', letterSpacing:'1px', color:'#e0e7ff'}}>ONE UNIFIED JOURNEY</span>
      <h1 style={{fontSize:'64px', fontWeight:'800', lineHeight:'1.1', margin:'24px 0', letterSpacing:'-2px'}}>Scholarships, <br/><em style={{fontStyle:'normal', color:'#a5b4fc'}}>simplified.</em></h1>
      <p style={{fontSize:'20px', color:'#c7d2fe', maxWidth:'480px', lineHeight:'1.5'}}>Discover, Apply, Verify, and Receive — in one secure, student-friendly platform.</p>
    </div>
  </div>

  <div style={{zIndex:1, marginTop:'60px', display:'flex', flexDirection:'column', gap:'24px'}}>
    <div style={{display:'flex', gap:'16px'}}>
      {['🔎 Discover','📝 Apply','📄 Verify','✅ Approve','💳 Receive'].map((x,i)=><div key={x} style={{background:'rgba(255,255,255,0.1)', padding:'12px 16px', borderRadius:'12px', display:'flex', alignItems:'center', gap:'10px', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.1)'}}><b style={{background:'rgba(255,255,255,0.2)', width:'24px', height:'24px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', fontSize:'12px'}}>{i+1}</b><span style={{fontSize:'14px', fontWeight:'500'}}>{x.split(' ')[1]}</span></div>)}
    </div>
    <div style={{display:'flex', alignItems:'center', gap:'12px', background:'rgba(0,0,0,0.2)', padding:'16px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.05)'}}>
      <b style={{color:'#a5b4fc', fontSize:'14px'}}>API Integrations:</b>
      <span style={{fontSize:'13px', color:'#e0e7ff', opacity:0.8}}>DigiLocker • API Setu • UIDAI eKYC • UDISE+ • APAAR • NPCI • PFMS</span>
    </div>
    <div style={{display:'inline-flex', alignItems:'center', gap:'12px', background:'linear-gradient(90deg, rgba(255,255,255,0.15), transparent)', padding:'12px 20px', borderRadius:'999px', width:'fit-content'}}>
      <span style={{fontSize:'20px'}}>🤖</span> 
      <div><b style={{display:'block', fontSize:'14px'}}>Jago AI</b><span style={{fontSize:'12px', color:'#c7d2fe'}}>Your 24/7 scholarship companion</span></div>
    </div>
  </div>
</section> <section className="authCard">
  <div style={{display:'flex', gap:'10px', marginBottom:'24px', padding:'4px', background:'var(--background)', borderRadius:'12px'}}>
    <button style={{flex:1, padding:'10px', borderRadius:'8px', border:'none', background:mode==='login'?'white':'transparent', boxShadow:mode==='login'?'var(--shadow-sm)':'none', color:mode==='login'?'var(--primary)':'var(--text-secondary)', fontWeight:'600', cursor:'pointer'}} onClick={()=>setMode('login')}>Login</button>
    <button style={{flex:1, padding:'10px', borderRadius:'8px', border:'none', background:mode==='register'?'white':'transparent', boxShadow:mode==='register'?'var(--shadow-sm)':'none', color:mode==='register'?'var(--primary)':'var(--text-secondary)', fontWeight:'600', cursor:'pointer'}} onClick={()=>{setMode('register');setRole('student')}}>Register</button>
  </div>
  
  <h2>{mode==='login'?'Welcome back 👋':'Create your account ✨'}</h2>
  <p style={{color:'var(--text-secondary)', marginBottom:'28px'}}>{mode==='login'?'Choose your portal to continue.':'Start your unified scholarship journey.'}</p>
  
  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'24px'}}>
    {roles.map(r=><button disabled={mode==='register'&&r.id!=='student'} onClick={()=>setRole(r.id)} style={{padding:'12px', textAlign:'left', borderRadius:'12px', border:'1px solid', borderColor:role===r.id?'var(--primary)':'var(--border)', background:role===r.id?'var(--primary-light)':'white', opacity:(mode==='register'&&r.id!=='student')?0.5:1, cursor:'pointer', display:'flex', flexDirection:'column', gap:'4px'}} key={r.id}><span style={{fontSize:'20px'}}>{r.icon}</span><b style={{color:role===r.id?'var(--primary)':'var(--text)'}}>{r.name}</b><small style={{color:'var(--text-secondary)', fontSize:'11px'}}>{r.desc}</small></button>)}
  </div>
  
  {mode==='register'&&<div className="inputGroup"><label>Full Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name"/></div>}
  <div className="inputGroup"><label>Mobile / Email</label><input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Enter mobile number or email"/></div>
  <div className="inputGroup"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></div>
  
  <button className="primary" onClick={auth} style={{marginTop:'12px'}}>{mode==='login'?'Continue →':'Create account →'}</button>
  <div style={{marginTop:'24px', textAlign:'center', fontSize:'12px', color:'var(--text-secondary)'}}>🔐 Secure access • Role-based permissions • Privacy-first design</div>
  {message&&<div style={{marginTop:'16px', padding:'12px', borderRadius:'8px', background:'#fee2e2', color:'#dc2626', fontSize:'14px', textAlign:'center', fontWeight:'500'}}>{message}</div>}
</section> </main> }

function Dashboard(p:any){
const {user,tab,setTab,apps,docs,setDocs,notes,schemes,form,setForm,submitApp,addDoc,isFetchingDoc,setIsFetchingDoc,processDBT,updateAppStatus,message,cvlSteps,showCVL,setShowCVL,logout,grievances}=p;
const student=user.role==='student';
const counts={submitted:apps.length,verified:apps.filter((a:any)=>['VERIFIED','NODAL_APPROVED','SANCTIONED','DBT_PROCESSING','PAID'].includes(a.status)).length,paid:apps.filter((a:any)=>a.status==='PAID').length};

const [uploadingDoc, setUploadingDoc] = useState(false);
const [docType, setDocType] = useState('Income Certificate');
const [docFile, setDocFile] = useState('');
const [expandedScheme, setExpandedScheme] = useState<string|null>(null);

  const downloadReceipt = (app: any) => {
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Application Receipt - ${app.id}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { border-bottom: 2px solid #166534; padding-bottom: 10px; margin-bottom: 30px; }
            h1 { color: #166534; margin: 0; }
            .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .field { margin-bottom: 15px; }
            .label { font-size: 12px; color: #666; text-transform: uppercase; }
            .value { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Tribal Scholarship Platform</h1>
            <p>Official Application Receipt</p>
          </div>
          <div class="details">
            <div class="field"><div class="label">Application ID</div><div class="value">${app.id}</div></div>
            <div class="field"><div class="label">Status</div><div class="value">${app.status}</div></div>
            <div class="field"><div class="label">Applicant Name</div><div class="value">${app.full_name}</div></div>
            <div class="field"><div class="label">Date Applied</div><div class="value">${new Date().toLocaleDateString()}</div></div>
            <div class="field"><div class="label">Scheme</div><div class="value">${app.scheme_id?.toUpperCase()}</div></div>
            <div class="field"><div class="label">State</div><div class="value">${app.state}</div></div>
          </div>
          <div style="margin-top:40px; font-size:12px; color:#888;">
            This is a system-generated receipt. Please keep this document for future reference.
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

return <main className="dash">
  <aside>
    <div className="logo">🌿 <b>Tribal Scholarship</b></div>
    <div className="nav">
      {(student?['overview','schemes','apply','track','documents','api-status','notifications','grievances','jago']:['overview','applications','exceptions','payments','grievances','analytics']).map((x:string)=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{({overview:'🏠 Overview',schemes:'🎓 Scholarships',apply:'📝 Apply',track:'📍 Track Status',documents:'📄 Document Wallet','api-status':'⚡ API Status',notifications:'🔔 Notifications',grievances:'🆘 Grievances',jago:'🤖 Jago',applications:'📋 Applications',exceptions:'⚠️ Exceptions',payments:'💳 DBT & Payments',analytics:'📊 Analytics'} as any)[x]}</button>)}
    </div>
    
    <div style={{marginTop: 'auto', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderTop: '1px solid var(--border)'}}>
        <div style={{width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'}}>{user.name?.[0]||'U'}</div>
        <div style={{fontSize: '14px', overflow: 'hidden'}}>
          <strong style={{display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'}}>{user.name}</strong>
          <div style={{color: 'var(--text-secondary)', fontSize: '12px'}}>{student ? 'Student' : 'Operations Portal'}</div>
        </div>
      </div>
      <button style={{width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'}} onClick={logout}>🚪 Logout</button>
    </div>
  </aside>

  <section className="content">
    <div className="contentHeader">
      <div>
        <h1>{tab==='overview'?`Good day, ${user.name?.split(' ')[0]||'there'} 👋`:tab==='api-status'?'API Integrations':tab.replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</h1>
        <p>{tab==='overview' ? 'Welcome to your unified scholarship portal.' : 'Manage your applications and documents seamlessly.'}</p>
      </div>
      <div style={{display: 'flex', gap: '12px'}}>
        <button style={{padding: '10px 16px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary)', border: 'none', fontWeight: 'bold', cursor: 'pointer'}} onClick={()=>setTab('jago')}>🤖 Ask Jago</button>
        <button style={{padding: '10px 16px', borderRadius: '8px', background: 'white', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 'bold', cursor: 'pointer', position: 'relative'}} onClick={()=>setTab('notifications')}>
          🔔 Alerts {notes.filter((n:any)=>!n.read).length > 0 && <span style={{position: 'absolute', top: '-5px', right: '-5px', background: 'var(--danger)', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '999px'}}>{notes.filter((n:any)=>!n.read).length}</span>}
        </button>
      </div>
    </div>
    {message&&<div style={{padding: '16px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '8px', marginBottom: '20px', fontWeight: '500'}}>{message}</div>}

{showCVL && <div className="cvlOverlay" onClick={()=>setShowCVL(false)}><div className="cvlModal" onClick={e=>e.stopPropagation()}>
<h3>⚡ CVL Orchestration Engine</h3>
<p style={{color:'#94a3b8', margin:0}}>Parallel processing verification against 8 authoritative sources</p>

<div className="cvlGrid">
  <div className="cvlProfile">
    <h4>Applicant Data</h4>
    <div className="profileField"><span>Name</span><b className={cvlSteps[0]?.status==='done'?'fieldVerified':''}>{user.name} {cvlSteps[0]?.status==='done'&&'✅'}</b></div>
    <div className="profileField"><span>Category</span><b className={cvlSteps[1]?.status==='done'?'fieldVerified':''}>ST/PVTG {cvlSteps[1]?.status==='done'&&'✅'}</b></div>
    <div className="profileField"><span>Institution</span><b className={cvlSteps[2]?.status==='done'?'fieldVerified':''}>Tribal Institute {cvlSteps[2]?.status==='done'&&'✅'}</b></div>
    <div className="profileField"><span>Income</span><b className={cvlSteps[5]?.status==='done'?'fieldVerified':''}>₹1,20,000 {cvlSteps[5]?.status==='done'&&'✅'}</b></div>
    <div className="profileField"><span>Bank Seeded</span><b className={cvlSteps[7]?.status==='done'?'fieldVerified':''}>{cvlSteps[7]?.status==='done'?'Yes ✅':'...'}</b></div>
  </div>
  
  <div className="cvlNodes">
    {cvlSteps.map((s:any,i:number)=><div className={`cvlNode ${s.status}`} key={i}>
      <div className="cvlNodeIcon">{s.icon || '🔗'}</div>
      <div className="cvlNodeInfo">
        <b>{s.name}</b>
        <small>{s.source}</small>
      </div>
      <div style={{textAlign:'right'}}>
        <div className="cvlNodeStatus">{s.status.toUpperCase()}</div>
        {s.time && <div style={{fontSize:11, color:'#94a3b8', marginTop:4}}>{s.time}ms</div>}
      </div>
    </div>)}
  </div>
</div>

<div className="cvlFooter">
  {cvlSteps.every(s=>s.status==='done') ? 
    <><span className="cvlPass">✅ 100% Verification Complete</span><span className="cvlTotal">Max Latency: {Math.max(...cvlSteps.map(s=>s.time||0))}ms</span></> 
    : <span style={{color:'#818cf8'}} className="pulse">Engine processing data streams...</span>
  }
</div>
</div></div>}

{student&&tab==='overview'&&<><div style={{background:'linear-gradient(135deg, #472ca3, #6b46d9)', borderRadius:'16px', padding:'32px', color:'white', marginBottom:'24px', boxShadow:'0 10px 30px rgba(71, 44, 163, 0.2)'}}>
  <h3 style={{margin:'0 0 24px 0', fontSize:'20px', fontWeight:'600'}}>Your Scholarship Journey</h3>
  <div style={{display:'flex', justifyContent:'space-between', position:'relative', padding:'0 10px'}}>
    <div style={{position:'absolute', top:'16px', left:'30px', right:'30px', height:'3px', background:'rgba(255,255,255,0.2)', zIndex:0}}></div>
    {['Discover','Apply','Document Wallet','CVL Verification','Nodal Review','Approval','DBT','Received'].map((x:string,i:number)=>{
  let step = 1; // Discover is always done
  if (apps.length > 0) {
    const s = apps[0].status;
    step = 2; // Apply done
    if (docs.length > 0) step = 3; // Document Wallet done
    if (s === 'CVL_REVIEW') step = 4;
    if (s === 'NODAL_APPROVED' || s === 'VERIFIED') step = 5;
    if (s === 'SANCTIONED') step = 6;
    if (s === 'DBT_PROCESSING') step = 7;
    if (s === 'PAID') step = 8;
  }
  return <div key={x} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', zIndex:1, width:'80px', textAlign:'center'}}>
      <div style={{width:'36px', height:'36px', borderRadius:'50%', background:i<step?'#10b981':'#311c79', border:i<step?'none':'2px solid rgba(255,255,255,0.3)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold', fontSize:'14px', boxShadow:i<step?'0 0 15px rgba(16,185,129,0.5)':'none'}}>
        {i<step?'✓':i+1}
      </div>
      <small style={{fontSize:'12px', lineHeight:'1.2', fontWeight:'500', color:i<step?'white':'rgba(255,255,255,0.6)'}}>{x}</small>
    </div>
})}</div></div>

{apps.length > 0 && <Panel title="Active Applications & Disbursement Status">
  {apps.map((a:any) => {
    const scheme = schemes.find((s:any)=>s.id === a.scheme_id);
    return <div className="listRow" key={a.id}>
      <span style={{fontSize:24}}>📋</span>
      <div>
        <b>{scheme?.name || a.scheme_id}</b>
        <p>Application ID: {a.id} • Institution: {a.institution}</p>
      </div>
      <div style={{textAlign:'right'}}>
        <span className={a.status==='PAID'?'verified':'pending'} style={{display:'inline-block', marginBottom:5}}>{a.status.replace('_', ' ')}</span>
        <br/>
        {a.status === 'PAID' ? <small style={{color:'#287845', fontWeight:800}}>✅ Funds Disbursed</small> : 
         a.status === 'SANCTIONED' ? <small style={{color:'#5540a4', fontWeight:800}}>💳 Ready for Bank</small> : 
         a.status === 'NODAL_APPROVED' ? <small style={{color:'#d97706', fontWeight:800}}>⏳ Awaiting Sanction</small> : 
         a.status === 'CVL_REVIEW' ? <small style={{color:'#b91c1c', fontWeight:800}}>⚠️ Manual Review</small> : 
         <small style={{color:'#64748b'}}>⏳ Pending Verification</small>}
      </div>
    </div>
  })}
</Panel>}

<Panel title="Available Scholarship Schemes (5)">
  <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:'20px'}}>
    {schemes.map((s:any)=><div key={s.id} style={{background:'white', borderRadius:'16px', border:'1px solid var(--border)', padding:'24px', display:'flex', flexDirection:'column', gap:'16px', boxShadow:'0 4px 12px rgba(0,0,0,0.03)', transition:'0.3s', cursor:'pointer'}} onMouseOver={e=>e.currentTarget.style.transform='translateY(-4px)'} onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
        <div style={{width:'48px', height:'48px', borderRadius:'12px', background:'linear-gradient(135deg, var(--primary), var(--primary-dark))', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px', boxShadow:'0 4px 12px rgba(91, 60, 196, 0.3)'}}>🎓</div>
        <span style={{background:'var(--primary-light)', color:'var(--primary)', padding:'4px 10px', borderRadius:'999px', fontSize:'11px', fontWeight:'700', letterSpacing:'0.5px'}}>{s.level.toUpperCase()}</span>
      </div>
      <div>
        <h3 style={{fontSize:'18px', fontWeight:'700', color:'var(--text)', margin:'0 0 8px 0', lineHeight:'1.3'}}>{s.name}</h3>
        <p style={{fontSize:'14px', color:'var(--text-secondary)', margin:0, lineHeight:'1.5'}}>{s.description}</p>
      </div>
      <button style={{marginTop:'auto', padding:'12px', background:'#f8faff', border:'1px solid rgba(91, 60, 196, 0.15)', color:'var(--primary)', borderRadius:'10px', fontWeight:'600', cursor:'pointer', transition:'0.2s', width:'100%'}} onMouseOver={e=>{e.currentTarget.style.background='var(--primary)'; e.currentTarget.style.color='white'}} onMouseOut={e=>{e.currentTarget.style.background='#f8faff'; e.currentTarget.style.color='var(--primary)'}} onClick={()=>{setForm({...form,scheme_id:s.id});setTab('apply')}}>Apply Now →</button>
    </div>)}
  </div>
</Panel>

<div className="cards"><Card icon="🎓" title="Applications" value={counts.submitted} note="submitted"/><Card icon="📄" title="Documents" value={docs.length} note="in wallet"/><Card icon="💳" title="Payments" value={counts.paid} note="completed"/></div></>} 

{student&&tab==='schemes'&&<>
  {expandedScheme ? (
    <div className="scheme" style={{padding:30}}>
       <button className="link" onClick={()=>setExpandedScheme(null)}>← Back to Scholarships</button>
       <h2 style={{marginTop:15}}>🎓 {schemes.find((s:any)=>s.id===expandedScheme)?.name}</h2>
       <span className="chip">{schemes.find((s:any)=>s.id===expandedScheme)?.level}</span>
       <p style={{fontSize:16, marginTop:20, lineHeight:1.6}}>
         {schemes.find((s:any)=>s.id===expandedScheme)?.description}
       </p>
       <div style={{background:'#f8fafc', padding:20, borderRadius:12, marginTop:20}}>
         <h4 style={{margin:0}}>Eligibility Criteria</h4>
         <ul style={{paddingLeft:20, marginTop:10, lineHeight:1.8}}>
           <li>Must belong to a Scheduled Tribe (ST).</li>
           <li>Family income must not exceed ₹2.5 Lakhs per annum.</li>
           <li>Must be enrolled in a recognized educational institution.</li>
           <li>No concurrent benefit from another Central/State scholarship.</li>
         </ul>
       </div>
       <div style={{marginTop:30}}>
         <button className="primary" onClick={()=>{setForm({...form,scheme_id:expandedScheme});setExpandedScheme(null);setTab('apply')}}>Start Application →</button>
       </div>
    </div>
  ) : (
    <div className="schemeGrid">
      {schemes.map((s:any)=><div className="scheme" key={s.id}>
        <span className="schemeIcon">🎓</span>
        <h3>{s.name}</h3>
        <span className="chip">{s.level}</span>
        <p>{s.description}</p>
        <div style={{display:'flex', gap:10, marginTop:15}}>
          <button className="secondary small" style={{flex:1}} onClick={()=>setExpandedScheme(s.id)}>Explore Details</button>
          <button className="primary small" style={{flex:1}} onClick={()=>{setForm({...form,scheme_id:s.id});setTab('apply')}}>Apply Now</button>
        </div>
      </div>)}
    </div>
  )}
</>} 

{student&&tab==='apply'&&<Panel title="Start a scholarship application">
  <div style={{padding:'15px', background:'#fff5eb', border:'1px solid #fed7aa', borderRadius:'12px', marginBottom:'20px'}}>
    <label style={{color:'#9a3412', marginTop:0}}>⚙️ CVL Validation API (Simulated Exceptions for Testing)</label>
    <select value={form.scenario||'happy'} onChange={e=>setForm({...form,scenario:e.target.value})} style={{marginTop:'5px', borderColor:'#fdba74'}}>
      <option value="happy">1. Happy Path (100% Auto-Approved)</option>
      <option value="name_mismatch">2. CVL Exception: Name Mismatch (Aadhaar vs UDISE)</option>
      <option value="income_high">3. CVL Exception: Income Limit Exceeded</option>
      <option value="bank_unseeded">4. CVL Exception: Bank Account Not Seeded (NPCI)</option>
      <option value="duplicate">5. CVL Exception: Potential Duplicate Found (NSP)</option>
    </select>
  </div>

  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
    <div style={{gridColumn: '1 / -1'}}>
      <h3 style={{fontSize:16, borderBottom:'1px solid #eee', paddingBottom:8, marginBottom:15, color:'#334155'}}>1. Scheme Selection</h3>
      <label>Scheme / Scholarship Name
        <select value={form.scheme_id} onChange={e=>setForm({...form,scheme_id:e.target.value})}>{schemes.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </label>
    </div>

    <div style={{gridColumn: '1 / -1'}}>
      <h3 style={{fontSize:16, borderBottom:'1px solid #eee', paddingBottom:8, marginBottom:15, color:'#334155', display:'flex', alignItems:'center', gap:10}}>
        2. Personal & Contact Details 
        <span className="apiTag" style={{background:'#e0e7ff', color:'#3730a3', fontSize:11}}>🔒 Auto-filled from OTR Profile</span>
      </h3>
    </div>
    <label>Applicant Full Name<input value={user?.name||''} readOnly style={{background:'#f8fafc', color:'#64748b', cursor:'not-allowed'}}/></label>
    <label>Date of Birth<input type="date" value="2002-05-14" readOnly style={{background:'#f8fafc', color:'#64748b', cursor:'not-allowed'}}/></label>
    <label>Gender<select value="Male" disabled style={{background:'#f8fafc', color:'#64748b', cursor:'not-allowed'}}><option value="Male">Male</option></select></label>
    <label>Community / Category<select value="ST" disabled style={{background:'#f8fafc', color:'#64748b', cursor:'not-allowed'}}><option value="ST">Scheduled Tribe (ST)</option></select></label>
    <label>Father's Name<input value="Ramesh Kumar" readOnly style={{background:'#f8fafc', color:'#64748b', cursor:'not-allowed'}}/></label>
    <label>Mother's Name<input value="Sunita Devi" readOnly style={{background:'#f8fafc', color:'#64748b', cursor:'not-allowed'}}/></label>
    <label>Mobile Number<input type="tel" value={form.mobile||''} onChange={e=>setForm({...form,mobile:e.target.value})} placeholder="10-digit mobile number"/></label>
    <label>State of Domicile<select value={form.state||''} onChange={e=>setForm({...form,state:e.target.value})}><option value="">Select...</option>
      <option value="Andhra Pradesh">Andhra Pradesh</option>
      <option value="Arunachal Pradesh">Arunachal Pradesh</option>
      <option value="Assam">Assam</option>
      <option value="Bihar">Bihar</option>
      <option value="Chhattisgarh">Chhattisgarh</option>
      <option value="Goa">Goa</option>
      <option value="Gujarat">Gujarat</option>
      <option value="Haryana">Haryana</option>
      <option value="Himachal Pradesh">Himachal Pradesh</option>
      <option value="Jharkhand">Jharkhand</option>
      <option value="Karnataka">Karnataka</option>
      <option value="Kerala">Kerala</option>
      <option value="Madhya Pradesh">Madhya Pradesh</option>
      <option value="Maharashtra">Maharashtra</option>
      <option value="Manipur">Manipur</option>
      <option value="Meghalaya">Meghalaya</option>
      <option value="Mizoram">Mizoram</option>
      <option value="Nagaland">Nagaland</option>
      <option value="Odisha">Odisha</option>
      <option value="Punjab">Punjab</option>
      <option value="Rajasthan">Rajasthan</option>
      <option value="Sikkim">Sikkim</option>
      <option value="Tamil Nadu">Tamil Nadu</option>
      <option value="Telangana">Telangana</option>
      <option value="Tripura">Tripura</option>
      <option value="Uttar Pradesh">Uttar Pradesh</option>
      <option value="Uttarakhand">Uttarakhand</option>
      <option value="West Bengal">West Bengal</option>
      <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
      <option value="Chandigarh">Chandigarh</option>
      <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
      <option value="Delhi">Delhi</option>
      <option value="Jammu and Kashmir">Jammu and Kashmir</option>
      <option value="Ladakh">Ladakh</option>
      <option value="Lakshadweep">Lakshadweep</option>
      <option value="Puducherry">Puducherry</option>
    </select></label>

    <div style={{gridColumn: '1 / -1'}}>
      <h3 style={{fontSize:16, borderBottom:'1px solid #eee', paddingBottom:8, marginBottom:15, color:'#334155'}}>3. Academic Details (Current)</h3>
    </div>
    {form.scheme_id === 'top-class' ? (
      <label>Top-Class Institution Name
        <select value={form.institution||''} onChange={e=>setForm({...form,institution:e.target.value})}>
          <option value="">Select Institute...</option>
          {TOP_INSTITUTES.map(inst => <option key={inst} value={inst}>{inst}</option>)}
        </select>
      </label>
    ) : (
      <label>Institution Name<input value={form.institution||''} onChange={e=>setForm({...form,institution:e.target.value})} placeholder="Name of school/college"/></label>
    )}
    <label>Institution AISHE/UDISE Code<input value={form.udise_code||''} onChange={e=>setForm({...form,udise_code:e.target.value})} placeholder="Optional: Fetch from UDISE+" /></label>
    <label>Course / Class<input value={form.course||''} onChange={e=>setForm({...form,course:e.target.value})} placeholder="e.g. B.Tech Computer Science"/></label>
    <label>Admission Year<input type="number" value={form.academic_year||''} onChange={e=>setForm({...form,academic_year:e.target.value})} placeholder="e.g. 2024"/></label>
    <label>Previous Year Marks (%)<input type="number" value={form.prev_marks||''} onChange={e=>setForm({...form,prev_marks:e.target.value})} placeholder="e.g. 85"/></label>
    <label>Hosteler / Day Scholar<select value={form.hosteler||''} onChange={e=>setForm({...form,hosteler:e.target.value})}><option value="">Select...</option><option value="Day Scholar">Day Scholar</option><option value="Hosteler">Hosteler</option></select></label>

    {form.scheme_id === 'nos' && (
      <>
        <div style={{gridColumn: '1 / -1'}}>
          <h3 style={{fontSize:16, borderBottom:'1px solid #eee', paddingBottom:8, marginBottom:15, color:'#334155'}}>Overseas Study Details (NOS Specific)</h3>
        </div>
        <label>Passport Number<input value={form.passport||''} onChange={e=>setForm({...form,passport:e.target.value})} placeholder="Valid Indian Passport No."/></label>
        <label>Country of Study<input value={form.country||''} onChange={e=>setForm({...form,country:e.target.value})} placeholder="e.g. USA, UK, Germany"/></label>
        <label>Foreign University Name<input value={form.foreign_uni||''} onChange={e=>setForm({...form,foreign_uni:e.target.value})} placeholder="e.g. Stanford University"/></label>
        <label>GRE/TOEFL/IELTS Score<input value={form.english_score||''} onChange={e=>setForm({...form,english_score:e.target.value})} placeholder="Score & Test Name"/></label>
      </>
    )}

    {form.scheme_id === 'nfst' && (
      <>
        <div style={{gridColumn: '1 / -1'}}>
          <h3 style={{fontSize:16, borderBottom:'1px solid #eee', paddingBottom:8, marginBottom:15, color:'#334155'}}>Research Fellowship Details (NFST Specific)</h3>
        </div>
        <label>UGC NET / JRF Roll Number<input value={form.net_roll||''} onChange={e=>setForm({...form,net_roll:e.target.value})} placeholder="Enter valid roll number"/></label>
        <label>Research Topic / Thesis Title<input value={form.thesis_title||''} onChange={e=>setForm({...form,thesis_title:e.target.value})} placeholder="Approved topic of research"/></label>
      </>
    )}

    {form.scheme_id === 'top-class' && (
      <>
        <div style={{gridColumn: '1 / -1'}}>
          <h3 style={{fontSize:16, borderBottom:'1px solid #eee', paddingBottom:8, marginBottom:15, color:'#334155'}}>Premier Institute Entrance Details (Top Class Specific)</h3>
        </div>
        <label>Entrance Exam Name<select value={form.entrance_exam||''} onChange={e=>setForm({...form,entrance_exam:e.target.value})}><option value="">Select...</option><option value="JEE Advanced">JEE Advanced</option><option value="NEET">NEET</option><option value="CAT">CAT</option><option value="CLAT">CLAT</option><option value="Other">Other</option></select></label>
        <label>All India Rank (AIR)<input type="number" value={form.exam_rank||''} onChange={e=>setForm({...form,exam_rank:e.target.value})} placeholder="e.g. 4500"/></label>
      </>
    )}

    <div style={{gridColumn: '1 / -1'}}>
      <h3 style={{fontSize:16, borderBottom:'1px solid #eee', paddingBottom:8, marginBottom:15, color:'#334155'}}>4. Financial & Bank Details</h3>
    </div>
    <label>Annual Family Income (₹)<input type="number" value={form.annual_income||''} onChange={e=>setForm({...form,annual_income:Number(e.target.value)})} placeholder="e.g. 150000"/></label>
    <label>Bank Account Number<input type="password" value={form.account_no||''} onChange={e=>setForm({...form,account_no:e.target.value})} placeholder="Must be Aadhaar seeded"/></label>
    <div style={{gridColumn: '1 / -1'}}>
      <label>Bank IFSC Code<input value={form.ifsc||''} onChange={async e=>{const code=e.target.value.toUpperCase();setForm({...form,ifsc:code,bankName:code.length===11?'⏳ Fetching from live API...':''});if(code.length===11){try{const res=await fetch(`https://ifsc.razorpay.com/${code}`);if(res.ok){const data=await res.json();setForm(prev=>({...prev,ifsc:code,bankName:`✅ ${data.BANK} - ${data.BRANCH}, ${data.CITY}`}))}else{setForm(prev=>({...prev,ifsc:code,bankName:'❌ Invalid IFSC Code'}))}}catch(err){}}}} placeholder="e.g. SBIN0000001" maxLength={11}/></label>
      {form.bankName&&<div style={{fontSize:13,padding:'8px 12px',background:form.bankName.includes('✅')?'#e8f8ed':form.bankName.includes('❌')?'#fee2e2':'#f3f2fa',color:form.bankName.includes('✅')?'#277c45':form.bankName.includes('❌')?'#b91c1c':'#555',borderRadius:10,marginBottom:15,fontWeight:600}}>{form.bankName}</div>}
    </div>
  </div>
  
  <div style={{background:'#f8f9fa', padding:15, borderRadius:8, marginTop:20, marginBottom:20, fontSize:12, color:'#64748b'}}>
    <input type="checkbox" checked={form.consent||false} onChange={e=>setForm({...form,consent:e.target.checked})} id="consent_box" style={{marginRight:8}} />
    <label htmlFor="consent_box" style={{display:'inline', fontWeight:'normal'}}>I hereby declare that the information provided is true to the best of my knowledge. I consent to the use of my Aadhaar for eKYC and API Setu data fetching (UDISE+, DigiLocker, PFMS) for verification purposes.</label>
  </div>
  
  <button className="primary" style={{width:'100%', padding:'14px', fontSize:16}} onClick={submitApp} disabled={!form.consent || (form.ifsc?.length===11&&!form.bankName?.includes('✅'))}>Submit Final Application →</button>
</Panel>}

{student&&tab==='track'&&<Panel title="Application Tracking & Status">
  {apps.length ? apps.map((a:any) => (
    <div key={a.id} style={{border:'1px solid #ececf4', borderRadius:12, padding:20, marginBottom:20}}>
      <div style={{display:'flex', justifyContent:'space-between', borderBottom:'1px solid #ececf4', paddingBottom:15, marginBottom:15, alignItems:'center'}}>
        <div>
          <h3 style={{margin:0, color:'#1e1b4b'}}>{a.id}</h3>
          <p style={{margin:0, color:'#555'}}>{schemes.find((s:any)=>s.id===a.scheme_id)?.name || a.scheme_id}</p>
          {a.institution && <p style={{margin:'4px 0 0', fontSize:13, color:'#888', fontWeight:500}}>🏫 {a.institution}</p>}
        </div>
        <div style={{textAlign:'right'}}>
          <span className="apiTag" style={{background:'#e8f8ed', color:'#277c45'}}>Status: {a.status}</span>
          <div style={{fontSize:12, color:'#999', marginTop:5}}>Submitted on: {new Date(a.created_at).toLocaleDateString()}</div>
          <button className="secondary small" onClick={() => downloadReceipt(a)} style={{marginTop:10}}>📥 Download Receipt</button>
        </div>
      </div>
      
      <div style={{display:'flex', justifyContent:'space-between', position:'relative', marginTop:30}}>
        <div style={{position:'absolute', top:15, left:20, right:20, height:3, background:'#ececf4', zIndex:0}}></div>
        
        {['SUBMITTED', 'CVL_REVIEW', 'NODAL_APPROVED', 'SANCTIONED', 'PAID'].map((step, idx) => {
          const statuses = ['SUBMITTED', 'CVL_REVIEW', 'NODAL_APPROVED', 'SANCTIONED', 'PAID'];
          const currentIndex = statuses.indexOf(a.status === 'VERIFIED' ? 'CVL_REVIEW' : a.status);
          const isCompleted = idx <= currentIndex || a.status === 'PAID';
          const isActive = idx === currentIndex && a.status !== 'PAID';
          const labels = ['Submitted', 'Verification', 'Nodal Approval', 'Admin Sanction', 'DBT Disbursed'];
          
          return <div key={step} style={{position:'relative', zIndex:1, textAlign:'center', width:80}}>
            <div style={{
              width:30, height:30, borderRadius:'50%', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'center',
              background: isCompleted ? '#4ade80' : '#fff',
              border: isActive ? '3px solid #22c55e' : isCompleted ? '3px solid #4ade80' : '3px solid #cbd5e1',
              color: isCompleted ? '#fff' : '#cbd5e1',
              fontWeight:'bold'
            }}>
              {isCompleted ? '✓' : idx+1}
            </div>
            <div style={{fontSize:11, marginTop:8, fontWeight:isActive?600:400, color:isActive?'#1e1b4b':'#64748b'}}>{labels[idx]}</div>
          </div>
        })}
      </div>
      
      {a.status === 'CVL_REVIEW' && <div style={{marginTop:20, padding:15, background:'#fffbeb', borderLeft:'4px solid #f59e0b', borderRadius:4, fontSize:13}}>
        <b>⚠️ Manual Review Pending:</b> {a.exception_reason || 'Your application has been flagged for manual verification by the Nodal Officer.'}
      </div>}
      {a.status === 'PAID' && <div style={{marginTop:20, padding:15, background:'#f0fdf4', borderLeft:'4px solid #22c55e', borderRadius:4, fontSize:13}}>
        <b>🎉 Payment Successful:</b> Your scholarship has been disbursed via DBT to your verified bank account.
      </div>}
    </div>
  )) : (
    <div style={{textAlign:'center', padding:40, color:'#94a3b8'}}>
      <span style={{fontSize:40, display:'block', marginBottom:10}}>📭</span>
      You haven't submitted any applications yet.
    </div>
  )}
</Panel>}

{student&&tab==='documents'&&<>
  <Panel title="Live API Integrations (Fetch & Verify)">
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
      <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:15}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <span style={{fontSize:24}}>🆔</span>
          <b style={{color:'#1e293b'}}>UIDAI Aadhaar eKYC</b>
        </div>
        <p style={{fontSize:12, color:'#64748b', marginBottom:10}}>Fetch verified identity & demographic profile.</p>
        <input id="api_aadhaar" placeholder="12-digit Aadhaar Number" style={{padding:8, width:'100%', marginBottom:10}} />
        <button className="primary small" style={{width:'100%'}} onClick={()=>{
          const val = (document.getElementById('api_aadhaar') as HTMLInputElement).value;
          if(val) addDoc('UIDAI', val, 'Aadhaar eKYC Identity Profile');
        }}>{isFetchingDoc==='UIDAI'?'⏳ Fetching...':'Trigger UIDAI API →'}</button>
      </div>

      <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:15}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <span style={{fontSize:24}}>📜</span>
          <b style={{color:'#1e293b'}}>State eDistrict / DigiLocker</b>
        </div>
        <p style={{fontSize:12, color:'#64748b', marginBottom:10}}>Fetch Income & Caste certificates.</p>
        <input id="api_cert" placeholder="Certificate / App / RD Number" style={{padding:8, width:'100%', marginBottom:10}} />
        <button className="primary small" style={{width:'100%'}} onClick={()=>{
          const val = (document.getElementById('api_cert') as HTMLInputElement).value;
          if(val) addDoc('DigiLocker', val, 'Family Income & Caste Certificate');
        }}>{isFetchingDoc==='DigiLocker'?'⏳ Fetching...':'Trigger eDistrict API →'}</button>
      </div>

      <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:15}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <span style={{fontSize:24}}>🏫</span>
          <b style={{color:'#1e293b'}}>UDISE+ / APAAR Registry</b>
        </div>
        <p style={{fontSize:12, color:'#64748b', marginBottom:10}}>Fetch Academic records & Institution bonafide.</p>
        <input id="api_udise" placeholder="APAAR ID / PEN Number" style={{padding:8, width:'100%', marginBottom:10}} />
        <button className="primary small" style={{width:'100%'}} onClick={()=>{
          const val = (document.getElementById('api_udise') as HTMLInputElement).value;
          if(val) addDoc('UDISE+', val, 'Academic Records & Institution Bonafide');
        }}>{isFetchingDoc==='UDISE+'?'⏳ Fetching...':'Trigger UDISE+ API →'}</button>
      </div>

      <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:15}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <span style={{fontSize:24}}>♿</span>
          <b style={{color:'#1e293b'}}>Swavlamban / UDID</b>
        </div>
        <p style={{fontSize:12, color:'#64748b', marginBottom:10}}>Fetch Disability Certificate details.</p>
        <input id="api_udid" placeholder="UDID Card Number" style={{padding:8, width:'100%', marginBottom:10}} />
        <button className="primary small" style={{width:'100%'}} onClick={()=>{
          const val = (document.getElementById('api_udid') as HTMLInputElement).value;
          if(val) addDoc('UDID', val, 'Disability Certificate (UDID)');
        }}>{isFetchingDoc==='UDID'?'⏳ Fetching...':'Trigger UDID API →'}</button>
      </div>

      <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:15}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <span style={{fontSize:24}}>🎓</span>
          <b style={{color:'#1e293b'}}>NTA / UGC NET Database</b>
        </div>
        <p style={{fontSize:12, color:'#64748b', marginBottom:10}}>Fetch NET/JRF Qualification for NFST.</p>
        <input id="api_nta" placeholder="NTA Application/Roll No." style={{padding:8, width:'100%', marginBottom:10}} />
        <button className="primary small" style={{width:'100%'}} onClick={()=>{
          const val = (document.getElementById('api_nta') as HTMLInputElement).value;
          if(val) addDoc('NTA', val, 'UGC NET / JRF Award Letter');
        }}>{isFetchingDoc==='NTA'?'⏳ Fetching...':'Trigger NTA API →'}</button>
      </div>

      <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:15}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <span style={{fontSize:24}}>📤</span>
          <b style={{color:'#1e293b'}}>Manual Upload (Fallback)</b>
        </div>
        <p style={{fontSize:12, color:'#64748b', marginBottom:10}}>If API fetch fails, upload a physical scan.</p>
        <div style={{padding:8, width:'100%', marginBottom:10, visibility:'hidden'}}>_</div>
        <button className="primary small" style={{width:'100%', background:'#f1f5f9', color:'#334155'}} onClick={()=>setUploadingDoc(true)}>Upload Physical Scan ↑</button>
      </div>
    </div>
  </Panel>
  {uploadingDoc && <Panel title="Upload Physical Document">
    <label>Document Type
      <select value={docType} onChange={e=>setDocType(e.target.value)}>
        <option>Identity Proof (Aadhaar / Voter ID)</option>
        <option>ST / PVTG Caste Certificate</option>
        <option>Academic Records & Marksheets</option>
        <option>Institution Details / Bonafide Certificate</option>
        <option>NET / JRF Qualification Certificate</option>
        <option>Disability Certificate (UDID)</option>
        <option>Family Income Certificate</option>
        <option>State Domicile Certificate</option>
      </select>
    </label>
    <label>Select File (PDF/JPEG)
      <input type="file" onChange={()=>setDocFile('selected')} accept=".pdf,.jpg,.png" style={{padding:'8px'}}/>
    </label>
    <div style={{display:'flex', gap:10}}>
      <button className="primary small" onClick={async () => {
        setIsFetchingDoc('Manual');
        const d=await call('/documents',{method:'POST',body:JSON.stringify({student_id:user.id,name:docType,source:'Manual Upload',document_type:'Scan/PDF'})});
        setDocs([d,...docs]);
        setUploadingDoc(false);
        setIsFetchingDoc('');
        setDocFile('');
        
        if (appForm.scheme_id && docs.length === 0) {
          setMessage(`Document uploaded successfully. Auto-submitting your pending application...`);
          setTimeout(() => submitApp([d,...docs]), 1500);
        } else {
          setMessage(`Document uploaded and safely stored in your wallet.`);
        }
      }} disabled={!docFile}>Submit Upload →</button>
      <button className="primary small" style={{background:'#eee9ff', color:'#5540a4'}} onClick={()=>setUploadingDoc(false)}>Cancel</button>
    </div>
  </Panel>}

{student&&tab==='grievances'&&<Panel title="Help & Grievance Support">
  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:30}}>
    <div style={{border:'1px solid #e2e8f0', borderRadius:12, padding:20, background:'#f8fafc'}}>
      <h3 style={{fontSize:16, marginTop:0, color:'#0f172a'}}>File a new Grievance</h3>
      <label>Issue Category
        <select value={grvForm.category} onChange={e=>setGrvForm({...grvForm,category:e.target.value})}>
          <option value="">Select...</option>
          <option value="Payment Delay">DBT / Payment Delay</option>
          <option value="Document Rejection">Incorrect Document Rejection</option>
          <option value="Technical Issue">Technical / Portal Issue</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label>Detailed Description
        <textarea value={grvForm.description} onChange={e=>setGrvForm({...grvForm,description:e.target.value})} rows={4} placeholder="Please describe your issue in detail..."></textarea>
      </label>
      <button className="primary" style={{width:'100%', marginTop:10}} onClick={async ()=>{
        if(!grvForm.category || !grvForm.description) return setMessage('⚠️ Please fill all grievance fields.');
        try {
          const g=await call('/grievances',{method:'POST',body:JSON.stringify({student_id:user.id, ...grvForm})});
          setGrievances([g,...grievances]);
          setGrvForm({category:'',description:''});
          setMessage('✅ Grievance submitted successfully!');
        } catch(e:any) { setMessage(e.message) }
      }}>Submit Grievance →</button>
    </div>
    
    <div>
      <h3 style={{fontSize:16, marginTop:0, color:'#0f172a'}}>Your Grievance History</h3>
      {grievances.length ? grievances.map((g:any)=><div key={g.id} style={{padding:15, border:'1px solid #e2e8f0', borderRadius:8, marginBottom:10, background:'#fff'}}>
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
          <b style={{color:'#334155'}}>{g.category}</b>
          <span className="chip" style={{fontSize:10}}>{g.status}</span>
        </div>
        <div style={{fontSize:13, color:'#475569', lineHeight:1.5}}>{g.description}</div>
        <div style={{fontSize:11, color:'#94a3b8', marginTop:8, display:'flex', justifyContent:'space-between'}}>
          <span>Ticket: {g.id}</span>
          <span>{new Date(g.created_at).toLocaleDateString()}</span>
        </div>
      </div>) : <div style={{color:'#94a3b8', padding:40, textAlign:'center', border:'1px dashed #cbd5e1', borderRadius:8}}>No grievances filed yet.</div>}
    </div>
  </div>
</Panel>}

  <Panel title="Document Wallet">
    {docs.length?docs.map((d:any)=><div className="listRow" key={d.id}>
      <span>{d.status==='VERIFIED'?'📄':'📝'}</span>
      <div>
        <b>{d.name}</b>
        <p>{d.source} • {d.document_type} {d.status==='VERIFIED' && <span className="apiTag">API Verified</span>}</p>
      </div>
      <span className={d.status==='VERIFIED'?'verified':'pending'}>{d.status==='VERIFIED' ? '✅ Verified' : '⏳ Pending Nodal Review'}</span>
    </div>):<p className="muted">Your documents will appear here. Fetch via DigiLocker/API Setu for instant verification, or upload manually.</p>}
  </Panel>
</>}

{student&&tab==='api-status'&&<APIStatusPanel/>}

{student&&tab==='notifications'&&<Panel title="Notification Center">{notes.map((n:any)=><div className="listRow" key={n.id}><span>{n.kind==='success'?'🟢':n.kind==='warning'?'🟠':'🔵'}</span><div><b>{n.title}</b><p>{n.message}</p></div><small>{new Date(n.created_at).toLocaleString()}</small></div>)}</Panel>} {student&&tab==='grievances'&&<Panel title="Grievance & support"><p>Submit a grievance and receive updates through the same notification engine.</p><button className="primary small" onClick={async()=>{await fetch(API+'/grievances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student_id:user.id,subject:'Application support',description:'Demo grievance'})}); setTab('notifications')}}>Create demo grievance</button></Panel>} {student&&tab==='jago'&&<Jago/>} 
{!student&&(tab==='overview'||tab==='applications'||tab==='exceptions'||tab==='payments'||tab==='grievances')&&<Operations role={user.role} apps={tab==='exceptions'?apps.filter((a:any)=>a.status==='CVL_REVIEW'):tab==='payments'?apps.filter((a:any)=>a.status==='SANCTIONED'||a.status==='PAID'):apps} processDBT={processDBT} updateAppStatus={updateAppStatus} schemes={schemes} tab={tab} grievances={grievances}/>}
{!student&&tab==='analytics'&&<Analytics apps={apps} />}
</section> </main> }

function Analytics({apps}:any) {
  const [activeView, setActiveView] = useState('gap');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const mockGapData = [
    { state: 'Odisha', district: 'Koraput', enrolled: 12500, registered: 8200, gap: 4300 },
    { state: 'Jharkhand', district: 'Ranchi', enrolled: 18200, registered: 14100, gap: 4100 },
    { state: 'Chhattisgarh', district: 'Bastar', enrolled: 9400, registered: 6100, gap: 3300 },
    { state: 'Madhya Pradesh', district: 'Jhabua', enrolled: 15600, registered: 11000, gap: 4600 },
  ];

  const handleOutreach = () => {
    setSending(true);
    setTimeout(() => { setSending(false); setSent(true); }, 2000);
  }

  return <div>
    <div className="tabs" style={{marginBottom: 20, maxWidth: 500}}>
      <button className={activeView==='gap'?'active':''} onClick={()=>setActiveView('gap')}>UDISE+ Gap Analysis</button>
      <button className={activeView==='duplicate'?'active':''} onClick={()=>setActiveView('duplicate')}>Duplicate / Integrity Flags</button>
    </div>

    {activeView === 'gap' && <Panel title="Unreached Beneficiaries (UDISE+ vs Scholarship Registry)">
      <p style={{color:'#67697a', marginBottom:20}}>Cross-referencing UDISE+ school enrollment data with our scholarship registry to identify eligible ST students not receiving benefits.</p>
      
      <div className="cards">
        <Card icon="🏫" title="Total ST Enrolled" value="55,700" note="UDISE+ data (4 districts)" />
        <Card icon="📝" title="Active Beneficiaries" value="39,400" note="Registered in portal" />
        <Card icon="⚠️" title="Coverage Gap" value="16,300" note="Unreached students (29%)" />
      </div>

      <table style={{width:'100%', textAlign:'left', borderCollapse:'collapse', marginTop:20, fontSize:14}}>
        <thead>
          <tr style={{borderBottom:'2px solid #ececf4', color:'#777'}}>
            <th style={{padding:'12px 8px'}}>State / District</th>
            <th style={{padding:'12px 8px'}}>Enrolled (UDISE+)</th>
            <th style={{padding:'12px 8px'}}>Registered</th>
            <th style={{padding:'12px 8px'}}>Unreached Gap</th>
            <th style={{padding:'12px 8px'}}>Action</th>
          </tr>
        </thead>
        <tbody>
          {mockGapData.map((d,i)=>(
            <tr key={i} style={{borderBottom:'1px solid #ececf4'}}>
              <td style={{padding:'12px 8px'}}><b>{d.district}</b>, {d.state}</td>
              <td style={{padding:'12px 8px'}}>{d.enrolled.toLocaleString()}</td>
              <td style={{padding:'12px 8px'}}>{d.registered.toLocaleString()}</td>
              <td style={{padding:'12px 8px', color:'#d97706', fontWeight:800}}>{d.gap.toLocaleString()}</td>
              <td style={{padding:'12px 8px'}}>
                <button className="primary small" disabled={sending||sent} onClick={handleOutreach} style={{background:sent?'#10b981':''}}>
                  {sending ? 'Sending...' : sent ? '✅ SMS Sent' : 'Send SMS Outreach'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>}

    {activeView === 'duplicate' && <Panel title="Integrity & Duplicate Flags">
      <p style={{color:'#67697a', marginBottom:20}}>Real-time matching of Aadhaar and demographic data to prevent double-dipping across multiple schemes.</p>
      
      <table style={{width:'100%', textAlign:'left', borderCollapse:'collapse', fontSize:14}}>
        <thead>
          <tr style={{borderBottom:'2px solid #ececf4', color:'#777'}}>
            <th style={{padding:'12px 8px'}}>Aadhaar / Student</th>
            <th style={{padding:'12px 8px'}}>Detected Overlap</th>
            <th style={{padding:'12px 8px'}}>Match Type</th>
            <th style={{padding:'12px 8px'}}>System Action</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{borderBottom:'1px solid #ececf4', background:'#fff5f5'}}>
            <td style={{padding:'12px 8px'}}><b>Ramesh K.</b><br/><small>XXXX-XXXX-4921</small></td>
            <td style={{padding:'12px 8px'}}>Applied for <b>Post-Matric</b> AND <b>Top Class</b></td>
            <td style={{padding:'12px 8px'}}><span className="apiTag" style={{background:'#fee2e2', color:'#b91c1c'}}>Exact Aadhaar Match</span></td>
            <td style={{padding:'12px 8px'}}><span style={{color:'#b91c1c', fontWeight:800}}>Auto-Rejected</span> (Top Class)</td>
          </tr>
          <tr style={{borderBottom:'1px solid #ececf4', background:'#fffbeb'}}>
            <td style={{padding:'12px 8px'}}><b>Sunita M.</b><br/><small>XXXX-XXXX-1182</small></td>
            <td style={{padding:'12px 8px'}}>Existing State Govt Scholarship detected</td>
            <td style={{padding:'12px 8px'}}><span className="apiTag" style={{background:'#fef3c7', color:'#d97706'}}>NSP Cross-Check</span></td>
            <td style={{padding:'12px 8px'}}><button className="primary small" style={{background:'#d97706'}}>Manual Review</button></td>
          </tr>
        </tbody>
      </table>
    </Panel>}
  </div>
}

function APIStatusPanel(){
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number|null>(null);
  
  useEffect(() => {
    fetch(API+'/setu/api-status')
      .then(r=>r.json())
      .then(d=>{
        if (d.apis) setStatuses(d.apis);
        else setError('Invalid response format');
        setLoading(false);
      })
      .catch((e)=>{
        setError(e.message || 'Connection failed');
        setLoading(false);
      });
  }, []);

  if(loading) return <Panel title="API Integration Status"><p>Loading API status...</p></Panel>;
  if(error) return <Panel title="API Integration Status"><p style={{color:'red'}}>Error: {error}. Please ensure the backend is running.</p></Panel>;

  return <Panel title="API Orchestration Registry">
    <p style={{color:'#67697a', marginBottom:20}}>
      This registry lists all active microservices, including <b>API Setu</b> endpoints and our <b>Custom Internal Pipelines</b>. Click any row to view the live request/response data shapes.
    </p>
    
    <div style={{overflowX: 'auto'}}>
      <table style={{width:'100%', textAlign:'left', borderCollapse:'collapse', fontSize:13}}>
        <thead>
          <tr style={{borderBottom:'2px solid #ececf4', color:'#777'}}>
            <th style={{padding:'12px 8px'}}>Service Name</th>
            <th style={{padding:'12px 8px'}}>Provider</th>
            <th style={{padding:'12px 8px'}}>Method & Endpoint</th>
            <th style={{padding:'12px 8px'}}>Live Status</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((a:any, i:number) => (
            <React.Fragment key={i}>
              <tr onClick={()=>setExpandedId(expandedId===i?null:i)} style={{borderBottom:expandedId===i?'none':'1px solid #ececf4', cursor:'pointer', background:expandedId===i?'#faf9ff':''}}>
                <td style={{padding:'16px 8px'}}>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <span style={{fontSize:20}}>{a.icon}</span>
                    <b style={{fontSize:14}}>{a.name}</b>
                  </div>
                </td>
                <td style={{padding:'16px 8px'}}>
                  <span className="apiTag" style={{background:a.provider==='API Setu'?'#eee9ff':'#e8f8ed', color:a.provider==='API Setu'?'#5540a4':'#277c45'}}>{a.provider}</span>
                </td>
                <td style={{padding:'16px 8px', fontFamily:'monospace', color:'#5c46c7'}}>
                  <b>{a.method}</b> {a.endpoint}
                </td>
                <td style={{padding:'16px 8px'}}>
                  <span className={a.status==='Connected'?'verified':'pending'}>● {a.status}</span>
                  <small style={{marginLeft:10, color:'#999'}}>{a.latency}</small>
                </td>
              </tr>
              {expandedId === i && (
                <tr style={{borderBottom:'1px solid #ececf4', background:'#faf9ff'}}>
                  <td colSpan={4} style={{padding:'0 20px 20px 40px'}}>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
                      <div>
                        <strong style={{fontSize:11, color:'#777'}}>REQUEST PAYLOAD / HEADERS</strong>
                        <pre style={{background:'#111827', color:'#4ade80', padding:15, borderRadius:12, fontSize:12, overflowX:'auto', margin:'8px 0 0'}}>{a.req}</pre>
                      </div>
                      <div>
                        <strong style={{fontSize:11, color:'#777'}}>EXPECTED RESPONSE (SUCCESS)</strong>
                        <pre style={{background:'#111827', color:'#60a5fa', padding:15, borderRadius:12, fontSize:12, overflowX:'auto', margin:'8px 0 0'}}>{a.res}</pre>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  </Panel>
}

function Card({icon,title,value,note,action}:any){
  return <div className="stat" style={{position:'relative', display:'flex', flexDirection:'column', gap:'16px', padding:'24px', background:'white', borderRadius:'16px', border:'1px solid var(--border)', boxShadow:'0 4px 12px rgba(0,0,0,0.03)', overflow:'hidden'}}>
    <div style={{position:'absolute', top:'-20px', right:'-20px', fontSize:'120px', opacity:0.03, zIndex:0}}>{icon}</div>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', zIndex:1}}>
      <div style={{width:'48px', height:'48px', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--primary-light)', color:'var(--primary)', borderRadius:'12px', fontSize:'24px'}}>{icon}</div>
      {action && <button onClick={action} style={{border:'none', background:'transparent', color:'var(--primary)', cursor:'pointer', fontSize:'14px', fontWeight:'600', padding:'6px 12px', borderRadius:'8px', backgroundColor:'#f8faff'}}>View →</button>}
    </div>
    <div style={{zIndex:1}}>
      <div style={{color:'var(--text-secondary)', fontSize:'15px', fontWeight:'500', marginBottom:'6px'}}>{title}</div>
      <div style={{fontSize:'36px', fontWeight:'700', color:'var(--text)', letterSpacing:'-1px'}}>{value}</div>
      {note && <div style={{fontSize:'13px', color:'var(--text-secondary)', marginTop:'8px', display:'flex', alignItems:'center', gap:'6px', fontWeight:'500'}}><span style={{color:'var(--success)'}}>●</span> {note}</div>}
    </div>
  </div>
}

function Panel({title,children, actions}:any){
  return <section className="panel" style={{background:'white', borderRadius:'16px', border:'1px solid var(--border)', boxShadow:'0 4px 12px rgba(0,0,0,0.03)', overflow:'hidden', marginBottom:'24px'}}>
    <div className="panelHead" style={{padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fbfbfe'}}>
      <h3 style={{margin:0, fontSize:'18px', fontWeight:'600', color:'var(--text)'}}>{title}</h3>
      {actions && <div style={{display:'flex', gap:'10px'}}>{actions}</div>}
    </div>
    <div style={{padding:'24px'}}>
      {children}
    </div>
  </section>
}

function Jago(){
  const [msgs, setMsgs] = useState([
    {type:'bot', text:'Hi! 👋 I\'m Jago, your AI-powered scholarship companion.\n\nI can answer anything about this portal — schemes, eligibility, applications, documents, verification, payments, and more!\n\nType your question below or tap a suggestion.'}
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [suggestions, setSuggestions] = useState([
    'Which schemes can I apply for?',
    'What is the eligibility criteria?',
    'How does CVL verification work?',
    'How do DigiLocker and API Setu connect?',
    'How does DBT payment work?'
  ]);
  const [sessionId] = useState('s-'+Math.random().toString(36).slice(2));
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior:'smooth'});
  }, [msgs, typing]);

  const handleQ = async (q: string) => {
    if (!q.trim() || typing) return;
    setMsgs(m => [...m, {type:'user', text: q}]);
    setInput('');
    setTyping(true);

    try {
      const r = await fetch(API+'/jago/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({message: q, session_id: sessionId})
      });
      const d = await r.json();
      setMsgs(m => [...m, {type:'bot', text: d.reply}]);
      if(d.suggestions?.length) setSuggestions(d.suggestions);
    } catch(e:any) {
      setMsgs(m => [...m, {type:'bot', text:'Sorry, I couldn\'t connect to the server. Please check your connection.'}]);
    }
    setTyping(false);
  };

  return <div style={{display:'flex', flexDirection:'column', height:'calc(100vh - 120px)', background:'white', borderRadius:'24px', boxShadow:'0 10px 40px rgba(0,0,0,0.08)', overflow:'hidden', border:'1px solid var(--border)'}}>
    <div style={{padding:'20px 24px', background:'linear-gradient(135deg, var(--primary), var(--primary-dark))', color:'white', display:'flex', alignItems:'center', gap:'16px'}}>
      <div style={{width:'48px', height:'48px', background:'rgba(255,255,255,0.2)', borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}>🤖</div>
      <div>
        <b style={{display:'block', fontSize:'18px'}}>Jago AI</b>
        <span style={{fontSize:'13px', opacity:0.8}}>Your intelligent scholarship assistant</span>
      </div>
    </div>
    
    <div style={{flex:1, padding:'24px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'16px', background:'#f8f9fc'}}>
      {msgs.map((m, i) => (
        <div key={i} style={{alignSelf: m.type==='user'?'flex-end':'flex-start', maxWidth:'80%', padding:'16px', borderRadius:'16px', background: m.type==='user'?'var(--primary)':'white', color: m.type==='user'?'white':'var(--text)', boxShadow:'0 4px 12px rgba(0,0,0,0.05)', border: m.type==='user'?'none':'1px solid var(--border)', whiteSpace:'pre-line', fontSize:'15px', lineHeight:'1.5', borderBottomRightRadius: m.type==='user'?'4px':'16px', borderBottomLeftRadius: m.type==='bot'?'4px':'16px'}}>
          {m.text}
        </div>
      ))}
      {typing && <div style={{alignSelf:'flex-start', padding:'16px', borderRadius:'16px', background:'white', border:'1px solid var(--border)', borderBottomLeftRadius:'4px', display:'flex', gap:'4px'}}><span className="dot">•</span><span className="dot">•</span><span className="dot">•</span></div>}
      
      {suggestions.length > 0 && <div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'16px'}}>
        {suggestions.map((s,i) => <button key={s+i} onClick={()=>handleQ(s)} style={{padding:'10px 16px', background:'var(--primary-light)', color:'var(--primary-dark)', border:'1px solid rgba(91, 60, 196, 0.2)', borderRadius:'999px', fontSize:'13px', fontWeight:'500', cursor:'pointer', transition:'0.2s', textAlign:'left'}}>{s}</button>)}
      </div>}
      <div ref={chatEndRef}/>
    </div>
    
    <div style={{padding:'20px', background:'white', borderTop:'1px solid var(--border)', display:'flex', gap:'12px'}}>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey)handleQ(input)}} placeholder="Ask Jago anything..." style={{flex:1, padding:'16px 20px', borderRadius:'999px', border:'1px solid var(--border)', background:'#f1f5f9', outline:'none', fontSize:'15px'}} />
      <button onClick={()=>handleQ(input)} disabled={typing} style={{width:'54px', height:'54px', borderRadius:'50%', background:'var(--primary)', color:'white', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:typing?0.5:1, boxShadow:'0 4px 12px rgba(91, 60, 196, 0.3)'}}>
        <span style={{fontSize:'20px'}}>↑</span>
      </button>
    </div>
  </div>
}

function Operations({role,apps,processDBT,updateAppStatus,schemes,tab,grievances}:any){
  const [inputs, setInputs] = useState<any>({});
  const handleInputChange = (id:string, val:string) => setInputs({...inputs, [id]: val});

  return <>
    <div className="cards">
      <Card icon="📋" title="Total Applications" value={apps.length} note="in system"/>
      <Card icon="⚠️" title="Exceptions" value={apps.filter((a:any)=>a.status==='CVL_REVIEW').length} note="manual review needed"/>
      <Card icon="💳" title="Disbursements" value={apps.filter((a:any)=>a.status==='PAID').length} note="completed DBT"/>
    </div>
    
    <Panel title={role==='bank'?'DBT Processing Queue':'Consolidated Application & Verification Status'}>
      {apps.length ? (
        <div style={{overflowX: 'auto'}}>
          <table style={{width:'100%', textAlign:'left', borderCollapse:'collapse', fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'2px solid #ececf4', color:'#777'}}>
                <th style={{padding:'12px 8px'}}>App ID</th>
                <th style={{padding:'12px 8px'}}>Scheme</th>
                <th style={{padding:'12px 8px'}}>Institution</th>
                <th style={{padding:'12px 8px'}}>CVL / Verification</th>
                <th style={{padding:'12px 8px'}}>Sanction & Fund Status</th>
                <th style={{padding:'12px 8px'}}>Action</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a:any)=>(
                <tr key={a.id} style={{borderBottom:'1px solid #ececf4'}}>
                  <td style={{padding:'12px 8px'}}><b>{a.id}</b></td>
                  <td style={{padding:'12px 8px'}}>{schemes.find((s:any)=>s.id===a.scheme_id)?.name || a.scheme_id}</td>
                  <td style={{padding:'12px 8px', color:'#555'}}>{a.institution}</td>
                  <td style={{padding:'12px 8px'}}>
                    <span className={a.status==='SUBMITTED'?'pending':a.status.includes('REVIEW')?'pending':'verified'}>
                      {a.status}
                    </span>
                    {a.exception_reason && <div style={{marginTop:6}}><span className="apiTag" style={{background:'#fee2e2', color:'#b91c1c', whiteSpace:'normal', display:'block'}}>{a.exception_reason}</span></div>}
                  </td>
                  <td style={{padding:'12px 8px'}}>
                    {a.status==='PAID' ? <span style={{color:'#287845', fontWeight:800}}>✅ Disbursed</span> : 
                     a.status==='SANCTIONED' ? <span style={{color:'#5540a4', fontWeight:800}}>Ready for DBT</span> : 
                     <span style={{color:'#999'}}>Pending Verification</span>}
                  </td>
                  <td style={{padding:'12px 8px', minWidth: '180px'}}>
                    {role==='bank'&&a.status==='SANCTIONED' ? (
                      <div style={{display:'flex', flexDirection:'column', gap:5}}>
                        <input value={inputs[a.id]||''} onChange={e=>handleInputChange(a.id, e.target.value)} placeholder="Enter UTR No." style={{padding:'6px 10px', fontSize:12, borderRadius:8, border:'1px solid #cbd5e1'}} />
                        <button className="primary small" onClick={()=>processDBT(a.id, inputs[a.id])}>Process Transfer →</button>
                      </div>
                    ) : role==='nodal'&&a.status==='CVL_REVIEW' ? (
                      <div style={{display:'flex', flexDirection:'column', gap:5}}>
                        <input value={inputs[a.id]||''} onChange={e=>handleInputChange(a.id, e.target.value)} placeholder="Verification Remarks" style={{padding:'6px 10px', fontSize:12, borderRadius:8, border:'1px solid #cbd5e1'}} />
                        <button className="primary small" style={{background:'#d97706'}} onClick={()=>updateAppStatus(a.id, 'NODAL_APPROVED', inputs[a.id]||'Verified physical exception')}>Approve Exception ✓</button>
                      </div>
                    ) : role==='admin'&&a.status==='NODAL_APPROVED' ? (
                      <div style={{display:'flex', flexDirection:'column', gap:5}}>
                        <input value={inputs[a.id]||''} onChange={e=>handleInputChange(a.id, e.target.value)} placeholder="Sanction Order No." style={{padding:'6px 10px', fontSize:12, borderRadius:8, border:'1px solid #cbd5e1'}} />
                        <button className="primary small" style={{background:'#4ade80', color:'#064e3b'}} onClick={()=>updateAppStatus(a.id, 'SANCTIONED', `Sanctioned via Order ${inputs[a.id]||'N/A'}`)}>Sanction Funds 💳</button>
                      </div>
                    ) : <span style={{color:'#cbd5e1'}}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No applications in this demo session yet. Student submissions appear here in a shared runtime.</p>
      )}
    </Panel>

{role !== 'student' && tab==='grievances'&&<Panel title="Grievance Helpdesk (Admin)">
  {grievances.length ? (
    <table className="data" width="100%">
      <thead><tr style={{textAlign:'left', background:'#f8fafc'}}>
        <th style={{padding:12}}>Ticket ID</th>
        <th style={{padding:12}}>Category / Description</th>
        <th style={{padding:12}}>Student ID</th>
        <th style={{padding:12}}>Status</th>
        <th style={{padding:12}}>Submitted</th>
      </tr></thead>
      <tbody>
        {grievances.map((g:any)=><tr key={g.id} style={{borderBottom:'1px solid #ececf4'}}>
          <td style={{padding:12}}>{g.id}</td>
          <td style={{padding:12}}><b>{g.category}</b><div style={{fontSize:12,color:'#64748b',marginTop:4}}>{g.description}</div></td>
          <td style={{padding:12}}>{g.student_id}</td>
          <td style={{padding:12}}><span className="chip">{g.status}</span></td>
          <td style={{padding:12}}>{new Date(g.created_at).toLocaleDateString()}</td>
        </tr>)}
      </tbody>
    </table>
  ) : <div style={{padding:40, textAlign:'center', color:'#94a3b8'}}>No active grievances in the system.</div>}
</Panel>}

  </>
}
