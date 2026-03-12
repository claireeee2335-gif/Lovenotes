/* ═══════════════════════════════════════════════════════════════
   THE LOVE NOTE JAR — app.js  v6
   · EXACT note count shown as paper slips inside the jar glass
   · Slips pile up from the bottom, taper toward the neck
   · Each new slip animates dropping in (slipDropIn)
   · Opened note: topmost slip flies out (slipFallOut)
   · Cork pop → slip flies out → note unfolds in modal
═══════════════════════════════════════════════════════════════ */

/* ─── YOUR FIREBASE CONFIG ───────────────────────────────────── */
const FIREBASE_CONFIG = {
 apiKey:            "AIzaSyAle4-lfQWP5lFHazNXRK5ylRZmHOJV974",
  authDomain:        "love-notes-in-jar.firebaseapp.com",
  projectId:         "love-notes-in-jar",
  storageBucket:     "love-notes-in-jar.firebasestorage.app",
  messagingSenderId: "846301971676",
  appId:             "1:846301971676:web:901ca5e9a25af7c6632019"
};
/* ──────────────────────────────────────────────────────────── */

const DAILY_OPEN_LIMIT = 5;
const GUEST_SEND_LIMIT = 5;

/* ─── JAR GEOMETRY (pixels, relative to #jar-wrapper 240×310px) ─
   Measure your jar.png and tweak these if slips look off.
   Glass interior:
     base  Y = 275px from wrapper top  (bottom of glass)
     neck  Y = 100px from wrapper top  (top of visible glass)
     center X = 120px
     width at base ≈ 155px  (±77px from center)
     width at neck ≈  55px  (±27px from center)
─────────────────────────────────────────────────────────────── */
const JAR = {
  wrapperH : 310,
  baseY    : 245,   // bottom of glass interior
  neckY    : 100,   // top of glass interior
  centerX  : 120,
  halfWBase: 45,    // half-width at base
  halfWNeck: 24,    // half-width at neck
};

/* ─── SLIP APPEARANCE ─────────────────────────────────────── */
const SLIP_COLORS = [
  '#fde8c8','#fad4d4','#d4eafd','#d4fde8',
  '#f5d4fd','#fdfad4','#ffd9b3','#c8f0f0',
  '#ffe0e0','#e8fde8',
];
const MAX_VISIBLE_SLIPS = 10;   // beyond 10 they'd overflow the neck
const SLIP_STEP_PX      = 17;   // how many px each slip raises the pile

window.addEventListener('firebaseReady', initApp);

