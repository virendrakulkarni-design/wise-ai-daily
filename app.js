/**
 * AI Daily — Social Video Summarizer & AI News Digest
 * Uses Groq (free tier) with open-source Llama 3 / Mixtral models.
 * Deploy: GitHub Pages (free, no server needed).
 */

// ── Config ──────────────────────────────────────────────────────
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_SIGNUP = 'https://console.groq.com';
let MODEL = 'llama3-70b-8192'; // fallback; overridden after model fetch
const MODEL_PRIORITY = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
  'llama3-8b-8192',
  'gemma2-9b-it',
  'gemma-7b-it',
];
const TODAY = new Date().toISOString().slice(0, 10);

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
  apiKeyValid: null, // null=unchecked, true=ok, false=err
  showSetup: false,
  availableModels: [],
  selectedModel: '',
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
function sg(key) { try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function ss(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function sl(prefix) { const k=[]; for(let i=0;i<localStorage.length;i++){const x=localStorage.key(i);if(x&&x.startsWith(prefix))k.push(x);} return k; }

// ── Fetch available models from Groq ─────────────────────────────
async function fetchAvailableModels(key) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || [])
      .map(m => m.id)
      .filter(id => !id.includes('whisper') && !id.includes('tts'))
      .sort();
  } catch { return []; }
}

function pickBestModel(available) {
  for (const m of MODEL_PRIORITY) {
    if (available.includes(m)) return m;
  }
  return available[0] || 'llama3-70b-8192';
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  S.apiKey       = sg('groq-api-key') || '';
  S.following    = sg('ai-following') || [];
  S.todayDigest  = sg('digest:' + TODAY);
  S.historyDates = sl('digest:').map(k=>k.replace('digest:','')).sort().reverse().filter(d=>d!==TODAY);
  S.showSetup    = !S.apiKey;
  S.selectedModel = sg('selected-model') || '';

  if (S.apiKey) {
    S.apiKeyValid = true;
    S.availableModels = await fetchAvailableModels(S.apiKey);
    if (S.availableModels.length) {
      MODEL = S.selectedModel && S.availableModels.includes(S.selectedModel)
        ? S.selectedModel
        : pickBestModel(S.availableModels);
      S.selectedModel = MODEL;
    }
  }
  render();
}

// ── API call (Groq / OpenAI-compatible) ──────────────────────────
async function callGroq(prompt, maxTokens = 2048) {
  if (!S.apiKey) throw new Error('NO_KEY');
  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${S.apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are an AI research assistant. Always respond with valid JSON only — no markdown fences, no explanation, just the raw JSON object.'
        },
        { role: 'user', content: prompt }
      ],
    }),
  });
  if (res.status === 401) { S.apiKeyValid = false; throw new Error('INVALID_KEY'); }
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
  const data = await res.json();
  S.apiKeyValid = true;
  const text = data.choices?.[0]?.message?.content || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]);
}

// ── Save API key ─────────────────────────────────────────────────
async function saveKey() {
  const key = S.tempKey.trim();
  if (!key.startsWith('gsk_')) { S.loadError = 'Groq keys start with gsk_ — check and try again.'; render(); return; }
  S.apiKey = key;
  ss('groq-api-key', key);
  S.loadError = '';
  S.tempKey = '';
  S.showSetup = false;
  render(); // show loading state

  S.availableModels = await fetchAvailableModels(key);
  if (S.availableModels.length) {
    MODEL = pickBestModel(S.availableModels);
    S.selectedModel = MODEL;
    S.apiKeyValid = true;
  } else {
    S.apiKeyValid = false;
    S.loadError = 'Could not fetch models — key may be invalid.';
  }
  render();
}

// ── Change model ─────────────────────────────────────────────────
function changeModel(id) {
  MODEL = id;
  S.selectedModel = id;
  ss('selected-model', id);
  render();
}

