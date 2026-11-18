import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

// =====================================
// FIREBASE INITIALIZATION
// =====================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let isAdmin = false;
let tournaments = [];
let selectedCategory = "ALL";
let editingTournamentId = null;
let unsubscribeTournaments = null;
let unsubscribeMyMatches = null;
let unsubscribeSettings = null;

// =====================================
// HELPERS
// =====================================

function showToast(message) {
  const toast = $("toast");
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

function showMessage(id, message, error = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = error ? "#dc2626" : "#16a34a";
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value ?? "";
}

function setValue(id, value) {
  const element = $(id);
  if (element) element.value = value ?? "";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "Not set";

  const date = value.toDate
    ? value.toDate()
    : new Date(value);

  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleString("en-BD", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getCategoryName(category) {
  const names = {
    BR: "BR Match",
    CS: "Clash Squad",
    LW: "Lone Wolf",
    LTW: "Lose to Win",
    LWND: "LW No Damage",
    "1HP": "1 HP Mode",
    FREE: "Free Match"
  };

  return names[category] || category || "Tournament";
}

function show(element) {
  if (element) element.classList.remove("hidden");
}

function hide(element) {
  if (element) element.classList.add("hidden");
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog && typeof dialog.close === "function") {
    dialog.close();
  }
}

function getErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "এই Email দিয়ে আগে Account খোলা হয়েছে। Login করো।",
    "auth/invalid-email": "সঠিক Email Address দাও।",
    "auth/weak-password": "Password কমপক্ষে 6 অক্ষরের হতে হবে।",
    "auth/invalid-credential": "Email অথবা Password ভুল হয়েছে।",
    "auth/user-not-found": "এই Email দিয়ে Account পাওয়া যায়নি।",
    "auth/wrong-password": "Password ভুল হয়েছে।",
    "auth/too-many-requests": "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।",
    "auth/network-request-failed": "Internet Connection পরীক্ষা করো।",
    "permission-denied": "Firebase Rules অনুমতি দেয়নি। Firestore Rules পরীক্ষা করো।",
    "failed-precondition": "Firebase Index বা Database Configuration পরীক্ষা করো।"
  };

  return messages[error.code] ||
    error.message ||
    "সমস্যা হয়েছে। আবার চেষ্টা করো।";
}

// =====================================
// AUTHENTICATION
// =====================================

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;

  setText("authTitle", mode === "signup" ? "Create Account" : "Login");

  setText(
    "authSubmit",
    mode === "signup" ? "Create Account" : "Login"
  );

  setText(
    "switchAuth",
    mode === "signup"
      ? "Already have an account? Login"
      : "Create a new account"
  );

  if (mode === "signup") {
    show($("nameWrap"));
    show($("ffWrap"));
    show($("phoneWrap"));
  } else {
    hide($("nameWrap"));
    hide($("ffWrap"));
    hide($("phoneWrap"));
  }

  showMessage("authMessage", "");
}

$("switchAuth")?.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "signup" : "login");
});

$("loginOpen")?.addEventListener("click", () => {
  setAuthMode("login");
  openDialog("authDialog");
});

$("signupOpen")?.addEventListener("click", () => {
  setAuthMode("signup");
  openDialog("authDialog");
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showToast("Logout successful");
  } catch (error) {
    showToast(getErrorMessage(error));
  }
});

$("authForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("authEmail")?.value.trim().toLowerCase();
  const password = $("authPassword")?.value;

  if (!email || !password) {
    showMessage("authMessage", "Email ও Password দাও।", true);
    return;
  }

  try {
    if (authMode === "signup") {
      const name = $("authName")?.value.trim();
      const ffUID = $("authFFUID")?.value.trim();
      const phone = $("authPhone")?.value.trim();

      if (!name || !ffUID || !phone) {
        showMessage("authMessage", "সব তথ্য পূরণ করো।", true);
        return;
      }

      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        email,
        name,
        ffUID,
        phone,
        createdAt: serverTimestamp()
      });

      await sendEmailVerification(credential.user);

      showMessage(
        "authMessage",
        "Account তৈরি হয়েছে! Email Inbox থেকে Verification করে Login করো।"
      );

      await signOut(auth);
      setAuthMode("login");
      return;
    }

    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(auth);

      showMessage(
        "authMessage",
        "তোমার Email এখনো Verify হয়নি। Inbox থেকে Verification করো।",
        true
      );
      return;
    }

    closeDialog("authDialog");
    showToast("Login successful");

  } catch (error) {
    showMessage("authMessage", getErrorMessage(error), true);
  }
});

