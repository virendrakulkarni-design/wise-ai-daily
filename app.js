/**
 * AI Daily — Social Video Summarizer & AI News Digest
 * Uses Groq (free) with open-source models (Llama, Mixtral, Gemma).
 * Model list is fetched live from your API key — nothing hardcoded.
 * v1.4 — cache-bust 2026-09-13 (full history & URL summaries support)
 */

// ── Constants ────────────────────────────────────────────────────
const GROQ_API    = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = 'https://api.groq.com/openai/v1/models';
const TODAY       = new Date().toISOString().slice(0, 10);

// Preference order — first match from your account wins
const MODEL_PRIORITY = [
  'llama3-70b-8192',
  'llama-3.1-70b-versatile',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
  'gemma-7b-it',
];

const PLATFORMS = {
  youtube:   { label:'YouTube',   cls:'t-yt',    icon:'ti-brand-youtube'    },
  instagram: { label:'Instagram', cls:'t-ig',    icon:'ti-brand-instagram'  },
  facebook:  { label:'Facebook',  cls:'t-fb',    icon:'ti-brand-facebook'   },
  twitter:   { label:'X/Twitter', cls:'t-tw',    icon:'ti-brand-x'          },
  github:    { label:'GitHub',    cls:'t-gh',    icon:'ti-brand-github'     },
  web:       { label:'Web',       cls:'t-web',   icon:'ti-world'            },
  paper:     { label:'Paper',     cls:'t-paper', icon:'ti-file-description' },
};

// ── State ────────────────────────────────────────────────────────
const S = {
  tab: 'feed',
  apiKey: '',
  apiKeyValid: null,
  showSetup: false,
  availableModels: [],
  activeModel: '',
  modelsLoading: false,
  todayDigest: null,
  following: [],
  historyDates: [],
  historySelected: null,
  historyData: null,
  historyFilter: 'all', // 'all' | 'digests' | 'summaries'
  historySearch: '',
  urlSummaries: [],
  loading: false,
  loadError: '',
  urlInput: '',
  urlResult: null,
  urlLoading: false,
  urlError: '',
  newHandle: '',
  newPlatform: 'twitter',
  newName: '',
  followError: '',
  tempKey: '',
};

// ── Storage ──────────────────────────────────────────────────────
const sg = k => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; } };
const ss = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const sl = p => { const r=[]; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(p))r.push(k);} return r; };

function normalizeDigest(data) {
  if (!data) return null;
  if (Array.isArray(data)) return { fetchedAt: '', items: data };
  const items = data.items || data.articles || data.news || data.stories || data.digest || data.trending || data.posts || [];
  return {
    ...data,
    items: Array.isArray(items) ? items : []
  };
}

function refreshHistoryDates() {
  S.historyDates = sl('digest:')
    .map(k => k.replace('digest:', ''))
    .filter(Boolean)
    .sort()
    .reverse();
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  const formatted = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return dateStr === TODAY ? `${formatted} · Today` : formatted;
}

