import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
let currentUser = null, isAdmin = false, tournaments = [], activeCategory = "All";
let stopTournaments = null, stopSettings = null, stopMine = null, stopResults = null;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateText = v => { try { return v?.toDate ? v.toDate().toLocaleString() : new Date(v).toLocaleString(); } catch { return "Date pending"; } };
function toast(msg){ $("toast").textContent=msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),2400); }
function msg(id,value){ $(id).textContent=value; }
function open(id){ $(id).showModal(); }
function close(id){ $(id).close(); }
function adminUser(user){ return !!user && user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(); }

document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>close(b.dataset.close)));
$("year").textContent = new Date().getFullYear();
$("menuToggle").onclick=()=>$("mainNav").classList.toggle("open");
document.querySelectorAll("#mainNav a").forEach(a=>a.addEventListener("click",()=>$("mainNav").classList.remove("open")));
$("loginOpen").onclick=()=>showAuth(false);
$("signupOpen").onclick=()=>showAuth(true);
$("heroSignup").onclick=()=>showAuth(true);
$("switchAuth").onclick=()=>showAuth($("authTitle").textContent==="Player Login");
$("logoutBtn").onclick=()=>signOut(auth);

function showAuth(signup){
  $("authTitle").textContent=signup?"Create Player Account":"Player Login";
  $("authSubmit").textContent=signup?"Create Account":"Login";
  $("nameWrap").classList.toggle("hidden",!signup); $("ffWrap").classList.toggle("hidden",!signup); $("phoneWrap").classList.toggle("hidden",!signup);
  $("authPassword").autocomplete=signup?"new-password":"current-password";
  $("switchAuth").textContent=signup?"Already have an account? Login":"Create a new account";
  msg("authMessage",""); open("authDialog");
}
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault(); const signup=$("authTitle").textContent!=="Player Login";
  const email=$("authEmail").value.trim().toLowerCase(), password=$("authPassword").value, btn=$("authSubmit");
  btn.disabled=true;
  try{
    if(signup){
      const name=$("authName").value.trim(), ffUID=$("authFFUID").value.trim(), phone=$("authPhone").value.trim();
      if(!name||!ffUID||!phone) throw Error("সব Player তথ্য পূরণ করো।");
      const cred=await createUserWithEmailAndPassword(auth,email,password);
      await setDoc(doc(db,"users",cred.user.uid),{uid:cred.user.uid,email,name,ffUID,phone,createdAt:serverTimestamp()});
      await sendEmailVerification(cred.user);
      msg("authMessage","Account তৈরি হয়েছে। Email verification link পাঠানো হয়েছে।");
      toast("Email verify করে আবার login করো।");
      await signOut(auth); return;
    }
    const cred=await signInWithEmailAndPassword(auth,email,password);
    await cred.user.reload();
    if(email===ADMIN_EMAIL && !cred.user.emailVerified){await signOut(auth);throw Error("Admin access-এর আগে email verify করতে হবে।");}
    close("authDialog"); toast("Login successful.");
  }catch(err){msg("authMessage",err.message||"Authentication failed.");}
  finally{btn.disabled=false;}
});

onAuthStateChanged(auth,async user=>{
  currentUser=user; isAdmin=adminUser(user);
  $("loginOpen").classList.toggle("hidden",!!user);
  $("signupOpen").classList.toggle("hidden",!!user);
  $("logoutBtn").classList.toggle("hidden",!user);
  $("adminSection").classList.toggle("hidden",!isAdmin);
  $("signedOutMatches").classList.toggle("hidden",!!user);
  $("myTournaments").classList.toggle("hidden",!user);
  if(stopMine){stopMine();stopMine=null;}
  if(user) loadMyEntries(); else $("myTournaments").innerHTML="";
  if(isAdmin){loadAdminPlayers();renderAdminTournaments();loadAdminEntries();loadAdminResults();}
});

function watchTournaments(){
  stopTournaments=onSnapshot(query(collection(db,"tournaments"),orderBy("createdAt","desc")),snap=>{
    tournaments=snap.docs.map(d=>({id:d.id,...d.data()})); renderTournaments();
    if(isAdmin){renderAdminTournaments();fillResultTournamentOptions();}
  },err=>{$("tournamentGrid").innerHTML='<div class="empty-state">Tournament load হয়নি। Firestore Rules দেখো।</div>';console.error(err);});
}
watchTournaments();

