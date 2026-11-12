/* V5 data and UI adapter. The original V4 stores remain untouched.
 * Pole metadata is separately versioned in localStorage. Never delete V4 records.
 */
(function(){
 'use strict';
 const KEY='INSULATOR_V5_POLES_V1';
 let poles=[];
 let selected=null;
 const el=id=>document.getElementById(id);
 const esc=s=>escapeHTML(s);
 const key=(pid,pole)=>pid+'::'+String(pole||'').trim().toUpperCase();
 const lookup=(pid,pole)=>poles.find(p=>key(p.projectId,p.pole)===key(pid,pole));
 const getNumber=x=>Number.isInteger(Number(x))&&Number(x)>=1&&Number(x)<=500?Number(x):null;
 const getRecords=(pid,pole)=>records.filter(r=>key(r.projectId||'legacy',r.pole)===key(pid,pole));
 const idAt=(pole,n)=>String(pole)+'-I'+String(n).padStart(2,'0');
 const status=d=>d==null?'ยังไม่ตรวจ':Number(d)>=4?'เสียหาย':Number(d)>=2?'เริ่มเสื่อม':'ปกติ';
 const statusColor=d=>d==null?'#71839b':Number(d)>=4?'#dc2626':Number(d)>=2?'#eab308':'#16a34a';
 function persist(){localStorage.setItem(KEY,JSON.stringify(poles));}
 function load(){try{let a=JSON.parse(localStorage.getItem(KEY)||'[]');poles=Array.isArray(a)?a:[]}catch(e){poles=[]}}
 function projectPoleList(pid){
  const ps=poles.filter(p=>p.projectId===pid);
  const ids=new Set(ps.map(p=>key(p.projectId,p.pole)));
  for(const r of records.filter(r=>(r.projectId||'legacy')===pid)){
   if(ids.has(key(pid,r.pole)))continue;
   const inferred=Math.max(Number(r.units)||0,...getRecords(pid,r.pole).map(x=>Number(x.units)||0),1);
   ps.push({projectId:pid,pole:r.pole,units:Math.min(500,inferred),legacy:true});ids.add(key(pid,r.pole));
  }
  return ps.sort((a,b)=>a.pole.localeCompare(b.pole,'th'));
 }
 function refreshExisting(){
  const sel=el('existingPole');if(!sel)return;
  const current=el('pole').value.trim();sel.replaceChildren();
  sel.add(new Option('＋ เสาใหม่ / กรอกรหัสเอง',''));
  for(const p of projectPoleList(activeProjectId))sel.add(new Option(p.pole+' — '+(p.units||1)+' ลูก',p.pole));
  sel.value=projectPoleList(activeProjectId).some(p=>p.pole===current)?current:'';
 }
 function updateInsulatorOptions(){
  const sel=el('insulatorSelect');const current=sel.value;sel.replaceChildren();
  const pole=el('pole').value.trim();const n=getNumber(el('units').value);
  if(!pole||!n){sel.add(new Option('กรอกรหัสเสาและจำนวนลูกถ้วยก่อน',''));return;}
  sel.add(new Option('— เลือกลูกถ้วยที่กำลังตรวจ —',''));
  for(let i=1;i<=n;i++)sel.add(new Option('ลูกที่ '+i+' ('+idAt(pole,i)+')',idAt(pole,i)));
  sel.value=[...sel.options].some(o=>o.value===current)?current:'';
  el('v5PoleNotice').textContent='เสา '+pole+' · '+n+' ลูก · เลือกลูกถ้วยเฉพาะลูกที่ต้องการตรวจ';
 }
 function onPoleInput(){
  const pole=el('pole').value.trim();const existing=lookup(activeProjectId,pole)||projectPoleList(activeProjectId).find(p=>p.pole===pole);
  if(existing){el('units').value=existing.units; if(existing.gps){el('lat').value=existing.gps.lat;el('lng').value=existing.gps.lng;gps={...existing.gps};} else {clearGPS();}}
  else {clearGPS();if(!pole)el('units').value='';}
  refreshExisting();updateInsulatorOptions();
 }
 function chooseExistingPole(pole){
  if(!pole){el('pole').value='';el('units').value='';updateInsulatorOptions();return;}
  el('pole').value=pole;onPoleInput();
 }
 function savePole(silent=false){
  const pole=el('pole').value.trim(),units=getNumber(el('units').value);
  if(!pole||!units){if(!silent)alert('กรุณากรอกรหัสเสาและจำนวนลูกถ้วยที่ถูกต้อง (1–500)');return false;}
  if(!projects.some(p=>p.id===activeProjectId)){if(!silent)alert('กรุณาเลือกโครงการก่อน');return false;}
  let existing=lookup(activeProjectId,pole);
  const latText=el('lat').value.trim(),lngText=el('lng').value.trim();
  let pos=null;
  if(latText&&lngText&&isValidCoordinate(Number(latText),Number(lngText))){pos={lat:Number(latText),lng:Number(lngText),source:gps?.source||'manual'};}
  const value={...existing,projectId:activeProjectId,pole,units,gps:pos||existing?.gps||null,updatedAt:new Date().toISOString()};
  // Unit count changes do not erase inspection histories for retired insulators.
  if(existing)Object.assign(existing,value);else poles.push(value);
  try{persist();}catch(e){if(!silent)alert('บันทึกข้อมูลเสาไม่ได้: '+e.message);return false;}
  refreshExisting();renderPoleList();if(!silent)alert('บันทึกข้อมูลเสา '+pole+' จำนวน '+units+' ลูกสำเร็จ (ในเครื่อง)');return true;
 }
 function afterInspection(r){
  let p=lookup(r.projectId,r.pole);
  if(!p){p={projectId:r.projectId,pole:r.pole,units:Number(r.units)||1};poles.push(p);}
  p.units=Math.max(p.units||1,Number(r.units)||1);
  if(r.gps)p.gps=r.gps;
  p.updatedAt=r.date;try{persist();}catch(e){console.warn('Pole metadata not persisted',e)}renderPoleList();
 }
 function renderPoleList(){
  const root=el('v5PoleList');if(!root)return;root.replaceChildren();
  const ps=projectPoleList(activeProjectId);
  if(!ps.length){root.textContent='โครงการนี้ยังไม่มีเสาที่บันทึกไว้';return;}
  for(const p of ps){
   const rs=getRecords(p.projectId,p.pole);
   const latestByIns=new Map();
   for(const r of rs.sort((a,b)=>new Date(b.date)-new Date(a.date))){const id=r.insulatorId||'legacy';if(!latestByIns.has(id))latestByIns.set(id,r);}
   const worst=rs.length?Math.max(...[...latestByIns.values()].map(r=>Number(r.damage)||0)):null;
   const div=document.createElement('div');div.className='pole-row';
   div.innerHTML='<div><b>'+esc(p.pole)+'</b><small>'+p.units+' ลูก · '+rs.length+' รายการ</small></div><span class="pole-state" style="color:'+statusColor(worst)+'">● '+status(worst)+'</span><button class="btn light">ดูรายละเอียด</button>';
   div.querySelector('button').onclick=()=>openPole(p.projectId,p.pole);root.append(div);
  }
 }
 function mapSummaries(chosen){
  const result=[];const visited=new Set();
  for(const r of records.slice().sort((a,b)=>new Date(b.date)-new Date(a.date))){
   const pid=r.projectId||'legacy',k=key(pid,r.pole);
   if((chosen!=='all'&&chosen!==pid)||visited.has(k))continue;
   visited.add(k);
   const items=getRecords(pid,r.pole),latestByIns=new Map();
   for(const x of items.sort((a,b)=>new Date(b.date)-new Date(a.date))){if(!latestByIns.has(x.insulatorId||'legacy'))latestByIns.set(x.insulatorId||'legacy',x);}
   const valid=items.find(x=>x.gps&&isValidCoordinate(Number(x.gps.lat),Number(x.gps.lng)));
   const savedPole=lookup(pid,r.pole);
   const coordinate=valid?.gps||savedPole?.gps||null;
   const worst=Math.max(...[...latestByIns.values()].map(x=>Number(x.damage)||0));
   result.push({...r,gps:coordinate,damage:worst});
  }
  // Also show poles with coordinates that have not been inspected yet (neutral marker).
  for(const p of poles){if((chosen!=='all'&&chosen!==p.projectId)||visited.has(key(p.projectId,p.pole)))continue;
   if(p.gps)result.push({pole:p.pole,projectId:p.projectId,gps:p.gps,damage:null,inspector:'ยังไม่ตรวจ',dirt:'–',status:'inspected'});
  }
  return result;
 }
 function openPole(pid,pole){
  selected={pid,pole};const p=lookup(pid,pole)||projectPoleList(pid).find(p=>p.pole===pole)||{projectId:pid,pole,units:1};
  const rs=getRecords(pid,pole).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const latestByIns=new Map();for(const r of rs){if(!latestByIns.has(r.insulatorId||'legacy'))latestByIns.set(r.insulatorId||'legacy',r);}
  const worst=rs.length?Math.max(...[...latestByIns.values()].map(x=>Number(x.damage)||0)):null;
  const latestGPS=rs.find(r=>r.gps)?.gps||p.gps;
  const root=el('v5PoleDetail');root.replaceChildren();
  const head=document.createElement('div');head.className='pole-detail-head';
  head.innerHTML='<div><div class="mini-label">'+esc(projectName(pid))+'</div><h2>'+esc(pole)+'</h2><b style="color:'+statusColor(worst)+'">● '+status(worst)+'</b></div><p>ลูกถ้วย '+p.units+' ลูก · ประวัติ '+rs.length+' ครั้ง</p>'+
   '<p>📍 '+(latestGPS?Number(latestGPS.lat).toFixed(6)+', '+Number(latestGPS.lng).toFixed(6):'ไม่มีพิกัด')+'</p>';
  root.append(head);
  const imageRecord=rs.find(x=>x.image);
  if(imageRecord){const photo=document.createElement('img');photo.src=imageRecord.image;photo.alt='ภาพการตรวจสอบล่าสุดของเสา '+pole;photo.className='pole-photo';root.append(photo);}
  const title=document.createElement('h3');title.textContent='ผลตรวจลูกถ้วยแต่ละลูก';root.append(title);
  for(let i=1;i<=p.units;i++){
   const id=idAt(pole,i),r=latestByIns.get(id),div=document.createElement('div');div.className='ins-row';
   div.innerHTML='<div><b>'+esc(id)+'</b><small>'+(r?'ตรวจล่าสุด '+esc(dateText(r.date)):'ยังไม่มีผลตรวจ')+'</small></div><span style="color:'+statusColor(r?.damage)+'">'+status(r?.damage)+'</span><button class="btn light">ตรวจลูกนี้</button>';
   if(r?.image){const thumb=document.createElement('img');thumb.src=r.image;thumb.alt='ภาพ '+id;thumb.className='ins-thumb';div.prepend(thumb);}
   div.querySelector('button').onclick=()=>startInspection(pid,pole,id);root.append(div);
  }
  const historyTitle=document.createElement('h3');historyTitle.textContent='ประวัติการตรวจสอบ';root.append(historyTitle);
  if(!rs.length){const empty=document.createElement('p');empty.textContent='ยังไม่มีรายการตรวจสอบ';root.append(empty);}
  for(const r of rs.slice(0,30)){
   const row=document.createElement('div');row.className='history-line';
   row.textContent=dateText(r.date)+' · '+(r.insulatorId||'ไม่ระบุลูก')+' · ระดับ '+r.damage+'/5 '+(r.demo?'(DEMO)':'(API)')+' · '+r.inspector;
   root.append(row);
  }
  const actions=document.createElement('div');actions.className='mini';
  const inspect=document.createElement('button');inspect.className='btn';inspect.textContent='📷 เพิ่มผลตรวจสอบ';inspect.onclick=()=>startInspection(pid,pole);
  const navigate=document.createElement('button');navigate.className='btn light';navigate.textContent='🧭 นำทาง';navigate.disabled=!latestGPS;
  navigate.onclick=()=>navigateToPole(Number(latestGPS.lat),Number(latestGPS.lng));
  actions.append(inspect,navigate);root.append(actions);go('poleDetail');
 }
 function startInspection(pid,pole,insulatorId){
  chooseProject(pid);el('pole').value=pole;onPoleInput();
  if(insulatorId)el('insulatorSelect').value=insulatorId;
  go('scan');
 }
 // Clear only the unsaved inspection draft; never delete inspection records.
 function resetInspectionDraft(showNotice=false){
  originalImage=null;result=null;
  for(const id of ['cameraInput','galleryInput'])el(id).value='';
  const canvas=el('canvas');
  if(canvas.getContext('2d'))canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  canvas.width=0;canvas.height=0;canvas.style.display='none';
  el('photoStatus').textContent='ยังไม่ได้เลือกภาพ';
  el('result').style.display='none';el('resultDetails').replaceChildren();
  el('saveStatus').replaceChildren();el('saveBtn').disabled=false;
  el('v5SavedActions').style.display='none';
  if(showNotice)el('photoStatus').textContent='ล้างภาพและผลการตรวจที่ยังไม่บันทึกแล้ว';
 }
 function nextInsulator(){
  const select=el('insulatorSelect'),current=select.selectedIndex;
  const next=[...select.options].slice(current+1).find(o=>o.value);
  if(!next){alert('ลูกถ้วยบนเสานี้ครบแล้ว สามารถเลือกตรวจเสาต้นถัดไปได้');return;}
  resetInspectionDraft();select.value=next.value;
  go('scan');
 }
 function nextPole(){
  resetInspectionDraft();
  el('pole').value='';el('units').value='';el('remarks').value='';
  el('workStatus').value='inspected';
  clearGPS();refreshExisting();updateInsulatorOptions();
  go('scan');
  el('pole').focus();
 }
 function projectStats(pid){const list=projectPoleList(pid);const inspected=list.filter(p=>getRecords(pid,p.pole).length>0).length;return {total:list.length,inspected};}
 function cloudPoleItems(){return poles.map(p=>({col:'poles',id:encodeURIComponent(key(p.projectId,p.pole)),data:p}));}
 function importCloudPoles(incoming){
  let n=0;for(const p of incoming){if(!p.projectId||!p.pole||!getNumber(p.units))continue;
   if(!lookup(p.projectId,p.pole)){poles.push(p);n++;}}
  if(n){persist();refreshExisting();renderPoleList();}return n;
 }
 function init(){load();refreshExisting();updateInsulatorOptions();renderPoleList();bindEvents();
  el('insulatorSelect').addEventListener('change',()=>{if(el('v5SavedActions').style.display==='block')resetInspectionDraft();});
 }
 function bindEvents(){
  const oldChoose=chooseProject;chooseProject=function(id){const changed=activeProjectId!==id;oldChoose(id);if(changed){el('pole').value='';el('units').value='';clearGPS();}refreshExisting();updateInsulatorOptions();renderPoleList();};
  const oldGo=go;go=function(id){oldGo(id);if(id==='scan'){refreshExisting();updateInsulatorOptions();}if(id==='projectsPage')renderPoleList();};
  const oldCreate=createProject;createProject=function(){oldCreate();refreshExisting();renderPoleList();};
  const oldDownload=cloudDownload;cloudDownload=async function(){await oldDownload();refreshExisting();renderPoleList();};
 }
 window.V5={init,resetInspectionDraft,nextInsulator,nextPole,afterInspection,mapSummaries,savePole,onPoleInput,chooseExistingPole,updateInsulatorOptions,openPole,renderPoleList,cloudPoleItems,importCloudPoles,projectStats};
})();