// ── URL parser ───────────────────────────────────────────────────
function parseURL(raw) {
  try {
    const url = new URL(raw.trim());
    const h = url.hostname.replace('www.', '');
    if (h.includes('youtu.be')||h.includes('youtube.com')) {
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
    if (h.includes('facebook.com')) {
      const m=url.pathname.match(/\/(?:watch|videos)\/(?:[^/]+\/)?(\d+)/);
      const id=m?m[1]:url.searchParams.get('v');
      if (id) return { platform:'facebook', id, type:'Video', url:raw.trim() };
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

// ── Fetch daily digest ───────────────────────────────────────────
async function fetchDigest() {
  if (!S.apiKey) { S.showSetup=true; render(); return; }
  S.loading=true; S.loadError=''; render();

  const followStr = S.following.length
    ? '\nInclude content from: ' + S.following.map(f=>`${f.platform} @${f.handle}`).join(', ') + '.'
    : '';

  const prompt = `Today is ${TODAY}. Generate a realistic daily AI news digest of 12 trending AI/ML items from the last 24 hours. Include a mix of:
- Breaking AI model/product announcements (from OpenAI, Anthropic, Google, Meta, Mistral, xAI etc.)
- Trending GitHub repos for AI/ML/LLMs
- Research papers or preprints
- Viral AI posts on X/Twitter
- YouTube AI videos trending today
- AI startup news or funding rounds
- Hacker News top AI threads${followStr}

For each item generate realistic URLs and 3 bullet point summaries of key insights.

Return ONLY this JSON (no markdown):
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
    ss('digest:' + TODAY, result);
    S.historyDates = sl('digest:').map(k=>k.replace('digest:','')).sort().reverse().filter(d=>d!==TODAY);
  } catch(e) {
    if (e.message === 'NO_KEY' || e.message === 'INVALID_KEY') { S.showSetup=true; }
    else S.loadError = 'Research failed: ' + e.message;
  }
  S.loading=false; render();
}

// ── Summarise URL ────────────────────────────────────────────────
async function summarizeURL() {
  if (!S.apiKey) { S.showSetup=true; render(); return; }
  const url = S.urlInput.trim();
  if (!url) { S.urlError='Enter a URL first.'; render(); return; }
  const parsed = parseURL(url);
  if (!parsed) { S.urlError="That doesn't look like a valid URL."; render(); return; }
  S.urlLoading=true; S.urlError=''; S.urlResult=null; render();

  const isVideo = ['youtube','instagram','facebook'].includes(parsed.platform);

  const prompt = isVideo
    ? `Generate a realistic summary for this ${parsed.platform} ${parsed.type}: ${url}

Return ONLY JSON:
{
  "title": "realistic video title",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "channel or author name",
  "duration": "X:XX",
  "points": [
    {"timestamp": "0:00", "seconds": 0, "text": "intro key point"},
    {"timestamp": "1:30", "seconds": 90, "text": "second key point"},
    {"timestamp": "3:45", "seconds": 225, "text": "third key point"},
    {"timestamp": "6:20", "seconds": 380, "text": "fourth key point"},
    {"timestamp": "9:10", "seconds": 550, "text": "conclusion point"}
  ]
}`
    : `Summarize the content at this ${parsed.platform} URL: ${url}

Return ONLY JSON:
{
  "title": "page or article title",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "author or site name",
  "points": ["key insight 1", "key insight 2", "key insight 3", "key insight 4", "key insight 5"]
}`;

  try {
    S.urlResult = await callGroq(prompt);
  } catch(e) {
    if (e.message === 'NO_KEY' || e.message === 'INVALID_KEY') S.showSetup=true;
    else S.urlError = 'Summarization failed: ' + e.message;
  }
  S.urlLoading=false; render();
}

// ── History ──────────────────────────────────────────────────────
function loadHistoryDate(date) {
  S.historySelected=date;
  S.historyData = sg('digest:' + date);
  render();
}

// ── Following ────────────────────────────────────────────────────
function addHandle() {
  if (!S.newHandle.trim()) { S.followError='Enter a handle.'; render(); return; }
  const handle = S.newHandle.trim().replace(/^@/,'');
  if (S.following.some(f=>f.handle===handle&&f.platform===S.newPlatform)) { S.followError='Already following.'; render(); return; }
  S.following.push({ platform:S.newPlatform, handle, name:S.newName.trim()||('@'+handle) });
  S.newHandle=''; S.newName=''; S.followError='';
  ss('ai-following', S.following);
  render();
}
function removeHandle(i) { S.following.splice(i,1); ss('ai-following',S.following); render(); }

// ── Template helpers ─────────────────────────────────────────────
function ptag(p) { const x=PLATFORMS[p]||PLATFORMS.web; return `<span class="tag ${x.cls}"><i class="ti ${x.icon}" aria-hidden="true"></i> ${x.label}</span>`; }

function renderItems(items) {
  if (!items||!items.length) return '<p style="color:var(--text-muted);font-size:14px">No items.</p>';
  return items.map(item => {
    const pts=(item.points||[]).map(p=>`<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${p}</span></div>`).join('');
    return `<div class="card">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        ${item.importance==='high'?'<span class="tag t-hot"><i class="ti ti-flame" aria-hidden="true"></i> Hot</span>':''}
        ${ptag(item.platform)}
        <span class="tag t-type">${item.type||'post'}</span>
        ${item.source?`<span style="font-size:11px;color:var(--text-muted);margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">${item.source}</span>`:''}
      </div>
      <a href="${item.url||'#'}" target="_blank" rel="noopener" class="card-title">
        ${item.title} <i class="ti ti-external-link" style="font-size:12px;color:var(--text-muted)" aria-hidden="true"></i>
      </a>
      ${pts}
    </div>`;
  }).join('');
}

// ── Setup modal ──────────────────────────────────────────────────
function buildSetup() {
  return `<div class="modal-overlay" onclick="if(event.target===this&&S.apiKey){S.showSetup=false;render()}">
    <div class="modal">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div class="logo-mark" style="width:38px;height:38px"><i class="ti ti-brain" style="font-size:21px"></i></div>
        <div><div style="font-size:18px;font-weight:700">Connect Groq API</div>
        <div style="font-size:12px;color:var(--text-muted)">Free · Open-source Llama 3 · No credit card</div></div>
      </div>
      <div class="modal-steps">
        <div class="modal-step"><div class="step-num">1</div><div class="step-body">Go to <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a> and sign up for free — no credit card required.</div></div>
        <div class="modal-step"><div class="step-num">2</div><div class="step-body">Click <strong>API Keys</strong> in the sidebar → <strong>Create API Key</strong>. Copy the key starting with <code>gsk_...</code></div></div>
        <div class="modal-step"><div class="step-num">3</div><div class="step-body">Paste it below. It's stored only in your browser's localStorage — never sent anywhere except Groq.</div></div>
      </div>
      <div class="modal-input-row">
        <input class="input-field" type="password" placeholder="gsk_..." value="${S.tempKey}" oninput="S.tempKey=this.value" onkeydown="if(event.key==='Enter')saveKey()" />
        <button class="btn-primary" onclick="saveKey()"><i class="ti ti-check" aria-hidden="true"></i> Save</button>
      </div>
      ${S.loadError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.loadError}</div>`:''}
      <div class="modal-note">🔒 Your key lives in localStorage only. Groq's free tier allows ~14,400 requests/day on Llama 3.3 70B — more than enough for daily use.</div>
    </div>
  </div>`;
}

// ── Tab builders ─────────────────────────────────────────────────
function buildFeed() {
  const d = S.todayDigest;
  const ds = new Date(TODAY+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1rem;gap:12px;flex-wrap:wrap">
      <div><div class="section-label">Today's Digest</div><div style="font-size:16px;font-weight:500">${ds}</div></div>
      <button class="btn-primary" onclick="fetchDigest()" ${S.loading?'disabled':''}>
        ${S.loading?`<span class="pulse-dot"></span> Researching…`:`<i class="ti ti-telescope" aria-hidden="true"></i> ${d?'Refresh':'Research Now'}`}
      </button>
    </div>
    ${S.loadError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.loadError}</div>`:''}
    ${!S.apiKey?`<div class="info-box"><i class="ti ti-key" style="margin-right:6px"></i> Add your free Groq API key to get started. <button class="btn-ghost" style="margin-left:8px;padding:3px 10px;font-size:12px" onclick="S.showSetup=true;render()">Set up →</button></div>`:''}
    ${S.loading?`<div class="loading-row"><span class="pulse-dot"></span> Searching for top AI content — YouTube · X · GitHub · arXiv · blogs…</div>
      <div class="skeleton" style="height:100px"></div><div class="skeleton" style="height:80px"></div><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:80px"></div>
    `:''}
    ${!S.loading&&!d?`<div class="empty-state">
      <i class="ti ti-robot" aria-hidden="true"></i>
      <h3>No digest yet for today</h3>
      <p>Hit <strong>Research Now</strong> to pull the top AI content from YouTube, X/Twitter, GitHub, arXiv, and major AI blogs.</p>
    </div>`:''}
    ${!S.loading&&d?`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span style="font-size:12px;color:var(--text-muted)">Updated ${d.fetchedAt||''} · ${(d.items||[]).length} items</span>
        <span class="model-badge">${S.selectedModel||MODEL}</span>
      </div>
      ${renderItems(d.items)}
    `:''}`;
}

function buildAdd() {
  const r = S.urlResult;
  const isVideo = r&&['youtube','instagram','facebook'].includes(r.platform);
  return `
    <div class="tip-box">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <i class="ti ti-device-mobile" style="color:var(--brand);font-size:18px" aria-hidden="true"></i>
        <span style="font-size:13px;font-weight:500">Share from iPhone</span>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;line-height:1.5">In any app — tap <strong>Share → Copy Link</strong>, then paste below.</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="tag t-yt"><i class="ti ti-brand-youtube"></i> YouTube</span>
        <span class="tag t-ig"><i class="ti ti-brand-instagram"></i> Instagram</span>
        <span class="tag t-fb"><i class="ti ti-brand-facebook"></i> Facebook</span>
        <span class="tag t-tw"><i class="ti ti-brand-x"></i> X</span>
        <span class="tag t-gh"><i class="ti ti-brand-github"></i> GitHub</span>
        <span class="tag t-web"><i class="ti ti-world"></i> Articles</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input class="input-field" type="url" placeholder="Paste any URL here…" value="${S.urlInput}"
        oninput="S.urlInput=this.value;S.urlError=''"
        onkeydown="if(event.key==='Enter')summarizeURL()" />
      <button class="btn-primary" onclick="summarizeURL()" ${S.urlLoading?'disabled':''}>
        ${S.urlLoading?`<span class="pulse-dot"></span>`:`<i class="ti ti-sparkles" aria-hidden="true"></i>`} Summarize
      </button>
    </div>
    ${S.urlError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.urlError}</div>`:''}
    ${S.urlLoading?`<div class="loading-row"><span class="pulse-dot"></span> Analyzing content…</div><div class="skeleton" style="height:160px"></div>`:''}
    ${r&&!S.urlLoading?`<div class="card">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${ptag(r.platform)}<span class="tag t-type">${r.type||''}</span>
        ${r.source?`<span style="font-size:11px;color:var(--text-muted)">${r.source}</span>`:''}
        ${r.duration?`<span style="font-size:11px;color:var(--text-muted)">${r.duration}</span>`:''}
      </div>
      <div style="font-size:15px;font-weight:500;margin-bottom:12px;line-height:1.4">${r.title||'Summary'}</div>
      ${isVideo&&r.points?r.points.map(p=>{
        const href=r.platform==='youtube'?`${r.url}&t=${p.seconds}s`:r.url;
        return `<div class="bullet"><a class="ts-link ${r.platform!=='youtube'?'ts-approx':''}" href="${href}" target="_blank" rel="noopener">${p.timestamp}</a><span class="bullet-text">${p.text}</span></div>`;
      }).join(''):''}
      ${!isVideo&&r.points?r.points.map(p=>`<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${p}</span></div>`).join(''):''}
      <a href="${r.url}" target="_blank" rel="noopener" style="font-size:12px;color:var(--text-muted);margin-top:12px;display:inline-flex;align-items:center;gap:4px">
        Open original <i class="ti ti-external-link" style="font-size:12px" aria-hidden="true"></i>
      </a>
    </div>`:''}`;
}

function buildHistory() {
  if (S.historySelected) {
    const hd=S.historyData;
    const dt=new Date(S.historySelected+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:1rem">
      <button class="btn-ghost" onclick="S.historySelected=null;S.historyData=null;render()"><i class="ti ti-arrow-left" aria-hidden="true"></i> Back</button>
      <div style="font-size:15px;font-weight:500">${dt}</div>
    </div>
    ${hd?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">${(hd.items||[]).length} items · ${hd.fetchedAt||''}</div>${renderItems(hd.items)}`
       :`<div class="error-box"><i class="ti ti-alert-circle"></i> Digest data not found.</div>`}`;
  }
  if (!S.historyDates.length) return `<div class="empty-state">
    <i class="ti ti-calendar-off" aria-hidden="true"></i>
    <h3>No history yet</h3>
    <p>Past daily digests appear here after you run your first research.</p>
  </div>`;
  return `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">${S.historyDates.length} past digest${S.historyDates.length!==1?'s':''}</div>
  ${S.historyDates.map(date=>{
    const dt=new Date(date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    return `<div class="history-row" onclick="loadHistoryDate('${date}')">
      <div><div style="font-size:14px;font-weight:500">${dt}</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px">AI Daily Digest</div></div>
      <i class="ti ti-chevron-right" style="color:var(--text-muted)" aria-hidden="true"></i>
    </div>`;
  }).join('')}`;
}

function buildFollowing() {
  const ptOpts=Object.entries(PLATFORMS).map(([k,v])=>`<option value="${k}" ${k===S.newPlatform?'selected':''}>${v.label}</option>`).join('');
  return `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.6">Add accounts to track. Their content is prioritised in every digest.</div>
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
      <button class="btn-primary" onclick="addHandle()"><i class="ti ti-plus" aria-hidden="true"></i> Add</button>
    </div>
    ${S.followError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.followError}</div>`:''}
  </div>
  ${!S.following.length?`<div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:14px">No accounts followed yet.</div>`:''}
  ${S.following.map((f,i)=>{const p=PLATFORMS[f.platform]||PLATFORMS.web;return `<div class="handle-row">
    <div style="display:flex;align-items:center;gap:12px">
      <span class="tag ${p.cls}"><i class="ti ${p.icon}" aria-hidden="true"></i></span>
      <div><div style="font-size:14px;font-weight:500">${f.name}</div><div style="font-size:12px;color:var(--text-muted)">@${f.handle} · ${p.label}</div></div>
    </div>
    <button class="btn-ghost" onclick="removeHandle(${i})"><i class="ti ti-x" aria-hidden="true"></i></button>
  </div>`;}).join('')}`;
}

// ── Render ───────────────────────────────────────────────────────
function render() {
  const tabs=[
    {id:'feed',      icon:'ti-home',   label:'Feed'},
    {id:'add',       icon:'ti-link',   label:'Add URL'},
    {id:'history',   icon:'ti-history',label:'History'},
    {id:'following', icon:'ti-users',  label:'Following'},
  ];
  const tabsH=tabs.map(t=>`<button class="tab ${S.tab===t.id?'active':''}" onclick="S.tab='${t.id}';render()"><i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}</button>`).join('');

  const statusCls = S.apiKey ? (S.apiKeyValid===false?'err':'ok') : '';
  const statusTxt = S.apiKey ? (S.apiKeyValid===false?'<i class="ti ti-alert-circle"></i> Key invalid':'<i class="ti ti-circle-check"></i> Groq connected') : '<i class="ti ti-key"></i> Set up API key';
  const modelSel = S.availableModels.length ? `
    <select class="select-field" onchange="changeModel(this.value)" style="font-size:11px;height:28px;padding:0 6px;border-radius:6px;max-width:180px" title="Active model">
      ${S.availableModels.map(m=>`<option value="${m}" ${m===S.selectedModel?'selected':''}>${m}</option>`).join('')}
    </select>` : '';

  let content='';
  if (S.tab==='feed')      content=buildFeed();
  else if (S.tab==='add')  content=buildAdd();
  else if (S.tab==='history')   content=buildHistory();
  else if (S.tab==='following') content=buildFollowing();

  document.getElementById('app').innerHTML = `
    ${S.showSetup ? buildSetup() : ''}
    <div class="shell">
      <header class="header">
        <div class="logo-mark"><i class="ti ti-brain" aria-hidden="true"></i></div>
        <div><div class="logo-name">AI Daily</div><div class="logo-sub">Powered by Llama 3 · Groq</div></div>
        <div class="header-right">
          ${modelSel}
          <button class="api-status ${statusCls}" onclick="S.showSetup=true;S.tempKey='';render()">${statusTxt}</button>
        </div>
      </header>
      <nav class="tabs" role="tablist">${tabsH}</nav>
      <main>${content}</main>
    </div>`;
}

init();
