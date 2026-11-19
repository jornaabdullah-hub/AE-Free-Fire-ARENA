import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, onIdTokenChanged, getIdToken, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
const C = {
  tournaments: "tournaments", users: "users", registrations: "registrations",
  results: "results", settings: "site_settings"
};
let currentUser = null, isAdmin = false, tournaments = [], activeCategory = "All";
let authIsSignup = false, adminLoginRequested = false;
let stops = { tournaments:null, settings:null, mine:null, results:null, adminEntries:null, adminPlayers:null, adminResults:null };
let toastTimer = null;

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const niceDate = value => {
  if (!value) return "To be announced";
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(d.getTime()) ? "To be announced" : d.toLocaleString();
  } catch { return "To be announced"; }
};
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2800);
}
function setMessage(id, message) { $(id).textContent = message; }
function showDialog(id) { const el=$(id); if (!el.open) el.showModal(); }
function closeDialog(id) { const el=$(id); if (el.open) el.close(); }
function isAdminUser(user) {
  return !!user && user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
function stopListener(key) {
  if (stops[key]) { stops[key](); stops[key] = null; }
}
function safeUrl(value) {
  try { const u=new URL(value); return ["https:","http:"].includes(u.protocol) ? u.href : ""; }
  catch { return ""; }
}

// Compress each uploaded image to keep the combined Firestore settings document below its 1 MiB limit.
function compressImageFile(file) {
  return new Promise((resolve,reject)=>{
    if(!file || !file.type.startsWith("image/")) return reject(new Error("একটি image file নির্বাচন করো।"));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("ছবি পড়া যায়নি। আবার চেষ্টা করো।"));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("ছবিটি খোলা যাচ্ছে না।"));
      img.onload=()=>{
        const maxW=480,maxH=320,scale=Math.min(1,maxW/img.width,maxH/img.height);
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
        let data=canvas.toDataURL("image/jpeg",0.48);
        if(data.length>76000) data=canvas.toDataURL("image/jpeg",0.32);
        if(data.length>80000) return reject(new Error("ছবিটি ছোট সাইজে নিয়ে আবার চেষ্টা করো।"));
        resolve(data);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
const pendingSiteImages={banner:null,allImage:null,brImage:null,csImage:null,lwImage:null,ltwImage:null,lwndImage:null,hpImage:null,freeImage:null};
const imagePickers=[
  ["sBannerFile","sBannerPreview","banner"],["sAllFile","sAllPreview","allImage"],
  ["sBRFile","sBRPreview","brImage"],["sCSFile","sCSPreview","csImage"],
  ["sLWFile","sLWPreview","lwImage"],["sLTWFile","sLTWPreview","ltwImage"],
  ["sLWNDFile","sLWNDPreview","lwndImage"],["s1HPFile","s1HPPreview","hpImage"],
  ["sFREEFile","sFREEPreview","freeImage"]
];
function setupImagePicker(inputId,previewId,key){
  $(inputId).addEventListener("change",async()=>{
    const file=$(inputId).files?.[0];if(!file)return;
    try{const data=await compressImageFile(file);pendingSiteImages[key]=data;$(previewId).src=data;$(previewId).classList.remove("hidden");}
    catch(error){pendingSiteImages[key]=null;$(inputId).value="";toast(error.message||"ছবি প্রস্তুত করা যায়নি।");}
  });
}
imagePickers.forEach(([inputId,previewId,key])=>setupImagePicker(inputId,previewId,key));

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => closeDialog(button.dataset.close));
});
$("year").textContent = new Date().getFullYear();
$("menuToggle").addEventListener("click", () => $("mainNav").classList.toggle("open"));
document.querySelectorAll("#mainNav a").forEach(a => a.addEventListener("click", () => $("mainNav").classList.remove("open")));
$("loginOpen").addEventListener("click", () => showAuth(false));
$("adminLoginOpen").addEventListener("click", () => {
  showAuth(false);
  adminLoginRequested = true;
  $("authTitle").textContent = "Admin Login";
  $("switchAuth").classList.add("hidden");
});
$("signupOpen").addEventListener("click", () => showAuth(true));
$("heroSignup").addEventListener("click", () => showAuth(true));
$("logoutBtn").addEventListener("click", async () => {
  try { await signOut(auth); toast("Logged out."); } catch (e) { toast(e.message); }
});
$("switchAuth").addEventListener("click", () => showAuth($("authTitle").textContent === "Player Login"));

