// ============================================================
//  EDIT ME — all your links + status in ONE place.
//  No need to touch index.html / script.js after this.
// ============================================================
window.SITE_CONFIG = {
  // GitHub username used for auto-sync (avatar, repos, live status)
  githubUsername: "Christiniel",

  // Change these URLs anytime — site updates automatically.
  links: {
    github: "https://github.com/Christiniel",
    linkedin: "https://www.linkedin.com/in/christiniel-teope-0a0724421/",
    facebook: "https://facebook.com/christiniel.teope",
    email: "mailto:christinielrteope@gmail.com",
    resume: "resume.pdf"
  },

  // Status behaviour
  status: {
    // Manual override: true = "OPEN TO WORK", false = "BUSY / CLOSED"
    // If null, it follows GitHub profile status ("What's happening") first,
    // then GitHub `hireable` field when available.
    openToWork: null,
    // Token lives in `.env` as GITHUB_TOKEN (see .env.example).
    // Leave this "" — script.js loads .env at startup and fills it in.
    // Create at github.com/settings/tokens (classic, no scopes needed).
    githubToken: "",
    // Custom mapping: lowercase keyword -> badge. First partial match wins.
    statusMap: {
      "out sick": { label: "● OUT SICK", busy: true },
      "sick": { label: "● OUT SICK", busy: true },
      "vacation": { label: "● ON VACATION", busy: true },
      "ooo": { label: "● OUT OF OFFICE", busy: true },
      "open to work": { label: "● OPEN TO WORK", busy: false },
      "available": { label: "● OPEN TO WORK", busy: false },
      "busy": { label: "● BUSY", busy: true },
      "focusing": { label: "● FOCUS MODE", busy: true }
    },
    // Days since last public GitHub event before going IDLE / OFFLINE
    idleAfterDays: 14,
    offlineAfterDays: 60
  }
};
