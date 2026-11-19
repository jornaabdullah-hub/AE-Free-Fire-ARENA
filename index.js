<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#080d1c">
  <meta name="description" content="AE FREE FIRE Tournament Arena">
  <title>AE FREE FIRE | Tournament Arena</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="#home"><span class="brand-mark">AE</span><span>AE <b>FREE FIRE</b><small>TOURNAMENT ARENA</small></span></a>
  <button id="menuToggle" class="menu-toggle" aria-label="Open menu">☰</button>
  <nav id="mainNav">
    <a href="#tournaments">Tournaments</a><a href="#matches">My Matches</a><a href="#results">Results</a><a href="#contact">Contact</a>
    <button id="loginOpen" class="btn btn-outline">Player / Admin Login</button>
    <button id="signupOpen" class="btn btn-primary">Create Account</button>
    <button id="logoutBtn" class="btn btn-outline hidden">Logout</button>
  </nav>
</header>

<main>
  <section class="hero" id="home">
    <div class="hero-copy">
      <p class="eyebrow">BATTLE • COMPETE • RESPECT</p>
      <h1>ENTER THE <span>ARENA.</span></h1>
      <p>Join free BR, CS and special-mode tournaments. Track your entries, match details and results.</p>
      <div class="hero-actions"><a class="btn btn-primary" href="#tournaments">VIEW TOURNAMENTS</a><button id="heroSignup" class="btn btn-outline">Create Player Account</button></div>
      <div class="hero-stats"><div><b>BR</b><small>Battle Royale</small></div><div><b>CS</b><small>Clash Squad</small></div><div><b>FREE</b><small>Entry</small></div></div>
    </div>
    <div class="hero-art"><div class="crosshair">✦</div><div class="art-title">AE<span>FF</span></div><div class="art-sub">FIGHT FOR THE TOP</div></div>
  </section>

  <section id="noticeArea" class="notice-wrap hidden"><b class="notice-label">NOTICE</b><div id="noticeText"></div></section>

  <section class="section" id="tournaments">
    <div class="section-heading"><div><p class="eyebrow">CHOOSE YOUR BATTLE</p><h2>TOURNAMENTS</h2></div><span class="section-tag">FREE ENTRY</span></div>
    <div class="filters" id="categoryFilters">
      <button class="filter active" data-category="All">All</button>
      <button class="filter" data-category="BR">BR</button><button class="filter" data-category="CS">CS</button>
      <button class="filter" data-category="LW">LW</button><button class="filter" data-category="LTW">LTW</button>
      <button class="filter" data-category="LWND">LWND</button><button class="filter" data-category="1HP">1 HP</button>
      <button class="filter" data-category="FREE">Free Match</button>
    </div>
    <div id="tournamentGrid" class="tournament-grid"><div class="empty-state">Loading tournaments…</div></div>
  </section>

  <section class="section alt" id="matches">
    <div class="section-heading"><div><p class="eyebrow">PLAYER ACCOUNT</p><h2>MY MATCHES</h2></div></div>
    <div id="signedOutMatches" class="panel muted-panel">Login to see your tournament requests and confirmed matches.</div>
    <div id="myTournaments" class="simple-list hidden"></div>
  </section>

  <section class="section" id="results">
    <div class="section-heading"><div><p class="eyebrow">LATEST UPDATES</p><h2>RESULTS & WINNERS</h2></div></div>
    <div id="resultsList" class="simple-list"><div class="empty-state">No results published yet.</div></div>
  </section>

  <section id="adminSection" class="section alt hidden">
    <div class="section-heading"><div><p class="eyebrow">CONTROL CENTER</p><h2>ADMIN PANEL</h2></div><span class="section-tag admin-tag">ADMIN</span></div>
    <div class="admin-tabs">
      <button class="tab active" data-tab="tabTournament">Tournaments</button>
      <button class="tab" data-tab="tabEntries">Join Requests</button>
      <button class="tab" data-tab="tabResults">Results</button>
      <button class="tab" data-tab="tabPlayers">Players</button>
      <button class="tab" data-tab="tabSettings">Website Settings</button>
    </div>

    <div id="tabTournament" class="admin-panel panel">
      <h3>Create / Edit Tournament</h3>
      <form id="tournamentForm" class="form-grid">
        <input type="hidden" id="tournamentId">
        <label>Tournament name<input id="tName" required maxlength="70" placeholder="Friday Night BR"></label>
        <label>Category<select id="tMode"><option>BR</option><option>CS</option><option>LW</option><option>LTW</option><option>LWND</option><option>1HP</option><option>FREE</option></select></label>
        <label>Entry fee<input value="FREE" disabled></label>
        <label>Prize description (optional)<input id="tPrize" maxlength="80" placeholder="e.g. Champion badge / certificate"></label>
        <label>Match date & time<input id="tTime" type="datetime-local" required></label>
        <label>Maximum slots<input id="tSlots" type="number" min="2" max="1000" value="48" required></label>
        <label class="full">Banner image URL (optional)<input id="tImage" type="url" placeholder="https://..."></label>
        <label class="full">Description / Rules<input id="tDescription" maxlength="300" placeholder="Map, rules, squad details..."></label>
        <label>WhatsApp group link<input id="tWhatsApp" type="url" placeholder="https://chat.whatsapp.com/..."></label>
        <label>Telegram group link<input id="tTelegram" type="url" placeholder="https://t.me/..."></label>
        <label>Status<select id="tStatus"><option value="open">Open</option><option value="closed">Closed</option></select></label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Save Tournament</button><button class="btn btn-outline" type="button" id="tReset">Clear</button></div>
      </form>
      <div id="adminTournamentList" class="simple-list"></div>
    </div>

    <div id="tabEntries" class="admin-panel panel hidden"><h3>Player Join Requests</h3><div id="adminEntries" class="simple-list">No requests.</div></div>

    <div id="tabResults" class="admin-panel panel hidden">
      <h3>Publish / Edit Result</h3>
      <form id="resultForm" class="form-grid">
        <input type="hidden" id="resultId">
        <label>Tournament<select id="rTournament" required></select></label>
        <label>Winner / Team<input id="rWinner" required maxlength="80"></label>
        <label>Position / Result<input id="rPosition" maxlength="80" placeholder="1st place"></label>
        <label>Result note<input id="rNote" maxlength="250" placeholder="Match summary"></label>
        <div class="form-actions"><button class="btn btn-primary">Publish Result</button><button class="btn btn-outline" type="button" id="rReset">Clear</button></div>
      </form>
      <div id="adminResults" class="simple-list"></div>
    </div>

    <div id="tabPlayers" class="admin-panel panel hidden"><h3>Player Accounts</h3><div id="adminPlayers" class="simple-list">Player list loads here.</div></div>

    <div id="tabSettings" class="admin-panel panel hidden">
      <h3>Website Content</h3>
      <form id="settingsForm" class="form-grid">
        <label class="full">Announcement / Notice<input id="sNotice" maxlength="300" placeholder="Tournament starts at 9 PM"></label>
        <label>Contact phone<input id="sPhone" maxlength="25" placeholder="+8801..."></label>
        <label>WhatsApp contact link<input id="sWhatsApp" type="url" placeholder="https://wa.me/..."></label>
        <label>Facebook link<input id="sFacebook" type="url" placeholder="https://facebook.com/..."></label>
        <label>YouTube link<input id="sYoutube" type="url" placeholder="https://youtube.com/..."></label>
        <label class="full">Home banner image URL<input id="sBanner" type="url" placeholder="https://..."></label>
        <div class="form-actions"><button class="btn btn-primary">Save Website Settings</button></div>
      </form>
    </div>
  </section>

  <section id="contact" class="section contact-section">
    <div><p class="eyebrow">NEED HELP?</p><h2>CONTACT AE FREE FIRE</h2><p>For tournament support and account help.</p></div>
    <div id="contactDetails" class="contact-links">Contact information will be updated by admin.</div>
  </section>
