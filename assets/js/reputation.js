// ─── REPUTATION MODULE · terra-oracle ────────────────────────
// Pages: leaderboard | how it works
// Triggered by showRepPage(tab)

// ── Show reputation page ──────────────────────────────────────
let _repCurrentTab = 'leaderboard';

function showRepPage(tab) {
  tab = tab || _repCurrentTab;
  _repCurrentTab = tab;

  // Hide all pages, show reputation
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const pg = document.getElementById('page-reputation');
  if (!pg) return;
  pg.classList.add('active');
  // Activate reputation nav tab
  const repTab = document.querySelector('.nav-node');
  if (repTab) repTab.classList.add('active');
  try { sessionStorage.setItem('currentPage', 'reputation:' + tab); } catch(e) {}

  window.scrollTo(0, 0);
  renderRepPage(tab);

  // Force reflow so mobile browser recalculates scrollable area
  requestAnimationFrame(() => {
    document.body.style.overflow = '';
    window.scrollTo(0, 0);
  });
}

function renderRepPage(tab) {
  const pg = document.getElementById('page-reputation');
  if (!pg) return;

  const isConnected = typeof globalWalletAddress !== 'undefined' && globalWalletAddress;

  pg.innerHTML = `
    <div style="text-align:center;margin-bottom:36px;">
      <div style="display:inline-block;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;
        color:var(--accent);border:1px solid rgba(84,147,247,0.3);padding:4px 14px;border-radius:20px;
        background:rgba(84,147,247,0.05);margin-bottom:14px;">ORACLE REPUTATION</div>
      <h1 style="font-family:'Rajdhani',sans-serif;font-weight:800;font-size:clamp(26px,4vw,38px);color:#fff;margin-bottom:10px;">
        ${tab === 'leaderboard' ? '🏆 Leaderboard' : tab === 'stats' ? '📊 Your Stats' : '📖 How it Works'}
      </h1>
      <p style="font-size:12px;color:var(--muted);">
        ${tab === 'leaderboard' ? 'Top contributors ranked by Oracle Reputation score'
        : tab === 'stats'      ? 'Your activity breakdown · weekly rewards · estimated payout'
        :                        'Earn REP through activity · Unlock ranks, discounts & rewards'}
      </p>
    </div>

    <!-- Tab switcher -->
    <div style="display:flex;gap:8px;margin-bottom:28px;justify-content:center;flex-wrap:wrap;">
      <button onclick="showRepPage('leaderboard')" style="
        background:${tab==='leaderboard' ? 'rgba(84,147,247,0.12)' : 'transparent'};
        border:1px solid ${tab==='leaderboard' ? 'rgba(84,147,247,0.4)' : 'var(--border)'};
        color:${tab==='leaderboard' ? 'var(--accent)' : 'var(--muted)'};
        font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;
        padding:8px 20px;border-radius:8px;cursor:pointer;transition:all 0.2s;">
        🏆 Leaderboard
      </button>
      <button onclick="showRepPage('stats')" style="
        background:${tab==='stats' ? 'rgba(84,147,247,0.12)' : 'transparent'};
        border:1px solid ${tab==='stats' ? 'rgba(84,147,247,0.4)' : 'var(--border)'};
        color:${tab==='stats' ? 'var(--accent)' : 'var(--muted)'};
        font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;
        padding:8px 20px;border-radius:8px;cursor:pointer;transition:all 0.2s;">
        📊 Your Stats
      </button>
      <button onclick="showRepPage('how')" style="
        background:${tab==='how' ? 'rgba(84,147,247,0.12)' : 'transparent'};
        border:1px solid ${tab==='how' ? 'rgba(84,147,247,0.4)' : 'var(--border)'};
        color:${tab==='how' ? 'var(--accent)' : 'var(--muted)'};
        font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;
        padding:8px 20px;border-radius:8px;cursor:pointer;transition:all 0.2s;">
        📖 How it Works
      </button>
    </div>

    <div id="rep-tab-content">
      ${tab === 'leaderboard' ? renderLeaderboardHTML()
      : tab === 'stats'      ? renderStatsHTML(isConnected)
      :                        renderHowItWorksHTML()}
    </div>
  `;

  if (tab === 'leaderboard') loadLeaderboard();
  if (tab === 'stats' && isConnected) loadStatsData();
}

