/* ===== CONFIG — edit links in config.js (SITE_CONFIG), not here ===== */
const SITE = (typeof window !== 'undefined' && window.SITE_CONFIG) || {};
const GITHUB_USER = SITE.githubUsername || 'Christiniel'; // fallback if config.js missing
const SITE_LINKS = Object.assign({
  github: `https://github.com/${GITHUB_USER}`,
  linkedin: '',
  facebook: '',
  email: '',
  resume: '#contact'
}, SITE.links || {});
const SITE_STATUS = Object.assign({
  openToWork: null, // null = follow live GitHub status, then `hireable`; true/false = manual override
  statusMap: {},
  idleAfterDays: 14,
  offlineAfterDays: 60,
}, SITE.status || {});
const CONFIG = {
  githubUsername: GITHUB_USER,
  perPage: 100,
  // last-resort fallback if Worker API AND github-data.json are both unreachable
  demoRepos: [
    { name: 'MongoBackupRecovery', description: 'An Web-based back up and recovery tool for MongoDB', language: 'JavaScript', stargazers_count: 0, forks_count: 0, watchers_count: 0, open_issues_count: 0, size: 26, default_branch: 'main', created_at: '2026-09-26T10:02:46Z', updated_at: '2026-09-26T10:23:33Z', html_url: 'https://github.com/Christiniel/MongoBackupRecovery', homepage: '', fork: false },
    { name: 'SIA-Lab', description: 'Mysterious quest — no description yet.', language: 'JavaScript', stargazers_count: 0, forks_count: 1, watchers_count: 0, open_issues_count: 0, size: 168, default_branch: 'main', created_at: '2026-04-22T09:01:19Z', updated_at: '2026-04-22T09:02:38Z', html_url: 'https://github.com/Christiniel/SIA-Lab', homepage: '', fork: false },
    { name: 'solaris-collab', description: 'collab', language: 'JavaScript', stargazers_count: 0, forks_count: 0, watchers_count: 0, open_issues_count: 0, size: 1126, default_branch: 'main', created_at: '2026-03-30T03:39:18Z', updated_at: '2026-03-30T11:01:09Z', html_url: 'https://github.com/Christiniel/solaris-collab', homepage: '', fork: false },
    { name: 'flask-mssql-app', description: 'Flask + MSSQL app.', language: 'Python', stargazers_count: 0, forks_count: 0, watchers_count: 0, open_issues_count: 0, size: 6, default_branch: 'main', created_at: '2025-10-06T12:13:55Z', updated_at: '2025-10-09T13:04:44Z', html_url: 'https://github.com/Christiniel/flask-mssql-app', homepage: '', fork: false },
  ]
};

const $ = (s) => document.querySelector(s);
const detailEl = $('#repo-detail'), statusEl = $('#gh-status'), repoSelect = $('#repo-select');
let allRepos = [], selectedIdx = 0, coins = parseInt(localStorage.getItem('coins')||'0',10) || 0;
let lastUser = null, profileLimited = false, lastEventAt = null;

const LANG_COLORS = { JavaScript:'#f7df1e', TypeScript:'#3178c6', Python:'#3572A5', HTML:'#e34c26', CSS:'#563d7c', Java:'#b07219', 'C++':'#f34b7d', Go:'#00ADD8', Rust:'#dea584', Shell:'#89e051', Vue:'#41b883', Svelte:'#ff3e00' };
const langColor = (l) => LANG_COLORS[l] || '#2EC4B6';

/* ---------- Editable links (from config.js) ---------- */
function applyLinks(){
  const set = (sel, href) => {
    if(!href) return;
    document.querySelectorAll(sel).forEach(a => { a.href = href; });
  };
  set('#link-github, #tavern-github', SITE_LINKS.github);
  set('#link-linkedin, #tavern-linkedin', SITE_LINKS.linkedin);
  set('#link-facebook, #tavern-facebook', SITE_LINKS.facebook);
  set('#link-email, #tavern-email', SITE_LINKS.email);
  set('#link-resume', SITE_LINKS.resume);
  // resume should download, not navigate — keep download attr for file links
  document.querySelectorAll('#link-resume').forEach(a => {
    const href = a.getAttribute('href') || '';
    if(href && !href.startsWith('#')){
      a.setAttribute('download', 'Christiniel-Resume.pdf');
      a.removeAttribute('target');
    } else {
      a.removeAttribute('download');
    }
  });
  // hide buttons with empty links so no dead buttons show
  ['#link-linkedin', '#link-facebook', '#link-email',
   '#tavern-linkedin', '#tavern-facebook', '#tavern-email'].forEach(sel => {
    const el = document.querySelector(sel);
    if(el && !el.getAttribute('href')) el.style.display = 'none';
  });
  // keep the locked badge in sync with config username
  const badgeUser = document.querySelector('.user-badge strong');
  if(badgeUser) badgeUser.textContent = '@' + GITHUB_USER;
}

