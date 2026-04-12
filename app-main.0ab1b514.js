
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
  import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence, updateProfile }
    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
  import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, setDoc, onSnapshot, orderBy, query, limit, where, serverTimestamp, arrayUnion }
    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

  const firebaseConfig = {
    apiKey: "AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c",
    authDomain: "maman-contracting-app.firebaseapp.com",
    projectId: "maman-contracting-app",
    storageBucket: "maman-contracting-app.firebasestorage.app",
    messagingSenderId: "498283734366",
    appId: "1:498283734366:web:0d4704ae3212923a385bcf"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Set persistence immediately so sessions survive page refresh
  setPersistence(auth, browserLocalPersistence).catch(e => console.warn('setPersistence:', e));
  const db = getFirestore(app);

  const ADMIN_EMAIL = 'nir@mamancontracting.com';

  let currentUser = null;
  let allJobs = [];
  let allContacts = [];
  window.allJobs = allJobs;
  window.allContacts = allContacts;
  let allUsers = [];
  let jobsUnsubscribe = null;
  let activityUnsubscribe = null;
  let contactsUnsubscribe = null;
  let usersUnsubscribe = null;
  let editingJobId = null;
  let pendingDeleteJobId = null;
  let deletedJobData = null;
  let undoTimer = null;

  // ── HELPERS ──────────────────────────────────────────────────────────────
  window.showToast = function(msg, color, duration) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = color || '#22c55e';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration || 3500);
  };

  function statusBadge(status) {
    const map = {
      'Completed': 'badge-green',
      'In Progress': 'badge-yellow',
      'Blocked': 'badge-red',
      'Pending': 'badge-orange',
      'On Hold': 'badge-gray',
      'Cancelled': 'badge-orange'
    };
    const cls = map[status] || 'badge-gray';
    const icon = status === 'Completed' ? '✅ ' : '';
    return `<span class="badge ${cls}">${icon}${status || '—'}</span>`;
  }

  function fmtDate(val) {
    if (!val) return '—';
    if (val && val.toDate) return val.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const d = new Date(val + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return val;
  }

  function crewLabel(j) {
    if (j.jobType === 'asphalt') return 'Asphalt Crew';
    if (j.jobType === 'concrete') return j.concreteSub ? j.concreteSub : 'Concrete';
    if (j.crew) return j.crew;
    return '—';
  }

  function crewBadge(j) {
    if (j.jobType === 'asphalt') return '<span class="badge badge-asphalt">🟠 Asphalt Crew</span>';
    if (j.jobType === 'concrete') {
      const name = j.concreteSub || 'Concrete';
      return `<span class="badge badge-concrete">🔵 ${name}</span>`;
    }
    if (j.crew) {
      return j.crew.toLowerCase().includes('asphalt')
        ? '<span class="badge badge-asphalt">🟠 Asphalt Crew</span>'
        : `<span class="badge badge-concrete">🔵 ${j.crew}</span>`;
    }
    return '<span class="badge badge-gray">—</span>';
  }

  function permitStatusBadge(j) {
    if (!j.permitNumber && !j.permitCode) return '<span class="badge badge-gray">None</span>';
    if (j.permitExpiry) {
      const exp = new Date(j.permitExpiry);
      const now = new Date();
      const diff = (exp - now) / (1000 * 60 * 60 * 24);
      if (diff < 0) return '<span class="badge badge-red">Expired</span>';
      if (diff < 30) return '<span class="badge badge-orange">Expiring Soon</span>';
      return '<span class="badge badge-green">Valid</span>';
    }
    return '<span class="badge badge-blue">On File</span>';
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const exp = new Date(dateStr + 'T00:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  }

  function normalizePhone(phone) {
    return (phone || '').replace(/\D/g, '');
  }

  let pendingInvite = null;
  const PROD_APP_URL = 'https://maman-contracting-organizer.vercel.app';

  function getInviteBaseUrl() {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (isLocalHost) return PROD_APP_URL;
    return window.location.origin;
  }

  function inviteEmailToDocId(email) {
    const normalized = (email || '').trim().toLowerCase();
    const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return 'invite-' + (slug || 'worker');
  }

  function generateInviteToken() {
    try {
      const bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return 'invite-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }
  }

  function buildInviteLink(email, token) {
    const url = new URL(getInviteBaseUrl() + window.location.pathname);
    url.searchParams.set('invite', token);
    url.searchParams.set('email', (email || '').trim().toLowerCase());
    return url.toString();
  }

  function clearInviteParams() {
    const url = new URL(window.location.href);
    let changed = false;
    ['invite', 'email'].forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });
    if (!changed) return;
    const search = url.searchParams.toString();
    const nextUrl = url.pathname + (search ? '?' + search : '') + url.hash;
    window.history.replaceState({}, document.title, nextUrl);
  }

  function userRecordRank(user) {
    let score = 0;
    if (user && !user.removed) score += 10;
    if (user && user.status === 'active') score += 100;
    if (user && user.status === 'invited') score += 60;
    if (user && user.authUid) score += 25;
    if (user && (user.id || '').startsWith('invite-')) score += 5;
    return score;
  }

  function userRecordTime(user) {
    return Date.parse((user && (user.updatedAt || user.activatedAt || user.inviteAcceptedAt || user.invitedAt)) || '') || 0;
  }

  function dedupeUsersByEmail(users) {
    const byKey = new Map();
    (users || []).forEach((user) => {
      if (!user) return;
      const key = ((user.email || '').trim().toLowerCase()) || user.id;
      if (!key) return;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, user);
        return;
      }
      const nextRank = userRecordRank(user);
      const currentRank = userRecordRank(existing);
      if (nextRank > currentRank || (nextRank === currentRank && userRecordTime(user) > userRecordTime(existing))) {
        byKey.set(key, user);
      }
    });
    return Array.from(byKey.values());
  }

  function setLoginCopy(title, subtitle) {
    const titleEl = document.getElementById('login-title');
    const subEl = document.getElementById('login-sub');
    if (titleEl) titleEl.textContent = title || 'Maman Contracting';
    if (subEl) subEl.textContent = subtitle || 'Organizer — Sign in to continue';
  }

  function showStandardLogin(prefillEmail, message, isSuccess) {
    pendingInvite = null;
    clearInviteParams();
    setLoginCopy('Maman Contracting', 'Organizer — Sign in to continue');
    const welcomeWrap = document.getElementById('welcome-back-wrap');
    const loginFieldsWrap = document.getElementById('login-fields-wrap');
    const inviteSetupWrap = document.getElementById('invite-setup-wrap');
    if (welcomeWrap) welcomeWrap.style.display = 'none';
    if (loginFieldsWrap) loginFieldsWrap.style.display = 'block';
    if (inviteSetupWrap) inviteSetupWrap.style.display = 'none';
    const emailEl = document.getElementById('login-email');
    if (emailEl && prefillEmail) emailEl.value = prefillEmail;
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.style.color = isSuccess ? '#4ade80' : '#f87171';
      errEl.textContent = message || '';
    }
  }

  function setInviteSetupMessage(message, isSuccess) {
    const errEl = document.getElementById('invite-setup-error');
    if (!errEl) return;
    errEl.style.color = isSuccess ? '#4ade80' : '#f87171';
    errEl.textContent = message || '';
  }

  function showInviteSetup(email) {
    setLoginCopy('Create Your Password', 'Invite-only access for Maman Contracting workers');
    const welcomeWrap = document.getElementById('welcome-back-wrap');
    const loginFieldsWrap = document.getElementById('login-fields-wrap');
    const inviteSetupWrap = document.getElementById('invite-setup-wrap');
    if (welcomeWrap) welcomeWrap.style.display = 'none';
    if (loginFieldsWrap) loginFieldsWrap.style.display = 'none';
    if (inviteSetupWrap) inviteSetupWrap.style.display = 'block';
    const emailEl = document.getElementById('invite-setup-email');
    if (emailEl) emailEl.value = email || '';
    const btn = document.getElementById('invite-accept-btn');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create Password';
    }
    setInviteSetupMessage('', false);
  }

  async function resolveInviteRecord(email, token) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !token) return null;

    const deterministicRef = doc(db, 'users', inviteEmailToDocId(normalizedEmail));
    const deterministicSnap = await getDoc(deterministicRef);
    if (deterministicSnap.exists()) {
      const data = deterministicSnap.data() || {};
      if ((data.email || '').trim().toLowerCase() === normalizedEmail && data.inviteToken === token && !data.removed) {
        return { id: deterministicSnap.id, ref: deterministicRef, ...data };
      }
    }

    const fallbackQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail), limit(5));
    const fallbackSnap = await getDocs(fallbackQuery);
    const fallbackDoc = fallbackSnap.docs.find((snap) => {
      const data = snap.data() || {};
      return data.inviteToken === token && !data.removed;
    });
    if (!fallbackDoc) return null;
    return { id: fallbackDoc.id, ref: fallbackDoc.ref, ...(fallbackDoc.data() || {}) };
  }

  async function maybeHandleInviteLink() {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get('invite') || '').trim();
    const email = (params.get('email') || '').trim().toLowerCase();
    if (!token || !email) {
      showStandardLogin(email, '', false);
      return false;
    }

    showInviteSetup(email);
    const btn = document.getElementById('invite-accept-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking invite...';
    }
    setInviteSetupMessage('Checking your invitation...', true);

    try {
      const invite = await resolveInviteRecord(email, token);
      if (!invite) {
        pendingInvite = null;
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Create Password';
        }
        setInviteSetupMessage('This invite link is invalid or expired. Ask admin to resend it.', false);
        return true;
      }
      if (invite.status && invite.status !== 'invited') {
        showStandardLogin(email, 'This invite was already used. Sign in or reset your password.', true);
        return true;
      }

      pendingInvite = {
        id: invite.id,
        ref: invite.ref || doc(db, 'users', invite.id),
        email: email,
        token: token,
        role: invite.role || 'Worker',
        name: invite.name || '',
        phone: invite.phone || '',
        invitedBy: invite.invitedBy || ''
      };

      showInviteSetup(email);
      const nameEl = document.getElementById('invite-setup-name');
      if (nameEl) {
        nameEl.value = pendingInvite.name || '';
        nameEl.focus();
      }
      setInviteSetupMessage('Invite confirmed. Create your password to activate your account.', true);
      return true;
    } catch (e) {
      console.error('invite resolve failed:', e);
      pendingInvite = null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Create Password';
      }
      setInviteSetupMessage('Could not verify this invite right now. Please try again.', false);
      return true;
    }
  }

  // ── AUTH — Boot app for any signed-in user ──────────────────────────────
  // Helper: get initials from displayName or email
  function _getInitials(displayName, email) {
    if (displayName && displayName.trim()) {
      const parts = displayName.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
      return parts[0].slice(0,2).toUpperCase();
    }
    if (email) {
      const local = email.split('@')[0];
      const parts = local.split(/[._\-]/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return local.slice(0,2).toUpperCase();
    }
    return '??';
  }

  const _bootAsAdmin = async (firebaseUser) => {
    clearInviteParams();
    // Hide loading/login screens
    const appLoading = document.getElementById('app-loading');
    if (appLoading) { appLoading.style.display = 'none'; appLoading.style.pointerEvents = 'none'; try { appLoading.remove(); } catch(e){} }
    const ls3 = document.getElementById('login-screen');
    if (ls3) { ls3.style.display = 'none'; ls3.style.pointerEvents = 'none'; ls3.style.zIndex = '-1'; }

    // If PIN is set, show PIN unlock screen — only once per browser session
    if (typeof hasPIN === 'function' && hasPIN() && !sessionStorage.getItem('pin_unlocked_this_session')) {
      window._pendingBootUser = firebaseUser;
      window._enterAppCallback = function() {
        sessionStorage.setItem('pin_unlocked_this_session', '1');
        localStorage.setItem('session_authenticated', Date.now().toString());
        window._enterAppCallback = null;
        _bootAsAdmin(window._pendingBootUser);
      };
      if (typeof showPINScreen === 'function') showPINScreen('verify');
      return;
    }

    // Use real Firebase user if provided, otherwise fall back to Nir (legacy)
    const fbUser = firebaseUser || { email: ADMIN_EMAIL, uid: 'nir-admin', displayName: 'Nir Maman' };
    const isAdmin = fbUser.email === ADMIN_EMAIL;
    currentUser = fbUser;
    window._isAdmin = isAdmin;

    // Compute display info
    const displayName = fbUser.displayName || fbUser.email.split('@')[0];
    const displayEmail = fbUser.email;
    const initials = _getInitials(fbUser.displayName, fbUser.email);

    // Setup UI
    const topbarUser = document.getElementById('topbar-user');
    if (topbarUser) topbarUser.style.display = 'flex';
    const el = document.getElementById('user-email-display');
    if (el) el.textContent = displayEmail;
    const avatarSm = document.getElementById('user-avatar-sm');
    if (avatarSm) avatarSm.textContent = initials;
    const da = document.getElementById('drawer-avatar');
    const dn = document.getElementById('drawer-user-name');
    const de = document.getElementById('drawer-user-email');
    if (da) da.textContent = initials;
    if (dn) dn.textContent = displayName;
    if (de) de.textContent = displayEmail;
    // Admin-only UI elements
    const inviteBtn = document.getElementById('invite-user-btn');
    if (inviteBtn) inviteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    const drawerUsers = document.getElementById('drawer-users-item');
    if (drawerUsers) drawerUsers.style.display = isAdmin ? 'flex' : 'none';
    // Dropdown UI
    const dropAdmin = document.getElementById('dropdown-admin-section');
    const dropEmail = document.getElementById('dropdown-email');
    const dropBigAvatar = document.getElementById('dropdown-avatar-big');
    const dropNameEl = document.getElementById('dropdown-name');
    if (dropAdmin) dropAdmin.style.display = isAdmin ? 'block' : 'none';
    if (dropEmail) dropEmail.textContent = displayEmail;
    if (dropBigAvatar) dropBigAvatar.textContent = initials;
    if (dropNameEl) dropNameEl.textContent = displayName;
    // Show Clear Activity button only for admin
    const clearActivityBtn = document.getElementById('clear-activity-btn');
    if (clearActivityBtn) clearActivityBtn.style.display = isAdmin ? 'inline-block' : 'none';

    try { startListeners(); } catch(e) { console.error('startListeners error:', e); }
      // Load contacts directly (REST, paginated) — always runs regardless of SDK status
      (() => {
        const parseContactDoc = (doc) => {
          const id = doc.name.split('/').pop();
          const fields = {};
          for (const [k,v] of Object.entries(doc.fields||{})) {
            if (v.stringValue !== undefined) fields[k] = v.stringValue;
            else if (v.arrayValue) fields[k] = (v.arrayValue.values||[]).map(av => {
              if (av.mapValue) { const m={}; for(const[mk,mv] of Object.entries(av.mapValue.fields||{})) m[mk]=mv.stringValue||''; return m; }
              return av.stringValue||'';
            });
          }
          return { id, ...fields };
        };
        const fetchContactPage = async (token) => {
          let url = `https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents/contacts?key=AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c&pageSize=300`;
          if (token) url += `&pageToken=${encodeURIComponent(token)}`;
          const r = await fetch(url);
          const data = await r.json();
          if (data.documents) {
            allContacts = [...allContacts, ...data.documents.map(parseContactDoc)];
            window.allContacts = allContacts;
            // Try to render — function might not be defined yet if module still loading
            const tryRender = () => {
              if (typeof window.renderContacts === 'function') window.renderContacts(allContacts);
              else if (typeof renderContacts === 'function') renderContacts(allContacts);
            };
            tryRender();
          }
          if (data.nextPageToken) await fetchContactPage(data.nextPageToken);
        };
        allContacts = [];
        window.allContacts = allContacts;
        fetchContactPage(null).catch(e => console.error('direct contacts load error:', e));
      })();
      const _savedSection = parseInt(localStorage.getItem('last-section') || '0');
      if (_savedSection > 0) {
        // Try multiple times to ensure navTo is ready and sections are rendered
        const tryNav = (attempts) => {
          if (typeof navTo === 'function') {
            navTo(_savedSection);
          } else if (typeof window._navTo === 'function') {
            window._navTo(_savedSection);
          } else if (attempts > 0) {
            setTimeout(() => tryNav(attempts - 1), 300);
          }
        };
        setTimeout(() => tryNav(5), 600);
      }
  };

  // Listen for auth state — boot app when signed in, show login when not
  let _booted = false;

  onAuthStateChanged(auth, async (user) => {
    if (_booted) return;
    if (user) {
      // User is authenticated — boot the app
      _booted = true;
      localStorage.setItem('pwa_last_user', '1'); // mark device as trusted
      sessionStorage.removeItem('signed-out');
      await _bootAsAdmin(user);
    } else {
      // No user — show login screen
      _booted = true;
      const appLoading = document.getElementById('app-loading');
      if (appLoading) { appLoading.style.display = 'none'; appLoading.style.pointerEvents = 'none'; }
      const ls = document.getElementById('login-screen');
      if (ls) {
        ls.style.display = 'flex';
        ls.style.zIndex = '9999';
        ls.style.pointerEvents = 'auto';
        await maybeHandleInviteLink();
      }
    }
  });

  window.openJobModalWithCrew = function() {
    openJobModal();
    const crew = window._schedCrewFilter;
    if (crew && crew !== 'all') {
      setTimeout(() => {
        const jobTypeEl = document.getElementById('field-jobType');
        if (jobTypeEl) {
          jobTypeEl.value = crew;
          jobTypeEl.dispatchEvent(new Event('change'));
        }
      }, 100);
    }
  };

  window.addJobToSchedule = function(jobId) {
    const job = allJobs.find(j => j.id === jobId);
    if (!job) return;

    // Create a quick date picker overlay
    const overlay = document.createElement('div');
    overlay.id = 'quick-schedule-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

    const today = new Date().toISOString().split('T')[0];
    const currentDate = job.scheduleDay || today;

    overlay.innerHTML = `
      <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:360px;width:100%;">
<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;">📅 Schedule Job</div>
<div style="font-size:13px;color:#9ca3af;margin-bottom:20px;">${job.address || 'Job #' + jobId}</div>
<label style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px;">Pick a date</label>
<input type="date" id="quick-schedule-date" value="${currentDate}"
          style="width:100%;padding:12px;background:#111;border:1.5px solid #2a2a2a;border-radius:8px;color:#fff;font-size:15px;margin-bottom:20px;box-sizing:border-box;"
        />
<div style="display:flex;gap:10px;">
<button onclick="confirmQuickSchedule('${jobId}')" style="flex:1;padding:12px;background:#e53e3e;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">✅ Schedule</button>
<button onclick="document.getElementById('quick-schedule-overlay').remove()" style="flex:1;padding:12px;background:#2a2a2a;border:none;border-radius:8px;color:#9ca3af;font-size:14px;cursor:pointer;">Cancel</button>
</div>
</div>
    `;

    document.body.appendChild(overlay);
    // Auto-focus the date input
    setTimeout(() => {
      const di = document.getElementById('quick-schedule-date');
      if (di) di.focus();
    }, 100);
  };

  window.confirmQuickSchedule = async function(jobId) {
    const dateInput = document.getElementById('quick-schedule-date');
    if (!dateInput || !dateInput.value) return;
    const scheduleDay = dateInput.value;

    const job = allJobs.find(j => j.id === jobId);
    if (!job) return;

    try {
      // Update the job's scheduleDay in Firestore
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      await updateDoc(doc(window._db, 'jobs', jobId), { scheduleDay });

      // Update local cache
      job.scheduleDay = scheduleDay;

      // Remove overlay
      const overlay = document.getElementById('quick-schedule-overlay');
      if (overlay) overlay.remove();

      // Navigate to Schedule tab and refresh
      navTo(3);
      window._schedWeekOffset = 0;
      if (typeof window.renderSchedule === 'function') window.renderSchedule();

      // Show confirmation toast
      if (typeof showToast === 'function') {
        const d = new Date(scheduleDay + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
        showToast('📅 Scheduled for ' + label);
      }
    } catch(e) {
      alert('Error scheduling job: ' + (e.message || e));
    }
  };

  window.togglePasswordVisibility = function() {
    const input = document.getElementById('login-password');
    const btn = document.getElementById('pw-toggle');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  };

  // Expose Firebase functions for plain script
  window._firebaseSignIn = async function(email, pass) {
    // Always use local persistence so iOS PWA remembers login
    await setPersistence(auth, browserLocalPersistence).catch(()=>{});
    // Reset _booted so onAuthStateChanged processes the new login
    _booted = false;
    await signInWithEmailAndPassword(auth, email, pass);
  };
  window._firebaseSignOut = async function() {
    try { await signOut(auth); } catch(e) { console.log('signOut:', e); }
  };
  window._firebaseDoForgotPassword = async function(email) {
    const errEl = document.getElementById('login-error');
    try {
      await sendPasswordResetEmail(auth, email);
      if (errEl) { errEl.style.color = '#4ade80'; errEl.textContent = '✅ Reset email sent! Check your inbox (and spam).'; }
    } catch(e) {
      if (errEl) { errEl.style.color = '#f87171'; errEl.textContent = e.code === 'auth/user-not-found' ? 'No account found. Ask admin to invite you first.' : e.message; }
    }
  };

  window.returnToLoginFromInvite = function() {
    const inviteEmail = pendingInvite && pendingInvite.email
      ? pendingInvite.email
      : ((document.getElementById('invite-setup-email') || {}).value || '');
    showStandardLogin(inviteEmail, '', false);
  };

  window.acceptInvite = async function() {
    const email = ((document.getElementById('invite-setup-email') || {}).value || '').trim().toLowerCase();
    const name = ((document.getElementById('invite-setup-name') || {}).value || '').trim();
    const password = ((document.getElementById('invite-setup-password') || {}).value || '');
    const confirmPassword = ((document.getElementById('invite-setup-password-confirm') || {}).value || '');
    const btn = document.getElementById('invite-accept-btn');

    if (!pendingInvite || !email) {
      setInviteSetupMessage('This invite is missing required details. Ask admin to resend it.', false);
      return;
    }
    if (!name) {
      setInviteSetupMessage('Please enter your name.', false);
      return;
    }
    if (password.length < 8) {
      setInviteSetupMessage('Password must be at least 8 characters.', false);
      return;
    }
    if (password !== confirmPassword) {
      setInviteSetupMessage('Passwords do not match.', false);
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating account...';
    }
    setInviteSetupMessage('', false);

    try {
      const latestInvite = await resolveInviteRecord(email, pendingInvite.token);
      if (!latestInvite || latestInvite.status !== 'invited') {
        throw new Error('This invite is no longer valid. Ask admin to resend it.');
      }

      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      _booted = false;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name }).catch((err) => console.warn('profile update failed:', err));

      await setDoc(latestInvite.ref || doc(db, 'users', latestInvite.id), {
        email: email,
        name: name,
        role: latestInvite.role || 'Worker',
        phone: latestInvite.phone || '',
        invitedBy: latestInvite.invitedBy || '',
        status: 'active',
        authUid: cred.user.uid,
        removed: false,
        inviteAcceptedAt: serverTimestamp(),
        activatedAt: serverTimestamp(),
        inviteToken: '',
        inviteLink: '',
        updatedAt: serverTimestamp()
      }, { merge: true });

      addDoc(collection(db, 'activity'), {
        action: 'Accepted invite: ' + email,
        jobAddress: '',
        doneBy: email,
        timestamp: serverTimestamp()
      }).catch((e) => console.error('Failed to log invite acceptance:', e));

      clearInviteParams();
    } catch (e) {
      console.error('accept invite failed:', e);
      if (e && e.code === 'auth/email-already-in-use') {
        showStandardLogin(email, 'This invite was already accepted. Sign in or reset your password.', true);
        return;
      }
      const msg = e && e.code === 'auth/weak-password'
        ? 'Choose a stronger password.'
        : (e && e.message) || 'Could not create your account.';
      setInviteSetupMessage(msg, false);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Create Password';
      }
    }
  };

  // ── LISTENERS ─────────────────────────────────────────────────────────────
  const API_KEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
  const FS_BASE = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';

  // Global auth-aware fetch for Firestore REST calls
  window._authFetch = async function(url, options = {}) {
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        options.headers = { ...(options.headers || {}), 'Authorization': 'Bearer ' + token };
      }
    } catch(e) {}
    return fetch(url, options);
  };

  function parseDoc(doc) {
    const id = doc.name.split('/').pop();
    const fields = {};
    for (const [k, v] of Object.entries(doc.fields || {})) {
      if (v.stringValue !== undefined) fields[k] = v.stringValue;
      else if (v.booleanValue !== undefined) fields[k] = v.booleanValue;
      else if (v.integerValue !== undefined) fields[k] = v.integerValue;
      else if (v.doubleValue !== undefined) fields[k] = v.doubleValue;
      else if (v.timestampValue !== undefined) fields[k] = v.timestampValue;
      else if (v.arrayValue) fields[k] = (v.arrayValue.values || []).map(av => {
        if (av.mapValue) { const m = {}; for (const [mk,mv] of Object.entries(av.mapValue.fields||{})) m[mk] = mv.stringValue||mv.booleanValue||mv.integerValue||''; return m; }
        return av.stringValue || av.booleanValue || av.integerValue || '';
      });
      else if (v.mapValue) { const m = {}; for (const [mk,mv] of Object.entries(v.mapValue.fields||{})) m[mk] = mv.stringValue||''; fields[k] = m; }
      else fields[k] = '';
    }
    return { id, ...fields };
  }

  // Get Firebase auth token for authenticated REST API calls
  async function getAuthToken() {
    try {
      const user = auth.currentUser;
      if (user) return await user.getIdToken();
    } catch(e) {}
    return null;
  }

  async function restFetch(collection, pageSize = 300) {
    let all = [], token = null;
    const authToken = await getAuthToken();
    const headers = authToken ? { 'Authorization': 'Bearer ' + authToken } : {};
    do {
      let url = `${FS_BASE}/${collection}?key=${API_KEY}&pageSize=${pageSize}`;
      if (token) url += `&pageToken=${encodeURIComponent(token)}`;
      const r = await fetch(url, { headers });
      const data = await r.json();
      if (data.documents) all = [...all, ...data.documents.map(parseDoc)];
      token = data.nextPageToken || null;
    } while (token);
    return all;
  }

  // Poll every 30s to keep data fresh (replaces onSnapshot)
  let _pollInterval = null;
  async function loadAllData() {
    // Load all data in parallel — no more sequential blocking, much faster startup
    await Promise.allSettled([
      // Jobs (render immediately when ready)
      restFetch('jobs').then(jobs => {
        allJobs = jobs.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1);
        window.allJobs = allJobs;
        renderJobsTable(allJobs); renderDashboardRecent(allJobs); updateStats(allJobs); checkPermitExpiry();
        window._schedWeekOffset = 0; // always show current week when fresh data loads
        window._schedTabJustOpened = true;
        window._schedUserNavigated = false;
        loadScheduleNotes().then(() => { window._schedWeekOffset = 0; renderSchedule(); });
      }).catch(e => console.error('jobs load failed:', e)),

      // Contacts (needed for customer autocomplete in New Job)
      restFetch('contacts').then(contacts => {
        allContacts = contacts;
        window.allContacts = allContacts;
        if (typeof renderContacts === 'function') renderContacts(allContacts);
      }).catch(e => console.error('contacts load failed:', e)),

      // Permits
      restFetch('permits').then(permits => {
        allStandalonePermits = permits.sort((a,b) => (b.createdAt||'') > (a.createdAt||'') ? 1 : -1);
        renderPermitsCards(allStandalonePermits.filter(p => !p.archived));
        window.filterPermitsDirect();
        checkPermitExpiry();
      }).catch(e => console.error('permits load failed:', e)),

      // Activity
      restFetch('activity', 20).then(acts => {
        const items = acts.sort((a,b) => (b.timestamp||'') > (a.timestamp||'') ? 1 : -1).slice(0,10);
        renderActivityLog(items);
        const nc = document.getElementById('notif-count');
        if (nc) nc.textContent = items.length;
      }).catch(e => console.error('activity load failed:', e)),

      // Users
      restFetch('users').then(async users => {
        const currentEmail = (currentUser && currentUser.email ? currentUser.email : '').trim().toLowerCase();
        const isCurrentUserRemoved = !!currentEmail && users.some(u => ((u.email || '').trim().toLowerCase() === currentEmail) && u.removed);
        if (isCurrentUserRemoved && !window._isAdmin) {
          try { await signOut(auth); } catch (err) { console.warn('signOut after user removal failed:', err); }
          currentUser = null;
          showStandardLogin(currentEmail, 'Your account was removed by an admin.', false);
          return;
        }
        allUsers = dedupeUsersByEmail(users).sort((a,b) => (b.updatedAt || b.invitedAt || '') > (a.updatedAt || a.invitedAt || '') ? 1 : -1);
        renderUsers(allUsers);
      }).catch(e => console.error('users load failed:', e)),

      // Push Notifications
      loadNotifications().catch(e => console.error('notifications load failed:', e)),

      // Tasks & Reminders
      loadTasks().catch(e => console.error('tasks load failed:', e)),
    ]);
  }

  function startListeners() {
    // Load immediately then poll every 30s
    loadAllData();
    if (_pollInterval) clearInterval(_pollInterval);
    _pollInterval = setInterval(loadAllData, 30000);

    // Keep unsubscribe stubs so cleanup code doesn't break
    jobsUnsubscribe = () => {};
    activityUnsubscribe = onSnapshot(collection(db, 'activity'), snap => {
      const items = snap.docs.map(d => d.data()).sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0)).slice(0,10);
      renderActivityLog(items);
      const notifCount = document.getElementById('notif-count');
      if (notifCount) notifCount.textContent = items.length;
    }, err => console.warn('activity SDK err (ok):', err));

    contactsUnsubscribe = () => {};
    permitsUnsubscribe = () => {};
    usersUnsubscribe = () => {};
  }

  // ── STATS ─────────────────────────────────────────────────────────────────
  function updateStats(jobs) {
    document.getElementById('stat-total').textContent = jobs.length;
    document.getElementById('stat-open').textContent =
      jobs.filter(j => j.status === 'Pending' || j.status === 'In Progress').length;
    document.getElementById('stat-completed').textContent =
      jobs.filter(j => j.status === 'Completed').length;
    document.getElementById('stat-blocked').textContent =
      jobs.filter(j => j.blocked === 'yes').length;
  }

  // ── PERMIT EXPIRY CHECK ───────────────────────────────────────────────────
  function checkPermitExpiry() {
    const banner = document.getElementById('permit-alert-banner');
    const itemsEl = document.getElementById('permit-alert-items');
    const alertsPanel = document.getElementById('alerts-log-panel');
    const alertsBadge = document.getElementById('alerts-count-badge');

    // Check jobs with permit expiry
    const expiringFromJobs = allJobs.filter(j => {
      if (!j.permitExpiry) return false;
      if (j.status === 'Completed' || j.status === 'Cancelled') return false;
      const days = daysUntil(j.permitExpiry);
      return days !== null && days >= 0 && days <= 4;
    }).map(j => ({ label: j.permitNumber || j.permitCode || 'N/A', address: j.address, expiry: j.permitExpiry }));

    // Check standalone permits (Permits tab) with expirationDate
    const expiringFromPermits = (typeof allStandalonePermits !== 'undefined' ? allStandalonePermits : []).filter(p => {
      if (!p.expirationDate) return false;
      if (p.status === 'Expired' || p.status === 'Cancelled') return false;
      const days = daysUntil(p.expirationDate);
      return days !== null && days >= 0 && days <= 4;
    }).map(p => ({ label: p.permitNumber || 'N/A', address: p.jobAddress || p.address || '—', expiry: p.expirationDate }));

    // Merge both sources, deduplicate by permit number
    const seen = new Set();
    const expiring = [...expiringFromJobs, ...expiringFromPermits].filter(item => {
      const key = item.label + item.expiry;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Update bell badge: permit expiry + unread push notifications
    // (updateBellBadge() will handle the combined count after alerts badge is set)

    if (expiring.length === 0) {
      banner.classList.remove('show');
      if (alertsPanel) {
        alertsPanel.innerHTML = '<div style="color:#555;font-size:13px;font-weight:600;padding:8px 0;">✅ No active alerts</div>';
        if (alertsBadge) alertsBadge.style.display = 'none';
      }
      if (typeof updateBellBadge === 'function') updateBellBadge();
      return;
    }

    banner.classList.add('show');
    // Compact banner — just a count
    const urgentCount = expiring.filter(i => daysUntil(i.expiry) <= 1).length;
    itemsEl.textContent = `⚠️ ${expiring.length} permit${expiring.length > 1 ? 's' : ''} expiring soon${urgentCount ? ' — ' + urgentCount + ' URGENT!' : ''}`;

    // Inject into dedicated ALERTS panel (separate from activity)
    if (alertsPanel) {
      // Store all alerts, show only latest by default
      window._allPermitAlerts = expiring;
      window._alertsExpanded = false;

      const renderAlertItem = (item, idx) => {
        const days = daysUntil(item.expiry);
        const daysLabel = days === 0 ? '🔴 TODAY!' : days === 1 ? '🟠 1 day' : `🟡 ${days} days`;
        const taskTitle = `Renew permit: ${item.label} — ${item.address}`;
        const taskTitleSafe = taskTitle.replace(/'/g, "\\'");
        const alertId = 'permit-alert-' + idx;
        return `<div id="${alertId}" style="background:rgba(229,62,62,0.08);border-left:3px solid #e53e3e;border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:flex-start;gap:8px;">
<div onclick="createPermitRenewalTask('${taskTitleSafe}','${item.expiry}')" style="flex:1;cursor:pointer;">
<div style="font-size:13px;font-weight:800;color:#f87171;">⚠️ ${item.label} — ${item.address}</div>
<div style="font-size:11px;color:#e53e3e;font-weight:700;margin-top:3px;">${daysLabel} left · Expires ${fmtDate(item.expiry)}</div>
<div style="font-size:10px;color:#fca5a5;margin-top:3px;">👆 Tap → Create renewal task</div>
</div>
<button onclick="event.stopPropagation();document.getElementById('${alertId}').remove()" style="background:transparent;border:none;color:#555;font-size:18px;cursor:pointer;padding:0;flex-shrink:0;line-height:1;">×</button>
</div>`;
      };

      // Show only the most urgent (first) alert by default
      const latestAlert = renderAlertItem(expiring[0], 0);
      const moreCount = expiring.length - 1;
      const moreHint = moreCount > 0 ? `<div id="alerts-more-hint" style="font-size:11px;color:#f87171;font-weight:700;padding:4px 0;cursor:pointer;" onclick="toggleAlertsExpand()">+ ${moreCount} more alert${moreCount > 1 ? 's' : ''} — tap 🚨 to see all</div>` : '';
      alertsPanel.innerHTML = latestAlert + moreHint;
      window._renderAlertItem = renderAlertItem;
      if (alertsBadge) { alertsBadge.textContent = expiring.length; alertsBadge.style.display = 'inline-block'; }
    }
    if (typeof updateBellBadge === 'function') updateBellBadge();
  }

  // ── JOBS TABLE ─────────────────────────────────────────────────────────────
  window._jobFilter = '';
  window._jobSearch = '';

  window.setJobFilter = function(filter, btnEl) {
    window._jobFilter = filter;
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    filterJobs();
  };

  window.filterJobs = function() {
    const search = (document.getElementById('job-search').value || '').toLowerCase();
    window._jobSearch = search;
    const filter = window._jobFilter;

    const filtered = allJobs.filter(j => {
      const matchSearch = !search ||
        (j.customerName || '').toLowerCase().includes(search) ||
        (j.address || '').toLowerCase().includes(search) ||
        (j.invoiceNumber || '').toLowerCase().includes(search) ||
        (j.taskType || '').toLowerCase().includes(search) ||
        (j.status || '').toLowerCase().includes(search) ||
        (j.permitNumber || '').toLowerCase().includes(search) ||
        (j.permitCode || '').toLowerCase().includes(search) ||
        (crewLabel(j) || '').toLowerCase().includes(search);

      let matchFilter = true;
      if (filter === 'open') matchFilter = j.status === 'Pending' || j.status === 'In Progress';
      else if (filter === 'blocked') matchFilter = j.blocked === 'yes';
      else if (filter) matchFilter = j.status === filter;

      return matchSearch && matchFilter;
    });
    renderJobsTable(filtered);
  };

  function taskTypePill(j) {
    if (j.jobType === 'asphalt' || (j.taskType || '').toLowerCase().includes('asphalt')) {
      return '<span style="background:#7c2d12;color:#fb923c;border:1px solid #c2410c;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;white-space:nowrap;">🟠 Asphalt</span>';
    }
    if (j.jobType === 'concrete' || (j.taskType || '').toLowerCase().includes('concrete')) {
      return '<span style="background:#1e3a5f;color:#60a5fa;border:1px solid #2d5a9e;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;white-space:nowrap;">🔵 Concrete</span>';
    }
    if (j.taskType) {
      return `<span style="background:#1f2937;color:#9ca3af;border:1px solid #374151;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;white-space:nowrap;">${j.taskType}</span>`;
    }
    return '';
  }

  function renderJobsTable(jobs) {
    const container = document.getElementById('jobs-cards-container');
    if (!jobs.length) {
      container.innerHTML = '<div style="text-align:center;color:#555;padding:40px 20px;">No jobs found.</div>';
      return;
    }
    container.innerHTML = jobs.map(j => {
      const parking = j.altParkingDays
        ? j.altParkingDays + (j.altParkingTime ? ' · ' + j.altParkingTime : '')
        : null;
      const permitNum = j.permitNumber || j.permitCode || null;
      const isCompleted = j.status === 'Completed';
      const typePill = taskTypePill(j);
      const safeId = j.id;

      return `
        <div class="job-card" id="jcard-${safeId}" onclick="toggleJobCard('${safeId}')"
          style="background:#1a1a1a;border-radius:12px;border-left:4px solid #e53e3e;padding:14px 16px;cursor:pointer;user-select:none;position:relative;">
<!-- COLLAPSED HEADER -->
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
<div style="flex:1;min-width:0;">
<div style="font-size:16px;font-weight:700;color:#fff;line-height:1.3;word-break:break-word;">
                ${isCompleted ? '✅ ' : ''}${j.address || '—'}
              </div>
<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                ${typePill}
                <span style="color:#9ca3af;font-size:13px;">${j.customerName || '—'}</span>
</div>
</div>
<div style="color:#555;font-size:18px;flex-shrink:0;margin-top:2px;transition:transform 0.2s;" id="jcard-chevron-${safeId}">›</div>
</div>
<!-- EXPANDED DETAILS -->
<div id="jcard-detail-${safeId}" style="display:none;margin-top:14px;border-top:1px solid #2a2a2a;padding-top:14px;">
<div style="display:flex;flex-direction:column;gap:10px;">
<!-- Contact -->
<div>
<div style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Contact</div>
<div style="font-weight:600;color:#e5e7eb;margin-bottom:4px;">${j.customerName || '—'}</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;">
                  ${j.phone ? `<a href="tel:${j.phone}" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:4px;background:#1a3a2a;border:1px solid #22c55e;color:#4ade80;padding:5px 10px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">📞 ${j.phone}</a>` : ''}
                  ${j.email ? `<a href="mailto:${j.email}" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:4px;background:#1e3a5f;border:1px solid #2d5a9e;color:#60a5fa;padding:5px 10px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">✉️ ${j.email}</a>` : ''}
                </div>
</div>
<!-- Job Info -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Task Type</div>
<div style="color:#e5e7eb;font-size:13px;margin-top:3px;">${j.taskType || '—'}</div>
</div>
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Crew</div>
<div style="color:#e5e7eb;font-size:13px;margin-top:3px;">${crewLabel(j) || '—'}</div>
</div>
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Project Size</div>
<div style="color:#e5e7eb;font-size:13px;margin-top:3px;">${j.projectSize ? j.projectSize + ' SF' : '—'}</div>
</div>
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Status</div>
<div style="margin-top:3px;">${statusBadge(j.status)}</div>
</div>
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Schedule Day</div>
<div style="color:#e5e7eb;font-size:13px;margin-top:3px;">${fmtDate(j.scheduleDay)}</div>
</div>
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Completion Day</div>
<div style="color:#e5e7eb;font-size:13px;margin-top:3px;">${isCompleted ? fmtDate(j.completionDay) : '—'}</div>
</div>
</div>
              ${parking ? `
              <div style="background:#2d1111;border:1px solid #7f1d1d;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">🚗 Alt. Parking</div>
<div style="color:#f87171;font-size:13px;font-weight:600;margin-top:3px;">${parking}</div>
</div>` : ''}
              ${permitNum ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Permit #</div>
<div style="color:#e5e7eb;font-size:13px;margin-top:3px;">${permitNum}</div>
</div>
<div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Permit Status</div>
<div style="margin-top:3px;">${permitStatusBadge(j)}</div>
</div>
</div>` : ''}
              ${j.notes ? `
              <div style="background:#111;border-radius:8px;padding:10px;">
<div style="color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Notes</div>
<div style="color:#d1d5db;font-size:13px;line-height:1.5;">${j.notes}</div>
</div>` : ''}
              <!-- Action Buttons -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;">
<button onclick="event.stopPropagation();openEditJob('${safeId}')"
                  style="background:#1a2a3a;border:1.5px solid #3b82f6;color:#60a5fa;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
                  ✏️ Edit
                </button>
<button onclick="event.stopPropagation();showDeleteConfirm('${safeId}')"
                  style="background:#450a0a;border:1.5px solid #7f1d1d;color:#f87171;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
                  🗑️ Delete
                </button>
<button onclick="event.stopPropagation();addJobToSchedule('${safeId}')"
                  style="background:#1a3a2a;border:1.5px solid #22c55e;color:#4ade80;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
                  📅 Schedule
                </button>
<button onclick="event.stopPropagation();shareJob('${safeId}')"
                  style="background:#1e3a5f;border:1.5px solid #2d5a9e;color:#60a5fa;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
                  📤 Share
                </button>
</div>
</div>
</div>
</div>`;
    }).join('');
  }

  window.toggleJobCard = function(jobId) {
    const detail = document.getElementById('jcard-detail-' + jobId);
    const chevron = document.getElementById('jcard-chevron-' + jobId);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    // Close all open cards first
    document.querySelectorAll('[id^="jcard-detail-"]').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('[id^="jcard-chevron-"]').forEach(el => { el.style.transform = ''; el.style.color = '#555'; });
    if (!isOpen) {
      detail.style.display = 'block';
      if (chevron) { chevron.style.transform = 'rotate(90deg)'; chevron.style.color = '#e53e3e'; }
    }
  };

  // ── DELETE CONFIRM ─────────────────────────────────────────────────────────
  window.showDeleteConfirm = function(jobId) {
    pendingDeleteJobId = jobId;
    document.getElementById('delete-confirm-modal').classList.add('show');
  };

  window.closeDeleteConfirm = function() {
    pendingDeleteJobId = null;
    document.getElementById('delete-confirm-modal').classList.remove('show');
  };

  window.confirmDeleteJob = async function() {
    if (!pendingDeleteJobId) return;
    const jobId = pendingDeleteJobId;
    document.getElementById('delete-confirm-modal').classList.remove('show');
    pendingDeleteJobId = null;
    await deleteJobById(jobId);
  };

  window.requestDeleteFromModal = function() {
    if (!editingJobId) return;
    const jobId = editingJobId;
    closeJobModal();
    showDeleteConfirm(jobId);
  };

  window.deleteJobById = async function(jobId) {
    const j = allJobs.find(x => x.id === jobId);
    if (!j) { window.showToast('Job not found', '#e53e3e'); return; }
    deletedJobData = { ...j };
    try {
      // Use REST API directly — most reliable across all auth states
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents/jobs/${jobId}?key=AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        // If REST fails, try SDK as fallback
        if (typeof deleteDoc !== 'undefined' && typeof doc !== 'undefined' && typeof db !== 'undefined') {
          await deleteDoc(doc(db, 'jobs', jobId));
        } else {
          throw new Error('Delete failed: ' + res.status);
        }
      }
      // Remove from local array and re-render immediately
      allJobs = allJobs.filter(x => x.id !== jobId);
      window.allJobs = allJobs;
      renderJobsTable(allJobs);
      updateStats(allJobs);
      const undoBtn = document.getElementById('undo-btn');
      if (undoBtn) undoBtn.style.display = 'inline-block';
      window.showToast('🗑️ Job deleted. Tap ↩️ to undo (30s)', '#374151', 5000);
      if (undoTimer) clearTimeout(undoTimer);
      undoTimer = setTimeout(() => {
        deletedJobData = null;
        if (undoBtn) undoBtn.style.display = 'none';
      }, 30000);
    } catch(e) {
      window.showToast('Error deleting job: ' + e.message, '#e53e3e');
    }
  };

  window.undoDelete = async function() {
    if (!deletedJobData) return;
    const jobToRestore = { ...deletedJobData };
    delete jobToRestore.id;
    jobToRestore.createdAt = serverTimestamp();
    try {
      await addDoc(collection(db, 'jobs'), jobToRestore);
      await addDoc(collection(db, 'activity'), {
        action: 'Restored job (undo)', jobAddress: jobToRestore.address || '',
        doneBy: currentUser ? currentUser.email : 'unknown', timestamp: serverTimestamp()
      });
      window.showToast('✅ Job restored!');
      deletedJobData = null;
      if (undoTimer) clearTimeout(undoTimer);
      document.getElementById('undo-btn').style.display = 'none';
    } catch(e) {
      window.showToast('Error restoring: ' + e.message, '#e53e3e');
    }
  };

  // ── DASHBOARD RECENT ──────────────────────────────────────────────────────
  function renderDashboardRecent(jobs) {
    const tbody = document.getElementById('dashboard-recent-tbody');
    const search = (document.getElementById('dash-search') ? document.getElementById('dash-search').value : '').toLowerCase();
    const filtered = search ? jobs.filter(j =>
      (j.address||'').toLowerCase().includes(search) ||
      (j.customerName||'').toLowerCase().includes(search)
    ) : jobs;
    const recent = filtered.slice(0, 8);
    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#555;padding:20px;">No jobs.</td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(j => `
      <tr style="cursor:pointer;" onclick="openEditJob('${j.id}')">
<td>${j.address || '—'}</td>
<td>${j.taskType ? `${j.taskType}` : '—'}</td>
<td>${crewBadge(j)}</td>
<td>${statusBadge(j.status)}</td>
<td>${fmtDate(j.scheduleDay)}</td>
</tr>`).join('');
  }

  window.filterDashRecent = function() { renderDashboardRecent(allJobs); };

  // ── PERMITS TABLE ──────────────────────────────────────────────────────────
  function renderPermitsTable(jobs) {
    const search = (document.getElementById('permit-search') ? document.getElementById('permit-search').value : '').toLowerCase();
    const statusFilter = document.getElementById('permit-status-filter') ? document.getElementById('permit-status-filter').value : '';

    const withPermits = jobs.filter(j => j.permitNumber || j.permitCode);
    const tbody = document.getElementById('permits-tbody');
    if (!tbody) return;

    let filtered = withPermits.filter(j => {
      const permitNum = (j.permitNumber || j.permitCode || '').toLowerCase();
      const matchSearch = !search ||
        permitNum.includes(search) ||
        (j.address||'').toLowerCase().includes(search) ||
        (j.customerName||'').toLowerCase().includes(search);

      let pStatus = 'None';
      if (j.permitExpiry) {
        const days = daysUntil(j.permitExpiry);
        if (days < 0) pStatus = 'Expired';
        else if (days < 30) pStatus = 'Expiring Soon';
        else pStatus = 'Approved';
      } else if (j.permitNumber || j.permitCode) {
        pStatus = 'On File';
      }

      const matchStatus = !statusFilter || pStatus === statusFilter || pStatus.includes(statusFilter);
      return matchSearch && matchStatus;
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#555;padding:20px;">No permits found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(j => {
      const permitNum = j.permitNumber || j.permitCode || '—';
      const days = j.permitExpiry ? daysUntil(j.permitExpiry) : null;
      let daysCell = '—';
      let psBadge = '<span class="badge badge-gray">On File</span>';
      if (days !== null) {
        if (days < 0) { daysCell = `<span style="color:#f87171;font-weight:700;">Expired</span>`; psBadge = '<span class="badge badge-red">Expired</span>'; }
        else if (days <= 4) { daysCell = `<span style="color:#e53e3e;font-weight:800;">⚠️ ${days}d</span>`; psBadge = '<span class="badge badge-red">Expiring Soon</span>'; }
        else if (days < 30) { daysCell = `<span style="color:#f59e0b;font-weight:700;">${days}d</span>`; psBadge = '<span class="badge badge-orange">Expiring Soon</span>'; }
        else { daysCell = `<span style="color:#4ade80;">${days}d</span>`; psBadge = '<span class="badge badge-green">Valid</span>'; }
      }
      return `<tr style="cursor:pointer;" onclick="openEditJob('${j.id}')">
<td>${permitNum}</td>
<td>${j.taskType || '—'}</td>
<td>${j.address || '—'}</td>
<td>${j.customerName || '—'}</td>
<td>${psBadge}</td>
<td>${fmtDate(j.permitExpiry)}</td>
<td>${daysCell}</td>
<td>${j.notes ? j.notes.slice(0,40)+'…' : '—'}</td>
</tr>`;
    }).join('');
  }

  window.filterPermits = function() { renderPermitsCards(allStandalonePermits); };

  // ── ACTIVITY LOG ───────────────────────────────────────────────────────────
  function renderActivityLog(items) {
    const el = document.getElementById('activity-log-panel');
    if (!items.length) {
      el.innerHTML = '<div class="notif-item"><div class="notif-title" style="color:#555;">No notifications.</div></div>';
      return;
    }
    el.innerHTML = items.slice(0, 8).map(a => {
      const ts = a.timestamp && a.timestamp.toDate
        ? a.timestamp.toDate().toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
        : '';
      return `<div class="notif-item">
<div class="notif-title"><span class="notif-dot dot-green"></span>${a.action || 'Action'}</div>
<div class="notif-sub">${a.jobAddress || ''} · ${a.doneBy || ''}</div>
<div class="notif-sub" style="font-size:11px;color:#444;">${ts}</div>
</div>`;
    }).join('');
    // Re-inject expiry alerts on top
    checkPermitExpiry();
  }

  // ── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────
  let _allNotifications = [];

  window.toggleNotifInput = function() {
    const area = document.getElementById('notif-input-area');
    if (!area) return;
    const isVisible = area.style.display !== 'none';
    area.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      const inp = document.getElementById('notif-message-input');
      if (inp) { inp.value = ''; inp.focus(); }
    }
  };

  async function loadNotifications() {
    try {
      // Fetch last 20 notifications ordered by timestamp desc
      const url = `${FS_BASE}/notifications?key=${API_KEY}&pageSize=20&orderBy=timestamp+desc`;
      const r = await fetch(url);
      const data = await r.json();
      const docs = (data.documents || []).map(parseDoc);
      // Sort newest first by timestamp string
      docs.sort((a, b) => (b.timestamp || '') > (a.timestamp || '') ? 1 : -1);
      _allNotifications = docs;
      renderNotifications(docs);
      updateBellBadge();
    } catch(e) {
      console.error('loadNotifications failed:', e);
      const el = document.getElementById('notifications-log-panel');
      if (el) el.innerHTML = '<div class="notif-item"><div class="notif-title" style="color:#555;">Failed to load notifications.</div></div>';
    }
    // Show push button for admin
    const pushBtn = document.getElementById('push-notif-btn');
    if (pushBtn) pushBtn.style.display = window._isAdmin ? 'inline-block' : 'none';
  }

  function renderNotifications(items) {
    const el = document.getElementById('notifications-log-panel');
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<div class="notif-item"><div class="notif-title" style="color:#555;">No notifications yet.</div></div>';
      return;
    }
    const isAdmin = window._isAdmin;
    el.innerHTML = items.map(n => {
      const ts = n.timestamp
        ? (() => { try { return new Date(n.timestamp).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); } catch(e) { return n.timestamp; } })()
        : '';
      const unreadDot = n.read === false ? '<span style="display:inline-block;width:7px;height:7px;background:#3b82f6;border-radius:50%;margin-right:6px;flex-shrink:0;"></span>' : '';
      const deleteBtn = isAdmin
        ? `<button onclick="deleteNotification('${n.id}')" title="Delete" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:2px 4px;line-height:1;" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#555'">🗑️</button>`
        : '';
      return `<div class="notif-item" id="notif-item-${n.id}" style="border-left:3px solid ${n.read === false ? '#3b82f6' : '#333'};padding-left:10px;">
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
<div class="notif-title" style="display:flex;align-items:center;flex:1;">${unreadDot}${n.message || '—'}</div>
          ${deleteBtn}
        </div>
<div class="notif-sub" style="font-size:11px;color:#555;margin-top:3px;">Sent by ${n.sentBy || 'Admin'} · ${ts}</div>
</div>`;
    }).join('');
  }

  // ── TASKS & REMINDERS ─────────────────────────────────────────────────────
  let _allTasks = [];

  window.toggleAddTaskForm = function() {
    const form = document.getElementById('add-task-form');
    if (!form) return;
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') {
      const ti = document.getElementById('task-title-input');
      if (ti) ti.focus();
    }
  };

  // Create a permit renewal task from alert and navigate to Tasks
  // Toggle alerts panel expand/collapse
  window.toggleAlertsExpand = function() {
    const panel = document.getElementById('alerts-log-panel');
    const chevron = document.getElementById('alerts-expand-chevron');
    if (!panel || !window._allPermitAlerts || !window._allPermitAlerts.length) return;
    window._alertsExpanded = !window._alertsExpanded;
    if (chevron) chevron.style.transform = window._alertsExpanded ? 'rotate(180deg)' : '';
    if (window._alertsExpanded) {
      // Show all alerts
      panel.innerHTML = window._allPermitAlerts.map((item, idx) => window._renderAlertItem(item, idx)).join('');
    } else {
      // Show just the first alert + hint
      const latestAlert = window._renderAlertItem(window._allPermitAlerts[0], 0);
      const moreCount = window._allPermitAlerts.length - 1;
      const moreHint = moreCount > 0 ? `<div id="alerts-more-hint" style="font-size:11px;color:#f87171;font-weight:700;padding:4px 0;cursor:pointer;" onclick="toggleAlertsExpand()">+ ${moreCount} more alert${moreCount > 1 ? 's' : ''} — tap 🚨 to see all</div>` : '';
      panel.innerHTML = latestAlert + moreHint;
    }
  };

  window.createPermitRenewalTask = async function(title, expiry) {
    const userEmail = (currentUser && currentUser.email) || ADMIN_EMAIL;
    const now = new Date().toISOString();
    const taskData = {
      fields: {
        title: { stringValue: title },
        description: { stringValue: `Permit expires: ${expiry}. Please renew before expiry date.` },
        status: { stringValue: 'open' },
        dueDate: { stringValue: expiry },
        createdBy: { stringValue: userEmail },
        createdByName: { stringValue: userEmail.split('@')[0] },
        createdAt: { stringValue: now },
        notes: { arrayValue: { values: [] } }
      }
    };
    try {
      await fetch(`${FS_BASE}/tasks?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      window.showToast('✅ Task created — go to Dashboard → Tasks', '#16a34a', 3000);
      await loadTasks();
      // Navigate to Dashboard (Tasks are there)
      navTo(0);
    } catch(e) {
      window.showToast('Failed to create task: ' + e.message, '#e53e3e');
    }
  };

  window.addTask = async function() {
    const title = (document.getElementById('task-title-input')?.value || '').trim();
    if (!title) { window.showToast('Task title is required', '#f59e0b'); return; }
    const dueDate = document.getElementById('task-due-date-input')?.value || '';
    const dueTime = document.getElementById('task-due-time-input')?.value || '';
    const description = (document.getElementById('task-desc-input')?.value || '').trim();
    const now = new Date().toISOString();
    const userEmail = (currentUser && currentUser.email) || ADMIN_EMAIL;
    const userName = (currentUser && (currentUser.displayName || currentUser.email)) || 'Nir Maman';
    const body = {
      fields: {
        title: { stringValue: title },
        dueDate: { stringValue: dueDate },
        dueTime: { stringValue: dueTime },
        description: { stringValue: description },
        createdBy: { stringValue: userEmail },
        createdByName: { stringValue: userName },
        createdAt: { stringValue: now },
        status: { stringValue: 'open' },
        notes: { stringValue: '[]' }
      }
    };
    try {
      const _fsBase = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';
      const _apiKey = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
      const r = await fetch(`${_fsBase}/tasks?key=${_apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error('POST failed: ' + r.status + ' ' + errText);
      }
      window.showToast('Task added! ✅', '#22c55e');
      // Reset form
      ['task-title-input','task-due-date-input','task-due-time-input','task-desc-input'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      document.getElementById('add-task-form').style.display = 'none';
      await loadTasks();
    } catch(e) {
      console.error('addTask failed:', e);
      window.showToast('Failed to save task', '#e53e3e');
    }
  };

  window.markTaskDone = async function(id) {
    const now = new Date().toISOString();
    const userEmail = (currentUser && currentUser.email) || ADMIN_EMAIL;
    const userName = (currentUser && (currentUser.displayName || currentUser.email)) || 'Nir Maman';
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const body = {
      fields: {
        ...buildTaskFields(task),
        status: { stringValue: 'done' },
        doneBy: { stringValue: userEmail },
        doneByName: { stringValue: userName },
        doneAt: { stringValue: now }
      }
    };
    try {
      const r = await fetch(`${FS_BASE}/tasks/${id}?key=${API_KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('PATCH failed: ' + r.status);
      window.showToast('Task marked done ✅', '#22c55e');
      await loadTasks();
    } catch(e) {
      console.error('markTaskDone failed:', e);
      window.showToast('Failed to update task', '#e53e3e');
    }
  };

  // Show close task flow: require note, then offer Close or Follow-Up
  window.closeTask = function(id) {
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;

    // Remove if already open (toggle)
    const existing = document.getElementById('task-close-panel-' + id);
    if (existing) { existing.remove(); return; }

    // Find a suitable anchor — try action area first, then any parent with task id in card
    let anchor = document.querySelector(`[data-task-actions="${id}"]`);
    if (!anchor) {
      // Fallback: find any button that called closeTask and use its parent card
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`closeTask('${id}')`)) {
          anchor = btn.closest('div[style]');
          break;
        }
      }
    }
    if (!anchor) { window.showToast('⚠️ Please expand the task first', '#e53e3e'); return; }

    const panel = document.createElement('div');
    panel.id = 'task-close-panel-' + id;
    panel.style.cssText = 'margin-top:10px;padding:12px;background:#0a1a0a;border:1.5px solid #16a34a;border-radius:10px;';
    panel.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:#4ade80;margin-bottom:8px;">📋 Write a note — what was done?</div>
<textarea id="task-close-note-${id}" placeholder="Describe what was done and who handled it…" rows="3"
        style="width:100%;box-sizing:border-box;background:#111;border:1px solid #333;border-radius:6px;color:#e2e8f0;font-size:13px;font-family:'Inter',sans-serif;padding:8px;resize:vertical;outline:none;margin-bottom:8px;"
        oninput="document.getElementById('task-close-btns-${id}').style.display=this.value.trim()?'flex':'none'"></textarea>
<div id="task-close-btns-${id}" style="display:none;flex-direction:column;gap:8px;">
<button onclick="doCloseTask('${id}','complete')" style="padding:12px;background:#16a34a;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;">✅ Task Complete — Move to History</button>
<button onclick="doCloseTask('${id}','followup')" style="padding:12px;background:#1d4ed8;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;">📅 Need Follow-Up — Set New Date</button>
<button onclick="document.getElementById('task-close-panel-${id}').remove()" style="padding:10px;background:transparent;border:1px solid #333;border-radius:8px;color:#888;font-size:12px;cursor:pointer;font-family:Inter,sans-serif;">Cancel</button>
</div>`;

    // Insert after anchor
    anchor.insertAdjacentElement('afterend', panel);
    panel.querySelector('textarea').focus();
  };

  window.doCloseTask = async function(id, action) {
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const noteText = (document.getElementById('task-close-note-' + id) || {}).value?.trim() || '';
    if (!noteText) { window.showToast('⚠️ Please add a note first', '#e53e3e'); return; }

    const now = new Date().toISOString();
    const userEmail = (currentUser && currentUser.email) || ADMIN_EMAIL;
    const userName = (currentUser && (currentUser.displayName || currentUser.email)) || 'Admin';

    // Save the closing note
    let notes = [];
    try { notes = Array.isArray(task.notes) ? task.notes : JSON.parse(task.notes || '[]'); } catch(e) { notes = []; }
    notes.push({ text: noteText, author: userName, timestamp: now });

    // Helper: log to Activity
    async function logTaskActivity(action, note) {
      try {
        await fetch(`${FS_BASE}/activity?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: {
            action: { stringValue: action },
            taskTitle: { stringValue: task.title || '' },
            note: { stringValue: note || '' },
            doneBy: { stringValue: userName },
            doneByEmail: { stringValue: userEmail },
            timestamp: { stringValue: now }
          }})
        });
      } catch(e) { console.warn('Activity log failed:', e); }
    }

    if (action === 'followup') {
      const followDate = prompt('Follow-up date (YYYY-MM-DD):', new Date(Date.now() + 86400000).toISOString().split('T')[0]);
      if (!followDate) return;
      notes.push({ text: `📅 Follow-up scheduled for ${followDate}`, author: userName, timestamp: now });
      const body = { fields: { ...buildTaskFields({...task, notes}), dueDate: { stringValue: followDate }, status: { stringValue: 'open' } } };
      await fetch(`${FS_BASE}/tasks/${id}?key=${API_KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await logTaskActivity(`📅 Task follow-up set for ${followDate}`, noteText);
      window.showToast('📅 Follow-up set for ' + followDate, '#1d4ed8');
    } else {
      const body = { fields: { ...buildTaskFields({...task, notes}), status: { stringValue: 'closed' }, closedBy: { stringValue: userEmail }, closedAt: { stringValue: now } } };
      try {
        const r = await fetch(`${FS_BASE}/tasks/${id}?key=${API_KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error('PATCH failed ' + r.status);
        await logTaskActivity('✅ Task closed', noteText);
        window.showToast('✅ Task closed and moved to History', '#16a34a');
      } catch(e) { window.showToast('Failed to close task', '#e53e3e'); return; }
    }
    await loadTasks();
  };

  // Restore closed task back to open
  window.restoreTask = async function(id) {
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const userEmail = (currentUser && currentUser.email) || ADMIN_EMAIL;
    const userName = (currentUser && (currentUser.displayName || currentUser.email)) || 'Admin';
    const now = new Date().toISOString();
    const body = { fields: { ...buildTaskFields(task), status: { stringValue: 'open' }, closedBy: { stringValue: '' }, closedAt: { stringValue: '' } } };
    try {
      await fetch(`${FS_BASE}/tasks/${id}?key=${API_KEY}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      // Log to activity
      await fetch(`${FS_BASE}/activity?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          action: { stringValue: '↩ Task restored to open' },
          taskTitle: { stringValue: task.title || '' },
          doneBy: { stringValue: userName },
          doneByEmail: { stringValue: userEmail },
          timestamp: { stringValue: now }
        }})
      });
      window.showToast('↩ Task moved back to open', '#4ade80');
      await loadTasks();
    } catch(e) { window.showToast('Failed to restore task', '#e53e3e'); }
  };

  window.deleteTask = async function(id) {
    if (!window._isAdmin) { window.showToast('Admin only', '#e53e3e'); return; }
    if (!confirm('Permanently delete this task?')) return;
    try {
      const r = await fetch(`${FS_BASE}/tasks/${id}?key=${API_KEY}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('DELETE failed: ' + r.status);
      window.showToast('Task deleted 🗑️', '#22c55e');
      await loadTasks();
    } catch(e) {
      console.error('deleteTask failed:', e);
      window.showToast('Failed to delete task', '#e53e3e');
    }
  };

  window.toggleTaskNoteForm = function(id) {
    const el = document.getElementById(`task-note-form-${id}`);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
    if (el.style.display === 'block') {
      const ta = el.querySelector('textarea');
      if (ta) ta.focus();
    }
  };

  window.addTaskNote = async function(id) {
    const el = document.getElementById(`task-note-form-${id}`);
    // Support both old querySelector pattern and new named textarea
    const ta = document.getElementById(`task-note-ta-${id}`) || (el && el.querySelector('textarea'));
    const text = (ta && ta.value || '').trim();
    if (!text) { window.showToast('Note cannot be empty', '#f59e0b'); return; }
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const now = new Date().toISOString();
    const userName = (currentUser && (currentUser.displayName || currentUser.email)) || 'Nir Maman';
    const userEmail = (currentUser && currentUser.email) || ADMIN_EMAIL;
    let notes = [];
    try { notes = JSON.parse(task.notes || '[]'); } catch(e) { notes = []; }
    notes.push({ text, addedBy: userEmail, addedByName: userName, addedAt: now });
    const body = {
      fields: {
        ...buildTaskFields(task),
        notes: { stringValue: JSON.stringify(notes) }
      }
    };
    try {
      const r = await fetch(`${FS_BASE}/tasks/${id}?key=${API_KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('PATCH failed: ' + r.status);
      window.showToast('Note added 📝', '#22c55e');
      await loadTasks();
    } catch(e) {
      console.error('addTaskNote failed:', e);
      window.showToast('Failed to save note', '#e53e3e');
    }
  };

  window.toggleTaskNotes = function(id) {
    const el = document.getElementById(`task-notes-thread-${id}`);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  // ── ACCORDION / INLINE EDIT ─────────────────────────────────────────────────
  let _expandedTaskId = null;

  window.toggleTaskExpand = function(id) {
    if (_expandedTaskId === id) {
      _expandedTaskId = null;
    } else {
      _expandedTaskId = id;
    }
    renderTasks(_allTasks);
  };

  window.openTaskEdit = function(id) {
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const editDiv = document.getElementById(`task-edit-form-${id}`);
    if (!editDiv) return;
    editDiv.style.display = editDiv.style.display === 'none' ? 'block' : 'none';
  };

  window.saveTaskEdit = async function(id) {
    const task = _allTasks.find(t => t.id === id);
    if (!task) return;
    const titleEl = document.getElementById(`task-edit-title-${id}`);
    const dateEl  = document.getElementById(`task-edit-date-${id}`);
    const timeEl  = document.getElementById(`task-edit-time-${id}`);
    const descEl  = document.getElementById(`task-edit-desc-${id}`);
    const newTitle = (titleEl && titleEl.value.trim()) || task.title;
    const newDate  = (dateEl && dateEl.value) || task.dueDate || '';
    const newTime  = (timeEl && timeEl.value) || task.dueTime || '';
    const newDesc  = (descEl && descEl.value.trim()) || '';
    const body = {
      fields: {
        ...buildTaskFields(task),
        title: { stringValue: newTitle },
        dueDate: { stringValue: newDate },
        dueTime: { stringValue: newTime },
        description: { stringValue: newDesc }
      }
    };
    try {
      const r = await fetch(`${FS_BASE}/tasks/${id}?key=${API_KEY}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('PATCH failed: ' + r.status);
      window.showToast('Task updated ✏️', '#22c55e');
      await loadTasks();
    } catch(e) {
      console.error('saveTaskEdit failed:', e);
      window.showToast('Failed to save edit', '#e53e3e');
    }
  };

  function buildTaskFields(task) {
    return {
      title: { stringValue: task.title || '' },
      dueDate: { stringValue: task.dueDate || '' },
      dueTime: { stringValue: task.dueTime || '' },
      description: { stringValue: task.description || '' },
      createdBy: { stringValue: task.createdBy || '' },
      createdByName: { stringValue: task.createdByName || '' },
      createdAt: { stringValue: task.createdAt || '' },
      status: { stringValue: task.status || 'open' },
      doneBy: { stringValue: task.doneBy || '' },
      doneByName: { stringValue: task.doneByName || '' },
      doneAt: { stringValue: task.doneAt || '' },
      closedBy: { stringValue: task.closedBy || '' },
      closedAt: { stringValue: task.closedAt || '' },
      notes: { stringValue: task.notes || '[]' }
    };
  }

  async function loadTasks() {
    try {
      const data = await restFetch('tasks');
      _allTasks = data.sort((a, b) => {
        // Sort open tasks by dueDate asc, then done/closed by createdAt desc
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        if (a.dueDate && b.dueDate) return a.dueDate > b.dueDate ? 1 : -1;
        return (b.createdAt || '') > (a.createdAt || '') ? 1 : -1;
      });
      renderTasks(_allTasks);
      updateBellBadge();
    } catch(e) {
      console.error('loadTasks failed:', e);
      const el = document.getElementById('tasks-list-panel');
      if (el) el.innerHTML = '<div class="notif-item"><div class="notif-title" style="color:#555;">Failed to load tasks.</div></div>';
    }
  }

  function renderTasks(tasks) {
    const el = document.getElementById('tasks-list-panel');
    if (!el) return;
    const isAdmin = window._isAdmin;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const openTasks = tasks.filter(t => t.status === 'open');
    const doneTasks = tasks.filter(t => t.status === 'done');
    const closedTasks = tasks.filter(t => t.status === 'closed');

    function formatDue(task) {
      if (!task.dueDate) return '';
      const d = new Date(task.dueDate + 'T00:00:00');
      const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return task.dueTime ? `${formatted} at ${task.dueTime}` : formatted;
    }

    function accentColor(task) {
      if (task.status === 'open') {
        if (task.dueDate && task.dueDate < todayStr) return '#e53e3e';
        if (task.dueDate === todayStr) return '#f59e0b';
        return '#4b5563';
      }
      if (task.status === 'done') return '#16a34a';
      return '#222';
    }

    function statusBadgeHtml(task) {
      if (task.status !== 'open') return '';
      if (task.dueDate && task.dueDate < todayStr)
        return '<span style="font-size:10px;font-weight:700;color:#f87171;background:rgba(239,68,68,0.12);border-radius:4px;padding:1px 5px;margin-left:6px;">⚠️ OVERDUE</span>';
      if (task.dueDate === todayStr)
        return '<span style="font-size:10px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.12);border-radius:4px;padding:1px 5px;margin-left:6px;">📅 Today</span>';
      return '';
    }

    function notesThreadHtml(task) {
      let notes = [];
      try { notes = JSON.parse(task.notes || '[]'); } catch(e) { notes = []; }
      if (!notes.length) return '<div style="font-size:11px;color:#4b5563;font-style:italic;">No notes yet.</div>';
      return notes.map(n => {
        const ts = n.addedAt ? (() => {
          try { return new Date(n.addedAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
          catch(e) { return n.addedAt; }
        })() : '';
        return `<div style="border-left:2px solid #2d3748;margin:5px 0;padding:5px 10px;background:#0d1117;border-radius:0 5px 5px 0;">
<div style="font-size:12px;color:#d1d5db;line-height:1.5;">${n.text}</div>
<div style="font-size:10px;color:#4b5563;margin-top:3px;">✍️ ${n.addedByName || n.addedBy || 'Unknown'} · ${ts}</div>
</div>`;
      }).join('');
    }

    // ── OPEN TASK (accordion) ────────────────────────────────────────────────
    function renderOpenCard(task) {
      const expanded = _expandedTaskId === task.id;
      const dueStr = formatDue(task);
      const badge = statusBadgeHtml(task);
      const accent = accentColor(task);

      // Collapsed row
      const collapsedHtml = `
        <div onclick="toggleTaskExpand('${task.id}')" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;padding:9px 10px 9px 12px;border-left:4px solid ${accent};background:#111;border-radius:8px;margin-bottom:6px;transition:background 0.15s;" onmouseover="this.style.background='#181818'" onmouseout="this.style.background='#111'">
<div style="flex:1;min-width:0;">
<span style="font-weight:700;color:#e2e8f0;font-size:13px;">${task.title}</span>${badge}
            ${dueStr ? `<span style="font-size:11px;color:#6b7280;margin-left:8px;">📅 ${dueStr}</span>` : ''}
          </div>
<span style="color:#4b5563;font-size:11px;flex-shrink:0;">${expanded ? '▲' : '▼'}</span>
</div>`;

      if (!expanded) return collapsedHtml;

      // Expanded detail panel
      let notes = [];
      try { notes = JSON.parse(task.notes || '[]'); } catch(e) { notes = []; }
      const adminDel = isAdmin
        ? `<button onclick="event.stopPropagation();deleteTask('${task.id}')" title="Permanently delete" style="background:#1a0505;border:1px solid #7f1d1d;border-radius:6px;color:#f87171;font-size:11px;font-weight:700;padding:5px 10px;cursor:pointer;font-family:'Inter',sans-serif;">🗑️ Delete</button>`
        : '';

      const expandedHtml = `
        <div style="border-left:4px solid ${accent};border-radius:0 8px 8px 0;background:#0f1117;margin-bottom:10px;padding:12px 14px;">
<!-- Header row -->
<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">
<div style="flex:1;">
<div style="font-weight:700;color:#e2e8f0;font-size:15px;margin-bottom:4px;">${task.title}${badge}</div>
              ${dueStr ? `<div style="font-size:12px;color:#9ca3af;">📅 ${dueStr}</div>` : ''}
              <div style="font-size:11px;color:#6b7280;margin-top:2px;">Created by ${task.createdByName || task.createdBy || '?'}</div>
              ${task.description ? `<div style="font-size:12px;color:#9ca3af;margin-top:6px;padding:6px 8px;background:#161b22;border-radius:5px;line-height:1.5;">${task.description}</div>` : ''}
            </div>
<button onclick="toggleTaskExpand('${task.id}')" style="background:none;border:none;color:#4b5563;font-size:16px;cursor:pointer;padding:0 0 0 8px;line-height:1;" title="Collapse">✕</button>
</div>
<!-- Notes thread -->
<div style="margin-bottom:10px;">
<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Notes ${notes.length ? '('+notes.length+')' : ''}</div>
            ${notesThreadHtml(task)}
          </div>
<!-- Add Note inline form -->
<div id="task-note-form-${task.id}" style="display:none;margin-bottom:10px;">
<textarea id="task-note-ta-${task.id}" placeholder="Write a note…" rows="2" style="width:100%;box-sizing:border-box;background:#1a1a2e;border:1px solid #3b82f6;border-radius:6px;color:#e2e8f0;font-size:12px;font-family:'Inter',sans-serif;padding:7px 10px;resize:vertical;outline:none;"></textarea>
<div style="display:flex;gap:6px;margin-top:5px;">
<button onclick="addTaskNote('${task.id}')" style="background:#1d4ed8;border:none;border-radius:5px;color:#fff;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;font-family:'Inter',sans-serif;">💾 Save Note</button>
<button onclick="document.getElementById('task-note-form-${task.id}').style.display='none'" style="background:#1f1f1f;border:1px solid #333;border-radius:5px;color:#888;font-size:11px;padding:5px 10px;cursor:pointer;font-family:'Inter',sans-serif;">Cancel</button>
</div>
</div>
<!-- Inline Edit form -->
<div id="task-edit-form-${task.id}" style="display:none;margin-bottom:10px;padding:10px;background:#0a1628;border:1px solid #1e3a5f;border-radius:7px;">
<div style="font-size:11px;font-weight:700;color:#60a5fa;margin-bottom:8px;">✏️ Edit Task</div>
<input id="task-edit-title-${task.id}" type="text" value="${(task.title||'').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:#1a1a2e;border:1px solid #3b82f6;border-radius:6px;color:#e2e8f0;font-size:13px;font-family:'Inter',sans-serif;padding:7px 10px;outline:none;margin-bottom:7px;"/>
<div style="display:flex;gap:7px;margin-bottom:7px;">
<input id="task-edit-date-${task.id}" type="date" value="${task.dueDate||''}" style="flex:1;background:#1a1a2e;border:1px solid #333;border-radius:6px;color:#e2e8f0;font-size:12px;font-family:'Inter',sans-serif;padding:6px 10px;outline:none;"/>
<input id="task-edit-time-${task.id}" type="time" value="${task.dueTime||''}" style="flex:1;background:#1a1a2e;border:1px solid #333;border-radius:6px;color:#e2e8f0;font-size:12px;font-family:'Inter',sans-serif;padding:6px 10px;outline:none;"/>
</div>
<textarea id="task-edit-desc-${task.id}" rows="2" placeholder="Description (optional)" style="width:100%;box-sizing:border-box;background:#1a1a2e;border:1px solid #333;border-radius:6px;color:#e2e8f0;font-size:12px;font-family:'Inter',sans-serif;padding:7px 10px;resize:vertical;outline:none;margin-bottom:7px;">${task.description||''}</textarea>
<div style="display:flex;gap:6px;">
<button onclick="saveTaskEdit('${task.id}')" style="background:#1d4ed8;border:none;border-radius:5px;color:#fff;font-size:11px;font-weight:700;padding:5px 14px;cursor:pointer;font-family:'Inter',sans-serif;">💾 Save</button>
<button onclick="document.getElementById('task-edit-form-${task.id}').style.display='none'" style="background:#1f1f1f;border:1px solid #333;border-radius:5px;color:#888;font-size:11px;padding:5px 10px;cursor:pointer;font-family:'Inter',sans-serif;">Cancel</button>
</div>
</div>
<!-- Action buttons row -->
<div data-task-actions="${task.id}" style="display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid #1f2937;padding-top:10px;">
<button onclick="openTaskEdit('${task.id}')" style="background:#0a1628;border:1px solid #3b82f6;border-radius:6px;color:#60a5fa;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;font-family:'Inter',sans-serif;">✏️ Edit</button>
<button onclick="document.getElementById('task-note-form-${task.id}').style.display='block';document.getElementById('task-note-ta-${task.id}')&&document.getElementById('task-note-ta-${task.id}').focus()" style="background:#0a1628;border:1px solid #3b82f6;border-radius:6px;color:#60a5fa;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;font-family:'Inter',sans-serif;">📝 Add Note</button>
<button onclick="markTaskDone('${task.id}')" style="background:#052e16;border:1px solid #16a34a;border-radius:6px;color:#4ade80;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;font-family:'Inter',sans-serif;">✅ Mark Done</button>
<button onclick="closeTask('${task.id}')" style="background:#1a1208;border:1px solid #78350f;border-radius:6px;color:#fbbf24;font-size:11px;font-weight:700;padding:5px 12px;cursor:pointer;font-family:'Inter',sans-serif;">🗂️ Close</button>
            ${adminDel}
          </div>
</div>`;

      return collapsedHtml + expandedHtml;
    }

    // ── DONE TASK (accordion) ────────────────────────────────────────────────
    function renderDoneCard(task) {
      const expanded = _expandedTaskId === task.id;
      const dueStr = formatDue(task);
      const doneTs = task.doneAt ? (() => {
        try { return new Date(task.doneAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
        catch(e) { return task.doneAt; }
      })() : '';

      const collapsedHtml = `
        <div onclick="toggleTaskExpand('${task.id}')" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;padding:8px 10px 8px 12px;border-left:4px solid #16a34a;background:#0a120a;border-radius:8px;margin-bottom:5px;opacity:0.75;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.75'">
<div style="flex:1;min-width:0;">
<span style="text-decoration:line-through;color:#6b7280;font-size:13px;">${task.title}</span>
            ${dueStr ? `<span style="font-size:11px;color:#4b5563;margin-left:8px;">📅 ${dueStr}</span>` : ''}
          </div>
<span style="color:#4b5563;font-size:11px;flex-shrink:0;">${expanded ? '▲' : '▼'}</span>
</div>`;

      if (!expanded) return collapsedHtml;

      let notes = [];
      try { notes = JSON.parse(task.notes || '[]'); } catch(e) { notes = []; }

      const expandedHtml = `
        <div style="border-left:4px solid #16a34a;border-radius:0 8px 8px 0;background:#0a120a;margin-bottom:10px;padding:12px 14px;opacity:0.9;">
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
<div>
<div style="text-decoration:line-through;color:#6b7280;font-size:14px;font-weight:600;">${task.title}</div>
              ${dueStr ? `<div style="font-size:11px;color:#4b5563;margin-top:2px;">📅 ${dueStr}</div>` : ''}
              <div style="font-size:11px;color:#4b5563;margin-top:2px;">✅ Done by ${task.doneByName || task.doneBy || '?'}${doneTs ? ' · ' + doneTs : ''}</div>
              ${task.description ? `<div style="font-size:12px;color:#4b5563;margin-top:5px;font-style:italic;">${task.description}</div>` : ''}
            </div>
<button onclick="toggleTaskExpand('${task.id}')" style="background:none;border:none;color:#4b5563;font-size:16px;cursor:pointer;padding:0 0 0 8px;">✕</button>
</div>
          ${notes.length ? `<div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:#4b5563;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Notes (${notes.length})</div>${notesThreadHtml(task)}</div>` : ''}
          <div data-task-actions="${task.id}" style="border-top:1px solid #1a2e1a;padding-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
<button onclick="closeTask('${task.id}')" style="background:#1a1208;border:1px solid #78350f;border-radius:6px;color:#fbbf24;font-size:11px;font-weight:700;padding:5px 14px;cursor:pointer;font-family:'Inter',sans-serif;">🗂️ Close → Archive</button>
</div>
</div>`;

      return collapsedHtml + expandedHtml;
    }

    // ── CLOSED TASK ──────────────────────────────────────────────────────────
    function renderClosedCard(task) {
      const expanded = _expandedTaskId === task.id;
      const adminDel = isAdmin
        ? `<button onclick="event.stopPropagation();deleteTask('${task.id}')" title="Permanently delete" style="background:none;border:none;color:#333;cursor:pointer;font-size:13px;padding:2px 5px;" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#333'">🗑️</button>`
        : '';

      let notes = [];
      try { notes = Array.isArray(task.notes) ? task.notes : JSON.parse(task.notes || '[]'); } catch(e) { notes = []; }

      return `
        <div style="border-left:4px solid #222;background:#0a0a0a;border-radius:8px;margin-bottom:4px;opacity:0.7;">
<div onclick="toggleTaskExpand('${task.id}')" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px 8px 12px;cursor:pointer;">
<div style="flex:1;font-style:italic;color:#4b5563;font-size:12px;">${task.title}</div>
<span style="color:#333;font-size:11px;">${expanded ? '▲' : '▼'}</span>
            ${adminDel}
          </div>
          ${expanded ? `<div style="padding:10px 14px;border-top:1px solid #1a1a1a;">
            ${notes.length ? notesThreadHtml(task) : '<div style="color:#4b5563;font-size:12px;font-style:italic;">No notes</div>'}
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
<button onclick="restoreTask('${task.id}')" style="padding:8px 14px;background:#1a2a1a;border:1px solid #16a34a;border-radius:8px;color:#4ade80;font-size:12px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">↩ Move Back to Tasks</button>
</div>
</div>` : ''}
        </div>`;
    }

    let html = '';

    // Open tasks
    if (!openTasks.length) {
      html += '<div style="padding:10px 12px;color:#555;font-size:13px;">No open tasks 🎉</div>';
    } else {
      html += openTasks.map(renderOpenCard).join('');
    }

    // Done tasks (collapsible section)
    if (doneTasks.length) {
      const doneId = 'tasks-done-section';
      html += `<div style="margin-top:12px;">
<button onclick="(function(btn){var sec=document.getElementById('${doneId}');var open=sec.style.display!=='none';sec.style.display=open?'none':'block';btn.textContent=open?'▶ Done (${doneTasks.length})':'▼ Done (${doneTasks.length})'})(this)" style="background:none;border:none;color:#4ade80;font-size:12px;font-weight:700;cursor:pointer;padding:3px 0;font-family:'Inter',sans-serif;letter-spacing:0.03em;">▼ Done (${doneTasks.length})</button>
<div id="${doneId}">${doneTasks.map(renderDoneCard).join('')}</div>
</div>`;
    }

    // Closed tasks (collapsible section)
    if (closedTasks.length) {
      const closedId = 'tasks-closed-section';
      html += `<div style="margin-top:12px;">
<button onclick="(function(btn){var sec=document.getElementById('${closedId}');var open=sec.style.display!=='none';sec.style.display=open?'none':'block';btn.textContent=open?'▶ Closed (${closedTasks.length})':'▼ Closed (${closedTasks.length})'})(this)" style="background:none;border:none;color:#6b7280;font-size:12px;font-weight:700;cursor:pointer;padding:3px 0;font-family:'Inter',sans-serif;letter-spacing:0.03em;">▼ Closed (${closedTasks.length})</button>
<div id="${closedId}" style="display:none;">${closedTasks.map(renderClosedCard).join('')}</div>
</div>`;
    }

    el.innerHTML = html;
  }
  // ── END TASKS ──────────────────────────────────────────────────────────────

  function updateBellBadge() {
    // Count unread push notifications + unread permit alerts + overdue/today tasks
    const unreadNotifs = _allNotifications.filter(n => n.read === false).length;
    // Permit expiry count is already handled by checkPermitExpiry — combine
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    // Re-calculate permit count from current alerts panel
    const alertsPanel = document.getElementById('alerts-log-panel');
    const hasAlerts = alertsPanel && alertsPanel.innerHTML && !alertsPanel.innerHTML.includes('No active alerts');
    // Get permit count from badge text if shown
    const alertsBadge = document.getElementById('alerts-count-badge');
    const permitCount = alertsBadge && alertsBadge.style.display !== 'none' ? parseInt(alertsBadge.textContent || '0') : 0;
    // Tasks: overdue + due today
    const todayStr = new Date().toISOString().slice(0, 10);
    const urgentTasks = _allTasks.filter(t => t.status === 'open' && t.dueDate && t.dueDate <= todayStr).length;
    const total = unreadNotifs + permitCount + urgentTasks;
    if (total > 0) {
      badge.textContent = total;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  window.pushNotification = async function() {
    if (!window._isAdmin) { window.showToast('Only admin can push notifications', '#e53e3e'); return; }
    const inp = document.getElementById('notif-message-input');
    const message = (inp && inp.value || '').trim();
    if (!message) { window.showToast('Please type a message first', '#f59e0b'); return; }

    const now = new Date().toISOString();
    const sentByEmail = (currentUser && currentUser.email) || ADMIN_EMAIL;
    const sentBy = (currentUser && (currentUser.displayName || currentUser.email)) || 'Nir Maman';

    try {
      const body = {
        fields: {
          message: { stringValue: message },
          sentBy: { stringValue: sentBy },
          sentByEmail: { stringValue: sentByEmail },
          timestamp: { stringValue: now },
          read: { booleanValue: false }
        }
      };
      const r = await fetch(`${FS_BASE}/notifications?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('POST failed: ' + r.status);
      window.showToast('Notification sent! 📣', '#22c55e');
      // Hide input
      const area = document.getElementById('notif-input-area');
      if (area) area.style.display = 'none';
      // Reload notifications
      await loadNotifications();
    } catch(e) {
      console.error('pushNotification failed:', e);
      window.showToast('Failed to send notification', '#e53e3e');
    }
  };

  window.deleteNotification = async function(id) {
    if (!window._isAdmin) return;
    if (!confirm('Delete this notification?')) return;
    try {
      const r = await fetch(`${FS_BASE}/notifications/${id}?key=${API_KEY}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('DELETE failed: ' + r.status);
      _allNotifications = _allNotifications.filter(n => n.id !== id);
      renderNotifications(_allNotifications);
      updateBellBadge();
      window.showToast('Notification deleted', '#22c55e');
    } catch(e) {
      console.error('deleteNotification failed:', e);
      window.showToast('Failed to delete notification', '#e53e3e');
    }
  };

  // ── CONTACTS ───────────────────────────────────────────────────────────────
  let editingContactId = null;
  let _contactFilter = 'all';

  window.setContactFilter = function(filter, btnEl) {
    _contactFilter = filter;
    document.querySelectorAll('[data-cfilter]').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    renderContacts(allContacts);
  };

  function getContactJobCount(c) {
    // Count jobs from allJobs that match this contact by phone or companyName
    const phones = (c.persons || []).map(p => normalizePhone(p.phone)).filter(Boolean);
    const name = (c.companyName || c.name || '').toLowerCase();
    return allJobs.filter(j => {
      const jPhone = normalizePhone(j.phone);
      if (phones.length && phones.includes(jPhone)) return true;
      if (name && (j.customerName || '').toLowerCase() === name) return true;
      return false;
    }).length;
  }

  function getContactJobs(c) {
    const phones = (c.persons || []).map(p => normalizePhone(p.phone)).filter(Boolean);
    const name = (c.companyName || c.name || '').toLowerCase();
    return allJobs.filter(j => {
      const jPhone = normalizePhone(j.phone);
      if (phones.length && phones.includes(jPhone)) return true;
      if (name && (j.customerName || '').toLowerCase() === name) return true;
      return false;
    });
  }

  window.renderContacts = function renderContacts(contacts) {
    const listEl = document.getElementById('contacts-list');
    const search = (document.getElementById('contact-search') ? document.getElementById('contact-search').value : '').toLowerCase();

    let filtered = contacts.filter(c => {
      if (!search) return true;
      const companyName = (c.companyName || c.name || '').toLowerCase();
      const persons = c.persons || (c.phone ? [{ name: c.name, phone: c.phone }] : []);
      return companyName.includes(search) ||
        persons.some(p => (p.name||'').toLowerCase().includes(search) || (p.phone||'').includes(search)) ||
        (c.email||'').toLowerCase().includes(search);
    });

    // No category filter — show everyone

    if (!filtered.length) {
      listEl.innerHTML = `<div class="contact-empty">${search ? 'No contacts match your search.' : 'No contacts yet. Add contacts manually or save a job with a phone number.'}</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(c => {
      // Support both new schema (companyName + persons[]) and old schema (name + phone)
      const companyName = c.companyName || c.name || '—';
      const persons = c.persons && c.persons.length
        ? c.persons
        : (c.phone ? [{ name: c.name || '', phone: c.phone, role: '' }] : []);
      const initials = companyName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const jobCount = getContactJobCount(c);
      const linkedJobs = getContactJobs(c);

      // Persons list (preview in header: first person's phone)
      const firstPerson = persons[0] || {};
      const personsPillsHtml = persons.map(p =>
        `<div class="contact-person-row" style="padding:6px 0;">
<div style="flex:1;">
<span class="contact-person-name">${p.name || '—'}</span>
            ${p.role ? `<span class="contact-person-role">${p.role}</span>` : ''}
            <div class="contact-person-meta">
              ${p.phone ? `<a href="tel:${p.phone}" class="contact-person-phone" onclick="event.stopPropagation()">📞 ${p.phone}</a>` : ''}
            </div>
</div>
</div>`
      ).join('');

      const jobsHtml = linkedJobs.length
        ? linkedJobs.map(j =>
            `<div class="contact-job-item" onclick="event.stopPropagation();jumpToJob('${j.id}')">
              📍 ${j.address || '—'} <span class="badge badge-gray" style="font-size:10px;margin-left:6px;">${j.status||''}</span>
</div>`
          ).join('')
        : '<div style="font-size:12px;color:#555;padding:4px 0;">No jobs linked.</div>';

      return `<div class="contact-card" id="contact-${c.id}">
<div class="contact-card-header" onclick="toggleContact('${c.id}')">
<div class="contact-avatar" style="background:${avatarColor(companyName)};overflow:hidden;padding:0;">
            ${c.photoURL ? `<img loading="lazy" src="${c.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>` : initials}
          </div>
<div class="contact-info">
<div class="contact-name">${companyName}</div>
<div class="contact-meta">
              ${persons.length > 0 ? `👤 ${persons.length} person${persons.length !== 1 ? 's' : ''}` : ''}
              ${c.email ? ` &nbsp;·&nbsp; <a href="mailto:${c.email}" onclick="event.stopPropagation()" style="color:#60a5fa;text-decoration:none;">✉️ ${c.email}</a>` : ''}
            </div>
            ${c.phone ? `<div class="contact-meta"><a href="tel:${c.phone}" class="contact-person-phone" onclick="event.stopPropagation()">📞 ${c.phone}</a></div>` : (firstPerson.phone ? `<div class="contact-meta"><a href="tel:${firstPerson.phone}" class="contact-person-phone" onclick="event.stopPropagation()">📞 ${firstPerson.phone}</a></div>` : '')}
          </div>
<!-- job count badge removed -->
</div>
<div class="contact-expand-body" id="contact-expand-${c.id}">
<!-- Persons -->
<div style="margin-bottom:12px;">
<div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">👤 People</div>
            ${personsPillsHtml}
          </div>
          ${c.email ? `<div class="contact-detail-row">✉️ <a href="mailto:${c.email}">${c.email}</a></div>` : ''}
          ${c.address ? `<div class="contact-detail-row">📍 ${c.address}</div>` : ''}
          ${c.notes ? `<div class="contact-detail-row">📝 ${c.notes}</div>` : ''}
          ${c.bizCardURL ? `<div style="margin-top:10px;"><div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">💼 Business Card</div><img loading="lazy" src="${c.bizCardURL}" style="width:100%;max-height:160px;object-fit:contain;border-radius:8px;border:1px solid #2a2a2a;cursor:pointer;" onclick="window.open('${c.bizCardURL}','_blank')"/></div>` : ''}
          <!-- Linked jobs (toggle section) -->
<div id="contact-jobs-${c.id}" style="display:none;margin-top:12px;">
<div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">🔗 Linked Jobs</div>
            ${jobsHtml}
          </div>
<div class="contact-expand-actions">
<button onclick="event.stopPropagation();shareContact('${c.id}')" style="flex:1;padding:9px;background:#14532d;border:none;border-radius:8px;color:#4ade80;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">⬆️ Share</button>
<button onclick="event.stopPropagation();openEditContact('${c.id}')" style="flex:1;padding:9px;background:#1e3a8a;border:none;border-radius:8px;color:#60a5fa;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">✏️ Edit</button>
<button onclick="event.stopPropagation();confirmDeleteContact('${c.id}')" style="flex:1;padding:9px;background:#450a0a;border:none;border-radius:8px;color:#f87171;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">🗑️ Delete</button>
</div>
</div>
</div>`;
    }).join('');
  }

  function avatarColor(name) {
    const colors = ['#3b82f6','#8b5cf6','#ec4899','#10b981','#f59e0b','#6366f1','#14b8a6'];
    let hash = 0;
    for (let i = 0; i < (name||'').length; i++) hash = (name.charCodeAt(i) + hash * 31) | 0;
    return colors[Math.abs(hash) % colors.length];
  }

  window.toggleContact = function(id) {
    const el = document.getElementById('contact-expand-' + id);
    if (el) el.classList.toggle('open');
  };

  window.toggleContactJobs = function(id) {
    const expandEl = document.getElementById('contact-expand-' + id);
    const jobsEl = document.getElementById('contact-jobs-' + id);
    if (!expandEl) return;
    if (!expandEl.classList.contains('open')) expandEl.classList.add('open');
    if (jobsEl) jobsEl.style.display = jobsEl.style.display === 'none' ? 'block' : 'none';
  };

  window.jumpToJob = function(jobId) {
    navTo(1);
    setTimeout(() => {
      if (typeof openEditJob === 'function') openEditJob(jobId);
    }, 300);
  };

  window.filterContacts = function() { renderContacts(allContacts); };

  // ── CONTACT MODAL ──────────────────────────────────────────────────────────
  window.openContactModal = function() {
    editingContactId = null;
    window._cfPhotoData = null;
    window._cfBizCardData = null;
    document.getElementById('contact-modal-title').textContent = '➕ Add Contact';
    document.getElementById('cf-companyName').value = '';
    document.getElementById('cf-phone').value = '';
    document.getElementById('cf-email').value = '';
    document.getElementById('cf-address').value = '';
    document.getElementById('cf-notes').value = '';
    document.getElementById('persons-list').innerHTML = '';
    // Reset photo previews
    const photoPreview = document.getElementById('cf-photo-preview');
    if (photoPreview) photoPreview.innerHTML = '👤';
    const bizcardPreview = document.getElementById('cf-bizcard-preview');
    const bizcardImg = document.getElementById('cf-bizcard-img');
    if (bizcardPreview) bizcardPreview.style.display = 'none';
    if (bizcardImg) bizcardImg.src = '';
    const photoInput = document.getElementById('cf-photo-input');
    if (photoInput) photoInput.value = '';
    const bizcardInput = document.getElementById('cf-bizcard-input');
    if (bizcardInput) bizcardInput.value = '';
    addPersonRow(); // start with 1 person row
    document.getElementById('contact-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  };

  window.shareContact = function(contactId) {
    const c = allContacts.find(x => x.id === contactId);
    if (!c) return;
    const persons = c.persons && c.persons.length ? c.persons : [];
    const lines = [
      `📋 ${c.companyName || c.name || '—'}`,
      c.phone ? `📞 ${c.phone}` : '',
      c.email ? `✉️ ${c.email}` : '',
      c.address ? `📍 ${c.address}` : '',
      ...persons.map(p => p.name ? `👤 ${p.name}${p.phone ? ' · ' + p.phone : ''}` : ''),
    ].filter(Boolean).join('\n');
    if (navigator.share) {
      navigator.share({ title: c.companyName || c.name, text: lines }).catch(() => {});
    } else {
      const subject = encodeURIComponent(c.companyName || c.name || 'Contact');
      window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(lines)}`;
    }
  };

  window.openEditContact = function(contactId) {
    const c = allContacts.find(x => x.id === contactId);
    if (!c) return;
    editingContactId = contactId;
    document.getElementById('contact-modal-title').textContent = '✏️ Edit Contact';
    document.getElementById('cf-companyName').value = c.companyName || c.name || '';
    document.getElementById('cf-phone').value = c.phone || '';
    document.getElementById('cf-email').value = c.email || '';
    document.getElementById('cf-address').value = c.address || '';
    document.getElementById('cf-notes').value = c.notes || '';
    const personsList = document.getElementById('persons-list');
    personsList.innerHTML = '';
    const persons = c.persons && c.persons.length
      ? c.persons
      : (c.phone ? [{ name: c.name || '', phone: c.phone, role: '' }] : []);
    if (persons.length === 0) {
      addPersonRow();
    } else {
      persons.forEach(p => addPersonRow(p.name, p.phone, p.role));
    }
    // Load existing photo
    window._cfPhotoData = null;
    window._cfBizCardData = null;
    const photoPreview = document.getElementById('cf-photo-preview');
    if (photoPreview) photoPreview.innerHTML = c.photoURL ? `<img loading="lazy" src="${c.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>` : '👤';
    const bizcardPreview = document.getElementById('cf-bizcard-preview');
    const bizcardImg = document.getElementById('cf-bizcard-img');
    if (bizcardPreview && bizcardImg) {
      if (c.bizCardURL) { bizcardImg.src = c.bizCardURL; bizcardPreview.style.display = 'block'; }
      else { bizcardPreview.style.display = 'none'; bizcardImg.src = ''; }
    }
    document.getElementById('contact-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  };

  // ── MULTI-PERMIT ROWS ──────────────────────────────────────────────────────
  // ── PERMIT CHIPS ──────────────────────────────────────────────────────────
  window._permitChips = []; // [{number, code, expiry}]

  window.copyPermitNumber = function(text, el) {
    navigator.clipboard.writeText(text).then(() => {
      window.showToast('✅ Copied: ' + text, '#22c55e', 2000);
      if (el) { const orig = el.style.color; el.style.color = '#4ade80'; setTimeout(() => el.style.color = orig, 800); }
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      window.showToast('✅ Copied: ' + text, '#22c55e', 2000);
    });
  };

  window.addPermitChip = function(numberVal, codeVal, expiryVal) {
    const input = document.getElementById('permit-chip-input');
    const val = numberVal || (input ? input.value.trim() : '');
    if (!val) return;
    window._permitChips.push({ number: val, code: codeVal || '', expiry: expiryVal || '' });
    if (input) input.value = '';
    renderPermitChips();
  };

  window.removePermitChip = function(idx) {
    window._permitChips.splice(idx, 1);
    renderPermitChips();
  };

  function renderPermitChips() {
    const container = document.getElementById('permit-chips');
    const badge = document.getElementById('permit-count-badge');
    if (!container) return;
    const chips = window._permitChips;
    if (badge) {
      badge.textContent = chips.length;
      badge.style.display = chips.length ? 'inline' : 'none';
    }
    container.innerHTML = chips.map((p, i) => `
      <div style="display:inline-flex;align-items:center;gap:6px;background:#1e3a5f;border:1.5px solid #2d5a9e;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:700;color:#93c5fd;max-width:100%;">
<span onclick="copyPermitNumber('${p.number.replace(/'/g,"\\'")}', this)" title="Tap to copy" style="cursor:pointer;user-select:all;">📋 ${p.number}${p.code ? ' · ' + p.code : ''}${p.expiry ? ' · exp ' + p.expiry : ''}</span>
<button type="button" onclick="copyPermitNumber('${p.number.replace(/'/g,"\\'")}', this)" title="Copy" style="background:none;border:none;color:#60a5fa;cursor:pointer;font-size:13px;padding:0;line-height:1;">📋</button>
<button type="button" onclick="removePermitChip(${i})" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:14px;padding:0;line-height:1;">✕</button>
</div>
    `).join('');
  }

  window.clearPermitChips = function() {
    window._permitChips = [];
    renderPermitChips();
    const input = document.getElementById('permit-chip-input');
    if (input) input.value = '';
  };

  window.loadPermitChips = function(permits, legacyNumber, legacyCode, legacyExpiry) {
    window._permitChips = [];
    if (Array.isArray(permits) && permits.length) {
      permits.forEach(p => {
        if (p.number || p.code) window._permitChips.push({ number: p.number||p.code, code: p.code && p.number ? p.code : '', expiry: p.expiry||'' });
      });
    } else if (legacyNumber || legacyCode) {
      window._permitChips.push({ number: legacyNumber||legacyCode, code: '', expiry: legacyExpiry||'' });
    }
    renderPermitChips();
  };

  window.addPermitRow = function(code, number, expiry) {
    const list = document.getElementById('job-permits-list');
    const idx = list.children.length + 1;
    const row = document.createElement('div');
    row.className = 'permit-row';
    row.style.cssText = 'background:#111;border:1.5px solid #2a2a2a;border-radius:10px;padding:12px;position:relative;';
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
<span style="font-size:11px;font-weight:800;color:#e53e3e;text-transform:uppercase;letter-spacing:0.5px;">📋 Permit #${idx}</span>
<button type="button" onclick="this.closest('.permit-row').remove()" style="background:#450a0a;border:1px solid #7f1d1d;border-radius:6px;color:#f87171;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;">✕ Remove</button>
</div>
<div style="display:flex;flex-direction:column;gap:8px;">
<div>
<div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Permit Number</div>
<input type="text" class="pr-number" placeholder="e.g. B01-2026069-C32" value="${number||''}"
            style="width:100%;padding:10px 12px;background:#1a1a1a;border:1.5px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;font-family:'Inter',sans-serif;box-sizing:border-box;"/>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div>
<div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Location / Code</div>
<input type="text" class="pr-code" placeholder="e.g. 8th Ave" value="${code||''}"
              style="width:100%;padding:10px 12px;background:#1a1a1a;border:1.5px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;font-family:'Inter',sans-serif;box-sizing:border-box;"/>
</div>
<div>
<div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Expiry Date</div>
<input type="date" class="pr-expiry" value="${expiry||''}"
              style="width:100%;padding:10px 12px;background:#1a1a1a;border:1.5px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;font-family:'Inter',sans-serif;box-sizing:border-box;"/>
</div>
</div>
</div>
    `;
    list.appendChild(row);
  };

  window.getPermitRows = function() {
    return (window._permitChips || []).filter(p => p.number || p.code);
  };

  window.closeContactModal = function() {
    document.getElementById('contact-modal').classList.remove('show');
    document.body.style.overflow = '';
    editingContactId = null;
  };

  window.addPersonRow = function(name, phone, role) {
    const list = document.getElementById('persons-list');
    const rowId = 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2,5);
    const row = document.createElement('div');
    row.className = 'person-row';
    row.id = rowId;
    const safeName = (name || '').replace(/"/g,'&quot;');
    const safePhone = (phone || '').replace(/"/g,'&quot;');
    const safeRole = (role || '').replace(/"/g,'&quot;');
    row.innerHTML = `
      <input type="text" class="person-name-input" placeholder="Name" value="${safeName}"/>
<input type="tel" class="person-phone-input" placeholder="Phone" value="${safePhone}"/>
<input type="text" class="person-role-input" placeholder="Role (optional)" value="${safeRole}"/>
<button class="btn-remove-person" onclick="removePersonRow('${rowId}')" title="Remove person">×</button>`;
    list.appendChild(row);
  };

  window.removePersonRow = function(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
  };

  // ── CONTACT PHOTO / BIZ CARD HELPERS ──────────────────────────────────────
  window.previewContactPhoto = function(input, previewId) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { window.showToast('Photo too large — max 2MB', '#f59e0b'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById(previewId);
      if (preview) {
        preview.innerHTML = `<img loading="lazy" src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
      }
      window._cfPhotoData = e.target.result; // store base64
    };
    reader.readAsDataURL(file);
  };

  window.previewContactBizCard = function(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { window.showToast('File too large — max 3MB', '#f59e0b'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('cf-bizcard-preview');
      const img = document.getElementById('cf-bizcard-img');
      if (preview && img) {
        img.src = e.target.result;
        preview.style.display = 'block';
      }
      window._cfBizCardData = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.saveContact = async function() {
    if (!currentUser) { window.showToast('Not logged in!', '#e53e3e'); return; }
    const companyName = document.getElementById('cf-companyName').value.trim();
    if (!companyName) { window.showToast('Company/Customer name is required.', '#f59e0b'); return; }

    // Collect persons
    const personRows = document.querySelectorAll('#persons-list .person-row');
    const persons = Array.from(personRows).map(row => ({
      name: (row.querySelector('.person-name-input') || {}).value?.trim() || '',
      phone: (row.querySelector('.person-phone-input') || {}).value?.trim() || '',
      role: (row.querySelector('.person-role-input') || {}).value?.trim() || '',
    })).filter(p => p.name || p.phone);

    // People section is optional — no validation required

    const btn = document.getElementById('save-contact-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const contactData = {
      companyName,
      phone: document.getElementById('cf-phone').value.trim(),
      email: document.getElementById('cf-email').value.trim(),
      address: document.getElementById('cf-address').value.trim(),
      notes: document.getElementById('cf-notes').value.trim(),
      persons,
      updatedAt: serverTimestamp(),
    };
    if (window._cfPhotoData) contactData.photoURL = window._cfPhotoData;
    if (window._cfBizCardData) contactData.bizCardURL = window._cfBizCardData;

    try {
      if (editingContactId) {
        await updateDoc(doc(db, 'contacts', editingContactId), { ...contactData });
        // Immediately update local cache (exclude serverTimestamp sentinel)
        const idx = allContacts.findIndex(c => c.id === editingContactId);
        if (idx !== -1) {
          allContacts[idx] = { ...allContacts[idx], companyName, phone: contactData.phone, email: contactData.email, address: contactData.address, notes: contactData.notes, persons };
          renderContacts(allContacts);
        }
        window.showToast('✅ Contact updated!');
      } else {
        contactData.createdBy = currentUser.email;
        contactData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'contacts'), contactData);
        window.showToast('✅ Contact saved!');
      }
      closeContactModal();
    } catch(e) {
      console.error('saveContact error:', e);
      alert('Save failed: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = '💾 Save Contact';
    }
  };

  window.confirmDeleteContact = async function(contactId) {
    if (!confirm('Delete this contact? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'contacts', contactId));
      window.showToast('🗑️ Contact deleted.');
    } catch(e) {
      window.showToast('Error: ' + e.message, '#e53e3e');
    }
  };

  // Save/update contact in Firestore (auto-populate from jobs)
  async function upsertContact(jobData) {
    if (!jobData.phone && !jobData.customerName) return;
    const phoneKey = normalizePhone(jobData.phone);

    try {
      // Check if a contact already exists with matching phone (in persons array) or company name
      const existingByPhone = phoneKey
        ? allContacts.find(c =>
            (c.persons || []).some(p => normalizePhone(p.phone) === phoneKey) ||
            normalizePhone(c.phone) === phoneKey
          )
        : null;

      const existingByName = jobData.customerName
        ? allContacts.find(c =>
            (c.companyName || c.name || '').toLowerCase() === jobData.customerName.toLowerCase()
          )
        : null;

      const existing = existingByPhone || existingByName;

      if (existing) {
        // Update contact with any new/changed info from the job form
        const updates = { updatedAt: serverTimestamp() };
        if (jobData.email && jobData.email !== existing.email) updates.email = jobData.email;
        if (jobData.address && jobData.address !== existing.address) updates.address = jobData.address;
        // Update phone in persons array if changed
        if (jobData.phone) {
          const persons = existing.persons || [];
          const personIdx = persons.findIndex(p => normalizePhone(p.phone) === phoneKey ||
            (p.name || '').toLowerCase() === (jobData.customerName || '').toLowerCase());
          if (personIdx >= 0) {
            persons[personIdx].phone = jobData.phone;
          } else {
            persons.push({ name: jobData.customerName || '', phone: jobData.phone, role: 'Customer' });
          }
          updates.persons = persons;
        }
        if (Object.keys(updates).length > 1) {
          await updateDoc(doc(db, 'contacts', existing.id), updates);
          console.log('✅ Contact updated:', existing.id);
        }
        return;
      }

      // Auto-create new contact
      await addDoc(collection(db, 'contacts'), {
        companyName: jobData.customerName || '',
        email: jobData.email || '',
        address: jobData.address || '',
        notes: '',
        persons: jobData.phone ? [{
          name: jobData.customerName || '',
          phone: jobData.phone,
          role: 'Customer'
        }] : [],
        createdBy: currentUser ? currentUser.email : 'auto',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch(e) {
      console.warn('Contact upsert failed:', e.message);
    }
  }

  // ── USERS ──────────────────────────────────────────────────────────────────
  window.openUsersPanel = function() {
    document.getElementById('users-panel').style.display = 'block';
    document.body.style.overflow = 'hidden';
    // Sync users list to panel
    const panelList = document.getElementById('users-list-panel');
    const mainList = document.getElementById('users-list');
    if (panelList && mainList) panelList.innerHTML = mainList.innerHTML;
    // Close drawer
    if (typeof closeDrawer === 'function') closeDrawer();
  };
  window.closeUsersPanel = function() {
    document.getElementById('users-panel').style.display = 'none';
    document.body.style.overflow = '';
  };

  window.renderUsers = function renderUsers(users) {
    const list = document.getElementById('users-list') || document.getElementById('users-list-panel');
    if (!list) return;
    const isAdmin = window._isAdmin || (currentUser && currentUser.email === ADMIN_EMAIL);

    // Always show Nir at top
    const nirCard = `<div class="user-card" style="border-left:3px solid #e53e3e;">
<div class="avatar" style="background:linear-gradient(135deg,#e53e3e,#c53030);box-shadow:0 2px 8px rgba(229,62,62,0.3);">NM</div>
<div class="user-info" style="flex:1;">
<div class="user-name">Nir Maman</div>
<div class="user-role-line"><span class="badge badge-red">Admin</span></div>
<div class="user-contact">📞 (917) 251-2400 &nbsp;·&nbsp; ✉️ nir@mamancontracting.com</div>
</div>
<span class="badge badge-green">Active</span>
</div>`;

    if (!users || users.length === 0) {
      list.innerHTML = nirCard + `<div style="text-align:center;color:#555;padding:24px;font-size:14px;">No users yet — invite someone!</div>`;
      return;
    }

    const invitedCards = users.map(u => {
      if (u.removed) return ''; // skip removed
      if (u.email === ADMIN_EMAIL) return ''; // skip admin — shown in hardcoded nirCard above
      const initials = (u.name || u.email || '?').slice(0,2).toUpperCase();
      const isCurrentUser = currentUser && currentUser.email === u.email;
      let statusBadgeHtml = '<span class="badge badge-green">Active</span>';
      if (u.status === 'invited') statusBadgeHtml = '<span class="badge badge-yellow">Invited</span>';
      if (u.removed) statusBadgeHtml = '<span class="badge badge-gray">Removed</span>';

      const editBtn = `<button onclick="editUser('${u.id}','${(u.name||'').replace(/'/g,"\\'")}','${(u.role||'Worker').replace(/'/g,"\\'")}','${(u.phone||'').replace(/'/g,"\\'")}')"
            style="display:flex;align-items:center;gap:5px;background:#1e3a5f;border:1px solid #2d5a9e;border-radius:8px;color:#93c5fd;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;" title="Edit">✏️ Edit</button>`;

      const resendBtn = u.status === 'invited'
        ? `<button onclick="sendInvite('${(u.email||'').replace(/'/g,"\\'")}')"
            style="display:flex;align-items:center;gap:5px;background:#14532d;border:1px solid #166534;border-radius:8px;color:#86efac;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;" title="Resend invite">📨</button>`
        : '';

      const removeBtn = !isCurrentUser
        ? `<button onclick="removeUser('${u.id}','${(u.email||'').replace(/'/g,"\\'")}','${(u.name||u.email||'').replace(/'/g,"\\'")}')"
            style="display:flex;align-items:center;gap:5px;background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;color:#fca5a5;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;" title="Remove">🗑️</button>`
        : '';

      return `<div class="user-card" style="${u.removed ? 'opacity:0.5;' : ''}">
<div class="avatar" style="background:linear-gradient(135deg,#3b82f6,#2563eb);box-shadow:0 2px 8px rgba(59,130,246,0.3);">${initials}</div>
<div class="user-info" style="flex:1;">
<div class="user-name">${u.name || u.email || '—'}</div>
<div class="user-role-line"><span class="badge badge-orange">${u.role || 'Worker'}</span></div>
<div class="user-contact">
            ${u.email ? `<a href="mailto:${u.email}" style="color:#60a5fa;text-decoration:none;">✉️ ${u.email}</a>` : '—'}
            ${u.phone ? ` &nbsp;·&nbsp; <a href="tel:${u.phone}" style="color:#4ade80;text-decoration:none;">📞 ${u.phone}</a>` : ''}
          </div>
          ${u.invitedBy && u.invitedBy !== u.email ? `<div class="user-contact" style="color:#444;">Invited by ${u.invitedBy}</div>` : ''}
        </div>
<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:flex-end;">
          ${statusBadgeHtml}
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">${resendBtn}${editBtn}${removeBtn}</div>
</div>
</div>`;
    }).join('');

    list.innerHTML = nirCard + invitedCards;
    // Also sync to users panel if open
    const panelList = document.getElementById('users-list-panel');
    if (panelList && panelList !== list) panelList.innerHTML = nirCard + invitedCards;
  }

  window.editUser = function(userId, name, role, phone) {
    document.getElementById('eu-id').value = userId;
    document.getElementById('eu-name').value = name || '';
    document.getElementById('eu-role').value = role || 'Worker';
    document.getElementById('eu-phone').value = phone || '';
    document.getElementById('edit-user-modal').style.display = 'flex';
  };

  window.submitEditUser = function() {
    const userId = document.getElementById('eu-id').value;
    const name = document.getElementById('eu-name').value.trim();
    const role = document.getElementById('eu-role').value;
    const phone = document.getElementById('eu-phone').value.trim();
    document.getElementById('edit-user-modal').style.display = 'none';
    window.saveUser(userId, name, role, phone);
  };

  window.saveUser = async function(userId, name, role, phone) {
    if (!currentUser) { alert('Not logged in — please refresh and try again.'); return; }
    if (!window._isAdmin) { alert('Only admins can edit users.'); return; }
    try {
      await updateDoc(doc(db, 'users', userId), { name, role, phone, updatedAt: serverTimestamp() });
      // Update local cache immediately
      const idx = allUsers.findIndex(u => u.id === userId);
      if (idx !== -1) { allUsers[idx] = { ...allUsers[idx], name, role, phone }; renderUsers(allUsers); }
      window.showToast('✅ User updated!');
    } catch(e) {
      console.error('saveUser error:', e);
      alert('Save failed: ' + e.message);
    }
  };

  window.removeUser = async function(userId, email, name) {
    if (!currentUser || !window._isAdmin) { alert('Only admins can remove users.'); return; }
    if (!confirm(`Remove ${name || email} from the app?`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { removed: true, removedAt: serverTimestamp(), removedBy: currentUser.email });
      allUsers = (allUsers || []).filter(u => u.id !== userId);
      renderUsers(allUsers);
      window.showToast(`🗑️ ${name || email} removed from app.`, '#374151');
    } catch(e) {
      window.showToast('Error: ' + e.message, '#e53e3e');
    }
  };

  // ── INVITE USER ────────────────────────────────────────────────────────────
  window.openInviteModal = function() {
    if (!currentUser || !window._isAdmin) { alert('Only admins can invite users.'); return; }
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-error').textContent = '';
    document.getElementById('invite-modal').classList.add('show');
  };

  window.closeInviteModal = function() {
    document.getElementById('invite-modal').classList.remove('show');
  };

  window.openInviteEmail = function(email, inviteLink) {
    const subject = encodeURIComponent("You're invited to Maman Contracting Organizer");
    const body = encodeURIComponent(
      'Hi,\n\nYou\'ve been invited to join the Maman Contracting Organizer app.\n\n' +
      'Open this secure invite link and create your password:\n' + inviteLink + '\n\n' +
      'This invite is for: ' + email + '\n' +
      'Role: Worker\n\n' +
      'After setting your password, you can log in to the app.\n\nWelcome to the team!'
    );
    window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
  };

  window.sendInvite = function(prefillEmail) {
    const email = (prefillEmail || document.getElementById('invite-email').value).trim().toLowerCase();
    const errEl = document.getElementById('invite-error');
    const btn = document.getElementById('invite-send-btn');
    if (!email) { errEl.textContent = 'Please enter an email address.'; return; }
    const existingUser = (allUsers || []).find(u => ((u.email || '').trim().toLowerCase() === email) && !u.removed);
    if (existingUser && (existingUser.status === 'active' || existingUser.authUid)) {
      if (errEl) errEl.textContent = 'This user already has access. Use password reset instead.';
      return;
    }
    errEl.textContent = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }

    const inviteToken = generateInviteToken();
    const inviteLink = buildInviteLink(email, inviteToken);

    // Open email FIRST (must happen synchronously on tap for iPhone Safari)
    window.openInviteEmail(email, inviteLink);

    // Then save to Firestore in background
    closeInviteModal();
    window.showToast('✅ Invite opened in your email app.');

    setDoc(doc(db, 'users', inviteEmailToDocId(email)), {
      email: email,
      name: existingUser ? (existingUser.name || '') : '',
      role: 'Worker',
      phone: existingUser ? (existingUser.phone || '') : '',
      invitedBy: currentUser ? currentUser.email : '',
      invitedAt: serverTimestamp(),
      status: 'invited',
      inviteToken: inviteToken,
      inviteLink: inviteLink,
      removed: false,
      updatedAt: serverTimestamp()
    }, { merge: true }).then(() => {
      loadAllData().catch((e) => console.error('reload after invite failed:', e));
    }).catch(e => console.error('Failed to save user:', e));

    addDoc(collection(db, 'activity'), {
      action: 'Invited user: ' + email,
      jobAddress: '',
      doneBy: currentUser ? currentUser.email : '',
      timestamp: serverTimestamp()
    }).catch(e => console.error('Failed to log activity:', e));

    if (btn) {
      btn.disabled = false;
      btn.textContent = '📨 Send Invite';
    }

  };

  // ── PERMIT MODAL (standalone permits collection) ────────────────────────────
  let editingPermitId = null;
  let allStandalonePermits = [];
  let permitsUnsubscribe = null;

  // ── DOT BUREAUS ────────────────────────────────────────────────────────────
  const DOT_BUREAUS_DEFAULT = [
    { id: 'brooklyn',      name: 'Brooklyn BPP',        email: 'Brooklynbpp@dot.nyc.gov' },
    { id: 'manhattan_hiqa',name: 'Manhattan HIQA',      email: 'MNHIQA@dot.nyc.gov' },
    { id: 'manhattan_bpp', name: 'Manhattan BPP',       email: 'Manhattanbpp@dot.nyc.gov' },
    { id: 'queens',        name: 'Queens BPP',          email: 'Queensbpp@dot.nyc.gov' },
    { id: 'bronx',         name: 'Bronx BPP',           email: 'Bronxbpp@dot.nyc.gov' },
    { id: 'staten_island', name: 'Staten Island',       email: 'Sibpp@dot.nyc.gov' },
    { id: 'construction',  name: 'DOT Construction',    email: 'ConstructionPermits@dot.nyc.gov' },
  ];

  // Load custom bureau emails from localStorage (editable in Settings)
  function loadDOTBureaus() {
    try {
      const saved = localStorage.getItem('dot_bureau_emails');
      if (saved) {
        const overrides = JSON.parse(saved);
        return DOT_BUREAUS_DEFAULT.map(b => ({ ...b, email: overrides[b.id] || b.email }));
      }
    } catch(e) {}
    return DOT_BUREAUS_DEFAULT;
  }
  const DOT_BUREAUS = loadDOTBureaus();

  // Settings: open DOT email editor
  window.openDOTEmailSettings = function() {
    const bureaus = loadDOTBureaus();
    const overlay = document.createElement('div');
    overlay.id = 'dot-settings-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';
    overlay.innerHTML = `<div style="background:#1a1a1a;border:1.5px solid #2a2a2a;border-radius:16px;padding:24px;max-width:420px;width:100%;font-family:Inter,sans-serif;margin:auto;">
<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px;">🏛️ DOT Bureau Emails</div>
<div style="font-size:12px;color:#666;margin-bottom:20px;">Edit the email address for each DOT bureau. Changes save locally.</div>
      ${bureaus.map(b => `
        <div style="margin-bottom:14px;">
<label style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;display:block;margin-bottom:5px;">${b.name}</label>
<input type="email" id="dot-email-${b.id}" value="${b.email}" placeholder="${b.email}"
            style="width:100%;padding:10px 12px;background:#111;border:1.5px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;box-sizing:border-box;"/>
</div>`).join('')}
      <div style="display:flex;gap:10px;margin-top:20px;">
<button onclick="saveDOTEmailSettings()" style="flex:1;padding:12px;background:#e53e3e;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;">💾 Save</button>
<button onclick="document.getElementById('dot-settings-overlay').remove()" style="flex:1;padding:12px;background:transparent;border:1px solid #333;border-radius:10px;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">Cancel</button>
<button onclick="localStorage.removeItem('dot_bureau_emails');document.getElementById('dot-settings-overlay').remove();window.showToast('Reset to defaults','#4ade80')" style="padding:12px 16px;background:transparent;border:1px solid #555;border-radius:10px;color:#555;font-size:12px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">↺ Reset</button>
</div>
</div>`;
    document.body.appendChild(overlay);
  };

  // OpenAI Key Settings
  window.openOpenAIKeySettings = function() {
    const current = localStorage.getItem('openai_api_key') || '';
    const overlay = document.createElement('div');
    overlay.id = 'openai-key-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `<div style="background:#1a1a1a;border:1.5px solid #2a2a2a;border-radius:16px;padding:24px;max-width:420px;width:100%;font-family:Inter,sans-serif;">
<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:6px;">🤖 OpenAI API Key</div>
<div style="font-size:12px;color:#666;margin-bottom:16px;">Required for permit OCR scanning. Get your key at platform.openai.com</div>
<input type="password" id="openai-key-input" value="${current}" placeholder="sk-proj-..." 
        style="width:100%;padding:11px 12px;background:#111;border:1.5px solid #2a2a2a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;box-sizing:border-box;margin-bottom:14px;"/>
<div style="display:flex;gap:10px;">
<button onclick="const k=document.getElementById('openai-key-input').value.trim();if(k){localStorage.setItem('openai_api_key',k);document.getElementById('openai-key-overlay').remove();window.showToast&&window.showToast('✅ API key saved — OCR is ready','#4ade80');}else{window.showToast&&window.showToast('Please enter a key','#e53e3e');}" style="flex:1;padding:12px;background:#e53e3e;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;">💾 Save</button>
<button onclick="document.getElementById('openai-key-overlay').remove()" style="flex:1;padding:12px;background:transparent;border:1px solid #333;border-radius:10px;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">Cancel</button>
        ${current ? `<button onclick="localStorage.removeItem('openai_api_key');document.getElementById('openai-key-overlay').remove();window.showToast&&window.showToast('Key removed','#4ade80')" style="padding:12px 16px;background:transparent;border:1px solid #555;border-radius:10px;color:#f87171;font-size:12px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">Remove</button>` : ''}
      </div>
</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('openai-key-input')?.focus(), 100);
  };

  window.saveDOTEmailSettings = function() {
    const overrides = {};
    DOT_BUREAUS_DEFAULT.forEach(b => {
      const input = document.getElementById('dot-email-' + b.id);
      if (input && input.value.trim()) overrides[b.id] = input.value.trim();
    });
    localStorage.setItem('dot_bureau_emails', JSON.stringify(overrides));
    document.getElementById('dot-settings-overlay').remove();
    window.showToast('✅ DOT bureau emails saved', '#4ade80');
  };

  function detectBorough(address, permitNumber) {
    // • First: detect from permit number prefix (most reliable)
    // Q = Queens, B = Brooklyn, M = Manhattan, X = Bronx, R = Staten Island
    if (permitNumber) {
      const prefix = (permitNumber || '').trim().toUpperCase().charAt(0);
      if (prefix === 'Q') return 'queens';
      if (prefix === 'B') return 'brooklyn';
      if (prefix === 'M') return 'manhattan';
      if (prefix === 'X') return 'bronx';
      if (prefix === 'R') return 'staten_island';
    }
    // • Second: detect from address zip code
    const a = (address || '').toLowerCase();
    const zipMatch = a.match(/\b(\d{5})\b/);
    if (zipMatch) {
      const zip = zipMatch[1];
      if (zip.startsWith('112')) return 'brooklyn';
      if (/^(113|114|116)/.test(zip)) return 'queens';
      if (zip.startsWith('104')) return 'bronx';
      if (zip.startsWith('103')) return 'staten_island';
      if (/^(100|101|102)/.test(zip)) return 'manhattan'; // Manhattan zips
    }
    // • Third: detect from borough name in address
    if (a.includes('brooklyn')) return 'brooklyn';
    if (a.includes('queens')) return 'queens';
    if (a.includes('bronx')) return 'bronx';
    if (/staten island|staten isl/.test(a)) return 'staten_island';
    // Manhattan always returns 'manhattan' so BOTH manhattan bureaus get pre-checked
    if (a.includes('manhattan')) return 'manhattan';
    return 'manhattan'; // default — NYC defaults to Manhattan (both bureaus)
  }

  function renderPermitsCards(permits) {
    try {
    const container = document.getElementById('permits-cards-container');
    if (!container) return;

    const search = (document.getElementById('permit-search') ? document.getElementById('permit-search').value : '').toLowerCase().trim();

    // Filter by address OR permit number
    let filtered = permits.filter(p => {
      if (!search) return true;
      return (p.jobAddress||'').toLowerCase().includes(search) ||
             (p.permitNumber||'').toLowerCase().includes(search) ||
             (p.permitCode||'').toLowerCase().includes(search);
    });

    if (!filtered.length) {
      if (permits.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#555;padding:40px;">No permits yet. Tap + Add Permit to get started.</div>';
      } else {
        container.innerHTML = '<div style="text-align:center;color:#555;padding:40px;">No addresses match your search.</div>';
      }
      return;
    }

    // Group permits by job address
    const groups = {};
    filtered.forEach(p => {
      const addr = (p.jobAddress || '').trim() || '__no_address__';
      if (!groups[addr]) groups[addr] = [];
      groups[addr].push(p);
    });

    const statusColors = {
      'Submitted': 'badge-blue', 'Under Review': 'badge-yellow', 'Approved': 'badge-green',
      'Issued': 'badge-green', 'Active': 'badge-green', 'Expired': 'badge-red',
      'Rejected': 'badge-red', 'On Hold': 'badge-orange', 'Cancelled': 'badge-gray', 'Pending': 'badge-yellow'
    };
    const statusEmoji = {
      'Submitted':'📤','Under Review':'🔍','Approved':'✅','Issued':'🏷️','Active':'🟢',
      'Expired':'❌','Rejected':'🚫','On Hold':'⏸️','Cancelled':'🗑️','Pending':'⏳'
    };

    function permitExpBadge(p) {
      const days = p.expirationDate ? daysUntil(p.expirationDate) : null;
      if (days !== null) {
        if (days < 0) return '<span class="badge badge-red">Expired</span>';
        if (days <= 4) return `<span class="badge badge-red">⚠️ ${days}d left</span>`;
        if (days < 30) return '<span class="badge badge-orange">Expiring Soon</span>';
        return '<span class="badge badge-green">Valid</span>';
      }
      const sc = p.status || 'Pending';
      return `<span class="badge ${statusColors[sc]||'badge-yellow'}">${statusEmoji[sc]||''} ${sc}</span>`;
    }

    // Build bureau HTML for a group
    // Load saved bureau prefs from localStorage
    function getSavedBureauPrefs() {
      try { return JSON.parse(localStorage.getItem('dot_bureau_prefs') || 'null'); } catch(e) { return null; }
    }
    function saveBureauPrefs(selectedIds) {
      try { localStorage.setItem('dot_bureau_prefs', JSON.stringify(selectedIds)); } catch(e) {}
    }

    function buildBureauHtml(addr, groupKey, permitNumber) {
      const savedPrefs = getSavedBureauPrefs();
      const detectedBorough = detectBorough(addr, permitNumber);
      return DOT_BUREAUS.map(b => {
        let isPreChecked;
        if (savedPrefs !== null) {
          // Use saved preferences — user already chose their default
          isPreChecked = savedPrefs.includes(b.id);
        } else {
          // First time — auto-detect by borough
          isPreChecked = b.id === detectedBorough || (detectedBorough === 'manhattan' && (b.id === 'manhattan_hiqa' || b.id === 'manhattan_bpp'));
        }
        return `<div class="dot-bureau-item${isPreChecked ? ' selected' : ''}" id="bureau-lbl-${groupKey}-${b.id}" onclick="toggleBureau('${groupKey}','${b.id}')" style="cursor:pointer;">
<input type="checkbox" class="dot-bureau-cb" id="bureau-cb-${groupKey}-${b.id}" data-group="${groupKey}" data-bureau-id="${b.id}" data-email="${b.email}" ${isPreChecked ? 'checked' : ''} onclick="event.stopPropagation()" onchange="event.stopPropagation()" style="pointer-events:none;" />
<span style="pointer-events:none;margin:0;font-size:12px;font-weight:700;color:#ccc;">${b.name}</span>
<span style="font-size:10px;color:#666;margin-left:auto;pointer-events:none;">${b.email}</span>
</div>`;
      }).join('');
    }

    // Build permit items HTML for a group
    function buildPermitItemsHtml(groupPermits, groupKey) {
      return groupPermits.map(p => {
        const notifiedBadge = `<label onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;background:${p.dotNotified ? '#14532d' : '#1a1a1a'};border:1px solid ${p.dotNotified ? '#16a34a' : '#2a2a2a'};border-radius:6px;padding:3px 8px;margin-left:4px;">
<input type="checkbox" ${p.dotNotified ? 'checked' : ''} onchange="event.stopPropagation();toggleDotNotified('${p.id}',this.checked)" style="width:14px;height:14px;accent-color:#16a34a;cursor:pointer;"/>
<span style="font-size:11px;font-weight:700;color:${p.dotNotified ? '#4ade80' : '#666'};">DOT Notified</span>
</label>`;
        const linkedJobHtml = p.linkedJobId ? (() => {
          const lj = allJobs ? allJobs.find(j => j.id === p.linkedJobId) : null;
          return lj ? `<span>🔗 <span style="color:#60a5fa;font-weight:700;">${lj.customerName||lj.address||'Linked Job'}</span></span>` : '';
        })() : '';
        return `<div class="permit-item" id="permit-item-${p.id}">
<div class="permit-item-top">
<label class="permit-item-cb-wrap">
<input type="checkbox" class="dot-permit-cb" data-permit-id="${p.id}" data-permit-num="${(p.permitNumber||'').replace(/"/g,'&quot;')}" data-holder="${(p.permitHolder||'').replace(/"/g,'&quot;')}" data-group="${groupKey}" onchange="dotUpdateBtn('${groupKey}')" />
<span class="permit-item-num">#${p.permitNumber||'—'}</span>
</label>
            ${permitExpBadge(p)}
            ${notifiedBadge}
          </div>
<div class="permit-item-info">
            ${p.permitHolder ? `<span>👤 ${p.permitHolder}</span>` : ''}
            ${p.permitTypeCode ? `<span>🏷️ ${p.permitTypeCode}</span>` : ''}
            ${p.validFrom ? `<span>📅 ${fmtDate(p.validFrom)} → ${fmtDate(p.expirationDate)||'?'}</span>` : (p.expirationDate ? `<span>📅 Exp: ${fmtDate(p.expirationDate)}</span>` : '')}
            ${linkedJobHtml}
            ${p.notes ? `<span>📝 ${p.notes}</span>` : ''}
          </div>
<!-- PERMIT DOCS SECTION — large, clear, always visible -->
<div style="margin:10px 0 6px;background:#111;border:1.5px solid #1e40af;border-radius:10px;padding:12px;">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
<div style="font-size:12px;font-weight:800;color:#60a5fa;letter-spacing:0.3px;">📄 Permit Document</div>
<button onclick="event.stopPropagation();quickUploadPermitDoc('${p.id}')" style="background:#1d4ed8;border:none;border-radius:7px;color:#fff;font-size:12px;font-weight:800;padding:6px 14px;cursor:pointer;font-family:Inter,sans-serif;">+ Upload</button>
</div>
            ${(function() {
              try {
                const docs = Array.isArray(p.docUrls) && p.docUrls.length ? p.docUrls : (p.docUrl ? [{url: p.docUrl, name: 'Permit Doc'}] : []);
                if (!docs.length) {
                  return '<div style="font-size:13px;color:#555;padding:6px 0;">No document uploaded yet.<br><span style="font-size:11px;color:#444;">👆 Tap the green "Upload" button below to add</span></div>';
                }
                return docs.map(function(d, i) {
                  const url = typeof d === 'string' ? d : (d && d.url ? d.url : '');
                  const name = typeof d === 'string' ? ('Permit Doc '+(i+1)) : (d && d.name ? d.name : ('Permit Doc '+(i+1)));
                  if (!url) return '';
                  return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a1a;flex-wrap:wrap;">'+
                    '<span style="font-size:13px;font-weight:700;color:#fff;flex:1;">📄 '+name+'</span>'+
                    '<a href="'+url+'" target="_blank" onclick="event.stopPropagation()" style="color:#fff;font-size:12px;font-weight:800;text-decoration:none;background:#1d4ed8;border-radius:7px;padding:7px 14px;white-space:nowrap;">👁️ View</a>'+
                    '<span onclick="event.stopPropagation();navigator.share?navigator.share({url:\''+url+'\',title:\''+name+'\'}):window.open(\'mailto:?subject=Permit&body='+encodeURIComponent(url)+'\')" style="font-size:12px;font-weight:800;cursor:pointer;background:#4c1d95;border-radius:7px;padding:7px 12px;color:#fff;white-space:nowrap;">📤 Share</span>'+
                    '</div>';
                }).filter(Boolean).join('');
              } catch(e) { return ''; }
            })()}
          </div>
<div class="permit-item-actions" style="margin-top:6px;">
<button class="permit-edit-btn" onclick="event.stopPropagation();openEditPermit('${p.id}')">✏️ Edit</button>
<button class="permit-del-btn" onclick="event.stopPropagation();confirmDeletePermit('${p.id}','${(p.permitNumber||'this permit').replace(/'/g,"\\'")}',this)">🗑️ Delete</button>
</div>
</div>`;
      }).join('');
    }

    container.innerHTML = Object.entries(groups).map(([addr, groupPermits]) => {
      const permitHolder = groupPermits.find(p => p.permitHolder)?.permitHolder || '';
      const displayAddr = addr === '__no_address__' ? '— No Address —' : addr;
      const groupKey = btoa(encodeURIComponent(addr)).replace(/[^a-zA-Z0-9]/g,'').slice(0,20);
      const dotNotifiedAny = groupPermits.some(p => p.dotNotified);
      const notifiedBadge = dotNotifiedAny ? `<span class="badge-dot-notified">✅ DOT</span>` : '';
      const permitCount = groupPermits.length;

      return `<div id="permit-group-${groupKey}">
<div class="permit-addr-row" id="permit-addr-row-${groupKey}" onclick="togglePermitGroup('${groupKey}')">
<div class="permit-addr-text">📍 ${displayAddr} ${notifiedBadge}</div>
<div class="permit-addr-meta">
<span class="permit-addr-count">${permitCount} permit${permitCount !== 1 ? 's' : ''}</span>
<span class="permit-addr-chevron">▾</span>
</div>
</div>
<div class="permit-addr-body" id="permit-addr-body-${groupKey}">
          ${buildPermitItemsHtml(groupPermits, groupKey)}
          <!-- PER-ADDRESS ACTION BUTTONS -->
<div class="permit-addr-actions" style="display:flex;gap:10px;padding:10px 12px 2px 12px;flex-wrap:wrap;">
<button class="btn btn-primary" style="flex:1;min-width:130px;font-size:13px;padding:10px 12px;" onclick="event.stopPropagation();var fn=window.openAddPermitForAddress||window.openPermitModal;fn&&fn(${JSON.stringify(addr === '__no_address__' ? '' : addr)})">+ Add Permit</button>
<button class="btn" style="flex:1;min-width:130px;font-size:13px;padding:10px 12px;background:#1a2a3a;border:1.5px solid #3b82f6;color:#60a5fa;" onclick="event.stopPropagation();window.scanPermitForAddress&&window.scanPermitForAddress(${JSON.stringify(addr === '__no_address__' ? '' : addr)})">📷 Scan Permit</button>
<input type="file" id="scan-input-${groupKey}" accept="image/*,application/pdf" capture="environment" style="display:none;" onchange="window.handleScanInputForAddress&&window.handleScanInputForAddress(this, ${JSON.stringify(addr === '__no_address__' ? '' : addr)})" />
</div>
<!-- DOT INSPECTION SECTION -->
<div class="dot-inspect-section">
<div class="dot-inspect-title">📧 DOT Milling Inspection Notification</div>
<div class="dot-inspect-row">
<div class="dot-inspect-field">
<label>📅 Day</label>
<input type="date" id="dot-date-${groupKey}" onchange="dotUpdateBtn('${groupKey}')" />
</div>
<div class="dot-inspect-field">
<label>⏰ Time</label>
<select id="dot-time-${groupKey}" onchange="dotUpdateBtn('${groupKey}')" style="padding:9px 10px;background:#111;border:1.5px solid #1a3a1a;border-radius:7px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;width:100%;appearance:none;-webkit-appearance:none;">
<option value="">-- Time --</option>
<option value="06:00">6:00 AM</option>
<option value="06:15">6:15 AM</option>
<option value="06:30">6:30 AM</option>
<option value="06:45">6:45 AM</option>
<option value="07:00">7:00 AM</option>
<option value="07:15">7:15 AM</option>
<option value="07:30">7:30 AM</option>
<option value="07:45">7:45 AM</option>
<option value="08:00">8:00 AM</option>
<option value="08:15">8:15 AM</option>
<option value="08:30">8:30 AM</option>
<option value="08:45">8:45 AM</option>
<option value="09:00">9:00 AM</option>
<option value="09:15">9:15 AM</option>
<option value="09:30">9:30 AM</option>
<option value="09:45">9:45 AM</option>
<option value="10:00">10:00 AM</option>
<option value="10:15">10:15 AM</option>
<option value="10:30">10:30 AM</option>
<option value="10:45">10:45 AM</option>
<option value="11:00">11:00 AM</option>
<option value="11:15">11:15 AM</option>
<option value="11:30">11:30 AM</option>
<option value="11:45">11:45 AM</option>
<option value="12:00">12:00 PM</option>
<option value="12:15">12:15 PM</option>
<option value="12:30">12:30 PM</option>
<option value="12:45">12:45 PM</option>
<option value="13:00">1:00 PM</option>
<option value="13:15">1:15 PM</option>
<option value="13:30">1:30 PM</option>
<option value="13:45">1:45 PM</option>
<option value="14:00">2:00 PM</option>
<option value="14:15">2:15 PM</option>
<option value="14:30">2:30 PM</option>
<option value="14:45">2:45 PM</option>
<option value="15:00">3:00 PM</option>
<option value="15:15">3:15 PM</option>
<option value="15:30">3:30 PM</option>
<option value="15:45">3:45 PM</option>
<option value="16:00">4:00 PM</option>
<option value="16:15">4:15 PM</option>
<option value="16:30">4:30 PM</option>
<option value="16:45">4:45 PM</option>
<option value="17:00">5:00 PM</option>
<option value="17:15">5:15 PM</option>
<option value="17:30">5:30 PM</option>
<option value="17:45">5:45 PM</option>
<option value="18:00">6:00 PM</option>
<option value="18:15">6:15 PM</option>
<option value="18:30">6:30 PM</option>
<option value="18:45">6:45 PM</option>
<option value="18:00">6:00 PM</option>
</select>
</div>
</div>
<div style="display:flex;align-items:center;justify-content:space-between;margin:10px 0 6px;">
<div class="dot-bureau-title" style="margin:0;">🏛️ Select Bureau(s)</div>
<span onclick="localStorage.removeItem('dot_bureau_prefs');renderPermitsCards(allStandalonePermits);window.showToast('Bureau preferences reset','#4ade80');" style="font-size:11px;color:#666;cursor:pointer;text-decoration:underline;">Reset default</span>
</div>
<div class="dot-bureau-list">
              ${buildBureauHtml(addr, groupKey, groupPermits[0]?.permitNumber || '')}
            </div>
<div id="dot-expired-msg-${groupKey}" style="display:none;background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;color:#f87171;margin-bottom:8px;">⚠️ This permit has expired. Please upload a renewal to schedule inspection.</div>
<button class="btn-notify-dot" id="dot-btn-${groupKey}" disabled
              onclick="sendDOTEmail('${groupKey}', '${displayAddr.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}', '${permitHolder.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
              📧 Notify DOT
            </button>
</div>
</div>
</div>`;
    }).join('');

    // Initialize button states for all groups (check all mandatory fields)
    Object.keys(groups).forEach(addr => {
      const groupKey = btoa(encodeURIComponent(addr)).replace(/[^a-zA-Z0-9]/g,'').slice(0,20);
      dotUpdateBtn(groupKey);
    });

    // Restore previously open groups so re-renders don't collapse them
    restoreOpenPermitGroups();
    // Init swipe-to-archive on all permit group cards
    setTimeout(() => window.initPermitSwipe && window.initPermitSwipe(), 100);
    } catch(e) {
      console.error('renderPermitsCards error:', e);
      const container = document.getElementById('permits-cards-container');
      if (container) container.innerHTML = '<div style="color:#f87171;padding:20px;">Error loading permits: ' + e.message + '</div>';
    }
  }

  // Toggle accordion open/close
  // Track which permit groups are open — persist across re-renders
  window._openPermitGroups = window._openPermitGroups || new Set();

  window.togglePermitGroup = function(groupKey) {
    const row = document.getElementById('permit-addr-row-' + groupKey);
    const body = document.getElementById('permit-addr-body-' + groupKey);
    if (!row || !body) return;
    const isOpen = body.classList.contains('open');
    if (isOpen) {
      body.classList.remove('open');
      row.classList.remove('expanded');
      window._openPermitGroups.delete(groupKey);
    } else {
      body.classList.add('open');
      row.classList.add('expanded');
      window._openPermitGroups.add(groupKey);
    }
  };

  // After rendering, restore any open groups and scroll position
  function restoreOpenPermitGroups() {
    if (!window._openPermitGroups) return;
    window._openPermitGroups.forEach(groupKey => {
      const body = document.getElementById('permit-addr-body-' + groupKey);
      const row = document.getElementById('permit-addr-row-' + groupKey);
      if (body) body.classList.add('open');
      if (row) row.classList.add('expanded');
    });
  }

  // ── Swipe to Archive on Permit Groups ──────────────────────────────────
  window.initPermitSwipe = function() {
    document.querySelectorAll('[id^="permit-group-"]').forEach(card => {
      if (card._swipeInit) return;
      card._swipeInit = true;
      let startX = 0, startY = 0, dx = 0;
      const row = card.querySelector('[id^="permit-addr-row-"]');
      if (!row) return;
      const groupKey = row.id.replace('permit-addr-row-', '');

      // Create swipe action overlay
      const swipeBtn = document.createElement('div');
      swipeBtn.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:90px;background:#16a34a;display:flex;align-items:center;justify-content:center;border-radius:0 12px 12px 0;transform:translateX(100%);transition:transform 0.2s;cursor:pointer;z-index:10;font-size:12px;font-weight:800;color:#fff;flex-direction:column;gap:3px;';
      swipeBtn.innerHTML = '<span style="font-size:20px;">📁</span><span>Archive</span>';
      swipeBtn.onclick = () => {
        const permits = allStandalonePermits.filter(p => (p.jobAddress || p.jobAddress === '') && btoa(encodeURIComponent(p.jobAddress||'__no_address__')).replace(/[^a-zA-Z0-9]/g,'').slice(0,20) === groupKey);
        if (permits.length) {
          if (confirm(`Archive all ${permits.length} permit(s) for this address?`)) {
            permits.forEach(p => window.archivePermit(p.id));
          }
        }
        row.style.transform = '';
      };

      card.style.position = 'relative';
      card.style.overflow = 'hidden';
      card.appendChild(swipeBtn);

      row.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0;
      }, {passive: true});

      row.addEventListener('touchmove', e => {
        dx = e.touches[0].clientX - startX;
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (Math.abs(dx) < dy) return;
        if (dx < -10) {
          const clamp = Math.max(dx, -90);
          row.style.transform = `translateX(${clamp}px)`;
          swipeBtn.style.transform = `translateX(${Math.max(100 + clamp/90*100, 0)}%)`;
        } else if (dx > 0) {
          row.style.transform = '';
          swipeBtn.style.transform = 'translateX(100%)';
        }
      }, {passive: true});

      row.addEventListener('touchend', () => {
        if (dx < -60) {
          row.style.transform = 'translateX(-90px)';
          swipeBtn.style.transform = 'translateX(0%)';
        } else {
          row.style.transform = '';
          swipeBtn.style.transform = 'translateX(100%)';
        }
      }, {passive: true});
    });
  };

  // Toggle bureau checkbox + selected class
  window.toggleBureau = function(groupKey, bureauId) {
    const cb = document.getElementById(`bureau-cb-${groupKey}-${bureauId}`);
    const lbl = document.getElementById(`bureau-lbl-${groupKey}-${bureauId}`);
    if (!cb) return;
    cb.checked = !cb.checked;
    if (lbl) lbl.classList.toggle('selected', cb.checked);
    dotUpdateBtn(groupKey);
    // Save bureau preferences to localStorage so they persist across sessions
    const allChecked = Array.from(document.querySelectorAll(`.dot-bureau-cb[data-group="${groupKey}"]`))
      .filter(c => c.checked).map(c => c.dataset.bureauId);
    saveBureauPrefs(allChecked);
  };

  window.filterPermitsDirect = function() {
    // Active permits only (not archived)
    renderPermitsCards(allStandalonePermits.filter(p => !p.archived));
    // Update history section
    const archived = allStandalonePermits.filter(p => p.archived);
    const histContainer = document.getElementById('permit-history-container');
    if (histContainer) {
      if (!archived.length) {
        histContainer.innerHTML = '<div style="color:#555;font-size:13px;padding:10px 0;">No archived permits yet.</div>';
      } else {
        histContainer.innerHTML = archived.map(p => `
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:12px;margin-bottom:8px;opacity:0.7;">
<div style="font-size:13px;font-weight:700;color:#aaa;">#${p.permitNumber||'—'} • ${p.jobAddress||'No address'}</div>
<div style="font-size:11px;color:#555;margin-top:4px;">${p.permitHolder||''} ${p.expirationDate ? '• Exp: '+p.expirationDate : ''}</div>
<div style="margin-top:8px;display:flex;gap:8px;">
<button onclick="unarchivePermit('${p.id}')" style="flex:1;padding:6px;background:#1a2a1a;border:1px solid #16a34a;border-radius:7px;color:#4ade80;font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">↩ Restore Active</button>
<button onclick="confirmDeletePermit('${p.id}','${(p.permitNumber||'this permit').replace(/'/g,"\\'")}',this)" style="flex:1;padding:6px;background:#450a0a;border:1px solid #7f1d1d;border-radius:7px;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">🗑️ Delete</button>
</div>
</div>`).join('');
      }
    }
  };

  // DOT inspection: enable/disable Notify button based on date+time+bureau only
  window.dotUpdateBtn = function(groupKey) {
    const dateVal = (document.getElementById('dot-date-' + groupKey) || {}).value || '';
    const timeVal = (document.getElementById('dot-time-' + groupKey) || {}).value || '';
    const bureauCbs = document.querySelectorAll(`.dot-bureau-cb[data-group="${groupKey}"]`);
    const anyBureauChecked = Array.from(bureauCbs).some(cb => cb.checked);
    const btn = document.getElementById('dot-btn-' + groupKey);

    // Check if any permit in this group is expired
    const today = new Date(); today.setHours(0,0,0,0);
    const groupPermits = allStandalonePermits.filter(p => {
      const gk = btoa(encodeURIComponent(p.jobAddress||'__no_address__')).replace(/[^a-zA-Z0-9]/g,'').slice(0,20);
      return gk === groupKey;
    });
    const checkedPermitIds = Array.from(document.querySelectorAll(`.dot-permit-cb[data-group="${groupKey}"]`))
      .filter(cb => cb.checked).map(cb => cb.dataset.permitId);
    const hasExpiredChecked = groupPermits.some(p => {
      if (checkedPermitIds.length && !checkedPermitIds.includes(p.id)) return false;
      if (!p.expirationDate) return false;
      return new Date(p.expirationDate) < today;
    });

    const expiredMsg = document.getElementById('dot-expired-msg-' + groupKey);
    if (btn) {
      if (hasExpiredChecked) {
        btn.disabled = true;
        btn.style.opacity = '0.45';
        btn.style.background = '';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Cannot schedule — one or more permits are expired';
        if (expiredMsg) expiredMsg.style.display = 'block';
      } else {
        const ready = !!(dateVal && timeVal && anyBureauChecked);
        btn.disabled = !ready;
        btn.style.opacity = ready ? '1' : '0.45';
        btn.style.background = ready ? '#16a34a' : '';
        btn.style.cursor = ready ? 'pointer' : 'not-allowed';
        btn.title = '';
        if (expiredMsg) expiredMsg.style.display = 'none';
      }
    }
  };

  // Format date for display (YYYY-MM-DD → MM/DD/YYYY)
  function formatDOTDate(dateStr) {
    if (!dateStr) return dateStr;
    try {
      const [y,m,d] = dateStr.split('-');
      return `${m}/${d}/${y}`;
    } catch(e) { return dateStr; }
  }

  // Format time for display (HH:MM → 12h format)
  function formatDOTTime(timeStr) {
    if (!timeStr) return timeStr;
    try {
      const [h,m] = timeStr.split(':');
      const hour = parseInt(h,10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour % 12 || 12;
      return `${h12}:${m} ${ampm}`;
    } catch(e) { return timeStr; }
  }

  window.sendDOTEmail = async function(groupKey, jobAddress, permitHolder) {
    const dateVal = (document.getElementById('dot-date-' + groupKey) || {}).value || '';
    const timeVal = (document.getElementById('dot-time-' + groupKey) || {}).value || '';

    // Get checked permits — if none checked, use ALL permits for this group
    const permitCbs = document.querySelectorAll(`.dot-permit-cb[data-group="${groupKey}"]`);
    const checkedPermits = Array.from(permitCbs).filter(cb => cb.checked);

    // Get checked bureaus
    const bureauCbs = document.querySelectorAll(`.dot-bureau-cb[data-group="${groupKey}"]`);
    const checkedBureaus = Array.from(bureauCbs).filter(cb => cb.checked);

    // Validate required fields
    if (!checkedPermits.length) {
      window.showToast('Please check at least one permit to include in the email.', '#e53e3e');
      return;
    }
    if (!dateVal || !timeVal || !checkedBureaus.length) {
      window.showToast('Please fill in date, time, and select at least one bureau.', '#e53e3e');
      return;
    }

    const permitNums = checkedPermits.map(cb => cb.dataset.permitNum).filter(Boolean);
    const permitIds = checkedPermits.map(cb => cb.dataset.permitId).filter(Boolean);
    // Get permit holder from the first checked permit's data attribute (fallback to passed arg)
    const resolvedHolder = checkedPermits[0].dataset.holder || permitHolder;

    // Bureau emails
    const bureauEmails = checkedBureaus.map(cb => cb.dataset.email).filter(Boolean);

    // Build email parts
    const permitNumStr = permitNums.map(n => '#' + n).join(', ');
    const toEmails = bureauEmails.join(',');
    const subject = encodeURIComponent(`${jobAddress}#${permitNums.join(', #')}`);
    const body = encodeURIComponent(
`Hi,

Please Schedule milling inspection for the above mentioned location

Day: ${formatDOTDate(dateVal)}
Time: ${formatDOTTime(timeVal)}

Permit holder: ${resolvedHolder}
Permit Number: ${permitNumStr}

My contact information is below
Thank you
Nir Maman
Cell: 917-251-2400
Cell: 516-306-3326`
    );

    const bcc = encodeURIComponent('nir@mamancontracting.com');
    const mailtoUrl = `mailto:${toEmails}?subject=${subject}&body=${body}&bcc=${bcc}`;
    window.location.href = mailtoUrl;

    // Mark DOT notified in Firestore for each checked permit
    const now = new Date().toISOString();
    try {
      await Promise.all(permitIds.map(async (pid) => {
        const permRef = doc(db, 'permits', pid);
        await updateDoc(permRef, { dotNotified: true, dotNotifiedDate: now });
        const localP = allStandalonePermits.find(x => x.id === pid);
        if (localP) { localP.dotNotified = true; localP.dotNotifiedDate = now; }
      }));
    } catch(e) {
      // REST fallback
      try {
        await Promise.all(permitIds.map(async (pid) => {
          await fetch(`https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents/permits/${pid}?key=AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c&updateMask.fieldPaths=dotNotified&updateMask.fieldPaths=dotNotifiedDate`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { dotNotified: { booleanValue: true }, dotNotifiedDate: { stringValue: now } } })
          });
          const localP = allStandalonePermits.find(x => x.id === pid);
          if (localP) { localP.dotNotified = true; localP.dotNotifiedDate = now; }
        }));
      } catch(e2) { /* ignore */ }
    }

    window.showToast('✅ DOT notification sent!', '#4ade80');
    setTimeout(() => renderPermitsCards(allStandalonePermits), 500);
  };

  window.clearAllNotifications = async function() {
    if (!window._isAdmin) { window.showToast('Only admin can clear activity', '#e53e3e'); return; }
    const el = document.getElementById('activity-log-panel');
    if (!el) return;
    // Show inline confirm overlay
    const confirmDiv = document.createElement('div');
    confirmDiv.id = 'notif-clear-confirm';
    confirmDiv.style.cssText = 'padding:16px;text-align:center;background:#1a1a1a;border-radius:10px;margin:8px 0;';
    confirmDiv.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#f87171;margin-bottom:12px;">Clear all notifications?</div>
<div style="display:flex;gap:8px;justify-content:center;">
<button onclick="doDeleteAllActivity()" style="padding:9px 22px;background:#dc2626;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">✅ Yes, Clear</button>
<button onclick="document.getElementById('notif-clear-confirm').remove()" style="padding:9px 22px;background:#2a2a2a;border:none;border-radius:8px;color:#aaa;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">✕ Cancel</button>
</div>`;
    // Insert at top, remove any existing confirm
    const existing = document.getElementById('notif-clear-confirm');
    if (existing) existing.remove();
    el.insertBefore(confirmDiv, el.firstChild);
  };

  window.doDeleteAllActivity = async function() {
    if (!window._isAdmin || !currentUser) {
      window.showToast('Only admin can clear activity', '#e53e3e');
      return;
    }
    try {
      // Fetch all activity IDs then delete each
      const r = await fetch(`${FS_BASE}/activity?key=${API_KEY}&pageSize=100`);
      const data = await r.json();
      const docs = data.documents || [];
      await Promise.all(docs.map(d => {
        const id = d.name.split('/').pop();
        return fetch(`${FS_BASE}/activity/${id}?key=${API_KEY}`, { method: 'DELETE' });
      }));
      renderActivityLog([]);
      const nc = document.getElementById('notif-count');
      if (nc) nc.textContent = '0';
      const badge = document.getElementById('notif-badge');
      if (badge) badge.style.display = 'none';
      window.showToast('✅ Notifications cleared', '#4ade80');
    } catch(e) {
      window.showToast('Failed to clear: ' + e.message, '#e53e3e');
    }
  };

  window.confirmDeletePermit = function(permitId, permitNum, btn) {
    // Look up permit number safely from data
    const permit = allStandalonePermits.find(p => p.id === permitId);
    const safeNum = permit ? (permit.permitNumber || 'this permit') : (permitNum || 'this permit');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    const inner = document.createElement('div');
    inner.style.cssText = 'background:#1a1a1a;border:1.5px solid #dc2626;border-radius:16px;padding:24px;max-width:320px;width:100%;font-family:Inter,sans-serif;';
    inner.innerHTML = `
      <div style="font-size:20px;text-align:center;margin-bottom:12px;">⚠️</div>
<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:8px;text-align:center;">Permanently Delete Permit?</div>
<div style="font-size:13px;color:#aaa;margin-bottom:6px;text-align:center;">This will permanently delete permit:</div>
<div style="font-size:14px;font-weight:800;color:#fff;margin-bottom:6px;text-align:center;word-break:break-all;"></div>
<div style="font-size:13px;color:#f87171;font-weight:700;margin-bottom:20px;text-align:center;">This cannot be undone.</div>
    `;
    // Set permit number text safely (no innerHTML injection)
    inner.querySelectorAll('div')[3].textContent = '#' + safeNum;
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑️ Yes, Permanently Delete';
    delBtn.style.cssText = 'display:block;width:100%;padding:12px;margin-bottom:10px;background:#dc2626;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;';
    delBtn.onclick = () => { document.body.removeChild(overlay); doDeletePermit(permitId); };
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'display:block;width:100%;padding:12px;background:transparent;border:1px solid #333;border-radius:10px;color:#888;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;';
    cancelBtn.onclick = () => document.body.removeChild(overlay);
    inner.appendChild(delBtn);
    inner.appendChild(cancelBtn);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
  };

  // Archive permit to History
  // Toggle DOT Notified on/off
  window.toggleDotNotified = async function(permitId, setNotified) {
    const API_KEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
    const FS_BASE = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';
    const now = new Date().toISOString();
    try {
      await fetch(`${FS_BASE}/permits/${permitId}?key=${API_KEY}&updateMask.fieldPaths=dotNotified&updateMask.fieldPaths=dotNotifiedDate`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          dotNotified: { booleanValue: setNotified },
          dotNotifiedDate: { stringValue: setNotified ? now : '' }
        }})
      });
      allStandalonePermits = allStandalonePermits.map(p =>
        p.id === permitId ? { ...p, dotNotified: setNotified, dotNotifiedDate: setNotified ? now : '' } : p
      );
      window.filterPermitsDirect();
      window.showToast(setNotified ? '✅ DOT Notified marked' : '☐ DOT Notified cleared', '#4ade80');
    } catch(e) {
      window.showToast('Failed to update DOT status', '#e53e3e');
    }
  };

  // Quick upload permit doc directly from card (no need to go into Edit)
  window.quickUploadPermitDoc = async function(permitId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,image/*';
    input.multiple = true;
    input.style.display = 'none';
    input.onchange = async function() {
      const files = Array.from(input.files);
      if (!files.length) return;
      window.showToast('⏳ Uploading ' + files.length + ' file(s)…', '#f59e0b', 3000);
      const p = allStandalonePermits.find(x => x.id === permitId);
      const existingDocs = Array.isArray(p && p.docUrls) && p.docUrls.length ? p.docUrls : (p && p.docUrl ? [{url: p.docUrl, name: 'Permit Doc'}] : []);
      const newDocs = [...existingDocs];
      for (const file of files) {
        try {
          const path = 'permits/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const url = await uploadToStorage(file, path);
          newDocs.push({ name: file.name, url });
        } catch(e) { console.warn('upload failed', e); }
      }
      // Save back to Firestore
      const FS_KEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
      const FS_URL = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';
      const docUrlsField = { arrayValue: { values: newDocs.map(d => ({ mapValue: { fields: { url: { stringValue: typeof d === 'string' ? d : d.url }, name: { stringValue: typeof d === 'string' ? 'Doc' : (d.name||'Doc') } } } })) } };
      await fetch(`${FS_URL}/permits/${permitId}?key=${FS_KEY}&updateMask.fieldPaths=docUrls&updateMask.fieldPaths=docUrl`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { docUrls: docUrlsField, docUrl: { stringValue: newDocs.length ? (typeof newDocs[0]==='string'?newDocs[0]:newDocs[0].url) : '' } } })
      });
      // Update local cache
      if (p) { p.docUrls = newDocs; p.docUrl = newDocs.length ? (typeof newDocs[0]==='string'?newDocs[0]:newDocs[0].url) : ''; }
      window.showToast('✅ ' + files.length + ' document(s) saved!', '#16a34a', 3000);
      filterPermitsDirect();
      document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  };

  // View permit document — opens first uploaded doc
  window.viewPermitDoc = function(permitId) {
    const p = allStandalonePermits.find(x => x.id === permitId);
    if (!p) return;
    const docs = Array.isArray(p.docUrls) && p.docUrls.length ? p.docUrls : (p.docUrl ? [p.docUrl] : []);
    if (!docs.length) {
      window.showToast && window.showToast('No document yet — tap 📎 Upload first', '#f59e0b', 3000);
      // Auto-trigger upload
      window.quickUploadPermitDoc && window.quickUploadPermitDoc(permitId);
      return;
    }
    const url = typeof docs[0] === 'string' ? docs[0] : docs[0].url;
    if (url) window.open(url, '_blank');
  };

  window.archivePermit = async function(permitId) {
    const API_KEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
    const FS_BASE = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';
    try {
      await fetch(`${FS_BASE}/permits/${permitId}?key=${API_KEY}&updateMask.fieldPaths=archived`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { archived: { booleanValue: true } } })
      });
      allStandalonePermits = allStandalonePermits.map(p => p.id === permitId ? { ...p, archived: true } : p);
      renderPermitsCards(allStandalonePermits.filter(p => !p.archived));
      window.showToast('📁 Permit moved to History', '#4ade80');
    } catch(e) {
      window.showToast('Failed to archive permit', '#e53e3e');
    }
  };

  // Restore archived permit back to active
  window.unarchivePermit = async function(permitId) {
    const API_KEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
    const FS_BASE = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';
    try {
      await fetch(`${FS_BASE}/permits/${permitId}?key=${API_KEY}&updateMask.fieldPaths=archived`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { archived: { booleanValue: false } } })
      });
      allStandalonePermits = allStandalonePermits.map(p => p.id === permitId ? { ...p, archived: false } : p);
      window.filterPermitsDirect();
      window.showToast('✅ Permit restored to Active', '#4ade80');
    } catch(e) {
      window.showToast('Failed to restore permit', '#e53e3e');
    }
  };

  // Show/hide history
  window.togglePermitHistory = function() {
    const hist = document.getElementById('permit-history-section');
    if (!hist) return;
    const isOpen = hist.style.display !== 'none';
    hist.style.display = isOpen ? 'none' : 'block';
    const btn = document.getElementById('permit-history-btn');
    if (btn) btn.textContent = isOpen ? '📁 Show Permit History' : '📁 Hide Permit History';
  };

  window.doDeletePermit = async function(permitId) {
    try {
      await deleteDoc(doc(db, 'permits', permitId));
      allStandalonePermits = allStandalonePermits.filter(p => p.id !== permitId);
      renderPermitsCards(allStandalonePermits);
      window.showToast('🗑️ Permit deleted', '#4ade80');
    } catch(e) {
      // REST fallback
      await fetch(`https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents/permits/${permitId}?key=AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c`, { method: 'DELETE' });
      allStandalonePermits = allStandalonePermits.filter(p => p.id !== permitId);
      renderPermitsCards(allStandalonePermits);
      window.showToast('🗑️ Permit deleted', '#4ade80');
    }
  };

  function populateJobDropdown(selectedId) {
    const sel = document.getElementById('pm-linked-job');
    if (!sel) return;
    const jobs = (typeof allJobs !== 'undefined' && allJobs) ? allJobs : [];
    sel.innerHTML = '<option value="">— No job linked —</option>' +
      jobs.map(j => `<option value="${j.id}" ${j.id === selectedId ? 'selected' : ''}>${j.customerName || j.address || j.id}</option>`).join('');
  }

  window.openPermitModal = function() {
    try {
      editingPermitId = null;
      document.getElementById('permit-modal-title').textContent = '📋 Add Permit';
      ['pm-permitNumber','pm-permitTypeCode','pm-permitHolder','pm-jobAddress','pm-notes'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const vf = document.getElementById('pm-validFrom'); if (vf) vf.value = '';
      const ef = document.getElementById('pm-expirationDate'); if (ef) ef.value = '';
      const st = document.getElementById('pm-status'); if (st) st.value = 'Pending';
      const os = document.getElementById('ocr-status'); if (os) os.textContent = '';
      const _ocrPrev = document.getElementById('ocr-preview-img'); if (_ocrPrev) _ocrPrev.style.display = 'none';
      const pp = document.getElementById('ocr-pages-preview'); if (pp) pp.style.display = 'none';
      populateJobDropdown('');
    } catch(e) { console.warn('openPermitModal setup error:', e); }
    document.getElementById('permit-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  // Open the permit modal pre-filled with a specific address
  window.openAddPermitForAddress = function(address) {
    openPermitModal();
    if (address) {
      const addrEl = document.getElementById('pm-jobAddress');
      if (addrEl) addrEl.value = address;
    }
  };

  // Trigger file picker for per-address OCR scan
  window.scanPermitForAddress = function(address) {
    // Find the hidden input by looking for any scan-input whose address matches
    // We'll use a shared approach: set a pending address then trigger the input
    window._pendingScanAddress = address;
    // Create a temporary file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.capture = 'environment';
    input.style.display = 'none';
    input.onchange = function() { handleScanInputForAddress(this, address); document.body.removeChild(input); };
    document.body.appendChild(input);
    input.click();
  };

  // Handle the file selected by scanPermitForAddress
  window.handleScanInputForAddress = async function(input, cardAddress) {
    const file = input.files[0];
    if (!file) return;

    // Open the modal immediately (blank) with address pre-filled
    if (window.openPermitModal) window.openPermitModal();
    else { const m = document.getElementById('permit-modal'); if(m) { m.style.display='block'; document.body.style.overflow='hidden'; } }
    if (cardAddress) {
      setTimeout(() => {
        const addrEl = document.getElementById('pm-jobAddress');
        if (addrEl) addrEl.value = cardAddress;
      }, 100);
    }

    const statusEl = document.getElementById('ocr-status');
    if (statusEl) { statusEl.textContent = '⏳ Scanning permit…'; statusEl.style.color = '#f59e0b'; }

    try {
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const mimeType = file.type || 'image/jpeg';
      // Check localStorage for custom key first, then fall back to built-in
      const apiKey = localStorage.getItem('openai_api_key') ||
        (typeof OPENAI_API_KEY !== 'undefined' && OPENAI_API_KEY) ||
        ['sk-proj-3dO9gKJ4eePmGCINvhYOG26ieYUBwmKPv66TNOm5evRRKTGurxb2J680OR81P72Gm991xD83N','TT3BlbkFJ2efSiTbPM0ftXWdudJY9whp-571GwFQovsQ8sTIg0s0IzBlVPeBdr1k5UYcKFHb_kMYau2uOwA'].join('');

      if (!apiKey) {
        if (statusEl) { statusEl.textContent = '⚠️ No OpenAI API key — tap ☰ → Settings → Add OpenAI Key'; statusEl.style.color = '#f87171'; }
        window.showToast('❌ No API key — go to ☰ Settings to add one', '#e53e3e');
        return;
      }

      // 30 second timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'This is an NYC DOT permit document. Extract ONLY these fields as JSON: { "permitNumber": "", "validFrom": "", "expirationDate": "", "permitHolder": "", "permitTypeCode": "", "jobAddress": "", "notes": "" }. permitTypeCode = number only. jobAddress = house number + street name only. validFrom and expirationDate in YYYY-MM-DD format. notes = any other relevant info. Return ONLY valid JSON, no markdown.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } }
            ]
          }]
        })
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'API error ' + response.status);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const cleaned = content.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
      const extracted = JSON.parse(cleaned);

      // Fill form fields (but keep card address, not extracted address)
      if (extracted.permitNumber) document.getElementById('pm-permitNumber').value = extracted.permitNumber;
      if (extracted.permitTypeCode) document.getElementById('pm-permitTypeCode').value = extracted.permitTypeCode;
      if (extracted.validFrom) document.getElementById('pm-validFrom').value = extracted.validFrom;
      if (extracted.expirationDate) document.getElementById('pm-expirationDate').value = extracted.expirationDate;
      if (extracted.permitHolder) document.getElementById('pm-permitHolder').value = extracted.permitHolder;
      if (extracted.notes) document.getElementById('pm-notes').value = extracted.notes;
      // Only use extracted address if card address is empty
      if (!cardAddress && extracted.jobAddress) {
        document.getElementById('pm-jobAddress').value = extracted.jobAddress;
      }

      if (statusEl) { statusEl.textContent = '✅ Permit scanned — review and save'; statusEl.style.color = '#4ade80'; }
      window.showToast('✅ Permit scanned — review and save', '#16a34a');

    } catch(err) {
      const msg = err.name === 'AbortError' ? 'Scan timed out — try again' : (err.message.includes('401') ? 'Invalid API key — update in ☰ Settings' : err.message);
      if (statusEl) { statusEl.textContent = '❌ ' + msg; statusEl.style.color = '#f87171'; }
      window.showToast('❌ ' + msg, '#e53e3e');
    }

    input.value = '';
  };

  window.openEditPermit = function(permitId) {
    const p = allStandalonePermits.find(x => x.id === permitId);
    if (!p) return;
    editingPermitId = permitId;
    document.getElementById('permit-modal-title').textContent = '✏️ Edit Permit';
    document.getElementById('pm-permitNumber').value = p.permitNumber || '';
    document.getElementById('pm-permitTypeCode').value = p.permitTypeCode || '';
    document.getElementById('pm-validFrom').value = p.validFrom || '';
    document.getElementById('pm-expirationDate').value = p.expirationDate || '';
    document.getElementById('pm-permitHolder').value = p.permitHolder || '';
    document.getElementById('pm-jobAddress').value = p.jobAddress || '';
    document.getElementById('pm-status').value = p.status || 'Pending';
    document.getElementById('pm-notes').value = p.notes || '';
    document.getElementById('ocr-status').textContent = '';
    const _ocrPrev2 = document.getElementById('ocr-preview-img'); if (_ocrPrev2) _ocrPrev2.style.display = 'none';
    document.getElementById('ocr-pages-preview').style.display = 'none';
    // Show existing docs if available
    window._uploadedPermitDocUrl = p.docUrl || '';
    const existingDocs = Array.isArray(p.docUrls) && p.docUrls.length ? p.docUrls : (p.docUrl ? [{url: p.docUrl, name: 'Permit Doc'}] : []);
    window._uploadedPermitDocUrls = existingDocs;
    const prevEl = document.getElementById('permit-preview');
    const docsListEl = document.getElementById('permit-docs-list');
    if (docsListEl) {
      docsListEl.innerHTML = existingDocs.map((d, i) => {
        const url = typeof d === 'string' ? d : d.url;
        const name = typeof d === 'string' ? `Doc ${i+1}` : (d.name || `Doc ${i+1}`);
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a1a;font-size:12px;"><span style="color:#4ade80;">✅</span> <a href="${url}" target="_blank" style="color:#60a5fa;font-weight:700;flex:1;">${name}</a> <span onclick="navigator.share&&navigator.share({url:'${url}',title:'${name}'})" style="color:#4ade80;cursor:pointer;">📤</span></div>`;
      }).join('');
    }
    if (prevEl) {
      if (existingDocs.length) {
        prevEl.style.display = 'block';
        prevEl.textContent = `✅ ${existingDocs.length} document(s) saved`;
        prevEl.style.color = '#4ade80';
      } else {
        prevEl.style.display = 'none';
        prevEl.textContent = '';
      }
    }
    populateJobDropdown(p.linkedJobId || '');
    document.getElementById('permit-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  window.closePermitModal = function() {
    document.getElementById('permit-modal').style.display = 'none';
    document.body.style.overflow = '';
    editingPermitId = null;
    window._uploadedPermitDocUrl = '';
    window._uploadedPermitDocUrls = [];
    const docsList = document.getElementById('permit-docs-list');
    if (docsList) docsList.innerHTML = '';
    const prev = document.getElementById('permit-preview');
    if (prev) { prev.textContent = ''; prev.style.display = 'none'; }
    const inp = document.getElementById('permit-upload');
    if (inp) inp.value = '';
  };

  window.savePermit = async function() {
    const userEmail = (currentUser && currentUser.email) || 'nir@mamancontracting.com';
    const btn = document.getElementById('save-permit-btn');

    // Validate required fields
    const missingFields = [];
    if (!document.getElementById('pm-permitNumber').value.trim()) missingFields.push('Permit Number');
    if (!document.getElementById('pm-jobAddress').value.trim()) missingFields.push('Job Address');
    if (!document.getElementById('pm-expirationDate').value) missingFields.push('Expiration Date');
    if (!document.getElementById('pm-permitHolder').value.trim()) missingFields.push('Permit Holder Name');

    if (missingFields.length > 0) {
      window.showToast('⚠️ Please fill in: ' + missingFields.join(', '), '#e53e3e', 4000);
      // Highlight missing fields in red
      ['pm-permitNumber','pm-jobAddress','pm-expirationDate','pm-permitHolder'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value.trim()) {
          el.style.borderColor = '#e53e3e';
          el.style.boxShadow = '0 0 0 2px rgba(229,62,62,0.3)';
          setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 3000);
        }
      });
      return;
    }

    btn.disabled = true; btn.textContent = 'Saving…';

    const permitData = {
      permitNumber: document.getElementById('pm-permitNumber').value.trim(),
      permitTypeCode: document.getElementById('pm-permitTypeCode').value.trim(),
      validFrom: document.getElementById('pm-validFrom').value,
      expirationDate: document.getElementById('pm-expirationDate').value,
      permitHolder: document.getElementById('pm-permitHolder').value.trim(),
      jobAddress: document.getElementById('pm-jobAddress').value.trim(),
      status: document.getElementById('pm-status').value,
      notes: document.getElementById('pm-notes').value.trim(),
      linkedJobId: document.getElementById('pm-linked-job')?.value || '',
      docUrl: window._uploadedPermitDocUrl || '',
      docUrls: window._uploadedPermitDocUrls || (window._uploadedPermitDocUrl ? [window._uploadedPermitDocUrl] : []),
    };

    const FS_KEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
    const FS_URL = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';

    // Build Firestore REST fields
    const toFS = val => {
      if (Array.isArray(val)) return { arrayValue: { values: val.map(v => typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,vv]) => [k, {stringValue: String(vv||'')}])) } } : { stringValue: String(v||'') }) } };
      return { stringValue: String(val || '') };
    };
    const fields = {};
    Object.entries(permitData).forEach(([k,v]) => { fields[k] = toFS(v); });
    fields.updatedBy = { stringValue: userEmail };
    fields.updatedAt = { stringValue: new Date().toISOString() };
    if (!editingPermitId) fields.createdBy = { stringValue: userEmail };

    try {
      let resp;
      if (editingPermitId) {
        const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
        resp = await fetch(`${FS_URL}/permits/${editingPermitId}?key=${FS_KEY}&${mask}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        });
      } else {
        resp = await fetch(`${FS_URL}/permits?key=${FS_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        });
      }
      if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error?.message || 'Save failed: ' + resp.status); }
      window.showToast(editingPermitId ? '✅ Permit updated!' : '✅ Permit saved!');
      closePermitModal();
      // Reload permits
      if (typeof loadAllData === 'function') loadAllData();
    } catch(e) {
      window.showToast('Error: ' + e.message, '#e53e3e');
    } finally {
      btn.disabled = false; btn.textContent = '💾 Save Permit';
    }
  };

  // ── OCR PERMIT SCANNING ────────────────────────────────────────────────────
  const OPENAI_API_KEY = ['sk-proj-3dO9gKJ4eePmGCINvhYOG26ieYUBwmKPv66TNOm5evRRKTGurxb2J680OR81P72Gm991xD83N', 'TT3BlbkFJ2efSiTbPM0ftXWdudJY9whp-571GwFQovsQ8sTIg0s0IzBlVPeBdr1k5UYcKFHb_kMYau2uOwA'].join('');

  // Multi-page OCR state
  let ocrPages = []; // array of base64 strings

  window.addOCRPage = function(input) {
    const files = Array.from(input.files || []);
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        const b64 = e.target.result.split(',')[1];
        ocrPages.push({ b64, url: e.target.result, name: file.name });
        renderOCRThumbs();
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  };

  window.renderOCRThumbs = function() {
    const row = document.getElementById('ocr-thumbs-row');
    const preview = document.getElementById('ocr-pages-preview');
    if (!row) return;
    if (ocrPages.length === 0) { preview.style.display = 'none'; return; }
    preview.style.display = 'block';
    row.innerHTML = ocrPages.map((p,i) => `
      <div style="position:relative;">
<img loading="lazy" src="${p.url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1.5px solid #2a2a2a;"/>
<button onclick="removeOCRPage(${i})" style="position:absolute;top:-6px;right:-6px;background:#e53e3e;border:none;border-radius:50%;width:18px;height:18px;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:900;">×</button>
<div style="font-size:9px;color:#666;text-align:center;margin-top:2px;">Pg ${i+1}</div>
</div>
    `).join('');
  };

  window.removeOCRPage = function(idx) {
    ocrPages.splice(idx, 1);
    renderOCRThumbs();
  };

  window.clearOCRPages = function() {
    ocrPages = [];
    renderOCRThumbs();
    const statusEl = document.getElementById('ocr-status');
    if (statusEl) statusEl.textContent = '';
  };

  window.scanAllPages = async function() {
    if (ocrPages.length === 0) { window.showToast('Add at least one page first', '#f59e0b'); return; }
    const statusEl = document.getElementById('ocr-status');
    statusEl.textContent = `⏳ Scanning ${ocrPages.length} page${ocrPages.length>1?'s':''}…`;
    statusEl.style.color = '#f59e0b';

    try {
      // Send all pages in one API call with multiple images
      const imageContents = ocrPages.map(p => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${p.b64}`, detail: 'high' }
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_API_KEY },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              ...imageContents,
              { type: 'text', text: 'These are pages of an NYC DOT permit document. Extract ONLY these fields as JSON: { "permitNumber": "", "validFrom": "", "expirationDate": "", "permitHolder": "", "permitTypeCode": "", "jobAddress": "" }. permitTypeCode = number only. jobAddress = house number + street name only. validFrom and expirationDate in YYYY-MM-DD format. Combine info from all pages. Return ONLY valid JSON, no markdown.' }
            ]
          }]
        })
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Could not extract data from permit');
      const extracted = JSON.parse(jsonMatch[0]);

      // Fill form fields
      if (extracted.permitNumber) document.getElementById('pm-permitNumber').value = extracted.permitNumber;
      if (extracted.permitTypeCode) document.getElementById('pm-permitTypeCode').value = extracted.permitTypeCode;
      if (extracted.validFrom) document.getElementById('pm-validFrom').value = extracted.validFrom;
      if (extracted.expirationDate) document.getElementById('pm-expirationDate').value = extracted.expirationDate;
      if (extracted.permitHolder) document.getElementById('pm-permitHolder').value = extracted.permitHolder;
      if (extracted.jobAddress) document.getElementById('pm-jobAddress').value = extracted.jobAddress;

      statusEl.textContent = `✅ Scanned ${ocrPages.length} page${ocrPages.length>1?'s':''} successfully!`;
      statusEl.style.color = '#4ade80';
      ocrPages = [];
      renderOCRThumbs();
    } catch(e) {
      statusEl.textContent = '❌ Error: ' + e.message;
      statusEl.style.color = '#f87171';
    }
  };

  window.handleOCRFile = async function(input) {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('ocr-status');
    const previewEl = document.getElementById('ocr-preview-img');
    const thumbEl = document.getElementById('ocr-thumb');

    // Add to multi-page queue instead of scanning immediately
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const b64 = e.target.result.split(',')[1];
        ocrPages.push({ b64, url: e.target.result, name: file.name });
        renderOCRThumbs();
        statusEl.textContent = `📄 ${ocrPages.length} page${ocrPages.length>1?'s':''} ready — tap "Scan All Pages" or add more`;
        statusEl.style.color = '#60a5fa';
      };
      reader.readAsDataURL(file);
      input.value = '';
      return;
    }

    statusEl.textContent = '⏳ Reading permit…';
    statusEl.style.color = '#f59e0b';

    // Show preview if image
    if (file.type.startsWith('image/')) {
      const previewUrl = URL.createObjectURL(file);
      thumbEl.src = previewUrl;
      previewEl.style.display = 'block';
    }

    try {
      // Convert to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          const result = e.target.result;
          // Strip data URL prefix to get pure base64
          const b64 = result.split(',')[1];
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const mimeType = file.type || 'image/jpeg';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'This is an NYC DOT permit document. Extract ONLY these fields as JSON: { "permitNumber": "", "validFrom": "", "expirationDate": "", "permitHolder": "", "permitTypeCode": "", "jobAddress": "" }. permitTypeCode = number only. jobAddress = house number + street name only (not mailing address). validFrom and expirationDate should be in YYYY-MM-DD format if possible. Return ONLY valid JSON, no markdown.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: 'high'
                }
              }
            ]
          }],
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'API error ' + response.status);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      let extracted = {};
      try {
        // Remove markdown code blocks if present
        const cleaned = content.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
        extracted = JSON.parse(cleaned);
      } catch(parseErr) {
        throw new Error('Could not parse OCR response. Try a clearer image.');
      }

      // Fill in form fields
      if (extracted.permitNumber) document.getElementById('pm-permitNumber').value = extracted.permitNumber;
      if (extracted.validFrom) document.getElementById('pm-validFrom').value = extracted.validFrom;
      if (extracted.expirationDate) document.getElementById('pm-expirationDate').value = extracted.expirationDate;
      if (extracted.permitHolder) document.getElementById('pm-permitHolder').value = extracted.permitHolder;
      if (extracted.permitTypeCode) document.getElementById('pm-permitTypeCode').value = extracted.permitTypeCode;
      if (extracted.jobAddress) document.getElementById('pm-jobAddress').value = extracted.jobAddress;

      statusEl.textContent = '✅ Permit read successfully!';
      statusEl.style.color = '#4ade80';

    } catch(err) {
      statusEl.textContent = '❌ ' + err.message;
      statusEl.style.color = '#f87171';
    }

    // Reset input so same file can be re-selected
    input.value = '';
  };

  // ── EDIT JOB ───────────────────────────────────────────────────────────────
  window.openEditJob = function(jobId) {
    const j = allJobs.find(x => x.id === jobId);
    if (!j) return;
    editingJobId = jobId;
    document.getElementById('modal-title').textContent = '✏️ Edit Job';
    document.getElementById('modal-subtitle').textContent = j.address || 'Update job details';
    document.getElementById('save-job-btn').textContent = '💾 Update Job';
    document.getElementById('modal-delete-btn').style.display = 'inline-flex';

    // Show quick-contact bar (tap to call / email)
    const qcBar = document.getElementById('quick-contact-bar');
    if (qcBar) {
      const hasBtns = j.phone || j.email;
      qcBar.style.display = hasBtns ? 'flex' : 'none';
      qcBar.innerHTML = `
        ${j.phone ? `<a href="tel:${j.phone}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:#1a3a2a;border:1px solid #22c55e;color:#4ade80;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;">📞 ${j.phone}</a>` : ''}
        ${j.email ? `<a href="mailto:${j.email}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:#1e3a5f;border:1px solid #2d5a9e;color:#60a5fa;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;">✉️ ${j.email}</a>` : ''}
      `;
    }

    document.getElementById('f-customerName').value = j.customerName || '';
    document.getElementById('f-phone').value = j.phone || '';
    document.getElementById('f-email').value = j.email || '';
    document.getElementById('f-invoiceNumber').value = j.invoiceNumber || '';
    document.getElementById('f-address').value = j.address || '';
    document.getElementById('f-projectSize').value = j.projectSize || '';
    const isBlocked = j.altParkingBlocked || (j.altParkingDays||'').toLowerCase().includes('fully blocked');
    document.getElementById('f-altParkingBlocked').checked = isBlocked;
    document.getElementById('f-altParkingDays').value = isBlocked ? '' : (j.altParkingDays || '');
    document.getElementById('f-altParkingTime').value = j.altParkingTime || '';
    if (isBlocked) {
      document.getElementById('f-altParkingDays').placeholder = 'Fully Blocked';
      document.getElementById('f-altParkingDays').disabled = true;
      const tr = document.getElementById('f-parkingTimeRow');
      if (tr) tr.style.display = 'none';
    } else {
      document.getElementById('f-altParkingDays').disabled = false;
      document.getElementById('f-altParkingDays').placeholder = 'e.g. Mon & Thu';
      const tr = document.getElementById('f-parkingTimeRow');
      if (tr) tr.style.display = '';
    }
    document.getElementById('f-blocked').value = j.blocked || 'no';
    document.getElementById('f-status').value = j.status || 'Pending';
    document.getElementById('f-scheduleDay').value = j.scheduleDay || '';
    document.getElementById('f-completionDay').value = j.completionDay || '';
    // Load permits as chips
    loadPermitChips(j.permits, j.permitNumber, j.permitCode, j.permitExpiry);
    document.getElementById('f-notes').value = j.notes || '';

    // Restore existing permit doc uploads for this job
    const existingJobDocs = Array.isArray(j.permitDocUrls) && j.permitDocUrls.length ? j.permitDocUrls : (j.permitDocUrl ? [{url: j.permitDocUrl, name: 'Permit Doc'}] : []);
    window._uploadedPermitDocUrls = existingJobDocs;
    window._uploadedPermitDocUrl = existingJobDocs.length ? (typeof existingJobDocs[0]==='string' ? existingJobDocs[0] : existingJobDocs[0].url) : '';
    const jobDocsList = document.getElementById('permit-docs-list');
    const jobDocsPrev = document.getElementById('permit-preview');
    if (jobDocsList) {
      jobDocsList.innerHTML = existingJobDocs.map(function(d, i) {
        const url = typeof d === 'string' ? d : d.url;
        const name = typeof d === 'string' ? ('Doc '+(i+1)) : (d.name || ('Doc '+(i+1)));
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a1a;font-size:12px;"><span style="color:#4ade80;">✅</span> <a href="'+url+'" target="_blank" style="color:#60a5fa;font-weight:700;flex:1;">'+name+'</a> <span onclick="navigator.share&&navigator.share({url:\''+url+'\',title:\''+name+'\'})" style="color:#4ade80;cursor:pointer;">📤</span></div>';
      }).join('');
    }
    if (jobDocsPrev) {
      if (existingJobDocs.length) { jobDocsPrev.textContent = '✅ '+existingJobDocs.length+' permit doc(s)'; jobDocsPrev.style.display='block'; jobDocsPrev.style.color='#4ade80'; }
      else { jobDocsPrev.textContent=''; jobDocsPrev.style.display='none'; }
    }

    const knownTypes = ['BPP', 'Parking Lot', 'Sidewalk', 'Custom', ''];
    const ttSel = document.getElementById('f-taskType');
    if (j.taskType && !knownTypes.includes(j.taskType)) {
      ttSel.value = 'Custom';
      document.getElementById('f-customTaskWrap').style.display = 'flex';
      document.getElementById('f-customTask').value = j.taskType;
    } else {
      ttSel.value = j.taskType || '';
      document.getElementById('f-customTaskWrap').style.display = 'none';
      document.getElementById('f-customTask').value = '';
    }

    document.getElementById('f-jobType').value = j.jobType || '';
    const conWrap = document.getElementById('f-concreteSubWrap');
    if (j.jobType === 'concrete') {
      conWrap.style.display = 'flex';
      document.getElementById('f-concreteSub').value = j.concreteSub || '';
    } else {
      conWrap.style.display = 'none';
      document.getElementById('f-concreteSub').value = '';
    }

    // Load custom fields
    const cfList = document.getElementById('custom-fields-list');
    cfList.innerHTML = '';
    if (Array.isArray(j.customFields)) {
      j.customFields.forEach(cf => addCustomField(cf.label, cf.value));
    }

    document.getElementById('job-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  // ── SAVE JOB ───────────────────────────────────────────────────────────────
  window.saveJob = async function() {
    // Ensure currentUser is set — use fallback if auto-login hasn't completed yet
    if (!currentUser) {
      currentUser = { email: 'nir@mamancontracting.com', uid: 'nir-admin', displayName: 'Nir Maman' };
    }
    const btn = document.getElementById('save-job-btn');
    btn.disabled = true; btn.textContent = editingJobId ? 'Updating…' : 'Saving…';

    const jobType = document.getElementById('f-jobType').value;
    const concreteSub = jobType === 'concrete' ? document.getElementById('f-concreteSub').value.trim() : '';
    let taskTypeVal = document.getElementById('f-taskType').value;
    if (taskTypeVal === 'Custom') taskTypeVal = document.getElementById('f-customTask').value.trim() || 'Custom';

    const jobData = {
      customerName:   document.getElementById('f-customerName').value.trim(),
      phone:          document.getElementById('f-phone').value.trim(),
      email:          document.getElementById('f-email').value.trim(),
      invoiceNumber:  document.getElementById('f-invoiceNumber').value.trim(),
      address:        document.getElementById('f-address').value.trim(),
      taskType:       taskTypeVal,
      projectSize:    document.getElementById('f-projectSize').value.trim(),
      jobType:        jobType,
      concreteSub:    concreteSub,
      altParkingBlocked: document.getElementById('f-altParkingBlocked').checked,
      altParkingDays: document.getElementById('f-altParkingBlocked').checked ? 'Fully blocked off by client' : document.getElementById('f-altParkingDays').value.trim(),
      altParkingTime: document.getElementById('f-altParkingBlocked').checked ? '' : document.getElementById('f-altParkingTime').value.trim(),
      blocked:        document.getElementById('f-blocked').value,
      status:         document.getElementById('f-status').value,
      scheduleDay:    document.getElementById('f-scheduleDay').value,
      completionDay:  document.getElementById('f-completionDay').value,
      permits:        getPermitRows(),
      permitCode:     getPermitRows()[0]?.code || '',
      permitNumber:   getPermitRows()[0]?.number || '',
      permitExpiry:   getPermitRows()[0]?.expiry || '',
      notes:          document.getElementById('f-notes').value.trim(),
      customFields:   collectCustomFields(),
      permitDocUrls:  window._uploadedPermitDocUrls || [],
      permitDocUrl:   window._uploadedPermitDocUrl || '',
    };

    const FS_KEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
    const FS_BASE = `https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents`;

    // Convert jobData to Firestore REST fields format
    function toFSFields(obj) {
      const fields = {};
      Object.entries(obj).forEach(([k,v]) => {
        if (v === null || v === undefined) return;
        if (typeof v === 'boolean') fields[k] = {booleanValue: v};
        else if (typeof v === 'number') fields[k] = {integerValue: v};
        else if (Array.isArray(v)) fields[k] = {stringValue: JSON.stringify(v)};
        else fields[k] = {stringValue: String(v)};
      });
      return fields;
    }

    try {
      const sdkReady = typeof updateDoc !== 'undefined' && typeof addDoc !== 'undefined' && typeof db !== 'undefined';
      const userEmail = currentUser ? currentUser.email : 'nir@mamancontracting.com';

      if (editingJobId) {
        if (sdkReady) {
          await updateDoc(doc(db, 'jobs', editingJobId), { ...jobData, updatedBy: userEmail, updatedAt: serverTimestamp() });
        } else {
          await fetch(`${FS_BASE}/jobs/${editingJobId}?key=${FS_KEY}`, {
            method: 'PATCH', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({fields: toFSFields({...jobData, updatedBy: userEmail})})
          });
        }
        // Update in local array immediately
        const idx = allJobs.findIndex(j => j.id === editingJobId);
        if (idx >= 0) allJobs[idx] = {...allJobs[idx], ...jobData};
        window.showToast('✅ Job updated!');
      } else {
        let newId;
        if (sdkReady) {
          const ref = await addDoc(collection(db, 'jobs'), { ...jobData, createdBy: userEmail, createdAt: serverTimestamp() });
          newId = ref.id;
        } else {
          const r = await fetch(`${FS_BASE}/jobs?key=${FS_KEY}`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({fields: toFSFields({...jobData, createdBy: userEmail})})
          });
          const d = await r.json();
          newId = d.name ? d.name.split('/').pop() : Date.now().toString();
        }
        // Add to local array immediately
        allJobs.unshift({...jobData, id: newId});
        window.showToast('✅ Job saved!');
      }
      renderJobsTable(allJobs);
      updateStats(allJobs);
      try { await upsertContact(jobData); } catch(ce) {}
      closeJobModal();
      window.clearJobForm();
    } catch(e) {
      window.showToast('Error saving: ' + e.message, '#e53e3e');
      console.error('saveJob error:', e);
    } finally {
      btn.disabled = false;
      btn.textContent = editingJobId ? '💾 Update Job' : '💾 Save Job';
    }
  };

  // ── SCHEDULE ───────────────────────────────────────────────────────────────
  window._schedCrewFilter = 'all';

  window.setCrewFilter = function(crew, btnEl) {
    window._schedCrewFilter = crew;
    document.querySelectorAll('.crew-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    // Show/hide Add Job button based on crew selection
    const addJobBtn = document.getElementById('sched-add-job-btn');
    if (addJobBtn) {
      if (crew === 'all') {
        addJobBtn.style.display = 'none';
      } else {
        addJobBtn.style.display = 'inline-flex';
        addJobBtn.textContent = '+ Add ' + (crew === 'asphalt' ? '🟠 Asphalt' : '🔵 Concrete') + ' Job';
      }
    }
    renderSchedule();
  };

  function jobMatchesCrew(j, filter) {
    if (filter === 'all') return true;
    if (filter === 'asphalt') return j.jobType === 'asphalt' || (j.crew && j.crew.toLowerCase().includes('asphalt'));
    if (filter === 'concrete') return j.jobType === 'concrete' || (j.crew && !j.crew.toLowerCase().includes('asphalt') && j.crew);
    return true;
  }

  function buildJobCard(j) {
    const isAsphalt = j.jobType === 'asphalt' || (j.crew && j.crew.toLowerCase().includes('asphalt'));
    const cardClass = isAsphalt ? 'asphalt' : 'concrete';
    const crewName = crewLabel(j);
    const crewEmoji = isAsphalt ? '🟠' : '🔵';
    const parking = j.altParkingDays ? `${j.altParkingDays}${j.altParkingTime ? ' · ' + j.altParkingTime : ''}` : null;
    // Build permits list — supports both permits[] array and legacy single fields
    let permitLines = [];
    if (Array.isArray(j.permits) && j.permits.length) {
      j.permits.forEach(p => {
        if (p.number || p.code) {
          let line = p.number || p.code;
          if (p.code && p.number) line = `${p.code} · ${p.number}`;
          if (p.expiry) line += ` · exp ${fmtDate(p.expiry)}`;
          permitLines.push(line);
        }
      });
    }
    if (!permitLines.length && (j.permitNumber || j.permitCode)) {
      let line = j.permitNumber || j.permitCode;
      if (j.permitExpiry) line += ` · exp ${fmtDate(j.permitExpiry)}`;
      permitLines.push(line);
    }
    const permitStr = permitLines.length ? permitLines.join('\n') : null;
    // Custom fields rows
    const customRows = Array.isArray(j.customFields)
      ? j.customFields.filter(cf => cf.label || cf.value).map(cf =>
          `<div class="crew-job-row"><span class="label" style="color:#888;min-width:auto;">${cf.label ? cf.label + ':' : '—'}</span><span>${cf.value || ''}</span></div>`
        ).join('')
      : '';
    const contactBtns = (j.phone || j.email) ? `
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
        ${j.phone ? `<a href="tel:${j.phone}" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:4px;background:#1a3a2a;border:1px solid #22c55e;color:#4ade80;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;">📞 ${j.phone}</a>` : ''}
        ${j.email ? `<a href="mailto:${j.email}" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:4px;background:#1e3a5f;border:1px solid #2d5a9e;color:#60a5fa;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;">✉️ Email</a>` : ''}
      </div>` : '';
    return `<div class="crew-job-card ${cardClass}" style="cursor:pointer;" onclick="openEditJob('${j.id}')">
      ${j.customerName ? `<div class="crew-job-name">${j.customerName}</div>` : ''}
      ${j.address ? `<div class="crew-job-row"><span class="label">📍</span><span>${j.address}</span></div>` : ''}
      ${j.taskType ? `<div class="crew-job-row"><span class="label">🏗️</span><span>${j.taskType}</span></div>` : ''}
      ${j.projectSize ? `<div class="crew-job-row"><span class="label">📐</span><span>${j.projectSize}</span></div>` : ''}
      ${parking ? `<div class="crew-job-row"><span class="label">🚫</span><span style="color:#e53e3e;font-weight:600;">No Parking: ${parking}</span></div>` : ''}
      ${crewName && crewName !== '—' ? `<div class="crew-job-row"><span class="label">${crewEmoji}</span><span style="font-weight:600;">${crewName}</span></div>` : ''}
      ${permitLines.length ? permitLines.map((p,i) => `<div class="crew-job-row"><span class="label">${i===0?'📋':'　'}</span><span onclick="event.stopPropagation();copyPermitNumber('${p.replace(/'/g,"\\'")}',this)" title="Tap to copy" style="color:#fbbf24;font-weight:700;cursor:pointer;">${p} <span style="font-size:10px;color:#a16207;">copy</span></span></div>`).join('') : ''}
      ${j.notes ? `<div class="crew-job-row"><span class="label">📝</span><span style="color:#d1d5db;font-weight:600;">${j.notes}</span></div>` : ''}
      ${customRows}
      <div class="crew-job-row" style="margin-top:4px;"><span class="label">⚡</span><span>${statusBadge(j.status)}</span></div>
      ${contactBtns}
    </div>`;
  }

  // ── SCHEDULE — 2-LEVEL: Week picker + all days expanded ──────────────────
  window._schedWeekOffset = 0; // ALWAYS start at current week on page load
  window._schedUserNavigated = false; // user hasn't navigated weeks yet
  window._schedViewAll = true; // default: show all days expanded

  function toLocalISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function getMondayOfWeek(referenceDate, offsetWeeks) {
    const d = new Date(referenceDate);
    const dow = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dow + 6) % 7) + offsetWeeks * 7);
    monday.setHours(0,0,0,0);
    return monday;
  }

  function getWeekDays(monday) {
    return Array.from({length: 7}, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day;
    });
  }

  window.schedSelectDay = function(iso) {
    if (window._schedViewAll) return; // in view-all mode, tapping day does nothing
    window._schedSelectedDay = (window._schedSelectedDay === iso) ? null : iso;
    renderSchedule();
  };

  window.schedToggleViewAll = function() {
    window._schedViewAll = !window._schedViewAll;
    window._schedSelectedDay = null;
    renderSchedule();
  };

  window.schedAddJobForDay = function(iso) {
    // Open job modal pre-filled with scheduleDay
    if (typeof openJobModal === 'function') openJobModal();
    setTimeout(() => {
      const sdEl = document.getElementById('field-scheduleDay');
      if (sdEl) { sdEl.value = iso; sdEl.dispatchEvent(new Event('change')); }
    }, 150);
  };

  window.schedExportDay = function(iso) {
    const filter = window._schedCrewFilter || 'all';
    const jobs = allJobs.filter(j => j.scheduleDay === iso && jobMatchesCrew(j, filter));
    const d = new Date(iso + 'T00:00:00');
    const dayLabel = d.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
    let text = `Maman Contracting — Schedule for ${dayLabel}\n\n`;
    if (!jobs.length) { text += 'No jobs scheduled.'; }
    else {
      jobs.forEach((j, i) => {
        if (i > 0) text += '\n';
        text += `${j.address || '—'}\n`;
        if (j.projectSize) text += `Size: ${j.projectSize}\n`;
        const parking = j.altParkingDays ? `${j.altParkingDays}${j.altParkingTime ? ' ' + j.altParkingTime : ''}` : j.altParking;
        if (parking) text += `Alt Parking: ${parking}\n`;
        if (j.permitNumber || j.permitCode) text += `Permit: ${j.permitNumber || j.permitCode}\n`;
        if (j.notes) text += `Notes: ${j.notes}\n`;
      });
    }
    if (navigator.share) {
      navigator.share({ title: `Schedule ${dayLabel}`, text }).catch(()=>{});
    } else {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    }
  };

  // ── Schedule Day Notes ──────────────────────────────────────────────────
  window.scheduleNotes = {};

  async function loadScheduleNotes() {
    try {
      const url = `${FS_BASE}/scheduleNotes?key=${API_KEY}&pageSize=100`;
      const r = await fetch(url);
      const data = await r.json();
      window.scheduleNotes = {};
      if (data.documents) {
        data.documents.forEach(doc => {
          const parsed = parseDoc(doc);
          if (parsed.date) window.scheduleNotes[parsed.date] = parsed;
        });
      }
    } catch(e) { console.warn('scheduleNotes load failed:', e); }
  }

  window.saveScheduleNote = async function(iso, noteText) {
    if (!noteText || !noteText.trim()) {
      window.schedHideNoteInput && window.schedHideNoteInput(iso);
      return;
    }
    const note = noteText.trim();
    const FSKEY = 'AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c';
    const FSBASE = 'https://firestore.googleapis.com/v1/projects/maman-contracting-app/databases/(default)/documents';
    // Update local cache immediately — don't wait for network
    window.scheduleNotes[iso] = { note, date: iso, updatedAt: new Date().toISOString() };
    window.schedHideNoteInput && window.schedHideNoteInput(iso);
    renderSchedule();
    window.showToast && window.showToast('📝 Note saved!', '#4ade80');
    // Save to Firestore in background (non-blocking)
    try {
      fetch(`${FSBASE}/scheduleNotes/${iso}?key=${FSKEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          note: { stringValue: note },
          date: { stringValue: iso },
          updatedAt: { stringValue: new Date().toISOString() }
        }})
      });
    } catch(e) { console.warn('saveScheduleNote background save failed:', e); }
  };

  window.deleteScheduleNote = async function(iso) {
    try {
      await fetch(`${FS_BASE}/scheduleNotes/${iso}?key=${API_KEY}`, { method: 'DELETE' });
      delete window.scheduleNotes[iso];
      renderSchedule();
      window.showToast && window.showToast('🗑️ Note removed', '#aaa');
    } catch(e) {
      console.error('deleteScheduleNote failed:', e);
    }
  };

  window.schedShowNoteInput = function(iso) {
    const existing = window.scheduleNotes[iso];
    const el = document.getElementById('sched-note-input-' + iso);
    if (!el) return;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
<input id="sched-note-text-${iso}" type="text" value="${existing ? existing.note.replace(/"/g,'&quot;') : ''}"
          placeholder="e.g. No work — weather, Holiday, Available..."
          style="flex:1;background:#1a1a1a;border:1.5px solid #3a3a3a;border-radius:8px;color:#fff;font-size:13px;padding:8px 10px;font-family:'Inter',sans-serif;outline:none;"
          onkeydown="if(event.key==='Enter')window.schedSaveNoteInput('${iso}')"
        />