async function initApp() {
  const {
    initializeApp, getAuth,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut,
    getFirestore, doc, getDoc, setDoc, addDoc, collection,
    query, where, getDocs, updateDoc, serverTimestamp,
  } = window.__fm;

  const firebaseApp = initializeApp(FIREBASE_CONFIG);
  const auth        = getAuth(firebaseApp);
  const db          = getFirestore(firebaseApp);
  await setPersistence(auth, browserLocalPersistence);
  const $           = id => document.getElementById(id);

  /* ── DOM ──────────────────────────────────────────────────── */
  const loadingScreen   = $('loading-screen');
  const authScreen      = $('auth-screen');
  const usernameScreen  = $('username-screen');
  const appScreen       = $('app-screen');
  const writeScreen     = $('write-screen');

  const loginForm       = $('login-form');
  const signupForm      = $('signup-form');
  const loginBtn        = $('login-btn');
  const signupBtn       = $('signup-btn');
  const loginEmail      = $('login-email');
  const loginPassword   = $('login-password');
  const signupEmail     = $('signup-email');
  const signupPassword  = $('signup-password');
  const loginError      = $('login-error');
  const signupError     = $('signup-error');
  const guestBtn        = $('guest-btn');

  const usernameInput   = $('username-input');
  const usernameBtn     = $('username-btn');
  const usernameError   = $('username-error');
  const usernamePreview = $('username-preview');

  const currentUsernameEl = $('current-username');
  const visitorBanner     = $('visitor-banner');
  const jarOwnerName      = $('jar-owner-name');
  const jarWrapper        = $('jar-wrapper');
  const noteCountBadge    = $('note-count-badge');
  const noteCountEl       = $('note-count');
  const dropNoteBtn       = $('drop-note-btn');
  const openNoteBtn       = $('open-note-btn');
  const openLimitMsg      = $('open-limit-msg');
  const guestLimitMsg     = $('guest-limit-msg');
  const signupPromptBtn   = $('signup-prompt-btn');

  const closeWriteBtn   = $('close-write');
  const noteContent     = $('note-content');
  const charCountEl     = $('char-count');
  const toUsername      = $('to-username');
  const findUserBtn     = $('find-user-btn');
  const toError         = $('to-error');
  const toSuccess       = $('to-success');
  const toSuccessName   = $('to-success-name');
  const sendToUserBtn   = $('send-to-user-btn');
  const genLinkBtn      = $('gen-link-btn');
  const genLinkResult   = $('gen-link-result');
  const genLinkInput    = $('gen-link-input');
  const copyGenLink     = $('copy-gen-link');
  const sendError       = $('send-error');

  const openModal         = $('open-modal');
  const closeOpenModal    = $('close-open-modal');
  const noteSender        = $('note-sender');
  const openedNoteContent = $('opened-note-content');
  const noteTs            = $('note-ts');

  const journalModal      = $('journal-modal');
  const closeJournalModal = $('close-journal-modal');
  const journalList       = $('journal-list');
  const journalBtn        = $('journal-btn');

  const shareModal      = $('share-modal');
  const closeShareModal = $('close-share-modal');
  const shareLinkInput  = $('share-link-input');
  const copyLinkBtn     = $('copy-link-btn');
  const copyConfirm     = $('copy-confirm');
  const shareBtn        = $('share-btn');

  const logoutBtn  = $('logout-btn');
  const flyingNote = $('flying-note');
  const toast      = $('toast');

  /* ── Sounds ───────────────────────────────────────────────── */
  const sndPop  = new Audio('assets/pop-cork.mp3');
  const sndFold = new Audio('assets/paper-unfold.mp3');
  const sndDrop = new Audio('assets/drop-note.mp3');
  const play = a => { try { a.currentTime = 0; a.play(); } catch(e){} };

  /* ── State ────────────────────────────────────────────────── */
  let currentUser       = null;
  let currentUserDoc    = null;
  let resolvedTarget    = null;
  let pendingLinkNoteId = null;
  let isGuest           = false;
  let guestSentCount    = parseInt(localStorage.getItem('guestSent') || '0');

  /* ════════════════════════════════════════════════════════════
     ░░  JAR NOTE SLIPS  ░░

     renderJarNotes(count, animateLast)
     ------------------------------------
     Clears all existing slips then draws `count` paper slips
     stacked from the BOTTOM of the glass interior upward.

     Physics:
     • Slip 0 (oldest) sits on the glass base.
     • Each subsequent slip is SLIP_STEP_PX higher.
     • Horizontal position is randomised within the jar's
       tapered interior — wider at base, narrower at neck.
     • Rotation alternates so slips look naturally scattered.
     • If animateLast=true the topmost slip plays slipDropIn.

  ════════════════════════════════════════════════════════════ */
  function renderJarNotes(count, animateLast = false) {
    document.querySelectorAll('.jar-note-slip').forEach(el => el.remove());
    if (count <= 0) return;

    const visible = Math.min(count, MAX_VISIBLE_SLIPS);

    // Fixed rotation sequence so layout is deterministic
    const ROTS = [-18, 14, -8, 22, -13, 9, -21, 16, -5, 19];
    // Fixed x-offset multipliers (-1 to 1), varied spread
    const X_POS = [-0.75, 0.65, -0.2, 0.85, -0.5, 0.3, -0.9, 0.1, 0.7, -0.4];

    for (let i = 0; i < visible; i++) {
      const slip = document.createElement('div');
      slip.className = 'jar-note-slip';

      // ── Size ──────────────────────────────────────────────
      const slipW = 15 + (i % 3) * 5;   // 15 | 20 | 25 px
      const slipH = 28 + (i % 4) * 7;   // 28 | 35 | 42 | 49 px

      // ── Vertical position ─────────────────────────────────
      // Bottom of this slip, measured from wrapper top
      const slipBaseY = JAR.baseY - (i * SLIP_STEP_PX);
      const slipTopY  = slipBaseY - slipH;

      // Don't render slips that would poke above the neck
      if (slipTopY < JAR.neckY + 8) break;

      // ── Horizontal spread (tapers with height) ─────────────
      // progress 0 = at base, 1 = at neck
      const progress  = 1 - (slipBaseY - JAR.neckY) / (JAR.baseY - JAR.neckY);
      const halfW     = JAR.halfWBase + (JAR.halfWNeck - JAR.halfWBase) * progress;
      const xOffset   = X_POS[i % X_POS.length] * (halfW - slipW / 2);
      const leftPx    = JAR.centerX + xOffset - slipW / 2;

      // ── Rotation ───────────────────────────────────────────
      const rot = ROTS[i % ROTS.length];

      // ── CSS bottom (from wrapper bottom) ──────────────────
      const bottomPx = JAR.wrapperH - slipBaseY;

      // ── Set CSS var for animation keyframes ───────────────
      slip.style.cssText = `
        position: absolute;
        left:   ${leftPx}px;
        bottom: ${bottomPx}px;
        width:  ${slipW}px;
        height: ${slipH}px;
        background: ${SLIP_COLORS[i % SLIP_COLORS.length]};
        transform: rotate(${rot}deg);
        --r: ${rot}deg;
        border: 1px solid rgba(180,140,90,0.38);
        border-radius: 2px 2px 1px 1px;
        box-shadow: 1px 2px 5px rgba(59,55,40,0.22);
        z-index: 2;
        pointer-events: none;
        transform-origin: bottom center;
      `;

      // Animate only the topmost (newest) slip dropping in
      if (animateLast && i === visible - 1) {
        slip.style.animation = 'slipDropIn 0.5s cubic-bezier(0.34,1.3,0.64,1) forwards';
      }

      jarWrapper.appendChild(slip);
    }
  }

  /* ════════════════════════════════════════════════════════════
     animateTopSlipOut(currentCount)
     — picks the topmost slip, plays slipFallOut, then
       re-renders with count-1 after the animation ends.
  ════════════════════════════════════════════════════════════ */
  function animateTopSlipOut(currentCount) {
    const slips = [...document.querySelectorAll('.jar-note-slip')];
    if (!slips.length) return;
    const top = slips[slips.length - 1];
    top.style.animation = 'slipFallOut 0.6s cubic-bezier(0.42,0,0.58,1) forwards';
    setTimeout(() => renderJarNotes(currentCount - 1), 620);
  }

  /* ════════════════════════════════════════════════════════════
     SCREEN HELPER
  ════════════════════════════════════════════════════════════ */
  function showScreen(el) {
    [loadingScreen, authScreen, usernameScreen, appScreen]
      .forEach(s => s.classList.add('hidden'));
    el.classList.remove('hidden');
  }

  /* ════════════════════════════════════════════════════════════
     AUTH TABS
  ════════════════════════════════════════════════════════════ */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const t = btn.dataset.tab;
      loginForm.classList.toggle ('hidden', t !== 'login');
      signupForm.classList.toggle('hidden', t !== 'signup');
    });
  });

  /* ════════════════════════════════════════════════════════════
     SIGN UP / IN
  ════════════════════════════════════════════════════════════ */
  signupBtn.addEventListener('click', async () => {
    hideErr(signupError);
    const email = signupEmail.value.trim(), pass = signupPassword.value;
    if (!email || !pass) return showErr(signupError, 'Fill in all fields.');
    try {
      signupBtn.disabled = true; signupBtn.textContent = 'Creating…';
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) {
      showErr(signupError, friendlyErr(e.code));
      signupBtn.disabled = false; signupBtn.textContent = 'Create My Jar';
    }
  });

  loginBtn.addEventListener('click', async () => {
    hideErr(loginError);
    const email = loginEmail.value.trim(), pass = loginPassword.value;
    if (!email || !pass) return showErr(loginError, 'Fill in all fields.');
    try {
      loginBtn.disabled = true; loginBtn.textContent = 'Opening…';
      await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) {
      showErr(loginError, friendlyErr(e.code));
      loginBtn.disabled = false; loginBtn.textContent = 'Open My Jar';
    }
  });

  /* ════════════════════════════════════════════════════════════
     GUEST
  ════════════════════════════════════════════════════════════ */
  guestBtn.addEventListener('click', () => {
    isGuest = true;
    currentUserDoc = { username: 'Guest', uid: null };
    loadGuestView();
  });

  signupPromptBtn && signupPromptBtn.addEventListener('click', () => {
    isGuest = false; showScreen(authScreen);
  });

  function loadGuestView() {
    showScreen(appScreen);
    currentUsernameEl.textContent = 'Guest';
    visitorBanner.classList.add('hidden');
    noteCountBadge.classList.add('hidden');
    openNoteBtn.classList.add('hidden');
    openLimitMsg.classList.add('hidden');
    shareBtn.style.visibility   = 'hidden';
    journalBtn.style.visibility = 'hidden';
    renderJarNotes(0);

    if (guestSentCount < GUEST_SEND_LIMIT) {
      dropNoteBtn.classList.remove('hidden');
      guestLimitMsg.classList.add('hidden');
    } else {
      dropNoteBtn.classList.add('hidden');
      guestLimitMsg.classList.remove('hidden');
    }
  }

  /* ════════════════════════════════════════════════════════════
     AUTH STATE
  ════════════════════════════════════════════════════════════ */
  onAuthStateChanged(auth, async user => {
    loginBtn.disabled  = false; loginBtn.textContent  = 'Open My Jar';
    signupBtn.disabled = false; signupBtn.textContent = 'Create My Jar';

    if (!user) {
      if (!isGuest) { currentUser = null; currentUserDoc = null; showScreen(authScreen); }
      return;
    }
    isGuest     = false;
    currentUser = user;
    shareBtn.style.visibility   = '';
    journalBtn.style.visibility = '';

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) {
      showScreen(usernameScreen);
    } else {
      currentUserDoc = { uid: user.uid, ...snap.data() };
      await loadApp();
      await checkClaimNote();
    }
  });

  /* ════════════════════════════════════════════════════════════
     USERNAME PICKER
  ════════════════════════════════════════════════════════════ */
  usernameInput.addEventListener('input', () => {
    const v = usernameInput.value.replace(/[^A-Za-z0-9_]/g, '');
    usernameInput.value         = v;
    usernamePreview.textContent = v || 'yourname';
  });

  usernameBtn.addEventListener('click', async () => {
    hideErr(usernameError);
    const username = usernameInput.value.trim();
    if (username.length < 2)
      return showErr(usernameError, 'At least 2 characters.');
    if (!/^[A-Za-z0-9_]+$/.test(username))
      return showErr(usernameError, 'Letters, numbers, _ only.');

    usernameBtn.disabled = true; usernameBtn.textContent = 'Checking…';
    const uSnap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
    if (uSnap.exists()) {
      showErr(usernameError, 'That name is taken!');
      usernameBtn.disabled = false; usernameBtn.textContent = 'Seal My Jar 🫙'; return;
    }
    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        uid: currentUser.uid, username,
        usernameLower: username.toLowerCase(),
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'usernames', username.toLowerCase()), { uid: currentUser.uid });
      currentUserDoc = { uid: currentUser.uid, username };
      await loadApp();
      await checkClaimNote();
    } catch(e) {
      showErr(usernameError, 'Something went wrong.');
      usernameBtn.disabled = false; usernameBtn.textContent = 'Seal My Jar 🫙';
    }
  });

  /* ════════════════════════════════════════════════════════════
     LOAD APP
  ════════════════════════════════════════════════════════════ */
  async function loadApp() {
    showScreen(appScreen);
    currentUsernameEl.textContent = currentUserDoc.username;
    const routeUser = getRouteUsername();
    if (routeUser && routeUser.toLowerCase() !== currentUserDoc.username.toLowerCase()) {
      await loadVisitorView(routeUser);
    } else {
      await loadOwnerView();
    }
  }

  /* ════════════════════════════════════════════════════════════
     OWNER VIEW
     — fetches all notes, splits client-side (no index needed),
       renders exactly [unopened count] slips in the jar.
  ════════════════════════════════════════════════════════════ */
  async function loadOwnerView() {
    visitorBanner.classList.add('hidden');
    openLimitMsg.classList.add('hidden');
    guestLimitMsg.classList.add('hidden');
    dropNoteBtn.classList.remove('hidden');

    let allNotes = [];
    try {
      const snap = await getDocs(
        query(collection(db, 'notes'), where('receiverID', '==', currentUserDoc.username))
      );
      allNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { console.warn('loadOwnerView:', e); }

    const unopened    = allNotes.filter(n => n.isOpened === false);
    const oneDayAgo   = Date.now() - 10000;
    const openedToday = allNotes.filter(n =>
      n.isOpened === true && (n.openedAt?.toMillis?.() || 0) > oneDayAgo
    );

    const greetings = [
      'your jar is waiting 🕯',
      'someone is thinking of you ✉',
      'a little love is inside 🌸',
      'open one, you deserve it 💛',
    ];
    const g = document.getElementById('jar-greeting');
    if (g) g.textContent = unopened.length > 0
      ? greetings[Math.floor(Math.random() * greetings.length)]
      : 'your jar is empty for now…';

    // Badge
    if (unopened.length > 0) {
      noteCountBadge.classList.remove('hidden');
      noteCountEl.textContent = unopened.length;
    } else {
      noteCountBadge.classList.add('hidden');
    }

    // ★ Draw exactly [unopened.length] slips — no animation on load
    renderJarNotes(unopened.length, false);

    // Open button
    if (unopened.length > 0 && openedToday.length < DAILY_OPEN_LIMIT) {
      openNoteBtn.classList.remove('hidden');
      openLimitMsg.classList.add('hidden');
    } else if (unopened.length > 0) {
      openNoteBtn.classList.add('hidden');
      openLimitMsg.classList.remove('hidden');
    } else {
      openNoteBtn.classList.add('hidden');
    }
  }

  /* ════════════════════════════════════════════════════════════
     VISITOR VIEW
  ════════════════════════════════════════════════════════════ */
  async function loadVisitorView(username) {
    const uSnap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
    if (!uSnap.exists()) { await loadOwnerView(); return; }
    jarOwnerName.textContent = username;
    visitorBanner.classList.remove('hidden');
    dropNoteBtn.classList.remove('hidden');
    openNoteBtn.classList.add('hidden');
    noteCountBadge.classList.add('hidden');
    renderJarNotes(0);
    toUsername.value = username;
    jarWrapper.classList.toggle('has-notes', unopened.length > 0);
  }

  /* ════════════════════════════════════════════════════════════
     WRITE SCREEN
  ════════════════════════════════════════════════════════════ */
  dropNoteBtn.addEventListener('click', openWriteScreen);
  closeWriteBtn.addEventListener('click', closeWriteScreen);

  function openWriteScreen() {
    noteContent.value         = '';
    charCountEl.textContent   = '0';
    resolvedTarget            = null;
    pendingLinkNoteId         = null;
    sendToUserBtn.disabled    = false;
    sendToUserBtn.textContent = 'Fold & Drop into their jar ✉';
    hideErr(toError); hideErr(sendError);
    toSuccess.classList.add('hidden');
    sendToUserBtn.classList.add('hidden');
    genLinkResult.classList.add('hidden');

    const routeUser = getRouteUsername();
    toUsername.value = routeUser || '';
    if (routeUser) {
      resolvedTarget = { username: routeUser };
      toSuccessName.textContent = routeUser;
      toSuccess.classList.remove('hidden');
      sendToUserBtn.classList.remove('hidden');
    }
    writeScreen.classList.remove('hidden');
  }

  function closeWriteScreen() { writeScreen.classList.add('hidden'); }

  noteContent.addEventListener('input', () => {
    charCountEl.textContent = noteContent.value.length;
  });

  /* ════════════════════════════════════════════════════════════
     FIND USER
  ════════════════════════════════════════════════════════════ */
  findUserBtn.addEventListener('click', findUser);
  toUsername.addEventListener('keydown', e => { if (e.key === 'Enter') findUser(); });

  async function findUser() {
    hideErr(toError);
    toSuccess.classList.add('hidden');
    sendToUserBtn.classList.add('hidden');
    resolvedTarget = null;

    const name = toUsername.value.trim();
    if (!name) return showErr(toError, 'Enter a username.');
    if (!isGuest && currentUserDoc?.username?.toLowerCase() === name.toLowerCase())
      return showErr(toError, "You can't send to yourself 😊");

    findUserBtn.textContent = '…'; findUserBtn.disabled = true;
    const snap = await getDoc(doc(db, 'usernames', name.toLowerCase()));
    findUserBtn.textContent = 'Find'; findUserBtn.disabled = false;

    if (!snap.exists()) return showErr(toError, `No jar found for "${name}"`);

    const userSnap = await getDoc(doc(db, 'users', snap.data().uid));
    const realName = userSnap.exists() ? userSnap.data().username : name;
    resolvedTarget = { username: realName };
    toSuccessName.textContent = realName;
    toSuccess.classList.remove('hidden');
    sendToUserBtn.classList.remove('hidden');
  }

  /* ════════════════════════════════════════════════════════════
     SEND NOTE
  ════════════════════════════════════════════════════════════ */
  sendToUserBtn.addEventListener('click', async () => {
    hideErr(sendError);
    const text = noteContent.value.trim();
    if (!text)           return showErr(sendError, 'Write something first!');
    if (!resolvedTarget) return showErr(sendError, 'Find a recipient first.');
    if (isGuest && guestSentCount >= GUEST_SEND_LIMIT) {
      closeWriteScreen(); loadGuestView(); return;
    }

    sendToUserBtn.disabled    = true;
    sendToUserBtn.textContent = 'Sending…';

    try {
      await addDoc(collection(db, 'notes'), {
        senderID:   isGuest ? 'anonymous' : currentUserDoc.username,
        receiverID: resolvedTarget.username,
        content:    text,
        timestamp:  serverTimestamp(),
        isOpened:   false,
        openedAt:   null,
      });

      if (isGuest) { guestSentCount++; localStorage.setItem('guestSent', guestSentCount); }

      closeWriteScreen();
      await triggerSendAnimation();
      showToast(`Dropped into ${resolvedTarget.username}'s jar! 🫙`);

      // If sender is looking at their own jar, refresh it (count didn't change for them)
      // If they sent to themselves (not allowed) this is a no-op either way
      if (!isGuest) await loadOwnerView(); else loadGuestView();

    } catch(e) {
      showErr(sendError, 'Could not send — try again.');
      sendToUserBtn.disabled    = false;
      sendToUserBtn.textContent = 'Fold & Drop into their jar ✉';
    }
  });

  /* ════════════════════════════════════════════════════════════
     SEND ANIMATION — note folds and flies into jar
  ════════════════════════════════════════════════════════════ */
  async function triggerSendAnimation() {
    play(sndFold);
    // Force restart by cloning the animated element
    const oldFni = flyingNote.querySelector('.fni');
    const newFni = oldFni.cloneNode(true);
    oldFni.replaceWith(newFni);
    flyingNote.classList.remove('hidden');
    await sleep(1150);
    play(sndDrop);
    await sleep(550);
    flyingNote.classList.add('hidden');
  }

  /* ════════════════════════════════════════════════════════════
     GENERATE SHAREABLE LINK
  ════════════════════════════════════════════════════════════ */
  genLinkBtn.addEventListener('click', async () => {
    const text = noteContent.value.trim();
    if (!text) return showErr(sendError, 'Write your note first!');
    genLinkBtn.disabled    = true;
    genLinkBtn.textContent = 'Generating…';
    try {
      const docRef = await addDoc(collection(db, 'notes'), {
        senderID:   isGuest ? 'anonymous' : (currentUserDoc?.username || 'anonymous'),
        receiverID: null,
        content:    text,
        timestamp:  serverTimestamp(),
        isOpened:   false,
        openedAt:   null,
        linkNote:   true,
      });
      pendingLinkNoteId  = docRef.id;
      genLinkInput.value = `${window.location.origin}${window.location.pathname}?claimNote=${docRef.id}`;
      genLinkResult.classList.remove('hidden');
    } catch(e) { showErr(sendError, 'Could not generate link.'); }
    genLinkBtn.disabled    = false;
    genLinkBtn.textContent = 'Get a Drop Link 🔗';
  });

  copyGenLink.addEventListener('click', () => {
    navigator.clipboard.writeText(genLinkInput.value).catch(() => {});
    showToast('Link copied! Share it 🔗');
  });

  /* ════════════════════════════════════════════════════════════
     CLAIM NOTE FROM LINK  (?claimNote=ID)
  ════════════════════════════════════════════════════════════ */
  async function checkClaimNote() {
    const noteId = new URLSearchParams(window.location.search).get('claimNote');
    if (!noteId || !currentUserDoc) return;
    try {
      const ref  = doc(db, 'notes', noteId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.receiverID === null || data.receiverID === undefined) {
        await updateDoc(ref, { receiverID: currentUserDoc.username });
        window.history.replaceState({}, '', window.location.pathname);
        showToast('A note just dropped into your jar! 🫙');
        await loadOwnerView();
      }
    } catch(e) { console.warn('checkClaimNote:', e); }
  }

  /* ════════════════════════════════════════════════════════════
     OPEN NOTE
     Timeline:
       0ms   — Cork pops off + sound
       280ms — Top slip flies out of jar
       720ms — Cork settles back down
       880ms — Modal appears with noteUnfold animation + sound
  ════════════════════════════════════════════════════════════ */
  openNoteBtn.addEventListener('click', async () => {
    openNoteBtn.disabled = true;

    // Fetch oldest unopened note (client-side sort, no index)
    let noteDoc = null;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'notes'),
          where('receiverID', '==', currentUserDoc.username),
          where('isOpened',   '==', false)
        )
      );
      if (!snap.empty) {
        noteDoc = snap.docs.sort(
          (a, b) => (a.data().timestamp?.toMillis?.() || 0) - (b.data().timestamp?.toMillis?.() || 0)
        )[0];
      }
    } catch(e) { console.error('open note fetch:', e); }

    if (!noteDoc) {
      openNoteBtn.disabled = false;
      await loadOwnerView();
      return;
    }

    const nd = noteDoc.data();

    // Mark opened immediately so double-tap can't open twice
    try {
      await updateDoc(doc(db, 'notes', noteDoc.id), {
        isOpened: true,
        openedAt: serverTimestamp(),
      });
    } catch(e) { console.error('updateDoc:', e); }

    // How many slips are currently showing (before this open)
    const slipsBefore = document.querySelectorAll('.jar-note-slip').length;

    // ① Cork pops off
    play(sndPop);
    jarWrapper.classList.add('lid-open');

    // ② Top slip flies out
    await sleep(280);
    animateTopSlipOut(slipsBefore);

    // ③ Cork comes back
    await sleep(440);
    jarWrapper.classList.remove('lid-open');

    // ④ Note unfolds in modal
    await sleep(160);

    noteSender.textContent        = nd.senderID || 'anonymous';
    openedNoteContent.textContent = nd.content  || '';
    const ts = nd.timestamp?.toDate?.();
    noteTs.textContent = ts ? formatDate(ts) : '';

    openModal.classList.remove('hidden');

    // Force animation replay
    const card = openModal.querySelector('.modal-card');
    if (card) {
      card.classList.remove('note-unfold-anim');
      void card.offsetWidth;                     // reflow trigger
      card.classList.add('note-unfold-anim');
    }

    play(sndFold);
    openNoteBtn.disabled = false;

    // Full refresh after animations settle
    setTimeout(() => loadOwnerView(), 1600);
  });

  const dismissOpenModal = () => {
    openModal.classList.add('hidden');
    const card = openModal.querySelector('.modal-card');
    if (card) card.classList.remove('note-unfold-anim');
  };
  closeOpenModal.addEventListener('click', dismissOpenModal);
  openModal.addEventListener('click', e => { if (e.target === openModal) dismissOpenModal(); });

  /* ════════════════════════════════════════════════════════════
     JOURNAL
  ════════════════════════════════════════════════════════════ */
  journalBtn.addEventListener('click', async () => {
    if (isGuest) return;
    journalList.innerHTML = '<p class="empty-state">Loading…</p>';
    journalModal.classList.remove('hidden');

    try {
      const snap = await getDocs(
        query(
          collection(db, 'notes'),
          where('receiverID', '==', currentUserDoc.username),
          where('isOpened',   '==', true)
        )
      );
      const docs = snap.docs.sort(
        (a, b) => (b.data().openedAt?.toMillis?.() || 0) - (a.data().openedAt?.toMillis?.() || 0)
      );

      if (!docs.length) {
        journalList.innerHTML = '<p class="empty-state">No opened notes yet…</p>';
        return;
      }

      journalList.innerHTML = '';
      docs.forEach(d => {
        const data = d.data();
        const ts   = (data.openedAt || data.timestamp)?.toDate?.();
        const el   = document.createElement('div');
        el.className = 'journal-entry';
        el.innerHTML = `
          <img src="assets/note.png" alt="" class="journal-entry-bg"/>
          <div class="journal-entry-body">
            <p class="journal-entry-from">from <span>${esc(data.senderID || 'anonymous')}</span></p>
            <p class="journal-entry-text">${esc(data.content)}</p>
            <p class="journal-entry-date">${ts ? formatDate(ts) : ''}</p>
          </div>`;
        journalList.appendChild(el);
      });
    } catch(e) {
      journalList.innerHTML = '<p class="empty-state">Could not load. Try again.</p>';
    }
  });

  closeJournalModal.addEventListener('click', () => journalModal.classList.add('hidden'));
  journalModal.addEventListener('click', e => {
    if (e.target === journalModal) journalModal.classList.add('hidden');
  });

  /* ════════════════════════════════════════════════════════════
     SHARE
  ════════════════════════════════════════════════════════════ */
  shareBtn.addEventListener('click', () => {
    if (isGuest) return;
    shareLinkInput.value = `${window.location.origin}/u/${currentUserDoc.username}`;
    copyConfirm.classList.add('hidden');
    shareModal.classList.remove('hidden');
  });
  copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLinkInput.value).catch(() => {});
    copyConfirm.classList.remove('hidden');
    setTimeout(() => copyConfirm.classList.add('hidden'), 2500);
  });
  closeShareModal.addEventListener('click', () => shareModal.classList.add('hidden'));
  shareModal.addEventListener('click', e => {
    if (e.target === shareModal) shareModal.classList.add('hidden');
  });

  /* ════════════════════════════════════════════════════════════
     LOGOUT / JAR CLICK SHORTCUT
  ════════════════════════════════════════════════════════════ */
  logoutBtn.addEventListener('click', () => { isGuest = false; signOut(auth); });

  jarWrapper.addEventListener('click', () => {
    if (!openNoteBtn.classList.contains('hidden') && !openNoteBtn.disabled) {
      openNoteBtn.click(); return;
    }
    if (!dropNoteBtn.classList.contains('hidden')) dropNoteBtn.click();
  });

  /* ════════════════════════════════════════════════════════════
     URL ROUTING
  ════════════════════════════════════════════════════════════ */
  function getRouteUsername() {
    const m = window.location.pathname.match(/^\/u\/([A-Za-z0-9_]{1,20})$/);
    return m ? m[1] : null;
  }

  /* ════════════════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════════════════ */
  function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
  function hideErr(el)      { el.classList.add('hidden'); }
  function sleep(ms)        { return new Promise(r => setTimeout(r, ms)); }
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatDate(d) {
    return d.toLocaleDateString('en-IN', {
      day:'numeric', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit',
    });
  }
  function friendlyErr(code) {
    return ({
      'auth/user-not-found'      : 'No account with that email.',
      'auth/wrong-password'      : 'Incorrect password.',
      'auth/invalid-credential'  : 'Incorrect email or password.',
      'auth/email-already-in-use': 'Email already in use.',
      'auth/invalid-email'       : 'Enter a valid email.',
      'auth/weak-password'       : 'Password needs 6+ chars.',
      'auth/too-many-requests'   : 'Too many attempts. Try later.',
    })[code] || 'Something went wrong.';
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  setTimeout(() => loadingScreen.classList.add('hidden'), 3000);
}
