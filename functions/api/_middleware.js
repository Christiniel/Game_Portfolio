// Cloudflare Pages middleware — same-origin GitHub API proxy.
// Intercepts /api/github/*, forwards to https://api.github.com/* and injects
// the GITHUB_TOKEN server-side, so the secret never ships to the browser.
//
// Dashboard: Pages project -> Settings -> Environment variables -> Production
// -> add GITHUB_TOKEN -> Redeploy (a redeploy is required after adding it).
// Local dev (python http.server) has no Functions runtime: the frontend
// detects the missing proxy and calls api.github.com directly with the
// .env token instead, so nothing breaks offline.
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

  const headers = new Headers();
  headers.set('Accept', request.headers.get('Accept') || 'application/vnd.github+json');
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  headers.set('User-Agent', 'Portfolio-Chromete');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  if (env.GITHUB_TOKEN) headers.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);

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
  for (const h of ['content-type', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-used']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Cache-Control', 'public, max-age=60');

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
