# 🧠 AI Daily

**Social Video Summarizer & AI News Digest** — powered by [Groq](https://groq.com) (free) + open-source **Llama 3.3 70B**.

🌐 **Live app:** https://virendrakulkarni-design.github.io/wise-ai-daily

---

## Features

- 📰 **Daily AI digest** — Llama 3.3 surfaces top AI news from YouTube, X/Twitter, GitHub, arXiv, and major AI lab blogs
- 🎬 **Video & article summarizer** — paste any URL for timestamped bullet summaries
- 📱 **iPhone share workflow** — Share → Copy Link → paste in app
- 📅 **History** — browse past digests stored in your browser
- 👤 **Follow accounts** — prioritise specific handles in your digest

## Stack

| Layer | Technology |
|-------|-----------|
| UI | Vanilla HTML/CSS/JS — zero build step |
| AI Model | **Llama 3.3 70B** (open-source, Meta) |
| Inference | **Groq** (free tier, ~14,400 req/day) |
| Icons | Tabler Icons |
| Storage | `localStorage` |
| Hosting | **GitHub Pages** (free) |

## Setup

1. Get a **free** Groq API key at [console.groq.com](https://console.groq.com) — no credit card
2. Open the app → click **Set up API key** → paste your `gsk_...` key
3. Click **Research Now** on the Feed tab

Your key is stored only in your browser's `localStorage`.

## Local development

```bash
git clone https://github.com/virendrakulkarni-design/wise-ai-daily.git
cd wise-ai-daily
npx serve .   # or just open index.html
```

## Deploy to GitHub Pages

1. Repo → **Settings** → **Pages**
2. Source: **Deploy from branch** → `main` → `/ (root)`
3. Save — live in ~60 seconds at `https://virendrakulkarni-design.github.io/wise-ai-daily`

## License

MIT