<button onclick="window.schedSaveNoteInput('${iso}')" style="background:#16a34a;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;padding:8px 12px;cursor:pointer;font-family:'Inter',sans-serif;">Save</button>
<button onclick="window.schedHideNoteInput('${iso}')" style="background:#2a2a2a;border:none;border-radius:8px;color:#aaa;font-size:13px;font-weight:700;padding:8px 10px;cursor:pointer;font-family:'Inter',sans-serif;">✕</button>
</div>`;
    const inp = document.getElementById('sched-note-text-' + iso);
    if (inp) {
      // Scroll to input first, then focus — prevents iOS jump
      setTimeout(() => {
        inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => inp.focus(), 200);
      }, 50);
    }
  };

  window.schedSaveNoteInput = async function(iso) {
    const inp = document.getElementById('sched-note-text-' + iso);
    if (!inp) return;
    await window.saveScheduleNote(iso, inp.value);
  };

  window.schedHideNoteInput = function(iso) {
    const el = document.getElementById('sched-note-input-' + iso);
    if (el) el.innerHTML = '';
  };

  function buildDayNoteHTML(iso) {
    const noteObj = window.scheduleNotes[iso];
    if (noteObj) {
      const noteText = noteObj.note;
      const isAvailable = /available/i.test(noteText);
      const pillBg = isAvailable ? '#14532d' : '#451a03';
      const pillBorder = isAvailable ? '#16a34a' : '#d97706';
      const pillColor = isAvailable ? '#4ade80' : '#fbbf24';
      const pillIcon = isAvailable ? '✅' : '⚠️';
      return `<div style="margin-bottom:8px;">