function showAuth(signup) {
  authIsSignup = signup;
  adminLoginRequested = false;
  $("authTitle").textContent = signup ? "Create Player Account" : "Player Login";
  $("authSubmit").textContent = signup ? "Create Account" : "Login";
  ["nameWrap","ffWrap","phoneWrap"].forEach(id => $(id).classList.toggle("hidden", !signup));
  $("authPassword").autocomplete = signup ? "new-password" : "current-password";
  $("resendVerification").classList.toggle("hidden", signup);
  $("switchAuth").classList.remove("hidden");
  $("switchAuth").textContent = signup ? "Already have an account? Login" : "Create a new account";
  setMessage("authMessage", "");
  showDialog("authDialog");
}

$("resendVerification").addEventListener("click", async () => {
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  if (!email || !password) {
    setMessage("authMessage", "আগে Email ও Password লিখে তারপর Verify Email পাঠাও।");
    return;
  }
  const button = $("resendVerification");
  button.disabled = true;
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await credential.user.reload();
    if (credential.user.emailVerified) {
      setMessage("authMessage", "এই Email আগেই Verify করা হয়েছে। এখন Login করো।");
    } else {
      await sendEmailVerification(credential.user);
      setMessage("authMessage", "নতুন Verification Email পাঠানো হয়েছে। Gmail Inbox বা Spam দেখো।");
    }
    await signOut(auth);
  } catch (error) {
    setMessage("authMessage", error.code === "auth/too-many-requests"
      ? "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।"
      : (error.message || "Verification Email পাঠানো যায়নি।"));
  } finally {
    button.disabled = false;
  }
});

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const signup = authIsSignup;
  const button = $("authSubmit");
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  button.disabled = true;
  try {
    if (signup) {
      const name=$("authName").value.trim(), ffUID=$("authFFUID").value.trim(), phone=$("authPhone").value.trim();
      if (!name || !ffUID || !phone) throw new Error("সব Player তথ্য পূরণ করো।");
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, C.users, credential.user.uid), {
        uid:credential.user.uid, email, name, ffUID, phone, createdAt:serverTimestamp()
      });
      await sendEmailVerification(credential.user);
      await signOut(auth);
      setMessage("authMessage", "Account তৈরি হয়েছে। Email-এর verification link খুলে তারপর Login করো।");
      toast("Verification email পাঠানো হয়েছে।");
    } else {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await credential.user.reload();
      await getIdToken(credential.user, true);
      if (!credential.user.emailVerified) {
        // Send a fresh verification email whenever an unverified user tries to log in.
        try {
          await sendEmailVerification(credential.user);
        } catch (verificationError) {
          await signOut(auth);
          if (verificationError.code === "auth/too-many-requests") {
            throw new Error("অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার Login করে Verify Email পাঠাও।");
          }
          throw new Error("Verification email পাঠানো যায়নি: " + (verificationError.message || "আবার চেষ্টা করো।"));
        }
        await signOut(auth);
        throw new Error("তোমার Gmail-এ নতুন Verify Email পাঠানো হয়েছে। Inbox বা Spam থেকে Verify করে আবার Login করো।");
      }
      if (adminLoginRequested && !isAdminUser(credential.user)) {
        await signOut(auth);
        throw new Error("এই account-টি Admin account নয়। Admin email দিয়ে Login করো।");
      }
      closeDialog("authDialog");
      toast(adminLoginRequested ? "Admin login successful." : "Login successful.");
    }
  } catch (error) {
    setMessage("authMessage", error.message || "Authentication failed.");
  } finally { button.disabled=false; }
});

