# PLAYER_1 — Light 8-Bit Portfolio

Responsive, interactive pixel portfolio with **automatic GitHub repo sync**. No build step.

## Run
Just open `index.html` in a browser, or serve locally:
```powershell
cd D:\01crm\Documents\Projects\Portfolio
python -m http.server 8000
# → http://localhost:8000
```

## Features
- 🌞 Light 8-bit theme (Press Start 2P + VT323, pixel borders, hard shadows)
- 📱 Responsive (mobile hamburger → desktop grid)
- 👾 **Auto GitHub insertion**: type any username → fetches profile + repos via `api.github.com`
  - search / language filter / sort (updated, stars, name)
  - hero stats (repos, total stars, followers) + avatar auto-update
  - saved to localStorage, demo fallback if rate-limited
- ✨ Interactive: typewriter, XP bars, coin clicks + counter, 8-bit WebAudio SFX, CRT toggle, Konami code (+100 coins), scroll HP bar, reveal animations, quest-log contact form

## Customize
Edit `CONFIG` at top of `script.js` (`githubUsername`), hero name in `index.html`, skills in `#skills`.
