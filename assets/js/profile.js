// ─── PROFILE SYSTEM ──────────────────────────────────────────

// CSS стили для профиля — добавляются динамически
(function injectProfileStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .wallet-profile-btn {
      display:block;width:100%;text-align:left;
      background:rgba(84,147,247,0.06);border:1px solid rgba(84,147,247,0.15);
      color:var(--accent);font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;
      letter-spacing:0.08em;padding:9px 14px;border-radius:8px;cursor:pointer;
      margin-bottom:8px;transition:all 0.2s;
    }
    .wallet-profile-btn:hover { background:rgba(84,147,247,0.12); border-color:rgba(84,147,247,0.35); }
    .title-row { display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border); }
    .title-row:last-child { border-bottom:none; }
    .title-progress-bar { flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden; }
    .title-progress-fill { height:100%;border-radius:3px;transition:width 0.6s ease; }
    .history-item { background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px; }
    .history-item-meta { font-size:10px;color:var(--muted);margin-bottom:6px;display:flex;gap:10px;align-items:center; }
    .history-item-text { font-size:12px;color:var(--text);line-height:1.7; }
    .history-item-votes { font-size:11px;color:var(--green);margin-top:8px; }
  `;
  document.head.appendChild(style);
})();

// ─── TITLE SYSTEM ────────────────────────────────────────────
const TITLES = [
  { name: '🌱 Seeker',       threshold: 1,  color: '#66ffaa', bar: '#1ec864' },
  { name: '🔵 Validator',    threshold: 5,  color: '#7eb8ff', bar: '#5493f7' },
  { name: '⚡ Oracle',       threshold: 20, color: '#ffd700', bar: '#f5c518' },
  { name: '🔥 Terra Legend', threshold: 50, color: '#ff8844', bar: '#ff6600' },
];

function getTopAnswerCount(walletAddress) {
  if (!walletAddress) return 0;
  let count = 0;
  for (const q of questions) {
    for (const a of q.answers) {
      if (a.fullAddr === walletAddress && a.votes >= 3) count++;
    }
  }
  return count;
}

function getUserTitle(walletAddress) {
  const count = getTopAnswerCount(walletAddress);
  let current = null;
  for (const t of TITLES) {
    if (count >= t.threshold) current = t;
  }
  return current;
}

// ─── PROFILE DATA ─────────────────────────────────────────────
function getProfileKey(address) { return 'profile_' + address; }

function loadProfile(address) {
  if (!address) return null;
  try { return JSON.parse(localStorage.getItem(getProfileKey(address)) || 'null'); } catch(e) { return null; }
}

function saveProfileData(address, data) {
  if (!address) return;
  localStorage.setItem(getProfileKey(address), JSON.stringify(data));
}

function getProfileNickname(address) {
  const p = loadProfile(address);
  return p?.nickname || null;
}

function getDisplayName(address) {
  if (!address) return 'Anonymous';
  const nick = getProfileNickname(address);
  if (nick) return nick;
  return 'Anonymous#' + address.slice(-4).toUpperCase();
}

// ─── OPEN PROFILE PAGE ────────────────────────────────────────
function openProfile() {
  document.getElementById('wallet-dropdown').classList.remove('open');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-profile').classList.add('active');
  renderProfilePage();
  smoothScrollTop();
}

function renderProfilePage() {
  const address = globalWalletAddress;
  if (!address) return;

  const profile = loadProfile(address) || {};
  const title = getUserTitle(address);
  const topCount = getTopAnswerCount(address);

  // Wallet short
  document.getElementById('profile-wallet-short').textContent = address.slice(0,12) + '...' + address.slice(-6);

  // Display name
  document.getElementById('profile-display-name').textContent = profile.nickname || ('Anonymous#' + address.slice(-4).toUpperCase());

  // Title badge
  const titleEl = document.getElementById('profile-title-badge');
  if (title) {
    titleEl.textContent = title.name;
    titleEl.style.color = title.color;
  } else {
    titleEl.textContent = 'No title yet — get your first upvoted answer!';
    titleEl.style.color = 'var(--muted)';
  }

  // Avatar
  const img = document.getElementById('profile-avatar-img');
  const placeholder = document.getElementById('profile-avatar-placeholder');
  if (profile.avatar) {
    img.src = profile.avatar;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'block';
  }

  // Nickname input
  document.getElementById('profile-nickname-input').value = profile.nickname || '';

  // Stats
  const myQuestions = questions.filter(q => q.wallet === address || q.fullAddr === address);
  const myAnswers = [];
  let totalUpvotes = 0;
  for (const q of questions) {
    for (const a of q.answers) {
      if (a.fullAddr === address || a.walletAddr === address) {
        myAnswers.push({ ...a, questionId: q.id, questionText: q.text });
        totalUpvotes += a.votes || 0;
      }
    }
  }

  document.getElementById('stat-questions').textContent = myQuestions.length;
  document.getElementById('stat-answers').textContent = myAnswers.length;
  document.getElementById('stat-upvotes').textContent = totalUpvotes;
  document.getElementById('stat-top-answers').textContent = topCount;

  // Title progress
  renderTitleProgress(topCount);

  // History
  renderHistoryTab('answers', myAnswers, myQuestions);
}

function renderTitleProgress(topCount) {
  const el = document.getElementById('title-progress-list');
  el.innerHTML = TITLES.map(t => {
    const pct = Math.min(100, Math.round((topCount / t.threshold) * 100));
    const achieved = topCount >= t.threshold;
    return `<div class="title-row">
      <div style="width:110px;font-size:12px;font-weight:700;color:${achieved ? t.color : 'var(--muted)'};">${t.name}</div>
      <div class="title-progress-bar">
        <div class="title-progress-fill" style="width:${pct}%;background:${achieved ? t.bar : 'rgba(255,255,255,0.15)'}"></div>
      </div>
      <div style="font-size:10px;color:${achieved ? t.color : 'var(--muted)'};min-width:60px;text-align:right;">
        ${achieved ? '✅ Earned' : `${topCount}/${t.threshold}`}
      </div>
    </div>`;
  }).join('');
}

let currentHistoryTab = 'answers';

function switchHistoryTab(tab) {
  currentHistoryTab = tab;
  document.getElementById('history-tab-answers').classList.toggle('active', tab === 'answers');
  document.getElementById('history-tab-questions').classList.toggle('active', tab === 'questions');
  const address = globalWalletAddress;
  const myQuestions = questions.filter(q => q.wallet === address || q.fullAddr === address);
  const myAnswers = [];
  for (const q of questions) {
    for (const a of q.answers) {
      if (a.fullAddr === address || a.walletAddr === address) {
        myAnswers.push({ ...a, questionId: q.id, questionText: q.text });
      }
    }
  }
  renderHistoryTab(tab, myAnswers, myQuestions);
}

function renderHistoryTab(tab, myAnswers, myQuestions) {
  const el = document.getElementById('profile-history-list');
  if (tab === 'answers') {
    if (!myAnswers.length) { el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:30px;">No answers yet — go to the Board and share your knowledge!</div>'; return; }
    el.innerHTML = myAnswers.map(a => `
      <div class="history-item">
        <div class="history-item-meta">
          <span style="color:var(--accent);">💬 Answer</span>
          <span>on question ${a.questionId}</span>
          ${a.votes >= 3 ? '<span style="color:var(--gold);">⭐ Top Answer</span>' : ''}
        </div>
        <div class="history-item-text" style="font-size:11px;color:var(--muted);margin-bottom:6px;font-style:italic;">"${(a.questionText||'').slice(0,80)}..."</div>
        <div class="history-item-text">${a.text.slice(0,200)}${a.text.length > 200 ? '...' : ''}</div>
        <div class="history-item-votes">👍 ${a.votes || 0} upvotes</div>
      </div>
    `).join('');
  } else {
    if (!myQuestions.length) { el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:30px;">No questions yet — ask the community something!</div>'; return; }
    el.innerHTML = myQuestions.map(q => `
      <div class="history-item">
        <div class="history-item-meta">
          <span style="color:var(--accent);">🔮 Question</span>
          <span>${q.category}</span>
          <span>${q.time}</span>
          <span class="q-ref">${q.id}</span>
        </div>
        <div class="history-item-text">${q.text.slice(0,200)}${q.text.length > 200 ? '...' : ''}</div>
        <div class="history-item-votes">👍 ${q.votes || 0} votes · 💬 ${q.answers?.length || 0} answers</div>
      </div>
    `).join('');
  }
}

// ─── EDIT PROFILE ─────────────────────────────────────────────
function toggleProfileEdit() {
  const form = document.getElementById('profile-edit-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function saveProfile() {
  const address = globalWalletAddress;
  if (!address) return;
  const nickname = document.getElementById('profile-nickname-input').value.trim().slice(0, 24);
  const existing = loadProfile(address) || {};
  saveProfileData(address, { ...existing, nickname });

  // Update display name in navbar wallet button
  const short = address.slice(0,8) + '...' + address.slice(-4);
  document.getElementById('wallet-btn-label').textContent = nickname || short;

  toggleProfileEdit();
  renderProfilePage();
}

// ─── AVATAR ───────────────────────────────────────────────────
function triggerAvatarUpload() {
  document.getElementById('avatar-upload').click();
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { alert('Image too large. Max 500KB.'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    const address = globalWalletAddress;
    if (!address) return;
    const existing = loadProfile(address) || {};
    saveProfileData(address, { ...existing, avatar: e.target.result });
    renderProfilePage();
  };
  reader.readAsDataURL(file);
}

function removeAvatar() {
  const address = globalWalletAddress;
  if (!address) return;
  const existing = loadProfile(address) || {};
  delete existing.avatar;
  saveProfileData(address, existing);
  renderProfilePage();
}

// ─── PATCH: показывать никнейм вместо Anonymous#xxxx ─────────
// Переопределяем submitAnswer чтобы прикреплять walletAddr
const _origSubmitAnswer = window.submitAnswer;
window.submitAnswer = function(qi) {
  const text = document.getElementById('atext-' + qi).value.trim();
  const key = document.getElementById('akey-' + qi).value;
  if (!text) { alert('Please write your answer first.'); return; }
  const isAdmin = key === ADMIN_KEY;
  const address = globalWalletAddress;
  const nickname = address ? getProfileNickname(address) : null;
  const alias = isAdmin ? 'Admin' : (nickname || ('Anonymous#' + Math.floor(1000 + Math.random() * 9000)));
  questions[qi].answers.push({
    alias, isAdmin, title: null, text, votes: 0, voted: false,
    walletAddr: address || null
  });
  questions[qi].formOpen = false;
  questions[qi].open = true;
  saveQuestions(questions);
  renderBoard();
};