// ── LEADERBOARD ───────────────────────────────────────────────
function renderLeaderboardHTML() {
  return `
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
      <button onclick="switchLeaderboardPeriod('weekly')" id="lb-btn-weekly" style="
        background:rgba(84,147,247,0.12);border:1px solid rgba(84,147,247,0.4);
        color:var(--accent);font-family:'Exo 2',sans-serif;font-size:10px;font-weight:700;
        letter-spacing:0.1em;padding:6px 16px;border-radius:6px;cursor:pointer;">
        📅 Weekly
      </button>
      <button onclick="switchLeaderboardPeriod('alltime')" id="lb-btn-alltime" style="
        background:transparent;border:1px solid var(--border);
        color:var(--muted);font-family:'Exo 2',sans-serif;font-size:10px;font-weight:700;
        letter-spacing:0.1em;padding:6px 16px;border-radius:6px;cursor:pointer;">
        🔥 All Time
      </button>
    </div>
    <div id="leaderboard-list">
      <div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">Loading...</div>
    </div>
  `;
}

let _lbPeriod = 'weekly';

function switchLeaderboardPeriod(period) {
  _lbPeriod = period;
  const weekly  = document.getElementById('lb-btn-weekly');
  const alltime = document.getElementById('lb-btn-alltime');
  if (weekly) {
    const active = 'background:rgba(84,147,247,0.12);border:1px solid rgba(84,147,247,0.4);color:var(--accent);';
    const inactive = 'background:transparent;border:1px solid var(--border);color:var(--muted);';
    weekly.style.cssText  += period === 'weekly'  ? active : inactive;
    alltime.style.cssText += period === 'alltime' ? active : inactive;
  }
  loadLeaderboard();
}

async function loadLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">Loading contributors...</div>';

  try {
    // Fetch all questions from worker
    const WORKER_URL = typeof window.WORKER_URL !== 'undefined'
      ? window.WORKER_URL
      : 'https://terra-oracle-questions.vladislav-baydan.workers.dev';

    const res = await fetch(`${WORKER_URL}/questions`);
    if (!res.ok) throw new Error('Worker error');
    const data = await res.json();
    const allQuestions = data.questions || [];

    // Build per-wallet stats
    const wallets = {};
    const cutoff = _lbPeriod === 'weekly'
      ? Math.floor(Date.now() / 1000) - 7 * 86400
      : 0;

    for (const q of allQuestions) {
      if (q.createdAt < cutoff) continue;
      if (!q.wallet) continue;
      if (!wallets[q.wallet]) wallets[q.wallet] = { wallet: q.wallet, alias: q.alias || ('Anonymous#' + q.wallet.slice(-4).toUpperCase()), questions: 0, answers: 0, upvotes: 0 };
      wallets[q.wallet].questions++;
      wallets[q.wallet].upvotes += q.votes || 0;

      for (const a of q.answers || []) {
        if (!a.wallet) continue;
        if (!wallets[a.wallet]) wallets[a.wallet] = { wallet: a.wallet, alias: a.alias || ('Anonymous#' + a.wallet.slice(-4).toUpperCase()), questions: 0, answers: 0, upvotes: 0 };
        wallets[a.wallet].answers++;
        wallets[a.wallet].upvotes += a.votes || 0;
      }
    }

    // Calculate REP score for each
    const ranked = Object.values(wallets).map(w => {
      const score = w.questions * 40 + w.answers * 15 + w.upvotes * 10;
      const rank  = typeof getRank === 'function' ? getRank(score) : { name: 'INITIATE', icon: '◈', color: '#6b82a8', glow: 'rgba(107,130,168,0.3)' };
      return { ...w, score, rank };
    }).sort((a, b) => b.score - a.score).slice(0, 50);

    if (!ranked.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">No contributors yet — be the first!</div>';
      return;
    }

    const myWallet = typeof globalWalletAddress !== 'undefined' ? globalWalletAddress : null;

    el.innerHTML = ranked.map((w, i) => {
      const isMe = myWallet && w.wallet === myWallet;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
      return `
        <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
          background:${isMe ? 'rgba(84,147,247,0.07)' : 'var(--surface)'};
          border:1px solid ${isMe ? 'rgba(84,147,247,0.3)' : 'var(--border)'};
          border-radius:10px;margin-bottom:8px;transition:all 0.2s;"
          onmouseover="this.style.borderColor='rgba(84,147,247,0.25)'"
          onmouseout="this.style.borderColor='${isMe ? 'rgba(84,147,247,0.3)' : 'var(--border)'}'">
          <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:800;
            color:${i < 3 ? '#fff' : 'var(--muted)'};min-width:32px;text-align:center;">
            ${medal}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
              <span style="font-size:12px;font-weight:700;color:${isMe ? 'var(--accent)' : 'var(--text)'};
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${w.alias}${isMe ? ' <span style="color:var(--accent);font-size:10px;">(you)</span>' : ''}
              </span>
              <span style="font-size:10px;font-weight:700;color:${w.rank.color};
                text-shadow:0 0 8px ${w.rank.glow};white-space:nowrap;">
                ${w.rank.icon} ${w.rank.name}
              </span>
            </div>
            <div style="display:flex;gap:12px;font-size:10px;color:var(--muted);">
              <span>❓ ${w.questions} questions</span>
              <span>💬 ${w.answers} answers</span>
              <span>👍 ${w.upvotes} upvotes</span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:20px;font-weight:800;
              color:${w.rank.color};text-shadow:0 0 10px ${w.rank.glow};">
              ${w.score.toLocaleString()}
            </div>
            <div style="font-size:9px;color:var(--muted);letter-spacing:0.08em;">REP</div>
          </div>
        </div>`;
    }).join('');

  } catch(e) {
    const el2 = document.getElementById('leaderboard-list');
    if (el2) el2.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">Could not load leaderboard</div>';
  }
}

