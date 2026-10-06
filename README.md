# PLAYER_1 — Light 8-Bit Portfolio

Responsive, interactive pixel portfolio with **token-free GitHub snapshot**. No build step.

## Run
Serve locally (fetch of `github-data.json` needs http, not `file://`):
```powershell
cd D:\01crm\Documents\Projects\Portfolio_Chromete
python -m http.server 8000
# → http://localhost:8000
```

## How GitHub data works (no token, no rate-limit pain)
- The site loads **`github-data.json`** — a committed snapshot of your public
  profile + repos (with embedded `languages` + README previews).
- Normal page load = **0 GitHub API calls**. Status badges (ONLINE/IDLE/OFFLINE,
  OPEN TO WORK) are derived from the saved timestamps.
- A quiet background refresh (2 unauthenticated calls: user + repos) only runs
  when the snapshot is older than ~24h, at most once per ~6h, and failures
  silently keep the snapshot. Per-repo language/README hits are cached 7 days
  in localStorage.
- `↻ RESYNC` forces one refresh (same 2-call budget, same silent fallback).

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

## Cloudflare Pages — enable the GITHUB_TOKEN secret
The browser never holds a token. Live RESYNC calls go to same-origin
`/api/github/*`, and `functions/api/_middleware.js` injects your secret
server-side (higher limit, secret never leaks to the client).

1. Cloudflare dashboard → Pages → your project → **Settings → Variables and Secrets**
2. Under **Secrets** (not just Variables) → **Add secret**:
   - Name: `GITHUB_TOKEN`
   - Value: your token value (classic PAT with no scopes, or fine-grained
     public-read-only — both work for public data)
   - Environment: tick **Production** (tick Preview too if you want previews to use it)
3. **Redeploy** (Deployments → Retry / new commit) — env/secret changes only
   apply on a new deployment.
4. Verify: open `https://<your-site>.pages.dev/api/github/zen` — should return
   a Zen message. Then click `↻ RESYNC` on the site; with the secret set the
   resync uses the 5,000/hr authenticated budget, without it the site still
   works via snapshot + 60/hr fallback.

## Features
- 🌞 Light 8-bit theme (Press Start 2P + VT323, pixel borders, hard shadows)
- 📱 Responsive (mobile hamburger → desktop grid)
- 👾 **Token-free GitHub quests**: profile + repos from local snapshot
  - hero stats (repos, total stars, followers) + avatar auto-update
  - throttled live resync + localStorage cache, demo fallback if snapshot missing
- ✨ Interactive: typewriter, XP bars, coin clicks + counter, 8-bit WebAudio SFX, CRT toggle, Konami code (+100 coins), scroll HP bar, reveal animations, quest-log contact form

## Customize
Edit `config.js` (`githubUsername`, links, status). No need to touch `index.html` / `script.js`.
After changing `githubUsername`, run `node tools/sync-github.mjs <new-name>`.
