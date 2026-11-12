"use strict";

const DBNAME="InsulatorAIDatabaseV3";
const STORE="inspections";
const FALLBACK="INSULATOR_AI_V3_FALLBACK";

let db=null;
let storageMode="none";
let records=[];
let originalImage=null;
let result=null;
let gps=null;
let map=null;
let markers=[];
let myLocationMarker=null, myAccuracyCircle=null, mapLocationRequest=0;
let demoStep=0;
let gpsRequest=0;

const $=id=>document.getElementById(id);

function escapeHTML(value){
 return String(value??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",
  '"':"&quot;","'":"&#39;"
 })[c]);
}

function message(id,text,kind="info"){
 $(id).className="msg "+kind;
 $(id).textContent=text;
}

function getFallback(){
 try{
  const data=JSON.parse(localStorage.getItem(FALLBACK)||"[]");
  return Array.isArray(data)?data:[];
 }catch(e){
  return [];
 }
}

function openDatabase(){
 return new Promise((resolve,reject)=>{
  if(!window.indexedDB){
   reject(new Error("ไม่มี IndexedDB"));
   return;
  }
  const request=indexedDB.open(DBNAME,1);

  request.onupgradeneeded=()=>{
   const database=request.result;
   if(!database.objectStoreNames.contains(STORE)){
    database.createObjectStore(STORE,{keyPath:"id"});
   }
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error("ฐานข้อมูลถูกล็อก"));
 });
}

function idbGetAll(){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readonly");
  const req=tx.objectStore(STORE).getAll();
  req.onsuccess=()=>resolve(req.result||[]);
  req.onerror=()=>reject(req.error);
 });
}

function idbPut(record){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).put(record);
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error);
 });
}

function idbDelete(id){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).delete(id);
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error);
 });
}

function idbClear(){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).clear();
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error);
 });
}

async function initStorage(){
 try{
  db=await openDatabase();
  records=await idbGetAll();
  storageMode="indexeddb";
 }catch(error){
  db=null;
  try{
   const test="__insulator_storage_test";
   localStorage.setItem(test,"ok");
   localStorage.removeItem(test);
   storageMode="localstorage";
   records=getFallback();
  }catch(e){
   storageMode="none";
   records=[];
  }
 }
 records.sort((a,b)=>new Date(b.date)-new Date(a.date));
 updateCount();
}

async function writeRecord(record){
 if(storageMode==="indexeddb"){
  await idbPut(record);
  const check=await idbGetAll();
  if(!check.some(r=>r.id===record.id)){
   throw new Error("ไม่พบรายการหลังบันทึก");
  }
  records=check;
 }else if(storageMode==="localstorage"){
  const next=[record,...records];
  localStorage.setItem(FALLBACK,JSON.stringify(next));
  const check=getFallback();
  if(!check.some(r=>r.id===record.id)){
   throw new Error("ไม่พบรายการหลังบันทึก");
  }
  records=check;
 }else{
  throw new Error("HTML Editor ไม่อนุญาตให้จัดเก็บข้อมูล");
 }
 records.sort((a,b)=>new Date(b.date)-new Date(a.date));
 updateCount();
}

function updateCount(){
 $("count").textContent=records.length;
 const names={
  indexeddb:"IndexedDB — จัดเก็บภาพและประวัติ",
  localstorage:"localStorage — พื้นที่จำกัด",
  none:"ไม่สามารถจัดเก็บข้อมูลในเว็บนี้ได้"
 };
 const name=names[storageMode];
 $("storageName").textContent=name;
 $("dbStatus").textContent=name;
}

function go(id){
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
 $(id).classList.add("active");
 document.querySelectorAll("nav button").forEach(b=>{
  b.classList.toggle("active",b.dataset.page===id);
 });
 window.scrollTo(0,0);
 if(id==="history")showHistory();
 if(id==="home")refreshDashboard();
 if(id==="projectsPage")renderProjects();
 if(id==="mapPage")setTimeout(()=>{loadMap();locateMeOnMap(true);},200);
 updateCount();
}