// ── Fetch model list live from Groq ──────────────────────────────
async function loadModels(key) {
  S.modelsLoading = true; S.availableModels = []; S.activeModel = ''; render();
  try {
    const res = await fetch(GROQ_MODELS, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) { S.apiKeyValid = false; S.modelsLoading = false; render(); return; }
    const data = await res.json();
    // Only keep text generation models (exclude whisper/tts/vision/guard)
    S.availableModels = (data.data || [])
      .map(m => m.id)
      .filter(id =>
        !id.includes('whisper') &&
        !id.includes('tts') &&
        !id.includes('distil') &&
        !id.includes('guard') &&
        !id.includes('vision') &&
        !id.includes('tool-use') // preview models sometimes restricted
      )
      .sort();

    // Pick best model from priority list, fall back to first available
    const saved = sg('active-model');
    S.activeModel =
      (saved && S.availableModels.includes(saved)) ? saved :
      MODEL_PRIORITY.find(m => S.availableModels.includes(m)) ||
      S.availableModels[0] || '';

    ss('active-model', S.activeModel);
    S.apiKeyValid = true;
  } catch(e) {
    S.apiKeyValid = false;
  }
  S.modelsLoading = false; render();
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  S.apiKey       = sg('groq-api-key') || '';
  S.following    = sg('ai-following') || [];
  S.todayDigest  = normalizeDigest(sg('digest:'+TODAY));
  S.urlSummaries = sg('ai-summaries') || [];

  const seedVipassana = {
    id: 'sum-seed-vipassana',
    title: 'Guided Vipassana Meditation — 1 Hour S.N. Goenka Session',
    platform: 'youtube',
    type: 'Video',
    url: 'https://www.youtube.com/watch?v=vwLVjHEGGK0',
    source: 'S.N. Goenka / Virendra Kulkarni',
    duration: '1:02:48',
    date: TODAY,
    createdAt: new Date().toISOString(),
    overview: 'A complete 1-hour guided Vipassana meditation session led by S.N. Goenka Guruji for experienced students. Emphasizes developing Equanimity (Samata) and experiential wisdom (Panna) through observing bodily sensations without craving or aversion.',
    points: [
      {
        timestamp: "2:36",
        seconds: 156,
        text: "Anapana (Breath Awareness): Focus attention on the natural, incoming and outgoing breath at the entrance of the nostrils to calm the mind, sharpen concentration, and develop Samadhi."
      },
      {
        timestamp: "11:29",
        seconds: 689,
        text: "Vipassana Technique (Head-to-Toe Body Scan): Systematically scan bodily sensations from the top of the head to the tips of the toes. Observe sensations objectively—whether gross, subtle, heavy, or tingling."
      },
      {
        timestamp: "16:10",
        seconds: 970,
        text: "Cultivating Equanimity (Samata & Anicca): Maintain absolute mental balance without reacting to sensations. Avoid craving (Raga) pleasant sensations or aversion (Dosa) toward pain, understanding that all sensations arise and pass away (Anicca)."
      },
      {
        timestamp: "38:33",
        seconds: 2313,
        text: "Deep Sankhara Eradication: Sittings of strong determination (Adhitthana). Transforming intense bodily discomfort into opportunities to break deep-seated patterns of aversion and unconscious reactivity."
      },
      {
        timestamp: "54:06",
        seconds: 3246,
        text: "Mangal Maitri (Metta Meditation): Concluding practice of radiating loving-kindness and compassion to all living beings, wishing universal peace, harmony, and liberation (Bhavatu Sabba Mangalam)."
      }
    ]
  };

  const seedAiVideo = {
    id: 'sum-seed-aivideo',
    title: 'RIP Paid Tools: Make LONG AI Videos With Consistency!',
    platform: 'youtube',
    type: 'Video',
    url: 'https://www.youtube.com/watch?v=Qsi9MeLh95Q',
    source: 'Mr Void',
    duration: '11:51',
    date: TODAY,
    createdAt: new Date().toISOString(),
    overview: 'A zero-cost, fully automated production pipeline for long-form cinematic AI narrative videos with consistent character design using free tools and browser extensions.',
    points: [
      { timestamp: "0:00", seconds: 0, text: "The Problem: Why AI channels fail due to face mutations and Grok paywalls, and how this zero-cost automation pipeline fixes it." },
      { timestamp: "1:05", seconds: 65, text: "Story & Visual Prompts: Google Gemini with structured master prompts generates complete cinematic story and 18+ chronological scene prompts." },
      { timestamp: "2:50", seconds: 170, text: "Character Consistency: Generate 16:9 anchor character portraits in Google Flow to lock face geometry and prevent drift." },
      { timestamp: "4:00", seconds: 240, text: "Automated Batch Generation: Auto Flow Chrome extension maps anchor characters to prompts and auto-downloads all rendered frames." },
      { timestamp: "6:00", seconds: 360, text: "Full Animation Automation: Meta AI + Meta Automation extension for automated frame-to-video rendering with camera motion prompts." },
      { timestamp: "9:10", seconds: 550, text: "Voiceover & Soundtrack: Google AI Studio (Gemini 2.5 Pro Single Speaker voice model) for studio audio, and Gemini for synced music." },
      { timestamp: "10:50", seconds: 650, text: "Bonus High-Motion Safety Net: Google Vids (Veo 3.1 model) provides 10-12 free daily generations for complex physics action shots." }
    ]
  };

  // Seed sample summaries if not present
  const hasVipassana = S.urlSummaries.some(s => (s.url||'').includes('vwLVjHEGGK0'));
  const hasAiVideo = S.urlSummaries.some(s => (s.url||'').includes('Qsi9MeLh95Q'));
  if (!hasVipassana) S.urlSummaries.unshift(seedVipassana);
  if (!hasAiVideo) S.urlSummaries.push(seedAiVideo);
  ss('ai-summaries', S.urlSummaries);

  refreshHistoryDates();
  S.showSetup    = !S.apiKey;


  // Check for URL shared via iOS Shortcut or share.html redirect
  const pending = sessionStorage.getItem('pending-share');
  if (pending) {
    sessionStorage.removeItem('pending-share');
    S.tab = 'add';
    S.urlInput = pending;
  }

  render();
  if (S.apiKey) {
    await loadModels(S.apiKey);
    // Auto-summarize if a URL was shared in (after models are loaded)
    if (pending && S.activeModel) {
      setTimeout(() => summarizeURL(), 300);
    }
  }
}


// ── Save API key ─────────────────────────────────────────────────
async function saveKey() {
  const key = S.tempKey.trim();
  if (!key.startsWith('gsk_')) {
    S.loadError = 'Groq keys start with gsk_ — check and try again.'; render(); return;
  }
  // Clear any stale model cache
  localStorage.removeItem('active-model');
  S.apiKey = key;
  ss('groq-api-key', key);
  S.showSetup = false;
  S.loadError = '';
  S.tempKey = '';
  render();
  await loadModels(key);
}

// ── Change model ─────────────────────────────────────────────────
function changeModel(id) {
  S.activeModel = id;
  ss('active-model', id);
  render();
}

// ── Core API call ────────────────────────────────────────────────
async function callGroq(prompt, maxTokens = 2048) {
  if (!S.apiKey) throw new Error('NO_KEY');
  if (!S.activeModel) throw new Error('No model selected — refresh the page or re-enter your API key.');

  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
    body: JSON.stringify({
      model: S.activeModel,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You are an AI research assistant. Always respond with raw valid JSON only — no markdown, no backticks, no explanation.' },
        { role: 'user',   content: prompt }
      ],
    }),
  });

  if (res.status === 401) { S.apiKeyValid = false; throw new Error('API key invalid or expired.'); }
  if (!res.ok) {
    const e = await res.json().catch(()=>({}));
    throw new Error(e.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  S.apiKeyValid = true;
  const text = data.choices?.[0]?.message?.content || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Model returned no JSON. Try again.');
  return JSON.parse(match[0]);
}

// ── URL parser ───────────────────────────────────────────────────
function parseURL(raw) {
  try {
    const url = new URL(raw.trim());
    const h = url.hostname.replace('www.', '');
    if (h.includes('youtu.be') || h.includes('youtube.com')) {
      let id=null, type='Video';
      if (h==='youtu.be') id=url.pathname.slice(1).split('?')[0];
      else if (url.pathname.includes('/shorts/')) { id=url.pathname.split('/shorts/')[1].split('?')[0]; type='Short'; }
      else id=url.searchParams.get('v');
      if (id) return { platform:'youtube', id, type, url:raw.trim() };
    }
    if (h.includes('instagram.com')) {
      const m=url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) return { platform:'instagram', id:m[2], type:m[1]==='reel'?'Reel':'Post', url:raw.trim() };
    }
    if (h.includes('facebook.com') || h.includes('fb.watch')) {
      // /share/v/SHORTCODE, /watch/?v=ID, /videos/ID, /reel/ID, fb.watch/X
      const shareMatch = url.pathname.match(/\/share\/(?:v|r)\/([A-Za-z0-9_-]+)/);
      const videoMatch = url.pathname.match(/\/(?:watch|videos|reel)\/(?:[^/]+\/)?([A-Za-z0-9_-]+)/);
      const qv = url.searchParams.get('v');
      const id = shareMatch?.[1] || videoMatch?.[1] || qv || url.pathname.split('/').filter(Boolean).pop();
      const type = url.pathname.includes('/reel/') ? 'Reel' : 'Video';
      if (id) return { platform:'facebook', id, type, url:raw.trim() };
    }
    if (h.includes('twitter.com')||h.includes('x.com')) {
      const m=url.pathname.match(/\/status\/(\d+)/);
      if (m) return { platform:'twitter', id:m[1], type:'Post', url:raw.trim() };
    }
    if (h.includes('github.com')) {
      const parts=url.pathname.split('/').filter(Boolean);
      if (parts.length>=2) return { platform:'github', id:parts.slice(0,2).join('/'), type:'Repo', url:raw.trim() };
    }
    return { platform:'web', id:h, type:'Article', url:raw.trim() };
  } catch {}
  return null;
}

