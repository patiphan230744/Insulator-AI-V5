/* Insulator AI V5: optional UI extension; does not alter stored data. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const norm=x=>String(x??'').trim().toLocaleLowerCase('th');
const state={watch:null,gen:0,follow:true,manual:false,last:null,target:null,boundMap:null};
const valid=(a,b)=>Number.isFinite(+a)&&Number.isFinite(+b)&&+a>=-90&&+a<=90&&+b>=-180&&+b<=180;
const visible=()=>!!$('mapPage')?.classList.contains('active');
const status=s=>{if($('myMapLocationStatus'))$('myMapLocationStatus').textContent=s;};
function poles(){
 let saved=[];try{saved=JSON.parse(localStorage.getItem('INSULATOR_V5_POLES_V1')||'[]');}catch(e){}
 if(!Array.isArray(saved))saved=[];
 const items=new Map();
 const ensure=(pid,pole)=>{
  if(!projects.some(p=>p.id===pid)||!norm(pole))return null;
  const key=pid+'::'+norm(pole);
  if(!items.has(key))items.set(key,{pid,pole:String(pole).trim(),units:1,gps:null,records:[]});
  return items.get(key);
 };
 for(const p of saved){const x=ensure(p.projectId,p.pole);if(!x)continue;
  const n=+p.units;if(Number.isInteger(n)&&n>=1&&n<=500)x.units=n;
  if(p.gps&&valid(p.gps.lat,p.gps.lng))x.gps=p.gps;
 }
 for(const r of records){const x=ensure(r.projectId,r.pole);if(!x)continue;x.records.push(r);
  const n=+r.units;if(!saved.some(p=>p.projectId===x.pid&&norm(p.pole)===norm(x.pole))&&Number.isInteger(n)&&n>=1&&n<=500)x.units=Math.max(x.units,n);
  if(!x.gps&&r.gps&&valid(r.gps.lat,r.gps.lng))x.gps=r.gps;
 }
 return [...items.values()];
}
function summary(x){
 const latest=new Map();
 for(const r of x.records.slice().sort((a,b)=>new Date(b.date)-new Date(a.date))){
  const key=norm(r.insulatorId);
  if(key&&!latest.has(key))latest.set(key,r);
 }
 let done=0,worst=null;
 for(let i=1;i<=x.units;i++){
  const r=latest.get(norm(x.pole+'-I'+String(i).padStart(2,'0')));
  if(!r)continue;
  done++;
  if(Number.isFinite(+r.damage))worst=Math.max(worst??0,+r.damage);
 }
 let label=done===0?'ยังไม่ตรวจ':done<x.units?'ยังตรวจไม่ครบ':'ปกติ';
 let color='#64748b';
 if(done===x.units)color='#15803d';
 if(done>0&&done<x.units)color='#a16207';
 if(worst>=4){label='พบความเสียหาย'+(done<x.units?' · ยังไม่ครบ':'');color='#dc2626';}
 else if(worst>=2){label='เริ่มเสื่อม'+(done<x.units?' · ยังไม่ครบ':'');color='#b45309';}
 return {done,total:x.units,worst,label,color,history:x.records.length};
}
function refreshList(){
 const root=$('v5PoleList');if(!root)return;
 const items=poles().filter(p=>p.pid===activeProjectId);
 for(const row of root.querySelectorAll('.pole-row')){
  const name=norm(row.querySelector('b')?.textContent),x=items.find(p=>norm(p.pole)===name);
  if(!x)continue;
  const s=summary(x),small=row.querySelector('small'),badge=row.querySelector('.pole-state');
  if(small)small.textContent='ลูกถ้วย '+s.total+' ลูก · ตรวจแล้ว '+s.done+'/'+s.total+' · ประวัติ '+s.history+' ครั้ง';
  if(badge){badge.textContent='● '+s.label;badge.style.color=s.color;}
 }
}
function refreshDetail(){
 const root=$('v5PoleDetail'),head=root?.querySelector('.pole-detail-head');
 if(!head||root.querySelector('.v5-progress'))return;
 const name=norm(head.querySelector('h2')?.textContent);
 const project=projects.find(p=>norm(p.name)===norm(head.querySelector('.mini-label')?.textContent));
 const x=poles().find(p=>p.pid===(project?.id||activeProjectId)&&norm(p.pole)===name);if(!x)return;
 const s=summary(x),div=document.createElement('div');div.className='v5-progress';
 const h=document.createElement('strong');h.textContent='สรุปเสา '+x.pole+' — '+s.label;h.style.color=s.color;
 const p=document.createElement('p');p.textContent='ตรวจแล้ว '+s.done+'/'+s.total+' ลูก · ยังไม่ตรวจ '+(s.total-s.done)+' ลูก · ประวัติ '+s.history+' ครั้ง';
 const track=document.createElement('div');track.className='v5-progress-track';
 const fill=document.createElement('div');fill.style.width=(100*s.done/s.total)+'%';track.append(fill);
 div.append(h,p,track);
 if(s.worst!==null){const w=document.createElement('p');w.textContent='ระดับความเสียหายสูงสุดจากผลล่าสุด: '+s.worst+'/5';div.append(w);}
 head.after(div);
}
if($('v5PoleList'))new MutationObserver(refreshList).observe($('v5PoleList'),{childList:true});
if($('v5PoleDetail'))new MutationObserver(refreshDetail).observe($('v5PoleDetail'),{childList:true});
function updateButton(){
 const b=$('v5GPSControl');if(b){b.textContent=state.watch===null?'▶ เริ่มติดตาม GPS':'⏸ หยุดติดตาม GPS';b.setAttribute('aria-pressed',state.watch===null?'false':'true');}
}
function stop(manual=false){
 ++state.gen;
 if(state.watch!==null){navigator.geolocation?.clearWatch(state.watch);state.watch=null;}
 state.manual=manual;updateButton();
 if(manual)status('หยุดติดตาม GPS แล้ว');
}
function bindMap(){
 if(map&&map!==state.boundMap){
  map.on('dragstart',()=>{state.follow=false;});
  state.boundMap=map;
 }
}
function position(p,g){
 if(g!==state.gen||!visible())return;
 const {latitude:lat,longitude:lng,accuracy}=p.coords;
 if(!valid(lat,lng))return status('พิกัด GPS ไม่ถูกต้อง');
 if(Date.now()-(p.timestamp||Date.now())>60000)return status('ข้อมูล GPS เก่าเกิน 1 นาที');
 const point=[lat,lng];state.last={lat,lng,when:Date.now()};
 if(!map)loadMap();
 if(!map||typeof L==='undefined')return;
 bindMap();
 if(!myLocationMarker)myLocationMarker=L.circleMarker(point,{radius:9,color:'#fff',weight:3,fillColor:'#2563eb',fillOpacity:1}).addTo(map).bindPopup('ตำแหน่งของฉัน');
 else myLocationMarker.setLatLng(point);
 if(Number.isFinite(accuracy)&&accuracy>=0){
  if(!myAccuracyCircle)myAccuracyCircle=L.circle(point,{radius:accuracy,color:'#2563eb',fillColor:'#60a5fa',fillOpacity:.1,weight:1,interactive:false}).addTo(map);
  else myAccuracyCircle.setLatLng(point).setRadius(accuracy);
 }
 myLocationMarker.bringToFront();
 if(state.follow)map.setView(point,Math.max(map.getZoom(),16),{animate:true});
 status('🔵 GPS สด: '+lat.toFixed(6)+', '+lng.toFixed(6)+(Number.isFinite(accuracy)?' · คลาดเคลื่อนประมาณ '+Math.round(accuracy)+' ม.':'')+(state.follow?' · กล้องติดตาม':' · เลื่อนแผนที่อิสระ'));
}
function start(){
 if(!visible()||document.hidden||state.watch!==null)return;
 if(!navigator.geolocation||!window.isSecureContext)return status('ต้องอนุญาต GPS และเปิดผ่าน HTTPS');
 state.manual=false;
 const g=++state.gen;
 status('กำลังติดตาม GPS... กรุณาอนุญาตตำแหน่ง');
 try{
  state.watch=navigator.geolocation.watchPosition(p=>position(p,g),e=>{
   if(g!==state.gen)return;
   if(e.code===1){stop(true);status('GPS ไม่ได้รับอนุญาต กรุณาเปิดสิทธิ์ตำแหน่ง');}
   else status('ไม่สามารถรับพิกัด GPS: '+(e.code===2?'ไม่มีสัญญาณ':e.code===3?'หมดเวลา':e.message));
  },{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  updateButton();
 }catch(e){stop(true);status('ไม่สามารถเริ่ม GPS: '+e.message);}
}
window.locateMeOnMap=function(center=true){
 state.target=null;if(center)state.follow=true;
 if(state.watch===null)start();
 if(center&&state.last&&Date.now()-state.last.when<60000&&map)map.setView([state.last.lat,state.last.lng],Math.max(16,map.getZoom()));
};
const oldGo=window.go;
window.go=function(id){
 if(id!=='mapPage'){stop();state.target=null;}
 else {state.follow=!state.target;state.manual=false;}
 oldGo(id);
 if(id==='mapPage')setTimeout(()=>{if(visible()) {bindMap();start();}},300);
};
const locateBtn=[...$('mapPage').querySelectorAll('button')].find(b=>b.getAttribute('onclick')?.includes('locateMeOnMap'));
if(locateBtn){
 const b=document.createElement('button');b.id='v5GPSControl';b.type='button';b.className='btn light';
 b.addEventListener('click',()=>{if(state.watch===null){state.follow=true;state.target=null;start();}else stop(true);});
 locateBtn.after(b);updateButton();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(visible()&&!state.manual)start();});
window.addEventListener('pagehide',()=>stop());
function distance(a,b,c,d){
 const rad=x=>x*Math.PI/180,da=rad(a-c),db=rad(b-d);
 const h=Math.sin(da/2)**2+Math.cos(rad(c))*Math.cos(rad(a))*Math.sin(db/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
const card=document.createElement('div');card.className='card v5-smart';
const label=document.createElement('label');label.htmlFor='v5SmartInput';label.textContent='🔎 ค้นหาอัจฉริยะ';
const input=document.createElement('input');input.id='v5SmartInput';input.type='search';input.placeholder='ชื่อโครงการ / รหัสเสา / ลูกถ้วย / ผู้ตรวจ / พิกัด';
const note=document.createElement('p');note.className='note';note.textContent='เลือกผลค้นหาเพื่อไปยังเสาบนแผนที่ หรือเปิดรายละเอียดเสา';
const results=document.createElement('div');results.className='v5-search-results';results.setAttribute('aria-live','polite');
card.append(label,input,note,results);
const mapCard=$('map')?.closest('.card');if(mapCard)mapCard.before(card);
function openPole(x){window.V5.openPole(x.pid,x.pole);}
function showPole(x){
 if(!x.gps||!valid(x.gps.lat,x.gps.lng))return openPole(x);
 state.target=x;state.follow=false;
 if($('mapProject'))$('mapProject').value=x.pid;
 if(!visible())window.go('mapPage');
 setTimeout(()=>{
  if($('mapProject'))$('mapProject').value=x.pid;
  loadMap();state.follow=false;
  map?.setView([+x.gps.lat,+x.gps.lng],Math.max(map.getZoom(),17));
  const panel=$('mapDetail');if(!panel)return;
  panel.replaceChildren();
  const t=document.createElement('strong');t.textContent='เสา '+x.pole;
  const p=document.createElement('p'),s=summary(x);p.textContent='ตรวจแล้ว '+s.done+'/'+s.total+' ลูก · '+s.label;
  const b=document.createElement('button');b.className='btn';b.textContent='📋 ดูรายละเอียดเสา';b.onclick=()=>openPole(x);
  panel.append(t,p,b);
 },450);
}
function render(){
 const q=norm(input.value);results.replaceChildren();if(!q)return;
 const all=poles(),pair=q.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
 const matches=[];
 for(const p of projects){
  if(norm(p.name).includes(q)||norm(p.office).includes(q))matches.push({score:40,project:p});
 }
 for(const x of all){
  const project=projects.find(p=>p.id===x.pid);
  const pole=norm(x.pole),lat=x.gps?.lat,lng=x.gps?.lng;
  const nearby=pair&&valid(pair[1],pair[2])&&x.gps&&distance(lat,lng,+pair[1],+pair[2])<=15;
  const hit=pole===q?110:pole.includes(q)?85:nearby?100:
   x.records.some(r=>norm(r.insulatorId).includes(q))?70:
   x.records.some(r=>norm(r.inspector).includes(q))?60:
   norm(project?.name).includes(q)||norm(project?.office).includes(q)?45:
   x.gps&&(String(lat).includes(q)||String(lng).includes(q))?35:0;
  if(hit)matches.push({score:hit,x});
 }
 matches.sort((a,b)=>b.score-a.score);
 if(!matches.length){results.textContent='ไม่พบข้อมูลที่ตรงกับคำค้นในเครื่องนี้';return;}
 for(const m of matches.slice(0,12)){
  const row=document.createElement('div');row.className='v5-search-row';
  const main=document.createElement('button');main.type='button';main.className='v5-search-main';
  if(m.project){
   main.textContent='📁 '+m.project.name;
   main.onclick=()=>{
    state.target={pid:m.project.id};state.follow=false;
    if($('mapProject'))$('mapProject').value=m.project.id;
    if(!visible())window.go('mapPage');
    setTimeout(()=>{if($('mapProject'))$('mapProject').value=m.project.id;loadMap();state.follow=false;},450);
   };
   row.append(main);
  }else{
   const s=summary(m.x),project=projects.find(p=>p.id===m.x.pid);
   main.textContent='📍 '+m.x.pole+' · '+(project?.name||'')+' · '+s.done+'/'+s.total+' ลูก · '+s.label;
   main.onclick=()=>showPole(m.x);
   const detail=document.createElement('button');detail.type='button';detail.className='v5-search-detail';
   detail.textContent='รายละเอียด';detail.onclick=()=>openPole(m.x);
   row.append(main,detail);
  }
  results.append(row);
 }
}
input.addEventListener('input',render);
window.InsulatorV5Enhancements={start,stop,poles,summary,render};
})();