/* ---------- Responsive live status ---------- */
function setAvatarStatus(mode, label){
  const dot = $('#status-dot'), txt = $('#avatar-status-text');
  if(!dot || !txt) return;
  dot.className = 'dot ' + (mode === 'ONLINE' ? '' : mode.toLowerCase());
  if(mode === 'ONLINE') dot.className = 'dot';
  txt.textContent = label || mode;
}
function setWorkStatus(open){
  const el = $('#work-status');
  if(!el) return;
  if(open){
    el.textContent = '● OPEN TO WORK';
    el.className = 'hl-green';
    el.style.color = '';
  } else {
    el.textContent = '● BUSY';
    el.className = '';
    el.style.color = 'var(--red)';
  }
}
function setWorkLabel(label, busy){
  const el = $('#work-status');
  if(!el) return;
  el.textContent = label;
  if(busy){
    el.className = '';
    el.style.color = 'var(--red)';
  } else {
    el.className = 'hl-green';
    el.style.color = '';
  }
}
/* Profile status: config override > live `hireable` field > default open. */
function applyProfileStatus(st){
  if(!st || !st.message) return false;
  const raw = String(st.message).trim();
  if(!raw) return false;
  const msg = raw.toLowerCase();
  // 1) custom map from config.js (first partial match wins)
  const map = SITE_STATUS.statusMap || {};
  for(const key of Object.keys(map)){
    if(key && msg.includes(key.toLowerCase())){
      const m = map[key];
      setWorkLabel(m.label || (`● ${raw.toUpperCase()}`).slice(0, 30), !!m.busy);
      profileLimited = !!st.indicatesLimitedAvailability;
      if(profileLimited) setAvatarStatus('idle', 'IDLE');
      return true;
    }
  }
  // 2) built-in guesses
  const limited = !!st.indicatesLimitedAvailability;
  profileLimited = limited;
  if(/sick|ill|hospital|out sick/.test(msg)){ setWorkLabel('● OUT SICK', true); return true; }
  if(/vacation|holiday|ooo|out of office|on leave|away|afk/.test(msg) || limited){
    setWorkLabel(`● ${raw.toUpperCase()}`.slice(0, 30), true);
    setAvatarStatus('idle', 'IDLE');
    return true;
  }
  if(/open to work|available|hireable|looking for|freelance/.test(msg)){ setWorkStatus(true); return true; }
  if(/busy|focus|heads down|exam|studying|do not disturb/.test(msg)){ setWorkLabel(`● ${raw.toUpperCase()}`.slice(0, 30), true); return true; }
  // 3) any other custom message — show it as-is (truncated)
  const emoji = st.emoji ? `${st.emoji} ` : '';
  setWorkLabel(`${emoji}● ${raw.toUpperCase()}`.slice(0, 34), limited);
  return true;
}
function setGhApi(state, label){
  const dot = $('#gh-dot'), txt = $('#gh-live-text');
  if(!dot || !txt) return;
  dot.className = 'mini-dot ' + state; // ok | warn | down
  txt.textContent = label;
}

/* ---------- Secure Worker API layer ----------
   Browser → same-origin /api/github/* → Cloudflare Worker → api.github.com
   using the server-side GITHUB_TOKEN secret. The browser NEVER talks to
   api.github.com directly and NEVER holds any token. Locally (no Worker)
   these requests 404 → we fall back to the github-data.json snapshot. */
let workerAuth = null; // 'authenticated' | 'anonymous' | null (in-memory only)

/* Quest-log line reporting whether the server-side token is active.
   Safe: only reports the boolean Worker flag, never any secret value. */
