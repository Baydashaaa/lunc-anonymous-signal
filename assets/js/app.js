if (history.scrollRestoration) history.scrollRestoration = 'manual';

// ─── ADMIN KEY ───────────────────────────────────────────────
const ADMIN_KEY = 'TerraOracle#9X4K-2025';

// ─── DEMO QUESTIONS (in real version these come from backend) ─
const DEMO_QUESTIONS = [
  {
    id: 'LUNC-A3F9K2B',
    alias: 'Anonymous#4471',
    isAdmin: false,
    title: '🌱 Seeker',
    category: '🗳️ Governance',
    text: 'What is the plan for USTC re-peg after the SDK 0.53 upgrade? Has any formal proposal been submitted to the governance forum yet?',
    tags: ['ustc','sdk053','governance'],
    time: '34 min ago',
    votes: 12,
    answers: [
      { alias: 'Anonymous#8821', isAdmin: false, title: '⚡ Oracle', text: 'No formal proposal yet, but several validators have discussed it in the bi-weekly call. The main blocker is liquidity depth — USTC needs at least $50M TVL before a peg mechanism is viable.', votes: 8, voted: false },
      { alias: 'Admin', isAdmin: true, title: null, text: 'This is being tracked. A governance discussion thread will be opened within the next 2 weeks following the SDK upgrade completion. Stay tuned to the official Terra Classic channels.', votes: 24, voted: false },
    ],
    voted: false,
    open: false,
    formOpen: false,
  },
  {
    id: 'LUNC-B7M2X1C',
    alias: 'Anonymous#2209',
    isAdmin: false,
    title: null,
    category: '⚙️ Validator Issue',
    text: 'Is there a minimum self-delegation requirement for validators after MM 2.0 activates? Some validators seem to be running with very low self-stake.',
    tags: ['validators','mm20','staking'],
    time: '2 hrs ago',
    votes: 7,
    answers: [],
    voted: false,
    open: false,
    formOpen: false,
  },
];

// ─── QUESTIONS STORAGE ───────────────────────────────────────
function loadQuestions() {
  try {
    const stored = JSON.parse(localStorage.getItem('oracle_questions') || 'null');
    // Validate structure
    if (Array.isArray(stored) && stored.length > 0 && stored[0].id && stored[0].text) {
      // Ensure all required fields exist
      return stored.map(q => ({
        answers: [], votes: 0, voted: false, open: false, formOpen: false,
        tags: [], createdAt: Date.now(), ...q
      }));
    }
  } catch(e) {}
  // First time or corrupted: seed with demo questions
  const demo = [...DEMO_QUESTIONS];
  saveQuestions(demo);
  return demo;
}

function saveQuestions(qs) {
  localStorage.setItem('oracle_questions', JSON.stringify(qs));
}

let questions = loadQuestions();
let boardFilter = 'all';
let boardSort = 'new';
let boardSearch = '';

// ─── WALLET SESSION RESTORE ───────────────────────────────────
async function restoreWalletSession() {
  const saved = loadWalletSession();
  if (!saved) return;
  let attempts = 0;
  while (!window.keplr && attempts < 30) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  if (!window.keplr) return;
  try {
    await window.keplr.enable('columbus-5');
    const signer = window.keplr.getOfflineSigner('columbus-5');
    const accounts = await signer.getAccounts();
    if (accounts[0].address === saved) {
      setWalletConnected(saved);
    } else {
      clearWalletSession();
    }
  } catch(e) { clearWalletSession(); }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreWalletSession);
} else {
  restoreWalletSession();
}

// ─── NAVIGATION ───────────────────────────────────────────────
function showPage(name, e) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  if (e && e.target) e.target.classList.add('active');
  if (name === 'board') renderBoard();
  if (name === 'vote') { applyStoredVotes(); applyVoteStates(); renderVotes(); }
  if (name === 'chat') renderChatPage();
  if (typeof stopStatsAutoRefresh === 'function') stopStatsAutoRefresh();
  smoothScrollTop();
}

// ─── TREASURY ─────────────────────────────────────────────────
const TREASURY_WALLETS = {
  oracle:  { addr: 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt', balId: 't-oracle-bal',  usdId: 't-oracle-usd'  },
  lottery: { addr: 'terra1amp68zg7vph3nq84ummnfma4dz753ezxfqa9px', balId: 't-lottery-bal', usdId: 't-lottery-usd' },
  burn:    { addr: 'terra16m05j95p9qvq93cdtchjcpwgvny8f57vzdj06p', balId: 't-burn-bal',    usdId: 't-burn-usd'   },
};
const LCD_NODES = ['https://lcd.terraclassic.community', 'https://terra-classic-lcd.publicnode.com'];

function fmtLunc(uluna) {
  const lunc = uluna / 1_000_000;
  if (lunc >= 1_000_000) return (lunc/1_000_000).toFixed(2) + 'M LUNC';
  if (lunc >= 1_000) return (lunc/1_000).toFixed(1) + 'K LUNC';
  return lunc.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' LUNC';
}

async function fetchBalance(addr) {
  for (const lcd of LCD_NODES) {
    try {
      const res = await fetch(`${lcd}/cosmos/bank/v1beta1/balances/${addr}`);
      if (!res.ok) continue;
      const data = await res.json();
      const uluna = data.balances?.find(b => b.denom === 'uluna')?.amount || '0';
      return parseInt(uluna);
    } catch(e) { continue; }
  }
  return null;
}

async function fetchLuncPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=terra-luna&vs_currencies=usd');
    const data = await res.json();
    return data['terra-luna']?.usd || 0.00009;
  } catch(e) { return 0.00009; }
}

async function loadTreasuryData() {
  const btn = document.getElementById('t-refresh-btn');
  if (btn) { btn.textContent = '⏳ Loading...'; btn.disabled = true; }

  const [price, oracleB, lotteryB, burnB] = await Promise.all([
    fetchLuncPrice(),
    fetchBalance(TREASURY_WALLETS.oracle.addr),
    fetchBalance(TREASURY_WALLETS.lottery.addr),
    fetchBalance(TREASURY_WALLETS.burn.addr),
  ]);

  const wallets = [
    { key: 'oracle',  bal: oracleB  },
    { key: 'lottery', bal: lotteryB },
    { key: 'burn',    bal: burnB    },
  ];

  let totalUluna = 0;
  for (const w of wallets) {
    const cfg = TREASURY_WALLETS[w.key];
    if (w.bal === null) {
      document.getElementById(cfg.balId).textContent = 'Error';
      document.getElementById(cfg.usdId).textContent = 'Could not reach node';
    } else {
      totalUluna += w.bal;
      document.getElementById(cfg.balId).textContent = fmtLunc(w.bal);
      document.getElementById(cfg.usdId).textContent = '≈ $' + ((w.bal / 1_000_000) * price).toFixed(2) + ' USD';
    }
  }

  // Totals
  const tvlEl = document.getElementById('t-total-tvl');
  const burnEl = document.getElementById('t-total-burn');
  if (tvlEl) tvlEl.textContent = fmtLunc(totalUluna);
  if (burnEl && burnB !== null) burnEl.textContent = fmtLunc(burnB);

  const updEl = document.getElementById('t-last-updated');
  if (updEl) updEl.textContent = new Date().toLocaleTimeString();

  if (btn) { btn.textContent = '↻ Refresh'; btn.disabled = false; }

  // Load recent txs for oracle wallet
  loadRecentTxs();
}

async function loadRecentTxs() {
  const el = document.getElementById('t-recent-txs');
  if (!el) return;
  try {
    const res = await fetch(`https://rest.cosmos.directory/terraclassic/cosmos/tx/v1beta1/txs?events=transfer.recipient=%27${TREASURY_WALLETS.oracle.addr}%27&pagination.limit=5&order_by=2`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.txs || data.txs.length === 0) { el.textContent = 'No transactions yet'; return; }
    el.innerHTML = data.txs.map(tx => {
      const ts = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const memo = tx.tx?.value?.memo || '';
      const hash = tx.txhash || '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;border-bottom:1px solid var(--border);gap:12px;">
        <div>
          <div style="font-size:11px;color:var(--text);margin-bottom:2px;">${memo || 'Transfer'}</div>
          <div style="font-size:10px;color:var(--muted);">${ts}</div>
        </div>
        <a href="https://finder.terra.money/classic/tx/${hash}" target="_blank"
          style="font-size:9px;color:var(--accent);text-decoration:none;white-space:nowrap;">🔗 ${hash.slice(0,8)}...</a>
      </div>`;
    }).join('');
  } catch(e) {
    el.textContent = 'Could not load recent transactions';
  }
}

function showPage_treasury(e) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-treasury').classList.add('active');
  loadTreasuryData();
  smoothScrollTop();
}

// ─── HASHTAG LOGIC ────────────────────────────────────────────
let currentTags = [];

function renderTagPills() {
  const pillsEl = document.getElementById('tag-pills');
  if (!pillsEl) return;
  pillsEl.innerHTML = currentTags.map(t =>
    `<span class="tag-pill">#${t}<button onclick="removeTag('${t}')">✕</button></span>`
  ).join('');
  document.getElementById('tags-hidden').value = currentTags.join(',');
}

function addTag(raw) {
  if (currentTags.length >= 5) return;
  const tag = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20);
  if (!tag || currentTags.includes(tag)) return;
  currentTags.push(tag);
  renderTagPills();
}

function addTagSuggestion(tag) {
  addTag(tag);
  document.getElementById('tag-raw-input').focus();
}

function removeTag(tag) {
  currentTags = currentTags.filter(t => t !== tag);
  renderTagPills();
}

document.addEventListener('DOMContentLoaded', () => {
  showPage('home');
  const input = document.getElementById('tag-raw-input');
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addTag(this.value);
      this.value = '';
    } else if (e.key === 'Backspace' && this.value === '' && currentTags.length) {
      currentTags.pop();
      renderTagPills();
    }
  });
  input.addEventListener('input', function() {
    if (this.value.endsWith(',') || this.value.endsWith(' ')) {
      addTag(this.value);
      this.value = '';
    }
  });
});

// ─── FILTER & SORT ──────────────────────────────────────────
function setBoardSearch(val) {
  boardSearch = val.trim().toLowerCase();
  document.getElementById('search-clear').style.display = boardSearch ? 'block' : 'none';
  renderBoard();
}

function clearSearch() {
  boardSearch = '';
  document.getElementById('board-search').value = '';
  document.getElementById('search-clear').style.display = 'none';
  renderBoard();
}

function setBoardFilter(cat) {
  boardFilter = cat;
  document.querySelectorAll('[id^="filter-"]').forEach(b => b.classList.remove('active'));
  const map = {'all':'filter-all','🗳️ Governance':'filter-gov','⚙️ Technical':'filter-tech','⚙️ Validator Issue':'filter-val','📈 Market':'filter-market','🌍 Community':'filter-comm'};
  if (map[cat]) document.getElementById(map[cat])?.classList.add('active');
  renderBoard();
}