function loadPhoto(file){
 if(!file)return;
 if(!file.type.startsWith("image/")){
  alert("กรุณาเลือกรูปภาพ");
  return;
 }
 const reader=new FileReader();
 reader.onerror=()=>alert("อ่านรูปภาพไม่สำเร็จ");
 reader.onload=()=>{
  const img=new Image();
  img.onerror=()=>alert("เปิดรูปภาพไม่สำเร็จ");
  img.onload=()=>{
   const canvas=$("canvas");
   const scale=Math.min(1,720/Math.max(img.width,img.height));
   canvas.width=Math.round(img.width*scale);
   canvas.height=Math.round(img.height*scale);
   canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
   originalImage=canvas.toDataURL("image/jpeg",0.65);
   canvas.style.display="block";
   $("photoStatus").textContent="เลือกภาพแล้ว: "+file.name;
   result=null;
   $("result").style.display="none";
  };
  img.src=reader.result;
 };
 reader.readAsDataURL(file);
}

$("cameraInput").onchange=e=>loadPhoto(e.target.files[0]);
$("galleryInput").onchange=e=>loadPhoto(e.target.files[0]);

function isValidCoordinate(lat,lng){
 return Number.isFinite(lat)&&Number.isFinite(lng)&&
  lat>=-90&&lat<=90&&lng>=-180&&lng<=180;
}

function setCoordinates(lat,lng,source,accuracy=null){
 gps={lat,lng,source,accuracy};
 $("lat").value=lat.toFixed(7);
 $("lng").value=lng.toFixed(7);
 message(
  "gpsStatus",
  "✅ บันทึกพิกัดสำเร็จ ("+(source==="device"?"GPS อุปกรณ์":"กรอกด้วยตนเอง")+")\n"+
  "ละติจูด: "+lat.toFixed(7)+"\n"+
  "ลองจิจูด: "+lng.toFixed(7)+
  (accuracy!==null?"\nความแม่นยำที่ระบบแจ้ง: "+Math.round(accuracy)+" เมตร":""),
  "good"
 );
}

function getLocation(highAccuracy){
 gpsRequest++;
 const requestNumber=gpsRequest;
 gps=null;

 if(!navigator.geolocation){
  message("gpsStatus","อุปกรณ์หรือ HTML Editor ไม่รองรับการหาตำแหน่ง","bad");
  return;
 }
 if(!window.isSecureContext){
  message("gpsStatus","เว็บนี้ไม่ได้เปิดใน Secure Context จึงอาจใช้ GPS ไม่ได้ กรุณาใช้เว็บ HTTPS หรือกรอกพิกัดเอง","warn");
  return;
 }

 message("gpsStatus","⏳ กำลังค้นหาพิกัด โปรดอนุญาตการเข้าถึงตำแหน่ง...");

 navigator.geolocation.getCurrentPosition(
  p=>{
   if(requestNumber!==gpsRequest)return;
   setCoordinates(
    p.coords.latitude,
    p.coords.longitude,
    "device",
    p.coords.accuracy
   );
  },
  error=>{
   if(requestNumber!==gpsRequest)return;
   let text="ไม่สามารถดึง GPS ได้: "+error.message;
   if(error.code===1)text+="\nตรวจสอบการอนุญาตตำแหน่ง";
   if(error.code===3)text+="\nลองปุ่ม GPS แบบประหยัดพลังงาน หรือกรอกพิกัดเอง";
   message("gpsStatus",text,"warn");
  },
  {
   enableHighAccuracy:highAccuracy,
   timeout:45000,
   maximumAge:highAccuracy?0:60000
  }
 );
}

function getGPS(){getLocation(true)}
function retryGPS(){getLocation(false)}

function useManualGPS(){
 const latText=$("lat").value.trim();
 const lngText=$("lng").value.trim();
 if(!latText||!lngText){
  alert("กรุณากรอกทั้งละติจูดและลองจิจูด");
  return;
 }
 const lat=Number(latText);
 const lng=Number(lngText);
 if(!isValidCoordinate(lat,lng)){
  alert("พิกัดไม่ถูกต้อง");
  return;
 }
 gpsRequest++;
 setCoordinates(lat,lng,"manual");
}

function clearGPS(){
 gpsRequest++;
 gps=null;
 $("lat").value="";
 $("lng").value="";
 message("gpsStatus","ยังไม่ได้บันทึกพิกัด");
}

const demoCases=[
 {damage:0,dirt:0,percent:0,crack:false},
 {damage:1,dirt:1,percent:5.4,crack:true},
 {damage:2,dirt:2,percent:18.7,crack:true},
 {damage:3,dirt:1,percent:39.2,crack:true},
 {damage:4,dirt:3,percent:65.8,crack:true},
 {damage:5,dirt:3,percent:84.1,crack:true}
];