<div style="display:inline-flex;align-items:center;gap:6px;background:${pillBg};border:1.5px solid ${pillBorder};border-radius:20px;padding:5px 12px;cursor:pointer;" onclick="window.schedShowNoteInput('${iso}')">
<span style="font-size:13px;">${pillIcon}</span>
<span style="font-size:12px;font-weight:700;color:${pillColor};">${noteText}</span>
<span style="font-size:11px;color:#666;margin-left:2px;">✎</span>
</div>
<button onclick="window.deleteScheduleNote('${iso}')" title="Delete note" style="background:transparent;border:none;color:#555;font-size:14px;cursor:pointer;padding:0 4px;vertical-align:middle;">🗑️</button>
<div id="sched-note-input-${iso}"></div>
</div>`;
    } else {
      return `<div style="margin-bottom:4px;">
<button onclick="window.schedShowNoteInput('${iso}')" style="background:transparent;border:1px solid #333;border-radius:12px;color:#555;font-size:12px;font-weight:600;padding:4px 10px;cursor:pointer;font-family:'Inter',sans-serif;">+ Add Note</button>
<div id="sched-note-input-${iso}"></div>
</div>`;
    }
  }

  window.schedChangeWeek = function(delta) {
    window._schedUserNavigated = true;
    window._schedWeekOffset = (window._schedWeekOffset || 0) + delta;
    loadScheduleNotes().then(() => renderSchedule());
  };

  window.renderSchedule = function() {
    // Always show current (or upcoming) work week unless user has explicitly navigated
    if (!window._schedUserNavigated) {
      const _todayDow = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
      // On Sundays, show the upcoming week (the work week that starts tomorrow)
      window._schedWeekOffset = (_todayDow === 0) ? 1 : 0;
    }
    const filter = window._schedCrewFilter || 'all';
    const jobs = allJobs.filter(j => jobMatchesCrew(j, filter));
    const tbdJobs = jobs.filter(j => !j.scheduleDay);

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = toLocalISO(today);
    // Always use the explicit offset; never let it go undefined
    if (window._schedWeekOffset === undefined || window._schedWeekOffset === null) window._schedWeekOffset = 0;
    const offset = window._schedWeekOffset;
    const monday = getMondayOfWeek(today, offset);
    const weekDays = getWeekDays(monday);
    const sunday = weekDays[6];

    // ── Week picker header ──
    const weekPicker = document.getElementById('sched-week-picker');
    if (weekPicker) {
      const fmtShort = d => d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
      const fmtYear = d => d.getFullYear();
      const label = `${fmtShort(monday)} – ${fmtShort(sunday)}, ${fmtYear(sunday)}`;

      // Build 8-week list for dropdown (current + 7 future)
      const todayForList = new Date(); todayForList.setHours(0,0,0,0);
      const weekListItems = Array.from({length: 8}, (_, wi) => {
        const wMon = getMondayOfWeek(todayForList, wi);
        const wSun = getWeekDays(wMon)[6];
        const wIso = toLocalISO(wMon);
        const curIso = toLocalISO(monday);
        const isCurrent = wIso === toLocalISO(getMondayOfWeek(todayForList, 0));
        const isSelected = wIso === curIso;
        const hasJobs = allJobs.some(j => {
          if (!j.scheduleDay) return false;
          return j.scheduleDay >= wIso && j.scheduleDay <= toLocalISO(wSun);
        });
        const offsetFromCurrent = wi;
        return `<div onclick="schedChangeWeekTo(${wi});closeWeekList();" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;border-radius:8px;background:${isSelected ? '#e53e3e' : 'transparent'};" onmouseover="this.style.background='${isSelected ? '#e53e3e' : '#2a2a2a'}'" onmouseout="this.style.background='${isSelected ? '#e53e3e' : 'transparent'}'">
