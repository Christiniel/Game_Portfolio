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

  // Status behaviour (all token-free — data comes from github-data.json)
  status: {
    // Manual override: true = "OPEN TO WORK", false = "BUSY / CLOSED"
    // If null, it follows the saved snapshot's profile status first,
    // then the saved `hireable` field when available.
    openToWork: null,
    // No token needed. To refresh the snapshot, run:
    //   node tools/sync-github.mjs
    // (an optional GITHUB_TOKEN env var only raises the sync-time limit;
    // the site itself never uses it).
    // Legacy `githubToken` key is ignored if present.
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
