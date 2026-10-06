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
  openToWork: null, // null = follow GitHub profile status, then `hireable`; true/false = manual override
  githubToken: '',
  statusMap: {},
  idleAfterDays: 14,
  offlineAfterDays: 60
}, SITE.status || {});
const CONFIG = {
  githubUsername: GITHUB_USER,
  perPage: 100,
  // fallback demo repos (your real quests — shown if API rate-limited/offline)
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
let lastUser = null, profileLimited = false;

const LANG_COLORS = { JavaScript:'#f7df1e', TypeScript:'#3178c6', Python:'#3572A5', HTML:'#e34c26', CSS:'#563d7c', Java:'#b07219', 'C++':'#f34b7d', Go:'#00ADD8', Rust:'#dea584', Shell:'#89e051', Vue:'#41b883', Svelte:'#ff3e00' };
const langColor = (l) => LANG_COLORS[l] || '#2EC4B6';

/* ---------- .env loader (GITHUB_TOKEN) ---------- */
async function loadEnv(){
  // config.js value wins if already set; otherwise try `.env` (gitignored).
  if((SITE_STATUS.githubToken || '').trim()) return;
  try{
    const r = await fetch('.env', { cache: 'no-store' });
    if(!r.ok) return;
    const txt = await r.text();
    for(const line of txt.split('\n')){
      const t = line.trim();
      if(!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if(k === 'GITHUB_TOKEN' && v){ SITE_STATUS.githubToken = v; return; }
    }
  }catch(e){ /* file:// or missing .env — stay unauthenticated */ }
}

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

/* ---------- Responsive live status (GitHub-checked) ---------- */
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
/* GitHub "What's happening" profile status via GraphQL (needs token, even for public) */
async function fetchGitHubUserStatus(){
  const token = (SITE_STATUS.githubToken || '').trim();
  if(!token) return null;
  const query = 'query($login:String!){ user(login:$login){ status{ message emoji indicatesLimitedAvailability } } }';
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try{
    const r = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      signal: c.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query, variables: { login: GITHUB_USER } })
    });
    if(!r.ok) return null;
    const j = await r.json();
    return (j && j.data && j.data.user && j.data.user.status) || null;
  }catch(e){ return null; }
  finally { clearTimeout(t); }
}
/* Map a profile status like "Out sick" / "Open to work" onto line 97 badge */
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
async function fetchJson(url, ms = 8000){
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try{
    const headers = { 'Accept': 'application/vnd.github+json' };
    const token = (SITE_STATUS.githubToken || '').trim();
    if(token && url.includes('api.github.com')) headers['Authorization'] = `Bearer ${token}`;
    const r = await fetch(url, { signal: c.signal, headers });
    if(r.status === 403){
      const remaining = r.headers.get('X-RateLimit-Remaining');
      const err = new Error('Rate limit hit — showing saved quests. Wait a minute.');
      err.rateLimited = remaining === '0' || true;
      err.status = 403;
      throw err;
    }
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function checkLiveStatus(user){
  if(user) lastUser = user;
  user = user || lastUser;
  profileLimited = false;
  // 1) line 97 badge: config override > GitHub "What's happening" > `hireable`
  let fromProfile = false;
  if(SITE_STATUS.openToWork !== null && SITE_STATUS.openToWork !== undefined){
    setWorkStatus(!!SITE_STATUS.openToWork);
  } else {
    const st = await fetchGitHubUserStatus();
    fromProfile = applyProfileStatus(st);
    if(!fromProfile){
      if(user && typeof user.hireable === 'boolean') setWorkStatus(user.hireable);
      else setWorkStatus(true);
    }
  }

  // 2) activity status from last public event (browsing github.com creates NO event)
  setAvatarStatus('checking', 'CHECKING…');
  if(!navigator.onLine){
    setAvatarStatus('offline', 'OFFLINE');
  } else {
    try{
      const events = await fetchJson(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=5`);
      const last = events && events[0] && events[0].created_at;
      if(!last){
        // no PUBLIC events (private-only or quiet account) — fall back to
        // profile updated_at so an active account doesn't read IDLE
        const upd = user && user.updated_at ? (Date.now() - new Date(user.updated_at).getTime()) / 864e5 : Infinity;
        if(upd <= SITE_STATUS.idleAfterDays) setAvatarStatus('ONLINE', 'ONLINE');
        else setAvatarStatus('idle', 'IDLE');
      }
      else{
        const days = (Date.now() - new Date(last).getTime()) / 864e5;
        if(profileLimited){ setAvatarStatus('idle', 'IDLE'); }
        else if(days <= SITE_STATUS.idleAfterDays) setAvatarStatus('ONLINE', 'ONLINE');
        else if(days <= SITE_STATUS.offlineAfterDays) setAvatarStatus('idle', 'IDLE');
        else setAvatarStatus('offline', 'OFFLINE');
      }
    }catch(e){
      // rate-limited but we HAVE a live user object = GitHub is reachable,
      // so don't punish with IDLE — show ONLINE, not a false IDLE
      if(user && user.login) setAvatarStatus('ONLINE', 'ONLINE');
      else setAvatarStatus('idle', 'IDLE?');
    }
  }

  // 3) github.com platform health (non-blocking, never fails the UI)
  setGhApi('', 'GitHub: checking…');
  try{
    const s = await fetchJson('https://www.githubstatus.com/api/v2/status.json', 7000);
    const ind = s && s.status && s.status.indicator;
    if(ind === 'none') setGhApi('ok', 'GitHub: OPERATIONAL');
    else if(ind === 'minor') setGhApi('warn', 'GitHub: DEGRADED');
    else setGhApi('down', 'GitHub: ' + String(ind || 'ISSUE').toUpperCase());
  }catch(e){
    setGhApi('', 'GitHub: UNKNOWN');
  }
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

/* ---------- GitHub auto-sync (🔒 permanent user) ---------- */
function ghHeaders(){
  const h = { 'Accept': 'application/vnd.github+json' };
  const token = (SITE_STATUS.githubToken || '').trim();
  if(token) h['Authorization'] = `Bearer ${token}`;
  return h;
}
function saveCache(username, user, repos){
  try{ localStorage.setItem(`gh_cache_${username}`, JSON.stringify({ t: Date.now(), user, repos })); }catch(e){}
}
function loadCache(username){
  try{
    const c = JSON.parse(localStorage.getItem(`gh_cache_${username}`) || 'null');
    if(c && Array.isArray(c.repos) && c.repos.length) return c;
  }catch(e){}
  return null;
}
async function loadGitHub(){
  const username = GITHUB_USER;
  statusEl.textContent = `⏳ Summoning @${username}...`;
  detailEl.innerHTML = '<div class="skel"></div>';
  blip(600,.08);

  try{
    const [uRes, rRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers: ghHeaders() }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=${CONFIG.perPage}&sort=updated`, { headers: ghHeaders() })
    ]);
    if(uRes.status === 403 || rRes.status === 403)
      throw new Error('Rate limit hit (60/hr without token) — add githubToken in config.js or wait a minute.');
    if(uRes.status === 404) throw new Error('GitHub user not found.');
    if(!uRes.ok) throw new Error('Could not load GitHub user.');
    if(!rRes.ok) throw new Error('Could not load repos.');
    const user = await uRes.json();
    let repos = await rRes.json();
    repos = repos.filter(r=>!r.fork);
    if(!repos.length) repos = await rRes.json();

    $('#avatar').src = user.avatar_url;
    $('#dialog-name').textContent = '@'+user.login;
    $('#github-bio').textContent = user.bio || `${user.name||user.login} • ${user.public_repos} public quests.`;
    $('#link-github').href = user.html_url;
    $('#stat-repos').textContent = user.public_repos;
    $('#stat-followers').textContent = user.followers;
    $('#stat-stars').textContent = repos.reduce((a,r)=>a+(r.stargazers_count||0),0);
    $('#hero-name').textContent = (user.name||user.login).toUpperCase().slice(0,24);

    allRepos = [...repos].sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
    saveCache(username, user, allRepos);
    buildRepoDropdown();
    statusEl.textContent = `✔ ${repos.length} quests synced from @${username} • 🔒 LOCKED`;
    log(`> Loaded ${repos.length} repos from @${username}`);
    blip(880,.1); setTimeout(()=>blip(1174,.14),90);
    checkLiveStatus(user);
  }catch(err){
    // prefer last LIVE fetch over hard-coded demo so it never looks stale
    const cached = loadCache(username);
    if(cached){
      allRepos = cached.repos;
      if(cached.user){
        $('#avatar').src = cached.user.avatar_url || $('#avatar').src;
        $('#stat-repos').textContent = cached.user.public_repos ?? '--';
        $('#stat-followers').textContent = cached.user.followers ?? '--';
      }
      buildRepoDropdown();
      const age = Math.round((Date.now() - cached.t) / 60000);
      statusEl.textContent = `⚠ ${err.message} — showing last live sync (${age}m ago).`;
      log(`> ERROR: ${err.message} (cached)`);
      checkLiveStatus(cached.user || null);
      return;
    }
    allRepos = CONFIG.demoRepos.map(r => ({
      ...r,
      html_url: r.html_url.replace(/github\.com\/[^/]+/, `github.com/${GITHUB_USER}`)
    }));
    buildRepoDropdown();
    statusEl.textContent = `⚠ ${err.message} — showing saved quests.`;
    log(`> ERROR: ${err.message}`);
    checkLiveStatus(null);
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

async function renderDetail(){
  const r = allRepos[selectedIdx];
  if(!r){ detailEl.innerHTML = '<p class="status">∅ No quests found.</p>'; return; }
  $('#quest-counter').textContent = `${selectedIdx+1} / ${allRepos.length}`;

  detailEl.innerHTML = `
    <article class="repo-detail pixel-box-sm">
      <div class="detail-head">
        <h3>${escapeHtml(r.name)}</h3>
        <span class="detail-badge">${escapeHtml(r.language||'misc')}</span>
      </div>
      <p class="detail-desc">${escapeHtml(r.description||'No description — mysterious quest.')}</p>
      <div class="detail-stats">
        <span>★ ${r.stargazers_count??0} stars</span>
        <span>⑂ ${r.forks_count??0} forks</span>
        <span>👁 ${r.watchers_count??0} watchers</span>
        <span>❗ ${r.open_issues_count??0} issues</span>
        <span>💾 ${r.size??0} KB</span>
        <span>🌿 ${escapeHtml(r.default_branch||'main')}</span>
      </div>
      <div class="detail-dates muted">
        <span>created ${fmtDate(r.created_at)}</span> • <span>updated ${fmtDate(r.updated_at)}</span>
      </div>
      <div id="lang-bar" class="lang-bar"><span class="muted">loading languages...</span></div>
      <div id="readme-box" class="readme-box"><span class="muted">loading README...</span></div>
      <div class="repo-foot">
        <a class="btn btn-small" href="${r.html_url}" target="_blank" rel="noopener">VIEW CODE ▶</a>
        ${r.homepage?`<a class="btn btn-small btn-alt" href="${r.homepage}" target="_blank" rel="noopener">LIVE DEMO ▶</a>`:''}
      </div>
    </article>`;

  // languages breakdown (non-blocking)
  if(r.name){
    fetch(`https://api.github.com/repos/${GITHUB_USER}/${r.name}/languages`, { headers: ghHeaders() })
      .then(x=>x.ok?x.json():null).then(langs=>{
        const box = $('#lang-bar'); if(!box) return;
        if(!langs || !Object.keys(langs).length){ box.innerHTML = `<span><i class="lang-dot" style="background:${langColor(r.language)}"></i>${escapeHtml(r.language||'code')}</span>`; return; }
        const total = Object.values(langs).reduce((a,b)=>a+b,0);
        const top = Object.entries(langs).sort((a,b)=>b[1]-a[1]).slice(0,4);
        box.innerHTML = `<div class="lang-segments">` + top.map(([l,v])=>
          `<span style="width:${(v/total*100).toFixed(1)}%;background:${langColor(l)}" title="${escapeHtml(l)} ${(v/total*100).toFixed(1)}%"></span>`
        ).join('') + `</div><div class="lang-labels">` + top.map(([l,v])=>
          `<span><i class="lang-dot" style="background:${langColor(l)}"></i>${escapeHtml(l)} ${(v/total*100).toFixed(0)}%</span>`
        ).join('') + `</div>`;
      }).catch(()=>{});

    // README preview (non-blocking)
    fetch(`https://api.github.com/repos/${GITHUB_USER}/${r.name}/readme`, {headers: Object.assign({}, ghHeaders(), {Accept:'application/vnd.github.raw'})})
      .then(x=>x.ok?x.text():null).then(txt=>{
        const box = $('#readme-box'); if(!box) return;
        if(!txt){ box.innerHTML = `<span class="muted">No README found. <a href="${r.html_url}" target="_blank" rel="noopener">Open on GitHub →</a></span>`; return; }
        const preview = txt.slice(0,900);
        box.innerHTML = `<h4>📖 README PREVIEW</h4><pre>${escapeHtml(preview)}${txt.length>900?'…':''}</pre><a href="${r.html_url}" target="_blank" rel="noopener">Read full on GitHub →</a>`;
      }).catch(()=>{});
  }
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Events ---------- */
$('#refresh-btn').onclick = () => loadGitHub();
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

/* init */
applyLinks();
updateCoins();
loadEnv().finally(() => {
  loadGitHub();
  log(SITE_STATUS.githubToken ? '> Token loaded from .env' : '> No token (.env empty) — 60/hr limit');
});
// re-check live status every 5 min so it stays responsive without reload
setInterval(() => checkLiveStatus(), 5 * 60 * 1000);