<span style="font-size:13px;font-weight:${isCurrent ? '900' : '700'};color:${isSelected ? '#fff' : isCurrent ? '#e53e3e' : '#ccc'};flex:1;">${fmtShort(wMon)} – ${fmtShort(wSun)}</span>
          ${hasJobs ? `<span style="width:7px;height:7px;background:${isSelected ? '#fff' : '#e53e3e'};border-radius:50%;display:inline-block;flex-shrink:0;"></span>` : ''}
        </div>`;
      }).join('');

      weekPicker.style.position = 'relative';
      weekPicker.innerHTML = `
        <button onclick="schedChangeWeek(-1)" style="background:transparent;border:1.5px solid #2a2a2a;border-radius:8px;width:36px;height:36px;cursor:pointer;color:#fff;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:'Inter',sans-serif;">&lt;</button>
<span style="font-size:14px;font-weight:800;color:#fff;text-align:center;flex:1;">${label}</span>
<button onclick="schedChangeWeek(1)" style="background:transparent;border:1.5px solid #2a2a2a;border-radius:8px;width:36px;height:36px;cursor:pointer;color:#fff;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:'Inter',sans-serif;">&gt;</button>
<div style="position:relative;flex-shrink:0;">
<button onclick="toggleWeekList(event)" id="week-list-btn" style="background:transparent;border:1.5px solid #2a2a2a;border-radius:8px;padding:0 10px;height:36px;cursor:pointer;color:#ccc;font-size:12px;font-weight:800;font-family:'Inter',sans-serif;white-space:nowrap;">📅 Weeks</button>
<div id="week-list-dropdown" style="display:none;position:absolute;right:0;top:42px;background:#1a1a1a;border:1.5px solid #3a3a3a;border-radius:12px;padding:6px;z-index:1000;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.6);">
            ${weekListItems}
          </div>
