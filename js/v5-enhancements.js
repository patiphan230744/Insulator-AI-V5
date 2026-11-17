/* Insulator AI V5 enhancements – 2026-11-17
 * Non-destructive UI extension: live map GPS, unified smart search,
 * and per-pole progress summaries. Does not write to Firebase or storage.
 * Load after js/bootstrap.js; relies on the V5 classic-script globals.
 */
(function () {
  'use strict';
  if (window.InsulatorV5Enhancements) return;
  const byId = id => document.getElementById(id);
  const locationState = {watchId:null, generation:0, follow:true, lastFix:null, manualPause:false, target:null, mapEventsBound:false};
  const statusElement = () => byId('myMapLocationStatus');
  const isMapVisible = () => byId('mapPage')?.classList.contains('active') === true;
  const gpsAvailable = () => !!navigator.geolocation && !!window.isSecureContext;
  const validGPS = (lat,lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const clean = value => String(value == null ? '' : value).trim();
  const normal = value => clean(value).toLocaleLowerCase('th');
  const hasProject = pid => Array.isArray(projects) && projects.some(p => p.id === pid && !window.isLegacyProjectLike?.(p));
  const headingStatus = text => { if (statusElement()) statusElement().textContent = text; };

  function bindMapDrag() {
    if (!map || locationState.mapEventsBound) return;
    locationState.mapEventsBound = true;
    map.on('dragstart', () => { locationState.follow = false; });
  }
  function updateLocation(position, generation) {
    if (generation !== locationState.generation || !isMapVisible()) return;
    const {latitude:lat,longitude:lng,accuracy} = position.coords;
    if (!validGPS(lat,lng)) { headingStatus('GPS ส่งพิกัดไม่ถูกต้อง'); return; }
    const ageMs = Math.max(0, Date.now() - (position.timestamp || Date.now()));
    if (ageMs > 60000) { headingStatus('GPS ยังไม่มีตำแหน่งใหม่ (ข้อมูลเก่าเกิน 1 นาที)'); return; }
    locationState.lastFix = {lat,lng,accuracy,when:Date.now()};
    if (!map && typeof loadMap === 'function') loadMap();
    if (!map || typeof L === 'undefined') return;
    bindMapDrag();
    const point = [lat,lng];
    if (!myLocationMarker) {
      myLocationMarker = L.circleMarker(point,{radius:9,color:'#fff',weight:3,fillColor:'#2563eb',fillOpacity:1})
        .addTo(map).bindPopup('📍 ตำแหน่งของฉัน (GPS สด)');
    } else {
      myLocationMarker.setLatLng(point);
    }
    if (Number.isFinite(accuracy) && accuracy >= 0) {
      if (!myAccuracyCircle) {
        myAccuracyCircle = L.circle(point,{radius:accuracy,color:'#2563eb',weight:1,fillColor:'#60a5fa',fillOpacity:0.1,interactive:false}).addTo(map);
      } else { myAccuracyCircle.setLatLng(point).setRadius(accuracy); }
    } else if (myAccuracyCircle) { map.removeLayer(myAccuracyCircle); myAccuracyCircle = null; }
    myLocationMarker.bringToFront();
    if (locationState.follow) map.setView(point,Math.max(map.getZoom(),16),{animate:true});
    headingStatus('🔵 GPS สด: '+lat.toFixed(6)+', '+lng.toFixed(6)+
      (Number.isFinite(accuracy)?' · ความแม่นยำประมาณ '+Math.round(accuracy)+' ม.':'')+
      (locationState.follow?' · กล้องติดตาม':' · หมุดยังติดตาม (กล้องไม่เลื่อน)'));
  }
  function stopTracking(pausedByUser=false) {
    locationState.generation++;
    if (locationState.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationState.watchId);
    }
    locationState.watchId = null;
    locationState.manualPause = pausedByUser;
    if (pausedByUser) headingStatus('หยุดติดตาม GPS แล้ว · กด “กลับไปตำแหน่งปัจจุบัน” เพื่อเริ่มใหม่');
    renderTrackingButton();
  }
  function renderTrackingButton() {
    const button=byId('v5TrackingToggle');
    if (!button) return;
    button.textContent = locationState.watchId === null?'▶ เริ่มติดตาม GPS':'⏸ หยุดติดตาม GPS';
    button.setAttribute('aria-pressed',locationState.watchId !== null?'true':'false');
  }
  function startTracking() {
    if (!isMapVisible() || document.hidden) return;
    if (!gpsAvailable()) {
      headingStatus(navigator.geolocation?'ต้องเปิดเว็บผ่าน HTTPS เพื่อใช้ GPS':'อุปกรณ์นี้ไม่รองรับ GPS');
      return;
    }
    if (locationState.watchId !== null) return;
    locationState.manualPause = false;
    const generation=++locationState.generation;
    headingStatus('กำลังติดตาม GPS… กรุณาอนุญาตตำแหน่งเมื่อเบราว์เซอร์ถาม');
    try {
      locationState.watchId = navigator.geolocation.watchPosition(
        p => updateLocation(p,generation),
        err => {
          if (generation !== locationState.generation) return;
          const reason = err.code===1?'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง':
            err.code===2?'อุปกรณ์ระบุตำแหน่งไม่ได้':
            err.code===3?'GPS ยังไม่ตอบสนอง (หมดเวลารอ)':clean(err.message);
          headingStatus('ติดตาม GPS ไม่สำเร็จ: '+reason);
          if (err.code===1) { stopTracking(true); headingStatus('ไม่ได้รับอนุญาต GPS · เปิดสิทธิ์ตำแหน่งแล้วจึงกดเริ่มใหม่'); }
        },
        {enableHighAccuracy:true,maximumAge:5000,timeout:20000}
      );
      renderTrackingButton();
    } catch(err) { headingStatus('เปิด GPS ไม่สำเร็จ: '+err.message); stopTracking(true); }
  }
  // Override the on-demand map locator only; the inspection GPS button remains unchanged.
  window.locateMeOnMap = function(center=true) {
    locationState.follow = center && !locationState.target;
    locationState.manualPause = false;
    startTracking();
    if (center && !locationState.target && locationState.lastFix && Date.now()-locationState.lastFix.when < 60000 && map) {
      map.setView([locationState.lastFix.lat,locationState.lastFix.lng],Math.max(map.getZoom(),16));
    }
  };
  const previousGo = window.go;
  window.go = function(page) {
    if (page !== 'mapPage') { stopTracking(false); locationState.target = null; }
    else { locationState.follow = !locationState.target; locationState.manualPause = false; }
    previousGo(page);
    if (page === 'mapPage') setTimeout(() => { if (isMapVisible()) { bindMapDrag(); startTracking(); } },250);
  };
  const currentButton = [...byId('mapPage').querySelectorAll('button')].find(b => b.getAttribute('onclick')?.includes('locateMeOnMap'));
  if (currentButton) {
    const button=document.createElement('button');
    button.id='v5TrackingToggle';button.type='button';button.className='btn light v5-gps-toggle';
    button.addEventListener('click', () => {
      if (locationState.watchId !== null) stopTracking(true);
      else { locationState.follow=true; locationState.target=null; startTracking(); }
    });
    currentButton.addEventListener('click',()=>{locationState.target=null;locationState.follow=true;},true);
    currentButton.insertAdjacentElement('afterend',button);
    renderTrackingButton();
  }
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) stopTracking(locationState.manualPause);
    else if (isMapVisible() && !locationState.manualPause) startTracking();
  });
  window.addEventListener('pagehide',()=>stopTracking(false));

  function storedPoles() {
    try {
      const value=JSON.parse(localStorage.getItem('INSULATOR_V5_POLES_V1')||'[]');
      return Array.isArray(value)?value:[];
    } catch (_) {return [];}
  }
  function snapshot() {
    const entries=new Map(),projectEntries=[];
    if (!Array.isArray(projects) || !Array.isArray(records)) return {entries:[],projectEntries};
    for (const p of projects) if (hasProject(p.id)) projectEntries.push({type:'project',projectId:p.id,name:p.name,office:p.office||''});
    function assure(pid,pole) {
      if (!hasProject(pid) || !clean(pole)) return null;
      const id=pid+'::'+normal(pole);
      if (!entries.has(id)) entries.set(id,{type:'pole',projectId:pid,pole:clean(pole),units:0,gps:null,records:[]});
      return entries.get(id);
    }
    for(const pole of storedPoles()) {
      const item=assure(pole.projectId,pole.pole);
      if (!item) continue;
      const units=Number(pole.units);
      if (Number.isInteger(units)&&units>=1&&units<=500) item.units=units;
      if (pole.gps && validGPS(Number(pole.gps.lat),Number(pole.gps.lng))) item.gps=pole.gps;
    }
    for (const record of records) {
      const item=assure(record.projectId,record.pole);
      if (!item) continue;
      item.records.push(record);
      const n=Number(record.units);
      if (!item.units && Number.isInteger(n) && n>=1 && n<=500) item.units=n;
      if (!item.gps && record.gps && validGPS(Number(record.gps.lat),Number(record.gps.lng))) item.gps=record.gps;
    }
    for (const item of entries.values()) item.units ||= 1;
    return {entries:[...entries.values()],projectEntries};
  }
  function summarize(item) {
    const latest=new Map();
    for (const r of item.records.slice().sort((a,b)=>new Date(b.date)-new Date(a.date))) {
      const id=normal(r.insulatorId);
      if (id&&!latest.has(id)) latest.set(id,r);
    }
    const inspected=[];
    for(let i=1;i<=item.units;i++) {
      const id=normal(item.pole+'-I'+String(i).padStart(2,'0'));
      if (latest.has(id)) inspected.push(latest.get(id));
    }
    const damage=inspected.map(r=>Number(r.damage)).filter(n=>Number.isInteger(n)&&n>=0&&n<=5);
    const worst=damage.length?Math.max(...damage):null;
    const count=inspected.length;
    let state='ยังไม่ตรวจ',color='#64748b';
    if(count>0 && count<item.units) {state='ยังตรวจไม่ครบ';color='#a16207';}
    else if(count===item.units) {state='ปกติ';color='#15803d';}
    if(worst!==null && worst>=4) {state=(count<item.units?'พบความเสียหาย · ยังไม่ครบ':'พบความเสียหาย');color='#dc2626';}
    else if(worst!==null && worst>=2) {state=(count<item.units?'เริ่มเสื่อม · ยังไม่ครบ':'เริ่มเสื่อม');color='#b45309';}
    return {count,total:item.units,records:item.records.length,worst,state,color};
  }
  function findPole(pid,pole) {return snapshot().entries.find(e=>e.projectId===pid&&normal(e.pole)===normal(pole));}
  function enhancePoleRows() {
    const root=byId('v5PoleList');if(!root)return;
    const entries=snapshot().entries.filter(e=>e.projectId===activeProjectId);
    for(const row of root.querySelectorAll('.pole-row')) {
      if(row.dataset.v5Enhanced==='yes') continue;
      const pole=row.querySelector('b')?.textContent;
      const item=entries.find(e=>normal(e.pole)===normal(pole));if(!item)continue;
      const s=summarize(item);
      const small=row.querySelector('small');
      if(small) small.textContent='ลูกถ้วย '+s.total+' ลูก · ตรวจแล้ว '+s.count+'/'+s.total+' · ประวัติ '+s.records+' ครั้ง';
      const badge=row.querySelector('.pole-state');
      if(badge){badge.textContent='● '+s.state;badge.style.color=s.color;}
      row.dataset.v5Enhanced='yes';
    }
  }
  const poleList=byId('v5PoleList');
  if(poleList) new MutationObserver(enhancePoleRows).observe(poleList,{childList:true});
  function decorateDetail() {
    const root=byId('v5PoleDetail');if(!root||root.querySelector('.v5-pole-progress'))return;
    const head=root.querySelector('.pole-detail-head');if(!head)return;
    const pole=clean(head.querySelector('h2')?.textContent);
    const name=clean(head.querySelector('.mini-label')?.textContent);
    const match=projects.find(p=>p.name===name&&hasProject(p.id)) || projects.find(p=>p.id===activeProjectId);
    const item=match&&findPole(match.id,pole);
    if(!item)return;
    const s=summarize(item);
    const box=document.createElement('div');box.className='v5-pole-progress';
    const label=document.createElement('strong');label.textContent='สรุปเสา '+item.pole+' — '+s.state;label.style.color=s.color;
    const text=document.createElement('p');text.textContent='ตรวจแล้ว '+s.count+' จาก '+s.total+' ลูก · คงเหลือ '+(s.total-s.count)+' ลูก · ประวัติ '+s.records+' ครั้ง';
    const bar=document.createElement('div');bar.className='v5-progress-track';
    const fill=document.createElement('div');fill.style.width=(s.count/s.total*100)+'%';bar.append(fill);
    box.append(label,text,bar);
    if(s.worst!==null){const worst=document.createElement('p');worst.textContent='ระดับความเสียหายสูงสุดในผลตรวจล่าสุดรายลูก: '+s.worst+'/5'+(s.count<s.total?' (ยังตรวจไม่ครบ)':'');box.append(worst);}
    head.after(box);
  }
  const detail=byId('v5PoleDetail');
  if(detail) new MutationObserver(decorateDetail).observe(detail,{childList:true});

  // Single smart search on the map; existing history filtering remains intact.
  function distanceMeters(a,b,lat,lng) {
    const toRad=d=>d*Math.PI/180,dLat=toRad(Number(a)-lat),dLng=toRad(Number(b)-lng);
    const h=Math.sin(dLat/2)**2+Math.cos(toRad(lat))*Math.cos(toRad(Number(a)))*Math.sin(dLng/2)**2;
    return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  const searchBox=document.createElement('div');searchBox.className='card v5-smart-search';
  const searchLabel=document.createElement('label');searchLabel.htmlFor='v5SmartQuery';searchLabel.textContent='🔎 ค้นหาอัจฉริยะ';
  const searchInput=document.createElement('input');searchInput.id='v5SmartQuery';searchInput.type='search';searchInput.autocomplete='off';
  searchInput.placeholder='โครงการ / รหัสเสา / ลูกถ้วย / ผู้ตรวจ / พิกัด';
  const suggestion=document.createElement('div');suggestion.id='v5SmartResults';suggestion.setAttribute('aria-live','polite');
  const hint=document.createElement('p');hint.className='note';hint.textContent='พิมพ์คำค้นแล้วเลือกเสาเพื่อดูบนแผนที่ หรือกดรายละเอียด · ค้นพิกัดคู่ในระยะประมาณ 15 ม.';
  searchBox.append(searchLabel,searchInput,hint,suggestion);
  const mapCard=byId('map')?.closest('.card');if(mapCard) mapCard.before(searchBox);

  function focusPoleOnMap(item) {
    if(!item.gps || !validGPS(Number(item.gps.lat),Number(item.gps.lng))) {V5.openPole(item.projectId,item.pole);return;}
    locationState.target={projectId:item.projectId,pole:item.pole};
    locationState.follow=false;
    const select=byId('mapProject');if(select) select.value=item.projectId;
    if(!isMapVisible()) window.go('mapPage');
    setTimeout(()=>{
      if(!isMapVisible())return;
      if(select) select.value=item.projectId;
      if(typeof loadMap==='function')loadMap();
      if(map) map.setView([Number(item.gps.lat),Number(item.gps.lng)],Math.max(map.getZoom(),17));
      locationState.follow=false;
      const detail=byId('mapDetail');
      if(detail){
        detail.replaceChildren();
        const title=document.createElement('h3');title.textContent='เสา '+item.pole;
        const summary=document.createElement('p');const s=summarize(item);
        summary.textContent='ตรวจแล้ว '+s.count+'/'+s.total+' ลูก · '+s.state;
        const button=document.createElement('button');button.className='btn';button.textContent='📋 ดูรายละเอียดเสานี้';
        button.addEventListener('click',()=>V5.openPole(item.projectId,item.pole));
        detail.append(title,summary,button);
      }
      searchInput.blur();
    },350);
  }
  function renderSearch() {
    const q=normal(searchInput.value),data=snapshot();suggestion.replaceChildren();
    if(!q)return;
    const pair=q.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
    const pairValid=pair&&validGPS(Number(pair[1]),Number(pair[2]));
    const ranked=[];
    for(const p of data.projectEntries){
      const hit=normal(p.name).includes(q)||normal(p.office).includes(q);
      if(hit) ranked.push({score:normal(p.name)===q?120:50,item:p});
    }
    for(const item of data.entries){
      const project=data.projectEntries.find(p=>p.projectId===item.projectId);
      const pole=normal(item.pole), projectName=normal(project?.name), office=normal(project?.office);
      const insIds=item.records.map(r=>normal(r.insulatorId));
      const inspectors=item.records.map(r=>normal(r.inspector));
      const lat=item.gps?.lat,lng=item.gps?.lng;
      const coordinate=validGPS(Number(lat),Number(lng)) &&
        (String(lat).includes(q)||String(lng).includes(q)||Number(lat).toFixed(6).includes(q)||Number(lng).toFixed(6).includes(q));
      const near=pairValid&&item.gps&&distanceMeters(lat,lng,Number(pair[1]),Number(pair[2]))<=15;
      const score=pole===q?110:pole.startsWith(q)?90:pole.includes(q)?75:
        near?100:insIds.some(id=>id.includes(q))?65:inspectors.some(id=>id.includes(q))?55:
        projectName.includes(q)?45:office.includes(q)?40:coordinate?35:0;
      if(score)ranked.push({score,item});
    }
    ranked.sort((a,b)=>b.score-a.score||(a.item.pole||a.item.name).localeCompare(b.item.pole||b.item.name,'th'));
    if(!ranked.length){const empty=document.createElement('p');empty.className='note';empty.textContent='ไม่พบข้อมูลที่ตรงกับคำค้นในเครื่องนี้';suggestion.append(empty);return;}
    for(const {item} of ranked.slice(0,12)) {
      const row=document.createElement('div');row.className='v5-search-row';
      const main=document.createElement('button');main.type='button';main.className='v5-search-main';
      if(item.type==='project'){
        main.textContent='📁 '+item.name+' · '+item.office;
        main.addEventListener('click',()=>{
          const select=byId('mapProject');if(select)select.value=item.projectId;
          locationState.target={projectId:item.projectId};locationState.follow=false;
          if(!isMapVisible())window.go('mapPage');
          setTimeout(()=>{if(select)select.value=item.projectId;loadMap();locationState.follow=false;},350);
        });
        row.append(main);
      }else{
        const s=summarize(item);
        const p=data.projectEntries.find(p=>p.projectId===item.projectId);
        main.textContent='📍 '+item.pole+' · '+(p?.name||'')+' · '+s.count+'/'+s.total+' ลูก · '+s.state;
        main.addEventListener('click',()=>focusPoleOnMap(item));
        const detailBtn=document.createElement('button');detailBtn.type='button';detailBtn.className='v5-search-detail';
        detailBtn.textContent='รายละเอียด';detailBtn.addEventListener('click',()=>V5.openPole(item.projectId,item.pole));
        row.append(main,detailBtn);
      }
      suggestion.append(row);
    }
  }
  searchInput.addEventListener('input',renderSearch);
  window.InsulatorV5Enhancements = {startTracking,stopTracking,renderSearch,snapshot,summarize};
})();