onIdTokenChanged(auth, async user => {
  currentUser = user;
  isAdmin = isAdminUser(user);
  $("loginOpen").classList.toggle("hidden", !!user);
  $("adminLoginOpen").classList.toggle("hidden", !!user);
  $("signupOpen").classList.toggle("hidden", !!user);
  $("logoutBtn").classList.toggle("hidden", !user);
  $("adminSection").classList.toggle("hidden", !isAdmin);
  $("signedOutMatches").classList.toggle("hidden", !!user);
  $("playerArea").classList.toggle("hidden", !user);
  stopListener("mine");
  stopListener("adminEntries"); stopListener("adminPlayers"); stopListener("adminResults");
  if (user) {
    await loadPlayerProfile(user);
    loadMyEntries(user);
  } else {
    $("myTournaments").innerHTML = "";
    $("playerName").textContent = "Player";
    $("playerEmail").textContent = "";
    $("playerFFUID").textContent = "";
  }
  if (isAdmin) {
    loadAdminEntries(); loadAdminPlayers(); loadAdminResults();
    renderAdminTournaments(); fillResultTournamentOptions(); loadSettings();
  }
});

async function loadPlayerProfile(user) {
  try {
    const snapshot = await getDoc(doc(db, C.users, user.uid));
    const profile = snapshot.exists() ? snapshot.data() : {};
    $("playerName").textContent = profile.name || user.displayName || "Player";
    $("playerEmail").textContent = user.email || "";
    $("playerFFUID").textContent = profile.ffUID ? `Free Fire UID: ${profile.ffUID}` : "";
  } catch (error) { console.error("Profile load:", error); }
}

function watchTournaments() {
  stopListener("tournaments");
  const q = query(collection(db, C.tournaments), orderBy("createdAt", "desc"));
  stops.tournaments = onSnapshot(q, snapshot => {
    tournaments = snapshot.docs.map(d => ({ id:d.id, ...d.data() }));
    renderTournaments();
    if (isAdmin) { renderAdminTournaments(); fillResultTournamentOptions(); }
  }, error => {
    console.error("Tournament listener:", error);
    $("tournamentGrid").innerHTML = '<div class="panel empty-state">Tournament load হয়নি। Firebase Rules ও Console error পরীক্ষা করো।</div>';
  });
}
watchTournaments();