// =====================================
// AUTH STATE
// =====================================

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  isAdmin = false;

  if (user && user.emailVerified) {
    isAdmin =
      user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }

  updateAuthUI();

  if (user && user.emailVerified) {
    await loadPlayerProfile();
    loadMyMatches();
  } else {
    if (unsubscribeMyMatches) {
      unsubscribeMyMatches();
      unsubscribeMyMatches = null;
    }

    setText("myTournaments", "Login করলে তোমার Joined Matches দেখা যাবে।");
  }
});

function updateAuthUI() {
  const loggedIn = Boolean(currentUser && currentUser.emailVerified);

  show($("loginOpen"));
  show($("signupOpen"));
  hide($("logoutBtn"));

  if (loggedIn) {
    hide($("loginOpen"));
    hide($("signupOpen"));
    show($("logoutBtn"));
  }

  if (isAdmin) {
    show($("adminSection"));
  } else {
    hide($("adminSection"));
  }

  if (loggedIn) {
    hide($("signedOutWallet"));
    show($("playerArea"));
    setText("playerEmail", currentUser.email);
  } else {
    show($("signedOutWallet"));
    hide($("playerArea"));
    setText("playerEmail", "");
    setText("playerName", "");
    setText("playerFFUID", "");
  }
}

async function loadPlayerProfile() {
  if (!currentUser) return;

  try {
    const profileRef = doc(db, "users", currentUser.uid);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      const profile = profileSnap.data();

      setText("playerName", profile.name || "Player");
      setText("playerFFUID", profile.ffUID || "Not added");
      setText("playerEmail", currentUser.email);
    } else {
      setText("playerName", currentUser.displayName || "Player");
      setText("playerFFUID", "Not added");
    }
  } catch (error) {
    console.error("Profile error:", error);
  }
}

// =====================================
// TOURNAMENT LIST
// =====================================

function startTournamentListener() {
  if (unsubscribeTournaments) unsubscribeTournaments();

  const tournamentsRef = collection(db, "tournaments");
  const q = query(tournamentsRef, orderBy("createdAt", "desc"));

  unsubscribeTournaments = onSnapshot(
    q,
    (snapshot) => {
      tournaments = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      renderTournaments();
      updateCategoryCounts();
      renderAdminTournamentList();
    },
    (error) => {
      console.error("Tournament listener:", error);
      showToast(getErrorMessage(error));
    }
  );
}