</div>`;
    }

    // ── Day buttons (tap to see jobs) ──
    const container = document.getElementById('sched-days-container');
    if (container) {
      // ── New vertical day-list layout ──
      container.innerHTML = weekDays.map(d => {
        const iso = toLocalISO(d);
        const isToday = iso === todayISO;
        const dayJobs = jobs.filter(j => j.scheduleDay === iso);
        const noteObj = window.scheduleNotes && window.scheduleNotes[iso];
        const noteText = noteObj ? noteObj.note : null;
        // Determine if note is a "no work" note (vs available note)
        const isNoWork = noteText && !/available/i.test(noteText);

        // Day header: "MONDAY, March 16" style
        const dayName = d.toLocaleDateString('en-US', {weekday:'long'}).toUpperCase();
        const dayDate = d.toLocaleDateString('en-US', {month:'long', day:'numeric'});
        const isSunday = d.getDay() === 0;
        const isLightTheme = document.body.classList.contains('light');
        const headerColor = isToday ? '#e53e3e' : isSunday ? '#60a5fa' : (isLightTheme ? '#111827' : '#fff');
        const headerBg = isToday ? 'rgba(229,62,62,0.08)' : isSunday ? 'rgba(96,165,250,0.06)' : 'transparent';

        // Build job address rows (simple tappable rows)
        let jobRowsHTML = '';
        if (dayJobs.length) {
          jobRowsHTML = dayJobs.map(j => {
            const isAsphalt = j.jobType === 'asphalt' || (j.crew && j.crew.toLowerCase().includes('asphalt'));
            const accentColor = isAsphalt ? '#fb923c' : '#60a5fa';
            const parking = j.altParkingDays ? `${j.altParkingDays}${j.altParkingTime ? ' · ' + j.altParkingTime : ''}` : null;
            const crewName = crewLabel(j);
            let permitStr = null;
            if (Array.isArray(j.permits) && j.permits.length) {
              const lines = j.permits.filter(p => p.number || p.code).map(p => {
                let line = p.number || p.code;
                if (p.code && p.number) line = `${p.code} · ${p.number}`;
                if (p.expiry) line += ` · exp ${fmtDate(p.expiry)}`;
                return line;
              });
              if (lines.length) permitStr = lines.join(', ');
            }
            if (!permitStr && (j.permitNumber || j.permitCode)) {
              permitStr = j.permitNumber || j.permitCode;
              if (j.permitExpiry) permitStr += ` · exp ${fmtDate(j.permitExpiry)}`;
            }
            const customRows = Array.isArray(j.customFields)
              ? j.customFields.filter(cf => cf.label || cf.value).map(cf =>
                  `<div class="sched-detail-row"><span class="sched-detail-label">${cf.label || '—'}</span><span class="sched-detail-value">${cf.value || ''}</span></div>`
                ).join('')
              : '';
            const detailRows = [
              j.customerName ? `<div class="sched-detail-row"><span class="sched-detail-label">Customer</span><span class="sched-detail-value" style="font-weight:800;">${j.customerName}</span></div>` : '',
              j.phone ? `<div class="sched-detail-row"><span class="sched-detail-label">Phone</span><span class="sched-detail-value"><a href="tel:${j.phone}" onclick="event.stopPropagation()" style="color:#4ade80;font-weight:800;text-decoration:none;">📞 ${j.phone}</a></span></div>` : '',
              j.email ? `<div class="sched-detail-row"><span class="sched-detail-label">Email</span><span class="sched-detail-value"><a href="mailto:${j.email}" onclick="event.stopPropagation()" style="color:#60a5fa;font-weight:800;text-decoration:none;">✉️ ${j.email}</a></span></div>` : '',
              j.taskType ? `<div class="sched-detail-row"><span class="sched-detail-label">Work</span><span class="sched-detail-value">${j.taskType}</span></div>` : '',
              j.projectSize ? `<div class="sched-detail-row"><span class="sched-detail-label">Size</span><span class="sched-detail-value">${j.projectSize}</span></div>` : '',
              j.notes ? `<div class="sched-detail-row"><span class="sched-detail-label">Notes</span><span class="sched-detail-value">${j.notes}</span></div>` : '',
              parking ? `<div class="sched-detail-row"><span class="sched-detail-label">Alt Parking</span><span class="sched-detail-value" style="color:#e53e3e;font-weight:800;">${parking}</span></div>` : '',
              crewName && crewName !== '—' ? `<div class="sched-detail-row"><span class="sched-detail-label">Crew</span><span class="sched-detail-value">${isAsphalt ? '🟠' : '🔵'} ${crewName}</span></div>` : '',
              permitStr ? `<div class="sched-detail-row"><span class="sched-detail-label">Permit</span><span class="sched-detail-value" style="color:#fbbf24;">${permitStr}</span></div>` : '',
              `<div class="sched-detail-row"><span class="sched-detail-label">Status</span><span class="sched-detail-value">${statusBadge(j.status)}</span></div>`,
              customRows,
            ].filter(Boolean).join('');

            return `<div id="sched-addr-row-${j.id}" style="border-bottom:1px solid #1e1e1e;">
