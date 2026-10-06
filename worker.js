// Cloudflare Worker entrypoint — static portfolio + secure GitHub API proxy.
//
// Architecture:
//   Browser → same-origin /api/github/* → this Worker → api.github.com
//   using ONLY the server-side secret `env.GITHUB_TOKEN` (Workers Secret).
//   The token value is never sent to the browser, never stored in frontend
//   JS/config/HTML/storage, and never echoed in API responses.
//
// Setup (dashboard):
//   Worker → Settings → Variables and Secrets → Add Secret
//   Name:  GITHUB_TOKEN
//   Value: <classic PAT (no scopes) or fine-grained public-read token>
//   Then Redeploy the Worker.

const GITHUB_USER = 'Christiniel';
const GITHUB_API = 'https://api.github.com';

// Allow-list: only these upstream paths may be fetched with the server token.
// Username is pinned so visitors cannot use the Worker token for arbitrary API.
const ALLOWED = [
  /^zen\/?$/,
  /^diag\/?$/,
  /^rate_limit\/?$/,
  /^users\/Christiniel\/?$/,
  /^users\/Christiniel\/repos\/?$/,
  /^users\/Christiniel\/events\/public\/?$/,
  /^repos\/Christiniel\/[^/]+\/languages\/?$/,
  /^repos\/Christiniel\/[^/]+\/readme\/?$/,
  /^repos\/Christiniel\/[^/]+\/?$/,
];

function isAllowed(sub) {
  return ALLOWED.some((re) => re.test(sub));
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60',
      ...extra,
    },
  });
}

// Safe diagnostic headers. They reveal ONLY whether a secret is configured
// (boolean) and how long the trimmed value is (number) — never the value.
// A length of 0 means the deployment has no effective secret (wrong target,
// wrong environment, or redeploy pending). A nonzero length with 401/403 from
// GitHub means the secret value itself is invalid/expired/under-permissioned.
function diagHeaders(token) {
  return {
    'x-proxy-auth': token ? 'authenticated' : 'anonymous',
    'x-token-len': String(token.length),
  };
}

// GET /api/github/diag — safe diagnostic snapshot (no token value anywhere).
// Calls upstream GET /rate_limit once with the same server-side headers and
// reports what GitHub said, so the browser quest log can name the 403 cause.
async function handleDiag(token) {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Christiniel-Portfolio',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let ghStatus = null, ghMessage = null, rl = {};
  try {
    const up = await fetch(`${GITHUB_API}/rate_limit`, { method: 'GET', headers });
    ghStatus = up.status;
    for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-used']) {
      const v = up.headers.get(h);
      if (v) rl[h.replace('x-ratelimit-', '')] = v;
    }
    try {
      const j = await up.clone().json();
      ghMessage = (j && j.message) || null;
    } catch (e) { ghMessage = null; }
  } catch (e) {
    return json({ tokenPresent: !!token, tokenLen: token.length, reachable: false }, 502, diagHeaders(token));
  }
  const remaining = rl.remaining !== undefined ? Number(rl.remaining) : null;
  const limit = rl.limit !== undefined ? Number(rl.limit) : null;
  let hint;
  if (!token) {
    hint = 'Secret missing on this Worker deployment (wrong worker/env, or redeploy pending). Anonymous 60/hr limit applies.';
  } else if (ghStatus === 401 || ghMessage === 'Bad credentials') {
    hint = 'GitHub rejected the secret (invalid/expired/revoked). Replace the Worker secret value, then redeploy.';
  } else if (ghStatus === 403 && remaining === 0 && limit === 60) {
    hint = 'Anonymous rate limit exhausted: the upstream request went out WITHOUT an effective token. Check secret name/target/env + redeploy.';
  } else if (ghStatus === 403 && remaining === 0) {
    hint = 'Authenticated rate limit exhausted: valid token, too many calls this hour. Wait for reset, then retry.';
  } else if (ghStatus === 403) {
    hint = 'GitHub refused (403): check token permissions/expiry, or secondary rate limit. See githubMessage.';
  } else {
    hint = 'Token accepted by GitHub.';
  }
  return json(
    { tokenPresent: !!token, tokenLen: token.length, githubStatus: ghStatus, githubMessage: ghMessage, rateLimit: rl, hint },
    200,
    diagHeaders(token)
  );
}

async function handleGitHub(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const tokenEarly = env && typeof env.GITHUB_TOKEN === 'string' ? env.GITHUB_TOKEN.trim() : '';
    return json({ message: 'Method not allowed (read-only proxy).' }, 405, diagHeaders(tokenEarly));
  }

  let sub = url.pathname.replace(/^\/api\/github\/?/, '');

  // Convenience routes (pinned to this portfolio's user):
  //   /api/github/profile → /users/Christiniel
  //   /api/github/repos   → /users/Christiniel/repos (defaults per_page=100&sort=updated;
  //                          pass ?page=2… for pagination, ?per_page=… to override)
  //   /api/github/events  → /users/Christiniel/events/public (defaults per_page=5)
  if (sub === 'profile') {
    sub = `users/${GITHUB_USER}`;
  } else if (sub === 'repos') {
    sub = `users/${GITHUB_USER}/repos`;
    if (!url.searchParams.has('per_page')) url.searchParams.set('per_page', '100');
    if (!url.searchParams.has('sort')) url.searchParams.set('sort', 'updated');
  } else if (sub === 'events') {
    sub = `users/${GITHUB_USER}/events/public`;
    if (!url.searchParams.has('per_page')) url.searchParams.set('per_page', '5');
  }

  if (!sub || !isAllowed(sub)) {
    const tokenEarly = env && typeof env.GITHUB_TOKEN === 'string' ? env.GITHUB_TOKEN.trim() : '';
    return json({ message: 'Not found.' }, 404, diagHeaders(tokenEarly));
  }

  const target = `${GITHUB_API}/${sub}${url.search}`;
  const token = env && typeof env.GITHUB_TOKEN === 'string' ? env.GITHUB_TOKEN.trim() : '';
  const safe = diagHeaders(token);

  // Safe diagnostics endpoint — reports token presence/length + what GitHub
  // says about it. Never includes the token value.
  if (sub === 'diag') {
    return handleDiag(token);
  }

  const headers = new Headers();
  // Preserve a raw README accept; default to the standard GitHub JSON accept.
  const accept = request.headers.get('Accept');
  headers.set(
    'Accept',
    accept && accept.includes('vnd.github.raw') ? 'application/vnd.github.raw' : 'application/vnd.github+json'
  );
  headers.set('User-Agent', 'Christiniel-Portfolio');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  // The ONLY place the secret is ever used — server → GitHub, never browser.
  // Client-sent Authorization is deliberately ignored.
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let upstream;
  try {
    upstream = await fetch(target, { method: 'GET', headers });
  } catch (e) {
    return json({ message: 'Could not reach api.github.com.' }, 502, safe);
  }

  const out = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) out.set('Content-Type', ct);
  for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-used']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  // Safe booleans only — whether a secret is configured + its trimmed length.
  out.set('x-proxy-auth', token ? 'authenticated' : 'anonymous');
  out.set('x-token-len', String(token.length));
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Cache-Control', 'public, max-age=60');

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/github' || url.pathname.startsWith('/api/github/')) {
      return handleGitHub(request, env);
    }

    // Static portfolio site (requires [assets] with an ASSETS binding).
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Static assets binding (ASSETS) is not configured.', { status: 500 });
  },
};
