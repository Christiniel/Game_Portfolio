// tools/sync-github.mjs
// One-time / periodic collector: fetches public GitHub data and saves it to
// github-data.json so the site NEVER needs a token at runtime.
//
// Usage:
//   node tools/sync-github.mjs                  # unauthenticated (60 req/hr)
//   node tools/sync-github.mjs Christiniel      # explicit username
//
//   # With token (higher limit, only needed when bootstrapping or refreshing
//   # many repos — never ship the token to the browser):
//   $env:GITHUB_TOKEN="ghp_..."; node tools/sync-github.mjs
//
// What it saves (public data only):
//   { username, fetchedAt, user, repos[], lastEventAt, totalStars, profileStatus }
// Repos embed `languages` + `readmePreview` so the frontend makes 0 API calls
// on normal page loads.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'github-data.json');

// Username: CLI arg > GITHUB_USERNAME env > config.js > fallback
function usernameFromConfig() {
  try {
    const src = readFileSync(join(ROOT, 'config.js'), 'utf8');
    const m = src.match(/githubUsername\s*:\s*["']([^"']+)["']/);
    if (m) return m[1];
  } catch {}
  return null;
}
const USERNAME = process.argv[2] || process.env.GITHUB_USERNAME || usernameFromConfig() || 'Christiniel';

// Optional token: .env file or env var. Only used HERE at sync time,
// never required by the site itself.
function tokenFromEnvFile() {
  try {
    if (!existsSync(join(ROOT, '.env'))) return '';
    const txt = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      if (t.slice(0, i).trim() === 'GITHUB_TOKEN') {
        return t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
  return '';
}
const TOKEN = (process.env.GITHUB_TOKEN || tokenFromEnvFile() || '').trim();

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Portfolio-Chromete-sync',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

async function gh(path, { raw = false } = {}) {
  const h = { ...headers };
  if (raw) h.Accept = 'application/vnd.github.raw';
  const r = await fetch(`https://api.github.com${path}`, { headers: h });
  if (r.status === 403) {
    const reset = r.headers.get('x-ratelimit-reset');
    const mins = reset ? Math.max(1, Math.round((reset * 1000 - Date.now()) / 60000)) : '?';
    throw new Error(`GitHub rate limit hit. Retry in ~${mins}m, or set GITHUB_TOKEN just for this sync script. (${path})`);
  }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}`);
  return raw ? r.text() : r.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Syncing @${USERNAME} ${TOKEN ? '(authenticated)' : '(unauthenticated)'} ...`);

  const user = await gh(`/users/${USERNAME}`);
  if (!user || !user.login) throw new Error('GitHub user not found.');

  // All repos, paginated (100/page is usually 1 page for personal sites)
  let repos = [];
  let page = 1;
  for (;;) {
    const batch = await gh(`/users/${USERNAME}/repos?per_page=100&page=${page}&sort=updated`);
    if (!Array.isArray(batch) || !batch.length) break;
    repos.push(...batch);
    if (batch.length < 100) break;
    page++;
    if (page > 10) break; // safety: 1000 repos max
  }

  // Keep the same shape the frontend expects, plus embedded extras.
  // Include forks in the snapshot (frontend filters), but drop heavy blobs.
  const pick = (r) => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count ?? 0,
    forks_count: r.forks_count ?? 0,
    watchers_count: r.watchers_count ?? 0,
    open_issues_count: r.open_issues_count ?? 0,
    size: r.size ?? 0,
    default_branch: r.default_branch || 'main',
    created_at: r.created_at,
    updated_at: r.updated_at,
    pushed_at: r.pushed_at,
    html_url: r.html_url,
    homepage: r.homepage || '',
    fork: !!r.fork,
    topics: r.topics || [],
    languages: null,       // filled below
    readmePreview: null,   // filled below (first ~900 chars)
  });

  const slim = repos.map(pick).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  // Per-repo languages + README preview. Sequential + tiny delay to be polite.
  // Unauthenticated limit is 60/hr, so this is the step that benefits from a
  // one-time token — but it only runs here, never in the browser.
  for (const r of slim) {
    try {
      r.languages = await gh(`/repos/${USERNAME}/${r.name}/languages`);
      await sleep(250);
    } catch (e) { r.languages = null; console.warn(`  languages failed for ${r.name}: ${e.message}`); }
    try {
      const txt = await gh(`/repos/${USERNAME}/${r.name}/readme`, { raw: true });
      r.readmePreview = typeof txt === 'string' ? txt.slice(0, 1200) : null;
      await sleep(250);
    } catch (e) { r.readmePreview = null; /* no README is normal */ }
    console.log(`  + ${r.name}`);
  }

  // Last public activity (drives ONLINE / IDLE / OFFLINE badge)
  let lastEventAt = null;
  try {
    const events = await gh(`/users/${USERNAME}/events/public?per_page=5`);
    if (Array.isArray(events) && events[0]?.created_at) lastEventAt = events[0].created_at;
  } catch (e) { console.warn(`  events failed: ${e.message}`); }

  // Profile "What's happening" status — GraphQL needs auth, so only attempt
  // when a token is available at sync time. Frontend never calls this live.
  let profileStatus = null;
  if (TOKEN) {
    try {
      const r = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query($login:String!){ user(login:$login){ status{ message emoji indicatesLimitedAvailability } } }',
          variables: { login: USERNAME },
        }),
      });
      if (r.ok) {
        const j = await r.json();
        profileStatus = j?.data?.user?.status || null;
      }
    } catch {}
  }

  const data = {
    version: 1,
    username: user.login,
    fetchedAt: new Date().toISOString(),
    user: {
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      html_url: user.html_url,
      public_repos: user.public_repos,
      followers: user.followers,
      following: user.following,
      hireable: user.hireable,
      updated_at: user.updated_at,
    },
    totalStars: slim.filter((r) => !r.fork).reduce((a, r) => a + (r.stargazers_count || 0), 0),
    lastEventAt,
    profileStatus,
    repos: slim,
  };

  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nWrote ${OUT}`);
  console.log(`  user: @${data.user.login} | repos: ${slim.length} | stars: ${data.totalStars}`);
  console.log(`  snapshot: ${data.fetchedAt}`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