function renderTournaments() {
  const grid = $("tournamentGrid");
  if (!grid) return;

  const filtered = tournaments.filter((tournament) => {
    if (selectedCategory === "ALL") return true;
    return tournament.mode === selectedCategory;
  });

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state">
        No tournaments available right now.
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((tournament) => {
    const image = tournament.image
      ? `<img src="${escapeHTML(tournament.image)}"
           alt="Tournament"
           loading="lazy"
           onerror="this.style.display='none'">`
      : "";

    const status = tournament.status || "open";
    const isOpen = status === "open";
    const fee = Number(tournament.entryFee || 0);

    return `
      <article class="tournament-card">
        ${image}

        <div class="tournament-content">
          <span class="status ${isOpen ? "open" : "closed"}">
            ${isOpen ? "OPEN" : escapeHTML(status.toUpperCase())}
          </span>

          <h3>${escapeHTML(tournament.name || "Tournament")}</h3>

          <p>${escapeHTML(getCategoryName(tournament.mode))}</p>

          <div class="tournament-info">
            <span>Entry: FREE</span>
            <span>Prize: ${escapeHTML(tournament.prizePool || "0")}</span>
            <span>Slots: ${Number(tournament.slots || 0)}</span>
          </div>

          <p>${escapeHTML(tournament.description || "")}</p>

          <p>${escapeHTML(formatDate(tournament.startTime))}</p>

          <button
            class="btn join-btn"
            data-join="${escapeHTML(tournament.id)}"
            ${!isOpen ? "disabled" : ""}
          >
            ${isOpen ? "Join Now" : "Closed"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll("[data-join]").forEach((button) => {
    button.addEventListener("click", () => {
      openJoinDialog(button.dataset.join);
    });
  });
}

function updateCategoryCounts() {
  const categories = ["BR", "CS", "LW", "LTW", "LWND", "1HP", "FREE"];

  categories.forEach((category) => {
    const count = tournaments.filter(
      (tournament) => tournament.mode === category
    ).length;

    setText("count" + category, count);
  });
}

// Category filter buttons
document.querySelectorAll("[data-category]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedCategory = button.dataset.category || "ALL";
    renderTournaments();

    document.querySelectorAll("[data-category]").forEach((item) => {
      item.classList.remove("active");
    });

    button.classList.add("active");
  });
});

// =====================================
// JOIN TOURNAMENT
// =====================================

let selectedTournament = null;

function openJoinDialog(tournamentId) {
  if (!currentUser || !currentUser.emailVerified) {
    showToast("প্রথমে Login করে Email Verify করো।");
    setAuthMode("login");
    openDialog("authDialog");
    return;
  }

  selectedTournament = tournaments.find(
    (tournament) => tournament.id === tournamentId
  );

  if (!selectedTournament) {
    showToast("Tournament পাওয়া যায়নি।");
    return;
  }

  if (selectedTournament.status !== "open") {
    showToast("এই Tournament এখন বন্ধ।");
    return;
  }

  if (Number(selectedTournament.entryFee || 0) !== 0) {
    showToast("এই Free Version-এ শুধু Free Tournament Join করা যাবে।");
    return;
  }

  setValue("joinTournamentId", tournamentId);
  setText("joinTitle", selectedTournament.name || "Join Tournament");

  setText(
    "joinDetails",
    `${getCategoryName(selectedTournament.mode)} | FREE Entry`
  );

  setValue("joinPlayerName", $("playerName")?.textContent || "");
  setValue("joinFFUID", $("playerFFUID")?.textContent || "");

  openDialog("joinDialog");
}

$("joinForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !currentUser.emailVerified || !selectedTournament) {
    showMessage("joinMessage", "আবার Login করে চেষ্টা করো।", true);
    return;
  }

  const playerName = $("joinPlayerName")?.value.trim();
  const ffUID = $("joinFFUID")?.value.trim();
  const contact = $("joinContact")?.value.trim();

  if (!playerName || !ffUID || !contact) {
    showMessage("joinMessage", "সব তথ্য পূরণ করো।", true);
    return;
  }

  try {
    const tournamentRef = doc(
      db,
      "tournaments",
      selectedTournament.id
    );

    const latestTournament = await getDoc(tournamentRef);

    if (!latestTournament.exists()) {
      throw new Error("Tournament পাওয়া যায়নি।");
    }

    const latestData = latestTournament.data();

    if (latestData.status !== "open") {
      throw new Error("Tournament বন্ধ হয়ে গেছে।");
    }

    if (Number(latestData.entryFee || 0) !== 0) {
      throw new Error("শুধু Free Tournament Join করা যাবে।");
    }

    // Check previous registration for this player
    const registrationQuery = query(
      collection(db, "registrations"),
      where("playerUid", "==", currentUser.uid)
    );

    const registrations = await getDocs(registrationQuery);

    const alreadyJoined = registrations.docs.some(
      (item) => item.data().tournamentId === selectedTournament.id
    );

    if (alreadyJoined) {
      throw new Error("তুমি এই Tournament আগেই Join করেছো।");
    }

    const slotLimit = Number(latestData.slots || 0);

    const tournamentRegistrations = await getDocs(
      query(
        collection(db, "registrations"),
        where("tournamentId", "==", selectedTournament.id)
      )
    );

    if (
      slotLimit > 0 &&
      tournamentRegistrations.size >= slotLimit
    ) {
      throw new Error("সব Slot পূর্ণ হয়ে গেছে।");
    }

    await addDoc(collection(db, "registrations"), {
      tournamentId: selectedTournament.id,
      tournamentName: latestData.name || "",
      playerUid: currentUser.uid,
      playerName,
      ffUID,
      contact,
      entryFee: 0,
      status: "Pending",
      createdAt: serverTimestamp()
    });

    closeDialog("joinDialog");
    showToast("Tournament Join Request সফল হয়েছে!");

  } catch (error) {
    showMessage("joinMessage", getErrorMessage(error), true);
  }
});

// =====================================
// PLAYER MY MATCHES
// =====================================

function loadMyMatches() {
  if (!currentUser) return;

  if (unsubscribeMyMatches) unsubscribeMyMatches();

  const q = query(
    collection(db, "registrations"),
    where("playerUid", "==", currentUser.uid)
  );

  unsubscribeMyMatches = onSnapshot(
    q,
    (snapshot) => {
      const container = $("myTournaments");
      if (!container) return;

      if (snapshot.empty) {
        container.innerHTML = "<p>You have not joined any tournaments yet.</p>";
        return;
      }

      container.innerHTML = snapshot.docs.map((item) => {
        const data = item.data();

        return `
          <div class="list-row">
            <strong>${escapeHTML(data.tournamentName || "Tournament")}</strong>
            <span>${escapeHTML(data.status || "Pending")}</span>
            <small>FF UID: ${escapeHTML(data.ffUID || "")}</small>
          </div>
        `;
      }).join("");
    },
    (error) => {
      console.error("My matches error:", error);
      showToast(getErrorMessage(error));
    }
  );
}

// =====================================
// ADMIN: CREATE / EDIT TOURNAMENT
// =====================================

function requireAdmin() {
  if (!currentUser || !currentUser.emailVerified || !isAdmin) {
    showToast("শুধু Verified Admin এই কাজ করতে পারবে।");
    return false;
  }

  return true;
}

$("tournamentForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!requireAdmin()) return;

  const name = $("tName")?.value.trim();
  const mode = $("tMode")?.value;
  const prizePool = $("tPrize")?.value.trim() || "0";
  const startTime = $("tTime")?.value;
  const slots = Number($("tSlots")?.value || 0);
  const image = $("tImage")?.value.trim() || "";
  const description = $("tDescription")?.value.trim() || "";
  const status = $("tStatus")?.value || "open";

  if (!name || !mode || !startTime || slots <= 0) {
    showToast("Tournament-এর প্রয়োজনীয় তথ্য পূরণ করো।");
    return;
  }

  try {
    const tournamentData = {
      name,
      mode,
      entryFee: 0,
      prizePool,
      startTime,
      slots,
      image,
      description,
      status,
      updatedAt: serverTimestamp()
    };

    if (editingTournamentId) {
      await updateDoc(
        doc(db, "tournaments", editingTournamentId),
        tournamentData
      );

      showToast("Tournament Update হয়েছে!");
    } else {
      tournamentData.createdAt = serverTimestamp();

      await addDoc(
        collection(db, "tournaments"),
        tournamentData
      );

      showToast("নতুন Tournament তৈরি হয়েছে!");
    }

    editingTournamentId = null;
    $("tournamentForm").reset();
    setText("tReset", "Reset Form");

  } catch (error) {
    showToast(getErrorMessage(error));
  }
});

$("tReset")?.addEventListener("click", () => {
  editingTournamentId = null;
  $("tournamentForm")?.reset();
});

function renderAdminTournamentList() {
  const container = $("adminTournamentList");
  if (!container) return;

  if (!isAdmin) {
    container.innerHTML = "";
    return;
  }

  if (!tournaments.length) {
    container.innerHTML = "<p>No tournaments created.</p>";
    return;
  }

  container.innerHTML = tournaments.map((tournament) => `
    <div class="list-row">
      <div>
        <strong>${escapeHTML(tournament.name || "Tournament")}</strong>
        <small>${escapeHTML(getCategoryName(tournament.mode))}</small>
        <small>Entry: FREE</small>
      </div>

      <div class="admin-inline">
        <button class="small-btn" data-edit="${escapeHTML(tournament.id)}">
          Edit
        </button>

        <button class="small-btn danger" data-delete="${escapeHTML(tournament.id)}">
          Delete
        </button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      editTournament(button.dataset.edit);
    });
  });

  container.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteTournament(button.dataset.delete);
    });
  });
}