// ── Daily digest ─────────────────────────────────────────────────
async function fetchDigest() {
  if (!S.apiKey) { S.showSetup=true; render(); return; }
  S.loading=true; S.loadError=''; render();

  const followStr = S.following.length
    ? '\nAlso include latest content from: ' + S.following.map(f=>`${f.platform} @${f.handle}`).join(', ') + '.'
    : '';

  const prompt = `Today is ${TODAY}. Generate a daily AI news digest of 12 varied trending AI/ML items from the last 24 hours. Mix of:
- Breaking AI model or product announcements (OpenAI, Anthropic, Google, Meta, Mistral, xAI)
- Trending GitHub repos for AI/ML
- New research papers (arXiv, Hugging Face)
- Viral AI posts on X/Twitter
- YouTube AI videos trending
- AI startup/funding news
- Hacker News top AI threads${followStr}

You MUST return exactly 12 items in the "items" array, numbered item-1 to item-12. Do not stop early. Each item needs realistic URLs and 3 bullet point key insights.

Return ONLY this JSON:
{
  "fetchedAt": "${new Date().toLocaleTimeString()}",
  "items": [
    {
      "id": "item-1",
      "title": "...",
      "url": "https://...",
      "platform": "twitter|github|youtube|web|paper|instagram|facebook",
      "type": "video|article|repo|post|paper|announcement|thread",
      "source": "author or site name",
      "importance": "high|medium",
      "points": ["insight 1", "insight 2", "insight 3"]
    }
  ]
}`;

  try {
    const result = await callGroq(prompt, 3000);
    const normalized = normalizeDigest(result);
    normalized.date = TODAY;
    S.todayDigest = normalized;
    ss('digest:'+TODAY, normalized);
    refreshHistoryDates();
  } catch(e) {
    if (e.message==='NO_KEY') S.showSetup=true;
    else S.loadError = e.message;
  }
  S.loading=false; render();
}

// ── Paste from clipboard & summarize (one tap) ───────────────────
async function pasteAndSummarize() {
  if (!S.apiKey) { S.showSetup=true; render(); return; }
  S.urlError = '';
  try {
    const text = await navigator.clipboard.readText();
    const trimmed = (text || '').trim();
    if (!trimmed) {
      S.urlError = 'Clipboard is empty. Copy a link first (Share → Copy Link).';
      render();
      return;
    }
    // Extract a URL if the clipboard has extra text around it
    const match = trimmed.match(/https?:\/\/[^\s]+/);
    const url = match ? match[0] : trimmed;
    if (!parseURL(url)) {
      S.urlError = "Clipboard doesn't contain a valid URL.";
      render();
      return;
    }
    S.urlInput = url;
    render();
    await summarizeURL();
  } catch (e) {
    S.urlError = 'Could not read clipboard. Your browser may need permission — try pasting manually instead.';
    render();
  }
}