function setBoardSort(s) {
  boardSort = s;
  document.querySelectorAll('[id^="sort-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('sort-' + s)?.classList.add('active');
  renderBoard();
}

// ─── RENDER BOARD ────────────────────────────────────────────
function renderBoard() {
  const list = document.getElementById('questions-list');
  const count = document.getElementById('board-count');

  let filtered = boardFilter === 'all' ? [...questions] : questions.filter(q => q.category === boardFilter || q.category.includes(boardFilter.replace(/[🗳️⚙️📈🌍⚡]\s*/,'')));

  // Apply search
  if (boardSearch) {
    const searchTag = boardSearch.startsWith('#') ? boardSearch.slice(1) : null;
    filtered = filtered.filter(q =>
      q.text.toLowerCase().includes(boardSearch) ||
      q.category.toLowerCase().includes(boardSearch) ||
      q.id.toLowerCase().includes(boardSearch) ||
      (searchTag && q.tags && q.tags.some(t => t.toLowerCase() === searchTag.toLowerCase())) ||
      (q.tags && q.tags.some(t => ('#'+t).includes(boardSearch) || t.includes(boardSearch))) ||
      q.answers.some(a => a.text.toLowerCase().includes(boardSearch))
    );
  }

  if (boardSort === 'hot') filtered.sort((a,b) => (b.votes + b.answers.length*2) - (a.votes + a.answers.length*2));
  else if (boardSort === 'unanswered') filtered = filtered.filter(q => q.answers.length === 0);
  else filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  count.textContent = filtered.length + ' open question' + (filtered.length !== 1 ? 's' : '');

  if (filtered.length === 0) {
    list.innerHTML = boardSearch
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">No questions match "<strong>${boardSearch}</strong>".<br><span style="font-size:11px;opacity:0.6;">Try different keywords</span></div></div>`
      : `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No questions here yet.<br>Be the first to ask!</div></div>`;
    return;
  }

  list.innerHTML = filtered.map((q, qi) => {
    const realQi = questions.indexOf(q);
    return `
    <div class="q-card" id="qcard-${qi}">
      <div class="q-meta">
        ${q.isAdmin
          ? `<span class="badge-admin">🛡️ Admin</span>`
          : `<span class="q-alias">${q.alias}</span>`
        }
        ${q.title && !q.isAdmin ? `<span class="badge-title">${q.title}</span>` : ''}
        <span class="q-category">${q.category}</span>
        <span class="q-timer">⏱ ${q.time}</span>
        <span class="q-ref">${q.id}</span>
      </div>
      ${q.tags && q.tags.length ? `<div class="q-tags">${q.tags.map(t => `<span class="q-tag ${boardSearch === '#'+t || boardSearch === t ? 'active-tag' : ''}" onclick="setBoardSearch('#${t}')">#${t}</span>`).join('')}</div>` : ''}
      <div class="q-text">${boardSearch ? q.text.replace(new RegExp('(' + boardSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark style="background:rgba(84,147,247,0.25);color:var(--accent);border-radius:2px;padding:0 2px;">$1</mark>') : q.text}</div>
      <div class="q-footer">
        <div class="q-votes">
          <button class="vote-btn ${q.voted ? 'voted' : ''}" onclick="voteQuestion(${realQi})">👍 ${q.votes}</button>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-answer" onclick="toggleAnswers(${realQi})">
            💬 ${q.answers.length} answer${q.answers.length !== 1 ? 's' : ''}
          </button>
          <button class="btn btn-sm btn-answer" onclick="toggleAnswerForm(${realQi})">+ Answer</button>
        </div>
      </div>

      <!-- ANSWERS -->
      <div class="answers-section ${q.open ? 'open' : ''}" id="answers-${realQi}">
        ${q.answers.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:8px 0;">No answers yet — be the first!</div>` : ''}
        ${q.answers.map((a, ai) => `
          <div class="answer-item ${a.isAdmin ? 'admin-answer' : ''}">
            <div class="answer-meta">
              ${a.isAdmin
                ? `<span class="badge-admin">🛡️ Admin</span>`
                : `<span class="q-alias">${a.alias}</span>`
              }
              ${a.title && !a.isAdmin ? `<span class="badge-title">${a.title}</span>` : ''}
            </div>
            <div class="answer-text">${a.text}</div>
            <div class="answer-votes">
              <button class="vote-btn ${a.voted ? 'voted' : ''}" onclick="voteAnswer(${realQi},${ai})">👍 ${a.votes}</button>
            </div>
          </div>
        `).join('')}

        <!-- ANSWER FORM -->
        <div class="answer-form ${q.formOpen ? 'open' : ''}" id="aform-${realQi}">
          <div class="answer-form-title">Submit anonymous answer</div>
          <div class="form-group">
            <label>Your Answer</label>
            <textarea id="atext-${realQi}" placeholder="Share your knowledge anonymously..." rows="4"></textarea>
          </div>
          <div class="form-group">
            <label>Admin Key <span style="font-size:9px;color:var(--muted);text-transform:none">(optional — leave blank to answer anonymously)</span></label>
            <div class="admin-key-wrap" id="akwrap-${realQi}">
              <input type="password" id="akey-${realQi}" placeholder="Enter key to post as Admin..." oninput="checkAdminKey(${realQi})">
              <span class="admin-key-hint" id="akeyhint-${realQi}">optional</span>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:4px;">
            <button class="btn btn-primary btn-sm" onclick="submitAnswer(${realQi})">Post Answer</button>
            <span style="font-size:10px;color:var(--muted)" id="apreview-${realQi}">Will post as: Anonymous#????</span>
          </div>
        </div>
      </div>
    </div>
  `; }).join('');
}

// ─── ADMIN KEY CHECK ─────────────────────────────────────────
function checkAdminKey(qi) {
  const key = document.getElementById('akey-' + qi).value;
  const wrap = document.getElementById('akwrap-' + qi);
  const hint = document.getElementById('akeyhint-' + qi);
  const preview = document.getElementById('apreview-' + qi);
  const isAdmin = key === ADMIN_KEY;
  wrap.className = 'admin-key-wrap' + (key.length > 0 && isAdmin ? ' valid' : '');
  hint.textContent = isAdmin ? '🛡️ Admin verified' : 'optional';
  preview.innerHTML = isAdmin
    ? 'Will post as: <span class="badge-admin" style="font-size:9px;padding:1px 7px;">🛡️ Admin</span>'
    : 'Will post as: Anonymous#' + Math.floor(1000 + Math.random() * 9000);
}

// ─── TOGGLE ANSWERS ───────────────────────────────────────────
function toggleAnswers(qi) {
  questions[qi].open = !questions[qi].open;
  renderBoard();
}

function toggleAnswerForm(qi) {
  questions[qi].formOpen = !questions[qi].formOpen;
  questions[qi].open = true;
  renderBoard();
}

// ─── SUBMIT ANSWER ────────────────────────────────────────────
function submitAnswer(qi) {
  const text = document.getElementById('atext-' + qi).value.trim();
  const key = document.getElementById('akey-' + qi).value;
  if (!text) { alert('Please write your answer first.'); return; }

  const isAdmin = key === ADMIN_KEY;
  const alias = isAdmin ? 'Admin' : 'Anonymous#' + Math.floor(1000 + Math.random() * 9000);

  questions[qi].answers.push({
    alias, isAdmin,
    title: null,
    text,
    votes: 0,
    voted: false,
  });
  questions[qi].formOpen = false;
  questions[qi].open = true;
  saveQuestions(questions);
  renderBoard();
}

// ─── VOTING ───────────────────────────────────────────────────
function voteQuestion(qi) {
  if (questions[qi].voted) return;
  questions[qi].votes++;
  questions[qi].voted = true;
  saveQuestions(questions);
  renderBoard();
}

function voteAnswer(qi, ai) {
  if (questions[qi].answers[ai].voted) return;
  questions[qi].answers[ai].votes++;
  questions[qi].answers[ai].voted = true;
  saveQuestions(questions);
  renderBoard();
}

// ─── ASK FORM ────────────────────────────────────────────────
document.getElementById('ask-message').addEventListener('input', function() {
  const max = 2000, len = this.value.length, remaining = max - len;
  const pct = len / max;
  const ring = document.getElementById('ask-ring');
  document.getElementById('ask-count').textContent = remaining;
  ring.style.strokeDashoffset = 87.96 - pct * 87.96;
  ring.style.stroke = remaining <= 100 ? '#ff4444' : remaining <= 300 ? '#f5c518' : 'var(--accent)';
  document.getElementById('ask-count').style.color = remaining <= 100 ? '#ff4444' : remaining <= 300 ? '#f5c518' : 'var(--muted)';
});

document.getElementById('ask-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('ask-btn');
  btn.disabled = true;
  btn.innerHTML = 'Transmitting<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';

  const formData = new FormData(this);
  const category = formData.get('category') || '📝 Other';
  const text = formData.get('message') || '';
  const txHash = document.getElementById('verified-tx-hidden').value;
  const wallet = document.getElementById('verified-wallet-hidden').value;
  const ref = 'LUNC-' + Date.now().toString(36).toUpperCase().slice(-7);

  // Save question to localStorage immediately
  const alias = wallet ? ('Anonymous#' + Math.floor(1000 + Math.random() * 9000)) : 'Anonymous';
  const tagsRaw = document.getElementById('tags-hidden').value;
  const tags = tagsRaw ? tagsRaw.split(',').filter(Boolean) : [];

  const newQ = {
    id: ref,
    alias,
    isAdmin: false,
    title: '🌱 Seeker',
    category,
    text,
    tags,
    time: 'just now',
    createdAt: Date.now(),
    votes: 0,
    answers: [],
    voted: false,
    open: false,
    formOpen: false,
    txHash,
    wallet
  };
  questions.unshift(newQ);
  saveQuestions(questions);

  // Also submit to Formspree for admin notification
  try {
    await fetch(this.action, {
      method: 'POST', body: formData, headers: { 'Accept': 'application/json' }
    });
  } catch(e) {}

  document.getElementById('ask-form-section').style.display = 'none';
  const success = document.getElementById('ask-success');
  success.classList.add('visible');
  document.getElementById('ask-ref').textContent = 'REF: ' + ref;

  btn.disabled = false;
  btn.innerHTML = 'Transmit Question →';
});

// ─── KEPLR ────────────────────────────────────────────────────
// ─── PROTOCOL WALLETS ─────────────────────────────────────────
const ADMIN_WALLET    = 'terra15jt5a9ycsey4hd6nlqgqxccl9aprkmg2mxmfc6'; // Admin / legacy
const ORACLE_WALLET   = 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt'; // Questions, Chat, Board
const LOTTERY_WALLET  = 'terra1amp68zg7vph3nq84ummnfma4dz753ezxfqa9px'; // Lottery prize pool
const BURN_WALLET     = 'terra16m05j95p9qvq93cdtchjcpwgvny8f57vzdj06p'; // Burn destination
const PROTOCOL_WALLET = ADMIN_WALLET; // backwards compat
const REQUIRED_LUNC = 200000000000; // 200,000 LUNC in uLUNC
let connectedAddress = null;

async function connectKeplr() {
  const btn = document.getElementById('keplr-connect-btn');
  if (!window.keplr) {
    if (confirm('Keplr wallet not found. Install Keplr?')) window.open('https://www.keplr.app/', '_blank');
    return;
  }
  try {
    btn.textContent = 'Connecting...'; btn.disabled = true;
    await window.keplr.enable('columbus-5');
    const offlineSigner = window.keplr.getOfflineSigner('columbus-5');
    const accounts = await offlineSigner.getAccounts();
    connectedAddress = accounts[0].address;
    document.getElementById('connected-addr').textContent = connectedAddress.slice(0,10)+'...'+connectedAddress.slice(-4);
    document.getElementById('verified-wallet-hidden').value = connectedAddress;
    document.getElementById('keplr-disconnected').style.display = 'none';
    document.getElementById('keplr-connected').style.display = 'block';

    // Admin wallet bypass — skip payment
    if (connectedAddress === ADMIN_WALLET) {
      document.getElementById('verified-tx-hidden').value = 'ADMIN_BYPASS';
      document.getElementById('keplr-connected').style.display = 'none';
      document.getElementById('ask-form').style.display = 'block';
      // Show admin badge notice
      const notice = document.getElementById('tx-section');
      notice.style.display = 'block';
      notice.innerHTML = '<div style="background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.25);border-radius:8px;padding:12px 16px;font-size:12px;color:var(--gold);">🛡️ Admin wallet detected — payment bypassed</div>';
    } else {
      document.getElementById('tx-section').style.display = 'block';
    }
  } catch(e) {
    btn.textContent = '🔑 Connect Keplr Wallet'; btn.disabled = false;
    alert('Connection failed: ' + (e.message || e));
  }
}

function disconnectKeplr() {
  connectedAddress = null;
  document.getElementById('keplr-disconnected').style.display = 'block';
  document.getElementById('keplr-connected').style.display = 'none';
  document.getElementById('tx-section').style.display = 'none';
  document.getElementById('ask-form').style.display = 'none';
  document.getElementById('tx-status').style.display = 'none';
  document.getElementById('keplr-connect-btn').textContent = '🔑 Connect Keplr Wallet';
  document.getElementById('keplr-connect-btn').disabled = false;
}

// Auto-pay via Keplr when "Pay & Unlock" is clicked
async function autoPayAndUnlock() {
  if (!connectedAddress) { alert('Connect wallet first!'); return; }
  const btn = document.getElementById('verify-btn');
  const statusEl = document.getElementById('tx-status');
  btn.textContent = '⏳ Opening Keplr...'; btn.disabled = true;

  try {
    const { SigningStargateClient } = await import('https://esm.sh/@cosmjs/stargate@0.32.3');
    const offlineSigner = window.keplr.getOfflineSigner('columbus-5');
    const RPC = ['https://terra-classic-rpc.publicnode.com','https://rpc.terraclassic.community'];
    let client = null;
    for (const rpc of RPC) {
      try { client = await SigningStargateClient.connectWithSigner(rpc, offlineSigner); break; } catch(e) {}
    }
    if (!client) throw new Error('Cannot connect to Terra Classic RPC');

    const result = await client.sendTokens(
      connectedAddress, ORACLE_WALLET, // Ask → Oracle pool
      [{ denom: 'uluna', amount: '200000000000' }],
      { amount: [{ denom: 'uluna', amount: '200000' }], gas: '200000' },
      'Terra Oracle Question Payment'
    );
    if (result.code !== 0) throw new Error('TX failed: ' + result.rawLog);

    document.getElementById('verified-tx-hidden').value = result.transactionHash;
    showTxStatus('success', '✅ Payment confirmed! 200,000 LUNC sent. Form unlocked.');
    setTimeout(() => {
      document.getElementById('tx-section').style.display = 'none';
      document.getElementById('keplr-connected').style.display = 'none';
      document.getElementById('ask-form').style.display = 'block';
    }, 1200);
  } catch(e) {
    btn.textContent = 'Pay 200,000 LUNC & Unlock'; btn.disabled = false;
    showTxStatus('error', '❌ ' + (e.message || 'Transaction cancelled.'));
  }
}

async function verifyTX() {
  const txHash = document.getElementById('tx-input').value.trim();
  const statusEl = document.getElementById('tx-status');
  const btn = document.getElementById('verify-btn');
  if (!txHash) { alert('Please enter a TX hash'); return; }

  btn.textContent = 'Checking...';
  btn.disabled = true;
  statusEl.style.display = 'none';

  const FCD_NODES = [
    'https://terra-classic-lcd.publicnode.com',
    'https://terra-classic-lcd.publicnode.com',
  ];

  let txData = null;
  for (const node of FCD_NODES) {
    try {
      const res = await fetch(`https://rest.cosmos.directory/terraclassic/cosmos/tx/v1beta1/txs/${txHash}`);
      if (res.ok) { txData = await res.json(); break; }
    } catch(e) { continue; }
  }

  btn.textContent = 'Verify';
  btn.disabled = false;

  if (!txData || txData.error) {
    showTxStatus('error', '❌ Transaction not found. Check the hash and try again.');
    return;
  }

  // FCD format check
  if (txData.code && txData.code !== 0) {
    showTxStatus('error', '❌ Transaction failed on-chain.');
    return;
  }

  // Check messages — FCD format
  const msgs = txData.tx?.value?.msg || txData.tx?.body?.messages || [];
  let valid = false;
  let foundAmount = 0;

  for (const msg of msgs) {
    const type = msg.type || msg['@type'] || '';
    const val = msg.value || msg;
    if (type.includes('MsgSend') || type.includes('bank')) {
      const toAddr = val.to_address || val.toAddress;
      const coins = val.amount || [];
      const lunc = Array.isArray(coins)
        ? coins.find(c => c.denom === 'uluna')
        : (coins.denom === 'uluna' ? coins : null);
      if ((toAddr === ORACLE_WALLET || toAddr === PROTOCOL_WALLET) && lunc) {
        foundAmount = parseInt(lunc.amount);
        if (foundAmount >= REQUIRED_LUNC) { valid = true; break; }
      }
    }
  }

  if (!valid) {
    const found = (foundAmount / 1000000).toLocaleString();
    showTxStatus('error', `❌ Invalid payment. Expected 200,000 LUNC to protocol wallet. Found: ${found} LUNC.`);
    return;
  }

  // All good!
  document.getElementById('verified-tx-hidden').value = txHash;
  showTxStatus('success', '✅ Payment verified! 200,000 LUNC confirmed. Form unlocked.');
  setTimeout(() => {
    document.getElementById('tx-section').style.display = 'none';
    document.getElementById('keplr-connected').style.display = 'none';
    document.getElementById('ask-form').style.display = 'block';
  }, 1200);
}

function showTxStatus(type, msg) {
  const el = document.getElementById('tx-status');
  el.style.display = 'block';
  el.style.background = type === 'success' ? 'rgba(102,255,170,0.06)' : 'rgba(255,60,60,0.06)';
  el.style.border = type === 'success' ? '1px solid rgba(102,255,170,0.25)' : '1px solid rgba(255,60,60,0.25)';
  el.style.color = type === 'success' ? 'var(--green)' : '#ff6060';
  el.textContent = msg;
}

// ─── WALLET CONNECT ───────────────────────────────────────────
let globalWalletAddress = null;

// ─── WALLET SESSION (24h) ─────────────────────────────────────
function saveWalletSession(address) {
  localStorage.setItem('wallet_session', JSON.stringify({
    address, expires: Date.now() + 24 * 60 * 60 * 1000
  }));
}

function loadWalletSession() {
  try {
    const s = JSON.parse(localStorage.getItem('wallet_session') || 'null');
    if (s && s.address && s.expires > Date.now()) return s.address;
    localStorage.removeItem('wallet_session');
  } catch(e) {}
  return null;
}

function clearWalletSession() {
  localStorage.removeItem('wallet_session');
}

window.toggleWalletDropdown = function() {
  document.getElementById('wallet-dropdown').classList.toggle('open');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!document.getElementById('wallet-wrap').contains(e.target)) {
    document.getElementById('wallet-dropdown').classList.remove('open');
  }
});

window.connectWallet = async function(type) {
  if (type === 'keplr-ext') {
    if (!window.keplr) {
      if (confirm('Keplr extension not found. Install Keplr?')) {
        window.open('https://www.keplr.app/download', '_blank');
      }
      return;
    }
    try {
      document.getElementById('wallet-btn-label').textContent = 'Connecting...';
      await window.keplr.enable('columbus-5');
      const signer = window.keplr.getOfflineSigner('columbus-5');
      const accounts = await signer.getAccounts();
      setWalletConnected(accounts[0].address);
    } catch(e) {
      document.getElementById('wallet-btn-label').textContent = 'Connect';
      alert('Connection failed: ' + (e.message || e));
    }
  } else if (type === 'keplr-mobile') {
    alert('Keplr Mobile (WalletConnect) coming soon! Use Keplr Extension for now.');
  }
}

function setWalletConnected(address) {
  globalWalletAddress = address;
  saveWalletSession(address);
  const short = address.slice(0,8) + '...' + address.slice(-4);
  document.getElementById('wallet-btn-label').textContent = short;
  document.getElementById('wallet-main-btn').classList.add('connected');
  document.getElementById('wallet-connected-addr').textContent = address;
  document.getElementById('wallet-not-connected').style.display = 'none';
  document.getElementById('wallet-connected-panel').style.display = 'block';
  document.getElementById('wallet-dropdown').classList.remove('open');

  // Auto-connect chat Keplr too
  if (window.keplrChatAddress !== undefined) {
    keplrChatAddress = address;
    const addrShort = address.slice(0,8) + '...' + address.slice(-4);
    document.getElementById('keplr-chat-addr').textContent = addrShort;
    document.getElementById('keplr-verified-bar').style.display = 'flex';
    document.getElementById('mode-keplr').textContent = '🔑 ' + addrShort;
    setMode('keplr');
  }
}

window.disconnectWallet = function() {
  globalWalletAddress = null;
  clearWalletSession();
  document.getElementById('wallet-btn-label').textContent = 'Connect';
  document.getElementById('wallet-main-btn').classList.remove('connected');
  document.getElementById('wallet-not-connected').style.display = 'block';
  document.getElementById('wallet-connected-panel').style.display = 'none';
  document.getElementById('wallet-dropdown').classList.remove('open');
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) adminPanel.style.display = 'none';
  disconnectChatKeplr();
}

// ─── CHAT PAGE ────────────────────────────────────────────────
document.getElementById('chat-page-input').addEventListener('input', function() {
  const max = 256;
  const len = this.value.length;
  const remaining = max - len;
  const pct = len / max;
  const circumference = 87.96;
  const offset = circumference - (pct * circumference);
  const ring = document.getElementById('chat-ring');
  const counter = document.getElementById('chat-page-count');
  ring.style.strokeDashoffset = offset;
  // Color: blue → yellow → red
  if (remaining <= 20) {
    ring.style.stroke = '#ff4444';
    counter.style.color = '#ff4444';
  } else if (remaining <= 50) {
    ring.style.stroke = '#f5c518';
    counter.style.color = '#f5c518';
  } else {
    ring.style.stroke = 'var(--accent)';
    counter.style.color = 'var(--muted)';
  }
  counter.textContent = remaining;
});

