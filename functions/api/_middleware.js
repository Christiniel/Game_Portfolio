// Cloudflare Pages Function — same-origin GitHub API proxy.
//
// Route: /api/github/*  (this file: functions/api/_middleware.js runs for /api/*
// and forwards only /api/github/*, everything else falls through via next()).
//
// Purpose: inject the GITHUB_TOKEN server-side so the browser stays token-free.
// Set it in the Cloudflare dashboard:
//   Pages project → Settings → Variables and Secrets → Secrets → Add secret
//   Name:  GITHUB_TOKEN
//   Value: <your fine-grained or classic PAT, no scopes needed for public data>
//   Environment: Production (and Preview if you want previews to use it too)
// Then: Redeploy (required — env changes only apply on new deployments).
//
// Behaviour:
// - No secret configured → still proxies (unauthenticated, 60/hr shared IP).
//   Site keeps working; snapshot fallback covers rate limits.
// - Secret configured → adds `Authorization: Bearer <secret>` upstream only.
//   The secret VALUE is never returned to the browser — only a safe boolean
//   `x-proxy-auth: authenticated|anonymous` flag so the UI can log token usage.
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname !== '/api/github' && !url.pathname.startsWith('/api/github/')) {
    return next();
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const stripped = url.pathname.replace(/^\/api\/github\/?/, '');
  const target = `https://api.github.com/${stripped}${url.search}`;

  // Read secret from env. Works for both:
  //   Settings → Variables and Secrets → Secrets (encrypted) and
  //   Settings → Variables and Secrets → Variables (plain text).
  // Name MUST be exactly GITHUB_TOKEN.
  const token = (env && typeof env.GITHUB_TOKEN === 'string' ? env.GITHUB_TOKEN : '').trim();

  const headers = new Headers();
  headers.set('Accept', request.headers.get('Accept') || 'application/vnd.github+json');
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  headers.set('User-Agent', 'Portfolio-Chromete');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  // NOTE: deliberately ignore any client-sent Authorization — only the server
  // secret is ever forwarded, so a visitor can't inject or steal anything.
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(target, { method: request.method, headers, body });
  } catch (e) {
    return Response.json({ message: 'Proxy could not reach api.github.com' }, { status: 502 });
  }

  const out = new Headers();
  // Pass through content-type + rate-limit headers (useful for debugging),
  // but NEVER Authorization or token material. The boolean auth flag below
  // reveals only WHETHER a token is configured, never its value.
  for (const h of ['content-type', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-used']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set('x-proxy-auth', token ? 'authenticated' : 'anonymous');
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Cache-Control', 'public, max-age=60');

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
