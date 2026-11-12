/* AI transport adapter: schema and canvas rendering are isolated from UI.
 * DEMO stays explicit. API requests never silently use simulated results.
 * Expected POST multipart field `image` and JSON response documented in docs/API.md.
 */
(function(){
 'use strict';
 const key='INSULATOR_V5_AI_CONFIG';
 const $id=id=>document.getElementById(id);
 function current(){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch(e){return {}}}
 function saveAISettings(){
  const config={mode:$id('aiMode').value,endpoint:$id('aiEndpoint').value.trim()};
  try{localStorage.setItem(key,JSON.stringify(config));}catch(e){console.warn(e)}
  showMode(config);
 }
 function showMode(config=current()){
  const demo=config.mode!=='api';
  message('aiModeBanner',demo?'DEMO: ผลจำลองเพื่อทดสอบหน้าจอเท่านั้น ไม่ใช่การตรวจจับจริง':'API: ส่งภาพไปวิเคราะห์ด้วยโมเดลจริงที่กำหนดไว้',demo?'warn':'info');
  message('aiSettingsStatus',demo?'กำลังใช้งาน DEMO — ไม่ส่งภาพให้เซิร์ฟเวอร์':config.endpoint?'โหมด API: '+config.endpoint:'กรุณากรอก URL เซิร์ฟเวอร์ HTTPS ก่อนวิเคราะห์',demo?'warn':'info');
  $id('analyzeBtn').textContent=demo?'🤖 ทดลองวิเคราะห์ (DEMO)':'🤖 วิเคราะห์ด้วย YOLOv8 API';
 }
 const oldAnalyze=analyze;
 analyze=async function(){
  const cfg=current();if(cfg.mode!=='api'){oldAnalyze();return;}
  if(!originalImage){alert('กรุณาเลือกภาพก่อน');return;}
  if(!/^https:\/\//i.test(cfg.endpoint)){alert('กรุณาตั้งค่า URL แบบ HTTPS ที่หน้าตั้งค่า');return;}
  const button=$id('analyzeBtn');button.disabled=true;
  $id('result').style.display='none';
  message('aiModeBanner','กำลังส่งภาพไป YOLOv8 API...','info');
  try{
   const imageBlob=await (await fetch(originalImage)).blob();
   const form=new FormData();form.append('image',imageBlob,'insulator.jpg');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),45000);
   let response;
   try{response=await fetch(cfg.endpoint,{method:'POST',body:form,signal:controller.signal,credentials:'omit'});}
   finally{clearTimeout(timeout);}
   if(!response.ok)throw Error('HTTP '+response.status+' จาก API');
   const data=await response.json();
   const d=validate(data);
   await render(data,d);
   message('aiModeBanner','ผลจาก API: '+(data.model_version||'YOLOv8')+' — ควรให้ผู้ตรวจสอบยืนยันผลก่อนใช้งานจริง','good');
  }catch(e){result=null;message('aiModeBanner','วิเคราะห์ไม่สำเร็จ: '+e.message+' (ไม่มีการสร้างผลจำลองทดแทน)','bad');}
  finally{button.disabled=false;}
 };
 function validate(data){
  if(!data||typeof data!=='object')throw Error('ผล API ไม่ใช่ JSON object');
  const fields=['damage_level','dirt_level','damage_percent'];
  for(const f of fields){if(typeof data[f]!=='number'||!Number.isFinite(data[f]))throw Error('API ขาดค่าที่ถูกต้อง: '+f);}
  if(!Number.isInteger(data.damage_level)||data.damage_level<0||data.damage_level>5)throw Error('damage_level ต้องเป็น 0–5');
  if(!Number.isInteger(data.dirt_level)||data.dirt_level<0||data.dirt_level>3)throw Error('dirt_level ต้องเป็น 0–3');
  if(data.damage_percent<0||data.damage_percent>100)throw Error('damage_percent ต้องอยู่ระหว่าง 0–100');
  if(!Array.isArray(data.detections))throw Error('detections ต้องเป็น array');
  for(const x of data.detections){
   if(typeof x.label!=='string'||typeof x.confidence!=='number'||!Array.isArray(x.bbox)||x.bbox.length!==4||!x.bbox.every(Number.isFinite))throw Error('รูปแบบ detection ไม่ถูกต้อง');
  }
  return {damage:data.damage_level,dirt:data.dirt_level,percent:data.damage_percent,crack:data.detections.some(x=>x.label.toLowerCase()==='crack'),demo:false,modelVersion:data.model_version||'YOLOv8'};
 }
 async function render(data,d){
  const img=new Image();img.src=originalImage;
  await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;});
  const canvas=$id('canvas'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  for(const item of data.detections){
   // Bounding boxes use normalized 0..1 image coordinates.
   const [x1,y1,x2,y2]=item.bbox;
   if(!item.bbox.every(n=>n>=0&&n<=1)||x2<=x1||y2<=y1)continue;
   const color=item.label.toLowerCase()==='crack'?'#ef4444':item.label.toLowerCase()==='dirt'?'#f59e0b':'#16a34a';
   const x=x1*w,y=y1*h;ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(x,y,(x2-x1)*w,(y2-y1)*h);
   const label=item.label+' '+item.confidence.toFixed(2);ctx.font='bold 14px Arial';
   ctx.fillStyle=color;ctx.fillRect(x,Math.max(0,y-22),ctx.measureText(label).width+10,22);
   ctx.fillStyle='#fff';ctx.fillText(label,x+5,Math.max(16,y-6));
  }
  result=d;
  $id('resultDetails').innerHTML='<p><b>YOLOv8 API — '+escapeHTML(d.modelVersion)+'</b></p>'+
   '<p>ความเสียหาย: '+d.damage+'/5</p><p>คราบสกปรก: '+d.dirt+'/3</p>'+
   '<p>พื้นที่เสียหาย: '+d.percent.toFixed(1)+'%</p><p>พบวัตถุ: '+data.detections.length+' รายการ</p>';
  $id('result').style.display='block';$id('saveStatus').replaceChildren();
 }
 window.V5.saveAISettings=saveAISettings;
 const cfg=current();$id('aiMode').value=cfg.mode==='api'?'api':'demo';$id('aiEndpoint').value=cfg.endpoint||'';showMode(cfg);
})();