function analyze(){
 if(!originalImage){
  alert("กรุณาถ่ายภาพหรือเลือกภาพก่อน");
  return;
 }
 demoStep++;
 const d=demoCases[(demoStep-1)%demoCases.length];
 result={...d,demo:true};

 const img=new Image();
 img.onload=()=>{
  const canvas=$("canvas");
  const ctx=canvas.getContext("2d");
  const w=canvas.width,h=canvas.height;

  ctx.clearRect(0,0,w,h);
  ctx.drawImage(img,0,0,w,h);
  ctx.lineWidth=Math.max(2,w/180);
  ctx.font="bold "+Math.max(13,Math.round(w/32))+"px Arial";

  function box(x,y,bw,bh,color,text){
   ctx.strokeStyle=color;
   ctx.strokeRect(x*w,y*h,bw*w,bh*h);
   const labelWidth=ctx.measureText(text).width+10;
   const top=Math.max(0,y*h-24);
   ctx.fillStyle=color;
   ctx.fillRect(x*w,top,labelWidth,24);
   ctx.fillStyle="#ffffff";
   ctx.fillText(text,x*w+5,top+18);
  }

  box(.18,.15,.64,.68,"#16a34a","insulator DEMO");
  if(d.crack)box(.45,.39,.19,.15,"#ef4444","crack DEMO");
  if(d.dirt>0)box(.29,.59,.23,.14,"#eab308","dirt DEMO");

  ctx.fillStyle="rgba(0,0,0,.75)";
  ctx.fillRect(0,h-27,w,27);
  ctx.fillStyle="white";
  ctx.font="bold 13px Arial";
  ctx.fillText("SIMULATED AI - NOT REAL DETECTION",6,h-9);

  $("resultDetails").innerHTML=`
   <p><b>ผลวิเคราะห์ YOLOv8 (จำลอง)</b></p>
   <p>ลูกถ้วย: insulator DEMO</p>
   <p>รอยแตก: ${d.crack?"พบ (จำลอง)":"ไม่พบ (จำลอง)"}</p>
   <p>ความเสียหาย: ${d.damage}/5</p>
   <p>ความสกปรก: ${d.dirt}/3</p>
   <p>พื้นที่เสียหาย: ${d.percent}% (จำลอง)</p>
  `;
  $("result").style.display="block";
  $("saveStatus").innerHTML="";
 };
 img.src=originalImage;
}

async function saveResult(){
 if(!result||!originalImage){
  alert("กรุณาวิเคราะห์ภาพก่อน");
  return;
 }

 if(!activeProjectId){alert("กรุณาเลือกโครงการ");return;}
 const pole=$("pole").value.trim();
 const inspector=$("inspector").value.trim();

 if(!pole||!inspector){
  alert("กรุณากรอกรหัสเสาและชื่อผู้ตรวจสอบ");
  return;
 }

 if($("lat").value.trim()||$("lng").value.trim()){
  const lat=Number($("lat").value);
  const lng=Number($("lng").value);
  if(
   !$("lat").value.trim()||
   !$("lng").value.trim()||
   !isValidCoordinate(lat,lng)
  ){
   alert("กรุณาตรวจสอบพิกัดทั้งสองช่อง");
   return;
  }
  if(!gps || gps.lat!==lat || gps.lng!==lng){
   gpsRequest++;
   gps={lat,lng,source:"manual",accuracy:null};
  }
 }

 if(!$("insulatorSelect").value){alert("กรุณาเลือกลูกถ้วยที่จะตรวจสอบก่อนบันทึก");return;}
 if(!gps){
  if(!confirm("ยังไม่มีพิกัด ต้องการบันทึกผลโดยไม่มี GPS หรือไม่?"))return;
 }

 const button=$("saveBtn");
 button.disabled=true;
 message("saveStatus","กำลังบันทึกและตรวจสอบข้อมูล...");

 const canvas=$("canvas");
 const record={
  id:String(Date.now())+"-"+Math.random().toString(36).slice(2,9),
  pole,inspector,
  insulatorId:$("insulatorSelect").value,
  date:new Date().toISOString(),
  damage:result.damage,
  dirt:result.dirt,
  percent:result.percent,
  image:canvas.toDataURL("image/jpeg",0.45),
  gps:gps?{...gps}:null,
  demo:result.demo===true, modelVersion:result.modelVersion||"DEMO", projectId:activeProjectId,status:$('workStatus').value,
  units:$('units').value===''?null:Number($('units').value),
  remarks:$('remarks').value.trim()
 };

 try{
  await writeRecord(record);
  window.V5.afterInspection(record);
  message("saveStatus","✅ บันทึกและตรวจสอบข้อมูลสำเร็จ","good");
  alert("✅ บันทึกสำเร็จแล้ว เปิดหน้าประวัติเพื่อดูข้อมูล");
  go("history");
 }catch(error){
  message(
   "saveStatus",
   "❌ บันทึกไม่สำเร็จ: "+error.message+
   "\nHTML Editor อาจจำกัดพื้นที่จัดเก็บภาพหรือไม่อนุญาตให้บันทึก",
   "bad"
  );
 }finally{
  button.disabled=false;
 }
}