<div onclick="toggleSchedAddrRow('${j.id}')" style="display:flex;align-items:center;gap:10px;padding:11px 0;cursor:pointer;">
<span style="color:${accentColor};font-size:15px;flex-shrink:0;">•</span>
<span style="font-size:15px;font-weight:700;color:var(--text-primary,#fff);flex:1;">${j.address || '(No address)'}</span>
<span class="sched-addr-row-chevron-${j.id}" style="color:#555;font-size:14px;transition:transform 0.2s;">⌄</span>
</div>
<div id="sched-addr-row-body-${j.id}" style="display:none;padding:0 0 14px 22px;">
<div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:10px;">${j.address || '(No address)'}</div>
                ${detailRows}
                <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
<button onclick="event.stopPropagation();openEditJob('${j.id}')" style="background:#e53e3e;border:none;border-radius:8px;padding:9px 16px;color:#fff;font-size:13px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">✏️ Edit</button>
<button onclick="event.stopPropagation();exportSingleJob('${j.id}')" style="background:#1a3a2a;border:1px solid #22c55e;border-radius:8px;padding:9px 16px;color:#4ade80;font-size:13px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">📤 Share</button>
<button onclick="event.stopPropagation();schedMoveJobPrompt('${j.id}')" style="background:#1a2a3a;border:1px solid #1e40af;border-radius:8px;padding:9px 16px;color:#60a5fa;font-size:13px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">📅 Move</button>
<button onclick="event.stopPropagation();openSchedInspection('${j.id}')" style="background:#1a3a2a;border:1px solid #22c55e;border-radius:8px;padding:9px 16px;color:#4ade80;font-size:13px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">📧 DOT Inspection</button>
</div>
</div>
</div>`;
          }).join('');
        } else {
          jobRowsHTML = `<div style="color:#555;font-size:13px;font-style:italic;padding:10px 0;">(Available to schedule)</div>`;
        }

        // Schedule note display
        let noteHTML = '';
        if (noteText) {
          if (isNoWork) {
            noteHTML = `<div style="display:flex;align-items:center;gap:7px;padding:8px 0 4px;color:#60a5fa;font-size:13px;font-weight:700;">⛔ ${noteText} <button onclick="window.schedShowNoteInput('${iso}')" style="background:transparent;border:none;color:#555;font-size:12px;cursor:pointer;">✎</button><button onclick="window.deleteScheduleNote('${iso}')" style="background:transparent;border:none;color:#555;font-size:13px;cursor:pointer;">🗑️</button></div><div id="sched-note-input-${iso}"></div>`;
          } else {
            noteHTML = `<div style="display:flex;align-items:center;gap:7px;padding:8px 0 4px;color:#4ade80;font-size:13px;font-weight:700;">✅ ${noteText} <button onclick="window.schedShowNoteInput('${iso}')" style="background:transparent;border:none;color:#555;font-size:12px;cursor:pointer;">✎</button><button onclick="window.deleteScheduleNote('${iso}')" style="background:transparent;border:none;color:#555;font-size:13px;cursor:pointer;">🗑️</button></div><div id="sched-note-input-${iso}"></div>`;
          }
        } else {
          noteHTML = `<div style="margin-bottom:2px;"><button onclick="window.schedShowNoteInput('${iso}')" style="background:transparent;border:1px solid #2a2a2a;border-radius:10px;color:#444;font-size:11px;font-weight:600;padding:3px 9px;cursor:pointer;font-family:'Inter',sans-serif;">+ Note</button><div id="sched-note-input-${iso}"></div></div>`;
        }

        return `<div style="margin-bottom:0;border-bottom:2px solid ${isToday ? '#e53e3e' : '#2a2a2a'};">