function editTournament(id) {
  if (!requireAdmin()) return;

  const tournament = tournaments.find((item) => item.id === id);
  if (!tournament) return;

  editingTournamentId = id;

  setValue("tName", tournament.name);
  setValue("tMode", tournament.mode);
  setValue("tFee", "0");
  setValue("tPrize", tournament.prizePool);
  setValue("tSlots", tournament.slots);
  setValue("tImage", tournament.image);
  setValue("tDescription", tournament.description);
  setValue("tStatus", tournament.status);

  if (tournament.startTime) {
    const date = new Date(tournament.startTime);
    if (!Number.isNaN(date.getTime())) {
      const localDate = new Date(
        date.getTime() - date.getTimezoneOffset() * 60000
      ).toISOString().slice(0, 16);

      setValue("tTime", localDate);
    }
  }

  setText("tReset", "Cancel Edit");

  $("tName")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

async function deleteTournament(id) {
  if (!requireAdmin()) return;

  if (!confirm("এই Tournament Delete করতে চাও?")) return;

  try {
    await deleteDoc(doc(db, "tournaments", id));
    showToast("Tournament Delete হয়েছে।");
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

// =====================================
// ADMIN: PLAYER LIST
// =====================================

async function loadAdminPlayers() {
  if (!requireAdmin()) return;

  const container = $("adminPlayersList");
  if (!container) return;

  try {
    const snapshot = await getDocs(collection(db, "users"));

    if (snapshot.empty) {
      container.innerHTML = "<p>No players found.</p>";
      return;
    }

    container.innerHTML = snapshot.docs.map((item) => {
      const player = item.data();

      return `
        <div class="list-row">
          <strong>${escapeHTML(player.name || "Player")}</strong>
          <small>Email: ${escapeHTML(player.email || "")}</small>
          <small>FF UID: ${escapeHTML(player.ffUID || "")}</small>
          <small>Phone: ${escapeHTML(player.phone || "")}</small>
        </div>
      `;
    }).join("");

  } catch (error) {
    container.textContent = getErrorMessage(error);
  }
}

// =====================================
// ADMIN TABS
// =====================================

function showAdminTab(tab) {
  if (!requireAdmin()) return;

  const tournamentPanel = $("adminTournamentPanel");
  const playersPanel = $("adminPlayersPanel");
  const settingsPanel = $("adminSettingsPanel");

  hide(tournamentPanel);
  hide(playersPanel);
  hide(settingsPanel);

  if (tab === "tournament") {
    show(tournamentPanel);
  } else if (tab === "players") {
    show(playersPanel);
    loadAdminPlayers();
  } else if (tab === "settings") {
    show(settingsPanel);
    loadSettingsForm();
  }

  document.querySelectorAll(".admin-tabs button").forEach((button) => {
    button.classList.remove("active");
  });

  $("tab" + tab.charAt(0).toUpperCase() + tab.slice(1))
    ?.classList.add("active");
}

$("tabTournament")?.addEventListener("click", () => {
  showAdminTab("tournament");
});

$("tabPlayers")?.addEventListener("click", () => {
  showAdminTab("players");
});

$("tabSettings")?.addEventListener("click", () => {
  showAdminTab("settings");
});

// =====================================
// ADMIN: SITE SETTINGS
// =====================================

async function loadSettingsForm() {
  if (!requireAdmin()) return;

  try {
    const snapshot = await getDoc(doc(db, "site_settings", "public"));

    if (!snapshot.exists()) return;

    const data = snapshot.data();

    setValue("sNotice", data.notice || "");
    setValue("sPhone", data.phone || "");
    setValue("sWhatsApp", data.whatsapp || "");
    setValue("sFacebook", data.facebook || "");
    setValue("sYoutube", data.youtube || "");
    setValue("sBanner", data.banner || "");

  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

$("settingsForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!requireAdmin()) return;

  try {
    await setDoc(
      doc(db, "site_settings", "public"),
      {
        notice: $("sNotice")?.value.trim() || "",
        phone: $("sPhone")?.value.trim() || "",
        whatsapp: $("sWhatsApp")?.value.trim() || "",
        facebook: $("sFacebook")?.value.trim() || "",
        youtube: $("sYoutube")?.value.trim() || "",
        banner: $("sBanner")?.value.trim() || "",
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    showToast("Website Settings Update হয়েছে!");

  } catch (error) {
    showToast(getErrorMessage(error));
  }
});

// =====================================
// PUBLIC SETTINGS LISTENER
// =====================================

function startSettingsListener() {
  if (unsubscribeSettings) unsubscribeSettings();

  unsubscribeSettings = onSnapshot(
    doc(db, "site_settings", "public"),
    (snapshot) => {
      if (!snapshot.exists()) return;

      const data = snapshot.data();

      setText("noticeText", data.notice || "Welcome to AE FREE FIRE!");
      setText("contactDetails", "");

      const contact = $("contactDetails");

      if (contact) {
        const links = [];

        if (data.phone) {
          links.push(
            `<p>Phone: ${escapeHTML(data.phone)}</p>`
          );
        }

        if (data.whatsapp) {
          const number = data.whatsapp.replace(/[^\d]/g, "");

          links.push(
            `<p><a href="https://wa.me/${escapeHTML(number)}" target="_blank" rel="noopener">WhatsApp Contact</a></p>`
          );
        }

        if (data.facebook) {
          links.push(
            `<p><a href="${escapeHTML(data.facebook)}" target="_blank" rel="noopener">Facebook</a></p>`
          );
        }

        if (data.youtube) {
          links.push(
            `<p><a href="${escapeHTML(data.youtube)}" target="_blank" rel="noopener">YouTube</a></p>`
          );
        }

        contact.innerHTML = links.join("") || "Contact details coming soon.";
      }

      const banner = $("homeBanner");

      if (banner && data.banner) {
        banner.style.backgroundImage =
          `linear-gradient(#0005,#0005), url("${data.banner.replace(/["\\]/g, "")}")`;
        banner.style.backgroundSize = "cover";
        banner.style.backgroundPosition = "center";
      }
    },
    (error) => {
      console.error("Settings listener:", error);
    }
  );
}

// =====================================
// RESULTS
// =====================================

function renderResults() {
  const container = $("resultsList");
  if (!container) return;

  const completed = tournaments.filter((tournament) =>
    tournament.status === "completed" ||
    tournament.result ||
    tournament.winner
  );

  if (!completed.length) {
    container.innerHTML = "<p>No results published yet.</p>";
    return;
  }

  container.innerHTML = completed.map((tournament) => `
    <div class="list-row">
      <strong>${escapeHTML(tournament.name || "Tournament")}</strong>
      <p>Winner: ${escapeHTML(tournament.winner || "Not announced")}</p>
      <p>${escapeHTML(tournament.result || "")}</p>
    </div>
  `).join("");
}

// Update results when tournaments change
const originalRenderTournaments = renderTournaments;
renderTournaments = function () {
  originalRenderTournaments();
  renderResults();
};

// =====================================
// INITIALIZE
// =====================================

startTournamentListener();
startSettingsListener();

setAuthMode("login");

console.log("AE FREE FIRE app.js loaded successfully.");