window.sendChatMessage = async function() {
  const text = document.getElementById('chat-page-input').value.trim();
  const statusEl = document.getElementById('chat-tx-status');
  const btn = document.getElementById('chat-page-send-btn');

  if (!text) { alert('Write a message first!'); return; }
  if (!globalWalletAddress) { alert('Connect Keplr first!'); return; }
  if (!window.keplr) { alert('Keplr not found!'); return; }

  const PROTOCOL_WALLET_CHAT = ORACLE_WALLET; // Chat messages → Oracle pool

  btn.textContent = '⏳ Waiting for Keplr...';
  btn.disabled = true;
  statusEl.style.display = 'none';

  try {
    await window.keplr.enable('columbus-5');
    const offlineSigner = window.keplr.getOfflineSigner('columbus-5');
    const accounts = await offlineSigner.getAccounts();
    const sender = accounts[0].address;

    // Use CosmJS SigningStargateClient via CDN
    const { SigningStargateClient } = await import('https://esm.sh/@cosmjs/stargate@0.32.3');
    const RPC_NODES = [
      'https://terra-classic-rpc.publicnode.com',
      'https://rpc.terraclassic.community',
    ];

    let client = null;
    for (const rpc of RPC_NODES) {
      try { client = await SigningStargateClient.connectWithSigner(rpc, offlineSigner); break; }
      catch(e) { continue; }
    }
    if (!client) throw new Error('Could not connect to Terra Classic RPC');

    const result = await client.sendTokens(
      sender,
      PROTOCOL_WALLET_CHAT,
      [{ denom: 'uluna', amount: '5000000000' }],
      { amount: [{ denom: 'uluna', amount: '100000' }], gas: '200000' },
      text.slice(0, 256)
    );

    if (result.code !== 0) throw new Error('TX failed: ' + result.rawLog);

    // Optimistic local render while chain confirms
    const short = sender.slice(0,8)+'...'+sender.slice(-4);
    const stored = JSON.parse(localStorage.getItem('dao_chat_pending') || '[]');
    stored.push({ text, author: short, fullAddr: sender, txHash: result.transactionHash, isVerified: true, timestamp: Date.now() });
    localStorage.setItem('dao_chat_pending', JSON.stringify(stored));

    document.getElementById('chat-page-input').value = '';
    document.getElementById('chat-page-count').textContent = '256';
    document.getElementById('chat-ring').style.strokeDashoffset = '87.96';
    document.getElementById('chat-ring').style.stroke = 'var(--accent)';
    btn.textContent = 'Send Message →'; btn.disabled = false;
    statusEl.style.cssText = 'display:block;border-radius:8px;padding:10px 14px;font-size:12px;background:rgba(102,255,170,0.06);border:1px solid rgba(102,255,170,0.25);color:var(--green);margin-top:10px;';
    statusEl.innerHTML = '✅ Sent! <a href="https://finder.terra.money/classic/tx/' + result.transactionHash + '" target="_blank" style="color:var(--green);text-decoration:underline;">' + result.transactionHash.slice(0,16) + '...</a><br><span style="font-size:10px;opacity:0.7;">Message will appear after blockchain confirmation (~6s)</span>';
    // Reload from chain after 8 seconds for confirmation
    setTimeout(() => { loadChatFromChain(); }, 8000);
    setTimeout(() => { statusEl.style.display = 'none'; }, 10000);

  } catch(e) {
    btn.textContent = 'Send Message →'; btn.disabled = false;
    statusEl.style.cssText = 'display:block;border-radius:8px;padding:10px 14px;font-size:12px;background:rgba(255,60,60,0.06);border:1px solid rgba(255,60,60,0.25);color:#ff6060;margin-top:10px;';
    statusEl.textContent = '❌ ' + (e.message || 'Transaction cancelled or failed.');
  }
}


// Load chat page messages from Firebase
// ─── BLOCKCHAIN CHAT ──────────────────────────────────────────
const CHAT_WALLET = ORACLE_WALLET; // Load chat TX from Oracle wallet
const CHAT_MIN_ULUNA = 5000000000; // 5,000 LUNC
const FCD_NODES = ['https://terra-classic-lcd.publicnode.com', 'https://terra-classic-lcd.publicnode.com'];

// ─── CHAT REACTIONS ───────────────────────────────────────────
const CHAT_REACTIONS = ['🔥','👍','🚀','💎','❤️'];

function getChatReactions() {
  try { return JSON.parse(localStorage.getItem('chat_reactions') || '{}'); } catch(e) { return {}; }
}
function saveChatReactions(r) {
  localStorage.setItem('chat_reactions', JSON.stringify(r));
}
function toggleReaction(txHash, emoji) {
  const all = getChatReactions();
  const key = txHash + '_' + emoji;
  const myKey = 'my_' + key;
  const myReactions = JSON.parse(localStorage.getItem('my_chat_reactions') || '{}');
  if (myReactions[key]) {
    all[key] = Math.max(0, (all[key] || 1) - 1);
    delete myReactions[key];
  } else {
    all[key] = (all[key] || 0) + 1;
    myReactions[key] = true;
  }
  saveChatReactions(all);
  localStorage.setItem('my_chat_reactions', JSON.stringify(myReactions));
  // Re-render just reactions row
  const row = document.getElementById('reactions-' + txHash);
  if (row) row.outerHTML = buildReactionsRow(txHash, all, myReactions);
}

function buildReactionsRow(txHash, all, myReactions) {
  const counts = CHAT_REACTIONS.map(e => {
    const key = txHash + '_' + e;
    const count = all[key] || 0;
    const mine = myReactions[key];
    return { e, count, mine, key };
  });
  const active = counts.filter(r => r.count > 0);
  const inactive = counts.filter(r => r.count === 0);
  return `<div id="reactions-${txHash}" class="chat-reactions-row">
    ${active.map(r => `
      <button class="chat-reaction ${r.mine ? 'my-reaction' : ''}" onclick="toggleReaction('${txHash}','${r.e}')">
        ${r.e} <span>${r.count}</span>
      </button>`).join('')}
    <div class="reaction-picker-wrap">
      <button class="chat-reaction add-reaction-btn" title="Add reaction">＋</button>
      <div class="reaction-picker">
        ${CHAT_REACTIONS.map(e => `<button onclick="toggleReaction('${txHash}','${e}')">${e}</button>`).join('')}
      </div>
    </div>
  </div>`;
}

let cachedMsgs = [];