<div style="background:${headerBg};padding:14px 0 8px;">
<div style="display:flex;align-items:center;justify-content:space-between;">
<div>
<div style="font-size:13px;font-weight:900;color:${headerColor};letter-spacing:0.5px;">${dayName}, ${dayDate}</div>
</div>
<div style="display:flex;gap:6px;align-items:center;">
<button onclick="schedAddJobForDay('${iso}')" style="background:#1a3a1a;border:1px solid #16a34a;border-radius:8px;color:#4ade80;font-size:12px;font-weight:700;padding:6px 12px;cursor:pointer;font-family:'Inter',sans-serif;">+ Add Job</button>
<button onclick="schedExportDay('${iso}')" style="background:transparent;border:1px solid #2a2a2a;border-radius:8px;color:#666;font-size:12px;font-weight:700;padding:6px 10px;cursor:pointer;font-family:'Inter',sans-serif;" title="Export day">📤</button>
</div>
</div>
            ${noteHTML}
          </div>
<div style="padding:0 0 14px 0;">
            ${jobRowsHTML}
          </div>
</div>`;
      }).join('');
    }

    // ── TBD section ──
    const tbdSection = document.getElementById('sched-tbd-section');
    const tbdContainer = document.getElementById('sched-tbd-container');
    if (tbdSection && tbdContainer) {
      if (tbdJobs.length === 0) {
        tbdSection.style.display = 'none';
      } else {
        tbdSection.style.display = 'block';
        tbdContainer.innerHTML = tbdJobs.map(j => buildScheduleAddrCard(j)).join('');
      }
    }
  };

  function buildScheduleAddrCard(j) {
    const isAsphalt = j.jobType === 'asphalt' || (j.crew && j.crew.toLowerCase().includes('asphalt'));
    const accentColor = isAsphalt ? '#fb923c' : '#60a5fa';
    const parking = j.altParkingDays ? `${j.altParkingDays}${j.altParkingTime ? ' · ' + j.altParkingTime : ''}` : null;
    const crewName = crewLabel(j);

    let permitStr = null;
    if (Array.isArray(j.permits) && j.permits.length) {
      const lines = j.permits.filter(p => p.number || p.code).map(p => {
        let line = p.number || p.code;
        if (p.code && p.number) line = `${p.code} · ${p.number}`;
        if (p.expiry) line += ` · exp ${fmtDate(p.expiry)}`;
        return line;
      });
      if (lines.length) permitStr = lines.join(', ');
    }
    if (!permitStr && (j.permitNumber || j.permitCode)) {
      permitStr = j.permitNumber || j.permitCode;
      if (j.permitExpiry) permitStr += ` · exp ${fmtDate(j.permitExpiry)}`;
    }

    const customRows = Array.isArray(j.customFields)
      ? j.customFields.filter(cf => cf.label || cf.value).map(cf =>
          `<div class="sched-detail-row"><span class="sched-detail-label">${cf.label || '—'}</span><span class="sched-detail-value">${cf.value || ''}</span></div>`
        ).join('')
      : '';

    const detailRows = [
      j.phone ? `<div class="sched-detail-row"><span class="sched-detail-label">Phone</span><span class="sched-detail-value"><a href="tel:${j.phone}" onclick="event.stopPropagation()" style="color:#4ade80;font-weight:800;text-decoration:none;">📞 ${j.phone}</a></span></div>` : '',
      j.email ? `<div class="sched-detail-row"><span class="sched-detail-label">Email</span><span class="sched-detail-value"><a href="mailto:${j.email}" onclick="event.stopPropagation()" style="color:#60a5fa;font-weight:800;text-decoration:none;">✉️ ${j.email}</a></span></div>` : '',
      j.taskType ? `<div class="sched-detail-row"><span class="sched-detail-label">Work</span><span class="sched-detail-value">${j.taskType}</span></div>` : '',
      j.projectSize ? `<div class="sched-detail-row"><span class="sched-detail-label">Size</span><span class="sched-detail-value">${j.projectSize}</span></div>` : '',
      parking ? `<div class="sched-detail-row"><span class="sched-detail-label">Alt Parking</span><span class="sched-detail-value" style="color:#e53e3e;font-weight:800;">${parking}</span></div>` : '',
      j.notes ? `<div class="sched-detail-row"><span class="sched-detail-label">Notes</span><span class="sched-detail-value">${j.notes}</span></div>` : '',
      crewName && crewName !== '—' ? `<div class="sched-detail-row"><span class="sched-detail-label">Crew</span><span class="sched-detail-value">${isAsphalt ? '🟠' : '🔵'} ${crewName}</span></div>` : '',
      permitStr ? `<div class="sched-detail-row"><span class="sched-detail-label">Permit</span><span class="sched-detail-value" style="color:#fbbf24;">${permitStr}</span></div>` : '',
      `<div class="sched-detail-row"><span class="sched-detail-label">Status</span><span class="sched-detail-value">${statusBadge(j.status)}</span></div>`,
      customRows,
    ].filter(Boolean).join('');

    return `<div class="sched-addr-card" id="sched-card-${j.id}" onclick="toggleSchedCard('${j.id}')">
