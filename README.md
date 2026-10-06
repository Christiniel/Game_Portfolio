# PLAYER_1 — Light 8-Bit Portfolio

Responsive, interactive pixel portfolio with **token-free GitHub snapshot**. No build step.

## Run
Serve locally (fetch of `github-data.json` needs http, not `file://`):
```powershell
cd D:\01crm\Documents\Projects\Portfolio_Chromete
python -m http.server 8000
# → http://localhost:8000
```

## How GitHub data works (live via Worker, snapshot fallback)
- The site fetches the LATEST profile + repos + activity at runtime from
  same-origin **`/api/github/*`**, served by `worker.js`.
- The Worker reads the **`GITHUB_TOKEN` secret server-side** (`env.GITHUB_TOKEN`)
  and forwards to GitHub with `Authorization: Bearer …` — the browser never
  sees the token and never calls `api.github.com` directly.
- If the live API is unreachable (local dev without Worker, offline), the site
  falls back to **`github-data.json`** snapshot, then built-in demo quests.
- `↻ RESYNC` re-fetches live data on demand.

## Refresh the snapshot
```powershell
# Unauthenticated is fine for small accounts (60 req/hr):
node tools/sync-github.mjs

# With higher limit (only at sync time — never in the browser):
$env:GITHUB_TOKEN="ghp_..."
node tools/sync-github.mjs
```
Or let CI do it: `.github/workflows/update-github-data.yml` runs weekly and
commits a fresh `github-data.json` (optional repo secret `GITHUB_TOKEN_SYNC`).

## Cloudflare Worker — deploy + GITHUB_TOKEN secret
Browser → `/api/github/*` → `worker.js` → `env.GITHUB_TOKEN` → GitHub API.
Token value lives ONLY in the dashboard secret, never in code.

1. Deploy: `npx wrangler deploy` (uses `wrangler.toml`; static site served via
   the Worker's `ASSETS` binding, API handled by `worker.js`).
2. Cloudflare dashboard → your Worker → **Settings → Variables and Secrets**
   → **Add Secret**: Name `GITHUB_TOKEN`, Value your token (classic PAT with
   no scopes, or fine-grained public-read-only).
3. **Redeploy** the Worker after adding the secret.
4. Verify: open `https://<your-worker>.workers.dev/api/github/zen` — should
   return a Zen message. The quest log reports
   `GitHub token: IN USE via Worker (server-side) 🔒` when active.

## Features
- 🌞 Light 8-bit theme (Press Start 2P + VT323, pixel borders, hard shadows)
- 📱 Responsive (mobile hamburger → desktop grid)
- 👾 **Live GitHub quests** via secure Worker (server-side token)
  - latest repos, stars, followers, activity status at runtime
  - snapshot + demo fallback when API unreachable
- ✨ Interactive: typewriter, XP bars, coin clicks + counter, 8-bit WebAudio SFX, CRT toggle, Konami code (+100 coins), scroll HP bar, reveal animations, quest-log contact form

## Customize
Edit `config.js` (`githubUsername`, links, status). No need to touch `index.html` / `script.js`.
After changing `githubUsername`, run `node tools/sync-github.mjs <new-name>`.
