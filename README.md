# 🧠 AI Daily — Video Summarizer & AI News Digest

[![GitHub Pages](https://img.shields.io/badge/Live%20App-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://virendrakulkarni-design.github.io/wise-ai-daily/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

> **Social Video Summarizer & AI News Digest** — Fast, client-side PWA powered by [Groq](https://groq.com) (free tier) and open-source **Llama 3.3 70B**.

🌐 **Live App:** [https://virendrakulkarni-design.github.io/wise-ai-daily/](https://virendrakulkarni-design.github.io/wise-ai-daily/)

---

## 📌 Project Scope & Independence

**AI Daily** is a standalone, dedicated application for consuming and summarizing AI media and news. 
- It is completely independent and separate from our sister project, [**Wise Simple Studio**](https://github.com/virendrakulkarni-design/wise-simple-studio) (which focuses exclusively on multi-step AI video animation and story creation).
- Zero server backend required — runs entirely client-side via GitHub Pages with local storage persistence.

---

## ✨ Key Features

1. **🎬 Smart Video & Article Summarizer**:
   - Paste any YouTube, Instagram, Facebook, or web article URL.
   - **Auto-Detect Video Duration**: Uses YouTube IFrame API to fetch exact video duration in real-time.
   - **Dynamic Proportional Phases**: Adjusts summary phase density and timestamp intervals according to exact video length.
   - **Visual Snapshot Moments**: View moment-specific snapshot frames with interactive jump-to-timestamp playback and zoom lightbox.

2. **📰 Curated Daily AI Digest**:
   - Powered by Meta's **Llama 3.3 70B** via Groq's high-speed inference.
   - Synthesizes top breaking developments across YouTube, X/Twitter, GitHub trending repos, arXiv research papers, and lab releases.
   - Filter and prioritize followed accounts and platforms.

3. **📱 iPhone & Mobile PWA Integration**:
   - Installable Progressive Web App (PWA) with service worker caching (`sw.js`).
   - Native iOS Share Sheet integration via `share.html` and Apple Shortcuts (`shortcut.html`).

4. **📅 Persistent History & Search**:
   - All digests and URL summaries are preserved in browser `localStorage`.
   - Filter by type (digests vs. video summaries) and search past summaries instantly.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML5, CSS3, ES6 JavaScript (zero build step) |
| **AI Model** | **Llama 3.3 70B Versatile** (Meta open-source) |
| **Inference Engine** | **Groq API** (free tier, ~14,400 requests/day, auto-model detection) |
| **Icons & UI** | Tabler Icons Webfont |
| **PWA & Offline** | Service Worker cache (`sw.js`) & Web App Manifest (`manifest.json`) |
| **Storage** | Browser `localStorage` (API key & history remain strictly on device) |
| **Hosting** | GitHub Pages |

---

## 📁 Repository Structure

```text
wise-ai-daily/
├── index.html        # Main app shell, PWA metadata & service worker bootstrap
├── app.js            # Core application logic, Groq API client, YouTube duration detector & UI
├── styles.css        # Responsive dark/light theme styles, typography & snapshot lightbox
├── sw.js             # Service worker handling network-first caching & offline assets
├── manifest.json     # Web app manifest for PWA installation
├── share.html        # iOS share target bridge for incoming URLs
├── shortcut.html     # Setup guide and clipboard helper for Apple Shortcuts
├── icons/            # App icons (192x192, 512x512)
├── snapshots/        # Cached key moment video frame snapshots
└── README.md         # Project documentation and specifications
```

---

## 🚀 Setup & Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/virendrakulkarni-design/wise-ai-daily.git
   cd wise-ai-daily
   ```

2. **Run locally**:
   Since it requires zero build steps or npm packages, you can serve it with any local static HTTP server:
   ```bash
   # Using Python 3:
   python -m http.server 8080

   # Or using Node:
   npx serve .
   ```

3. **Configure API Key**:
   - Get a free API key at [console.groq.com](https://console.groq.com) (no credit card required).
   - Open `http://localhost:8080/index.html` → click **Set up API key** → paste your `gsk_...` key.
   - Your key is kept secure inside your browser's `localStorage` and never shared.

---

## 🌐 Deploy to GitHub Pages

1. Navigate to **Settings** → **Pages** in this GitHub repository.
2. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `main` / `root`
3. Save. GitHub Pages deploys automatically at `https://virendrakulkarni-design.github.io/wise-ai-daily/`.

---

## 📄 License

MIT License © 2026 Virendra Kulkarni
