# 🧠 AI Daily

**Social Video Summarizer & AI News Digest** — a single-page web app that:

- 📰 **Daily AI digest** — searches YouTube, X/Twitter, GitHub, arXiv, Hacker News, and top AI lab blogs for the day's most important AI content, powered by Claude + live web search
- 🎬 **Video & article summarizer** — paste any URL (YouTube, Instagram, Facebook, X, GitHub, or a web article) to get a timestamped bullet-point summary
- 📱 **iPhone-friendly** — use Safari's "Share → Copy Link" workflow to forward URLs directly into the app
- 📅 **Daily history** — every digest is stored locally so you can browse past days
- 👤 **Follow accounts** — add specific handles from any platform and they'll be prioritised in your digest

---

## Quick start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/ai-daily.git
cd ai-daily

# 2. Open in browser — no build step needed
open index.html
# or serve locally:
npx serve .
```

> **Note:** The app calls the Anthropic API directly from the browser. You'll need to configure your API key — see [API Key Setup](#api-key-setup) below.

---

## API Key Setup

The app uses the [Anthropic Messages API](https://docs.anthropic.com/en/api). You need an API key from [console.anthropic.com](https://console.anthropic.com).

**Option 1 — Environment variable (recommended for local dev):**

Add a `config.js` file (not committed to git):

```js
// config.js — never commit this
window.ANTHROPIC_API_KEY = 'sk-ant-...your key here...';
```

Then add to `index.html` before `app.js`:
```html
<script src="config.js"></script>
```

And in `app.js`, update the fetch headers:
```js
headers: {
  'Content-Type': 'application/json',
  'x-api-key': window.ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
}
```

**Option 2 — Deploy with a backend proxy** (recommended for production) so the API key is never exposed client-side.

---

## Features

### Feed — Daily AI Digest
Hit **"Research now"** and Claude uses live web search to pull the top 15–20 AI/ML items from the last 24–48 hours:
- 🔥 Breaking model launches and announcements
- 📣 Viral X/Twitter threads
- ⭐ Trending GitHub repositories
- 📄 New arXiv / Hugging Face papers
- 📺 Trending YouTube AI videos
- ✍️ Posts from OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, and more

High-importance items get a **Hot** badge. Results persist in `localStorage` by date.

### Add URL — Video & Article Summarizer
Paste any URL and get:
- **YouTube / YouTube Shorts** — timestamped bullet points with clickable deep-links to each moment
- **Instagram (Posts, Reels, IGTV)** — AI-inferred summary with approximate timestamps
- **Facebook Videos** — summary bullets
- **X / Twitter posts** — key insights extracted
- **GitHub repos** — purpose, key features, tech stack summary
- **Any web article or blog post** — 4–6 key insight bullets

#### iPhone workflow
1. Open a video or article on iPhone (Safari, YouTube app, Instagram, etc.)
2. Tap **Share → Copy Link**
3. Open AI Daily in Safari
4. Go to **Add URL** tab → paste → tap **Summarize**

### History
Browse all past daily digests by date. Each day's items are stored in `localStorage` keyed by date (`digest:YYYY-MM-DD`).

### Following
Add any account handle from any supported platform. These are included as explicit search targets in every digest refresh.

Supported platforms:
| Platform  | Handle format |
|-----------|--------------|
| X/Twitter | `@handle`    |
| YouTube   | `@channel`   |
| GitHub    | `username` or `org/repo` |
| Instagram | `@handle`    |
| Facebook  | page name    |
| Web       | site URL     |

---

## Tech stack

| Layer     | Technology |
|-----------|-----------|
| UI        | Vanilla HTML/CSS/JS — zero build step |
| Icons     | [Tabler Icons](https://tabler.io/icons) webfont |
| AI        | [Anthropic Claude](https://anthropic.com) (`claude-sonnet-4-6`) |
| Search    | Claude's built-in `web_search_20250305` tool |
| Storage   | `localStorage` (browser-native, no backend) |

---

## Project structure

```
ai-daily/
├── index.html   — app shell
├── styles.css   — all styles (light + dark mode)
├── app.js       — all application logic
└── README.md    — this file
```

---

## Limitations

- **API key exposure** — calling the Anthropic API directly from the browser exposes your key. Use a backend proxy for production.
- **Timestamps on non-YouTube platforms** — Instagram, Facebook, and X timestamps are approximations (marked with `~`) since those platforms don't support URL-based deep-linking to specific moments.
- **localStorage limit** — browsers typically cap localStorage at 5–10 MB. Old digests may need to be cleared manually if this is hit.

---

## License

MIT