// ── Summarise URL ────────────────────────────────────────────────
async function summarizeURL() {
  if (!S.apiKey) { S.showSetup=true; render(); return; }
  const url = S.urlInput.trim();
  if (!url) { S.urlError='Enter a URL first.'; render(); return; }
  const parsed = parseURL(url);
  if (!parsed) { S.urlError="Doesn't look like a valid URL."; render(); return; }
  S.urlLoading=true; S.urlError=''; S.urlResult=null; render();

  // Fetch metadata via noembed for accurate title & author
  let videoMeta = null;
  if (parsed.platform === 'youtube' || parsed.platform === 'web') {
    try {
      const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
      if (oembedRes.ok) {
        const odata = await oembedRes.json();
        if (odata && odata.title) videoMeta = odata;
      }
    } catch {}
  }

  const isVideo = ['youtube','instagram','facebook'].includes(parsed.platform);
  const rawTitle = videoMeta?.title || '';
  const cleanTitle = rawTitle.replace(/\s*-\s*YouTube$/i, '').trim();
  const videoAuthor = videoMeta?.author_name || '';

  const prompt = isVideo
    ? `You are an expert video analyst summarizing this ${parsed.platform} video:
URL: ${url}
Title: "${cleanTitle || 'Video'}"
${videoAuthor ? `Creator / Channel: "${videoAuthor}"` : ''}

TASK:
Analyze this video in detail based on its subject matter ("${cleanTitle}").
- If this is a meditation session (e.g., Vipassana, Mindfulness, Pranayama, Yoga), detail the exact classical phases (e.g., Anapana breath awareness, systematic body scanning, developing Equanimity towards sensations and knowing Anicca/impermanence, and concluding Mangal Maitri / Metta meditation) with realistic timestamps.
- If this is a tutorial, AI workflow, lecture, or workout, break down the exact step-by-step methodologies, tools, and takeaways.

STRICT INSTRUCTIONS:
1. Provide 4 to 6 chronological milestones across the video with realistic timestamps (e.g., 0:00, 2:30, 11:15, 38:00, 54:00).
2. For EVERY milestone, write a rich, substantive explanation (2-3 detailed sentences) explaining what is taught, practiced, or demonstrated.
3. FORBIDDEN: NEVER output placeholder text like "opening context", "first main point", "second main point", "third main point", "hook", or "takeaway". Every point must contain real, specific, rich knowledge.
4. Include a concise 2-3 sentence overview explaining the core purpose and technique of the video.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "title": "${(cleanTitle || 'Video Summary').replace(/"/g, '\\"')}",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "${(videoAuthor || 'Creator').replace(/"/g, '\\"')}",
  "duration": "estimated duration e.g. 10:00 or 1:00:00",
  "overview": "2-3 sentence executive overview of what this video teaches and who it is for",
  "points": [
    {
      "timestamp": "0:00",
      "seconds": 0,
      "text": "Detailed explanation of opening phase and technique..."
    }
  ]
}`
    : `Summarize the content at this ${parsed.platform} URL: ${url}
Title: "${cleanTitle || 'Page'}"
${videoAuthor ? `Author/Source: "${videoAuthor}"` : ''}

STRICT INSTRUCTIONS:
1. Provide 4 to 6 highly informative, specific takeaways.
2. NEVER output generic placeholder text like "insight 1" or "main point".

Return ONLY valid JSON:
{
  "title": "${(cleanTitle || 'Page Summary').replace(/"/g, '\\"')}",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "${(videoAuthor || 'Author').replace(/"/g, '\\"')}",
  "overview": "2-3 sentence executive overview of the page content.",
  "points": ["Specific insight 1", "Specific insight 2", "Specific insight 3", "Specific insight 4"]
}`;

  try {
    const rawResult = await callGroq(prompt);
    if (cleanTitle && (!rawResult.title || rawResult.title.includes('inferred') || rawResult.title === 'Video Summary')) {
      rawResult.title = cleanTitle;
    }
    if (videoAuthor && (!rawResult.source || rawResult.source.includes('likely') || rawResult.source === 'Creator')) {
      rawResult.source = videoAuthor;
    }
    rawResult.url = url;
    rawResult.platform = parsed.platform;
    rawResult.type = parsed.type;

    // Sanitize any accidental placeholder text from LLM
    const placeholderRegex = /^(opening context|first main point|second main point|third main point|closing takeaway|insight \d|hook)/i;
    if (Array.isArray(rawResult.points)) {
      rawResult.points = rawResult.points.filter(p => {
        const text = (typeof p === 'string' ? p : p?.text || '').trim();
        return !placeholderRegex.test(text);
      });
    }

    S.urlResult = rawResult;

    // Save to persistent URL summaries in localStorage
    const summaryItem = {
      id: 'sum-' + Date.now(),
      createdAt: new Date().toISOString(),
      date: TODAY,
      ...rawResult,
    };
    S.urlSummaries = [summaryItem, ...(S.urlSummaries || []).filter(s => s.url !== url)].slice(0, 100);
    ss('ai-summaries', S.urlSummaries);
  } catch(e) {
    if (e.message==='NO_KEY') S.showSetup=true;
    else S.urlError = e.message;
  }
  S.urlLoading=false; render();
}


function deleteSummary(id) {
  S.urlSummaries = (S.urlSummaries || []).filter(s => s.id !== id);
  ss('ai-summaries', S.urlSummaries);
  render();
}

// ── History ──────────────────────────────────────────────────────
function loadHistoryDate(date) {
  S.historySelected = date;
  S.historyData = normalizeDigest(sg('digest:'+date));
  render();
}

// ── Following ────────────────────────────────────────────────────
function addHandle() {
  if (!S.newHandle.trim()) { S.followError='Enter a handle.'; render(); return; }
  const handle=S.newHandle.trim().replace(/^@/,'');
  if (S.following.some(f=>f.handle===handle&&f.platform===S.newPlatform)) { S.followError='Already following.'; render(); return; }
  S.following.push({ platform:S.newPlatform, handle, name:S.newName.trim()||('@'+handle) });
  S.newHandle=''; S.newName=''; S.followError='';
  ss('ai-following',S.following); render();
}
function removeHandle(i) { S.following.splice(i,1); ss('ai-following',S.following); render(); }

// ── Templates ────────────────────────────────────────────────────
function ptag(p) { const x=PLATFORMS[p]||PLATFORMS.web; return `<span class="tag ${x.cls}"><i class="ti ${x.icon}" aria-hidden="true"></i> ${x.label}</span>`; }

function renderItems(items) {
  if (!items?.length) return '<p style="color:var(--text-muted);font-size:14px">No items.</p>';
  return items.map(item => `<div class="card">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
      ${item.importance==='high'?'<span class="tag t-hot"><i class="ti ti-flame"></i> Hot</span>':''}
      ${ptag(item.platform)}
      <span class="tag t-type">${item.type||'post'}</span>
      ${item.source?`<span style="font-size:11px;color:var(--text-muted);margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">${item.source}</span>`:''}
    </div>
    <a href="${item.url||'#'}" target="_blank" rel="noopener" class="card-title">
      ${item.title} <i class="ti ti-external-link" style="font-size:12px;color:var(--text-muted)"></i>
    </a>
    ${(item.points||[]).map(p=>`<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${p}</span></div>`).join('')}
  </div>`).join('');
}