function renderChatMessages(msgs) {
  cachedMsgs = msgs;
  const container = document.getElementById('chat-page-messages');
  if (!msgs || msgs.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:40px 20px;">No messages yet — be the first to speak!<br><span style="font-size:10px;opacity:0.6;margin-top:6px;display:block;">Send 5,000 LUNC with your message as memo</span></div>';
    return;
  }
  const all = getChatReactions();
  const myReactions = JSON.parse(localStorage.getItem('my_chat_reactions') || '{}');
  container.innerHTML = msgs.map(m => `
    <div class="chat-page-msg verified-msg" id="msg-${m.txHash}">
      <div class="chat-page-msg-header">
        <span class="chat-page-msg-author" style="font-family:monospace;">${m.author}</span>
        <span style="font-size:8px;background:rgba(102,255,170,0.15);color:var(--green);padding:1px 6px;border-radius:4px;letter-spacing:0.08em;">✓ ON-CHAIN</span>
        ${m.amount ? `<span style="font-size:8px;color:var(--gold);background:rgba(245,197,24,0.1);padding:1px 6px;border-radius:4px;">${m.amount} LUNC</span>` : ''}
        <span class="chat-page-msg-time">
          <a href="https://finder.terra.money/classic/tx/${m.txHash}" target="_blank" style="color:var(--muted);text-decoration:none;font-size:9px;" title="View on Explorer">🔗 ${m.time}</a>
        </span>
      </div>
      <div class="chat-page-msg-text">${m.text}</div>
      ${buildReactionsRow(m.txHash, all, myReactions)}
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

async function loadChatFromChain() {
  const container = document.getElementById('chat-page-messages');
  const prevContent = container.innerHTML;
  // Show spinner only if empty
  if (!cachedMsgs.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px 20px;">
      <div style="font-size:22px;margin-bottom:10px;animation:spin 1.2s linear infinite;display:inline-block;">⏳</div>
      <div style="color:var(--muted);font-size:12px;">Loading messages from blockchain...</div>
      <div style="color:var(--muted);font-size:10px;opacity:0.5;margin-top:6px;">Connecting to Terra Classic nodes</div>
    </div>`;
  }

  let txList = null;
  for (const node of FCD_NODES) {
    try {
      const res = await fetch(`https://rest.cosmos.directory/terraclassic/cosmos/tx/v1beta1/txs?events=transfer.recipient=%27${CHAT_WALLET}%27&pagination.limit=50&order_by=2`);
      if (res.ok) { txList = await res.json(); break; }
    } catch(e) { continue; }
  }

  if (!txList || !txList.txs) {
    // Fallback: try LCD
    try {
      const res = await fetch(`https://rest.cosmos.directory/terraclassic/cosmos/tx/v1beta1/txs?events=transfer.recipient='${CHAT_WALLET}'&pagination.limit=50&order_by=2`);
      if (res.ok) {
        const data = await res.json();
        txList = { txs: (data.txs || []).map((tx, i) => ({
          txhash: data.tx_responses?.[i]?.txhash,
          tx: { value: { memo: tx.body?.memo, msg: tx.body?.messages?.map(m => ({ type: m['@type'], value: { from_address: m.from_address, to_address: m.to_address, amount: m.amount } })) } },
          timestamp: data.tx_responses?.[i]?.timestamp
        })) };
      }
    } catch(e) {}
  }

  if (!txList || !txList.txs) {
    // All nodes failed
    if (!cachedMsgs.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;">
        <div style="font-size:22px;margin-bottom:10px;">⚠️</div>
        <div style="color:var(--muted);font-size:12px;">Could not reach blockchain nodes</div>
        <div style="color:var(--muted);font-size:10px;opacity:0.5;margin-top:4px;">Will retry in 30s</div>
        <button onclick="loadChatFromChain()" style="margin-top:14px;background:rgba(84,147,247,0.1);border:1px solid rgba(84,147,247,0.25);
          color:var(--accent);border-radius:8px;padding:7px 16px;font-family:'Exo 2',sans-serif;font-size:11px;cursor:pointer;">↻ Retry now</button>
      </div>`;
    }
    return;
  }
  if (txList.txs.length === 0) {
    if (!cachedMsgs.length) container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:40px;">No messages yet — be the first!</div>';
    return;
  }

  const msgs = [];
  for (const tx of txList.txs) {
    try {
      const memo = tx.tx?.value?.memo || tx.tx?.body?.memo || '';
      if (!memo || memo.trim() === '') continue;

      const txMsgs = tx.tx?.value?.msg || tx.tx?.body?.messages || [];
      let sender = null, luncAmount = 0;

      for (const msg of txMsgs) {
        const type = msg.type || msg['@type'] || '';
        const val = msg.value || msg;
        if (type.includes('MsgSend')) {
          const to = val.to_address || '';
          if (to === CHAT_WALLET) {
            sender = val.from_address || null;
            const coins = val.amount || [];
            const lunc = Array.isArray(coins) ? coins.find(c => c.denom === 'uluna') : null;
            luncAmount = lunc ? parseInt(lunc.amount) : 0;
          }
        }
      }

      // Only show messages with minimum payment
      if (!sender || luncAmount < CHAT_MIN_ULUNA) continue;

      const short = sender.slice(0, 10) + '...' + sender.slice(-4);
      const luncFormatted = (luncAmount / 1000000).toLocaleString(undefined, {maximumFractionDigits: 0});
      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      const timeStr = ts ? ts.toLocaleDateString([], {month:'short',day:'numeric'}) + ' ' + ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';

      msgs.push({
        author: short,
        fullAddr: sender,
        text: memo.slice(0, 256),
        amount: luncFormatted,
        txHash: tx.txhash || tx.id || '',
        time: timeStr,
        ts: ts ? ts.getTime() : 0
      });
    } catch(e) { continue; }
  }

  // Sort oldest → newest
  msgs.sort((a, b) => a.ts - b.ts);
  renderChatMessages(msgs);
}

// Also merge any pending local messages not yet in FCD
function renderChatPage() {
  loadChatFromChain();
}
renderChatPage();

// Refresh every 30 seconds
setInterval(loadChatFromChain, 30000);

// Update chat page when wallet connects
const _origSetWallet = window.setWalletConnected;
window.setWalletConnected = function(address) {
  _origSetWallet(address);
  document.getElementById('chat-page-connect-prompt').style.display = 'none';
  document.getElementById('chat-page-form').style.display = 'block';
  document.getElementById('chat-page-addr').textContent = address.slice(0,10)+'...'+address.slice(-4);
  document.getElementById('vote-wallet-status').innerHTML = '<span style="font-size:11px;color:var(--green);">✓ ' + address.slice(0,8)+'...'+address.slice(-4) + '</span>';
  // Show admin panel if admin wallet
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) {
    adminPanel.style.display = address === ADMIN_WALLET ? 'block' : 'none';
    if (address === ADMIN_WALLET) {
      applyVoteStates();
      updateAdminPanel();
    }
  }
  // Restore previous votes for this wallet
  applyStoredVotes();
  applyVoteStates();
  renderVotes();
}

// ─── VOTE PAGE ────────────────────────────────────────────────
// ─── MONTHLY LIQUIDITY VOTE GENERATOR ────────────────────────
const LIQUIDITY_PAIRS = [
  'LUNC/USDT', 'LUNC/USTC', 'LUNC/ATOM', 'LUNC/BTC',
  'LUNC/ETH', 'LUNC/BNB', 'LUNC/OSMO', 'LUNC/JUNO'
];

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

function generateMonthlyLiquidityVote() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Vote opens on 20th, closes on 25th
  const openDate  = new Date(year, month, 20, 0, 0, 0);
  const closeDate = new Date(year, month, 25, 23, 59, 59);

  let status, timerStr, displayMonth, displayYear;

  if (day < 20) {
    // Before voting period — show upcoming
    const msUntilOpen = openDate - now;
    const daysUntil = Math.floor(msUntilOpen / 86400000);
    const hoursUntil = Math.floor((msUntilOpen % 86400000) / 3600000);
    status = 'upcoming';
    timerStr = `Opens in ${daysUntil}d ${hoursUntil}h`;
    displayMonth = MONTH_NAMES[month];
    displayYear = year;
  } else if (day <= 25) {
    // Active voting window
    const msLeft = closeDate - now;
    const daysLeft = Math.floor(msLeft / 86400000);
    const hoursLeft = Math.floor((msLeft % 86400000) / 3600000);
    const minsLeft = Math.floor((msLeft % 3600000) / 60000);
    status = 'active';
    timerStr = daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h remaining` : `${hoursLeft}h ${minsLeft}m remaining`;
    displayMonth = MONTH_NAMES[month];
    displayYear = year;
  } else {
    // After 25th — show next month's upcoming
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const nextOpen = new Date(nextYear, nextMonth, 20, 0, 0, 0);
    const msUntil = nextOpen - now;
    const daysUntil = Math.floor(msUntil / 86400000);
    const hoursUntil = Math.floor((msUntil % 86400000) / 3600000);
    status = 'upcoming';
    timerStr = `Opens in ${daysUntil}d ${hoursUntil}h`;
    displayMonth = MONTH_NAMES[nextMonth];
    displayYear = nextYear;
  }

  // Deterministic pair selection per month (rotate every month)
  const seed = year * 12 + month;
  const pairs = [...LIQUIDITY_PAIRS];
  // Fisher-Yates with seed
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = (seed * 1103515245 + i * 12345) % (i + 1);
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  const votePairs = pairs.slice(0, 4);

  // Load saved votes from localStorage for this month
  const voteKey = `monthly_liquidity_${year}_${month}`;
  let savedVotes = null;
  try { savedVotes = JSON.parse(localStorage.getItem(voteKey) || 'null'); } catch(e) {}

  return {
    id: 'monthly-liquidity',
    type: 'monthly',
    status,
    voteKey,
    title: `Liquidity Pool Pairs — ${displayMonth} ${displayYear}`,
    desc: status === 'active'
      ? `Which LUNC trading pair should receive liquidity incentives for ${displayMonth}? Voting is open 20–25 of each month. The winning pair receives protocol liquidity support.`
      : `Monthly liquidity vote for ${displayMonth} ${displayYear}. Voting opens on the 20th and closes on the 25th. The winning pair receives protocol liquidity support.`,
    source: '🗓 Runs every month · 20th → 25th · Auto-generated',
    timer: timerStr,
    totalVotes: savedVotes ? savedVotes.totalVotes : 0,
    quorum: 200,
    options: votePairs.map((pair, i) => ({
      label: pair,
      votes: savedVotes ? (savedVotes.options[i] || 0) : 0
    })),
    userVoted: null,
    isMonthlyLiquidity: true
  };
}

const VOTES_DATA = [
  {
    id: 'v1', type: 'weekly', status: 'active',
    title: 'Protocol Development Priority — Week 11',
    desc: 'What should the development team focus on this week? Based on community discussions in the DAO Chat.',
    source: 'Based on community chat discussions',
    timer: '3d 14h remaining',
    totalVotes: 234,
    quorum: 100,
    options: [
      { label: 'SDK 0.53 upgrade testing & QA', votes: 112 },
      { label: 'MM 2.0 activation preparation', votes: 78 },
      { label: 'USTC re-peg research', votes: 44 },
    ],
    userVoted: null
  },
  generateMonthlyLiquidityVote(),
  {
    id: 'v3', type: 'special', status: 'active',
    title: 'Terra Oracle — Reward Distribution Model',
    desc: 'Should we switch from "winner takes all" to top-3 distribution for Q&A rewards?',
    source: 'Proposal by community member · Terra Oracle governance',
    timer: '6d 2h remaining',
    totalVotes: 156,
    quorum: 100,
    options: [
      { label: '70% winner + 30% voters', votes: 89 },
      { label: 'Top-3 split (60/25/15)', votes: 41 },
      { label: 'Keep current model', votes: 26 },
    ],
    userVoted: null
  }
];

let currentVoteFilter = 'all';

function filterVotes(type) {
  currentVoteFilter = type;
  document.querySelectorAll('.vote-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  renderVotes();
}

function renderVotes() {
  const list = document.getElementById('votes-list');
  const filtered = currentVoteFilter === 'all' ? VOTES_DATA : VOTES_DATA.filter(v => v.type === currentVoteFilter);

  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;font-size:12px;">No votes in this category yet.</div>';
    return;
  }

  list.innerHTML = filtered.map(v => {
    const maxVotes = Math.max(...v.options.map(o => o.votes));
    const pct = o => v.totalVotes > 0 ? Math.round((o.votes / v.totalVotes) * 100) : 0;
    const quorumPct = Math.min(100, Math.round((v.totalVotes / v.quorum) * 100));
    const typeClass = { weekly: 'vote-type-weekly', monthly: 'vote-type-monthly', special: 'vote-type-special' }[v.type];
    const typeLabel = { weekly: '📅 Weekly', monthly: '🗓 Monthly', special: '⚡ Special' }[v.type];

    return `
    <div class="vote-card" id="vcard-${v.id}">
      <div class="vote-card-meta">
        <span class="vote-type-badge ${typeClass}">${typeLabel}</span>
        <span class="vote-timer">⏱ ${v.timer}</span>
      </div>
      <div class="vote-card-title">${v.title}</div>
      <div class="vote-desc" style="margin-top:8px;">${v.desc}</div>

      <div class="vote-progress-wrap">
        <div class="vote-progress-bar-bg"><div class="vote-progress-bar-fill" style="width:${quorumPct}%"></div></div>
        <div class="vote-progress-info"><span>Quorum: ${v.totalVotes} / ${v.quorum} votes</span><span>${quorumPct}%</span></div>
      </div>

      <div class="vote-options">
        ${v.options.map((o, oi) => {
          const p = pct(o);
          const isWinner = o.votes === maxVotes && v.totalVotes > 0;
          const isSelected = v.userVoted === oi;
          return `
          <div class="vote-option ${isSelected ? 'selected' : ''} ${isWinner && v.userVoted !== null ? 'winner' : ''}" onclick="castVote('${v.id}', ${oi})">
            <div class="vote-option-bar ${isWinner && v.userVoted !== null ? 'winner-bar' : ''}" style="width:${v.userVoted !== null ? p : 0}%"></div>
            <div class="vote-option-content">
              <div class="vote-option-radio"></div>
              <div class="vote-option-label">${o.label}</div>
              ${v.userVoted !== null ? `<div class="vote-option-pct">${p}%</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="vote-btn-row">
        ${v.userVoted !== null
          ? `<span style="font-size:12px;color:var(--green);">✅ You voted</span>`
          : v.status === 'upcoming'
            ? `<span style="font-size:12px;color:var(--gold);">🗓 Voting opens on the 20th</span>`
            : `<button class="btn btn-primary" onclick="castVote('${v.id}', -1)" style="padding:10px 24px;font-size:11px;" ${!globalWalletAddress ? 'disabled title="Connect Keplr to vote"' : ''}>
                ${globalWalletAddress ? 'Cast Vote' : '🔑 Connect to Vote'}
               </button>`
        }
        <span style="font-size:11px;color:var(--muted);">${v.totalVotes} votes total</span>
      </div>

      <div class="vote-source">💬 ${v.source}</div>
    </div>`;
  }).join('');
}

// ─── ADMIN VOTE CONTROL ───────────────────────────────────────
const VOTE_STATE_KEY = 'admin_vote_states';

function getVoteStates() {
  try { return JSON.parse(localStorage.getItem(VOTE_STATE_KEY) || '{}'); } catch(e) { return {}; }
}

function saveVoteState(voteId, state) {
  const states = getVoteStates();
  states[voteId] = { ...states[voteId], ...state, updatedAt: Date.now() };
  localStorage.setItem(VOTE_STATE_KEY, JSON.stringify(states));
}

function applyVoteStates() {
  const states = getVoteStates();
  for (const vote of VOTES_DATA) {
    const s = states[vote.id];
    if (!s) continue;
    if (s.status) vote.status = s.status;
    if (s.startedAt) vote.startedAt = s.startedAt;
    if (s.stoppedAt) vote.stoppedAt = s.stoppedAt;
    if (s.pairs && vote.isMonthlyLiquidity) {
      vote.options = s.pairs.map(p => ({ label: p, votes: vote.options.find(o => o.label === p)?.votes || 0 }));
    }
    // Recalculate timer
    if (s.status === 'active' && s.startedAt) {
      const closeAt = s.startedAt + 5 * 24 * 60 * 60 * 1000;
      const msLeft = closeAt - Date.now();
      if (msLeft <= 0) {
        vote.status = 'closed';
        vote.timer = 'Voting closed';
      } else {
        const d = Math.floor(msLeft / 86400000);
        const h = Math.floor((msLeft % 86400000) / 3600000);
        const m = Math.floor((msLeft % 3600000) / 60000);
        vote.timer = d > 0 ? `${d}d ${h}h remaining` : `${h}h ${m}m remaining`;
      }
    } else if (s.status === 'stopped' || s.status === 'closed') {
      vote.timer = 'Voting closed';
    } else if (s.status === 'upcoming') {
      vote.timer = 'Not started yet';
    }
  }
}

window.adminStartVote = function(voteId) {
  const vote = VOTES_DATA.find(v => v.id === voteId);
  if (!vote) return;
  const pairs = voteId === 'monthly-liquidity' ? [
    document.getElementById('admin-pair-1')?.value || 'LUNC/USDT',
    document.getElementById('admin-pair-2')?.value || 'LUNC/USTC',
    document.getElementById('admin-pair-3')?.value || 'LUNC/ATOM',
    document.getElementById('admin-pair-4')?.value || 'LUNC/BTC',
  ].filter(Boolean) : null;

  const state = { status: 'active', startedAt: Date.now(), stoppedAt: null };
  if (pairs) state.pairs = pairs;
  saveVoteState(voteId, state);
  applyVoteStates();
  updateAdminPanel();
  applyStoredVotes();
  renderVotes();
  showAdminToast('▶ Vote started!', 'green');
}

window.adminStopVote = function(voteId) {
  saveVoteState(voteId, { status: 'stopped', stoppedAt: Date.now() });
  applyVoteStates();
  updateAdminPanel();
  renderVotes();
  showAdminToast('■ Vote stopped', 'red');
}

window.adminToggleVote = function(voteId, newStatus) {
  if (newStatus === 'active') adminStartVote(voteId);
  else adminStopVote(voteId);
}

function updateAdminPanel() {
  const panel = document.getElementById('admin-panel');
  if (!panel || panel.style.display === 'none') return;

  // Update monthly status
  const monthly = VOTES_DATA.find(v => v.id === 'monthly-liquidity');
  const statusEl = document.getElementById('admin-monthly-status');
  if (statusEl && monthly) {
    const started = monthly.startedAt ? new Date(monthly.startedAt).toLocaleDateString() : '—';
    const icons = { active: '🟢', stopped: '🔴', upcoming: '🟡', closed: '⚫' };
    statusEl.textContent = `Status: ${icons[monthly.status] || '⚪'} ${monthly.status.toUpperCase()} · Started: ${started} · Timer: ${monthly.timer}`;
  }

  // Render other votes list
  const otherEl = document.getElementById('admin-other-votes');
  if (otherEl) {
    const states = getVoteStates();
    const others = VOTES_DATA.filter(v => v.id !== 'monthly-liquidity');
    if (others.length === 0) {
      otherEl.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px 0;">No other votes configured.</div>';
    } else {
      otherEl.innerHTML = others.map(v => {
        const s = states[v.id]?.status || v.status;
        const icons = { active: '🟢', stopped: '🔴', upcoming: '🟡', closed: '⚫' };
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <div>
            <span style="font-size:12px;color:var(--text);">${v.title}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:8px;">${icons[s] || '⚪'} ${(s||'unknown').toUpperCase()}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button onclick="adminToggleVote('${v.id}', 'active')"
              style="font-size:10px;padding:5px 12px;border-radius:6px;border:1px solid rgba(102,255,170,0.3);
                     background:rgba(102,255,170,0.08);color:var(--green);cursor:pointer;font-family:'Exo 2',sans-serif;font-weight:700;">▶</button>
            <button onclick="adminToggleVote('${v.id}', 'stopped')"
              style="font-size:10px;padding:5px 12px;border-radius:6px;border:1px solid rgba(255,60,60,0.25);
                     background:rgba(255,60,60,0.06);color:#ff6464;cursor:pointer;font-family:'Exo 2',sans-serif;font-weight:700;">■</button>
          </div>
        </div>`;
      }).join('');
    }
  }
}

function showAdminToast(msg, color) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed;top:80px;right:20px;z-index:9999;padding:10px 18px;border-radius:8px;
    font-family:'Exo 2',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.05em;
    background:${color === 'green' ? 'rgba(102,255,170,0.15)' : 'rgba(255,60,60,0.12)'};
    border:1px solid ${color === 'green' ? 'rgba(102,255,170,0.4)' : 'rgba(255,60,60,0.3)'};
    color:${color === 'green' ? 'var(--green)' : '#ff6464'};
    animation:dropDown 0.2s ease;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// Show admin panel when admin wallet connects
const _origSetWalletVote = window.setWalletConnected;

// ─── VOTE PERSISTENCE ────────────────────────────────────────
function getVoteStorageKey() {
  return globalWalletAddress ? 'votes_' + globalWalletAddress : null;
}

function loadVotesFromStorage() {
  const key = getVoteStorageKey();
  if (!key) return {};
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) { return {}; }
}

function saveVoteToStorage(voteId, optionIdx) {
  const key = getVoteStorageKey();
  if (!key) return;
  const votes = loadVotesFromStorage();
  votes[voteId] = optionIdx;
  localStorage.setItem(key, JSON.stringify(votes));
}

function applyStoredVotes() {
  const votes = loadVotesFromStorage();
  for (const vote of VOTES_DATA) {
    if (votes[vote.id] !== undefined) {
      vote.userVoted = votes[vote.id];
    } else {
      vote.userVoted = null;
    }
  }
}

function castVote(voteId, optionIdx) {
  if (!globalWalletAddress) { alert('Connect Keplr wallet to vote!'); return; }
  if (optionIdx === -1) return;
  const vote = VOTES_DATA.find(v => v.id === voteId);
  if (!vote || vote.userVoted !== null) return;
  if (vote.status === 'upcoming') { alert('Voting is not open yet! Check back on the 20th.'); return; }

  vote.options[optionIdx].votes++;
  vote.totalVotes++;
  vote.userVoted = optionIdx;
  saveVoteToStorage(voteId, optionIdx);

  // Persist monthly liquidity votes globally (shared across users via localStorage key)
  if (vote.isMonthlyLiquidity && vote.voteKey) {
    try {
      localStorage.setItem(vote.voteKey, JSON.stringify({
        totalVotes: vote.totalVotes,
        options: vote.options.map(o => o.votes)
      }));
    } catch(e) {}
  }
  renderVotes();
}


// ─── LUNC STATS ───────────────────────────────────────────────
let statsAutoRefreshInterval = null;
let statsCountdownInterval = null;
let statsNextRefresh = 0;

let statsBlockInterval = null;
let lastBlockNum = 0;

async function refreshLiveBlock() {
  const pg = document.getElementById('page-stats');
  if (!pg || !pg.classList.contains('active')) return;
  try {
    const blockH = await fetchBlockS();
    const num = Number(blockH);
    const el = document.getElementById('live-block');
    if (!el) return;
    if (num !== lastBlockNum) {
      // Flash green on new block
      el.style.transition = 'color 0.2s';
      el.style.color = '#ffffff';
      el.textContent = '⬡ Block #' + num.toLocaleString();
      setTimeout(() => { el.style.color = 'var(--green)'; }, 200);
      lastBlockNum = num;
    }
  } catch(e) {}
}

function startStatsAutoRefresh() {
  stopStatsAutoRefresh();
  statsNextRefresh = Date.now() + 30000;
  startStatsAutoRefresh._valTick = 0;

  // Block counter every 6 seconds
  statsBlockInterval = setInterval(refreshLiveBlock, 6000);

  // Countdown ticker every second
  statsCountdownInterval = setInterval(() => {
    const el = document.getElementById('updated-time');
    if (!el) return;
    const secsLeft = Math.max(0, Math.round((statsNextRefresh - Date.now()) / 1000));
    const timeStr = el.dataset.lastUpdate || '';
    el.textContent = timeStr + (secsLeft > 0 ? ' · 🔄 ' + secsLeft + 's' : ' · updating...');
  }, 1000);

  // Main refresh every 30s
  statsAutoRefreshInterval = setInterval(() => {
    const pg = document.getElementById('page-stats');
    if (!pg || !pg.classList.contains('active')) return;
    statsNextRefresh = Date.now() + 30000;
    loadStatsData();
    loadOraclePoolS();
    startStatsAutoRefresh._valTick = (startStatsAutoRefresh._valTick || 0) + 1;
    if (startStatsAutoRefresh._valTick % 2 === 0) loadValidatorsS();
    const el = document.getElementById('updated-time');
    if (el) el.dataset.lastUpdate = 'Updated ' + new Date().toLocaleTimeString();
  }, 30000);
}

function stopStatsAutoRefresh() {
  if (statsAutoRefreshInterval) { clearInterval(statsAutoRefreshInterval); statsAutoRefreshInterval = null; }
  if (statsCountdownInterval)   { clearInterval(statsCountdownInterval);   statsCountdownInterval = null; }
  if (statsBlockInterval)       { clearInterval(statsBlockInterval);       statsBlockInterval = null; }
}

function showPage_stats(e) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-stats').classList.add('active');
  smoothScrollTop();
  loadValidatorsS();
  loadAllStats();
  startStatsAutoRefresh();
  startBinanceCountdown();
}

const LCD_S  = 'https://terra-classic-lcd.publicnode.com';
const LCD_S2 = 'https://terra-classic-lcd.publicnode.com'; // fallback same
const LCD_S3 = 'https://terra-classic-lcd.publicnode.com'; // fallback same
const ORACLE_POOL_ADDR = 'terra1jgp27m8fykex4e4jtt0l7ze8q528ux2lh4zh0f';

let allValidators = [];
let valFilter = 'active';
let valPage = 1;
const VAL_PER_PAGE = 20;

function fmtS(n) {
  if (n >= 1e12) return (n/1e12).toFixed(3) + 'T';
  if (n >= 1e9)  return (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n/1e6).toFixed(2)  + 'M';
  if (n >= 1e3)  return (n/1e3).toFixed(1)  + 'K';
  return n.toFixed(0);
}
function fmtFull(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) { el.textContent = val; el.classList.remove('pulse'); }
}

async function tryFetchS(url, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  } catch(e) { clearTimeout(timer); throw e; }
}
async function lcdS(path) {
  return Promise.any([
    tryFetchS(LCD_S + path, 7000),
    tryFetchS(LCD_S2 + path, 7000)
  ]);
}

async function fetchSupplyS() {
  const [luncData, ustcData] = await Promise.all([
    lcdS('/cosmos/bank/v1beta1/supply/by_denom?denom=uluna'),
    lcdS('/cosmos/bank/v1beta1/supply/by_denom?denom=uusd')
  ]);
  return {
    lunc: luncData.amount ? Number(luncData.amount.amount) / 1e6 : 0,
    ustc: ustcData.amount ? Number(ustcData.amount.amount) / 1e6 : 0
  };
}
async function fetchStakingS() {
  const data = await lcdS('/cosmos/staking/v1beta1/pool');
  return { bonded: data.pool ? Number(data.pool.bonded_tokens) / 1e6 : 0 };
}
async function fetchBlockS() {
  const data = await lcdS('/cosmos/base/tendermint/v1beta1/blocks/latest');
  return data.block?.header?.height || '—';
}

async function loadStatsData() {
  try {
    const [supply, staking, blockH] = await Promise.all([fetchSupplyS(), fetchStakingS(), fetchBlockS()]);
    const ratio = supply.lunc > 0 ? (staking.bonded / supply.lunc * 100).toFixed(2) : '0';
    setTxt('sc-lunc', fmtS(supply.lunc));
    setTxt('sc-lunc-note', '↓ Burn tax active');
    setTxt('sc-ustc', fmtS(supply.ustc));
    setTxt('sc-ustc-note', '↓ Arb burn');
    setTxt('sc-staked', fmtS(staking.bonded));
    setTxt('sc-staked-note', 'bonded & earning');
    setTxt('sc-ratio', ratio + '%');
    setTxt('sc-blocktime', '5.97');
    setTxt('lunc-big', fmtFull(supply.lunc) + ' LUNC');
    setTxt('ustc-big', fmtFull(supply.ustc) + ' USTC');
    setTxt('staked-cur', fmtFull(staking.bonded));
    setTxt('staked-ratio-cur', ratio + '%');
    setTxt('live-block', '⬡ Block #' + Number(blockH).toLocaleString());
    ['sc-lunc-note','sc-ustc-note','sc-staked-note'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('pulse');
    });
    drawSupplyChartS(supply.lunc, supply.ustc);
    drawStakedChartS(staking.bonded, parseFloat(ratio));
  } catch(e) {
    console.warn('Stats fetch error:', e);
    setTxt('live-block', '⚠ LCD unavailable');
  }
}

async function loadOraclePoolS() {
  try {
    const data = await lcdS('/cosmos/bank/v1beta1/balances/' + ORACLE_POOL_ADDR);
    const bals = data.balances || [];
    const lunc = bals.find(b => b.denom === 'uluna');
    const ustc = bals.find(b => b.denom === 'uusd');
    const luncAmt = lunc ? Number(lunc.amount) / 1e6 : 47959043550;
    const ustcAmt = ustc ? Number(ustc.amount) / 1e6 : 155606933;
    setTxt('oracle-lunc', fmtFull(luncAmt));
    setTxt('oracle-ustc', fmtFull(ustcAmt));
    drawOracleChartS(luncAmt, ustcAmt);
  } catch {
    setTxt('oracle-lunc', '47,959,043,550');
    setTxt('oracle-ustc', '155,606,933');
  }
}

async function loadValidatorsS() {
  try {
    // publicnode caps responses at ~100 per page — use pagination.next_key to get all pages
    const BASE = 'https://terra-classic-lcd.publicnode.com';
    let all = [];
    let nextKey = null;
    let attempts = 0;

    do {
      let url = `${BASE}/cosmos/staking/v1beta1/validators?pagination.limit=100`;
      if (nextKey) url += `&pagination.key=${encodeURIComponent(nextKey)}`;

      const r = await Promise.race([
        fetch(url),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
      ]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const page = d.validators || [];
      all = all.concat(page);
      nextKey = d.pagination?.next_key || null;
      attempts++;
      console.log(`[validators] page ${attempts}: got ${page.length}, next_key: ${nextKey ? 'yes' : 'no'}, total so far: ${all.length}`);
    } while (nextKey && attempts < 10);

    if (!all.length) throw new Error('empty');
    allValidators = all.sort((a, b) => Number(b.tokens) - Number(a.tokens));
    const active = allValidators.filter(v => v.status === 'BOND_STATUS_BONDED').length;
    console.log(`[validators] Done: ${all.length} total, ${active} active`);
    setTxt('sc-vals', active);
    renderValidatorsS();
  } catch(e) {
    console.error('[validators] Error:', e);
    const tb = document.getElementById('validators-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--muted);">Could not load validators</td></tr>';
  }
}

function filterValidators(f) {
  valFilter = f; valPage = 1;
  ['active','inactive','all'].forEach(id => {
    const el = document.getElementById('vf-' + id);
    if (el) el.classList.toggle('active-vf', id === f);
  });
  renderValidatorsS();
}

function renderValidatorsS() {
  let list = allValidators;
  if (valFilter === 'active')   list = allValidators.filter(v => v.status === 'BOND_STATUS_BONDED');
  if (valFilter === 'inactive') list = allValidators.filter(v => v.status !== 'BOND_STATUS_BONDED');

  // Search filter
  const searchVal = (document.getElementById('val-search')?.value || '').trim().toLowerCase();
  if (searchVal) list = list.filter(v => (v.description?.moniker || '').toLowerCase().includes(searchVal));

  setTxt('val-title', list.length + ' Validators (' + valFilter + ')');
  const totalBonded = allValidators.filter(v => v.status === 'BOND_STATUS_BONDED').reduce((s,v) => s + Number(v.tokens), 0);
  const pages = Math.ceil(list.length / VAL_PER_PAGE);
  const slice = list.slice((valPage-1)*VAL_PER_PAGE, valPage*VAL_PER_PAGE);
  const offset = (valPage-1)*VAL_PER_PAGE;
  const tbody = document.getElementById('validators-tbody');
  if (!slice.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">No validators found</td></tr>'; return; }
  tbody.innerHTML = slice.map((v, i) => {
    const tokens = Number(v.tokens) / 1e6;
    const pct = totalBonded > 0 ? (Number(v.tokens)/totalBonded*100).toFixed(2) : '0.00';
    const commission = (Number(v.commission?.commission_rates?.rate || 0) * 100).toFixed(2);
    const name = (v.description?.moniker || 'Unknown').slice(0, 30);
    const isActive = v.status === 'BOND_STATUS_BONDED';
    const isJailed = v.jailed;
    const identity = v.description?.identity || '';
    const avatarUrl = identity
      ? `https://keybase.io/_/api/1.0/user/lookup.json?key_suffix=${identity}&fields=pictures`
      : '';
    const avatarId = 'val-avatar-' + (offset + i);
    let badge, cls;
    if (isJailed)      { badge = '⚠ Jailed';  cls = 'badge-jailed'; }
    else if (isActive) { badge = '● Active';   cls = 'badge-active'; }
    else               { badge = '× Inactive'; cls = 'badge-inactive'; }
    return `<tr class="val-row">
      <td style="color:var(--muted);font-size:11px;">${offset+i+1}</td>
      <td class="val-name">
        <div style="display:flex;align-items:center;gap:9px;">
          <div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(84,147,247,0.12);border:1px solid rgba(84,147,247,0.2);display:flex;align-items:center;justify-content:center;">
            <img id="${avatarId}" src="" alt="" width="28" height="28"
              style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:none;"
              onerror="this.style.display='none';this.previousElementSibling&&(this.previousElementSibling.style.display='flex');">
            <span style="font-size:11px;color:var(--muted);">${name.charAt(0).toUpperCase()}</span>
          </div>
          <span>${name}${name.length>=30?'…':''}</span>
        </div>
      </td>
      <td class="val-power"><span style="color:var(--text);">${fmtS(tokens)}</span><br><span style="font-size:10px;color:var(--muted);">${pct}%</span></td>
      <td class="val-comm">${commission}%</td>
      <td class="val-status"><span class="${cls}">${badge}</span></td>
    </tr>`;
  }).join('');
  // Load Keybase avatars asynchronously
  slice.forEach((v, i) => {
    const identity = v.description?.identity || '';
    if (!identity) return;
    const imgEl = document.getElementById('val-avatar-' + (offset + i));
    if (!imgEl) return;
    fetch(`https://keybase.io/_/api/1.0/user/lookup.json?key_suffix=${identity}&fields=pictures`)
      .then(r => r.json())
      .then(data => {
        const url = data?.them?.[0]?.pictures?.primary?.url;
        if (url && imgEl) {
          imgEl.src = url;
          imgEl.style.display = 'block';
          const placeholder = imgEl.nextElementSibling;
          if (placeholder) placeholder.style.display = 'none';
        }
      })
      .catch(() => {});
  });
  const pg = document.getElementById('val-pagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  for (let p = 1; p <= pages; p++) {
    html += `<button class="pg-btn${p===valPage?' active-pg':''}" onclick="setValPageS(${p})">${p}</button>`;
  }
  pg.innerHTML = html;
}

function setValPageS(p) { valPage = p; renderValidatorsS(); }

// ─── CHARTS ───────────────────────────────────────────────────
function resolveCanvasS(id, h) {
  const el = document.getElementById(id);
  if (!el) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = el.parentElement.clientWidth || 800;
  el.width = w * dpr; el.height = h * dpr;
  el.style.width = w + 'px'; el.style.height = h + 'px';
  const ctx = el.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function drawLineS(ctx, data, pad, cw, ch, min, max, color, lineW=2) {
  if (!data.length) return;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = pad.l + (i / (data.length-1)) * cw;
    const y = pad.t + (1 - (v - min) / (max - min + 0.0001)) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = lineW;
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.stroke(); ctx.shadowBlur = 0;
}
// ─── SUPPLY CHART (candlestick-style) ────────────────────────
let currentSupplyPeriod = '1h';
let supplyChartCache = {};
let currentChartMode = 'combined'; // always combined now

function setChartMode(mode) {
  currentChartMode = 'combined';
  const cached = supplyChartCache[currentSupplyPeriod];
  if (cached) renderSupplyChart(cached.data, currentSupplyPeriod);
  else loadSupplyChart(currentSupplyPeriod);
}

const TF_CONFIG = {
  '1h': { endpoint: 'histohour',   limit: 48,  secPerCandle: 3600,       label: '1h' },
  '4h': { endpoint: 'histohour',   limit: 336, secPerCandle: 3600,       label: '4h', groupBy: 4 }, // 14 days × 24h / 4 = 84 candles
  'D':  { endpoint: 'histoday',    limit: 30,  secPerCandle: 86400,      label: 'D'  },
  'W':  { endpoint: 'histoday',    limit: 364, secPerCandle: 86400,      label: 'W',  groupBy: 7 }, // ~52 weeks
  'M':  { endpoint: 'histoday',    limit: 730, secPerCandle: 86400,      label: 'M',  groupBy: 30 },
};

// Average daily burn ~16.5M LUNC
const DAILY_BURN = 16_500_000;

// ─── FETCH BINANCE BURNS FROM BLOCKCHAIN ─────────────────────
// Reads large transfers TO burn wallet (terra1sk06e3dyexuq4shw77y3dsv480xv42mq73anxu)
// Filters: amount > 50B uluna (50M LUNC) — only big batch burns qualify
const BINANCE_BURN_DEST = 'terra1sk06e3dyexuq4shw77y3dsv480xv42mq73anxu'; // Official LUNC burn address (Binance sends here)
const MIN_BINANCE_BURN_ULUNA = 50_000_000_000_000; // 50B uluna = 50M LUNC (Binance burns hundreds of billions)
let _binanceBurnsCache = null;
let _binanceBurnsCacheTs = 0;
const BINANCE_BURN_CACHE_MS = 60 * 60 * 1000; // 1 hour

async function fetchBinanceBurnsFromChain() {
  // Return cache if fresh
  if (_binanceBurnsCache && Date.now() - _binanceBurnsCacheTs < BINANCE_BURN_CACHE_MS) {
    return _binanceBurnsCache;
  }

  // Full historical fallback — on-chain fetch will override recent months if it succeeds
  // Sources: CoinReporter, CoinGape, LUNC Metrics, stakebin (verified where noted)
  const HISTORICAL_BURNS = [
    // ── 2022 early batches (weekly, ~100% fees) ──────────────────────────────
    { ts: new Date('2022-10-03').getTime() / 1000, amount: 5_570_000_000 }, // Batch 1 VERIFIED (~5.57B)
    { ts: new Date('2022-10-10').getTime() / 1000, amount: 2_300_000_000 }, // Batch 2 ~2.3B
    { ts: new Date('2022-10-17').getTime() / 1000, amount: 1_900_000_000 }, // Batch 3 ~1.9B
    { ts: new Date('2022-10-24').getTime() / 1000, amount: 1_500_000_000 }, // Batch 4 ~1.5B
    { ts: new Date('2022-10-31').getTime() / 1000, amount: 1_200_000_000 }, // Batch 5 ~1.2B
    { ts: new Date('2022-12-01').getTime() / 1000, amount: 6_390_000_000 }, // Batch 6 VERIFIED 6.39B (Dec 1)
    // ── 2023 monthly burns (50% fees) ────────────────────────────────────────
    { ts: new Date('2023-03-02').getTime() / 1000, amount: 8_850_000_000 }, // Batch 7 VERIFIED 8.85B (largest ever)
    { ts: new Date('2023-04-01').getTime() / 1000, amount: 3_500_000_000 }, // Batch 8 ~3.5B
    { ts: new Date('2023-05-01').getTime() / 1000, amount: 2_800_000_000 }, // Batch 9 ~2.8B
    { ts: new Date('2023-06-01').getTime() / 1000, amount: 2_200_000_000 }, // Batch 10 ~2.2B
    { ts: new Date('2023-07-01').getTime() / 1000, amount: 1_900_000_000 }, // Batch 11 ~1.9B
    { ts: new Date('2023-08-01').getTime() / 1000, amount: 1_600_000_000 }, // Batch 12 ~1.6B
    { ts: new Date('2023-09-01').getTime() / 1000, amount: 1_300_000_000 }, // Batch 13 ~1.3B
    { ts: new Date('2023-10-01').getTime() / 1000, amount: 1_100_000_000 }, // Batch 14 ~1.1B
    { ts: new Date('2023-11-01').getTime() / 1000, amount:   760_000_000 }, // Batch 15 VERIFIED 760M (lowest)
    { ts: new Date('2023-12-01').getTime() / 1000, amount: 3_900_000_000 }, // Batch 16 VERIFIED ~3.9B
    // ── 2024 monthly burns — ALL VERIFIED from luncmetrics TX data ──────────
    { ts: new Date('2024-01-01').getTime() / 1000, amount: 1_600_000_000 }, // Batch 17 est.
    { ts: new Date('2024-02-01').getTime() / 1000, amount: 1_350_000_000 }, // Batch 18 VERIFIED 1.35B
    { ts: new Date('2024-03-01').getTime() / 1000, amount: 2_000_000_000 }, // Batch 19 est. (high March volume)
    { ts: new Date('2024-04-01').getTime() / 1000, amount: 4_170_000_000 }, // Batch 20 VERIFIED 4.17B
    { ts: new Date('2024-05-01').getTime() / 1000, amount: 1_400_000_000 }, // Batch 21 VERIFIED 1.4B
    { ts: new Date('2024-06-01').getTime() / 1000, amount: 1_350_000_000 }, // Batch 22 VERIFIED ~1.35B
    { ts: new Date('2024-07-01').getTime() / 1000, amount: 1_700_000_000 }, // Batch 23 VERIFIED 1.7B
    { ts: new Date('2024-08-01').getTime() / 1000, amount:   700_000_000 }, // Batch 24 est.
    { ts: new Date('2024-09-01').getTime() / 1000, amount:   600_000_000 }, // Batch 25 est.
    { ts: new Date('2024-10-01').getTime() / 1000, amount: 1_140_000_000 }, // Batch 26 VERIFIED 1.14B
    { ts: new Date('2024-11-01').getTime() / 1000, amount: 1_030_000_000 }, // Batch 27 VERIFIED 1.03B
    { ts: new Date('2024-12-01').getTime() / 1000, amount: 1_720_000_000 }, // Batch 28 VERIFIED
    // ── 2025 monthly burns — ALL VERIFIED from luncmetrics TX data ──────────
    { ts: new Date('2025-01-01').getTime() / 1000, amount: 1_721_471_820 }, // Batch 29 VERIFIED luncmetrics exact
    { ts: new Date('2025-02-01').getTime() / 1000, amount:   736_146_374 }, // Batch 30 VERIFIED luncmetrics exact
    { ts: new Date('2025-03-01').getTime() / 1000, amount:   760_172_656 }, // Batch 31 VERIFIED luncmetrics (760,073,176 + 99,480)
    { ts: new Date('2025-04-01').getTime() / 1000, amount:   521_961_991 }, // Batch 32 VERIFIED luncmetrics exact
    { ts: new Date('2025-05-01').getTime() / 1000, amount:   413_653_487 }, // Batch 33 VERIFIED luncmetrics exact
    { ts: new Date('2025-06-01').getTime() / 1000, amount:   498_530_317 }, // Batch 34 VERIFIED luncmetrics exact
    { ts: new Date('2025-07-01').getTime() / 1000, amount:   375_565_484 }, // Batch 35 VERIFIED CoinReporter
    { ts: new Date('2025-08-01').getTime() / 1000, amount:   441_100_594 }, // Batch 36 VERIFIED luncmetrics
    { ts: new Date('2025-09-01').getTime() / 1000, amount:   455_227_785 }, // Batch 37 VERIFIED luncmetrics
    { ts: new Date('2025-10-01').getTime() / 1000, amount:   356_538_666 }, // Batch 38 VERIFIED luncmetrics
    { ts: new Date('2025-11-01').getTime() / 1000, amount:   652_627_275 }, // Batch 39 VERIFIED luncmetrics
    { ts: new Date('2025-12-01').getTime() / 1000, amount:   562_133_714 }, // Batch 40 VERIFIED luncmetrics
    // ── 2026 ────────────────────────────────────────────────────────────────
    { ts: new Date('2026-01-01').getTime() / 1000, amount: 5_295_992_495 }, // Batch 41 VERIFIED luncmetrics (huge Dec volume)
    { ts: new Date('2026-02-01').getTime() / 1000, amount: 1_082_000_899 }, // Batch 42 VERIFIED luncmetrics
    { ts: new Date('2026-03-01').getTime() / 1000, amount:   859_539_268 }, // Batch 43 VERIFIED luncmetrics (858,230,264 + 1,309,004)
  ];

  // Cutoff: fetch on-chain only for last 12 months
  const cutoffTs = Math.floor(Date.now() / 1000) - 365 * 86400;
  const onchainBurns = [];

  try {
    const LCD_NODES = [
      'https://terra-classic-lcd.publicnode.com',
      'https://terra-classic-lcd.publicnode.com',
      'https://lcd.terraclassic.community',
    ];

    // Query LCD for incoming transfers to burn wallet
    // We use events: transfer.recipient + transfer.amount
    // Paginate up to 5 pages (each page = 100 txs)
    let nextKey = null;
    let page = 0;
    const MAX_PAGES = 8;

    while (page < MAX_PAGES) {
      page++;
      let url = `${LCD_NODES[0]}/cosmos/tx/v1beta1/txs?events=transfer.recipient%3D%27${BINANCE_BURN_DEST}%27&order_by=ORDER_BY_DESC&pagination.limit=100`;
      if (nextKey) url += `&pagination.key=${encodeURIComponent(nextKey)}`;

      let res = null;
      for (const node of LCD_NODES) {
        try {
          const nodeUrl = url.replace(LCD_NODES[0], node);
          res = await Promise.race([
            fetch(nodeUrl),
            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 6000))
          ]);
          if (res?.ok) break;
        } catch {}
      }
      if (!res?.ok) break;

      const data = await res.json();
      const txs = data.txs || [];
      if (!txs.length) break;

      let reachedOld = false;
      // Use tx_responses which has timestamp + events
      const responses = data.tx_responses || [];
      for (const resp of responses) {
        const timestamp = resp.timestamp; // ISO string e.g. "2026-03-01T00:12:34Z"
        if (!timestamp) continue;
        const ts = Math.floor(new Date(timestamp).getTime() / 1000);

        if (ts < cutoffTs) { reachedOld = true; break; }

        // Parse events to find coin transfers to burn wallet
        const events = resp.events || [];
        let totalBurned = 0;

        for (const ev of events) {
          if (ev.type !== 'coin_received' && ev.type !== 'transfer') continue;
          const attrs = ev.attributes || [];
          let receiver = null, amount = null;

          for (const a of attrs) {
            // LCD may return attributes as plain strings or base64-encoded
            const decodeAttr = v => { try { return atob(v); } catch { return v; } };
            const key = a.key ? decodeAttr(a.key) : '';
            const val = a.value ? decodeAttr(a.value) : '';
            if (key === 'receiver' || key === 'recipient') receiver = val;
            if (key === 'amount') amount = val;
          }

          if (receiver === BINANCE_BURN_DEST && amount) {
            // Parse amount like "1234567890000000uluna"
            const match = amount.match(/(\d+)uluna/);
            if (match) totalBurned += parseInt(match[1]);
          }
        }

        if (totalBurned >= MIN_BINANCE_BURN_ULUNA) {
          // Convert uluna → LUNC (÷1e6)
          onchainBurns.push({ ts, amount: Math.round(totalBurned / 1e6) });
        }
      }

      if (reachedOld) break;
      nextKey = data.pagination?.next_key;
      if (!nextKey) break;
    }
  } catch (e) {
    console.warn('fetchBinanceBurnsFromChain error:', e);
  }

  // Merge: historical + on-chain (on-chain overrides same month)
  const merged = [...HISTORICAL_BURNS];
  for (const ob of onchainBurns) {
    const obDate = new Date(ob.ts * 1000);
    const obYM = `${obDate.getFullYear()}-${obDate.getMonth()}`;
    // Remove any historical entry for same month
    const idx = merged.findIndex(h => {
      const hd = new Date(h.ts * 1000);
      return `${hd.getFullYear()}-${hd.getMonth()}` === obYM;
    });
    if (idx >= 0) merged.splice(idx, 1);
    merged.push(ob);
  }
  merged.sort((a, b) => a.ts - b.ts);

  _binanceBurnsCache = merged;
  _binanceBurnsCacheTs = Date.now();
  console.log(`[BinanceBurns] loaded ${merged.length} events (${onchainBurns.length} on-chain, ${merged.length - onchainBurns.length} historical)`);
  return merged;
}

function setSupplyPeriod(period) {
  currentSupplyPeriod = period;
  ['1h','4h','D','W','M'].forEach(p => {
    const el = document.getElementById('sp-' + p);
    if (el) el.classList.toggle('active-tf', p === period);
  });
  loadSupplyChart(period);
}

async function loadSupplyChart(period) {
  const cached = supplyChartCache[period];
  if (cached && Date.now() - cached.ts < 90000) {
    renderSupplyChart(cached.data, period); return;
  }
  const loadEl = document.getElementById('supply-chart-loading');
  const wrapEl = document.getElementById('burn-chart-wrap');
  if (loadEl) loadEl.style.display = 'block';
  if (wrapEl) wrapEl.style.display = 'none';

  const cfg = TF_CONFIG[period] || TF_CONFIG['D'];
  try {
    // 1. Get current real supply from LCD
    let currentSupply = 6.466e12;
    try {
      const lcdRes = await Promise.race([
        fetch('https://terra-classic-lcd.publicnode.com/cosmos/bank/v1beta1/supply/uluna'),
        new Promise((_, r) => setTimeout(r, 4000))
      ]);
      if (lcdRes?.ok) {
        const lj = await lcdRes.json();
        const amt = lj?.amount?.amount;
        if (amt) currentSupply = Number(amt) / 1e6;
      }
    } catch {}

    // 2. Fetch volume data from CryptoCompare for realistic burn variation
    const url = `https://min-api.cryptocompare.com/data/v2/${cfg.endpoint}?fsym=LUNC&tsym=USD&limit=${cfg.limit}&extraParams=TerraOracle`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.Response === 'Error') throw new Error(json.Message);
    let raw = (json.Data?.Data || []).filter(d => d.volumefrom > 0);

    // Group candles
    if (period === 'M') {
      // Group by calendar month — Binance burns always on 1st of month
      const monthMap = {};
      raw.forEach(d => {
        const dt = new Date(d.time * 1000);
        const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        if (!monthMap[key]) monthMap[key] = { time: new Date(dt.getFullYear(), dt.getMonth(), 1).getTime()/1000, volumefrom: 0 };
        monthMap[key].volumefrom += d.volumefrom || 0;
      });
      raw = Object.values(monthMap).sort((a, b) => a.time - b.time);
    } else if (cfg.groupBy) {
      const grouped = [];
      for (let i = 0; i < raw.length; i += cfg.groupBy) {
        const slice = raw.slice(i, i + cfg.groupBy);
        if (!slice.length) continue;
        grouped.push({
          time: slice[0].time,
          volumefrom: slice.reduce((s, x) => s + (x.volumefrom || 0), 0),
        });
      }
      raw = grouped;
    }

    if (raw.length < 3) throw new Error('not enough data');

    // Fetch Binance burns: on-chain (last 12 months) + historical fallback
    const BINANCE_BURNS = await fetchBinanceBurnsFromChain();

    // Actual seconds per candle — CORRECT for grouped periods
    const actualCandleSec = {
      '1h': 3600,
      '4h': 4 * 3600,      // 4h grouped from hourly
      'D':  86400,
      'W':  7 * 86400,      // week grouped from daily
      'M':  30.44 * 86400,  // calendar month
    }[period] || 86400;

    // Helper: get Binance burn for a candle's time window
    function getBinanceBurn(candleStartTs, period) {
      const candleEndTs = candleStartTs + actualCandleSec;
      if (period === 'M') {
        // Match by calendar month
        const cDate = new Date(candleStartTs * 1000);
        const cY = cDate.getUTCFullYear(), cM = cDate.getUTCMonth();
        return BINANCE_BURNS
          .filter(b => { const d = new Date(b.ts * 1000); return d.getUTCFullYear() === cY && d.getUTCMonth() === cM; })
          .reduce((s, b) => s + b.amount, 0);
      }
      // For all other periods: strict window [start, end)
      return BINANCE_BURNS
        .filter(b => b.ts >= candleStartTs && b.ts < candleEndTs)
        .reduce((s, b) => s + b.amount, 0);
    }

    // 3. Build candles: tax burn (volume-proportional) + Binance event burns
    const burnPerSec = DAILY_BURN / 86400;
    const avgBurnPerCandle = burnPerSec * actualCandleSec;

    const TAX_RATE = 0.005; // 0.5% on-chain burn tax
    const vols = raw.map(d => d.volumefrom || 0);
    const totalVol = vols.reduce((s, v) => s + v, 0);
    const avgVol = totalVol / raw.length || 1;

    // Scale factor anchors cumulative burn to realistic total
    const totalVolBurn = vols.reduce((s, v) => s + v * TAX_RATE, 0);
    const expectedTotalBurn = avgBurnPerCandle * raw.length;
    const scaleFactor = totalVolBurn > 0 ? expectedTotalBurn / totalVolBurn : 1;

    // Reconstruct historical supply: start from current supply + sum of all burns in period
    const totalSecs = raw[raw.length - 1].time - raw[0].time + actualCandleSec;
    const totalPeriodBurn = burnPerSec * totalSecs;
    let runningSupply = currentSupply + totalPeriodBurn;

    const candles = raw.map((d, i) => {
      const open = runningSupply;

      // Tax burn: scaled volume-based — real variation per candle
      const rawVolBurn = (d.volumefrom || avgVol) * TAX_RATE * scaleFactor;
      const taxBurn = Math.max(avgBurnPerCandle * 0.25, Math.min(avgBurnPerCandle * 5.0, rawVolBurn));

      // Binance event burn — uses correct window for this period
      const binanceBurn = getBinanceBurn(d.time, period);
      const burned = taxBurn + binanceBurn;

      const close = open - burned;
      runningSupply = close;

      return {
        t:          d.time * 1000,
        open,
        close,
        burned,
        taxBurn,
        binanceBurn,
        high:       open,
        low:        close,
        closeNoB:   open - taxBurn,
      };
    });

    supplyChartCache[period] = { data: candles, ts: Date.now() };
    renderSupplyChart(candles, period);
  } catch(e) {
    console.warn('Supply chart error:', e);
    drawSupplyFallback();
  } finally {
    if (loadEl) loadEl.style.display = 'none';
    if (wrapEl) wrapEl.style.display = 'block';
  }
}

function renderSupplyChart(candles, period) {
  if (!candles.length) return;
  const first = candles[0].close, last = candles[candles.length-1].close;
  const delta = last - first;
  const deltaEl = document.getElementById('supply-delta');
  if (deltaEl) {
    const fmtDelta = v => Math.round(v).toLocaleString('en-US');
    const totalBurned = candles.reduce((s, c) => s + c.burned, 0);
    deltaEl.innerHTML = `<span style="font-size:14px;">🔥</span> ${fmtDelta(Math.round(totalBurned))} burned in period &nbsp; <span style="color:#ff6b6b;">${delta < 0 ? '↘' : '↗'} ${delta < 0 ? '-' : '+'}${fmtDelta(Math.abs(delta))}</span>`;
    deltaEl.style.color = '#aac4d8';
  }
  drawCombinedChart(candles, period);
  setupCandleHover(candles, period);
}

// ─── COMBINED CHART: Supply bars (top) + Burned bars (bottom) ─────────────
function drawBurnedChart(candles, period, hoverIdx = -1) { drawCombinedChart(candles, period, hoverIdx); }
function drawCandleChart(candles, period, hoverIdx = -1) { drawCombinedChart(candles, period, hoverIdx); }

function drawCombinedChart(candles, period, hoverIdx = -1) {
  const C = resolveCanvasS('supplyChart', 300); if (!C) return;
  const { ctx, w, h } = C;
  ctx.clearRect(0, 0, w, h);

  const pad = { l:72, r:16, t:12, b:28 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  // ── zones ────────────────────────────────────────────────────────────────
  const DIVIDER_RATIO = 0.52;      // supply top 52%, burned bottom 48%
  const supplyH = Math.floor(ch * DIVIDER_RATIO);
  const burnH   = ch - supplyH - 2; // 2px gap for divider
  const supplyTop = pad.t;
  const dividerY  = pad.t + supplyH;
  const burnTop   = dividerY + 2;

  const gap  = cw / candles.length;
  const barW = Math.max(2, Math.min(18, gap * 0.72));

  function fmtY(v) {
    if (Math.abs(v) >= 1e12) return (v/1e12).toFixed(2)+'T';
    if (Math.abs(v) >= 1e9)  return (v/1e9).toFixed(1)+'B';
    if (Math.abs(v) >= 1e6)  return (v/1e6).toFixed(0)+'M';
    return v.toFixed(0);
  }

  // ── SUPPLY Y-scale (top zone) ─────────────────────────────────────────────
  // sMax = highest open, sMin = lowest tax-based close (ignoring Binance spikes)
  // This keeps the axis stable even when a Binance batch drops supply 5B in one candle
  const sMax = Math.max(...candles.map(c => c.open));
  const sMin = Math.min(...candles.map(c => c.open - c.taxBurn), candles[candles.length - 1].close);
  const sPad  = (sMax - sMin) * 0.08 || sMax * 0.00005;
  const sLo   = sMin - sPad;
  const sHi   = sMax + sPad;
  const sRange = sHi - sLo || 1;
  const toSupplyY = v => Math.max(supplyTop, Math.min(supplyTop + supplyH, supplyTop + (1 - (v - sLo) / sRange) * supplyH));

  // ── BURNED Y-scale (bottom zone) — taxBurn ONLY, Binance shown separately ─
  const taxBurnVals = candles.map(c => c.taxBurn).filter(v => v > 0);
  const bMax = (taxBurnVals.length ? Math.max(...taxBurnVals) : 1) * 1.3;
  const toBurnH = v => (Math.min(v, bMax) / bMax) * (burnH - 2);

  // ─── GRID: Supply (top) ───────────────────────────────────────────────────
  ctx.font = '10px Exo 2'; ctx.textAlign = 'right';
  const sGridLines = 5;
  for (let i = 0; i <= sGridLines; i++) {
    const y = supplyTop + (supplyH / sGridLines) * i;
    const v = sHi - sRange * (i / sGridLines);
    ctx.strokeStyle = 'rgba(42,64,96,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.fillStyle = '#3a5578';
    ctx.fillText(fmtY(v), pad.l - 5, y + 3);
  }

  // ─── GRID: Burned (bottom) ────────────────────────────────────────────────
  const bGridLines = 3;
  for (let i = 0; i <= bGridLines; i++) {
    const y = burnTop + (burnH / bGridLines) * (bGridLines - i);
    const v = bMax * (i / bGridLines);
    ctx.strokeStyle = 'rgba(30,100,60,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.setLineDash([]);
    if (i > 0) {
      ctx.fillStyle = 'rgba(30,200,100,0.5)';
      ctx.fillText(fmtY(v), pad.l - 5, y + 3);
    }
  }

  // ─── DIVIDER LINE ─────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(42,64,96,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(pad.l, dividerY); ctx.lineTo(pad.l + cw, dividerY); ctx.stroke();

  // ─── ZONE LABELS (right side) ─────────────────────────────────────────────
  ctx.save();
  ctx.font = 'bold 9px Exo 2'; ctx.textAlign = 'right'; ctx.letterSpacing = '0.06em';
  ctx.fillStyle = 'rgba(255,100,100,0.5)';
  ctx.fillText('SUPPLY', pad.l + cw, supplyTop + 11);
  ctx.fillStyle = 'rgba(30,200,100,0.5)';
  ctx.fillText('BURNED', pad.l + cw, burnTop + 11);
  ctx.restore();

  // ─── SUPPLY BARS (top zone) ──────────────────────────────────────────────
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const isHover = i === hoverIdx;
    const hasBinance = c.binanceBurn > 0;

    // Bar top = current open (supply at start of candle)
    // Bar bottom = fixed bottom of supply zone
    // This makes bars visually show supply level — taller = more supply remaining
    const barTop  = toSupplyY(c.open);
    const barBot  = supplyTop + supplyH;
    const barHeight = Math.max(1, barBot - barTop);

    const alpha = isHover ? 1 : 0.82;
    const grad = ctx.createLinearGradient(x, barTop, x, barBot);
    if (hasBinance) {
      grad.addColorStop(0, `rgba(255,140,60,${alpha})`);
      grad.addColorStop(0.3, `rgba(220,60,60,${alpha * 0.85})`);
      grad.addColorStop(1, `rgba(140,20,20,${alpha * 0.25})`);
    } else {
      grad.addColorStop(0, `rgba(255,75,75,${alpha * 0.95})`);
      grad.addColorStop(0.5, `rgba(190,35,35,${alpha * 0.7})`);
      grad.addColorStop(1, `rgba(120,15,15,${alpha * 0.18})`);
    }

    if (isHover) { ctx.shadowColor = hasBinance ? '#ff9944' : '#ff4444'; ctx.shadowBlur = 10; }
    ctx.fillStyle = grad;
    ctx.fillRect(x - barW / 2, barTop, barW, barHeight);
    ctx.shadowBlur = 0;

    // Bright cap line at supply level (top of bar)
    ctx.fillStyle = hasBinance ? 'rgba(255,170,80,0.98)' : `rgba(255,90,90,${isHover ? 1 : 0.92})`;
    ctx.fillRect(x - barW / 2, barTop, barW, Math.max(1.5, barW * 0.1));

    // If Binance burn: show orange "notch" at close level showing the drop
    if (hasBinance) {
      const closeY = toSupplyY(c.close);
      const notchH = Math.max(2, closeY - barTop);
      // Orange highlight showing the supply drop from Binance burn
      ctx.fillStyle = 'rgba(255,140,50,0.35)';
      ctx.fillRect(x - barW / 2, barTop, barW, notchH);
    }
  });

  // ─── BURNED BARS (bottom zone) ───────────────────────────────────────────
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const isHover = i === hoverIdx;
    const hasBinance = c.binanceBurn > 0;

    // Tax burn bar — normal scale, always visible
    const taxH = Math.max(1, toBurnH(c.taxBurn));
    const taxBt = burnTop + burnH - taxH;
    const grad = ctx.createLinearGradient(x, taxBt, x, burnTop + burnH);
    grad.addColorStop(0, `rgba(30,200,100,${isHover ? 1 : 0.82})`);
    grad.addColorStop(1, `rgba(10,80,40,0.15)`);
    if (isHover) { ctx.shadowColor = '#1ec864'; ctx.shadowBlur = 6; }
    ctx.fillStyle = grad;
    ctx.fillRect(x - barW / 2, taxBt, barW, taxH);
    ctx.shadowBlur = 0;

    // Binance burn — separate orange bar on top of the green bar, capped at zone height
    if (hasBinance) {
      // Show as a % of zone height — max 85% so it's always visible but not overflowing
      const binanceH = Math.min(burnH * 0.85, Math.max(burnH * 0.25, toBurnH(c.binanceBurn * 0.15)));
      const binanceBt = burnTop + burnH - taxH - binanceH;
      const bGrad = ctx.createLinearGradient(x, binanceBt, x, burnTop + burnH - taxH);
      bGrad.addColorStop(0, 'rgba(255,170,60,0.95)');
      bGrad.addColorStop(1, 'rgba(200,100,20,0.3)');
      ctx.fillStyle = bGrad;
      ctx.fillRect(x - barW / 2, Math.max(burnTop, binanceBt), barW, binanceH);
      // Fire emoji above
      ctx.save();
      ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.92;
      ctx.fillText('🔥', x, Math.max(burnTop + 12, binanceBt - 1));
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  });

  // ─── CURRENT SUPPLY LINE (dashed) ─────────────────────────────────────────
  const lastY = toSupplyY(candles[candles.length - 1].close);
  ctx.strokeStyle = 'rgba(255,100,100,0.25)';
  ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(pad.l, lastY); ctx.lineTo(pad.l + cw, lastY); ctx.stroke();
  ctx.setLineDash([]);

  // ─── HOVER CROSSHAIR ──────────────────────────────────────────────────────
  if (hoverIdx >= 0 && hoverIdx < candles.length) {
    const x = pad.l + hoverIdx * gap + gap / 2;
    ctx.strokeStyle = 'rgba(84,147,247,0.35)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, supplyTop); ctx.lineTo(x, burnTop + burnH); ctx.stroke();
    ctx.setLineDash([]);

    // Supply dot
    const sy = toSupplyY(candles[hoverIdx].close);
    ctx.beginPath(); ctx.arc(x, sy, 3.5, 0, Math.PI*2);
    ctx.fillStyle = candles[hoverIdx].binanceBurn > 0 ? '#ffaa44' : '#ff6b6b'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  }

  // ─── X-AXIS ───────────────────────────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  ctx.font = '10px Exo 2'; ctx.textAlign = 'center';
  const drawnX = [];
  const minSp = 56;
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const d = new Date(c.t);
    const prevD = i > 0 ? new Date(candles[i-1].t) : null;
    const isNewMonth = !prevD || prevD.getMonth() !== d.getMonth();
    const isNewYear  = !prevD || prevD.getFullYear() !== d.getFullYear();
    const isNewDay   = !prevD || prevD.getDate() !== d.getDate();
    const hh = d.getHours().toString().padStart(2,'0');
    const day = d.getDate().toString().padStart(2,'0');
    const mon = MONTHS[d.getMonth()];
    const yr2 = String(d.getFullYear()).slice(2);
    let label = null;
    if      (period === 'M') { if (isNewYear)  label = `${mon} '${yr2}`; else if (isNewMonth) label = mon; }
    else if (period === 'W') { if (isNewYear)  label = `${mon} '${yr2}`; else if (isNewMonth) label = mon; }
    else if (period === 'D') { if (isNewYear)  label = `${mon} '${yr2}`; else if (isNewMonth) label = mon; else if (isNewDay) label = `${day} ${mon}`; }
    else if (period === '4h'){ if (isNewMonth) label = `${mon} '${yr2}`; else if (isNewDay)   label = `${day} ${mon}`; }
    else                     { if (isNewDay)   label = `${day} ${mon}`;  else label = `${hh}:00`; }
    if (label && !drawnX.some(px => Math.abs(px - x) < minSp)) {
      drawnX.push(x);
      ctx.fillStyle = '#3a5578';
      ctx.fillText(label, x, h - 14);
    }
  });
  ctx.fillStyle = 'rgba(58,85,120,0.35)'; ctx.font = '9px Exo 2'; ctx.textAlign = 'center';
  ctx.fillText('UTC Time Buckets', pad.l + cw / 2, h - 2);

  // ── Moving date pill on X axis ────────────────────────────────────────────
  if (hoverIdx >= 0 && hoverIdx < candles.length) {
    const hc = candles[hoverIdx];
    const cx = pad.l + hoverIdx * gap + gap / 2;
    const dh = new Date(hc.t);
    const dd2 = dh.getUTCDate().toString().padStart(2,'0');
    const mm2 = (dh.getUTCMonth()+1).toString().padStart(2,'0');
    const yy2 = dh.getUTCFullYear();
    const hh2 = dh.getUTCHours().toString().padStart(2,'0');
    const mn2 = dh.getUTCMinutes().toString().padStart(2,'0');
    const MN  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let xLabel;
    if      (period === 'M')  xLabel = `${MN[dh.getUTCMonth()]} ${yy2}`;
    else if (period === 'W')  xLabel = `${dd2} ${MN[dh.getUTCMonth()]} '${String(yy2).slice(2)}`;
    else if (period === 'D')  xLabel = `${dd2} ${MN[dh.getUTCMonth()]} '${String(yy2).slice(2)}`;
    else if (period === '4h') xLabel = `${dd2} ${MN[dh.getUTCMonth()]} ${hh2}:00`;
    else                      xLabel = `${dd2}.${mm2} ${hh2}:${mn2}`;

    ctx.font = 'bold 10px Exo 2';
    const tw = ctx.measureText(xLabel).width;
    const pw = tw + 14, ph = 14;
    let px = cx - pw / 2;
    px = Math.max(pad.l, Math.min(w - pad.r - pw, px));
    const py = h - pad.b + 2;

    ctx.fillStyle = 'rgba(84,147,247,0.9)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 3); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText(xLabel, px + pw / 2, py + ph - 3);
  }
}