async function logTokenStatus(){
  try{
    const r = await fetch('/api/github/zen', { cache: 'no-store' });
    if(!r.ok){ log('> GitHub link: Worker API unreachable — using saved snapshot'); return; }
    const flag = r.headers.get('x-proxy-auth');
    workerAuth = flag || 'anonymous';
  }catch(e){
    log('> GitHub link: Worker API unreachable — using saved snapshot');
    return;
  }
  if(workerAuth === 'authenticated'){
    log('> GitHub token: IN USE via Worker (server-side) 🔒');
  } else {
    log('> GitHub token: NOT SET on Worker — check dashboard secret ⚠');
  }
}

// Same-origin GitHub read via the Worker. Throws on any failure so callers
// can fall back to the snapshot. Never touches api.github.com directly.
async function gh(path, { raw = false, timeout = 10000 } = {}){
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try{
    const headers = { Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json' };
    const r = await fetch('/api/github' + path, { signal: c.signal, headers, cache: 'no-store' });
    if(!r.ok){
      const err = new Error('GitHub request failed (HTTP ' + r.status + ')');
      err.status = r.status;
      throw err;
    }
    const flag = r.headers.get('x-proxy-auth');
    if(flag) workerAuth = flag;
    return raw ? r.text() : r.json();
  } finally { clearTimeout(t); }
}

async function fetchJson(url, ms = 8000){
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try{
    const r = await fetch(url, { signal: c.signal });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* Live status: OPEN TO WORK badge + ONLINE/IDLE/OFFLINE from latest activity
   fetched at runtime through the Worker (authenticated server-side). */
async function checkLiveStatus(user){
  if(user) lastUser = user;
  user = user || lastUser;
  profileLimited = false;
  // 1) badge: config override > `hireable` field
  if(SITE_STATUS.openToWork !== null && SITE_STATUS.openToWork !== undefined){
    setWorkStatus(!!SITE_STATUS.openToWork);
  } else {
    if(user && typeof user.hireable === 'boolean') setWorkStatus(user.hireable);
    else setWorkStatus(true);
  }

  // 2) activity from the latest public event (fetched live via Worker)
  setAvatarStatus('checking', 'CHECKING…');
  if(!navigator.onLine){
    setAvatarStatus('offline', 'OFFLINE');
  } else {
    try{
      const events = await gh('/events?per_page=5', { timeout: 8000 });
      const last = events && events[0] && events[0].created_at;
      if(last) lastEventAt = last;
      if(!lastEventAt){
        const upd = user && user.updated_at ? (Date.now() - new Date(user.updated_at).getTime()) / 864e5 : Infinity;
        if(upd <= SITE_STATUS.idleAfterDays) setAvatarStatus('ONLINE', 'ONLINE');
        else setAvatarStatus('idle', 'IDLE');
      } else {
        const days = (Date.now() - new Date(lastEventAt).getTime()) / 864e5;
        if(profileLimited){ setAvatarStatus('idle', 'IDLE'); }
        else if(days <= SITE_STATUS.idleAfterDays) setAvatarStatus('ONLINE', 'ONLINE');
        else if(days <= SITE_STATUS.offlineAfterDays) setAvatarStatus('idle', 'IDLE');
        else setAvatarStatus('offline', 'OFFLINE');
      }
    }catch(e){
      if(user && user.login) setAvatarStatus('ONLINE', 'ONLINE');
      else setAvatarStatus('idle', 'IDLE?');
    }
  }

  // 3) github.com platform health (non-blocking, never fails the UI)
  setGhApi('', 'GitHub: checking…');
  fetchJson('https://www.githubstatus.com/api/v2/status.json', 7000).then(s => {
    const ind = s && s.status && s.status.indicator;
    if(ind === 'none') setGhApi('ok', 'GitHub: OPERATIONAL');
    else if(ind === 'minor') setGhApi('warn', 'GitHub: DEGRADED');
    else setGhApi('down', 'GitHub: ' + String(ind || 'ISSUE').toUpperCase());
  }).catch(() => {
    setGhApi('', 'GitHub: UNKNOWN');
  });
}
window.addEventListener('online', () => checkLiveStatus());
window.addEventListener('offline', () => {
  setAvatarStatus('offline', 'OFFLINE');
  setGhApi('down', 'GitHub: OFFLINE');
});

/* ---------- SFX (WebAudio 8-bit blips, no files needed) ---------- */
let soundOn = true;
function blip(freq=440, dur=0.08, type='square'){
  if(!soundOn) return;
  try{
    const ctx = blip.ctx || (blip.ctx = new (window.AudioContext||window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+dur);
  }catch(e){}
}
const coinSfx = () => { blip(988,.07); setTimeout(()=>blip(1319,.12),70); };

/* ---------- Typewriter ---------- */
const phrases = ['Full-Stack Developer', 'JavaScript + Python / Flask', 'MongoDB Backup Tool Builder', 'Open Source Quester'];
let pi=0, ci=0, del=false;
(function type(){
  const el = $('#typewriter'); if(!el) return;
  const cur = phrases[pi];
  el.textContent = cur.slice(0, ci);
  if(!del){ ci++; if(ci>cur.length){ del=true; return setTimeout(type,1400);} }
  else { ci--; if(ci===0){ del=false; pi=(pi+1)%phrases.length; } }
  setTimeout(type, del?30:70);
})();

/* ---------- Live GitHub data (via secure Worker, snapshot fallback) ----------
   Priority: live Worker API (fresh repos/activity, server-authenticated) >
             github-data.json snapshot (offline / local dev) >
             hard-coded demoRepos (last resort).
   The browser never contacts api.github.com and never sees any token. */
const SNAP_KEY = `gh_live_${GITHUB_USER}`;
const LANG_TTL = 7 * 864e5, README_TTL = 7 * 864e5;

function readLiveCache(){
  try{
    const c = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    if(c && Array.isArray(c.repos) && c.repos.length) return c;
  }catch(e){}
  return null;
}
function writeLiveCache(user, repos){
  try{ localStorage.setItem(SNAP_KEY, JSON.stringify({ t: Date.now(), user, repos })); }catch(e){}
}
function fmtAge(iso){
  if(!iso) return 'unknown date';
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if(mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if(h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

async function loadSnapshotFile(){
  const r = await fetch('github-data.json', { cache: 'no-store' });
  if(!r.ok) throw new Error('no snapshot file');
  return r.json();
}

function renderUser(user, repos){
  $('#avatar').src = user.avatar_url;
  $('#dialog-name').textContent = '@' + user.login;
  $('#github-bio').textContent = user.bio || `${user.name || user.login} • ${user.public_repos} public quests.`;
  $('#link-github').href = user.html_url;
  $('#stat-repos').textContent = user.public_repos;
  $('#stat-followers').textContent = user.followers;
  const visible = repos.filter(r => !r.fork);
  $('#stat-stars').textContent = (visible.length ? visible : repos).reduce((a, r) => a + (r.stargazers_count || 0), 0);
  $('#hero-name').textContent = (user.name || user.login).toUpperCase().slice(0, 24);
}

function renderFromData(user, repos, msg){
  const visible = repos.filter(r => !r.fork);
  allRepos = [...(visible.length ? visible : repos)].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  renderUser(user, repos);
  buildRepoDropdown();
  statusEl.textContent = msg;
  log(`> Loaded ${allRepos.length} repos for @${user.login}`);
  blip(880, .1); setTimeout(() => blip(1174, .14), 90);
}

function renderSnapshotFallback(reason){
  return loadSnapshotFile().then(snap => {
    if(!snap || !Array.isArray(snap.repos) || !snap.repos.length) throw new Error('empty snapshot');
    lastEventAt = snap.lastEventAt || null;
    renderFromData(snap.user, snap.repos, `✔ ${snap.repos.length} quests from saved snapshot (${fmtAge(snap.fetchedAt)}) • ${reason}`);
    checkLiveStatus(snap.user);
  }).catch(() => {
    allRepos = CONFIG.demoRepos.map(r => ({
      ...r,
      html_url: r.html_url.replace(/github\.com\/[^/]+/, `github.com/${GITHUB_USER}`)
    }));
    buildRepoDropdown();
    statusEl.textContent = '⚠ Showing built-in quests (live API + snapshot unavailable).';
    log('> Live API and snapshot unavailable — showing built-in quests.');
    checkLiveStatus(null);
  });
}

// Fetch the LATEST profile + ALL repos at runtime through the Worker.
// Repos are paginated (per_page=100, up to 10 pages = 1000 repos max).
const BUILD = 'live-worker-v2';
async function fetchAllRepos(){
  const all = [];
  for(let page = 1; page <= 10; page++){
    const batch = await gh(`/repos?per_page=100&sort=updated&page=${page}`);
    if(!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    if(batch.length < 100) break;
  }
  return all;
}
async function loadGitHub(opts = {}){
  const { forceRefresh = false } = opts;
  const username = GITHUB_USER;
  statusEl.textContent = `⏳ Summoning @${username}...`;
  detailEl.innerHTML = '<div class="skel"></div>';
  if(!forceRefresh) blip(600, .08);

  try{
    const [user, repos] = await Promise.all([
      gh('/profile'),
      fetchAllRepos(),
    ]);
    if(!user || !user.login) throw new Error('GitHub user not found.');
    if(!Array.isArray(repos)) throw new Error('Could not load repos.');
    writeLiveCache(user, repos);
    lastEventAt = null; // refreshed from live events in checkLiveStatus
    renderFromData(user, repos, `✔ ${repos.filter(r => !r.fork).length || repos.length} quests synced live from @${username} • 🔒 LOCKED`);
    log(`> Live sync from @${username} via secure Worker`);
    checkLiveStatus(user);
  }catch(err){
    const cached = readLiveCache();
    if(cached && cached.user){
      lastEventAt = null;
      renderFromData(cached.user, cached.repos, `✔ ${cached.repos.length} quests from last live sync (${fmtAge(new Date(cached.t).toISOString())})`);
      checkLiveStatus(cached.user);
      log(`> Live API hiccup (${err.status || 'offline'}) — showing last live sync.`);
      return;
    }
    await renderSnapshotFallback('live API hiccup');
    log(`> Live API hiccup (${err.status || 'offline'}) — showing snapshot.`);
  }
}

function buildRepoDropdown(){
  repoSelect.innerHTML = allRepos.map((r,i)=>
    `<option value="${i}">${escapeHtml(r.name)}</option>`
  ).join('');
  selectedIdx = 0;
  repoSelect.value = '0';
  renderDetail();
}

function fmtDate(d){ try{ return new Date(d).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }catch(e){ return '—'; } }

/* Cached per-repo extras: live via Worker > localStorage (7d TTL). */
function readExtra(kind, repoName){
  try{
    const c = JSON.parse(localStorage.getItem(`gh_${kind}_${GITHUB_USER}_${repoName}`) || 'null');
    if(c && (Date.now() - c.t) < (kind === 'lang' ? LANG_TTL : README_TTL)) return c.v;
  }catch(e){}
  return undefined;
}
function writeExtra(kind, repoName, v){
  try{ localStorage.setItem(`gh_${kind}_${GITHUB_USER}_${repoName}`, JSON.stringify({ t: Date.now(), v })); }catch(e){}
}

function renderLangBar(r){
  const box = $('#lang-bar'); if(!box) return;
  if(r.languages && Object.keys(r.languages).length){
    paintLangs(box, r.languages, r.language);
    return;
  }
  const cached = readExtra('lang', r.name);
  if(cached && Object.keys(cached).length){ paintLangs(box, cached, r.language); return; }
  if(cached){ box.innerHTML = `<span><i class="lang-dot" style="background:${langColor(r.language)}"></i>${escapeHtml(r.language || 'code')}</span>`; return; }
  gh(`/repos/${GITHUB_USER}/${r.name}/languages`)
    .then(langs => {
      if(!langs || !Object.keys(langs).length){
        box.innerHTML = `<span><i class="lang-dot" style="background:${langColor(r.language)}"></i>${escapeHtml(r.language || 'code')}</span>`;
        writeExtra('lang', r.name, {});
        return;
      }
      writeExtra('lang', r.name, langs);
      if(document.querySelector('#lang-bar') === box) paintLangs(box, langs, r.language);
    }).catch(() => {
      box.innerHTML = `<span><i class="lang-dot" style="background:${langColor(r.language)}"></i>${escapeHtml(r.language || 'code')}</span>`;
    });
}
function paintLangs(box, langs, fallback){
  if(!langs || !Object.keys(langs).length){
    box.innerHTML = `<span><i class="lang-dot" style="background:${langColor(fallback)}"></i>${escapeHtml(fallback || 'code')}</span>`;
    return;
  }
  const total = Object.values(langs).reduce((a, b) => a + b, 0);
  const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4);
  box.innerHTML = `<div class="lang-segments">` + top.map(([l, v]) =>
    `<span style="width:${(v / total * 100).toFixed(1)}%;background:${langColor(l)}" title="${escapeHtml(l)} ${(v / total * 100).toFixed(1)}%"></span>`
  ).join('') + `</div><div class="lang-labels">` + top.map(([l, v]) =>
    `<span><i class="lang-dot" style="background:${langColor(l)}"></i>${escapeHtml(l)} ${(v / total * 100).toFixed(0)}%</span>`
  ).join('') + `</div>`;
}
function renderReadme(r){
  const box = $('#readme-box'); if(!box) return;
  if(r.readmePreview){
    paintReadme(box, r.readmePreview, r.readmePreview.length >= 1200, r.html_url);
    return;
  }
  const cached = readExtra('readme', r.name);
  if(cached !== undefined){
    if(!cached){ box.innerHTML = `<span class="muted">No README found. <a href="${r.html_url}" target="_blank" rel="noopener">Open on GitHub →</a></span>`; return; }
    paintReadme(box, cached, false, r.html_url);
    return;
  }
  gh(`/repos/${GITHUB_USER}/${r.name}/readme`, { raw: true })
    .then(txt => {
      if(document.querySelector('#readme-box') !== box) return;
      if(!txt){ box.innerHTML = `<span class="muted">No README found. <a href="${r.html_url}" target="_blank" rel="noopener">Open on GitHub →</a></span>`; writeExtra('readme', r.name, null); return; }
      writeExtra('readme', r.name, txt.slice(0, 1200));
      paintReadme(box, txt.slice(0, 900), txt.length > 900, r.html_url);
    }).catch(() => {
      if(document.querySelector('#readme-box') === box) box.innerHTML = `<span class="muted">README unavailable offline. <a href="${r.html_url}" target="_blank" rel="noopener">Open on GitHub →</a></span>`;
    });
}
function paintReadme(box, preview, truncated, url){
  box.innerHTML = `<h4>📖 README PREVIEW</h4><pre>${escapeHtml(preview)}${truncated ? '…' : ''}</pre><a href="${url}" target="_blank" rel="noopener">Read full on GitHub →</a>`;
}

async function renderDetail(){
  const r = allRepos[selectedIdx];
  if(!r){ detailEl.innerHTML = '<p class="status">∅ No quests found.</p>'; return; }
  $('#quest-counter').textContent = `${selectedIdx + 1} / ${allRepos.length}`;

  detailEl.innerHTML = `
    <article class="repo-detail pixel-box-sm">
      <div class="detail-head">
        <h3>${escapeHtml(r.name)}</h3>
        <span class="detail-badge">${escapeHtml(r.language || 'misc')}</span>
      </div>
      <p class="detail-desc">${escapeHtml(r.description || 'No description — mysterious quest.')}</p>
      <div class="detail-stats">
        <span>★ ${r.stargazers_count ?? 0} stars</span>
        <span>⑂ ${r.forks_count ?? 0} forks</span>
        <span>👁 ${r.watchers_count ?? 0} watchers</span>
        <span>❗ ${r.open_issues_count ?? 0} issues</span>
        <span>💾 ${r.size ?? 0} KB</span>
        <span>🌿 ${escapeHtml(r.default_branch || 'main')}</span>
      </div>
      <div class="detail-dates muted">
        <span>created ${fmtDate(r.created_at)}</span> • <span>updated ${fmtDate(r.updated_at)}</span>
      </div>
      <div id="lang-bar" class="lang-bar"><span class="muted">loading languages...</span></div>
      <div id="readme-box" class="readme-box"><span class="muted">loading README...</span></div>
      <div class="repo-foot">
        <a class="btn btn-small" href="${r.html_url}" target="_blank" rel="noopener">VIEW CODE ▶</a>
        ${r.homepage ? `<a class="btn btn-small btn-alt" href="${r.homepage}" target="_blank" rel="noopener">LIVE DEMO ▶</a>` : ''}
      </div>
    </article>`;

  if(r.name){
    renderLangBar(r);
    renderReadme(r);
  }
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Events ---------- */
$('#refresh-btn').onclick = () => loadGitHub({ forceRefresh: true });
repoSelect.addEventListener('change', (e)=>{ selectedIdx = parseInt(e.target.value,10)||0; blip(700,.06); renderDetail(); });
$('#prev-repo').onclick = ()=>{ if(!allRepos.length) return; selectedIdx = (selectedIdx-1+allRepos.length)%allRepos.length; repoSelect.value=String(selectedIdx); blip(500,.06); renderDetail(); };
$('#next-repo').onclick = ()=>{ if(!allRepos.length) return; selectedIdx = (selectedIdx+1)%allRepos.length; repoSelect.value=String(selectedIdx); blip(800,.06); renderDetail(); };
$('#sound-btn').onclick = (e)=>{ soundOn=!soundOn; e.target.textContent = soundOn?'🔊':'🔇'; if(soundOn) coinSfx(); };
$('#scan-btn').onclick = ()=>{ $('#scanlines').classList.toggle('hidden'); blip(300,.07); };

/* mobile menu */
$('#menu-btn').onclick = ()=>{ $('#nav-links').classList.toggle('open'); blip(500,.06); };
document.querySelectorAll('#nav-links a').forEach(a=>a.onclick=()=>$('#nav-links').classList.remove('open'));

/* coins on click */
function updateCoins(){ $('#coin-count').textContent = `🪙 ${coins}`; localStorage.setItem('coins', coins); }
document.addEventListener('pointerdown', (e)=>{
  coins++; updateCoins(); coinSfx();
  const s = document.createElement('span');
  s.className='coin-pop'; s.textContent='+1 🪙';
  s.style.left=e.clientX+'px'; s.style.top=e.clientY+'px';
  $('#float-layer').appendChild(s); setTimeout(()=>s.remove(),1000);
});

/* scroll: HP bar + reveal + xp + to-top */
const toTop = $('#to-top');
window.addEventListener('scroll', ()=>{
  const h = document.documentElement;
  const pct = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
  $('#hp-fill').style.width = pct + '%';
  toTop.style.display = h.scrollTop > 500 ? 'block' : 'none';
}, {passive:true});
toTop.onclick = ()=> window.scrollTo({top:0, behavior:'smooth'});

const io = new IntersectionObserver((es)=>es.forEach(e=>{
  if(!e.isIntersecting) return;
  e.target.classList.add('visible');
  e.target.querySelectorAll('.xp div').forEach(b=> b.style.width = b.dataset.xp+'%');
  io.unobserve(e.target);
}),{threshold:.15});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
document.querySelectorAll('#skills').forEach(el=>io.observe(el));

/* Konami easter egg */
const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let ki=0;
document.addEventListener('keydown',(e)=>{
  ki = (e.key===seq[ki]) ? ki+1 : 0;
  if(ki===seq.length){ ki=0;
    log('> KONAMI! +100 coins CHEAT ACTIVATED');
    coins+=100; updateCoins();
    document.body.style.filter='hue-rotate(90deg)';
    setTimeout(()=>document.body.style.filter='',2000);
    for(let i=0;i<5;i++) setTimeout(()=>coinSfx(), i*120);
  }
});

/* contact form -> quest log */
function log(msg){
  const li = document.createElement('li'); li.textContent = msg;
  const ul = $('#quest-log'); ul.prepend(li);
  while(ul.children.length>6) ul.lastChild.remove();
}
$('#contact-form').addEventListener('submit',(e)=>{
  e.preventDefault();
  const f = new FormData(e.target);
  log(`> ${f.get('name')}: ${String(f.get('msg')).slice(0,60)}...`);
  $('#form-msg').textContent = '✔ Quest note received! I\'ll reply soon.';
  $('#form-msg').style.color = 'green';
  coinSfx(); e.target.reset();
  setTimeout(()=> $('#form-msg').textContent='',4000);
});

/* init — live data via secure Worker (server-side token, never in browser) */
applyLinks();
updateCoins();
loadGitHub();
log(`> [${BUILD}] Fetching latest quests via secure Worker…`);
logTokenStatus();
// re-check live activity every 5 min (runtime fetch through Worker)
setInterval(() => checkLiveStatus(), 5 * 60 * 1000);