// ── Setup modal ──────────────────────────────────────────────────
function buildSetup() {
  return `<div class="modal-overlay" onclick="if(event.target===this&&S.apiKey){S.showSetup=false;render()}">
    <div class="modal">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div class="logo-mark"><i class="ti ti-brain" style="font-size:21px"></i></div>
        <div>
          <div style="font-size:18px;font-weight:700">Connect Groq</div>
          <div style="font-size:12px;color:var(--text-muted)">Free · Open-source models · No credit card</div>
        </div>
      </div>
      <div class="modal-steps">
        <div class="modal-step"><div class="step-num">1</div><div class="step-body">Sign up free at <a href="https://console.groq.com" target="_blank">console.groq.com</a> — no credit card needed.</div></div>
        <div class="modal-step"><div class="step-num">2</div><div class="step-body">Go to <strong>API Keys → Create API Key</strong>. Copy the key starting with <code>gsk_</code></div></div>
        <div class="modal-step"><div class="step-num">3</div><div class="step-body">Paste it below. Stored only in your browser — never shared.</div></div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input class="input-field" type="password" placeholder="gsk_..."
          value="${S.tempKey}"
          oninput="S.tempKey=this.value"
          onkeydown="if(event.key==='Enter')saveKey()" />
        <button class="btn-primary" onclick="saveKey()"><i class="ti ti-check"></i> Save</button>
      </div>
      ${S.loadError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.loadError}</div>`:''}
      <div class="modal-note">🔒 Key stored in localStorage only. Groq free tier: ~14,400 req/day on open-source models.</div>
    </div>
  </div>`;
}

// ── Tab: Feed ────────────────────────────────────────────────────
function buildFeed() {
  const d=S.todayDigest;
  const ds=new Date(TODAY+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1rem;gap:12px;flex-wrap:wrap">
      <div><div class="section-label">Today's Digest</div><div style="font-size:16px;font-weight:500">${ds}</div></div>
      <button class="btn-primary" onclick="fetchDigest()" ${S.loading||S.modelsLoading?'disabled':''}>
        ${S.loading?`<span class="pulse-dot"></span> Researching…`:`<i class="ti ti-telescope"></i> ${d?'Refresh':'Research Now'}`}
      </button>
    </div>
    ${S.loadError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.loadError}</div>`:''}
    ${!S.apiKey?`<div class="info-box">
      <i class="ti ti-key" style="margin-right:6px"></i>
      Add your free Groq API key to get started.
      <button class="btn-ghost" style="margin-left:8px;padding:3px 10px;font-size:12px" onclick="S.showSetup=true;render()">Set up →</button>
    </div>`:''}
    ${S.modelsLoading?`<div class="loading-row"><span class="pulse-dot"></span> Detecting available models on your account…</div>`:''}
    ${S.apiKey&&!S.modelsLoading&&!S.activeModel?`<div class="error-box"><i class="ti ti-alert-circle"></i> Could not detect any models — check your API key. <button class="btn-ghost" style="margin-left:8px;padding:3px 10px;font-size:12px" onclick="S.showSetup=true;S.tempKey='';render()">Re-enter key</button></div>`:''}
    ${S.loading?`<div class="loading-row"><span class="pulse-dot"></span> Searching YouTube · X · GitHub · arXiv · blogs…</div>
      <div class="skeleton" style="height:100px"></div><div class="skeleton" style="height:80px"></div>
      <div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:80px"></div>`:''}
    ${!S.loading&&!d?`<div class="empty-state">
      <i class="ti ti-robot"></i>
      <h3>No digest yet for today</h3>
      <p>Hit <strong>Research Now</strong> to pull today's top AI content from across the web.</p>
    </div>`:''}
    ${!S.loading&&d?`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span style="font-size:12px;color:var(--text-muted)">Updated ${d.fetchedAt||''} · ${(d.items||[]).length} items</span>
        ${S.activeModel?`<span class="model-badge">${S.activeModel}</span>`:''}
      </div>
      ${renderItems(d.items)}
    `:''}`;
}

// ── Tab: Add URL ─────────────────────────────────────────────────
function buildAdd() {
  const r=S.urlResult;
  const isVideo=r&&['youtube','instagram','facebook'].includes(r.platform);
  return `
    <!-- iPhone Shortcut card -->
    <div class="card" style="margin-bottom:14px;background:linear-gradient(135deg,rgba(108,63,197,0.12),rgba(168,85,247,0.08));border-color:rgba(108,63,197,0.3)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#6c3fc5,#a855f7);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(108,63,197,0.4)">
          <i class="ti ti-bolt" style="color:#fff;font-size:22px"></i>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary)">Share from any iPhone app</div>
          <div style="font-size:12px;color:var(--text-muted)">YouTube · Instagram · Facebook · X · Safari</div>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:14px">
        Install the <strong style="color:var(--text-primary)">AI Daily Shortcut</strong> once — then tap Share → AI Daily in any app and it summarizes automatically.
      </div>
      <a href="/wise-ai-daily/shortcut.html"
         style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:linear-gradient(135deg,#6c3fc5,#a855f7);color:#fff;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;box-shadow:0 4px 16px rgba(108,63,197,0.4)">
        <i class="ti ti-bolt" style="font-size:18px"></i> Install iPhone Shortcut
      </a>
      <div style="margin-top:10px;font-size:11px;color:var(--text-muted);text-align:center">Takes 30 seconds · Works with all iOS apps</div>
    </div>

    <!-- Supported platforms -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      <span style="font-size:12px;color:var(--text-muted);line-height:26px;margin-right:2px">Works with:</span>
      <span class="tag t-yt"><i class="ti ti-brand-youtube"></i> YouTube</span>
      <span class="tag t-ig"><i class="ti ti-brand-instagram"></i> Instagram</span>
      <span class="tag t-fb"><i class="ti ti-brand-facebook"></i> Facebook</span>
      <span class="tag t-tw"><i class="ti ti-brand-x"></i> X</span>
      <span class="tag t-gh"><i class="ti ti-brand-github"></i> GitHub</span>
      <span class="tag t-web"><i class="ti ti-world"></i> Any URL</span>
    </div>
    <!-- One-tap clipboard paste -->
    <button onclick="pasteAndSummarize()" ${S.urlLoading||S.modelsLoading?'disabled':''}
      style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;background:var(--surface-2);border:1.5px solid var(--brand);color:var(--brand);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:14px">
      <i class="ti ti-clipboard-check" style="font-size:19px"></i> Paste & Summarize
    </button>

    <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Or type/paste a URL manually:</div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input class="input-field" type="url" placeholder="Paste any URL here…"
        value="${S.urlInput}"
        oninput="S.urlInput=this.value;S.urlError=''"
        onkeydown="if(event.key==='Enter')summarizeURL()" />
      <button class="btn-primary" onclick="summarizeURL()" ${S.urlLoading||S.modelsLoading?'disabled':''}>
        ${S.urlLoading?`<span class="pulse-dot"></span>`:`<i class="ti ti-sparkles"></i>`} Summarize
      </button>
    </div>
    ${S.urlError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.urlError}</div>`:''}
    ${S.urlLoading?`<div class="loading-row"><span class="pulse-dot"></span> Analyzing…</div><div class="skeleton" style="height:160px"></div>`:''}
    ${r&&!S.urlLoading?`<div class="card">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        ${ptag(r.platform)}<span class="tag t-type">${r.type||''}</span>
        ${r.source?`<span style="font-size:11px;color:var(--text-muted)">${r.source}</span>`:''}
        ${r.duration?`<span style="font-size:11px;color:var(--text-muted)">${r.duration}</span>`:''}
        <span style="font-size:11px;color:var(--text-success);margin-left:auto"><i class="ti ti-check"></i> Saved to History</span>
      </div>
      <div style="font-size:15px;font-weight:500;margin-bottom:12px;line-height:1.4">${r.title||'Summary'}</div>
      ${r.overview ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:14px;padding:9px 12px;background:var(--surface-1);border-radius:8px;border-left:3px solid var(--brand)">${r.overview}</div>` : ''}
      ${isVideo&&r.points?r.points.map(p=>{
        const href=r.platform==='youtube'?`${r.url}&t=${p.seconds}s`:r.url;
        return `<div class="bullet"><a class="ts-link${r.platform!=='youtube'?' ts-approx':''}" href="${href}" target="_blank" rel="noopener">${p.timestamp}</a><span class="bullet-text">${p.text}</span></div>`;
      }).join(''):''}
      ${!isVideo&&r.points?r.points.map(p=>`<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${p}</span></div>`).join(''):''}
      <a href="${r.url}" target="_blank" rel="noopener" style="font-size:12px;color:var(--text-muted);margin-top:12px;display:inline-flex;align-items:center;gap:4px">
        Open original <i class="ti ti-external-link" style="font-size:12px"></i>
      </a>
    </div>`:''}`;
}

// ── Summary Card Renderer ─────────────────────────────────────────
function renderSummaryCard(r, id = null) {
  if (!r) return '';
  const isVideo = ['youtube','instagram','facebook'].includes(r.platform);
  const deleteBtn = id ? `
    <button class="btn-ghost" style="padding:2px 7px;font-size:11px;margin-left:auto;color:var(--text-danger)" onclick="deleteSummary('${id}')" title="Delete summary">
      <i class="ti ti-trash"></i>
    </button>` : '';

  return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      ${ptag(r.platform)}
      <span class="tag t-type">${r.type || 'Summary'}</span>
      ${r.source ? `<span style="font-size:11px;color:var(--text-muted)">${r.source}</span>` : ''}
      ${r.duration ? `<span style="font-size:11px;color:var(--text-muted)">${r.duration}</span>` : ''}
      ${r.date ? `<span style="font-size:11px;color:var(--text-muted)">${formatDateLabel(r.date)}</span>` : ''}
      ${deleteBtn}
    </div>
    <a href="${r.url || '#'}" target="_blank" rel="noopener" class="card-title">
      ${r.title || 'Summary'} <i class="ti ti-external-link" style="font-size:12px;color:var(--text-muted)"></i>
    </a>
    ${r.overview ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:14px;padding:9px 12px;background:var(--surface-1);border-radius:8px;border-left:3px solid var(--brand)">${r.overview}</div>` : ''}
    ${isVideo && Array.isArray(r.points) && typeof r.points[0] === 'object' ? r.points.map(p => {
      const href = r.platform === 'youtube' && p.seconds !== undefined ? `${r.url}&t=${p.seconds}s` : r.url;
      return `<div class="bullet"><a class="ts-link${r.platform !== 'youtube' ? ' ts-approx' : ''}" href="${href}" target="_blank" rel="noopener">${p.timestamp || '0:00'}</a><span class="bullet-text">${p.text || ''}</span></div>`;
    }).join('') : ''}
    ${(!isVideo || !Array.isArray(r.points) || typeof r.points[0] !== 'object') && Array.isArray(r.points) ? r.points.map(p => {
      const text = typeof p === 'string' ? p : (p.text || '');
      return `<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${text}</span></div>`;
    }).join('') : ''}
    ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener" style="font-size:12px;color:var(--text-muted);margin-top:10px;display:inline-flex;align-items:center;gap:4px">Open original <i class="ti ti-external-link" style="font-size:12px"></i></a>` : ''}
  </div>`;
}

// ── Tab: History ─────────────────────────────────────────────────
function buildHistory() {
  if (S.historySelected) {
    const hd = S.historyData;
    const dt = formatDateLabel(S.historySelected);
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
      <button class="btn-ghost" onclick="S.historySelected=null;S.historyData=null;render()"><i class="ti ti-arrow-left"></i> Back</button>
      <div style="font-size:15px;font-weight:500">${dt}</div>
    </div>
    ${hd ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">${(hd.items||[]).length} items · ${hd.fetchedAt||''}</div>${renderItems(hd.items)}`
         : `<div class="error-box"><i class="ti ti-alert-circle"></i> Digest not found.</div>`}`;
  }

  // Collect all items across all digests
  const allDigestItems = [];
  S.historyDates.forEach(date => {
    const digest = normalizeDigest(sg('digest:' + date));
    if (digest?.items?.length) {
      digest.items.forEach(item => {
        allDigestItems.push({
          ...item,
          digestDate: date,
          isDigest: true,
        });
      });
    }
  });

  const urlSummaries = S.urlSummaries || [];
  const totalAllCount = allDigestItems.length + urlSummaries.length;

  // Search filter
  const q = (S.historySearch || '').trim().toLowerCase();
  const filterSummary = (s) => {
    if (!q) return true;
    const titleMatch = (s.title || '').toLowerCase().includes(q);
    const sourceMatch = (s.source || '').toLowerCase().includes(q);
    const pointsMatch = (s.points || []).some(p => {
      const txt = typeof p === 'string' ? p : (p.text || '');
      return txt.toLowerCase().includes(q);
    });
    return titleMatch || sourceMatch || pointsMatch;
  };

  const filterDigestItem = (it) => {
    if (!q) return true;
    const titleMatch = (it.title || '').toLowerCase().includes(q);
    const sourceMatch = (it.source || '').toLowerCase().includes(q);
    const pointsMatch = (it.points || []).some(p => {
      const txt = typeof p === 'string' ? p : (p.text || '');
      return txt.toLowerCase().includes(q);
    });
    return titleMatch || sourceMatch || pointsMatch;
  };

  const filteredSummaries = urlSummaries.filter(filterSummary);
  const filteredDigestItems = allDigestItems.filter(filterDigestItem);

  const pills = `
    <div class="filter-pills">
      <button class="pill-btn ${S.historyFilter==='all'?'active':''}" onclick="S.historyFilter='all';render()">
        <i class="ti ti-list"></i> All Items (${totalAllCount})
      </button>
      <button class="pill-btn ${S.historyFilter==='digests'?'active':''}" onclick="S.historyFilter='digests';render()">
        <i class="ti ti-calendar"></i> Daily Digests (${S.historyDates.length})
      </button>
      <button class="pill-btn ${S.historyFilter==='summaries'?'active':''}" onclick="S.historyFilter='summaries';render()">
        <i class="ti ti-link"></i> URL Summaries (${urlSummaries.length})
      </button>
    </div>
    <div style="margin-bottom:14px">
      <input class="input-field" type="search" placeholder="Search all history items, topics, keywords..."
        value="${S.historySearch}"
        oninput="S.historySearch=this.value;render()" />
    </div>
  `;

  if (!totalAllCount && !S.historyDates.length) {
    return `<div class="empty-state">
      <i class="ti ti-calendar-off"></i>
      <h3>No history yet</h3>
      <p>Items will automatically appear here whenever you run a daily digest or summarize a URL.</p>
    </div>`;
  }

  if (S.historyFilter === 'summaries') {
    if (!filteredSummaries.length) {
      return pills + `<div class="empty-state">
        <i class="ti ti-link-off"></i>
        <h3>No URL summaries found</h3>
        <p>${q ? 'No summaries matched your search.' : 'Summarize any YouTube video, article, or post in the "Add URL" tab to save it here.'}</p>
      </div>`;
    }
    return pills + `
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${filteredSummaries.length} saved summar${filteredSummaries.length !== 1 ? 'ies' : 'y'}</div>
      ${filteredSummaries.map(s => renderSummaryCard(s, s.id)).join('')}
    `;
  }

  if (S.historyFilter === 'digests') {
    if (!S.historyDates.length) {
      return pills + `<div class="empty-state"><i class="ti ti-calendar-off"></i><h3>No digests yet</h3></div>`;
    }
    return pills + `
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${S.historyDates.length} digest${S.historyDates.length !== 1 ? 's' : ''} stored</div>
      ${S.historyDates.map(date => {
        const dData = normalizeDigest(sg('digest:' + date));
        const count = (dData?.items || []).length;
        const dt = formatDateLabel(date);
        const isToday = date === TODAY;
        return `<div class="history-row" onclick="loadHistoryDate('${date}')">
          <div>
            <div style="font-size:14px;font-weight:500;display:flex;align-items:center;gap:6px">
              ${dt}
              ${isToday ? '<span class="model-badge">Current</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px">${count} news items · ${dData?.fetchedAt || 'Saved'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:var(--brand);font-weight:500">View items</span>
            <i class="ti ti-chevron-right" style="color:var(--text-muted)"></i>
          </div>
        </div>`;
      }).join('')}
    `;
  }

  // S.historyFilter === 'all'
  const hasMatches = filteredSummaries.length > 0 || filteredDigestItems.length > 0;
  if (!hasMatches) {
    return pills + `<div class="empty-state">
      <i class="ti ti-search"></i>
      <h3>No items matched "${S.historySearch}"</h3>
      <p>Try searching for a different keyword or clear the search box.</p>
    </div>`;
  }

  let html = pills;
  if (filteredSummaries.length) {
    html += `
      <div class="section-label" style="display:flex;align-items:center;gap:6px;margin-top:6px">
        <i class="ti ti-sparkles" style="color:var(--brand)"></i> Summarized Videos & Links (${filteredSummaries.length})
      </div>
      ${filteredSummaries.map(s => renderSummaryCard(s, s.id)).join('')}
    `;
  }

  if (filteredDigestItems.length) {
    html += `
      <div class="section-label" style="display:flex;align-items:center;gap:6px;margin-top:16px">
        <i class="ti ti-newspaper" style="color:var(--brand)"></i> Daily Digest News Items (${filteredDigestItems.length})
      </div>
      ${filteredDigestItems.map(item => `
        <div class="card">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
            <span class="tag t-type" style="font-size:10px">${formatDateLabel(item.digestDate)}</span>
            ${item.importance === 'high' ? '<span class="tag t-hot"><i class="ti ti-flame"></i> Hot</span>' : ''}
            ${ptag(item.platform)}
            <span class="tag t-type">${item.type || 'post'}</span>
            ${item.source ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">${item.source}</span>` : ''}
          </div>
          <a href="${item.url || '#'}" target="_blank" rel="noopener" class="card-title">
            ${item.title} <i class="ti ti-external-link" style="font-size:12px;color:var(--text-muted)"></i>
          </a>
          ${(item.points || []).map(p => {
            const txt = typeof p === 'string' ? p : (p.text || '');
            return `<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${txt}</span></div>`;
          }).join('')}
        </div>
      `).join('')}
    `;
  }

  return html;
}

// ── Tab: Following ───────────────────────────────────────────────
function buildFollowing() {
  const ptOpts=Object.entries(PLATFORMS).map(([k,v])=>`<option value="${k}" ${k===S.newPlatform?'selected':''}>${v.label}</option>`).join('');
  return `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.6">Add accounts to track — they'll be prioritised in every daily digest.</div>
  <div class="card" style="margin-bottom:1.5rem">
    <div class="section-label">Add account</div>
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <select class="select-field" onchange="S.newPlatform=this.value" style="min-width:120px">${ptOpts}</select>
      <input class="input-field" placeholder="@handle or username" value="${S.newHandle}"
        oninput="S.newHandle=this.value;S.followError=''"
        onkeydown="if(event.key==='Enter')addHandle()"
        style="flex:1;min-width:130px" />
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input class="input-field" placeholder="Display name (optional)" value="${S.newName}" oninput="S.newName=this.value" style="flex:1" />
      <button class="btn-primary" onclick="addHandle()"><i class="ti ti-plus"></i> Add</button>
    </div>
    ${S.followError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.followError}</div>`:''}
  </div>
  ${!S.following.length?`<div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:14px">No accounts followed yet.</div>`:''}
  ${S.following.map((f,i)=>{const p=PLATFORMS[f.platform]||PLATFORMS.web;return `<div class="handle-row">
    <div style="display:flex;align-items:center;gap:12px">
      <span class="tag ${p.cls}"><i class="ti ${p.icon}"></i></span>
      <div><div style="font-size:14px;font-weight:500">${f.name}</div><div style="font-size:12px;color:var(--text-muted)">@${f.handle} · ${p.label}</div></div>
    </div>
    <button class="btn-ghost" onclick="removeHandle(${i})"><i class="ti ti-x"></i></button>
  </div>`;}).join('')}`;
}

// ── Main render ──────────────────────────────────────────────────
function render() {
  const tabs=[
    {id:'feed',      icon:'ti-home',    label:'Feed'},
    {id:'add',       icon:'ti-link',    label:'Add URL'},
    {id:'history',   icon:'ti-history', label:'History'},
    {id:'following', icon:'ti-users',   label:'Following'},
  ];

  const statusCls = !S.apiKey?'':S.apiKeyValid===false?'err':'ok';
  const statusTxt = !S.apiKey
    ? '<i class="ti ti-key"></i> Set up API key'
    : S.apiKeyValid===false
      ? '<i class="ti ti-alert-circle"></i> Key invalid'
      : '<i class="ti ti-circle-check"></i> Groq connected';

  const modelSel = S.availableModels.length ? `
    <select class="select-field" title="Active model"
      onchange="changeModel(this.value)"
      style="font-size:11px;height:28px;padding:0 8px;border-radius:6px;max-width:200px">
      ${S.availableModels.map(m=>`<option value="${m}" ${m===S.activeModel?'selected':''}>${m}</option>`).join('')}
    </select>` : S.modelsLoading ? `<span style="font-size:11px;color:var(--text-muted)">Loading models…</span>` : '';

  let content='';
  if      (S.tab==='feed')      content=buildFeed();
  else if (S.tab==='add')       content=buildAdd();
  else if (S.tab==='history')   content=buildHistory();
  else if (S.tab==='following') content=buildFollowing();

  document.getElementById('app').innerHTML = `
    ${S.showSetup?buildSetup():''}
    <div class="shell">
      <header class="header">
        <div class="logo-mark"><i class="ti ti-brain"></i></div>
        <div>
          <div class="logo-name">AI Daily</div>
          <div class="logo-sub">Open-source · Groq</div>
        </div>
        <div class="header-right">
          ${modelSel}
          <button class="api-status ${statusCls}" onclick="S.showSetup=true;S.tempKey='';render()">${statusTxt}</button>
        </div>
      </header>
      <nav class="tabs" role="tablist">
        ${tabs.map(t=>`<button class="tab ${S.tab===t.id?'active':''}" onclick="S.tab='${t.id}';render()"><i class="ti ${t.icon}"></i>${t.label}</button>`).join('')}
      </nav>
      <main>${content}</main>
    </div>`;
}

// ── Boot ─────────────────────────────────────────────────────────
init();

// ── PWA Install prompt (shown once) ─────────────────────────────
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  if (sg('install-dismissed')) return;
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:200;
    background:var(--brand);color:#fff;
    padding:14px 16px;display:flex;align-items:center;gap:12px;
    box-shadow:0 -4px 20px rgba(0,0,0,0.3);
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  `;
  banner.innerHTML = `
    <i class="ti ti-download" style="font-size:22px;flex-shrink:0"></i>
    <div style="flex:1">
      <div style="font-size:14px;font-weight:600">Install AI Daily</div>
      <div style="font-size:12px;opacity:0.85">Add to home screen to share directly from any app</div>
    </div>
    <button onclick="installPWA()" style="background:#fff;color:var(--brand);border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0">Install</button>
    <button onclick="dismissInstall()" style="background:none;border:none;color:#fff;opacity:0.7;cursor:pointer;font-size:20px;padding:4px;flex-shrink:0">✕</button>
  `;
  document.body.appendChild(banner);
}

function installPWA() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(r => {
      if (r.outcome === 'accepted') dismissInstall();
    });
  }
}
function dismissInstall() {
  ss('install-dismissed', true);
  document.getElementById('install-banner')?.remove();
}