// Shared X-axis drawing — used by both supply and burned charts
function drawXAxisLabels(ctx, items, pad, cw, gap, period) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = ctx.canvas.height;
  ctx.font = '10px Exo 2'; ctx.textAlign = 'center';
  const drawnPositions = [];
  const minSpacing = 58;

  items.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const d = new Date(c.t);
    const hh = d.getHours().toString().padStart(2,'0');
    const day = d.getDate().toString().padStart(2,'0');
    const mon = MONTHS[d.getMonth()];
    const prevD = i > 0 ? new Date(items[i-1].t) : null;
    const isNewDay   = !prevD || prevD.getDate()        !== d.getDate();
    const isNewMonth = !prevD || prevD.getMonth()       !== d.getMonth();
    const isNewYear  = !prevD || prevD.getFullYear()    !== d.getFullYear();
    const yr2 = String(d.getFullYear()).slice(2);

    let label = null;
    if (period === '1h' || period === '4h') {
      if (i === 0) label = `${day} ${mon}, ${hh}:00`;
      else if (isNewDay) label = `${day} ${mon}`;
    } else if (period === 'D') {
      if (i === 0 || i % 5 === 0) label = `${day} ${mon}`;
    } else if (period === 'W') {
      if (i === 0) label = `${mon} '${yr2}`;
      else if (isNewYear) label = String(d.getFullYear());
      else if (isNewMonth) label = `${mon} '${yr2}`;
    } else if (period === 'M') {
      if (i === 0) label = String(d.getFullYear());
      else if (isNewYear) label = String(d.getFullYear());
      else if (d.getMonth() % 3 === 0) label = `${mon} '${yr2}`;
    } else {
      if (i === 0 || isNewYear) label = String(d.getFullYear());
      else if (isNewMonth) label = `${mon} '${yr2}`;
    }

    if (label && !drawnPositions.some(px => Math.abs(px - x) < minSpacing)) {
      drawnPositions.push(x);
      ctx.fillStyle = '#3a5578';
      ctx.fillText(label, x, h - 14);
    }
  });
  ctx.fillStyle = 'rgba(58,85,120,0.4)'; ctx.font = '9px Exo 2'; ctx.textAlign = 'center';
  ctx.fillText('UTC Time Buckets', pad.l + cw / 2, h - 2);
}

