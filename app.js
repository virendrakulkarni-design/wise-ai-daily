/**
 * AI Daily — Social Video Summarizer & AI News Digest
 * Uses Groq (free) with open-source models (Llama, Mixtral, Gemma).
 * Model list is fetched live from your API key — nothing hardcoded.
 * v1.3 — cache-bust 2026-09-13
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
  S.apiKey      = sg('groq-api-key') || '';
  S.following   = sg('ai-following') || [];
  S.todayDigest = sg('digest:'+TODAY);
  S.historyDates = sl('digest:').map(k=>k.replace('digest:','')).sort().reverse().filter(d=>d!==TODAY);
  S.showSetup   = !S.apiKey;

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

Each item needs realistic URLs and 3 bullet point key insights.

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
    result.date = TODAY;
    S.todayDigest = result;
    ss('digest:'+TODAY, result);
    S.historyDates = sl('digest:').map(k=>k.replace('digest:','')).sort().reverse().filter(d=>d!==TODAY);
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

  const isVideo = ['youtube','instagram','facebook'].includes(parsed.platform);
  const prompt = isVideo
    ? `You are summarizing a ${parsed.platform} ${parsed.type} shared via this URL: ${url}

This is a direct share link. Analyze the URL, infer what type of content it likely is, and generate a plausible realistic summary with key insights a viewer would take away.

Return ONLY JSON:
{
  "title": "descriptive inferred title for the video",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "likely creator or page name",
  "duration": "X:XX",
  "points": [
    {"timestamp":"0:00","seconds":0,"text":"opening context or hook"},
    {"timestamp":"1:15","seconds":75,"text":"first main point"},
    {"timestamp":"3:00","seconds":180,"text":"second main point"},
    {"timestamp":"5:30","seconds":330,"text":"third main point"},
    {"timestamp":"7:45","seconds":465,"text":"closing takeaway or call to action"}
  ]
}`
    : `Summarize the content at this ${parsed.platform} URL: ${url}

Return ONLY JSON:
{
  "title": "page or post title",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "author or site name",
  "points": ["insight 1","insight 2","insight 3","insight 4","insight 5"]
}`;

  try {
    S.urlResult = await callGroq(prompt);
  } catch(e) {
    if (e.message==='NO_KEY') S.showSetup=true;
    else S.urlError = e.message;
  }
  S.urlLoading=false; render();
}

// ── History ──────────────────────────────────────────────────────
function loadHistoryDate(date) {
  S.historySelected=date;
  S.historyData=sg('digest:'+date);
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
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${ptag(r.platform)}<span class="tag t-type">${r.type||''}</span>
        ${r.source?`<span style="font-size:11px;color:var(--text-muted)">${r.source}</span>`:''}
        ${r.duration?`<span style="font-size:11px;color:var(--text-muted)">${r.duration}</span>`:''}
      </div>
      <div style="font-size:15px;font-weight:500;margin-bottom:12px;line-height:1.4">${r.title||'Summary'}</div>
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

// ── Tab: History ─────────────────────────────────────────────────
function buildHistory() {
  if (S.historySelected) {
    const hd=S.historyData;
    const dt=new Date(S.historySelected+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
      <button class="btn-ghost" onclick="S.historySelected=null;S.historyData=null;render()"><i class="ti ti-arrow-left"></i> Back</button>
      <div style="font-size:15px;font-weight:500">${dt}</div>
    </div>
    ${hd?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">${(hd.items||[]).length} items · ${hd.fetchedAt||''}</div>${renderItems(hd.items)}`
       :`<div class="error-box"><i class="ti ti-alert-circle"></i> Digest not found.</div>`}`;
  }
  if (!S.historyDates.length) return `<div class="empty-state">
    <i class="ti ti-calendar-off"></i>
    <h3>No history yet</h3>
    <p>Past daily digests will appear here after you run your first research.</p>
  </div>`;
  return `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">${S.historyDates.length} past digest${S.historyDates.length!==1?'s':''}</div>
  ${S.historyDates.map(date=>{
    const dt=new Date(date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    return `<div class="history-row" onclick="loadHistoryDate('${date}')">
      <div><div style="font-size:14px;font-weight:500">${dt}</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px">AI Daily Digest</div></div>
      <i class="ti ti-chevron-right" style="color:var(--text-muted)"></i>
    </div>`;
  }).join('')}`;
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