function dateText(value){
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"ไม่ทราบวันที่":date.toLocaleString("th-TH");
}

function showHistory(){
 const root=$("historyList");
 const insSelect=$("historyInsulator");
 // Rebuild the available insulators using the current project/status filters.
 // Keep the existing selection when possible; never infer missing legacy IDs.
 if(insSelect){
  const current=insSelect.value;
  const project=$("historyProject").value,status=$("historyStatus").value;
  const eligible=records.filter(r=>(project==='all'||(r.projectId||'legacy')===project)&&
    (status==='all'||(r.status||'inspected')===status));
  const ids=[...new Set(eligible.map(r=>r.insulatorId).filter(Boolean))].sort((a,b)=>
    String(a).localeCompare(String(b),'th',{numeric:true}));
  const hasUnassigned=eligible.some(r=>!r.insulatorId);
  insSelect.replaceChildren(new Option('ลูกถ้วยทุกลูก','all'));
  for(const id of ids)insSelect.add(new Option(id,id));
  if(hasUnassigned)insSelect.add(new Option('ไม่ระบุลูกถ้วย (ข้อมูลเดิม)','__unassigned__'));
  insSelect.value=[...insSelect.options].some(o=>o.value===current)?current:'all';
 }
 root.innerHTML="";

 const list=filteredRecords();
 $('historySummary').textContent='พบ '+list.length+' รายการ';

 if(!list.length){
  root.textContent="ยังไม่มีประวัติ";
  return;
 }

 list.forEach(r=>{
  const div=document.createElement("div");
  div.className="record";

  div.innerHTML=`
   <h3>${escapeHTML(r.pole)} · ${r.insulatorId?'ลูกถ้วย '+escapeHTML(r.insulatorId):'ไม่ระบุลูกถ้วย (ข้อมูลเดิม)'}</h3>
   <p>${escapeHTML(dateText(r.date))}</p>
   <img alt="ภาพที่ตรวจสอบ">
   <p>โครงการ: ${escapeHTML(projectName(r.projectId))}</p>
   <p>สถานะ: ${escapeHTML(statusName(r.status))}</p>
   <p>ลูกถ้วยที่ตรวจสอบ: <strong>${r.insulatorId?escapeHTML(r.insulatorId):'ไม่ระบุ (ข้อมูลเดิม)'}</strong></p>
   <p>จำนวนลูกถ้วยทั้งหมดบนเสา: ${r.units==null?'ไม่ระบุ':Number(r.units)}</p>
   <p>หมายเหตุ: ${escapeHTML(r.remarks||'-')}</p>
   <p>ผู้ตรวจสอบ: ${escapeHTML(r.inspector)}</p>
   <p>ความเสียหาย: ${r.damage==null?"ยังไม่ตรวจ":r.damage+"/5"} ${r.demo?"(DEMO)":""}</p>
   <p>ความสกปรก: ${r.dirt}/3 ${r.demo?"(DEMO)":"(API)"}</p>
   <p>พื้นที่เสียหาย: ${r.percent}% ${r.demo?"(DEMO)":"(API)"}</p>
   <p>พิกัด: ${r.gps?
    Number(r.gps.lat).toFixed(6)+", "+Number(r.gps.lng).toFixed(6):
    "ไม่ได้บันทึก"}</p>
   <span class="status">AI DEMO</span>
   <button class="btn light deleteButton">ลบรายการนี้</button>
  `;

  if(r.image){div.querySelector("img").src=r.image;}else{div.querySelector("img").style.display='none';}
  div.querySelector(".deleteButton").onclick=()=>deleteRecord(r.id);
  root.appendChild(div);
 });
}