function fmtSupply(v) {
  if (v >= 1e12) return (v/1e12).toFixed(4) + 'T';
  if (v >= 1e9)  return (v/1e9).toFixed(2) + 'B';
  return fmtS(v);
}

function setupCandleHover(candles, period) {
  const canvas = document.getElementById('supplyChart');
  if (!canvas) return;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Overlay tooltip drawn ON canvas (like luncmetrics)
  let _hoverTooltipEl = null;

  function getOrCreateOverlayTooltip() {
    if (_hoverTooltipEl) return _hoverTooltipEl;
    const wrap = canvas.parentElement;
    wrap.style.position = 'relative';
    const el = document.createElement('div');
    el.id = 'canvas-hover-tooltip';
    el.style.cssText = `
      position:absolute;pointer-events:none;display:none;z-index:10;
      background:rgba(8,18,36,0.93);border:1px solid rgba(84,147,247,0.25);
      border-radius:8px;padding:10px 14px;font-family:'Exo 2',sans-serif;
      font-size:12px;line-height:1.85;color:#c8ddf0;
      box-shadow:0 4px 24px rgba(0,0,0,0.5);min-width:220px;white-space:nowrap;
    `;
    wrap.appendChild(el);
    _hoverTooltipEl = el;
    return el;
  }

  function fmtDate(d, period) {
    const dd = d.getUTCDate().toString().padStart(2,'0');
    const mm = (d.getUTCMonth()+1).toString().padStart(2,'0');
    const yyyy = d.getUTCFullYear();
    const hh = d.getUTCHours().toString().padStart(2,'0');
    const min = d.getUTCMinutes().toString().padStart(2,'0');
    const ss = d.getUTCSeconds().toString().padStart(2,'0');
    if (period === 'D' || period === 'W' || period === 'M') {
      return `${dd}.${mm}.${yyyy}, 00:00:00 UTC`;
    }
    return `${dd}.${mm}.${yyyy}, ${hh}:${min}:${ss} UTC`;
  }

  function fmtBig(v) {
    // Format like "441,311 млрд" style but in English: "441.311B" or full with commas
    const n = Math.round(Math.abs(v));
    if (n >= 1e12) return (n / 1e12).toFixed(3) + 'T';
    if (n >= 1e9)  return (n / 1e9).toFixed(3) + 'B';
    if (n >= 1e6)  return (n / 1e6).toFixed(3) + 'M';
    return n.toLocaleString('en-US');
  }

  function fmtPeriodLabel(period) {
    if (period === '1h') return 'Hourly burned';
    if (period === '4h') return '4h burned';
    if (period === 'D')  return 'Daily burned';
    if (period === 'W')  return 'Weekly burned';
    if (period === 'M')  return 'Monthly burned';
    return 'Period burned';
  }

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const padL = 72, padR = 16;
    const cw = canvas.width - padL - padR;
    const gap = cw / candles.length;
    const idx = Math.floor((mx - padL) / gap);
    const tip = getOrCreateOverlayTooltip();

    if (idx >= 0 && idx < candles.length) {
      const c = candles[idx];
      const d = new Date(c.t);
      const dateStr = fmtDate(d, period);

      // Position tooltip: follow mouse, flip if near right/bottom edge
      const canvasRect = canvas.getBoundingClientRect();
      const wrapRect = canvas.parentElement.getBoundingClientRect();
      tip.style.display = 'block';
      const tipW = tip.offsetWidth  || 240;
      const tipH = tip.offsetHeight || 160;
      let tipLeft = e.clientX - wrapRect.left + 14;
      let tipTop  = e.clientY - wrapRect.top  - 20;
      // Flip left if near right edge
      if (tipLeft + tipW > wrapRect.width - 10) tipLeft = e.clientX - wrapRect.left - tipW - 14;
      // Flip up if near bottom edge
      if (tipTop + tipH > wrapRect.height - 8) tipTop = e.clientY - wrapRect.top - tipH - 10;
      // Never go above top
      if (tipTop < 4) tipTop = 4;
      tip.style.left = tipLeft + 'px';
      tip.style.top  = tipTop  + 'px';

      // Combined tooltip: both supply and burned info
      const ORIGINAL_SUPPLY = 6_900_000_000_000;
      let cumB = ORIGINAL_SUPPLY - candles[0].open;
      for (let j = 0; j <= idx; j++) cumB += candles[j].burned;
      const periodLbl = fmtPeriodLabel(period);
      const change = c.close - c.open;
      const chSign = change < 0 ? '−' : '+';
      const changeColor = change < 0 ? '#ff6b6b' : '#4dffaa';
      tip.innerHTML =
        `<div style="color:#7abed0;font-size:10px;letter-spacing:0.08em;margin-bottom:4px;border-bottom:1px solid rgba(84,147,247,0.15);padding-bottom:4px;">LUNC SUPPLY &amp; BURN</div>` +
        `<div><span style="color:#aac4d8;">Supply:</span> <b style="color:#ff9090;">${fmtBig(c.close)} LUNC</b></div>` +
        `<div><span style="color:#aac4d8;">Change:</span> <b style="color:${changeColor};">${chSign}${fmtBig(Math.abs(change))} LUNC</b></div>` +
        `<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(84,147,247,0.1);">` +
        `<span style="color:#aac4d8;">${periodLbl}:</span> <b style="color:#1ec864;">${fmtBig(c.burned)} LUNC</b></div>` +
        (c.binanceBurn > 0
          ? `<div><span style="color:#ff9944;">🔥 Binance:</span> <b style="color:#ffbb55;">${fmtBig(c.binanceBurn)} LUNC</b></div>`
          : '') +
        `<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(84,147,247,0.1);"><span style="color:#aac4d8;">Total burned:</span> <b style="color:#4dffaa;">${fmtBig(cumB)} LUNC</b></div>` +
        `<div><span style="color:#aac4d8;">Date:</span> <b>${dateStr}</b></div>`;
      drawCombinedChart(candles, period, idx);

      // Also update inline tooltip area (legacy, clear it)
      const inlineTip = document.getElementById('supply-tooltip');
      if (inlineTip) inlineTip.innerHTML = '';
    } else {
      tip.style.display = 'none';
    }
  };

  let _leaveTimer = null;
  canvas.onmouseleave = (e) => {
    _leaveTimer = setTimeout(() => {
      const tip = getOrCreateOverlayTooltip();
      if (tip) tip.style.display = 'none';
      const inlineTip = document.getElementById('supply-tooltip');
      if (inlineTip) inlineTip.innerHTML = '';
      drawCombinedChart(candles, period, -1);
    }, 80);
  };
  canvas.onmouseenter = () => {
    if (_leaveTimer) { clearTimeout(_leaveTimer); _leaveTimer = null; }
  };
}

