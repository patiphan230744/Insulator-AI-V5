/* Insulator AI V5 — opt-in shared Firestore projects, staff-gated.
 * Run after js/bootstrap.js and js/v5-enhancements.js. No migration is automatic.
 * Firestore security rules MUST be deployed before production use.
 */
(function(){
"use strict";
const byId=id=>document.getElementById(id);
const panel=byId("v5SharedPanel");
if(!panel)return;
document.documentElement.classList.remove("v5-staff-approved");
const state={uid:null,approved:false,approvalOff:null,projectsOff:null,polesOff:null,inspectionsOff:null,
 projects:new Map(),selected:null,poles:[],inspections:[],loadStatus:"",canWrite:false,authGeneration:0};
const out=byId("v5SharedStatus"),list=byId("v5SharedProjects"),details=byId("v5SharedDetails");
const show=(s)=>{state.loadStatus=s;if(out)out.textContent=s;};
const validCoord=(p)=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180;
const esc=s=>String(s??"").trim();
const docId=pole=>encodeURIComponent(esc(pole).toUpperCase());
function stopProject(){
 if(state.polesOff)state.polesOff();if(state.inspectionsOff)state.inspectionsOff();
 state.polesOff=state.inspectionsOff=null;
 state.poles=[];state.inspections=[];state.selected=null;state.canWrite=false;
 if(details)details.replaceChildren();
}
function stopAll(){
 stopProject();
 if(state.projectsOff)state.projectsOff();state.projectsOff=null;
 if(state.approvalOff)state.approvalOff();state.approvalOff=null;
 state.projects.clear();state.approved=false;state.uid=null;
 document.documentElement.classList.remove("v5-staff-approved");
 if(list)list.replaceChildren();
}
function node(tag,text,klass){
 const el=document.createElement(tag);if(text!==undefined)el.textContent=text;
 if(klass)el.className=klass;return el;
}
function button(text,handler,klass="btn light"){
 const b=node("button",text,klass);b.type="button";b.addEventListener("click",handler);return b;
}
function memberRole(project){
 return project?.members?.[state.uid]||null;
}
function mayWrite(project){return state.approved&&["owner","editor"].includes(memberRole(project));}
function selectedProject(){return state.projects.get(state.selected);}
function projectRef(pid){return cloudDb.collection("sharedProjects").doc(pid);}
function requireReady(){
 if(!state.uid||!state.approved||!cloudAuth?.currentUser||cloudAuth.currentUser.uid!==state.uid)throw Error("บัญชีนี้ยังไม่ได้รับอนุญาตให้ใช้โครงการส่วนรวม");
}
function sharedError(e){
 const msg=e?.code==="permission-denied"?"Firestore ปฏิเสธสิทธิ์: ตรวจ staffApprovals, สมาชิกโครงการ และ Firestore Rules":e.message||String(e);
 show("❌ "+msg);
}
function renderProjectOptions(){
 const local=byId("v5ShareLocalProject");if(!local)return;
 const current=local.value;local.replaceChildren();
 local.add(new Option("— เลือกโครงการที่ต้องการแชร์ —",""));
 for(const p of projects.filter(p=>p.id&&!window.isLegacyProjectLike?.(p)))local.add(new Option(p.name+" · "+p.office,p.id));
 if([...local.options].some(x=>x.value===current))local.value=current;
}
function renderSharedProjects(){
 if(!list)return;list.replaceChildren();
 if(!state.approved)return;
 const all=[...state.projects.values()].sort((a,b)=>esc(a.name).localeCompare(esc(b.name),"th"));
 if(!all.length)list.append(node("p","ยังไม่มีโครงการส่วนรวมที่ได้รับสิทธิ์","note"));
 for(const p of all){
  const row=node("div",undefined,"v5-shared-row");
  const left=node("div");left.append(node("strong",p.name),node("small",p.office+" · "+(memberRole(p)==="owner"?"เจ้าของ":memberRole(p)==="editor"?"แก้ไขได้":"ดูข้อมูล")));
  const open=button("เปิดโครงการ",()=>openProject(p.id));
  row.append(left,open);list.append(row);
 }
}
function addSummaryLine(root,label,value){
 root.append(node("p",label+" "+value,"v5-shared-stat"));
}
function inspectionSummary(pole,recs){
 const latest=new Map(),total=Number(pole.units)||1;
 for(const r of recs.slice().sort((a,b)=>esc(b.date).localeCompare(esc(a.date)))){
  if(r.insulatorId&&!latest.has(esc(r.insulatorId).toUpperCase()))latest.set(esc(r.insulatorId).toUpperCase(),r);
 }
 let count=0,worst=null;
 for(let i=1;i<=total;i++){
  const key=esc(pole.pole).toUpperCase()+"-I"+String(i).padStart(2,"0");
  if(latest.has(key)){
   count++;const damage=Number(latest.get(key).damage);
   if(Number.isInteger(damage)&&damage>=0&&damage<=5)worst=Math.max(worst??0,damage);
  }
 }
 const severe=worst>=4?"พบความเสียหาย":worst>=2?"เริ่มเสื่อม":count===total?"ปกติ":count?"ยังตรวจไม่ครบ":"ยังไม่ตรวจ";
 return {count,total,worst,label:severe+(count>0&&count<total&&worst>=2?" · ยังตรวจไม่ครบ":"")};
}
function renderMembers(project,root){
 const team=node("div",undefined,"v5-shared-members");
 team.append(node("h4","สมาชิกโครงการ"));
 const members=Object.entries(project.members||{});
 for(const [uid,role] of members){
  const r=node("div",undefined,"v5-shared-member");
  r.append(node("code",uid),node("span",role==="owner"?"เจ้าของ":role==="editor"?"แก้ไข":"ดูข้อมูล"));
  if(role!=="owner"&&memberRole(project)==="owner")r.append(button("ถอนสิทธิ์",()=>removeMember(uid)));
  team.append(r);
 }
 if(memberRole(project)==="owner"){
  const input=node("input");input.type="text";input.placeholder="UID ของเจ้าหน้าที่";input.id="v5MemberUid";input.maxLength=128;
  const role=node("select");role.id="v5MemberRole";role.add(new Option("แก้ไขข้อมูล","editor"));role.add(new Option("ดูข้อมูลอย่างเดียว","viewer"));
  team.append(input,role,button("เพิ่มสมาชิก",()=>addMember(input.value.trim(),role.value)));
  team.append(node("p","สมาชิกใหม่ต้องได้รับอนุมัติใน staffApprovals ก่อนจึงจะเข้าถึงข้อมูลได้","note"));
 }
 root.append(team);
}
function renderDetails(){
 const root=details,project=selectedProject();if(!root||!project)return;
 root.replaceChildren();
 root.append(node("h3",project.name));
 root.append(node("p","หน่วยงาน: "+project.office+" · สิทธิ์: "+memberRole(project),"note"));
 const actions=node("div",undefined,"v5-shared-actions");
 if(state.canWrite){
  actions.append(button("ส่งข้อมูลในเครื่องของโครงการนี้ขึ้นส่วนรวม",publishLocalData,"btn"));
  actions.append(button("เพิ่มโครงการนี้ในเครื่องเพื่อสำรวจ",enableLocalProject));
 }
 root.append(actions);
 if(!state.canWrite)root.append(node("p","บัญชีนี้ดูข้อมูลได้เท่านั้น ไม่มีสิทธิ์แก้ไข","note"));
 root.append(node("p","ข้อมูลส่วนรวมอัปเดตอัตโนมัติขณะเปิดหน้านี้ · ไม่มีการดาวน์โหลดรูปภาพลงเครื่อง","note"));
 const head=node("div",undefined,"v5-shared-stats");
 addSummaryLine(head,"เสา:",state.poles.length+" ต้น");
 addSummaryLine(head,"ประวัติ:",state.inspections.length+" รายการ");
 root.append(head);
 const poles=node("div");poles.append(node("h4","สรุปเสาไฟฟ้า"));
 const known=new Map(state.poles.map(p=>[esc(p.pole).toUpperCase(),p]));
 for(const record of state.inspections){
  const key=esc(record.pole).toUpperCase();
  if(!known.has(key))known.set(key,{pole:record.pole,units:record.units||1,gps:record.gps||null});
 }
 if(!known.size)poles.append(node("p","ยังไม่มีข้อมูลเสาในส่วนรวม","note"));
 for(const p of [...known.values()].sort((a,b)=>esc(a.pole).localeCompare(esc(b.pole),"th"))){
  const items=state.inspections.filter(r=>esc(r.pole).toUpperCase()===esc(p.pole).toUpperCase());
  const s=inspectionSummary(p,items),row=node("div",undefined,"v5-shared-pole");
  row.append(node("strong","เสา "+p.pole+" — "+s.label));
  row.append(node("small","ลูกถ้วย "+s.total+" ลูก · ตรวจแล้ว "+s.count+"/"+s.total+" · ประวัติ "+items.length+" รายการ"));
  if(validCoord(p.gps))row.append(node("small","GPS "+Number(p.gps.lat).toFixed(6)+", "+Number(p.gps.lng).toFixed(6)));
  const expand=node("details"),summary=node("summary","ดูรายละเอียดและประวัติ");
  expand.append(summary);
  if(!items.length)expand.append(node("p","ยังไม่มีผลตรวจ"));
  for(const r of items.slice().sort((a,b)=>esc(b.date).localeCompare(esc(a.date))).slice(0,50)){
   expand.append(node("p",new Date(r.date).toLocaleString("th-TH")+" · "+(r.insulatorId||"ไม่ระบุลูก")+" · ความเสียหาย "+r.damage+"/5 · "+(r.inspector||"")+(r.demo?" · DEMO":""),"v5-shared-record"));
  }
  row.append(expand);poles.append(row);
 }
 root.append(poles);
 renderMembers(project,root);
}
function openProject(id){
 requireReady();if(!state.projects.has(id))return;
 stopProject();state.selected=id;
 const project=selectedProject();state.canWrite=mayWrite(project);
 show("กำลังติดตามข้อมูลส่วนรวมของโครงการ "+project.name);
 state.polesOff=projectRef(id).collection("poles").onSnapshot(snapshot=>{
  state.poles=snapshot.docs.map(d=>d.data());renderDetails();
 },sharedError);
 state.inspectionsOff=projectRef(id).collection("inspections").orderBy("date","desc").limit(500).onSnapshot(snapshot=>{
  state.inspections=snapshot.docs.map(d=>d.data());renderDetails();
 },sharedError);
 renderDetails();
}
function listenProjects(){
 const uid=state.uid;
 if(state.projectsOff)state.projectsOff();
 state.projectsOff=cloudDb.collection("sharedProjects").where("memberUids","array-contains",uid).onSnapshot(snapshot=>{
  if(state.uid!==uid)return;
  state.projects=new Map(snapshot.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
  if(state.selected&&!state.projects.has(state.selected))stopProject();
  renderSharedProjects();
  if(state.selected){state.canWrite=mayWrite(selectedProject());renderDetails();}
  show("✅ เชื่อมต่อโครงการส่วนรวมแล้ว ("+state.projects.size+" โครงการ)"+(snapshot.metadata.fromCache?" · ข้อมูลจากแคช":""));
 },sharedError);
}
function onAuth(u){
 const generation=++state.authGeneration;stopAll();
 if(!u){show("ลงชื่อเข้าใช้ Firebase เพื่อใช้โครงการส่วนรวม");if(byId("scan")?.classList.contains("active")||byId("mapPage")?.classList.contains("active")||byId("projectsPage")?.classList.contains("active")||byId("history")?.classList.contains("active")||byId("poleDetail")?.classList.contains("active"))window.go("settings");return;}
 state.uid=u.uid;
 byId("v5OwnUid").textContent=u.uid;
 show("ตรวจสิทธิ์เจ้าหน้าที่กับ Firestore...");
 state.approvalOff=cloudDb.collection("staffApprovals").doc(u.uid).onSnapshot(doc=>{
  if(generation!==state.authGeneration)return;
  if(!doc.exists||doc.data().active!==true){
   if(state.approved){state.approved=false;document.documentElement.classList.remove("v5-staff-approved");
    if(state.projectsOff)state.projectsOff();state.projectsOff=null;stopProject();state.projects.clear();renderSharedProjects();}
   show("บัญชีนี้ยังไม่ได้รับอนุมัติเป็นเจ้าหน้าที่ กรุณาติดต่อผู้ดูแล Firebase พร้อม UID ด้านล่าง");
   return;
  }
  if(!state.approved){state.approved=true;document.documentElement.classList.add("v5-staff-approved");listenProjects();}
 },error=>{if(generation===state.authGeneration){state.approved=false;document.documentElement.classList.remove("v5-staff-approved");if(state.projectsOff)state.projectsOff();state.projectsOff=null;stopProject();state.projects.clear();renderSharedProjects();show("ตรวจสิทธิ์ไม่ได้: "+error.message);}});
}
async function shareLocalProject(){
 try{
  requireReady();
  const id=byId("v5ShareLocalProject").value;
  const p=projects.find(p=>p.id===id&&!window.isLegacyProjectLike?.(p));
  if(!p)throw Error("เลือกโครงการในเครื่องก่อน");
  if(state.projects.has(id))throw Error("โครงการนี้แชร์อยู่แล้ว");
  if(!confirm("สร้างโครงการส่วนรวม “"+p.name+"” ? ขั้นนี้แชร์เฉพาะชื่อและรายละเอียดโครงการ ยังไม่อัปโหลดประวัติหรือพิกัด"))return;
  const members={[state.uid]:"owner"};
  await projectRef(id).set({id,ownerUid:state.uid,memberUids:[state.uid],members,
   name:esc(p.name),office:esc(p.office),prefix:esc(p.prefix)||"P-",description:esc(p.description),
   createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  show("✅ สร้างโครงการส่วนรวมแล้ว — เลือกเปิดโครงการ จากนั้นกดส่งข้อมูลในเครื่องเมื่อพร้อม");
 }catch(e){sharedError(e);}
}
async function addMember(uid,role){
 try{
  requireReady();const p=selectedProject();
  if(memberRole(p)!=="owner")throw Error("เฉพาะเจ้าของโครงการที่เชิญสมาชิกได้");
  if(!/^[\w-]{10,128}$/.test(uid)||!["editor","viewer"].includes(role))throw Error("กรุณากรอก UID ของเจ้าหน้าที่ให้ถูกต้อง");
  if(uid===p.ownerUid)throw Error("ไม่สามารถเปลี่ยนเจ้าของ");
  const members={...p.members,[uid]:role};
  await projectRef(p.id).update({members,memberUids:Object.keys(members),updatedAt:new Date().toISOString()});
  show("✅ บันทึกสิทธิ์สมาชิกแล้ว");
 }catch(e){sharedError(e);}
}
async function removeMember(uid){
 try{
  requireReady();const p=selectedProject();
  if(memberRole(p)!=="owner"||uid===p.ownerUid)throw Error("ไม่มีสิทธิ์ถอนสมาชิกนี้");
  if(!confirm("ถอนสิทธิ์สมาชิก "+uid+" จากโครงการนี้?"))return;
  const members={...p.members};delete members[uid];
  await projectRef(p.id).update({members,memberUids:Object.keys(members),updatedAt:new Date().toISOString()});
  show("✅ ถอนสิทธิ์แล้ว");
 }catch(e){sharedError(e);}
}
function localPoleData(pid){
 try{
  const arr=JSON.parse(localStorage.getItem("INSULATOR_V5_POLES_V1")||"[]");
  return Array.isArray(arr)?arr.filter(p=>p.projectId===pid):[];
 }catch(e){return [];}
}
async function pushPole(p,pid){
 const project=state.projects.get(pid);
 if(!mayWrite(project))throw Error("บัญชีนี้ไม่มีสิทธิ์แก้ไขโครงการส่วนรวม");
 const pole=esc(p.pole),n=Number(p.units);
 if(!pole||!Number.isInteger(n)||n<1||n>500)throw Error("ข้อมูลเสาไม่ถูกต้อง");
 const gps=validCoord(p.gps)?{lat:Number(p.gps.lat),lng:Number(p.gps.lng),source:esc(p.gps.source)||"manual"}:null;
 await projectRef(pid).collection("poles").doc(docId(pole)).set({
  projectId:pid,pole,units:n,gps,updatedByUid:state.uid,updatedAt:new Date().toISOString()
 },{merge:true});
}
async function pushInspection(r,pid){
 const project=state.projects.get(pid);
 if(!mayWrite(project))throw Error("บัญชีนี้ไม่มีสิทธิ์แก้ไขโครงการส่วนรวม");
 if(!r.id||!r.pole||r.projectId!==pid||!r.date)throw Error("ข้อมูลการตรวจไม่ครบ");
 const ref=projectRef(pid).collection("inspections").doc(String(r.id));
 const existing=await ref.get({source:"server"});
 if(existing.exists)return false;
 const {image,...fields}=r;
 await ref.set({...fields,authorUid:state.uid,imageInCloud:false,cloudUpdatedAt:new Date().toISOString()});
 return true;
}
async function publishLocalData(){
 const project=selectedProject();if(!project)return;
 const rs=records.filter(r=>r.projectId===project.id),ps=localPoleData(project.id);
 if(!confirm("ส่งข้อมูลเสา "+ps.length+" ต้น และประวัติ "+rs.length+" รายการของโครงการนี้ไปยังส่วนรวม? รูปภาพจะไม่ถูกส่ง"))return;
 let doneP=0,doneR=0;
 try{
  requireReady();if(!mayWrite(project))throw Error("ไม่มีสิทธิ์แก้ไข");
  show("กำลังส่งข้อมูลโครงการส่วนรวม...");
  for(const p of ps){await pushPole(p,project.id);doneP++;}
  for(const r of rs){if(await pushInspection(r,project.id))doneR++;}
  show("✅ อัปโหลดสำเร็จ: เสา "+doneP+" ต้น · ประวัติใหม่ "+doneR+" รายการ (ไม่รวมรูปภาพ)");
 }catch(e){show("อัปโหลดบางส่วน: เสา "+doneP+" ต้น / ประวัติ "+doneR+" รายการ · "+e.message);}
}
function enableLocalProject(){
 const p=selectedProject();if(!p)return;
 if(projects.some(x=>x.id===p.id)){chooseProject(p.id);show("เลือกโครงการในเครื่องแล้ว ไปหน้าตรวจสอบเพื่อเพิ่มข้อมูลได้");return;}
 if(!confirm("เพิ่มชื่อโครงการลงในเครื่องนี้เพื่อใช้หน้าตรวจสอบ? ข้อมูลใหม่จะเก็บในเครื่องด้วย เหมาะกับอุปกรณ์ส่วนตัวของเจ้าหน้าที่เท่านั้น"))return;
 try{
  const local={id:p.id,name:p.name,office:p.office,prefix:p.prefix||"P-",description:p.description||"",createdAt:p.createdAt||new Date().toISOString()};
  projects.push(local);activeProjectId=p.id;storeProjects();syncSelectors();renderProjects();renderSharedProjects();refreshDashboard();
  window.V5?.renderPoleList();show("✅ เพิ่มโครงการในเครื่องแล้ว สามารถตรวจลูกถ้วยและซิงก์ขึ้นโครงการส่วนรวมได้");
 }catch(e){sharedError(e);}
}
const previousSaveResult=window.saveResult;
window.saveResult=async function(){
 const known=new Set(records.map(r=>r.id));await previousSaveResult();
 const r=records.find(x=>!known.has(x.id));
 if(!r||!state.approved||!mayWrite(state.projects.get(r.projectId)))return;
 try{
  await pushInspection(r,r.projectId);
  const p=localPoleData(r.projectId).find(p=>esc(p.pole).toUpperCase()===esc(r.pole).toUpperCase());
  if(p)await pushPole(p,r.projectId);
  show("✅ บันทึกในเครื่องและส่งผลตรวจขึ้นโครงการส่วนรวมแล้ว");
 }catch(e){show("⚠️ บันทึกในเครื่องสำเร็จ แต่ส่งส่วนรวมไม่สำเร็จ: "+e.message+" · ใช้ปุ่มส่งข้อมูลในเครื่องเพื่อส่งใหม่");}
};
const priorSavePole=window.V5?.savePole;
if(priorSavePole){
 window.V5.savePole=function(silent=false){
  const ok=priorSavePole(silent),pid=activeProjectId;
  if(ok&&state.approved&&mayWrite(state.projects.get(pid))){
   const p=localPoleData(pid).find(p=>esc(p.pole).toUpperCase()===esc(byId("pole").value).toUpperCase());
   if(p)pushPole(p,pid).then(()=>show("✅ ซิงก์ข้อมูลเสาขึ้นส่วนรวมแล้ว")).catch(e=>show("⚠️ บันทึกเสาในเครื่องแล้ว แต่ซิงก์ไม่สำเร็จ: "+e.message));
  }
  return ok;
 };
}
byId("v5ShareCreate").addEventListener("click",shareLocalProject);
const oldGo=window.go;
window.go=function(id){
 if(!state.approved && !["home","settings"].includes(id)){
  show("ต้องลงชื่อเข้าใช้และได้รับอนุมัติเป็นเจ้าหน้าที่ก่อนเข้าถึงข้อมูลสำรวจ");
  oldGo("settings");return;
 }
 oldGo(id);
 if(id==="settings")renderProjectOptions();
};
renderProjectOptions();
if(cloudAuth)cloudAuth.onAuthStateChanged(onAuth);
else show("Firebase ยังไม่พร้อม กรุณาตรวจสอบการเชื่อมต่อ");
window.InsulatorSharedV5={state,shareLocalProject,openProject,publishLocalData};
})();