function updateCategoryCounts() {
  const counts = { All:tournaments.length };
  tournaments.forEach(t => counts[t.mode]=(counts[t.mode]||0)+1);
  $("countAll").textContent = `${counts.All||0} matches`;
  ["BR","CS","LW","LTW","LWND","1HP","FREE"].forEach(mode => {
    const node=$("count"+mode);
    if (node) node.textContent = `${counts[mode]||0} matches`;
  });
}
function renderTournaments() {
  updateCategoryCounts();
  const labels = {All:"ALL TOURNAMENTS",BR:"BR MATCHES",CS:"CLASH SQUAD",LW:"LONE WOLF",LTW:"LOSE TO WIN",LWND:"LW NO DAMAGE","1HP":"1 HP MODE",FREE:"FREE MATCHES"};
  $("selectedCategoryTitle").textContent = labels[activeCategory] || "ALL TOURNAMENTS";
  const list=tournaments.filter(t => activeCategory==="All" || t.mode===activeCategory);
  if (!list.length) {
    $("tournamentGrid").innerHTML='<div class="panel empty-state">এখন কোনো Tournament নেই। Admin নতুন Tournament তৈরি করলে এখানে দেখা যাবে।</div>';
    return;
  }
  $("tournamentGrid").innerHTML = list.map(t => {
    const image=safeUrl(t.imageUrl);
    return `<article class="tournament-card">
      <div class="tournament-banner" ${image?`style="background-image:linear-gradient(#07132666,#07132699),url('${esc(image)}')"`:""}>${image?"":esc(t.mode||"BR")}</div>
      <div class="tournament-content"><h3>${esc(t.name||"Tournament")}</h3>
      <p>${esc(t.description||"Join the battle and play fair.")}</p>
      <div class="meta-grid">
        <div class="meta"><small>CATEGORY</small><b>${esc(t.mode||"BR")}</b></div>
        <div class="meta"><small>ENTRY</small><b>FREE</b></div>
        <div class="meta"><small>REWARD INFO</small><b>${esc(t.prizeInfo||"—")}</b></div>
        <div class="meta"><small>MATCH TIME</small><b>${esc(t.matchTime||"To be announced")}</b></div>
        <div class="meta"><small>SLOTS</small><b>${Number(t.slots||0)}</b></div>
        <div class="meta"><small>STATUS</small><b>${t.status==="open"?"Open":"Closed"}</b></div>
      </div>
      <button class="btn btn-primary full-width" data-join="${esc(t.id)}" ${t.status!=="open"?"disabled":""}>${t.status==="open"?"REQUEST TO JOIN":"CLOSED"}</button></div>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-join]").forEach(button => button.addEventListener("click", () => joinTournament(button.dataset.join)));
}
document.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => {
  activeCategory=button.dataset.category;
  document.querySelectorAll("[data-category]").forEach(item => item.classList.toggle("active", item===button));
  renderTournaments();
}));
$("showAllMatches").addEventListener("click", () => {
  activeCategory="All";
  document.querySelectorAll("[data-category]").forEach(item => item.classList.toggle("active", item.dataset.category==="All"));
  renderTournaments();
});

async function joinTournament(id) {
  if (!currentUser) { showAuth(false); return; }
  if (!currentUser.emailVerified) { toast("আগে email verify করো।"); return; }
  const tournament=tournaments.find(item => item.id===id);
  if (!tournament || tournament.status!=="open") { toast("এই Tournament এখন Join করা যাচ্ছে না।"); return; }
  if (tournament.entryFee !== 0) { toast("এই সাইটে শুধু free entry চালু আছে।"); return; }
  $("joinTournamentId").value=id;
  $("joinTitle").textContent=tournament.name || "Join tournament";
  $("joinDetails").textContent=`${tournament.mode||"BR"} • FREE ENTRY • ${tournament.matchTime||"Time pending"}`;
  setMessage("joinMessage", "");
  try {
    const profile=await getDoc(doc(db,C.users,currentUser.uid));
    const data=profile.exists()?profile.data():{};
    $("joinPlayerName").value=data.name||"";
    $("joinFFUID").value=data.ffUID||"";
    $("joinContact").value=data.phone||"";
  } catch (error) { console.warn("Player details unavailable:",error); }
  showDialog("joinDialog");
}

$("joinForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button=event.submitter;
  button.disabled=true;
  try {
    if (!currentUser || !currentUser.emailVerified) throw new Error("Login করে verified email ব্যবহার করো।");
    const tournamentId=$("joinTournamentId").value;
    const tournament=tournaments.find(item=>item.id===tournamentId);
    if (!tournament || tournament.status!=="open" || tournament.entryFee!==0) throw new Error("Tournament বন্ধ বা unavailable।");
    const ownRequests=await getDocs(query(collection(db,C.registrations),where("playerUid","==",currentUser.uid)));
    const duplicate=ownRequests.docs.some(d=>d.data().tournamentId===tournamentId);
    if (duplicate) throw new Error("এই Tournament-এ তোমার request আগেই আছে।");
    await addDoc(collection(db,C.registrations), {
      playerUid:currentUser.uid,email:currentUser.email,tournamentId,
      tournamentName:tournament.name||"Tournament",mode:tournament.mode||"BR",
      playerName:$("joinPlayerName").value.trim(),ffUID:$("joinFFUID").value.trim(),
      contact:$("joinContact").value.trim(),status:"Pending",createdAt:serverTimestamp()
    });
    setMessage("joinMessage","Join request পাঠানো হয়েছে। Admin review করবে।");
    toast("Free join request submitted.");
    setTimeout(()=>closeDialog("joinDialog"),1100);
  } catch (error) { setMessage("joinMessage",error.message||"Request পাঠানো যায়নি।"); }
  finally { button.disabled=false; }
});

function loadMyEntries(user) {
  stopListener("mine");
  const q=query(collection(db,C.registrations),where("playerUid","==",user.uid));
  stops.mine=onSnapshot(q,snapshot=>{
    if (snapshot.empty) { $("myTournaments").innerHTML='<div class="empty-state">এখনও কোনো tournament request নেই।</div>'; return; }
    const entries=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    $("myTournaments").innerHTML=entries.map(entry=>{
      const state=(entry.status||"Pending").toLowerCase();
      const room=entry.status==="Approved" && (entry.roomId||entry.roomPassword);
      const roomHtml=room?`<div class="room-info">Room ID: ${esc(entry.roomId||"Not shared")}<br>Room Password: ${esc(entry.roomPassword||"Not shared")}</div>`:"";
      const links=[entry.whatsapp?`<a target="_blank" rel="noopener" href="${esc(safeUrl(entry.whatsapp))}">WhatsApp group</a>`:"",entry.telegram?`<a target="_blank" rel="noopener" href="${esc(safeUrl(entry.telegram))}">Telegram group</a>`:""].filter(Boolean).join(" · ");
      return `<div class="list-row"><div><b>${esc(entry.tournamentName||"Tournament")}</b><small>${esc(entry.mode||"")} • Requested: ${esc(niceDate(entry.createdAt))}</small>${roomHtml}${links?`<small>${links}</small>`:""}</div><span class="status ${state}">${esc(entry.status||"Pending")}</span></div>`;
    }).join("");
  },error=>{console.error("My entries:",error);$("myTournaments").textContent="Entries load হয়নি।";});
}

function renderAdminTournaments() {
  if (!isAdmin) return;
  if (!tournaments.length) { $("adminTournamentList").innerHTML='<div class="empty-state">No tournaments created yet.</div>'; return; }
  $("adminTournamentList").innerHTML=tournaments.map(t=>`<div class="list-row"><div><b>${esc(t.name)}</b><small>${esc(t.mode)} • FREE • ${esc(t.status)}</small></div><div class="admin-inline"><button class="small-btn" data-edit-tournament="${esc(t.id)}" type="button">Edit</button><button class="small-btn danger" data-delete-tournament="${esc(t.id)}" type="button">Delete</button><button class="small-btn" data-room-tournament="${esc(t.id)}" type="button">Share Room</button></div></div>`).join("");
  document.querySelectorAll("[data-edit-tournament]").forEach(b=>b.onclick=()=>editTournament(b.dataset.editTournament));
  document.querySelectorAll("[data-delete-tournament]").forEach(b=>b.onclick=()=>deleteTournament(b.dataset.deleteTournament));
  document.querySelectorAll("[data-room-tournament]").forEach(b=>b.onclick=()=>shareRoomDetails(b.dataset.roomTournament));
}
function editTournament(id) {
  const t=tournaments.find(item=>item.id===id); if(!t)return;
  $("tournamentId").value=id;$("tName").value=t.name||"";$("tMode").value=t.mode||"BR";
  $("tFee").value="0";$("tPrize").value=t.prizeInfo||"";$("tTime").value=t.matchTimeInput||"";
  $("tSlots").value=t.slots||48;$("tImage").value=t.imageUrl||"";$("tDescription").value=t.description||"";
  $("tWhatsApp").value=t.whatsapp||"";$("tTelegram").value=t.telegram||"";$("tStatus").value=t.status||"open";
  $("tabTournament").scrollIntoView({behavior:"smooth"});
}
$("tReset").addEventListener("click",()=>{$("tournamentForm").reset();$("tournamentId").value="";$("tFee").value="0";});
$("tournamentForm").addEventListener("submit",async event=>{
  event.preventDefault(); if(!isAdmin)return;
  try {
    const id=$("tournamentId").value;
    const matchTimeInput=$("tTime").value;
    const payload={
      name:$("tName").value.trim(),mode:$("tMode").value,entryFee:0,
      prizeInfo:$("tPrize").value.trim(),matchTime:matchTimeInput?new Date(matchTimeInput).toLocaleString():"To be announced",
      matchTimeInput,slots:Number($("tSlots").value),imageUrl:$("tImage").value.trim(),
      description:$("tDescription").value.trim(),whatsapp:$("tWhatsApp").value.trim(),
      telegram:$("tTelegram").value.trim(),status:$("tStatus").value,updatedAt:serverTimestamp()
    };
    if(!payload.name||payload.slots<2||payload.slots>1000)throw new Error("Tournament তথ্য ঠিকভাবে পূরণ করো।");
    if(id) await updateDoc(doc(db,C.tournaments,id),payload);
    else await addDoc(collection(db,C.tournaments),{...payload,createdAt:serverTimestamp()});
    $("tournamentForm").reset();$("tournamentId").value="";$("tFee").value="0";toast("Tournament saved.");
  } catch(error) { toast(error.message||"Tournament save failed."); }
});
async function deleteTournament(id) {
  if(!isAdmin||!confirm("এই Tournament delete করবে?"))return;
  try { await deleteDoc(doc(db,C.tournaments,id));toast("Tournament deleted."); }
  catch(error) { toast(error.message||"Delete failed."); }
}
async function shareRoomDetails(tournamentId) {
  if(!isAdmin)return;
  const roomId=prompt("Room ID লিখো (শুধু approved players দেখতে পাবে):");if(roomId===null)return;
  const roomPassword=prompt("Room password লিখো:");if(roomPassword===null)return;
  try {
    const q=query(collection(db,C.registrations),where("tournamentId","==",tournamentId));
    const snapshot=await getDocs(q);
    const approved=snapshot.docs.filter(d=>d.data().status==="Approved");
    await Promise.all(approved.map(d=>updateDoc(doc(db,C.registrations,d.id),{
      roomId:roomId.trim(),roomPassword:roomPassword.trim(),roomUpdatedAt:serverTimestamp()
    })));
    toast(`Approved players updated: ${approved.length}`);
  } catch(error) { toast(error.message||"Room details update failed."); }
}

function loadAdminEntries() {
  stopListener("adminEntries");
  const q=query(collection(db,C.registrations),orderBy("createdAt","desc"));
  stops.adminEntries=onSnapshot(q,snapshot=>{
    if(snapshot.empty){$("adminEntries").innerHTML='<div class="empty-state">No join requests.</div>';return;}
    $("adminEntries").innerHTML=snapshot.docs.map(d=>{
      const x=d.data();
      return `<div class="list-row"><div><b>${esc(x.tournamentName)} • ${esc(x.playerName)}</b><small>${esc(x.email)} • FF UID: ${esc(x.ffUID)} • Contact: ${esc(x.contact)}</small><small>Status: ${esc(x.status)}</small></div><div class="admin-inline">${x.status==="Pending"?`<button class="small-btn" data-review="${esc(d.id)}" data-state="Approved" type="button">Approve</button><button class="small-btn danger" data-review="${esc(d.id)}" data-state="Rejected" type="button">Reject</button>`:`<span class="status ${(x.status||"").toLowerCase()}">${esc(x.status)}</span>`}</div></div>`;
    }).join("");
    document.querySelectorAll("[data-review]").forEach(b=>b.onclick=()=>reviewEntry(b.dataset.review,b.dataset.state));
  },error=>{$("adminEntries").textContent="Requests load হয়নি: "+error.message;console.error(error);});
}
async function reviewEntry(id,status) {
  if(!isAdmin||!confirm(`${status} করবে?`))return;
  try { await updateDoc(doc(db,C.registrations,id),{status,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});toast("Request updated."); }
  catch(error) { toast(error.message||"Request update failed."); }
}

function loadAdminPlayers() {
  stopListener("adminPlayers");
  const q=query(collection(db,C.users),orderBy("createdAt","desc"),limit(100));
  stops.adminPlayers=onSnapshot(q,snapshot=>{
    $("adminPlayers").innerHTML=snapshot.empty?'<div class="empty-state">No players yet.</div>':snapshot.docs.map(d=>{
      const x=d.data();return `<div class="list-row"><div><b>${esc(x.name||"Player")}</b><small>${esc(x.email)} • FF UID: ${esc(x.ffUID||"—")} • ${esc(x.phone||"")}</small></div></div>`;
    }).join("");
  },error=>{$("adminPlayers").textContent="Player list load হয়নি: "+error.message;console.error(error);});
}

function fillResultTournamentOptions() {
  const select=$("rTournament"), previous=select.value;
  select.innerHTML=tournaments.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  if(previous)select.value=previous;
}
function loadAdminResults() {
  stopListener("adminResults");
  const q=query(collection(db,C.results),orderBy("publishedAt","desc"));
  stops.adminResults=onSnapshot(q,snapshot=>{
    $("adminResults").innerHTML=snapshot.empty?'<div class="empty-state">No results published yet.</div>':snapshot.docs.map(d=>{
      const x=d.data();return `<div class="list-row"><div><b>${esc(x.tournamentName)}</b><small>${esc(x.winner)} • ${esc(x.position||"")}</small></div><div class="admin-inline"><button class="small-btn" data-edit-result="${esc(d.id)}" type="button">Edit</button><button class="small-btn danger" data-delete-result="${esc(d.id)}" type="button">Delete</button></div></div>`;
    }).join("");
    document.querySelectorAll("[data-edit-result]").forEach(b=>b.onclick=()=>editResult(b.dataset.editResult));
    document.querySelectorAll("[data-delete-result]").forEach(b=>b.onclick=()=>deleteResult(b.dataset.deleteResult));
  },error=>{console.error("Admin results:",error);});
}
function watchPublicResults() {
  stopListener("results");
  stops.results=onSnapshot(query(collection(db,C.results),orderBy("publishedAt","desc")),snapshot=>{
    $("resultsList").innerHTML=snapshot.empty?'<div class="panel muted-panel">Results will be published here by admin.</div>':snapshot.docs.map(d=>{
      const x=d.data();return `<article class="list-row"><div><b>${esc(x.tournamentName||"Tournament")}</b><small>${esc(x.winner||"")} • ${esc(x.position||"")}<br>${esc(x.note||"")}</small></div><span class="status approved">PUBLISHED</span></article>`;
    }).join("");
  },error=>{console.error("Public results:",error);$("resultsList").innerHTML='<div class="panel muted-panel">Results load হয়নি।</div>';});
}
watchPublicResults();

$("resultForm").addEventListener("submit",async event=>{
  event.preventDefault();if(!isAdmin)return;
  try {
    const tournamentId=$("rTournament").value;
    const tournament=tournaments.find(t=>t.id===tournamentId);if(!tournament)throw new Error("Tournament নির্বাচন করো।");
    const id=$("resultId").value;
    const payload={tournamentId,tournamentName:tournament.name,winner:$("rWinner").value.trim(),position:$("rPosition").value.trim(),note:$("rNote").value.trim(),updatedAt:serverTimestamp()};
    if(!payload.winner)throw new Error("Winner name লিখো।");
    if(id)await updateDoc(doc(db,C.results,id),payload);
    else await addDoc(collection(db,C.results),{...payload,publishedAt:serverTimestamp()});
    $("resultForm").reset();$("resultId").value="";toast("Result published.");
  } catch(error) { toast(error.message||"Result save failed."); }
});
async function editResult(id) {
  try {
    const snapshot=await getDoc(doc(db,C.results,id));if(!snapshot.exists())return;
    const x=snapshot.data();$("resultId").value=id;$("rTournament").value=x.tournamentId||"";
    $("rWinner").value=x.winner||"";$("rPosition").value=x.position||"";$("rNote").value=x.note||"";
    $("tabResults").scrollIntoView({behavior:"smooth"});
  } catch(error) { toast(error.message); }
}
async function deleteResult(id) {
  if(!isAdmin||!confirm("এই result delete করবে?"))return;
  try { await deleteDoc(doc(db,C.results,id));toast("Result deleted."); }
  catch(error) { toast(error.message||"Delete failed."); }
}
$("rReset").addEventListener("click",()=>{$("resultForm").reset();$("resultId").value="";});

function loadSettings() {
  stopListener("settings");
  stops.settings=onSnapshot(doc(db,C.settings,"public"),snapshot=>{
    const d=snapshot.exists()?snapshot.data():{};
    $("noticeArea").classList.toggle("hidden",!d.notice);
    $("noticeText").textContent=d.notice||"";
    const banner=safeUrl(d.banner)||d.bannerData;
    $("home").style.backgroundImage=banner?`linear-gradient(110deg,#080d1cf5,#0a1428aa),url("${banner}")`:"";
    const categoryImages={All:d.allImage,BR:d.brImage,CS:d.csImage,LW:d.lwImage,LTW:d.ltwImage,LWND:d.lwndImage,"1HP":d.hpImage,FREE:d.freeImage};
    document.querySelectorAll(".category-card[data-category]").forEach(card=>{
      const art=card.querySelector(".category-art");if(!art)return;
      const image=categoryImages[card.dataset.category];
      art.style.backgroundImage=image?`linear-gradient(#07132655,#07132655),url("${image}")`:"";
    });
    const contacts=[
      d.phone?`<a href="tel:${esc(d.phone)}">Phone: ${esc(d.phone)}</a>`:"",
      d.whatsapp?`<a target="_blank" rel="noopener" href="${esc(safeUrl(d.whatsapp))}">WhatsApp</a>`:"",
      d.facebook?`<a target="_blank" rel="noopener" href="${esc(safeUrl(d.facebook))}">Facebook</a>`:"",
      d.youtube?`<a target="_blank" rel="noopener" href="${esc(safeUrl(d.youtube))}">YouTube</a>`:""
    ].filter(Boolean);
    $("contactDetails").innerHTML=contacts.join("")||"Contact information will be updated by admin.";
    if(isAdmin){
      $("sNotice").value=d.notice||"";$("sPhone").value=d.phone||"";
      $("sWhatsApp").value=d.whatsapp||"";$("sFacebook").value=d.facebook||"";
      $("sYoutube").value=d.youtube||"";$("sBanner").value=d.banner||"";
      const previewValues={sBannerPreview:d.bannerData||safeUrl(d.banner),sAllPreview:d.allImage,sBRPreview:d.brImage,sCSPreview:d.csImage,sLWPreview:d.lwImage,sLTWPreview:d.ltwImage,sLWNDPreview:d.lwndImage,s1HPPreview:d.hpImage,sFREEPreview:d.freeImage};
      Object.entries(previewValues).forEach(([id,src])=>{const el=$(id);if(src){el.src=src;el.classList.remove("hidden");}else{el.removeAttribute("src");el.classList.add("hidden");}});
    }
  },error=>{console.error("Settings:",error);});
}
loadSettings();
$("settingsForm").addEventListener("submit",async event=>{
  event.preventDefault();if(!isAdmin)return;
  try {
    await setDoc(doc(db,C.settings,"public"),{
      notice:$("sNotice").value.trim(),phone:$("sPhone").value.trim(),
      whatsapp:$("sWhatsApp").value.trim(),facebook:$("sFacebook").value.trim(),
      youtube:$("sYoutube").value.trim(),banner:pendingSiteImages.banner?"":$("sBanner").value.trim(),
      ...(pendingSiteImages.banner?{bannerData:pendingSiteImages.banner}:{}),
      ...(pendingSiteImages.allImage?{allImage:pendingSiteImages.allImage}:{}),
      ...(pendingSiteImages.brImage?{brImage:pendingSiteImages.brImage}:{}),
      ...(pendingSiteImages.csImage?{csImage:pendingSiteImages.csImage}:{}),
      ...(pendingSiteImages.lwImage?{lwImage:pendingSiteImages.lwImage}:{}),
      ...(pendingSiteImages.ltwImage?{ltwImage:pendingSiteImages.ltwImage}:{}),
      ...(pendingSiteImages.lwndImage?{lwndImage:pendingSiteImages.lwndImage}:{}),
      ...(pendingSiteImages.hpImage?{hpImage:pendingSiteImages.hpImage}:{}),
      ...(pendingSiteImages.freeImage?{freeImage:pendingSiteImages.freeImage}:{}),
      updatedAt:serverTimestamp()
    },{merge:true});
    Object.keys(pendingSiteImages).forEach(key=>pendingSiteImages[key]=null);
    imagePickers.forEach(([inputId])=>$(inputId).value="");
    toast("Website settings saved. Reload করলেও ছবিগুলো থাকবে।");
  } catch(error) { console.error("Save website settings:",error); toast(error.code?`${error.code}: ${error.message}`:(error.message||"Settings save failed.")); }
});

document.querySelectorAll(".tab").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(item=>item.classList.toggle("active",item===button));
  ["tabTournament","tabEntries","tabResults","tabPlayers","tabSettings"].forEach(id=>$(id).classList.toggle("hidden",id!==button.dataset.tab));
}));
