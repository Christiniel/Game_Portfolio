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
  openToWork: null, // null = follow saved snapshot status, then `hireable`; true/false = manual override
  // NOTE: no token here on purpose. The site runs token-free off github-data.json.
  // `githubToken` in config.js / `.env` is legacy and intentionally ignored.
  githubToken: '',
  statusMap: {},
  idleAfterDays: 14,
  offlineAfterDays: 60,
  // How stale the committed snapshot may get before we attempt ONE quiet
  // background refresh (unauthenticated). Normal loads = 0 API calls.
  snapshotMaxAgeHours: 24,
  liveRetryHours: 6,
}, SITE.status || {});
const CONFIG = {
  githubUsername: GITHUB_USER,
  perPage: 100,
  // last-resort fallback if even github-data.json can't load (e.g. file:// without fetch)
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
let lastUser = null, profileLimited = false, snapshotMeta = { fetchedAt: null, lastEventAt: null, profileStatus: null };

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

/* ---------- Responsive live status (offline-first, no token) ---------- */
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
/* Profile status comes from the saved snapshot (collected at sync time),
   never from a live token-authenticated call. */
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
/* ---------- Cloudflare proxy layer (uses dashboard GITHUB_TOKEN server-side) ----------
   On Cloudflare Pages, /api/github/* is handled by functions/api/_middleware.js,
   which injects the GITHUB_TOKEN secret server-side — the browser never sees it.
   Locally (python http.server) there is no Functions runtime, so we fall back to
   direct api.github.com calls. Probe result is cached per tab. */
let proxyChecked = null;
let proxyAuth = null; // 'authenticated' | 'anonymous' | null (null = no proxy / local)
async function proxyAlive(){
  if(proxyChecked !== null) return proxyChecked;
  try{
    const cached = sessionStorage.getItem('gh_proxy');
    if(cached === '1'){ proxyChecked = true; proxyAuth = sessionStorage.getItem('gh_proxy_auth') || null; return true; }
    if(cached === '0'){ proxyChecked = false; proxyAuth = null; return false; }
  }catch(e){}
  try{
    const r = await fetch('/api/github/zen', { cache: 'no-store' });
    proxyChecked = r.ok;
    // Safe boolean flag set server-side (never the token value itself).
    proxyAuth = proxyChecked ? (r.headers.get('x-proxy-auth') || 'anonymous') : null;
  }catch(e){ proxyChecked = false; proxyAuth = null; }
  try{
    sessionStorage.setItem('gh_proxy', proxyChecked ? '1' : '0');
    if(proxyAuth) sessionStorage.setItem('gh_proxy_auth', proxyAuth);
  }catch(e){}
  return proxyChecked;
}
/* Quest-log line reporting whether the server-side token is active.
   Safe: only reports the boolean proxy flag, never any secret value. */
async function logTokenStatus(){
  try{ await proxyAlive(); }catch(e){}
  if(proxyChecked && proxyAuth === 'authenticated'){
    log('> GitHub token: IN USE via Cloudflare proxy (server-side) 🔒');
  } else if(proxyChecked){
    log('> GitHub token: NOT SET — proxy anonymous (60/hr limit) ⚠');
  } else {
    log('> GitHub token: not via proxy (local snapshot mode, no browser token)');
  }
}
async function apiFetch(path, init = {}){
  // path like `/users/xxx` — routed via proxy when deployed, direct locally.
  // Never sends any token from the browser; the proxy adds GITHUB_TOKEN itself.
  if(await proxyAlive()){
    const headers = Object.assign({ Accept: 'application/vnd.github+json' }, init.headers || {});
    return fetch('/api/github' + path, Object.assign({}, init, { headers }));
  }
  const headers = Object.assign({ Accept: 'application/vnd.github+json' }, init.headers || {});
  return fetch('https://api.github.com' + path, Object.assign({}, init, { headers }));
}
async function fetchJson(url, ms = 8000){
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try{
    const r = url.includes('api.github.com')
      ? await apiFetch(url.replace('https://api.github.com', ''), { signal: c.signal })
      : await fetch(url, { signal: c.signal });
    if(r.status === 403){
      const err = new Error('GitHub rate limit reached — showing saved snapshot.');
      err.rateLimited = true;
      err.status = 403;
      throw err;
    }
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
/* Status is derived from saved data (snapshot.lastEventAt / user.updated_at).
   No GitHub API call here — that's what keeps normal page loads at 0 requests. */
function checkLiveStatus(user){
  if(user) lastUser = user;
  user = user || lastUser;
  profileLimited = false;
  // 1) badge: config override > saved snapshot profile status > `hireable`
  let fromProfile = false;
  if(SITE_STATUS.openToWork !== null && SITE_STATUS.openToWork !== undefined){
    setWorkStatus(!!SITE_STATUS.openToWork);
  } else {
    fromProfile = applyProfileStatus(snapshotMeta.profileStatus);
    if(!fromProfile){
      if(user && typeof user.hireable === 'boolean') setWorkStatus(user.hireable);
      else setWorkStatus(true);
    }
  }

  // 2) activity from saved timestamps (no events API call)
  if(!navigator.onLine){
    setAvatarStatus('offline', 'OFFLINE');
  } else {
    const last = snapshotMeta.lastEventAt || (user && user.updated_at);
    if(!last){
      setAvatarStatus('ONLINE', 'ONLINE');
    } else {
      const days = (Date.now() - new Date(last).getTime()) / 864e5;
      if(profileLimited){ setAvatarStatus('idle', 'IDLE'); }
      else if(days <= SITE_STATUS.idleAfterDays) setAvatarStatus('ONLINE', 'ONLINE');
      else if(days <= SITE_STATUS.offlineAfterDays) setAvatarStatus('idle', 'IDLE');
      else setAvatarStatus('offline', 'OFFLINE');
    }
  }

  // 3) github.com platform health (non-blocking, never fails the UI, not rate-limited)
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

/* ---------- Token-free data layer (browser never holds a token) ----------
   Priority: github-data.json (committed snapshot, 0 API cost) >
             localStorage live refresh (throttled) >
             hard-coded demoRepos (last resort).
   Live refresh goes via /api/github when deployed on Cloudflare Pages
   (Functions injects the dashboard GITHUB_TOKEN secret server-side),
   else direct to api.github.com. Failures silently keep the snapshot. */
const SNAP_KEY = `gh_live_${GITHUB_USER}`;
const CHECK_KEY = `gh_lastcheck_${GITHUB_USER}`;
const LANG_TTL = 7 * 864e5, README_TTL = 7 * 864e5;

function readLiveCache(){
  try{
    const c = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    if(c && Array.isArray(c.repos) && c.repos.length) return c;
  }catch(e){}
  return null;
}
function writeLiveCache(user, repos, lastEventAt){
  try{ localStorage.setItem(SNAP_KEY, JSON.stringify({ t: Date.now(), user, repos, lastEventAt })); }catch(e){}
}
function lastCheck(){
  try{ return parseInt(localStorage.getItem(CHECK_KEY) || '0', 10) || 0; }catch(e){ return 0; }
}
function markChecked(){ try{ localStorage.setItem(CHECK_KEY, String(Date.now())); }catch(e){} }
function snapshotAgeHours(){
  if(!snapshotMeta.fetchedAt) return Infinity;
  return (Date.now() - new Date(snapshotMeta.fetchedAt).getTime()) / 36e5;
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

async function loadGitHub(opts = {}){
  const { forceRefresh = false } = opts;
  const username = GITHUB_USER;
  statusEl.textContent = `⏳ Summoning @${username}...`;
  detailEl.innerHTML = '<div class="skel"></div>';
  if(!forceRefresh) blip(600, .08);

  // 1) Snapshot first — instant, zero API calls.
  let snap = null;
  try { snap = await loadSnapshotFile(); }
  catch(e){ /* file:// or missing file — fall through to caches */ }

  const live = readLiveCache();
  // Prefer whichever is fresher: committed snapshot vs previous live refresh.
  let user = null, repos = null, source = '';
  if(snap && snap.repos){
    snapshotMeta = { fetchedAt: snap.fetchedAt || null, lastEventAt: snap.lastEventAt || null, profileStatus: snap.profileStatus || null };
    user = snap.user; repos = snap.repos; source = `snapshot (${fmtAge(snap.fetchedAt)})`;
  }
  if(live && live.user){
    const liveTime = live.t || 0;
    const snapTime = snap && snap.fetchedAt ? new Date(snap.fetchedAt).getTime() : 0;
    if(liveTime > snapTime){
      user = live.user; repos = live.repos;
      snapshotMeta.lastEventAt = live.lastEventAt || snapshotMeta.lastEventAt;
      source = `last live sync (${fmtAge(new Date(liveTime).toISOString())})`;
    }
  }

  if(user && repos){
    renderFromData(user, repos, `✔ ${repos.filter(r => !r.fork).length || repos.length} quests loaded from ${source} • 🔒 LOCKED`);
    checkLiveStatus(user);
    // Quiet background refresh only if stale (or forced via RESYNC).
    const stale = snapshotAgeHours() > (SITE_STATUS.snapshotMaxAgeHours || 24);
    const retryDue = (Date.now() - lastCheck()) > ((SITE_STATUS.liveRetryHours || 6) * 36e5);
    if(forceRefresh || (stale && retryDue && navigator.onLine)){
      refreshLiveData(user, repos, forceRefresh);
    }
    return;
  }

  // 2) No snapshot & no live cache — last resort demo list (still no token needed).
  allRepos = CONFIG.demoRepos.map(r => ({
    ...r,
    html_url: r.html_url.replace(/github\.com\/[^/]+/, `github.com/${GITHUB_USER}`)
  }));
  buildRepoDropdown();
  statusEl.textContent = '⚠ Showing built-in quests (github-data.json missing). Run: node tools/sync-github.mjs';
  log('> No snapshot found — showing built-in quests.');
  checkLiveStatus(null);
}

function renderFromData(user, repos, msg){
  const visible = repos.filter(r => !r.fork);
  allRepos = [...(visible.length ? visible : repos)].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  renderUser(user, repos);
  buildRepoDropdown();
  statusEl.textContent = msg;
  log(`> Loaded ${allRepos.length} repos for @${user.login} (0 API calls)`);
  blip(880, .1); setTimeout(() => blip(1174, .14), 90);
}

/* Best-effort live refresh: 2 requests (user + repos) via Cloudflare proxy when
   deployed (server-side GITHUB_TOKEN, 5000/hr) else direct (60/hr).
   403/rate-limit/offline → silently keep snapshot. Browser never holds a token. */
async function refreshLiveData(prevUser, prevRepos, noisy){
  if(noisy) statusEl.textContent = `⏳ Resyncing @${GITHUB_USER}... (1–2 API calls, cached for hours)`;
  markChecked();
  try{
    const [uRes, rRes] = await Promise.all([
      apiFetch(`/users/${GITHUB_USER}`),
      apiFetch(`/users/${GITHUB_USER}/repos?per_page=${CONFIG.perPage}&sort=updated`),
    ]);
    if(uRes.status === 403 || rRes.status === 403) throw new Error('rate-limited');
    if(uRes.status === 404) throw new Error('GitHub user not found.');
    if(!uRes.ok) throw new Error('Could not load GitHub user.');
    if(!rRes.ok) throw new Error('Could not load repos.');
    const user = await uRes.json();
    const repos = await rRes.json();
    // Merge embedded snapshot extras (languages/readme) so refresh doesn't lose them.
    const extraByName = {};
    (prevRepos || []).forEach(r => { extraByName[r.name] = r; });
    const merged = repos.map(r => ({
      ...r,
      languages: r.languages || (extraByName[r.name] && extraByName[r.name].languages) || null,
      readmePreview: (extraByName[r.name] && extraByName[r.name].readmePreview) || null,
    }));
    // lastEventAt: keep snapshot value; try ONE events call, ignore failures.
    let lastEventAt = snapshotMeta.lastEventAt;
    try{
      const ev = await fetchJson(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=1`, 6000);
      if(Array.isArray(ev) && ev[0] && ev[0].created_at) lastEventAt = ev[0].created_at;
    }catch(e){ /* events endpoint is optional */ }
    writeLiveCache(user, merged, lastEventAt);
    if(lastEventAt) snapshotMeta.lastEventAt = lastEventAt;
    renderFromData(user, merged, `✔ ${merged.length} quests resynced just now • next refresh in ~${SITE_STATUS.liveRetryHours || 6}h`);
    checkLiveStatus(user);
    // Report whether this resync rode the server-side token or anonymous limit.
    if(proxyAuth === 'authenticated'){
      log('> Resync used GitHub token via Cloudflare proxy 🔒');
    } else if(proxyChecked){
      log('> Resync anonymous (no server token) — 60/hr limit ⚠');
    } else {
      log('> Resync direct (no proxy, no browser token)');
    }
  }catch(err){
    // Stay on snapshot — never an error state, never asks for a token.
    if(noisy) statusEl.textContent = `⚠ Live resync skipped (${err.rateLimited ? 'rate limit' : 'offline / API busy'}) — showing saved snapshot. Try again later.`;
    log(`> Live refresh skipped: ${err.message} (snapshot kept, 0 harm)`);
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

/* Cached per-repo extras: snapshot value > localStorage (7d TTL) > live fetch (cached after). */
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
  apiFetch(`/repos/${GITHUB_USER}/${r.name}/languages`)
    .then(x => x.ok ? x.json() : null).then(langs => {
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
  apiFetch(`/repos/${GITHUB_USER}/${r.name}/readme`, { headers: { Accept: 'application/vnd.github.raw' } })
    .then(x => x.ok ? x.text() : null).then(txt => {
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

  // Prefer embedded snapshot data — 0 API calls in the common case.
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

/* init — token-free: straight to snapshot, zero API calls on load.
   (Background RESYNC uses the Cloudflare proxy when deployed, so the
   dashboard GITHUB_TOKEN secret applies without ever reaching the browser.) */
applyLinks();
updateCoins();
loadGitHub();
log('> Loaded from local snapshot (no browser token needed)');
logTokenStatus();
// re-derive status from saved data every 5 min (still 0 API calls)
setInterval(() => checkLiveStatus(), 5 * 60 * 1000);