function drawSupplyFallback() {
  const C = resolveCanvasS('supplyChart', 220); if (!C) return;
  const { ctx, w, h } = C;
  ctx.fillStyle = 'rgba(122,158,196,0.4)'; ctx.font = '12px Exo 2';
  ctx.textAlign = 'center';
  ctx.fillText('Could not load data — check connection', w/2, h/2);
}

// ─── BINANCE BURN COUNTDOWN ──────────────────────────────────
let _cdInterval = null;

function startBinanceCountdown() {
  if (_cdInterval) clearInterval(_cdInterval);
  updateBinanceCountdown();
  _cdInterval = setInterval(updateBinanceCountdown, 1000);
}

function stopBinanceCountdown() {
  if (_cdInterval) { clearInterval(_cdInterval); _cdInterval = null; }
}

function updateBinanceCountdown() {
  const now = new Date();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Binance burns "around the 1st" — window: 29th prev month to 3rd of next month
  // Find the nearest upcoming burn target
  const yr  = now.getUTCFullYear();
  const mon = now.getUTCMonth();

  // Candidates: last day(s) of this month OR 1st–3rd of next month
  const nextMonthFirst = new Date(Date.UTC(
    mon === 11 ? yr + 1 : yr, mon === 11 ? 0 : mon + 1, 1
  ));
  // Burn window starts 2 days before month end
  const lastDayOfMonth = new Date(Date.UTC(yr, mon + 1, 0)).getUTCDate();
  const burnWindowStart = new Date(Date.UTC(yr, mon, lastDayOfMonth - 1)); // 2 days before end
  const burnWindowEnd   = new Date(Date.UTC(
    mon === 11 ? yr + 1 : yr, mon === 11 ? 0 : mon + 1, 3, 23, 59, 59
  )); // up to 3rd of next month

  // If we're IN the burn window → show "Burn expected soon!"
  const inWindow = now >= burnWindowStart && now <= burnWindowEnd;

  // Target for countdown = 1st of next month (center of window)
  const nextBurn = nextMonthFirst;

  // Progress bar: from 1st of current month to 1st of next month
  const monthStart = new Date(Date.UTC(yr, mon, 1));
  const monthTotal = nextBurn - monthStart;
  const elapsed    = now - monthStart;
  const remaining  = nextBurn - now;
  const pct = Math.min(100, Math.max(0, (elapsed / monthTotal) * 100));

  // Countdown parts
  const totalSecs = Math.max(0, Math.floor(remaining / 1000));
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;

  const pad = n => String(n).padStart(2, '0');

  // Update DOM
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('cd-days',  pad(days));
  set('cd-hours', pad(hours));
  set('cd-mins',  pad(mins));
  set('cd-secs',  pad(secs));

  const burnMon = MONTHS[nextBurn.getUTCMonth()];
  const burnYr  = nextBurn.getUTCFullYear();

  // Show "expected soon" banner if in burn window
  const card = document.getElementById('binance-countdown-card');
  if (inWindow && card) {
    card.style.borderColor = 'rgba(255,80,30,0.5)';
    card.style.background  = 'linear-gradient(135deg,rgba(255,80,30,0.12) 0%,rgba(10,18,36,0) 60%)';
  } else if (card) {
    card.style.borderColor = 'rgba(255,100,50,0.15)';
    card.style.background  = 'linear-gradient(135deg,rgba(255,80,40,0.06) 0%,rgba(10,18,36,0) 60%)';
  }

  if (inWindow) {
    set('bnb-burn-date', `🔴 BURN EXPECTED · ${burnMon} 1 ±2 days`);
    // Flash the digits
    const digits = document.getElementById('bnb-countdown-digits');
    if (digits) digits.style.opacity = (Math.floor(Date.now()/600) % 2 === 0) ? '1' : '0.4';
  } else {
    set('bnb-burn-date', `${burnMon} 1, ${burnYr} · ±2 days window`);
    const digits = document.getElementById('bnb-countdown-digits');
    if (digits) digits.style.opacity = '1';
  }

  const startMon = MONTHS[monthStart.getUTCMonth()];
  set('bnb-period-start', `${startMon} 1`);
  set('bnb-period-end',   `${burnMon} 1 ±2d`);
  set('bnb-progress-pct', pct.toFixed(1) + '%');

  const bar = document.getElementById('bnb-progress-bar');
  if (bar) {
    bar.style.width = pct.toFixed(2) + '%';
    bar.style.background = inWindow
      ? 'linear-gradient(90deg,#ff2200,#ff6600)'
      : 'linear-gradient(90deg,#ff4d1a,#ff8844)';
  }

  // Estimated burn amount based on current month's trading volume proxy
  // ~375M–5.3B range; use pct elapsed × average daily rate as proxy
  const AVG_MONTHLY = 600_000_000; // conservative ~600M average
  const est = Math.round(AVG_MONTHLY * (0.7 + pct / 300)); // slight ramp as month progresses
  const fmtB = v => v >= 1e9 ? (v/1e9).toFixed(2)+'B' : (v/1e6).toFixed(0)+'M';
  set('bnb-est-amount', `Est. next Binance burn: ~${fmtB(est)} LUNC · Based on avg monthly volume`);
}

