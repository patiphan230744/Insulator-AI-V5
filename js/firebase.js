/* ตั้งค่าจาก Firebase Console > Project settings > Your apps > Web app.
   ค่าชุดนี้ไม่ใช่รหัสผ่านลับ; ความปลอดภัยอยู่ที่ Authentication + Firestore Rules */
const FIREBASE_CONFIG = {
 apiKey: "AIzaSyDp1TH4dS-I8KPJW_REwVLD1WqbCCFmAcU",
 authDomain: "insulator-ai.firebaseapp.com",
 projectId: "insulator-ai",
 storageBucket: "insulator-ai.firebasestorage.app",
 messagingSenderId: "300000522294",
 appId: "1:300000522294:web:86d119242fb70bb1752897",
 measurementId: "G-XFLNCZ6L60"
};
let cloudAuth=null, cloudDb=null, cloudBusy=false;
function cloudReady(){return !!(window.firebase && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'PASTE_API_KEY_HERE' && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.projectId !== 'PASTE_PROJECT_ID')}
function cloudNotice(t,kind='info'){message('cloudStatus',t,kind)}
function cloudInit(){
 if(!cloudReady()){message('cloudConfigHint','ยังไม่พร้อม: ไม่พบ Firebase SDK หรือ Configuration ที่ถูกต้อง','warn');cloudNotice('เปิดใช้งานข้อมูลภายในเครื่องได้ แต่เชื่อม Cloud ไม่ได้','warn');return}
 try{
  if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
  cloudAuth=firebase.auth();cloudDb=firebase.firestore();
  message('cloudConfigHint','พบการตั้งค่า Firebase: '+FIREBASE_CONFIG.projectId+' — กำลังตรวจสอบบัญชีผู้ใช้ (ยังไม่ยืนยันการอ่าน/เขียน Firestore)','info');
  cloudAuth.onAuthStateChanged(user=>{
   $('authForm').style.display=user?'none':'block';
   $('cloudActions').style.display=user?'block':'none';
   $('cloudUser').textContent=user?'บัญชี: '+user.email:' ';
   cloudNotice(user?'เข้าสู่ระบบแล้ว — กรุณากดตรวจสอบข้อมูลบน Firebase เพื่อยืนยันการเชื่อมต่อ Firestore':'ยังไม่ได้เข้าสู่ระบบ',user?'good':'info');
   message('cloudConfigHint',user?'Firebase Authentication: ลงชื่อเข้าใช้แล้ว ('+FIREBASE_CONFIG.projectId+')':'ตั้งค่า Firebase แล้ว แต่ยังไม่ได้ลงชื่อเข้าใช้','info');
   const verify=$('cloudVerify');verify.style.display='none';verify.textContent='';
  });
 }catch(e){message('cloudConfigHint','เริ่ม Firebase ไม่สำเร็จ: '+e.message,'bad');cloudNotice('เชื่อมต่อ Firebase ไม่สำเร็จ: '+e.message,'bad')}
}
async function cloudCheck(){
 const target=$('cloudVerify');target.style.display='block';
 if(cloudBusy){message('cloudVerify','มีการซิงก์ข้อมูลอยู่ กรุณาตรวจสอบอีกครั้งหลังเสร็จ','warn');return}
 cloudBusy=true;
 try{
  const base=cloudBase();
  message('cloudVerify','กำลังอ่านข้อมูลจากเซิร์ฟเวอร์ Firebase...','info');
  // Use server-side counts to avoid treating the local Firestore cache as a verified upload.
  const [ps,rs]=await Promise.all([
   base.collection('projects').get({source:'server'}),
   base.collection('inspections').get({source:'server'})
  ]);
  message('cloudVerify',
   '✅ อ่าน Firestore จากเซิร์ฟเวอร์สำเร็จ\n'+
   'โปรเจกต์ Firebase: '+FIREBASE_CONFIG.projectId+'\n'+
   'บัญชี: '+(cloudAuth.currentUser?.email||'(ไม่พบอีเมล)')+'\n'+
   'เส้นทาง: users / '+base.id+'\n'+
   'โครงการบน Cloud: '+ps.size+'\n'+
   'ประวัติบน Cloud: '+rs.size+'\n'+
   'โครงการในเครื่อง (ไม่รวม legacy): '+projects.filter(p=>p.id!=='legacy').length+'\n'+
   'ประวัติในเครื่อง: '+records.length+'\n'+
   'หมายเหตุ: ระบบ V4 นี้ยังส่งข้อมูลขึ้น Cloud เมื่อกดปุ่มซิงก์เท่านั้น และไม่อัปโหลดรูปภาพ',
   'good');
 }catch(e){message('cloudVerify','❌ ยังตรวจสอบ Firestore บนเซิร์ฟเวอร์ไม่ได้: '+e.message+'\nตรวจสอบอินเทอร์เน็ต บัญชี และ Firestore Rules','bad')}
 finally{cloudBusy=false}
}
async function cloudSignIn(){
 if(!cloudAuth){alert('ต้องตั้งค่า Firebase ก่อน');return}
 try{await cloudAuth.signInWithEmailAndPassword($('cloudEmail').value.trim(),$('cloudPassword').value)}
 catch(e){cloudNotice('เข้าสู่ระบบไม่สำเร็จ: '+e.message,'bad')}
}
async function cloudRegister(){
 if(!cloudAuth){alert('ต้องตั้งค่า Firebase ก่อน');return}
 if(!confirm('สร้างบัญชีใหม่ด้วยอีเมลที่ระบุ?'))return;
 try{await cloudAuth.createUserWithEmailAndPassword($('cloudEmail').value.trim(),$('cloudPassword').value)}
 catch(e){cloudNotice('สมัครบัญชีไม่สำเร็จ: '+e.message,'bad')}
}
async function cloudSignOut(){if(cloudAuth)await cloudAuth.signOut()}
function cloudBase(){
 const u=cloudAuth?.currentUser;
 if(!u||!cloudDb)throw Error('กรุณาเข้าสู่ระบบ Firebase ก่อน');
 return cloudDb.collection('users').doc(u.uid);
}
function cloudRecord(r){
 // Do not upload image data: Firestore document max size is 1 MiB.
 const {image,...rest}=r;
 return JSON.parse(JSON.stringify({...rest,imageInCloud:false,cloudUpdatedAt:new Date().toISOString()}));
}
async function cloudUpload(){
 if(cloudBusy)return;
 cloudBusy=true;
 try{
  const base=cloudBase();cloudNotice('กำลังส่งข้อมูลสำรวจและโครงการ...');
  const ps=projects.filter(p=>p.id!=='legacy');
  // Sequential batches keep under the Firestore 500 writes/batch ceiling.
  const items=[...ps.map(p=>({col:'projects',id:p.id,data:p})),...records.map(r=>({col:'inspections',id:r.id,data:cloudRecord(r)})),...window.V5.cloudPoleItems()];
  for(let i=0;i<items.length;i+=400){
   const batch=cloudDb.batch();
   for(const item of items.slice(i,i+400))batch.set(base.collection(item.col).doc(item.id),item.data);
   await batch.commit();
  }
  cloudNotice('ส่งขึ้น Firestore สำเร็จ '+ps.length+' โครงการ, '+records.length+' รายการ และ '+window.V5.cloudPoleItems().length+' เสา (ไม่รวมภาพ) — กดตรวจสอบข้อมูลบน Firebase เพื่อยืนยันจำนวนบนเซิร์ฟเวอร์','good');
 }catch(e){cloudNotice('อัปโหลดไม่สำเร็จ: '+e.message,'bad')}
 finally{cloudBusy=false}
}
async function cloudDownload(){
 if(cloudBusy)return;
 cloudBusy=true;
 try{
  if(storageMode==='none')throw Error('เบราว์เซอร์ไม่รองรับการจัดเก็บในเครื่อง');
  const base=cloudBase();cloudNotice('กำลังดึงรายการจาก Cloud...');
  const [pSnap,rSnap,polesSnap]=await Promise.all([base.collection('projects').get(),base.collection('inspections').get(),base.collection('poles').get()]);
  const incomingProjects=pSnap.docs.map(d=>d.data()).filter(p=>p.id&&p.name&&p.office);
  const newPs=incomingProjects.filter(p=>!projects.some(local=>local.id===p.id));
  const imported=rSnap.docs.map(d=>d.data()).filter(r=>r.id&&r.pole&&r.date);
  const newRs=imported.filter(r=>!records.some(local=>local.id===r.id));
  // Preserve local content, especially photographs.
  for(const r of newRs){
   const next={...r,image:r.image||'',imageInCloud:false};
   if(storageMode==='indexeddb')await idbPut(next);
   else{
    const array=getFallback();array.push(next);
    localStorage.setItem(FALLBACK,JSON.stringify(array));
   }
  }
  if(storageMode==='indexeddb')records=await idbGetAll();else records=getFallback();
  records.sort((a,b)=>new Date(b.date)-new Date(a.date));
  projects.push(...newPs);storeProjects();syncSelectors();refreshDashboard();updateCount();renderProjects();
  const addedPoles=window.V5.importCloudPoles(polesSnap.docs.map(d=>d.data()));
  cloudNotice('ดาวน์โหลดเพิ่ม '+newPs.length+' โครงการ, '+newRs.length+' รายการ และ '+addedPoles+' เสา (ภาพไม่รวมอยู่ใน Cloud)','good');
 }catch(e){cloudNotice('ดาวน์โหลดไม่สำเร็จ: '+e.message,'bad')}
 finally{cloudBusy=false}
}