async function deleteRecord(id){
 if(!confirm("ต้องการลบรายการนี้ใช่หรือไม่?"))return;

 try{
  if(storageMode==="indexeddb"){
   await idbDelete(id);
   records=await idbGetAll();
  }else if(storageMode==="localstorage"){
   const next=records.filter(r=>r.id!==id);
   localStorage.setItem(FALLBACK,JSON.stringify(next));
   records=getFallback();
  }else{
   throw new Error("ไม่มีพื้นที่จัดเก็บ");
  }
  updateCount();
  showHistory();
 }catch(e){
  alert("ลบไม่สำเร็จ: "+e.message);
 }
}

// Locate on map using the device's geolocation; this does not upload or save location.
function locateMeOnMap(center=true){
 const status=$("myMapLocationStatus");
 if(typeof L==="undefined"){
  status.textContent="แผนที่ยังไม่พร้อมใช้งาน";return;
 }
 if(!map)loadMap();
 if(!navigator.geolocation){
  status.textContent="อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับตำแหน่งปัจจุบัน";return;
 }
 if(!window.isSecureContext){
  status.textContent="ต้องเปิดแอปผ่าน HTTPS หรือ localhost เพื่อใช้งานตำแหน่งปัจจุบัน";return;
 }
 const request=++mapLocationRequest;
 status.textContent="กำลังค้นหาตำแหน่งปัจจุบัน... กรุณาอนุญาตการเข้าถึงตำแหน่ง";
 navigator.geolocation.getCurrentPosition(position=>{
  if(request!==mapLocationRequest || !map)return;
  const {latitude:lat,longitude:lng,accuracy}=position.coords;
  if(!isValidCoordinate(lat,lng)){
   status.textContent="พิกัดที่ได้รับไม่ถูกต้อง";return;
  }
  const point=[lat,lng];
  if(myLocationMarker)map.removeLayer(myLocationMarker);
  if(myAccuracyCircle)map.removeLayer(myAccuracyCircle);
  if(Number.isFinite(accuracy)){
   myAccuracyCircle=L.circle(point,{radius:accuracy,color:'#2563eb',weight:1,fillColor:'#60a5fa',fillOpacity:0.10,interactive:false}).addTo(map);
  }
  myLocationMarker=L.circleMarker(point,{
   radius:9,color:'#ffffff',weight:3,fillColor:'#2563eb',fillOpacity:1
  }).addTo(map).bindPopup('📍 ตำแหน่งปัจจุบันของฉัน');
  myLocationMarker.bringToFront();
  if(center)map.setView(point,Math.max(map.getZoom(),16));
  status.textContent='🔵 ตำแหน่งปัจจุบัน: '+lat.toFixed(6)+', '+lng.toFixed(6)+
   (Number.isFinite(accuracy)?' (ความแม่นยำประมาณ '+Math.round(accuracy)+' เมตร)':'');
 },error=>{
  if(request!==mapLocationRequest)return;
  const reason=error.code===1?'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาเปิดสิทธิ์ตำแหน่งให้เบราว์เซอร์':
   error.code===2?'ไม่สามารถระบุตำแหน่งจากอุปกรณ์ได้':
   error.code===3?'ค้นหาตำแหน่งหมดเวลา กรุณากดลองอีกครั้ง':error.message;
  status.textContent='ไม่สามารถแสดงตำแหน่งปัจจุบัน: '+reason;
 },{enableHighAccuracy:true,timeout:20000,maximumAge:15000});
}

// Open Google Maps driving directions. GPS is requested on demand; never persisted.
function navigateToPole(destLat,destLng){
 if(!isValidCoordinate(destLat,destLng)){
  alert('เสาไฟฟ้านี้ไม่มีพิกัดที่ถูกต้อง');return;
 }
 const destination=destLat.toFixed(7)+','+destLng.toFixed(7);
 const base='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination)+'&travelmode=driving';
 const openDirections=(lat,lng)=>{
  const origin=(isValidCoordinate(lat,lng))?'&origin='+encodeURIComponent(lat.toFixed(7)+','+lng.toFixed(7)):'';
  window.location.assign(base+origin);
 };
 if(!navigator.geolocation || !window.isSecureContext){
  // Maps can independently use the device's current location if permission is granted there.
  openDirections(null,null);return;
 }
 navigator.geolocation.getCurrentPosition(
  pos=>openDirections(pos.coords.latitude,pos.coords.longitude),
  ()=>openDirections(null,null),
  {enableHighAccuracy:true,timeout:12000,maximumAge:15000}
 );
}

