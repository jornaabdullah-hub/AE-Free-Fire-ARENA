const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp();
const db = getFirestore();
const REGION = "asia-south1";
const ADMIN = "pctime310@gmail.com";
function userOf(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Please login first.");
  return req.auth;
}
function isAdmin(req) {
  const u = userOf(req);
  if ((u.token.email || "").toLowerCase() !== ADMIN) throw new HttpsError("permission-denied", "Admin access required.");
  return u;
}
function validAmount(n) {
  return Number.isSafeInteger(n) && n > 0 && n <= 1000000;
}
exports.joinTournament = onCall({ region: REGION }, async req => {
  const user = userOf(req), uid = user.uid;
  if ((user.token.email || "").toLowerCase() === ADMIN) throw new HttpsError("permission-denied", "Admin accounts cannot join as players.");
  const { tournamentId, playerName, ffUID, contact } = req.data || {};
  if (![tournamentId, playerName, ffUID, contact].every(x => typeof x === "string" && x.trim())) throw new HttpsError("invalid-argument", "Complete all player details.");
  const tRef = db.doc(`tournaments/${tournamentId}`), wRef = db.doc(`wallets/${uid}`);
  const regRef = db.collection("registrations").doc();
  await db.runTransaction(async tx => {
    const tSnap = await tx.get(tRef), wSnap = await tx.get(wRef);
    if (!tSnap.exists) throw new HttpsError("not-found", "Tournament not found.");
    const t = tSnap.data();
    if (t.status !== "open") throw new HttpsError("failed-precondition", "Tournament is closed.");
    const fee = Number(t.entryFee || 0);
    if (!Number.isSafeInteger(fee) || fee < 0) throw new HttpsError("failed-precondition", "Invalid tournament entry fee.");
    const playerRegs = await tx.get(db.collection("registrations").where("playerUid", "==", uid));
    if (playerRegs.docs.some(d => d.data().tournamentId === tournamentId)) throw new HttpsError("already-exists", "You already joined this tournament.");
    const balance = Number(wSnap.data()?.balance || 0);
    if (balance < fee) throw new HttpsError("failed-precondition", `Insufficient balance. Required ${fee} BDT.`);
    const existingCount = await tx.get(db.collection("registrations").where("tournamentId", "==", tournamentId));
    if (Number(t.slots || 0) > 0 && existingCount.size >= Number(t.slots)) throw new HttpsError("resource-exhausted", "Tournament slots are full.");
    tx.set(wRef, { balance: balance - fee, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(regRef, { tournamentId, tournamentName: t.name || "", playerUid: uid, email: user.token.email || "", playerName: playerName.trim(), ffUID: ffUID.trim(), contact: contact.trim(), status: "Pending", createdAt: FieldValue.serverTimestamp() });
    tx.create(db.collection("transactions").doc(), { uid, type: "entry_fee", title: `Entry fee: ${t.name || "Tournament"}`, amount: fee, direction: "debit", tournamentId, createdAt: FieldValue.serverTimestamp() });
  });
  return { message: "Joined successfully. Entry fee has been deducted." };
});
exports.createMoneyRequest = onCall({ region: REGION }, async req => {
  const user = userOf(req), d = req.data || {};
  const type = d.type;
  if (!["deposit", "withdraw"].includes(type) || !validAmount(d.amount) || typeof d.method !== "string") throw new HttpsError("invalid-argument", "Enter a valid amount and payment method.");
  if (type === "deposit" && (!d.sender || !d.trxId)) throw new HttpsError("invalid-argument", "Sender number and transaction ID are required.");
  if (type === "withdraw" && !d.payoutNumber) throw new HttpsError("invalid-argument", "Payout number is required.");
  const ref = await db.collection("money_requests").add({ uid: user.uid, email: user.token.email || "", type, amount: d.amount, method: d.method, sender: type === "deposit" ? String(d.sender).slice(0, 40) : "", trxId: type === "deposit" ? String(d.trxId).slice(0, 100) : "", payoutNumber: type === "withdraw" ? String(d.payoutNumber).slice(0, 40) : "", status: "Pending", createdAt: FieldValue.serverTimestamp() });
  return { requestId: ref.id };
});
exports.reviewMoneyRequest = onCall({ region: REGION }, async req => {
  isAdmin(req);
  const { requestId, decision } = req.data || {};
  if (typeof requestId !== "string" || !["approve", "reject"].includes(decision)) throw new HttpsError("invalid-argument", "Invalid request.");
  const rRef = db.doc(`money_requests/${requestId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(rRef);
    if (!snap.exists) throw new HttpsError("not-found", "Request not found.");
    const r = snap.data();
    if (r.status !== "Pending") throw new HttpsError("failed-precondition", "This request was already reviewed.");
    if (decision === "approve") {
      const wRef = db.doc(`wallets/${r.uid}`), wSnap = await tx.get(wRef);
      const old = Number(wSnap.data()?.balance || 0);
      if (r.type === "withdraw" && old < r.amount) throw new HttpsError("failed-precondition", "Player balance is insufficient.");
      const next = r.type === "deposit" ? old + r.amount : old - r.amount;
      tx.set(wRef, { balance: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(db.collection("transactions").doc(), { uid: r.uid, type: r.type, title: `${r.type} approved`, amount: r.amount, direction: r.type === "deposit" ? "credit" : "debit", requestId, createdAt: FieldValue.serverTimestamp() });
    }
    tx.update(rRef, { status: decision === "approve" ? "Approved" : "Rejected", reviewedAt: FieldValue.serverTimestamp(), reviewedBy: req.auth.uid });
  });
  return { success: true };
});
exports.adminAdjustBalance = onCall({ region: REGION }, async req => {
  isAdmin(req);
  const { uid, amount, reason } = req.data || {};
  if (typeof uid !== "string" || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) throw new HttpsError("invalid-argument", "Invalid balance adjustment.");
  const wRef = db.doc(`wallets/${uid}`);
  await db.runTransaction(async tx => {
    const s = await tx.get(wRef), old = Number(s.data()?.balance || 0), next = old + amount;
    if (next < 0) throw new HttpsError("failed-precondition", "Balance cannot become negative.");
    tx.set(wRef, { balance: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(db.collection("transactions").doc(), { uid, type: "admin_adjustment", title: String(reason || "Admin adjustment"), amount: Math.abs(amount), direction: amount > 0 ? "credit" : "debit", createdAt: FieldValue.serverTimestamp() });
  });
  return { success: true };
});
exports.awardPrize = onCall({ region: REGION }, async req => {
  isAdmin(req);
  const { uid, amount, tournamentId, registrationId } = req.data || {};
  if (typeof uid !== "string" || !validAmount(amount) || typeof tournamentId !== "string" || typeof registrationId !== "string") throw new HttpsError("invalid-argument", "Invalid prize details.");
  const regRef = db.doc(`registrations/${registrationId}`), wRef = db.doc(`wallets/${uid}`);
  await db.runTransaction(async tx => {
    const r = await tx.get(regRef), w = await tx.get(wRef);
    if (!r.exists || r.data().playerUid !== uid || r.data().tournamentId !== tournamentId) throw new HttpsError("not-found", "Matching tournament registration not found.");
    if (r.data().prizeAwarded) throw new HttpsError("already-exists", "Prize was already awarded.");
    tx.set(wRef, { balance: Number(w.data()?.balance || 0) + amount, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(regRef, { status: "Winner", prizeAwarded: true, prizeAmount: amount });
    tx.create(db.collection("transactions").doc(), { uid, type: "prize", title: "Tournament prize", amount, direction: "credit", tournamentId, registrationId, createdAt: FieldValue.serverTimestamp() });
  });
  return { success: true };
});