function renderTournaments(){
  const list=tournaments.filter(t=>activeCategory==="All"||t.mode===activeCategory);
  if(!list.length){$("tournamentGrid").innerHTML='<div class="empty-state">এখন কোনো Tournament নেই। পরে আবার দেখো।</div>';return;}
  $("tournamentGrid").innerHTML=list.map(t=>`
    <article class="tournament-card">
      <div class="tournament-banner" style="${t.imageUrl?`background-image:linear-gradient(#07132666,#07132699),url('${esc(t.imageUrl)}')`:""}">${t.imageUrl?"":esc(t.mode||"BR")}</div>
      <div class="tournament-content"><h3>${esc(t.name)}</h3><p>${esc(t.description||"Join the battle and play fair.")}</p>
      <div class="meta-grid">
        <div class="meta"><small>CATEGORY</small><b>${esc(t.mode||"BR")}</b></div>
        <div class="meta"><small>ENTRY</small><b>FREE</b></div>
        <div class="meta"><small>PRIZE INFO</small><b>${esc(t.prizeInfo||"—")}</b></div>
        <div class="meta"><small>MATCH TIME</small><b>${esc(t.matchTime||"To be announced")}</b></div>
        <div class="meta"><small>SLOTS</small><b>${Number(t.slots||0)}</b></div>
        <div class="meta"><small>STATUS</small><b>${t.status==="open"?"Open":"Closed"}</b></div>
      </div>
      <button class="btn btn-primary full-width" data-join="${esc(t.id)}" ${t.status!=="open"?"disabled":""}>${t.status==="open"?"REQUEST TO JOIN":"CLOSED"}</button></div>
    </article>`).join("");
  document.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>joinTournament(b.dataset.join));
}
document.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>{
  activeCategory=b.dataset.category;
  document.querySelectorAll("[data-category]").forEach(x=>x.classList.toggle("active",x===b));
  renderTournaments();
});

async function joinTournament(id){
  if(!currentUser){showAuth(false);return;}
  if(!currentUser.emailVerified){toast("আগে email verify করে আবার login করো।");return;}
  const t=tournaments.find(x=>x.id===id); if(!t||t.status!=="open")return;
  if(t.entryFee!==0 && t.entryFee!==undefined){toast("এই ওয়েবসাইটে শুধু free entry চালু আছে।");return;}
  $("joinTournamentId").value=id; $("joinTitle").textContent=t.name;
  $("joinDetails").textContent=`${t.mode} • FREE ENTRY • ${t.matchTime||"Time pending"}`;
  msg("joinMessage","");
  try{const p=await getDoc(doc(db,"users",currentUser.uid));const d=p.data()||{};
    $("joinPlayerName").value=d.name||"";$("joinFFUID").value=d.ffUID||"";$("joinContact").value=d.phone||"";
  }catch{}
  open("joinDialog");
}
$("joinForm").onsubmit=async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{
    const tournamentId=$("joinTournamentId").value;
    const t=tournaments.find(x=>x.id===tournamentId); if(!t||t.status!=="open")throw Error("Tournament বন্ধ হয়ে গেছে।");
    const existing=await getDocs(query(collection(db,"registrations"),where("playerUid","==",currentUser.uid),where("tournamentId","==",tournamentId),limit(1)));
    if(!existing.empty)throw Error("তুমি ইতিমধ্যে request পাঠিয়েছ।");
    await addDoc(collection(db,"registrations"),{
      playerUid:currentUser.uid,email:currentUser.email,tournamentId,tournamentName:t.name,mode:t.mode,
      playerName:$("joinPlayerName").value.trim(),ffUID:$("joinFFUID").value.trim(),contact:$("joinContact").value.trim(),
      status:"Pending",createdAt:serverTimestamp()
    });
    msg("joinMessage","Join request পাঠানো হয়েছে। Admin approve করলে confirm হবে।");
    toast("Request submitted."); setTimeout(()=>close("joinDialog"),1300);
  }catch(err){msg("joinMessage",err.message||"Request পাঠানো যায়নি।");}
  finally{btn.disabled=false;}
};

function loadMyEntries(){
  stopMine=onSnapshot(query(collection(db,"registrations"),where("playerUid","==",currentUser.uid),orderBy("createdAt","desc")),async snap=>{
    if(snap.empty){$("myTournaments").innerHTML='<div class="empty-state">এখনো কোনো tournament request নেই।</div>';return;}
    const rows=[];
    for(const d of snap.docs){
      const x=d.data();let room="";
      if(x.status==="Approved"){
        room=`<small>Room ID: ${esc(x.roomId||"Not published")} • Password: ${esc(x.roomPassword||"Not published")}</small>`;
        if(x.whatsapp)room+=`<small><a target="_blank" rel="noopener" href="${esc(x.whatsapp)}">WhatsApp Group</a></small>`;
        if(x.telegram)room+=`<small><a target="_blank" rel="noopener" href="${esc(x.telegram)}">Telegram Group</a></small>`;
      }
      rows.push(`<div class="list-row"><div><b>${esc(x.tournamentName)}</b><small>${esc(x.playerName)} • ${dateText(x.createdAt)}</small>${room}</div><span class="status ${x.status==="Approved"?"approved":x.status==="Rejected"?"rejected":""}">${esc(x.status||"Pending")}</span></div>`);
    }
    $("myTournaments").innerHTML=rows.join("");
  },err=>{console.error(err);$("myTournaments").textContent="My matches load হয়নি।";});
}

function loadResults(){
  stopResults=onSnapshot(query(collection(db,"results"),orderBy("publishedAt","desc")),snap=>{
    $("resultsList").innerHTML=snap.empty?'<div class="empty-state">No results published yet.</div>':snap.docs.map(d=>{
      const x=d.data();return `<div class="list-row"><div><b>${esc(x.tournamentName||"Tournament")}</b><small>Winner: ${esc(x.winner)} • ${esc(x.position||"")}</small><small>${esc(x.note||"")} • ${dateText(x.publishedAt)}</small></div><span class="status approved">Published</span></div>`;
    }).join("");
  },err=>console.error(err));
}
loadResults();

function renderAdminTournaments(){
  if(!isAdmin)return;
  $("adminTournamentList").innerHTML=tournaments.map(t=>`<div class="list-row"><div><b>${esc(t.name)}</b><small>${esc(t.mode)} • FREE • ${esc(t.matchTime||"")}</small></div><div class="admin-inline"><button class="small-btn" data-edit="${esc(t.id)}">Edit</button><button class="small-btn" data-match="${esc(t.id)}">Room details</button><button class="small-btn danger" data-delete="${esc(t.id)}">Delete</button></div></div>`).join("")||"No tournaments yet.";
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editTournament(b.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteTournament(b.dataset.delete));
  document.querySelectorAll("[data-match]").forEach(b=>b.onclick=()=>editMatchDetails(b.dataset.match));
}
function editTournament(id){
  const t=tournaments.find(x=>x.id===id);if(!t)return;
  $("tournamentId").value=id;$("tName").value=t.name||"";$("tMode").value=t.mode||"BR";
  $("tPrize").value=t.prizeInfo||"";$("tTime").value=t.matchTimeInput||"";$("tSlots").value=t.slots||48;
  $("tImage").value=t.imageUrl||"";$("tDescription").value=t.description||"";
  $("tWhatsApp").value=t.whatsapp||"";$("tTelegram").value=t.telegram||"";$("tStatus").value=t.status||"open";
  $("tabTournament").scrollIntoView({behavior:"smooth"});
}
$("tReset").onclick=()=>{$("tournamentForm").reset();$("tournamentId").value="";};
$("tournamentForm").onsubmit=async e=>{
  e.preventDefault();if(!isAdmin)return;
  try{
    const id=$("tournamentId").value;
    const payload={name:$("tName").value.trim(),mode:$("tMode").value,entryFee:0,prizeInfo:$("tPrize").value.trim(),
      matchTime:$("tTime").value?new Date($("tTime").value).toLocaleString():"To be announced",matchTimeInput:$("tTime").value,
      slots:Number($("tSlots").value),imageUrl:$("tImage").value.trim(),description:$("tDescription").value.trim(),
      whatsapp:$("tWhatsApp").value.trim(),telegram:$("tTelegram").value.trim(),status:$("tStatus").value,updatedAt:serverTimestamp()};
    if(!payload.name||payload.slots<2)throw Error("Tournament তথ্য ঠিক করো।");
    if(id)await updateDoc(doc(db,"tournaments",id),payload);
    else await addDoc(collection(db,"tournaments"),{...payload,createdAt:serverTimestamp()});
    $("tournamentForm").reset();$("tournamentId").value="";toast("Tournament saved.");
  }catch(err){toast(err.message||"Save failed.");}
};
async function deleteTournament(id){
  if(!confirm("এই tournament delete করবে?"))return;
  try{await deleteDoc(doc(db,"tournaments",id));toast("Tournament deleted.");}catch(e){toast(e.message);}
}
async function editMatchDetails(id){
  const t=tournaments.find(x=>x.id===id);if(!t)return;
  const roomId=prompt("Room ID (approved players only দেখতে পাবে):");if(roomId===null)return;
  const roomPassword=prompt("Room password:");if(roomPassword===null)return;
  try{
    const snap=await getDocs(query(collection(db,"registrations"),where("tournamentId","==",id),where("status","==","Approved")));
    const updates=snap.docs.map(d=>updateDoc(doc(db,"registrations",d.id),{
      roomId:roomId.trim(),roomPassword:roomPassword.trim(),whatsapp:t.whatsapp||"",telegram:t.telegram||"",roomUpdatedAt:serverTimestamp()
    }));
    await Promise.all(updates);toast(`Approved players updated: ${updates.length}`);
  }catch(e){toast(e.message||"Room details save হয়নি।");}
}

function loadAdminEntries(){
  onSnapshot(query(collection(db,"registrations"),orderBy("createdAt","desc")),snap=>{
    $("adminEntries").innerHTML=snap.empty?"No join requests.":snap.docs.map(d=>{
      const x=d.data();return `<div class="list-row"><div><b>${esc(x.tournamentName)} • ${esc(x.playerName)}</b><small>${esc(x.email)} • FF UID: ${esc(x.ffUID)} • ${esc(x.contact)}</small><small>Status: ${esc(x.status)}</small></div><div class="admin-inline"><button class="small-btn" data-entry="${d.id}" data-state="Approved">Approve</button><button class="small-btn danger" data-entry="${d.id}" data-state="Rejected">Reject</button></div></div>`;
    }).join("");
    document.querySelectorAll("[data-entry]").forEach(b=>b.onclick=()=>reviewEntry(b.dataset.entry,b.dataset.state));
  },e=>{$("adminEntries").textContent="Requests load হয়নি।";console.error(e);});
}
async function reviewEntry(id,status){
  if(!isAdmin)return;if(!confirm(`${status} করবে?`))return;
  try{await updateDoc(doc(db,"registrations",id),{status,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});toast("Request updated.");}
  catch(e){toast(e.message||"Update failed.");}
}
function loadAdminPlayers(){
  onSnapshot(query(collection(db,"users"),orderBy("createdAt","desc"),limit(100)),snap=>{
    $("adminPlayers").innerHTML=snap.empty?"No players yet.":snap.docs.map(d=>{const x=d.data();return `<div class="list-row"><div><b>${esc(x.name||"Player")}</b><small>${esc(x.email)} • FF UID: ${esc(x.ffUID||"—")} • ${esc(x.phone||"")}</small></div></div>`;}).join("");
  },e=>{$("adminPlayers").textContent="Player list load হয়নি।";console.error(e);});
}

function fillResultTournamentOptions(){
  if(!$("rTournament"))return;
  const old=$("rTournament").value;
  $("rTournament").innerHTML=tournaments.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  if(old)$("rTournament").value=old;
}
function loadAdminResults(){
  onSnapshot(query(collection(db,"results"),orderBy("publishedAt","desc")),snap=>{
    $("adminResults").innerHTML=snap.empty?"No results yet.":snap.docs.map(d=>{const x=d.data();return `<div class="list-row"><div><b>${esc(x.tournamentName)}</b><small>${esc(x.winner)} • ${esc(x.position||"")}</small></div><div class="admin-inline"><button class="small-btn" data-result-edit="${d.id}">Edit</button><button class="small-btn danger" data-result-delete="${d.id}">Delete</button></div></div>`;}).join("");
    document.querySelectorAll("[data-result-edit]").forEach(b=>b.onclick=()=>editResult(b.dataset.resultEdit));
    document.querySelectorAll("[data-result-delete]").forEach(b=>b.onclick=()=>deleteResult(b.dataset.resultDelete));
  },e=>console.error(e));
}
$("resultForm").onsubmit=async e=>{
  e.preventDefault();if(!isAdmin)return;
  try{
    const tid=$("rTournament").value,t=tournaments.find(x=>x.id===tid);if(!t)throw Error("Tournament নির্বাচন করো।");
    const id=$("resultId").value,payload={tournamentId:tid,tournamentName:t.name,winner:$("rWinner").value.trim(),position:$("rPosition").value.trim(),note:$("rNote").value.trim(),updatedAt:serverTimestamp()};
    if(id)await updateDoc(doc(db,"results",id),payload);else await addDoc(collection(db,"results"),{...payload,publishedAt:serverTimestamp()});
    $("resultForm").reset();$("resultId").value="";toast("Result published.");
  }catch(err){toast(err.message||"Result save হয়নি।");}
};
async function editResult(id){
  const d=await getDoc(doc(db,"results",id));if(!d.exists())return;const x=d.data();
  $("resultId").value=id;$("rTournament").value=x.tournamentId||"";$("rWinner").value=x.winner||"";$("rPosition").value=x.position||"";$("rNote").value=x.note||"";
  $("tabResults").scrollIntoView({behavior:"smooth"});
}
async function deleteResult(id){
  if(!confirm("এই result delete করবে?"))return;
  try{await deleteDoc(doc(db,"results",id));toast("Result deleted.");}catch(e){toast(e.message);}
}
$("rReset").onclick=()=>{$("resultForm").reset();$("resultId").value="";};

function loadSettings(){
  if(stopSettings)stopSettings();
  stopSettings=onSnapshot(doc(db,"site_settings","public"),s=>{
    const d=s.data()||{};
    if(d.notice){$("noticeArea").classList.remove("hidden");$("noticeText").textContent=d.notice;}else $("noticeArea").classList.add("hidden");
    if(d.banner)$("home").style.backgroundImage=`linear-gradient(90deg,#080d1cf2,#080d1caa),url("${d.banner}")`;
    else $("home").style.backgroundImage="";
    $("contactDetails").innerHTML=[d.phone?`<a href="tel:${esc(d.phone)}">Phone: ${esc(d.phone)}</a>`:"",
      d.whatsapp?`<a target="_blank" rel="noopener" href="${esc(d.whatsapp)}">WhatsApp</a>`:"",
      d.facebook?`<a target="_blank" rel="noopener" href="${esc(d.facebook)}">Facebook</a>`:"",
      d.youtube?`<a target="_blank" rel="noopener" href="${esc(d.youtube)}">YouTube</a>`:""].filter(Boolean).join("")||"Contact information will be updated by admin.";
    if(isAdmin){$("sNotice").value=d.notice||"";$("sPhone").value=d.phone||"";$("sWhatsApp").value=d.whatsapp||"";$("sFacebook").value=d.facebook||"";$("sYoutube").value=d.youtube||"";$("sBanner").value=d.banner||"";}
  },e=>console.error(e));
}
loadSettings();
$("settingsForm").onsubmit=async e=>{
  e.preventDefault();if(!isAdmin)return;
  try{await setDoc(doc(db,"site_settings","public"),{notice:$("sNotice").value.trim(),phone:$("sPhone").value.trim(),whatsapp:$("sWhatsApp").value.trim(),facebook:$("sFacebook").value.trim(),youtube:$("sYoutube").value.trim(),banner:$("sBanner").value.trim(),updatedAt:serverTimestamp()},{merge:true});toast("Website settings saved.");}
  catch(err){toast(err.message||"Settings save failed.");}
};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  ["tabTournament","tabEntries","tabResults","tabPlayers","tabSettings"].forEach(id=>$(id).classList.toggle("hidden",id!==b.dataset.tab));
});