function loadMap(){
 if(typeof L==="undefined"){
  $("map").textContent="โหลดแผนที่ไม่สำเร็จ โปรดตรวจสอบอินเทอร์เน็ต";
  return;
 }
 if(!map){
  map=L.map("map").setView([14.35,100.57],11);
  L.tileLayer(
   "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
   {attribution:"© OpenStreetMap contributors",maxZoom:19}
  ).addTo(map);
 }

 markers.forEach(m=>map.removeLayer(m));
 markers=[];

 const chosen=$('mapProject').value;
 const latest=new Map();
 records.slice().sort((a,b)=>new Date(b.date)-new Date(a.date))
 .filter(r=>chosen==='all'||(r.projectId||'legacy')===chosen)
 .forEach(r=>{const k=(r.projectId||'legacy')+'::'+String(r.pole).toLowerCase();if(!latest.has(k))latest.set(k,r)});
 const points=(window.V5?window.V5.mapSummaries(chosen):[...latest.values()]).filter(r=>r.gps&&isValidCoordinate(Number(r.gps.lat),Number(r.gps.lng)));

 points.forEach(r=>{
  const color=r.damage==null?"#71839b":r.damage<=1?"#16a34a":
   r.damage<=3?"#eab308":"#dc2626";

  const marker=L.circleMarker(
   [Number(r.gps.lat),Number(r.gps.lng)],
   {
    radius:10,color:"white",weight:3,
    fillColor:color,fillOpacity:1
   }
  ).addTo(map);

  marker.bindPopup(escapeHTML(r.pole)+" (สถานะจากผลตรวจล่าสุด)");

  marker.on("click",()=>{
   $("mapDetail").innerHTML=`
    <b>${escapeHTML(r.pole)}</b><p>โครงการ: ${escapeHTML(projectName(r.projectId))}</p><p>สถานะ: ${escapeHTML(statusName(r.status))}</p>
    <p>ผู้ตรวจสอบ: ${escapeHTML(r.inspector)}</p>
    <p>ความเสียหาย: ${r.damage==null?"ยังไม่ตรวจ":r.damage+"/5"} ${r.demo?"(DEMO)":""}</p>
    <p>ความสกปรก: ${r.dirt}/3 ${r.demo?"(DEMO)":"(API)"}</p>
    <p>พิกัด: ${Number(r.gps.lat).toFixed(6)}, ${Number(r.gps.lng).toFixed(6)}</p>
    <p>แหล่งที่มาของพิกัด: ${r.gps.source==="device"?"GPS อุปกรณ์":"กรอกด้วยตนเอง"}</p>
    <button class="btn detailPole">📋 รายละเอียดเสา / ลูกถ้วย</button><button class="btn light navigateToPole">🧭 นำทางจากตำแหน่งปัจจุบันไปเสานี้</button>
   `;
   $("mapDetail").querySelector(".detailPole").onclick=()=>window.V5?.openPole(r.projectId||"legacy",r.pole);
   $("mapDetail").querySelector(".navigateToPole").onclick=()=>navigateToPole(Number(r.gps.lat),Number(r.gps.lng));
  });

  markers.push(marker);
 });

 if(points.length){
  map.fitBounds(
   L.latLngBounds(points.map(r=>
    [Number(r.gps.lat),Number(r.gps.lng)]
   )).pad(.25),
   {maxZoom:15}
  );
 }

 setTimeout(()=>map.invalidateSize(),250);
}

function exportData(){
 if(!records.length){
  alert("ยังไม่มีข้อมูลสำหรับสำรอง");
  return;
 }

 const blob=new Blob(
  [JSON.stringify(records,null,2)],
  {type:"application/json"}
 );
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;
 a.download="InsulatorAI_Backup.json";
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function clearAll(){
 if(!confirm("ลบประวัติทั้งหมดในเครื่องใช่หรือไม่?"))return;
 try{
  if(storageMode==="indexeddb"){
   await idbClear();
   records=await idbGetAll();
  }else if(storageMode==="localstorage"){
   localStorage.removeItem(FALLBACK);
   records=getFallback();
  }else{
   throw new Error("ไม่มีระบบจัดเก็บ");
  }
  updateCount();
  alert("ลบประวัติแล้ว");
 }catch(e){
  alert("ลบข้อมูลไม่สำเร็จ: "+e.message);
 }
}