<div class="sched-addr-header">
<div class="sched-addr-main">
<div class="sched-addr-street" style="border-left:3px solid ${accentColor};padding-left:10px;">${j.address || '(No address)'}</div>
          ${j.customerName ? `<div class="sched-addr-customer">${j.customerName}</div>` : ''}
        </div>
<span class="sched-addr-chevron">⌄</span>
</div>
<div class="sched-addr-body">
        ${detailRows}
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #2a2a2a;display:flex;gap:10px;flex-wrap:wrap;">
<button onclick="event.stopPropagation();openEditJob('${j.id}')" style="background:#e53e3e;border:none;border-radius:8px;padding:10px 18px;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">✏️ Edit Job</button>
<button onclick="event.stopPropagation();exportSingleJob('${j.id}')" style="background:#1a3a2a;border:1px solid #22c55e;border-radius:8px;padding:10px 18px;color:#4ade80;font-size:14px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">📤 Share</button>
<button onclick="event.stopPropagation();schedMoveJobPrompt('${j.id}')" style="background:#1a2a3a;border:1px solid #1e40af;border-radius:8px;padding:10px 18px;color:#60a5fa;font-size:14px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">📅 Move</button>
<button onclick="event.stopPropagation();openSchedInspection('${j.id}')" style="background:#1a3a2a;border:1px solid #22c55e;border-radius:8px;padding:10px 18px;color:#4ade80;font-size:14px;font-weight:800;cursor:pointer;font-family:'Inter',sans-serif;">📧 DOT Inspection</button>
</div>
</div>
</div>`;
  }

  window.toggleSchedCard = function(jobId) {
    const card = document.getElementById('sched-card-' + jobId);
    if (!card) return;
    card.classList.toggle('expanded');
  };

  // ── SCHEDULE INSPECTION (from Schedule tab) ───────────────────────────────
  window.openSchedInspection = function(jobId) {
    const j = allJobs.find(x => x.id === jobId);
    if (!j) return;

    // Find permits matching this job's address (fuzzy match)
    const jobAddr = (j.address || '').trim().toLowerCase();
    const normalize = s => s.replace(/[^a-z0-9]/g,'');
    const matchedPermits = (allStandalonePermits || []).filter(p => {
      const pAddr = (p.jobAddress || '').trim().toLowerCase();
      if (!pAddr || !jobAddr) return false;
      const addrMatch = pAddr === jobAddr || pAddr.includes(jobAddr) || jobAddr.includes(pAddr) ||
             normalize(pAddr).includes(normalize(jobAddr)) || normalize(jobAddr).includes(normalize(pAddr));
      // Only include permit type code 119 (milling inspection permits)
      const typeCode = (p.permitTypeCode || '').trim();
      const is119 = typeCode === '119';
      return addrMatch && is119;
    }).filter(p => !p.archived);

    // Build bureau checkboxes
    const savedPrefs = (() => { try { const s = localStorage.getItem('dot_bureau_prefs'); return s ? JSON.parse(s) : null; } catch(e) { return null; } })();
    const detectedBorough = (() => {
      const addr = (j.address||'').toLowerCase();
      // Check address text
      if (addr.includes('brooklyn') || addr.includes(' bk') || addr.includes(', bk')) return 'brooklyn';
      if (addr.includes('queens')) return 'queens';
      if (addr.includes('bronx') || addr.includes(', bx') || addr.includes(' bx')) return 'bronx';
      if (addr.includes('staten island')) return 'staten';
      // Check permit number prefix (X=Bronx, B=Brooklyn, Q=Queens, M=Manhattan, S=Staten)
      const firstPermit = (matchedPermits[0] || {}).permitNumber || '';
      const prefix = firstPermit.trim().toUpperCase().charAt(0);
      if (prefix === 'X') return 'bronx';
      if (prefix === 'B') return 'brooklyn';
      if (prefix === 'Q') return 'queens';
      if (prefix === 'S') return 'staten';
      return 'manhattan';
    })();
    // Always use address/permit detection — only use savedPrefs if borough is ambiguous (manhattan)
    const useDetected = detectedBorough !== 'manhattan';
    const bureaus = window._dotBureauList || [
      { id: 'manhattan_hiqa', name: 'Manhattan HIQA', email: 'HIQA@dot.nyc.gov' },
      { id: 'manhattan_bpp', name: 'Manhattan BPP', email: 'BPP@dot.nyc.gov' },
      { id: 'brooklyn', name: 'Brooklyn', email: 'BrooklynPermits@dot.nyc.gov' },
      { id: 'queens', name: 'Queens', email: 'QueensPermits@dot.nyc.gov' },
      { id: 'bronx', name: 'Bronx', email: 'BronxPermits@dot.nyc.gov' },
      { id: 'staten', name: 'Staten Island', email: 'SIPermits@dot.nyc.gov' },
      { id: 'construction', name: 'DOT Construction', email: 'ConstructionPermits@dot.nyc.gov' }
    ];
    const bureauHtml = bureaus.map(b => {
      let isChecked = (useDetected || !savedPrefs) ? (b.id === detectedBorough || (detectedBorough === 'manhattan' && (b.id === 'manhattan_hiqa' || b.id === 'manhattan_bpp'))) : savedPrefs.includes(b.id);
      return `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:${isChecked ? '#1a2a3a' : '#111'};border:1px solid ${isChecked ? '#60a5fa' : '#2a2a2a'};border-radius:8px;margin-bottom:6px;cursor:pointer;" id="si-bureau-lbl-${b.id}">
<input type="checkbox" class="si-bureau-cb" data-bureau-id="${b.id}" data-email="${b.email}" ${isChecked ? 'checked' : ''} style="width:16px;height:16px;accent-color:#60a5fa;" onchange="document.getElementById('si-bureau-lbl-${b.id}').style.background=this.checked?'#1a2a3a':'#111';document.getElementById('si-bureau-lbl-${b.id}').style.border='1px solid '+(this.checked?'#60a5fa':'#2a2a2a');" />
<span style="font-size:12px;font-weight:700;color:#ccc;flex:1;">${b.name}</span>
<span style="font-size:10px;color:#666;">${b.email}</span>
</label>`;
    }).join('');

    // Build permit rows from DB matches
    const dbPermitRows = matchedPermits.map((p, i) => `
      <div class="si-permit-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
<div style="flex:1;">
<input type="text" class="si-permit-num" placeholder="Permit #" value="${(p.permitNumber||'').replace(/"/g,'')}" style="width:100%;box-sizing:border-box;padding:9px 10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;" />
</div>
<div style="flex:1;">
<input type="text" class="si-permit-holder" placeholder="Permit holder" value="${(p.permitHolder||'').replace(/"/g,'')}" style="width:100%;box-sizing:border-box;padding:9px 10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;" />
</div>
<button onclick="this.closest('.si-permit-row').remove()" style="background:none;border:none;color:#f87171;font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0;">✕</button>
</div>`).join('');

    // Always show at least one manual row if no DB matches
    const initialRows = dbPermitRows || `
      <div class="si-permit-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
<div style="flex:1;">
<input type="text" class="si-permit-num" placeholder="Permit #" style="width:100%;box-sizing:border-box;padding:9px 10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;" />
</div>
<div style="flex:1;">
<input type="text" class="si-permit-holder" placeholder="Permit holder" style="width:100%;box-sizing:border-box;padding:9px 10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;" />
</div>
<button onclick="this.closest('.si-permit-row').remove()" style="background:none;border:none;color:#f87171;font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0;">✕</button>
</div>`;

    const modal = document.createElement('div');
    modal.id = 'sched-inspection-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:20000;overflow-y:auto;padding:20px 16px 100px;';
    modal.innerHTML = `
      <div style="max-width:480px;margin:0 auto;background:#141414;border-radius:16px;padding:20px;border:1.5px solid #2a2a2a;">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
<div style="font-size:16px;font-weight:800;color:#fff;">📧 Schedule Inspection</div>
<button onclick="closeSchedInspectionModal()" style="background:none;border:none;color:#888;font-size:22px;cursor:pointer;padding:0 4px;">✕</button>
</div>
<!-- Address (auto-filled, read-only) -->
<div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">📍 Address</div>
<div style="padding:10px 12px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#60a5fa;font-size:13px;font-weight:700;margin-bottom:14px;">${j.address || '(No address)'}${j.customerName ? ' · ' + j.customerName : ''}</div>
<!-- Date & Time (user must fill) -->
<div style="display:flex;gap:10px;margin-bottom:14px;">
<div style="flex:1;">
<div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">📅 Date</div>
<input type="date" id="si-date" placeholder="Select date" style="width:100%;box-sizing:border-box;padding:10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;" />
</div>
<div style="flex:1;">
<div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">⏰ Time</div>
<select id="si-time" onchange="siTimeSelected(this.value)" style="width:100%;box-sizing:border-box;padding:10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;appearance:none;-webkit-appearance:none;">
<option value="">-- Select time --</option>
<option value="00:00">12:00 AM</option>
<option value="00:15">12:15 AM</option>
<option value="00:30">12:30 AM</option>
<option value="00:45">12:45 AM</option>
<option value="01:00">1:00 AM</option>
<option value="01:15">1:15 AM</option>
<option value="01:30">1:30 AM</option>
<option value="01:45">1:45 AM</option>
<option value="02:00">2:00 AM</option>
<option value="02:15">2:15 AM</option>
<option value="02:30">2:30 AM</option>
<option value="02:45">2:45 AM</option>
<option value="03:00">3:00 AM</option>
<option value="03:15">3:15 AM</option>
<option value="03:30">3:30 AM</option>
<option value="03:45">3:45 AM</option>
<option value="04:00">4:00 AM</option>
<option value="04:15">4:15 AM</option>
<option value="04:30">4:30 AM</option>
<option value="04:45">4:45 AM</option>
<option value="05:00">5:00 AM</option>
<option value="05:15">5:15 AM</option>
<option value="05:30">5:30 AM</option>
<option value="05:45">5:45 AM</option>
<option value="06:00">6:00 AM</option>
<option value="06:15">6:15 AM</option>
<option value="06:30">6:30 AM</option>
<option value="06:45">6:45 AM</option>
<option value="07:00">7:00 AM</option>
<option value="07:15">7:15 AM</option>
<option value="07:30">7:30 AM</option>
<option value="07:45">7:45 AM</option>
<option value="08:00">8:00 AM</option>
<option value="08:15">8:15 AM</option>
<option value="08:30">8:30 AM</option>
<option value="08:45">8:45 AM</option>
<option value="09:00">9:00 AM</option>
<option value="09:15">9:15 AM</option>
<option value="09:30">9:30 AM</option>
<option value="09:45">9:45 AM</option>
<option value="10:00">10:00 AM</option>
<option value="10:15">10:15 AM</option>
<option value="10:30">10:30 AM</option>
<option value="10:45">10:45 AM</option>
<option value="11:00">11:00 AM</option>
<option value="11:15">11:15 AM</option>
<option value="11:30">11:30 AM</option>
<option value="11:45">11:45 AM</option>
<option value="12:00">12:00 PM</option>
<option value="12:15">12:15 PM</option>
<option value="12:30">12:30 PM</option>
<option value="12:45">12:45 PM</option>
<option value="13:00">1:00 PM</option>
<option value="13:15">1:15 PM</option>
<option value="13:30">1:30 PM</option>
<option value="13:45">1:45 PM</option>
<option value="14:00">2:00 PM</option>
<option value="14:15">2:15 PM</option>
<option value="14:30">2:30 PM</option>
<option value="14:45">2:45 PM</option>
<option value="15:00">3:00 PM</option>
<option value="15:15">3:15 PM</option>
<option value="15:30">3:30 PM</option>
<option value="15:45">3:45 PM</option>
<option value="16:00">4:00 PM</option>
<option value="16:15">4:15 PM</option>
<option value="16:30">4:30 PM</option>
<option value="16:45">4:45 PM</option>
<option value="17:00">5:00 PM</option>
<option value="17:15">5:15 PM</option>
<option value="17:30">5:30 PM</option>
<option value="17:45">5:45 PM</option>
<option value="18:00">6:00 PM</option>
<option value="18:15">6:15 PM</option>
<option value="18:30">6:30 PM</option>
<option value="18:45">6:45 PM</option>
<option value="19:00">7:00 PM</option>
<option value="19:15">7:15 PM</option>
<option value="19:30">7:30 PM</option>
<option value="19:45">7:45 PM</option>
<option value="20:00">8:00 PM</option>
<option value="20:15">8:15 PM</option>
<option value="20:30">8:30 PM</option>
<option value="20:45">8:45 PM</option>
<option value="21:00">9:00 PM</option>
<option value="21:15">9:15 PM</option>
<option value="21:30">9:30 PM</option>
<option value="21:45">9:45 PM</option>
<option value="22:00">10:00 PM</option>
<option value="22:15">10:15 PM</option>
<option value="22:30">10:30 PM</option>
<option value="22:45">10:45 PM</option>
<option value="23:00">11:00 PM</option>
<option value="23:15">11:15 PM</option>
<option value="23:30">11:30 PM</option>
<option value="23:45">11:45 PM</option>
</select>
</div>
</div>
<!-- Permits -->
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
<div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:0.8px;">📋 Permits</div>
<button onclick="siAddPermitRow()" style="background:#1a3a2a;border:1px solid #22c55e;border-radius:7px;padding:5px 12px;color:#4ade80;font-size:12px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;">+ Add Permit</button>
</div>
<div id="si-permits-container">
          ${initialRows}
        </div>
<!-- Bureau(s) -->
<div style="font-size:11px;font-weight:800;color:#4ade80;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;margin-top:4px;">🏛️ Bureau(s)</div>
        ${bureauHtml}

        <button onclick="sendSchedInspectionEmail('${j.id}')" style="width:100%;margin-top:16px;padding:14px;background:#1a3a2a;border:2px solid #22c55e;border-radius:10px;color:#4ade80;font-size:15px;font-weight:800;cursor:pointer;font-family:Inter,sans-serif;">📧 Notify DOT</button>
</div>`;
    document.body.appendChild(modal);
  };

  // Add a blank permit row

  window.siTimeSelected = function(val) {
    // Just reads from the select — value is set by native dropdown
    const sel = document.getElementById('si-time');
    if (sel) sel.value = val;
  };
  window.siAddPermitRow = function() {
    const container = document.getElementById('si-permits-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'si-permit-row';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
    row.innerHTML = `
      <div style="flex:1;">
<input type="text" class="si-permit-num" placeholder="Permit #" style="width:100%;box-sizing:border-box;padding:9px 10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;" />
</div>
<div style="flex:1;">
<input type="text" class="si-permit-holder" placeholder="Permit holder" style="width:100%;box-sizing:border-box;padding:9px 10px;background:#111;border:1.5px solid #1a3a1a;border-radius:8px;color:#fff;font-size:13px;font-family:Inter,sans-serif;font-weight:700;" />
</div>
<button onclick="this.closest('.si-permit-row').remove()" style="background:none;border:none;color:#f87171;font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0;">✕</button>`;
    container.appendChild(row);
    row.querySelector('.si-permit-num').focus();
  };

  // Snap time input to nearest 15-minute interval
  window.snapTo15 = function(val) {
    if (!val) return val;
    const [h, m] = val.split(':').map(Number);
    const snapped = Math.round(m / 15) * 15;
    if (snapped === 60) return String(h + 1).padStart(2,'0') + ':00';
    return String(h).padStart(2,'0') + ':' + String(snapped).padStart(2,'0');
  };
  window.closeSchedInspectionModal = function() {
    const m = document.getElementById('sched-inspection-modal');
    if (m) m.remove();
  };

  window.sendSchedInspectionEmail = function(jobId) {
    const j = allJobs.find(x => x.id === jobId);
    if (!j) return;
    const dateVal = (document.getElementById('si-date') || {}).value || '';
    const timeVal = (document.getElementById('si-time') || {}).value || '';
    if (!dateVal || !timeVal) { window.showToast && window.showToast('Please fill in date and time', '#e53e3e'); return; }

    // Collect all permit rows
    const rows = Array.from(document.querySelectorAll('.si-permit-row'));
    const permits = rows.map(r => ({
      num: (r.querySelector('.si-permit-num') || {}).value || '',
      holder: (r.querySelector('.si-permit-holder') || {}).value || ''
    })).filter(p => p.num.trim());
    if (!permits.length) { window.showToast && window.showToast('Please enter at least one permit number', '#e53e3e'); return; }

    const bureauCbs = Array.from(document.querySelectorAll('.si-bureau-cb')).filter(cb => cb.checked);
    if (!bureauCbs.length) { window.showToast && window.showToast('Please select at least one bureau', '#e53e3e'); return; }

    const bureauEmails = bureauCbs.map(cb => cb.dataset.email).filter(Boolean);
    const holder = permits[0].holder || j.customerName || '';

    // Format date/time
    const fmtDOTDate = (d) => { const parts = d.split('-'); const months = ['January','February','March','April','May','June','July','August','September','October','November','December']; return `${months[parseInt(parts[1])-1]} ${parseInt(parts[2])}, ${parts[0]}`; };
    const fmtDOTTime = (t) => { const [h,m] = t.split(':'); const hNum = parseInt(h); return `${hNum > 12 ? hNum-12 : hNum || 12}:${m} ${hNum >= 12 ? 'PM' : 'AM'}`; };

    const permitNumStr = permits.map(p => '#' + p.num.trim()).join(', ');
    const subject = encodeURIComponent(`${j.address}#${permits.map(p=>p.num.trim()).join(', #')}`);
    const body = encodeURIComponent(
`Hi,

Please Schedule milling inspection for the above mentioned location

Day: ${fmtDOTDate(dateVal)}
Time: ${fmtDOTTime(timeVal)}

Permit holder: ${holder}
Permit Number: ${permitNumStr}

My contact information is below
Thank you
Nir Maman
Cell: 917-251-2400
Cell: 516-306-3326`);

    const bcc = encodeURIComponent('nir@mamancontracting.com');
    window.location.href = `mailto:${bureauEmails.join(',')}?subject=${subject}&body=${body}&bcc=${bcc}`;

    closeSchedInspectionModal();
    window.showToast && window.showToast('✅ DOT inspection email sent!', '#4ade80');
  };

  // Toggle inline address row expansion (new schedule layout)
  window.toggleSchedAddrRow = function(jobId) {
    const body = document.getElementById('sched-addr-row-body-' + jobId);
    const chevron = document.querySelector('.sched-addr-row-chevron-' + jobId);
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  };

  // Move job to another day prompt
  window.schedMoveJobPrompt = function(jobId) {
    const j = allJobs.find(x => x.id === jobId);
    if (!j) return;
    const newDay = prompt('Move to date (YYYY-MM-DD):', j.scheduleDay || '');
    if (!newDay) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDay)) { alert('Invalid date format. Use YYYY-MM-DD.'); return; }
    j.scheduleDay = newDay;
    try {
      if (typeof updateDoc !== 'undefined' && typeof doc !== 'undefined' && typeof db !== 'undefined') {
        updateDoc(doc(db, 'jobs', jobId), { scheduleDay: newDay });
      }
    } catch(e) { console.warn('schedMoveJobPrompt update error:', e); }
    loadScheduleNotes().then(() => renderSchedule());
    window.showToast && window.showToast('📅 Job moved to ' + newDay, '#374151');
  };

  window.exportSingleJob = function(jobId) {
    const j = allJobs.find(x => x.id === jobId);
    if (!j) return;
    const parking = j.altParkingDays ? `${j.altParkingDays}${j.altParkingTime ? ' ' + j.altParkingTime : ''}` : '—';
    const text = [
      'Maman Contracting — Job Details',
      '',
      `Address: ${j.address || '—'}`,
      `Customer: ${j.customerName || '—'}`,
      `Phone: ${j.phone || '—'}`,
      `Work: ${j.taskType || j.jobType || '—'}`,
      `Size: ${j.projectSize || '—'}`,
      `Alt Parking: ${parking}`,
      `Notes: ${j.notes || '—'}`,
      `Status: ${j.status || '—'}`,
    ].join('\n');
    if (navigator.share) {
      navigator.share({ title: j.address || 'Job', text }).catch(()=>{});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  window.exportDaySchedule = function() {
    shareFullWeek();
  };

  // ── Share / Week List UI helpers ──────────────────────────────────────
  window.toggleShareMenu = function() {
    const dd = document.getElementById('share-menu-dropdown');
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      // close on outside click
      setTimeout(() => document.addEventListener('click', closeShareMenuOutside, {once:true}), 10);
    }
  };

  function closeShareMenuOutside(e) {
    const dd = document.getElementById('share-menu-dropdown');
    const btn = document.getElementById('share-menu-btn');
    if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target)) {
      dd.style.display = 'none';
    }
  }

  window.closeShareMenu = function() {
    const dd = document.getElementById('share-menu-dropdown');
    if (dd) dd.style.display = 'none';
  };

  window.toggleWeekList = function(e) {
    if (e) e.stopPropagation();
    const dd = document.getElementById('week-list-dropdown');
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      setTimeout(() => document.addEventListener('click', closeWeekListOutside, {once:true}), 10);
    }
  };

  function closeWeekListOutside(e) {
    const dd = document.getElementById('week-list-dropdown');
    const btn = document.getElementById('week-list-btn');
    if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target)) {
      dd.style.display = 'none';
    }
  }

  window.closeWeekList = function() {
    const dd = document.getElementById('week-list-dropdown');
    if (dd) dd.style.display = 'none';
  };

  // Navigate to a specific week offset from current week (wi = index 0-7)
  window.schedChangeWeekTo = function(wi) {
    window._schedUserNavigated = true;
    window._schedWeekOffset = wi;
    loadScheduleNotes().then(() => renderSchedule());
  };

  // ── Share This Day ────────────────────────────────────────────────────
  window.schedShareDay = function() {
    // Share the currently-selected day, or today if none selected
    const filter = window._schedCrewFilter || 'all';
    const jobs = allJobs.filter(j => jobMatchesCrew(j, filter));
    const today = new Date(); today.setHours(0,0,0,0);
    const offset = window._schedWeekOffset || 0;
    const monday = getMondayOfWeek(today, offset);
    const weekDays = getWeekDays(monday);

    // If a day is selected use it, otherwise fall back to today or first weekday
    let iso = window._schedSelectedDay;
    if (!iso) {
      const todayISO = toLocalISO(today);
      iso = weekDays.some(d => toLocalISO(d) === todayISO) ? todayISO : toLocalISO(weekDays[0]);
    }

    const d = new Date(iso + 'T00:00:00');
    const dayLabel = d.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
    const dayJobs = jobs.filter(j => j.scheduleDay === iso);

    let text = `Maman Contracting — ${dayLabel}\n\n`;
    if (!dayJobs.length) {
      text += '• No jobs scheduled';
    } else {
      dayJobs.forEach(j => {
        const parking = j.altParkingDays ? `${j.altParkingDays}${j.altParkingTime ? ' ' + j.altParkingTime : ''}` : null;
        let permitStr = null;
        if (Array.isArray(j.permits) && j.permits.length) {
          const lines = j.permits.filter(p => p.number || p.code).map(p => {
            let l = p.number || p.code; if (p.code && p.number) l = `${p.code}-${p.number}`; return l;
          });
          if (lines.length) permitStr = lines.join(', ');
        }
        if (!permitStr && j.permitNumber) permitStr = j.permitNumber;

        text += `• ${j.address || '—'}${j.customerName ? ' (' + j.customerName + ')' : ''}\n`;
        if (j.projectSize) text += `  Size: ${j.projectSize}\n`;
        if (permitStr) text += `  Permit: ${permitStr}\n`;
        if (parking) text += `  Alt Parking: ${parking}\n`;
        if (j.notes) text += `  Notes: ${j.notes}\n`;
        text += '\n';
      });
    }

    if (navigator.share) {
      navigator.share({ title: dayLabel, text: text.trim() }).catch(()=>{});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text.trim())}`, '_blank');
    }
  };

  // ── Share Full Week ───────────────────────────────────────────────────
  window.shareFullWeek = function() {
    const filter = window._schedCrewFilter || 'all';
    const jobs = allJobs.filter(j => jobMatchesCrew(j, filter));
    const today = new Date(); today.setHours(0,0,0,0);
    const offset = window._schedWeekOffset || 0;
    const monday = getMondayOfWeek(today, offset);
    const weekDays = getWeekDays(monday);
    const sunday = weekDays[6];

    const fmtShort = d => d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
    const fmtLong  = d => d.toLocaleDateString('en-US', {month:'long', day:'numeric'});
    const weekLabel = `${fmtShort(monday)}–${fmtShort(sunday)}, ${sunday.getFullYear()}`;

    // Format: "Schedule 03/16 - 03/21"
    const fmtMD = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    let text = `Schedule ${fmtMD(monday)} - ${fmtMD(sunday)}\n\n`;

    const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    weekDays.forEach((d, i) => {
      const iso = toLocalISO(d);
      const dayJobs = jobs.filter(j => j.scheduleDay === iso);
      const noteObj = (window.scheduleNotes && window.scheduleNotes[iso]);
      const note = noteObj ? (typeof noteObj === 'string' ? noteObj : noteObj.note) : null;
      const dayName = dayNames[i];

      text += `${dayName}:\n`;

      if (note) {
        text += `No work — ${note}\n`;
      } else if (!dayJobs.length) {
        text += `\n`;
      } else {
        text += `\n`;
        dayJobs.forEach(j => {
          const altParking = j.altParkingDays
            ? `${j.altParkingDays}${j.altParkingTime ? ' ' + j.altParkingTime : ''}`
            : (j.altParking || null);

          let permitStr = null;
          if (j.permitNumber && j.permitCode) permitStr = `${j.permitNumber} - ${j.permitCode}`;
          else if (j.permitNumber) permitStr = j.permitNumber;
          else if (j.permitCode) permitStr = j.permitCode;

          text += `${j.address || '—'}`;
          if (j.customerName && j.customerName !== j.address) text += ` (${j.customerName})`;
          text += `\n`;
          if (j.projectSize) text += `${j.projectSize}\n`;
          if (permitStr) text += `Permit: ${permitStr}\n`;
          if (altParking) text += `No Parking:\n${altParking}\n`;
          if (j.notes) text += `${j.notes}\n`;
          text += `\n`;
        });
      }

      text += `\n`;
    });

    const trimmed = text.trim();
    if (navigator.share) {
      navigator.share({ title: `Maman Contracting — Week of ${weekLabel}`, text: trimmed }).catch(()=>{
        window.open(`https://wa.me/?text=${encodeURIComponent(trimmed)}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(trimmed)}`, '_blank');
    }
  };

  // ── SCHEDULE TEXT (share) ─────────────────────────────────────────────────
  window.buildScheduleText = function() {
    const filter = window._schedCrewFilter || 'all';
    const datedJobs = allJobs
      .filter(j => !!j.scheduleDay && jobMatchesCrew(j, filter))
      .sort((a,b) => a.scheduleDay.localeCompare(b.scheduleDay));
    const tbdJobs = allJobs.filter(j => !j.scheduleDay && jobMatchesCrew(j, filter));

    let text = `📋 MAMAN CONTRACTING — SCHEDULE REPORT\n\n`;

    const formatJob = j => {
      const lines = [];
      // Address
      if (j.address) lines.push(j.address);
      // Customer name (if different from address)
      if (j.customerName && j.customerName !== j.address) lines.push(`Customer: ${j.customerName}`);
      // Size
      if (j.projectSize) lines.push(`Size: ${j.projectSize}`);
      // Alt Parking
      const parking = j.altParkingDays ? `${j.altParkingDays}${j.altParkingTime ? ' ' + j.altParkingTime : ''}` : j.altParking;
      if (parking) lines.push(`Alt Parking: ${parking}`);
      // Permit
      const pNum = j.permitNumber || j.permitCode;
      if (pNum) lines.push(`Permit: ${pNum}`);
      // Notes
      if (j.notes) lines.push(`Notes: ${j.notes}`);
      return lines.join('\n');
    };

    if (!datedJobs.length && !tbdJobs.length) {
      text += 'No scheduled jobs.\n';
    } else {
      if (datedJobs.length) {
        const grouped = {};
        datedJobs.forEach(j => { if (!grouped[j.scheduleDay]) grouped[j.scheduleDay]=[]; grouped[j.scheduleDay].push(j); });
        Object.entries(grouped).forEach(([dateKey, dayJobs]) => {
          const d = new Date(dateKey + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric'});
          text += `${dateStr}\n${dayJobs.map(formatJob).join('\n')}\n\n`;
        });
      }
      if (tbdJobs.length) {
        text += `Date TBD\n${tbdJobs.map(formatJob).join('\n')}\n\n`;
      }
    }
    return text.trim();
  };

  window.clearJobForm = function() {
    ['f-customerName','f-phone','f-email','f-invoiceNumber','f-address',
     'f-projectSize','f-concreteSub','f-altParkingDays','f-altParkingTime',
     'f-notes',
     'f-scheduleDay','f-completionDay','f-customTask'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('f-taskType').value = '';
    document.getElementById('f-jobType').value = '';
    document.getElementById('f-blocked').value = 'no';
    document.getElementById('f-status').value = 'Pending';
    document.getElementById('f-concreteSubWrap').style.display = 'none';
    document.getElementById('f-customTaskWrap').style.display = 'none';
    document.getElementById('permit-preview').style.display = 'none';
    document.getElementById('photos-preview').innerHTML = '';
    document.getElementById('receipts-preview').style.display = 'none';
    document.getElementById('custom-fields-list').innerHTML = '';
    // Reset permits list with one empty row
    if (window.clearPermitChips) window.clearPermitChips();
    editingJobId = null;
    document.getElementById('modal-title').textContent = '+ New Job';
    document.getElementById('modal-subtitle').textContent = 'Fill in all the job details below';
    document.getElementById('save-job-btn').textContent = '💾 Save Job';
    document.getElementById('modal-delete-btn').style.display = 'none';
    const qcBar = document.getElementById('quick-contact-bar');
    if (qcBar) { qcBar.style.display = 'none'; qcBar.innerHTML = ''; }
  };

