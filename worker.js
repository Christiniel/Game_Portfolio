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
    return json({ message: 'Method not allowed (read-only proxy).' }, 405);
  }

  const sub = url.pathname.replace(/^\/api\/github\/?/, '');
  if (!sub || !isAllowed(sub)) {
    return json({ message: 'Not found.' }, 404);
  }

  const target = `${GITHUB_API}/${sub}${url.search}`;
  const token = env && typeof env.GITHUB_TOKEN === 'string' ? env.GITHUB_TOKEN.trim() : '';

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
    return json({ message: 'Could not reach api.github.com.' }, 502, {
      'x-proxy-auth': token ? 'authenticated' : 'anonymous',
    });
  }

  const out = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) out.set('Content-Type', ct);
  for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-used']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  // Boolean only — reveals whether a server token is configured, never its value.
  out.set('x-proxy-auth', token ? 'authenticated' : 'anonymous');
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