</main>

<footer><span>© <span id="year"></span> AE FREE FIRE</span><span>Play fair. Respect every player.</span></footer>

<dialog id="authDialog" class="modal">
  <button class="modal-close" data-close="authDialog">×</button><p class="eyebrow">PLAYER ACCOUNT</p><h2 id="authTitle">Player Login</h2>
  <form id="authForm">
    <label id="nameWrap" class="hidden">Player name<input id="authName" maxlength="40"></label>
    <label>Email<input id="authEmail" type="email" required autocomplete="email"></label>
    <label>Password<input id="authPassword" type="password" minlength="6" required autocomplete="current-password"></label>
    <label id="ffWrap" class="hidden">Free Fire UID<input id="authFFUID" maxlength="30"></label>
    <label id="phoneWrap" class="hidden">Phone number<input id="authPhone" maxlength="20"></label>
    <button class="btn btn-primary full-width" id="authSubmit">Login</button><p id="authMessage" class="form-message"></p>
  </form>
  <button id="switchAuth" class="text-button">Create a new account</button>
</dialog>

<dialog id="joinDialog" class="modal">
  <button class="modal-close" data-close="joinDialog">×</button><p class="eyebrow">FREE TOURNAMENT ENTRY</p><h2 id="joinTitle">Join tournament</h2><p id="joinDetails" class="muted"></p>
  <form id="joinForm">
    <input type="hidden" id="joinTournamentId">
    <label>Player / Team name<input id="joinPlayerName" required maxlength="50"></label>
    <label>Free Fire UID<input id="joinFFUID" required maxlength="30"></label>
    <label>Contact number<input id="joinContact" required maxlength="20"></label>
    <button class="btn btn-primary full-width">Send Join Request</button><p id="joinMessage" class="form-message"></p>
  </form>
</dialog>
<div id="toast" class="toast"></div>
<script type="module" src="./app.js"></script>
</body>
</html>