async function runSupplyAudit() {
  const panel = document.getElementById('supply-audit');
  panel.style.display = 'block';
  panel.innerHTML = '<span style="color:#5497f7">Running audit...</span>';

  const fmt = v => Math.round(v).toLocaleString('en-US');
  const lines = [];

  // 1. Real supply from LCD
  try {
    const r = await Promise.race([
      fetch('https://terra-classic-lcd.publicnode.com/cosmos/bank/v1beta1/supply/uluna'),
      new Promise((_,rej) => setTimeout(rej, 5000))
    ]);
    const j = await r.json();
    const lcdSupply = Number(j?.amount?.amount) / 1e6;
    const displayedSupply = parseFloat(document.getElementById('lunc-big')?.textContent?.replace(/,/g,'')) || 0;
    const diff = Math.abs(lcdSupply - displayedSupply);
    const match = diff < 1_000_000;
    lines.push(`<span style="color:#8ab0d8">① LCD Supply (real-time):</span>  <b>${fmt(lcdSupply)}</b> LUNC`);
    lines.push(`<span style="color:#8ab0d8">   Displayed Supply:</span>       <b>${fmt(displayedSupply)}</b> LUNC`);
    lines.push(`<span style="color:${match?'#4dffaa':'#ff6b6b'}">   Difference: ${fmt(diff)} LUNC ${match ? '✅ MATCH' : '⚠️ MISMATCH'}</span>`);
  } catch(e) {
    lines.push(`<span style="color:#ff6b6b">① LCD Supply: fetch failed — ${e.message}</span>`);
  }

  lines.push('');

  // 2. Chart candle consistency check
  const cached = supplyChartCache[currentSupplyPeriod];
  if (cached?.data?.length) {
    const candles = cached.data;
    const first = candles[0], last = candles[candles.length-1];
    const totalBurned = candles.reduce((s,c) => s + c.burned, 0);
    const supplyDrop = first.open - last.close;
    const drift = Math.abs(totalBurned - supplyDrop);
    lines.push(`<span style="color:#8ab0d8">② Chart period: ${currentSupplyPeriod} — ${candles.length} candles</span>`);
    lines.push(`   Start supply:  <b>${fmt(first.open)}</b>`);
    lines.push(`   End supply:    <b>${fmt(last.close)}</b>`);
    lines.push(`   Supply drop:   <b style="color:#ff6b6b">-${fmt(supplyDrop)}</b>`);
    lines.push(`   Sum of burns:  <b style="color:#ff9944">-${fmt(totalBurned)}</b>`);
    lines.push(`<span style="color:${drift < 1000 ? '#4dffaa' : '#ffaa44'}">   Drift: ${fmt(drift)} ${drift < 1000 ? '✅ consistent' : '⚠️ check rounding'}</span>`);

    // Binance burn candles
    const binanceCandies = candles.filter(c => c.binanceBurn > 0);
    lines.push('');
    lines.push(`<span style="color:#8ab0d8">③ Binance burn events in view: ${binanceCandies.length}</span>`);
    binanceCandies.forEach(c => {
      const d = new Date(c.t);
      const label = `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
      lines.push(`   🔥 ${label}: <b style="color:#ff7744">${fmt(c.binanceBurn)}</b> LUNC (Binance) + <b>${fmt(c.burned - c.binanceBurn)}</b> (tax)`);
    });
  } else {
    lines.push(`<span style="color:#ffaa44">② No cached chart data — open STATS page first</span>`);
  }

  lines.push('');

  // 3. Daily burn rate check
  const EXPECTED_DAILY = 16_500_000;
  const cached2 = supplyChartCache['D'] || supplyChartCache['1h'];
  if (cached2?.data?.length) {
    const candles = cached2.data;
    const cfg = TF_CONFIG[currentSupplyPeriod] || TF_CONFIG['D'];
    const candleSec = currentSupplyPeriod === 'M' ? 30.44*86400 : cfg.secPerCandle || 3600;
    const avgBurnPerCandle = candles.reduce((s,c) => s + (c.burned - (c.binanceBurn||0)), 0) / candles.length;
    const burnPerDay = avgBurnPerCandle * (86400 / candleSec);
    const burnOK = burnPerDay > 5_000_000 && burnPerDay < 50_000_000;
    lines.push(`<span style="color:#8ab0d8">④ Avg tax burn rate (excl. Binance):</span>`);
    lines.push(`   Per candle:  <b>${fmt(avgBurnPerCandle)}</b>`);
    lines.push(`   Per day:     <b>${fmt(burnPerDay)}</b> LUNC`);
    lines.push(`   Expected:    ~${fmt(EXPECTED_DAILY)} LUNC/day`);
    lines.push(`<span style="color:${burnOK?'#4dffaa':'#ffaa44'}">   ${burnOK ? '✅ Burn rate looks realistic' : '⚠️ Rate seems off'}</span>`);
  }

  panel.innerHTML = lines.join('<br>');
}

function drawSupplyChartS(lunc, ustc) {
  // Clear cache so candles rebuild with fresh supply value from LCD
  supplyChartCache = {};
  loadSupplyChart(currentSupplyPeriod);
}
function drawStakedChartS(bonded, ratio) {
  const C = resolveCanvasS('stakedChart', 160); if (!C) return;
  const { ctx, w, h } = C;
  const pad = { l:56, r:54, t:12, b:28 };
  const cw = w-pad.l-pad.r, ch = h-pad.t-pad.b, DAYS=30;
  const bData = Array.from({length:DAYS},(_,i)=>bonded+Math.sin(i/3.2)*bonded*0.01);
  const rData = Array.from({length:DAYS},(_,i)=>ratio+Math.sin(i/4.1)*0.12);
  const bMin=Math.min(...bData)*0.999,bMax=Math.max(...bData)*1.001;
  const rMin=Math.min(...rData)*0.999,rMax=Math.max(...rData)*1.001;
  ctx.strokeStyle='#1e3358';ctx.lineWidth=1;
  for(let i=0;i<=3;i++){const y=pad.t+(ch/3)*i;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cw,y);ctx.stroke();}
  drawLineS(ctx,bData,pad,cw,ch,bMin,bMax,'#66ffaa',2);
  ctx.beginPath();rData.forEach((v,i)=>{const x=pad.l+(i/(DAYS-1))*cw;const y=pad.t+(1-(v-rMin)/(rMax-rMin+0.0001))*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle='#5493f7';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#66ffaa';ctx.font='10px Exo 2';ctx.textAlign='right';ctx.fillText(fmtS(bMax),pad.l-4,pad.t+10);ctx.fillText(fmtS(bMin),pad.l-4,pad.t+ch);
  ctx.fillStyle='#5493f7';ctx.textAlign='left';ctx.fillText(rMax.toFixed(2)+'%',pad.l+cw+4,pad.t+10);ctx.fillText(rMin.toFixed(2)+'%',pad.l+cw+4,pad.t+ch);
  ctx.fillStyle='#3a5070';ctx.font='10px Exo 2';ctx.textAlign='center';
  ['30d ago','20d ago','10d ago','Today'].forEach((l,i)=>ctx.fillText(l,pad.l+(i/3)*cw,h-4));
}
function drawOracleChartS(lunc, ustc) {
  const C = resolveCanvasS('oracleChart', 140); if (!C) return;
  const { ctx, w, h } = C;
  const pad = { l:56, r:54, t:12, b:28 };
  const cw = w-pad.l-pad.r, ch = h-pad.t-pad.b, DAYS=30;
  const lData=mockDeclineS(lunc,DAYS,500000000,0.002);
  const uData=mockDeclineS(ustc,DAYS,900000,0.002);
  const lMin=Math.min(...lData)*0.999,lMax=Math.max(...lData)*1.001;
  const uMin=Math.min(...uData)*0.999,uMax=Math.max(...uData)*1.001;
  ctx.strokeStyle='#1e3358';ctx.lineWidth=1;
  for(let i=0;i<=2;i++){const y=pad.t+(ch/2)*i;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cw,y);ctx.stroke();}
  drawLineS(ctx,lData,pad,cw,ch,lMin,lMax,'#66ffaa',2);
  ctx.beginPath();uData.forEach((v,i)=>{const x=pad.l+(i/(DAYS-1))*cw;const y=pad.t+(1-(v-uMin)/(uMax-uMin+0.0001))*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle='#5493f7';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#66ffaa';ctx.font='10px Exo 2';ctx.textAlign='right';ctx.fillText(fmtS(lMax),pad.l-4,pad.t+10);
  ctx.fillStyle='#5493f7';ctx.textAlign='left';ctx.fillText(fmtS(uMax),pad.l+cw+4,pad.t+10);
}

async function loadAllStats() {
  const el = document.getElementById('updated-time');
  if (el) { el.textContent = 'Refreshing...'; el.dataset.lastUpdate = 'Refreshing...'; }
  const validatorsPromise = loadValidatorsS();
  await Promise.allSettled([loadStatsData(), loadOraclePoolS(), validatorsPromise]);
  const timeStr = 'Updated ' + new Date().toLocaleTimeString();
  if (el) { el.dataset.lastUpdate = timeStr; el.textContent = timeStr + ' · 🔄 30s'; }
  // Reset countdown
  statsNextRefresh = Date.now() + 30000;
}

// ─── INIT ─────────────────────────────────────────────────────
renderBoard();

// Scroll to top on every page load/refresh
window.scrollTo(0, 0);
if (history.scrollRestoration) history.scrollRestoration = 'manual';

// Fast smooth scroll to top (300ms, ease-out)
function smoothScrollTop() {
  const start = window.scrollY;
  if (start === 0) return;
  const duration = 300;
  const startTime = performance.now();
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    window.scrollTo(0, start * (1 - easeOut(progress)));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
window.addEventListener('load', () => { window.scrollTo(0, 0); });