const PROJECTS_KEY='INSULATOR_SURVEY_PROJECTS_V1',ACTIVE_KEY='INSULATOR_SURVEY_ACTIVE_V1';
let projects=[],activeProjectId='';
function readProjects(){
 try{const v=JSON.parse(localStorage.getItem(PROJECTS_KEY)||'[]');projects=Array.isArray(v)?v:[]}catch(e){projects=[]}
 // Keep existing legacy inspections intact, but do not create a synthetic project.
 projects=projects.filter(p=>p&&p.id!=='legacy');
 try{activeProjectId=localStorage.getItem(ACTIVE_KEY)||''}catch(e){}
 if(!projects.some(p=>p.id===activeProjectId))activeProjectId=projects[0]?.id||'';
 try{storeProjects()}catch(e){console.warn('Unable to persist projects',e)}
}
function storeProjects(){localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));localStorage.setItem(ACTIVE_KEY,activeProjectId)}
function projectName(id){return id==='legacy'||!id?'ไม่ระบุโครงการ':(projects.find(p=>p.id===id)||{}).name||'ไม่พบโครงการ'}
function statusName(status){return ({inspected:'ตรวจแล้ว / รอยืนยัน',followup:'ต้องตรวจซ้ำ',completed:'ยืนยันผลแล้ว'})[status]||'ตรวจแล้ว / รอยืนยัน'}
function createProject(){
 const name=$('pName').value.trim(),office=$('pOffice').value.trim(),prefix=$('pPrefix').value.trim()||'P-';
 if(!name||!office){alert('กรุณาใส่ชื่อโครงการและหน่วยงาน');return}
 if(projects.some(p=>p.name===name&&p.office===office)){alert('มีโครงการนี้อยู่แล้ว');return}
 const oldActive=activeProjectId;
 const p={id:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,8),name,office,prefix,description:$('pDesc').value.trim(),createdAt:new Date().toISOString()};
 projects.push(p);activeProjectId=p.id;
 try{storeProjects()}catch(e){projects.pop();activeProjectId=oldActive;alert('บันทึกโครงการไม่ได้: '+e.message);return}
 $('pName').value='';$('pDesc').value='';
 syncSelectors();renderProjects();refreshDashboard();alert('สร้างโครงการและเลือกใช้งานสำเร็จ');
}
function chooseProject(id){
 if(id==='legacy'||!projects.some(p=>p.id===id))return;
 const old=activeProjectId;activeProjectId=id;
 try{storeProjects()}catch(e){activeProjectId=old;alert('เปลี่ยนโครงการไม่ได้');return}
 syncSelectors();renderProjects();refreshDashboard();
}
function removeProject(id){
 if(id==='legacy'){alert('ไม่สามารถลบโครงการข้อมูลเดิม');return}
 if(records.some(r=>r.projectId===id)){alert('โครงการมีประวัติการตรวจอยู่ ไม่อนุญาตให้ลบเพื่อป้องกันข้อมูลสูญหาย');return}
 if(!confirm('ต้องการลบโครงการนี้หรือไม่?'))return;
 const before=projects.slice(),old=activeProjectId;
 projects=projects.filter(p=>p.id!==id);if(activeProjectId===id)activeProjectId=projects[0]?.id||'';
 try{storeProjects()}catch(e){projects=before;activeProjectId=old;alert('ลบไม่สำเร็จ');return}
 syncSelectors();renderProjects();refreshDashboard();
}
function renderProjects(){
 const root=$('projectList');root.replaceChildren();
 for(const p of projects){
  const count=new Set(records.filter(r=>(r.projectId||'legacy')===p.id).map(r=>String(r.pole).toLowerCase())).size;
  const div=document.createElement('div');div.className='project'+(p.id===activeProjectId?' selected':'');
  const stats=window.V5?.projectStats(p.id)||{total:count,inspected:count};
  const progress=stats.total?Math.round(stats.inspected/stats.total*100):0;
  div.innerHTML='<b>'+escapeHTML(p.name)+'</b> '+(p.id===activeProjectId?'<span class="chip">ใช้งานอยู่</span>':'')+'<p class="note">'+escapeHTML(p.office)+' · '+stats.total+' เสา · '+escapeHTML(p.prefix||'P-')+'</p><div class="project-progress"><div style="width:'+progress+'%"></div></div><p class="note">ตรวจแล้ว '+stats.inspected+'/'+stats.total+' เสา ('+progress+'%)</p><p class="note">'+escapeHTML(p.description||'')+'</p><button class="select">เลือกใช้งาน</button><button class="remove">ลบโครงการ</button>';
  div.querySelector('.select').onclick=()=>chooseProject(p.id);
  div.querySelector('.remove').onclick=()=>removeProject(p.id);
  root.append(div);
 }
}
function syncSelectors(){
 for(const id of ['scanProject','mapProject','historyProject']){
  const select=$(id),current=select.value;select.replaceChildren();
  if(id!=='scanProject')select.add(new Option('ทุกโครงการ','all'));
  else if(!projects.length)select.add(new Option('กรุณาสร้างโครงการสำรวจก่อน',''));
  for(const p of projects)select.add(new Option(p.office+' — '+p.name,p.id));
  select.value=id==='scanProject'?activeProjectId:([...select.options].some(o=>o.value===current)?current:'all');
 }
}
function refreshDashboard(){
 const p=projects.find(p=>p.id===activeProjectId);
 $('activeProjectLabel').textContent=p?p.name+' · '+p.office:'ไม่พบโครงการ';
 const list=records.filter(r=>(r.projectId||'legacy')===activeProjectId);
 $('poleTotal').textContent=new Set(list.map(r=>String(r.pole).toLowerCase())).size;
 $('inspectionTotal').textContent=list.length;
 $('criticalTotal').textContent=list.filter(r=>Number(r.damage)>=4).length;
}
function filteredRecords(){
 const q=$('search').value.trim().toLowerCase(),p=$('historyProject').value,status=$('historyStatus').value;
 const insulator=$('historyInsulator')?.value||'all';
 const includeLegacy=$('includeLegacyHistory')?.checked===true;
 // A pair of coordinates searches a ~15 m radius. Single values can match either coordinate.
 const pair=q.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
 const pairLat=pair?Number(pair[1]):null,pairLng=pair?Number(pair[2]):null;
 const validPair=!!pair && isValidCoordinate(pairLat,pairLng);
 return records.filter(r=>{
  if(!includeLegacy&&(!r.projectId||r.projectId==='legacy'))return false;
  if((p!=='all'&&(r.projectId||'legacy')!==p)||(status!=='all'&&(r.status||'inspected')!==status))return false;
  if(insulator!=='all'&&(insulator==='__unassigned__'?!!r.insulatorId:String(r.insulatorId||'')!==insulator))return false;
  if(!q)return true;
  const lat=Number(r.gps?.lat),lng=Number(r.gps?.lng);
  const hasGPS=r.gps!=null && isValidCoordinate(lat,lng);
  if(validPair){
   if(!hasGPS)return false;
   const toRad=x=>x*Math.PI/180;
   const dLat=toRad(lat-pairLat),dLng=toRad(lng-pairLng);
   const a=Math.sin(dLat/2)**2+Math.cos(toRad(pairLat))*Math.cos(toRad(lat))*Math.sin(dLng/2)**2;
   return 6371000*2*Math.asin(Math.min(1,Math.sqrt(a)))<=15;
  }
  return String(r.pole||'').toLowerCase().includes(q)||String(r.insulatorId||'').toLowerCase().includes(q)||String(r.inspector||'').toLowerCase().includes(q)||
   (hasGPS&&(String(r.gps.lat).includes(q)||String(r.gps.lng).includes(q)||lat.toFixed(6).includes(q)||lng.toFixed(6).includes(q)));
 });
}
function downloadText(text,filename,type){
 const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function exportProjects(){downloadText(JSON.stringify(projects,null,2),'InsulatorAI_Projects.json','application/json')}
function exportCSV(){
 const list=filteredRecords();if(!list.length){alert('ไม่มีข้อมูลตามตัวกรอง');return}
 const rows=[['โครงการ','การไฟฟ้า','รหัสเสา','รหัสลูกถ้วยที่ตรวจ','ผู้ตรวจ','วันที่','สถานะ','จำนวนลูกถ้วย','ความเสียหาย','ความสกปรก','พื้นที่เสียหาย %','Latitude','Longitude','หมายเหตุ']];
 for(const r of list){const p=projects.find(p=>p.id===(r.projectId||'legacy'));
 rows.push([p?.name||'',p?.office||'',r.pole,r.insulatorId||'ไม่ระบุ (ข้อมูลเดิม)',r.inspector,r.date,statusName(r.status),r.units??'',r.damage,r.dirt,r.percent,r.gps?.lat??'',r.gps?.lng??'',r.remarks||''])}
 const csvCell=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 downloadText('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'InsulatorAI_Survey.csv','text/csv;charset=utf-8');
}