// ── YOUR STATS ────────────────────────────────────────────────
function renderStatsHTML(isConnected) {
  if (!isConnected) {
    return `
      <div style="text-align:center;padding:60px 20px;background:var(--surface);
        border:1px solid var(--border);border-radius:14px;">
        <div style="font-size:40px;margin-bottom:12px;">🔒</div>
        <div style="font-size:14px;color:var(--text);margin-bottom:6px;">Connect your wallet</div>
        <div style="font-size:12px;color:var(--muted);">Connect to see your reputation analytics</div>
      </div>`;
  }

  return `
    <!-- Activity breakdown -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">
        Your Activity
      </div>
      <div id="stats-activity-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        ${['questions','answers','upvotes','chat'].map(k => `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;
            display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:4px;" id="stats-label-${k}">
                ${{questions:'❓ Questions',answers:'💬 Answers',upvotes:'👍 Upvotes received',chat:'🗨️ Chat messages'}[k]}
              </div>
              <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:800;color:var(--text);" id="stats-count-${k}">…</div>
            </div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:16px;font-weight:800;
              color:${{questions:'var(--accent)',answers:'#66ffaa',upvotes:'#ffd700',chat:'#c084fc'}[k]};"
              id="stats-rep-${k}">…</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:16px;padding:14px 16px;background:var(--surface2);border:1px solid var(--border);
        border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:var(--muted);">Total Reputation</span>
        <span style="font-family:'Rajdhani',sans-serif;font-size:24px;font-weight:800;color:var(--accent);"
          id="stats-total-rep">…</span>
      </div>
    </div>

    <!-- Rank + position -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">
        Your Rank
      </div>
      <div id="stats-rank-block" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
        <div style="font-size:12px;color:var(--muted);">Loading…</div>
      </div>
    </div>

    <!-- Weekly Rewards Pool -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">
        Weekly Rewards Pool
      </div>
      <div id="stats-pool-block">
        <div style="font-size:12px;color:var(--muted);">Loading…</div>
      </div>
    </div>

    <!-- Estimated Reward -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">
        Your Estimated Reward
      </div>
      <div id="stats-reward-block">
        <div style="font-size:12px;color:var(--muted);">Loading…</div>
      </div>
    </div>
  `;
}

async function loadStatsData() {
  const wallet = typeof globalWalletAddress !== 'undefined' ? globalWalletAddress : null;
  if (!wallet) return;

  const MIN_CONTRIBUTORS = 10;

  try {
    const [qStats, chatStats] = await Promise.all([
      typeof fetchQuestionStats === 'function' ? fetchQuestionStats(wallet) : Promise.resolve({ myQuestions: [], myAnswers: [], totalUpvotes: 0 }),
      typeof fetchChatStats     === 'function' ? fetchChatStats(wallet)     : Promise.resolve({ msgCount: 0 }),
    ]);

    const { myQuestions = [], myAnswers = [], totalUpvotes = 0 } = qStats;
    const msgCount = chatStats?.msgCount || 0;

    // All-time REP
    const repQuestions = myQuestions.length * 40;
    const repAnswers   = myAnswers.length   * 15;
    const repUpvotes   = totalUpvotes       * 10;
    const repChat      = Math.min(msgCount, 20) * 2 + Math.max(0, msgCount - 20) * 0.4;
    const totalRep     = Math.round(repQuestions + repAnswers + repUpvotes + repChat);

    // Update activity grid
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    set('stats-count-questions', myQuestions.length);
    set('stats-count-answers',   myAnswers.length);
    set('stats-count-upvotes',   totalUpvotes);
    set('stats-count-chat',      msgCount);
    set('stats-rep-questions',   '+' + repQuestions.toLocaleString() + ' REP');
    set('stats-rep-answers',     '+' + repAnswers.toLocaleString()   + ' REP');
    set('stats-rep-upvotes',     '+' + repUpvotes.toLocaleString()   + ' REP');
    set('stats-rep-chat',        '+' + Math.round(repChat) + ' REP');
    set('stats-total-rep',       totalRep.toLocaleString() + ' REP');

    // Rank block
    const rank     = typeof getRank     === 'function' ? getRank(totalRep)     : null;
    const nextRank = typeof getNextRank === 'function' ? getNextRank(totalRep) : null;
    const rankEl   = document.getElementById('stats-rank-block');
    if (rankEl && rank) {
      const pct = nextRank
        ? Math.round(((totalRep - rank.minScore) / (nextRank.minScore - rank.minScore)) * 100)
        : 100;
      rankEl.innerHTML = `
        <div style="flex:1;">
          <div style="font-size:20px;font-weight:800;color:${rank.color};
            text-shadow:0 0 12px ${rank.glow};margin-bottom:8px;letter-spacing:0.08em;">
            ${rank.icon} ${rank.name}
          </div>
          ${nextRank ? `
            <div style="font-size:10px;color:var(--muted);margin-bottom:6px;">
              Progress to <span style="color:${nextRank.color};font-weight:700;">${nextRank.icon} ${nextRank.name}</span>
              · need <strong style="color:var(--text);">${(nextRank.minScore - totalRep).toLocaleString()}</strong> more REP
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${rank.bar},${nextRank.bar});
                border-radius:6px;box-shadow:0 0 8px ${rank.glow};transition:width 0.8s ease;"></div>
            </div>` : `
            <div style="font-size:11px;color:${rank.color};font-weight:700;letter-spacing:0.06em;">
              MAX RANK ACHIEVED
            </div>`}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;letter-spacing:0.08em;">REWARD MULTIPLIER</div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:28px;font-weight:800;
            color:${rank.color};text-shadow:0 0 10px ${rank.glow};">x${rank.multiplier}</div>
        </div>`;
    }

    // Fetch all questions for weekly scoring
    const WORKER_URL = typeof window.WORKER_URL !== 'undefined'
      ? window.WORKER_URL
      : 'https://terra-oracle-questions.vladislav-baydan.workers.dev';

    const res = await fetch(`${WORKER_URL}/questions`);
    const data = await res.json();
    const allQuestions = data.questions || [];

    // Build 7-day scores per wallet
    const cutoff7d      = Math.floor(Date.now() / 1000) - 7 * 86400;
    const weeklyScores  = {};
    for (const q of allQuestions) {
      if (!q.wallet || (q.createdAt || 0) < cutoff7d) continue;
      if (!weeklyScores[q.wallet]) weeklyScores[q.wallet] = 0;
      weeklyScores[q.wallet] += 40 + (q.votes || 0) * 10;
      for (const a of q.answers || []) {
        if (!a.wallet) continue;
        if (!weeklyScores[a.wallet]) weeklyScores[a.wallet] = 0;
        weeklyScores[a.wallet] += 15 + (a.votes || 0) * 10;
      }
    }
    // Include current user's 7d score
    const myWeeklyScore = weeklyScores[wallet] || Math.round(
      myQuestions.filter(q => (q.createdAt||0) >= cutoff7d).length * 40 +
      myAnswers.filter(a => (a.createdAt||0) >= cutoff7d).length * 15
    );
    if (!weeklyScores[wallet]) weeklyScores[wallet] = myWeeklyScore;

    const allWeeklyEntries  = Object.entries(weeklyScores).sort((a, b) => b[1] - a[1]);
    const totalContributors = allWeeklyEntries.length;
    const myPosition        = allWeeklyEntries.findIndex(([w]) => w === wallet) + 1;
    const top20pct          = Math.ceil(totalContributors * 0.2);
    const inTop20           = myPosition > 0 && myPosition <= top20pct;
    const poolActive        = totalContributors >= MIN_CONTRIBUTORS;

    // Fetch treasury balance
    let poolLunc = 0;
    try {
      const tRes  = await fetch('https://terra-classic-lcd.publicnode.com/cosmos/bank/v1beta1/balances/terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt');
      const tData = await tRes.json();
      const uluna = parseInt(tData.balances?.find(b => b.denom === 'uluna')?.amount || '0');
      poolLunc    = Math.round((uluna / 1_000_000) * 0.20);
    } catch(e) {}

    // Pool block
    const poolEl = document.getElementById('stats-pool-block');
    if (poolEl) {
      poolEl.innerHTML = `
        ${!poolActive ? `
          <div style="padding:14px 16px;background:rgba(255,165,0,0.06);border:1px solid rgba(255,165,0,0.2);
            border-radius:10px;margin-bottom:16px;">
            <div style="font-size:10px;color:rgba(255,165,0,0.9);font-weight:700;margin-bottom:6px;
              letter-spacing:0.1em;text-transform:uppercase;">Pool Inactive — Rollover Mode</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:12px;">
              Weekly rewards activate when <strong style="color:var(--text);">${MIN_CONTRIBUTORS} contributors</strong>
              are active. The pool accumulates and carries over each week until the threshold is reached.
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px;">
              <span>Contributors this week</span>
              <span style="color:var(--text);font-weight:700;">${totalContributors} / ${MIN_CONTRIBUTORS}</span>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:5px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(100, (totalContributors/MIN_CONTRIBUTORS)*100)}%;
                background:linear-gradient(90deg,rgba(255,165,0,0.5),rgba(255,165,0,0.85));border-radius:4px;"></div>
            </div>
          </div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:10px;color:var(--muted);margin-bottom:6px;letter-spacing:0.1em;text-transform:uppercase;">Weekly Pool</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:800;color:#66ffaa;">
              ${poolLunc > 0 ? poolLunc.toLocaleString() + ' LUNC' : '—'}
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px;">20% of Treasury</div>
          </div>
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:10px;color:var(--muted);margin-bottom:6px;letter-spacing:0.1em;text-transform:uppercase;">Your Status</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:15px;font-weight:800;
              color:${!poolActive ? 'rgba(255,165,0,0.9)' : inTop20 ? '#66ffaa' : 'var(--muted)'};">
              ${!poolActive ? 'Pending threshold' : inTop20 ? 'Top 20%' : 'Not eligible'}
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px;">
              ${myPosition > 0 ? 'Rank #' + myPosition + ' of ' + totalContributors : 'No activity this week'}
            </div>
          </div>
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:10px;color:var(--muted);margin-bottom:6px;letter-spacing:0.1em;text-transform:uppercase;">Your Weekly REP</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:800;color:var(--accent);">
              ${myWeeklyScore.toLocaleString()}
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px;">Last 7 days</div>
          </div>
        </div>`;
    }

    // Estimated reward
    const rewardEl = document.getElementById('stats-reward-block');
    if (rewardEl) {
      let estimatedLunc = 0;
      if (poolActive && inTop20 && poolLunc > 0 && rank) {
        const myWeighted = myWeeklyScore * rank.multiplier;
        const totalWeighted = allWeeklyEntries.slice(0, top20pct)
          .reduce((s, [w, score]) => {
            const r = typeof getRank === 'function' ? getRank(weeklyScores[w] || 0) : { multiplier: 1 };
            return s + score * r.multiplier;
          }, 0);
        if (totalWeighted > 0) estimatedLunc = Math.round(poolLunc * (myWeighted / totalWeighted));
      }

      rewardEl.innerHTML = !poolActive ? `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:13px;color:var(--muted);line-height:1.7;">
            The pool is accumulating. Rewards will be distributed once
            <strong style="color:var(--text);">${MIN_CONTRIBUTORS} active contributors</strong> are reached.
            Current pool: <strong style="color:#66ffaa;">${poolLunc > 0 ? poolLunc.toLocaleString() + ' LUNC' : '—'}</strong>
          </div>
        </div>` : inTop20 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:36px;font-weight:800;color:#ffd700;
              text-shadow:0 0 16px rgba(255,215,0,0.4);">
              ~${estimatedLunc > 0 ? estimatedLunc.toLocaleString() : '—'} LUNC
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;">
              ${myWeeklyScore.toLocaleString()} weekly REP x${rank?.multiplier || 1} multiplier
            </div>
          </div>
          <div style="font-size:11px;color:var(--muted);max-width:260px;line-height:1.7;">
            Distributed to top 20% contributors proportional to 7-day REP x rank multiplier.
          </div>
        </div>` : `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:13px;color:var(--muted);margin-bottom:8px;">
            You need to be in the <strong style="color:var(--text);">top 20%</strong> to earn weekly rewards
          </div>
          <div style="font-size:12px;color:var(--muted);">
            Current rank: <strong style="color:var(--text);">#${myPosition || '—'}</strong> of ${totalContributors} ·
            Top <strong style="color:var(--text);">${top20pct}</strong> qualify this week
          </div>
        </div>`;
    }

  } catch(err) {
    console.warn('loadStatsData error:', err);
  }
}

// ── HOW IT WORKS ──────────────────────────────────────────────
function renderHowItWorksHTML() {
  const ranks = typeof RANKS !== 'undefined' ? RANKS : [];

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;margin-bottom:16px;">
      <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;">
        What is Oracle Reputation
      </div>
      <p style="font-size:13px;color:var(--text);line-height:1.85;margin-bottom:20px;">
        Oracle Reputation (REP) measures your contribution to the Terra Oracle protocol.
        It is <strong style="color:var(--accent);">not a token or balance</strong> —
        it reflects your <strong style="color:var(--text);">activity, quality, and engagement</strong>
        across all protocol modules. REP accumulates over time and unlocks ranks, fee discounts, and weekly rewards.
      </p>
      <div style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">
        How REP is earned
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:16px;">
        ${[
          ['Ask a question',    '+40 REP per question', 'var(--accent)'],
          ['Answer a question', '+15 REP per answer',   '#66ffaa'      ],
          ['Upvote received',   '+10 REP per upvote',   '#ffd700'      ],
          ['Chat message',      '+2 REP — first 20/day','#c084fc'      ],
          ['Oracle Draw entry', '+10 REP per entry',    '#ff8844'      ],
        ].map(([label, rep, color]) => `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">${label}</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:16px;font-weight:800;color:${color};">${rep}</div>
          </div>`).join('')}
      </div>
      <div style="padding:14px 16px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">
          Anti-abuse limits
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);line-height:1.6;">
          <div>Chat messages beyond the first 20 per day earn 20% of the standard reward.</div>
          <div>Voting is capped at 20 votes per day per wallet.</div>
          <div>Self-votes on questions and answers are blocked.</div>
        </div>
      </div>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;margin-bottom:16px;">
      <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">
        Oracle Ascension
      </div>
      <p style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:18px;">
        As your REP grows, you ascend through 7 ranks. Each rank unlocks a fee discount on questions
        and a reward multiplier applied to your weekly earnings.
      </p>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${ranks.map(r => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;
            background:var(--surface2);border:1px solid var(--border);border-radius:10px;min-width:0;">
            <div style="font-size:12px;font-weight:800;color:${r.color};
              text-shadow:0 0 8px ${r.glow};flex:1;min-width:0;letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${r.icon} ${r.name}
            </div>
            <div style="font-size:10px;color:var(--muted);white-space:nowrap;flex-shrink:0;">
              ${r.minScore === 0 ? 'Start' : r.minScore.toLocaleString() + ' REP'}
            </div>
            <div style="font-size:10px;color:${r.color};font-weight:700;flex-shrink:0;opacity:${r.multiplier > 1 ? 1 : 0.4};">
              x${r.multiplier}
            </div>
            ${r.discount > 0 ? `<div style="font-size:10px;color:var(--green);flex-shrink:0;">−${r.discount}%</div>` : ''}
          </div>`).join('')}
      </div>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;margin-bottom:16px;">
      <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">
        Weekly Reward Pool
      </div>
      <p style="font-size:12px;color:var(--muted);line-height:1.85;margin-bottom:20px;">
        Each week, <strong style="color:var(--text);">20% of the Protocol Treasury</strong> is set aside as the reward pool.
        This pool is distributed to the <strong style="color:var(--text);">top 20% of contributors</strong>
        ranked by their REP earned in the last 7 days. Your share is proportional to your weekly REP
        multiplied by your rank multiplier.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px;letter-spacing:0.1em;text-transform:uppercase;">Reward formula</div>
          <div style="font-size:12px;color:var(--text);line-height:1.85;">
            Your share =<br>
            <span style="color:var(--accent);">(your 7-day REP x rank multiplier)</span><br>
            divided by total weighted REP of top 20%<br>
            multiplied by weekly pool
          </div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px;letter-spacing:0.1em;text-transform:uppercase;">Scoring period</div>
          <div style="font-size:12px;color:var(--text);line-height:1.85;">
            Only activity from the <strong style="color:var(--text);">last 7 days</strong> counts toward weekly rewards.
            All-time REP still determines your rank and fee discounts.
          </div>
        </div>
      </div>
      <div style="padding:14px 16px;background:rgba(255,165,0,0.05);border:1px solid rgba(255,165,0,0.2);
        border-radius:8px;margin-bottom:16px;">
        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,165,0,0.8);margin-bottom:8px;">
          Activation threshold
        </div>
        <div style="font-size:12px;color:var(--muted);line-height:1.7;">
          Weekly rewards only activate when at least <strong style="color:var(--text);">10 unique contributors</strong>
          are active in a given week. If the threshold is not met, the pool carries over to the following week
          and continues accumulating until the minimum is reached.
        </div>
      </div>
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">
        Rank multipliers
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">
        ${ranks.filter(r => r.multiplier > 1).map(r => `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:11px;font-weight:700;color:${r.color};margin-bottom:6px;letter-spacing:0.04em;">${r.icon} ${r.name}</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:800;color:${r.color};
              text-shadow:0 0 10px ${r.glow};">x${r.multiplier}</div>
          </div>`).join('')}
      </div>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;">
      <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">
        REP Persistence
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;color:var(--muted);line-height:1.85;">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px;letter-spacing:0.1em;text-transform:uppercase;">All-time REP</div>
          <div>Accumulates forever. Used to determine your rank and unlock fee discounts. Never resets.</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px;letter-spacing:0.1em;text-transform:uppercase;">Weekly REP</div>
          <div>Only activity from the last 7 days. Resets each week. Used exclusively for reward distribution.</div>
        </div>
      </div>
    </div>
  `;
}
