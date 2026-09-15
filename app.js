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
  showSnapshots: false,
  activeSnapshots: {},
  activePlayerMoments: {},
  lightbox: null,
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

function resolveItemLink(item) {
  if (!item) return '#';
  let url = (item.url || '').trim();
  const title = (item.title || '').trim();
  const platform = (item.platform || '').toLowerCase();

  // 1. If it's already a working search URL or verified live API URL
  if (url.includes('google.com/search') || url.includes('news.google.com/search') ||
      url.includes('huggingface.co/papers/') || url.includes('news.ycombinator.com/item')) {
    return url;
  }

  // 2. Detect hallucinated deep paths (corporate blogs, invented slugs)
  const hallucinationPatterns = [
    /anthropic\.com\/news\/.+/i,
    /openai\.com\/(index|blog)\/.+/i,
    /blog\.google\/.+/i,
    /techcrunch\.com\/.+/i,
    /theverge\.com\/.+/i,
    /wired\.com\/.+/i,
    /venturebeat\.com\/.+/i,
    /x\.com\/.+\/status\/\d+/i,
    /twitter\.com\/.+\/status\/\d+/i,
    /arxiv\.org\/abs\/\d+/i
  ];

  const isLikelyHallucinated = !url || url === '#' || hallucinationPatterns.some(rx => rx.test(url));

  if (isLikelyHallucinated) {
    const q = encodeURIComponent(title || item.source || 'AI news');
    if (platform === 'github') return `https://github.com/search?q=${q}&type=repositories`;
    if (platform === 'paper') return `https://arxiv.org/search/?query=${q}&searchtype=all`;
    if (platform === 'youtube') return `https://www.youtube.com/results?search_query=${q}`;
    if (platform === 'twitter' || platform === 'x') return `https://x.com/search?q=${q}`;
    return `https://news.google.com/search?q=${q}`;
  }

  return url;
}

function getOfficialHub(url = '', source = '', title = '') {
  const combined = `${url} ${source} ${title}`.toLowerCase();
  if (combined.includes('anthropic') || combined.includes('claude')) return { label: 'Anthropic News', url: 'https://www.anthropic.com/news' };
  if (combined.includes('openai') || combined.includes('chatgpt') || combined.includes('gpt')) return { label: 'OpenAI News', url: 'https://openai.com/news' };
  if (combined.includes('google') || combined.includes('gemini') || combined.includes('deepmind')) return { label: 'Google AI Blog', url: 'https://blog.google/technology/ai/' };
  if (combined.includes('meta') || combined.includes('llama')) return { label: 'Meta AI Blog', url: 'https://ai.meta.com/blog/' };
  if (combined.includes('mistral')) return { label: 'Mistral News', url: 'https://mistral.ai/news/' };
  if (combined.includes('huggingface') || combined.includes('hugging face')) return { label: 'Hugging Face Blog', url: 'https://huggingface.co/blog' };
  if (combined.includes('github')) return { label: 'GitHub Trending', url: 'https://github.com/trending' };
  if (combined.includes('arxiv')) return { label: 'arXiv AI Recent', url: 'https://arxiv.org/list/cs.AI/recent' };
  if (combined.includes('ycombinator') || combined.includes('hacker news')) return { label: 'Hacker News', url: 'https://news.ycombinator.com/' };
  return null;
}

function normalizeDigest(data) {
  if (!data) return null;
  const rawItems = Array.isArray(data) 
    ? data 
    : (data.items || data.articles || data.news || data.stories || data.digest || data.trending || data.posts || []);
  
  const items = (Array.isArray(rawItems) ? rawItems : []).map(item => {
    const safeUrl = resolveItemLink(item);
    return {
      ...item,
      url: safeUrl,
      originalUrl: item.originalUrl || item.url || safeUrl
    };
  });

  return {
    ...(typeof data === 'object' && !Array.isArray(data) ? data : {}),
    fetchedAt: data.fetchedAt || '',
    items
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
// ── Init ─────────────────────────────────────────────────────────
async function init() {
  S.apiKey       = sg('groq-api-key') || '';
  S.following    = sg('ai-following') || [];
  S.todayDigest  = normalizeDigest(sg('digest:'+TODAY));
  S.urlSummaries = sg('ai-summaries') || [];

  const seedVipassana = {
    id: 'sum-seed-vipassana',
    canonicalKey: 'youtube:vwLVjHEGGK0',
    title: 'Guided Vipassana Meditation — 1 Hour S.N. Goenka Session',
    platform: 'youtube',
    type: 'Video',
    url: 'https://www.youtube.com/watch?v=vwLVjHEGGK0',
    source: 'S.N. Goenka / Vipassana Research Institute',
    duration: '1:02:48',
    date: TODAY,
    createdAt: new Date().toISOString(),
    overview: 'This video features a guided **Vipassana meditation** session led by *S.N. Goenka*, specifically designed for experienced students who have already completed a 10-day course. The session emphasizes cultivating **Equanimity** (*Samata*) and wisdom (*Panna*) through observing bodily sensations without reacting.',
    takeaways: [
      'Observe every bodily sensation objectively without craving (Raga) or aversion (Dosa).',
      'Realize experientially the Law of Impermanence (Anicca)—every sensation arises only to pass away.',
      'Maintain continuous awareness and unwavering mental balance (Samata) during long sittings (Adhitthana).',
      'Conclude practice by radiating peaceful loving-kindness and sharing merits through Mangal Maitri.'
    ],
    phases: [
      {
        title: 'Anapana (Breath Awareness)',
        timeRange: '2:36 - 10:35',
        timestamp: '2:36',
        seconds: 156,
        snapshotUrl: 'snapshots/vwLVjHEGGK0/snap_156.jpg',
        summary: 'The session begins by observing the natural flow of the breath at the entrance of the nostrils to calm and focus the mind.',
        subPoints: [
          'Observe natural respiration: incoming breath, outgoing breath—as it is, without artificial regulation or deep breathing.',
          'Fix attention exclusively on the small triangular area from the nostrils down to the upper lip.',
          'Cultivate sharp, one-pointed concentration (Samadhi) to prepare the mind for subtle bodily investigation.'
        ]
      },
      {
        title: 'Vipassana Technique (Head-to-Toe Body Scan)',
        timeRange: '11:29 - 50:11',
        timestamp: '11:29',
        seconds: 689,
        snapshotUrl: 'snapshots/vwLVjHEGGK0/snap_689.jpg',
        summary: 'The core practice involves scanning the body from the top of the head to the tips of the toes and back again. The goal is to observe sensations objectively, understanding the Law of Impermanence (Anicca).',
        subPoints: [
          'Equanimity (Samata): Avoid reacting with craving when experiencing pleasant sensations or aversion when feeling unpleasant sensations.',
          'Sankhara Eradication: Sittings of strong determination (Adhitthana). By remaining balanced in the face of physical discomfort, unconscious habit patterns of misery are dissolved at their root.',
          'Objective Observation: Sensations may be heavy, heat, itching, tingling, or subtle vibrations—observe them like a scientist with detached awareness.'
        ]
      },
      {
        title: 'Mangal Maitri (Metta Meditation)',
        timeRange: '54:06 - 1:02:48',
        timestamp: '54:06',
        seconds: 3246,
        snapshotUrl: 'snapshots/vwLVjHEGGK0/snap_3011.jpg',
        summary: 'The session concludes with the practice of loving-kindness (Metta) and goodwill towards all living beings.',
        subPoints: [
          'Radiate the peaceful, harmonious vibrations generated during the sitting to all surrounding beings.',
          'Chant and affirm universal well-being: Bhavatu Sabba Mangalam (May all beings be peaceful, happy, and liberated).',
          'Close the meditation with forgiveness, shared joy, and deep mental purification.'
        ]
      }
    ],
    points: [
      { timestamp: "2:36", seconds: 156, text: "Anapana (2:36 - 10:35): Natural breath awareness at the entrance of the nostrils to calm the mind and establish Samadhi." },
      { timestamp: "11:29", seconds: 689, text: "Vipassana Technique (11:29 - 50:11): Systematic head-to-toe body scan cultivating Equanimity (Samata) and realizing Impermanence (Anicca)." },
      { timestamp: "54:06", seconds: 3246, text: "Mangal Maitri (54:06 - 1:02:48): Concluding Metta meditation radiating loving-kindness and universal peace (Bhavatu Sabba Mangalam)." }
    ]
  };

  const seedAiVideo = {
    id: 'sum-seed-aivideo',
    canonicalKey: 'youtube:Qsi9MeLh95Q',
    title: 'RIP Paid Tools: Make LONG AI Videos With Consistency!',
    platform: 'youtube',
    type: 'Video',
    url: 'https://www.youtube.com/watch?v=Qsi9MeLh95Q',
    source: 'Mr Void',
    duration: '11:51',
    date: TODAY,
    createdAt: new Date().toISOString(),
    overview: 'This video provides a **fully automated, zero-cost blueprint** for creating high-quality, long-form AI videos with consistent character designs. The creator emphasizes moving away from paid tools by utilizing a specific workflow of free platforms.',
    takeaways: [
      'Lock facial geometry upfront with anchor character portraits to eliminate character face drift across scenes.',
      'Automate prompt expansion, batch image rendering, and frame animation using free Chrome extensions.',
      'Eliminate monthly software costs by chaining Google Gemini, Google Flow, Meta AI, and Google Vids.'
    ],
    phases: [
      {
        title: 'The Problem & The Blueprint',
        timeRange: '0:00 - 1:05',
        timestamp: '0:00',
        seconds: 0,
        snapshotUrl: 'snapshots/Qsi9MeLh95Q/snap_65.jpg',
        summary: 'Why AI video channels fail due to face mutations, broken storylines, and paywalls, and how this zero-cost automation pipeline fixes it.',
        subPoints: [
          'Paywalls like Grok and Midjourney make long-form video production unsustainable on a budget.',
          'Character facial inconsistency across scenes is the number one reason audience retention drops.'
        ]
      },
      {
        title: 'Story & Prompt Generation',
        timeRange: '1:05 - 2:08',
        timestamp: '1:05',
        seconds: 65,
        snapshotUrl: 'snapshots/Qsi9MeLh95Q/snap_65.jpg',
        summary: 'Uses Google Gemini to generate the complete narrative story structure and detailed visual prompts based on master templates.',
        subPoints: [
          'Master prompt breaks down the plot into chronological scene-by-scene script beats.',
          'Generates 18+ detailed visual prompts maintaining consistent environment descriptions.'
        ]
      },
      {
        title: 'Character Consistency',
        timeRange: '2:50 - 3:55',
        timestamp: '2:50',
        seconds: 170,
        snapshotUrl: 'snapshots/Qsi9MeLh95Q/snap_170.jpg',
        summary: 'Generates anchor character images using Google Flow to ensure faces remain consistent throughout the project.',
        subPoints: [
          'Generates 16:9 high-resolution anchor character portraits with fixed facial geometry.',
          'Locks facial features, lighting, and wardrobe to prevent visual drift in downstream rendering.'
        ]
      },
      {
        title: 'Mass Image Generation',
        timeRange: '4:00 - 5:50',
        timestamp: '4:00',
        seconds: 240,
        snapshotUrl: 'snapshots/Qsi9MeLh95Q/snap_240.jpg',
        summary: 'Utilizes the Autoflow Chrome extension to automate the batch creation of consistent images.',
        subPoints: [
          'Feeds anchor portraits and scene prompts directly into Autoflow for non-stop batch generation.',
          'Automatically downloads rendered scene frames into designated project directories.'
        ]
      },
      {
        title: 'Animation Automation',
        timeRange: '6:00 - 8:46',
        timestamp: '6:00',
        seconds: 360,
        snapshotUrl: 'snapshots/Qsi9MeLh95Q/snap_360.jpg',
        summary: 'Employs Meta AI combined with the Meta Automation extension to animate static images into video clips.',
        subPoints: [
          'Injects customized camera motion prompts (pan, tilt, zoom, dolly) for cinematic feel.',
          'Runs unattended batch frame-to-video rendering with zero watermarks.'
        ]
      },
      {
        title: 'Voiceover & Soundtrack',
        timeRange: '9:10 - 10:48',
        timestamp: '9:10',
        seconds: 550,
        snapshotUrl: 'snapshots/Qsi9MeLh95Q/snap_526.jpg',
        summary: 'Integrates Google AI Studio (Gemini 2.5 Pro single speaker audio) and Gemini audio prompts for royalty-free background audio.',
        subPoints: [
          'Studio-grade expressive narration generated with natural cadence and tone.',
          'AI-composed atmospheric soundscapes synchronized to video emotional arc.'
        ]
      },
      {
        title: 'Bonus High-Motion Safety Net',
        timeRange: '10:50 - 11:51',
        timestamp: '10:50',
        seconds: 650,
        snapshotUrl: 'snapshots/Qsi9MeLh95Q/snap_526.jpg',
        summary: 'Leverages Google Vids (Veo 3.1) for high-complexity action sequences with zero cost.',
        subPoints: [
          '10-12 free daily generations for complex physics action shots where simple motion models struggle.',
          'Seamless final export and assembly in any standard timeline editor.'
        ]
      }
    ],
    points: [
      { timestamp: "0:00", seconds: 0, text: "The Problem (0:00 - 1:05): Overcoming face mutations and paid tool paywalls." },
      { timestamp: "1:05", seconds: 65, text: "Story & Prompt Generation (1:05 - 2:08): Google Gemini structured story and prompt breakdown." },
      { timestamp: "2:50", seconds: 170, text: "Character Consistency (2:50 - 3:55): Google Flow anchor character generation." },
      { timestamp: "4:00", seconds: 240, text: "Mass Image Generation (4:00 - 5:50): Autoflow Chrome extension automated batch rendering." },
      { timestamp: "6:00", seconds: 360, text: "Animation (6:00 - 8:46): Meta AI + Meta Automation extension for camera motion." },
      { timestamp: "9:10", seconds: 550, text: "Voiceover & Soundtrack (9:10 - 10:48): Google AI Studio voice generation." },
      { timestamp: "10:50", seconds: 650, text: "Bonus High-Motion Safety Net (10:50 - 11:51): Google Vids Veo 3.1 for complex physics." }
    ]
  };

  const seedAstra = {
    id: 'sum-seed-astra',
    canonicalKey: 'youtube:PEEBZwGetyc',
    title: 'How I Save 92% of My AI Credits With GPT-6 Astra + Blender (Full Workflow)',
    platform: 'youtube',
    type: 'Video',
    url: 'https://youtu.be/PEEBZwGetyc',
    source: 'Sanji Nai-Chien',
    duration: '16:15',
    date: TODAY,
    createdAt: new Date().toISOString(),
    overview: 'This AI filmmaking tutorial demonstrates how to run GPT-6 Astra inside Codex with Computer Use and the Higgsfield AI Blender plugin to create cinematic 3D product commercials. By using a lightweight Blender 3D previz rather than raw text prompting, creators achieve precise camera angles and lighting while slashing AI video generation credits by 92%.',
    takeaways: [
      'A Blender 3D previz provides generative AI models exact spatial geometry, cutting credit burn by 92% compared to pure prompt-and-pray iterations.',
      'GPT-6 Astra with Codex and Computer Use automatically translates chat instructions into editable Blender 3D scenes.',
      'Phone gyro motion can be recorded and transferred directly into Blender virtual cameras for realistic, organic cinematography.',
      'A single 3D previz layout can be re-rendered across multiple products, enabling scalable commercial production.'
    ],
    phases: [
      {
        title: 'Why GPT-6 Astra Is the New AI King for 3D',
        timeRange: '0:00 - 1:40',
        timestamp: '0:00',
        seconds: 0,
        snapshotUrl: 'snapshots/PEEBZwGetyc/snap_0.jpg',
        summary: 'Overview of why traditional text-to-video AI burns enormous credit budgets due to random camera drift and lighting inconsistencies.',
        subPoints: [
          'Raw prompting forces creators to re-roll generations 10-20 times for a single usable angle.',
          'GPT-6 Astra incorporates 3D spatial awareness to bridge standard 3D software with generative diffusion.'
        ]
      },
      {
        title: 'Setup: Higgsfield Blender Plugin + Codex',
        timeRange: '1:40 - 2:50',
        timestamp: '1:40',
        seconds: 100,
        snapshotUrl: 'snapshots/PEEBZwGetyc/snap_100.jpg',
        summary: 'Installing and connecting the Higgsfield AI Blender plugin with OpenAI Codex Computer Use.',
        subPoints: [
          'Codex interprets natural language instructions and executes Python API commands in Blender.',
          'Scene Builder automatically populates 3D primitives and cameras matching prompt specs.'
        ]
      },
      {
        title: 'Building the Earbuds Commercial From Scratch',
        timeRange: '2:50 - 5:45',
        timestamp: '2:50',
        seconds: 170,
        snapshotUrl: 'snapshots/PEEBZwGetyc/snap_170.jpg',
        summary: 'Step-by-step assembly of a photorealistic earbuds product commercial using procedural lighting and camera rigging.',
        subPoints: [
          'Setting up three-point studio lighting and turntable camera movement.',
          'Importing basic geometry and locking focus distances on the product mesh.'
        ]
      },
      {
        title: 'Blender Previz vs. Prompt-Only Generation',
        timeRange: '5:45 - 7:40',
        timestamp: '5:45',
        seconds: 345,
        snapshotUrl: 'snapshots/PEEBZwGetyc/snap_345.jpg',
        summary: 'Direct cost and quality comparison showing how previz guidance saves 92% of generation credits.',
        subPoints: [
          'Prompt-only generations required 120 credits across failed takes to get one coherent shot.',
          'Previz-guided Astra generations nailed framing on attempt 1, costing under 10 credits.'
        ]
      },
      {
        title: 'One Previz, Three Products & Phone Gyro Camera',
        timeRange: '7:40 - 11:00',
        timestamp: '7:40',
        seconds: 460,
        snapshotUrl: 'snapshots/PEEBZwGetyc/snap_460.jpg',
        summary: 'Reusing a single previz setup across cosmetics, tech devices, and beverages while capturing handheld phone motion.',
        subPoints: [
          'Swap 3D asset in center while keeping identical lighting, camera move, and render pipeline.',
          'Map smartphone motion sensors straight into Blender camera transform matrices for natural handheld shake.'
        ]
      },
      {
        title: '30-Second Continuous Shot & Astra vs. Fable 5.1',
        timeRange: '11:00 - 16:15',
        timestamp: '11:00',
        seconds: 660,
        snapshotUrl: 'snapshots/PEEBZwGetyc/snap_660.jpg',
        summary: 'Creating a seamless 30-second unbroken cinematic shot and comparing benchmark results against Fable 5.1.',
        subPoints: [
          'Continuous camera flight path through multiple commercial environments without cutting.',
          'Astra outperforms Fable 5.1 in edge fidelity, product reflection realism, and temporal consistency.'
        ]
      }
    ],
    points: [
      { timestamp: "0:00", seconds: 0, text: "Why GPT-6 Astra Is the AI King for 3D (0:00 - 1:40): Solving the credit burn crisis." },
      { timestamp: "1:40", seconds: 100, text: "Setup: Higgsfield Blender Plugin + Codex (1:40 - 2:50): Connecting AI chat to 3D." },
      { timestamp: "2:50", seconds: 170, text: "Building the Earbuds Commercial (2:50 - 5:45): Studio lighting and turntable camera." },
      { timestamp: "5:45", seconds: 345, text: "Blender Previz vs. Prompt Only (5:45 - 7:40): 92% credit savings proof." },
      { timestamp: "7:40", seconds: 460, text: "Reusing Previz & Phone Gyro (7:40 - 11:00): Transferring real phone motion to virtual camera." },
      { timestamp: "11:00", seconds: 660, text: "30-Second Continuous Shot & Benchmark (11:00 - 16:15): Astra vs. Fable 5.1 head-to-head." }
    ]
  };

  const seedNeemKaroliBaba = {
    id: 'sum-seed-neemkaroli',
    canonicalKey: 'youtube:ewgAKF9j__o',
    title: 'Neem Karoli Baba’s Incredible Capabilities | Sadhguru',
    platform: 'youtube',
    type: 'Video',
    url: 'https://youtu.be/ewgAKF9j__o',
    source: 'Sadhguru',
    duration: '4:06',
    date: TODAY,
    createdAt: new Date().toISOString(),
    overview: 'In this discourse, Sadhguru recounts the historic encounter between Harvard psychologist Dr. Richard Alpert (Ram Dass) and the Indian mystic Neem Karoli Baba (Maharaj-ji). Looking for a spiritual shortcut through psychedelics, Ram Dass offered Baba a massive dose of LSD, only to witness Baba consume it with absolute equanimity and zero physical or psychological effect—demonstrating that true spiritual mastery stems from inner stability and capability rather than external chemical stimulation.',
    takeaways: [
      'External chemical substances can only distort sensory perception temporarily; genuine spiritual awakening requires stable inner mastery.',
      'Neem Karoli Baba demonstrated that an established yogic state remains completely untouched by heavy doses of psychedelics.',
      'True spiritual capability is measured by lived inner stability and ease, not intellectual theories or chemical experimentation.',
      'Direct presence with an authentic, capable master shifts a seeker’s trajectory far more permanently than any shortcut.'
    ],
    phases: [
      {
        title: 'Ram Dass & The Quest for Chemical Shortcuts',
        timeRange: '0:00 - 1:15',
        timestamp: '0:00',
        seconds: 0,
        snapshotUrl: 'snapshots/ewgAKF9j__o/snap_0.jpg',
        summary: 'Sadhguru introduces Dr. Richard Alpert (Ram Dass), a Harvard professor who traveled to India with pure LSD believing chemical shortcuts could replace disciplined spiritual practice.',
        subPoints: [
          'Ram Dass arrived in the Himalayas seeking a master who could validate or explain his psychedelic experiences.',
          'He carried medical-grade LSD intending to test spiritual adepts and discover if enlightenment could be chemically triggered.'
        ]
      },
      {
        title: 'Meeting Neem Karoli Baba & The LSD Challenge',
        timeRange: '1:15 - 2:30',
        timestamp: '1:15',
        seconds: 75,
        snapshotUrl: 'snapshots/ewgAKF9j__o/snap_75.jpg',
        summary: 'Ram Dass meets Neem Karoli Baba and offers him a massive dose of LSD to see how an authentic yogic master reacts.',
        subPoints: [
          'Baba asks for the entire supply and casually consumes enough LSD to incapacitate several adult men.',
          'Ram Dass watches intensely for hours expecting pupil dilation, disorientation, or ecstasy.'
        ]
      },
      {
        title: 'Unshakable Equanimity & Inner Mastery',
        timeRange: '2:30 - 3:30',
        timestamp: '2:30',
        seconds: 150,
        snapshotUrl: 'snapshots/ewgAKF9j__o/snap_150.jpg',
        summary: 'Baba exhibits zero psychological or physical alteration, effortlessly carrying on normal conversations without the slightest tremor in his awareness.',
        subPoints: [
          'Baba points out that while chemicals may offer temporary glimpses, they remain dependent on external conditions and fade quickly.',
          'The master’s mind already rests in a baseline state far beyond what any chemical compound can induce.'
        ]
      },
      {
        title: 'Capability Over Knowledge & Spiritual Awakening',
        timeRange: '3:30 - 4:06',
        timestamp: '3:30',
        seconds: 210,
        snapshotUrl: 'snapshots/ewgAKF9j__o/snap_210.jpg',
        summary: 'Witnessing genuine mastery transforms Ram Dass, prompting him to discard chemical reliance in favor of authentic inner sadhana and guru devotion.',
        subPoints: [
          'Sadhguru concludes that true tantra and spirituality are defined by lived inner capability rather than intellectual theories.',
          'Direct presence with an awakened master shifts consciousness far more permanently than any shortcut.'
        ]
      }
    ],
    points: [
      { timestamp: "0:00", seconds: 0, text: "Ram Dass & Chemical Shortcuts (0:00 - 1:15): Journeying to India with LSD in search of a guru." },
      { timestamp: "1:15", seconds: 75, text: "The LSD Challenge (1:15 - 2:30): Handing Baba a massive dose to test his state." },
      { timestamp: "2:30", seconds: 150, text: "Unshakable Equanimity (2:30 - 3:30): Baba consumes the drug with zero physical or mental effect." },
      { timestamp: "3:30", seconds: 210, text: "Capability Over Knowledge (3:30 - 4:06): Transforming Ram Dass from shortcut-seeker to sincere disciple." }
    ]
  };

  // Register in persistent url-cache store
  ss('url-cache:youtube:vwLVjHEGGK0', seedVipassana);
  ss('url-cache:youtube:Qsi9MeLh95Q', seedAiVideo);
  ss('url-cache:youtube:PEEBZwGetyc', seedAstra);
  ss('url-cache:youtube:ewgAKF9j__o', seedNeemKaroliBaba);

  // Upgrade or seed S.urlSummaries with latest rich seeds
  const otherSummaries = (S.urlSummaries || []).filter(s => 
    !(s.url || '').includes('vwLVjHEGGK0') && !(s.url || '').includes('Qsi9MeLh95Q') && !(s.url || '').includes('PEEBZwGetyc') && !(s.url || '').includes('ewgAKF9j__o')
  );
  S.urlSummaries = [seedNeemKaroliBaba, seedAstra, seedVipassana, seedAiVideo, ...otherSummaries];
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

// ── Core API call & Resilient JSON Parser ─────────────────────────
function cleanAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Model returned an empty response. Try again.');
  }

  // Extract outer-most JSON object or array
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  let jsonStr = (firstBrace !== -1 && lastBrace > firstBrace)
    ? rawText.slice(firstBrace, lastBrace + 1)
    : rawText.trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(jsonStr);
  } catch (e1) {}

  // 2. Comprehensive sanitation for LLM syntax defects (e.g. [...], trailing commas)
  let cleaned = jsonStr
    // Remove markdown code fences if any
    .replace(/```(?:json)?/gi, '')
    // Replace empty/standalone ellipsis arrays: [...] or [ ... ] -> []
    .replace(/\[\s*\.\.\.\s*\]/g, '[]')
    // Replace trailing ellipsis in arrays: , ... ] -> ]
    .replace(/,\s*\.\.\.\s*\]/g, ']')
    // Replace leading/standalone ellipsis in arrays: [ ... , -> [
    .replace(/\[\s*\.\.\.\s*,/g, '[')
    // Replace ellipsis in middle of arrays: , ... , -> ,
    .replace(/,\s*\.\.\.\s*,/g, ',')
    // Replace trailing ellipsis in objects: , ... } -> }
    .replace(/,\s*\.\.\.\s*\}/g, '}')
    // Replace property values that are just ... -> null
    .replace(/:\s*\.\.\.\s*([,\n\}])/g, ': null$1')
    // Replace trailing commas before closing brackets or braces
    .replace(/,\s*([\]\}])/g, '$1')
    // Remove unescaped control chars (except \r, \n, \t)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

  try {
    return JSON.parse(cleaned);
  } catch (e2) {
    const fixedTrailing = cleaned.replace(/,\s*([\]\}])/g, '$1');
    try {
      return JSON.parse(fixedTrailing);
    } catch (e3) {
      throw new Error(`Model returned invalid JSON (${e2.message}). Please click Re-analyze.`);
    }
  }
}

async function callGroq(prompt, maxTokens = 2048) {
  if (!S.apiKey) throw new Error('NO_KEY');
  if (!S.activeModel) throw new Error('No model selected — refresh the page or re-enter your API key.');

  const requestBody = {
    model: S.activeModel,
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: 'system', content: 'You are an AI research assistant. You must always return a strictly valid standard JSON object. Never use ellipses (...), never omit array items, and never use markdown code fences.' },
      { role: 'user', content: prompt }
    ],
  };

  let res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
    body: JSON.stringify(requestBody),
  });

  // If the model rejects response_format (e.g. older Gemma), retry without it
  if (!res.ok && res.status === 400) {
    const errBody = await res.json().catch(() => ({}));
    if (errBody.error?.message?.includes('response_format')) {
      delete requestBody.response_format;
      res = await fetch(GROQ_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
        body: JSON.stringify(requestBody),
      });
    } else {
      throw new Error(errBody.error?.message || `HTTP ${res.status}`);
    }
  }

  if (res.status === 401) { S.apiKeyValid = false; throw new Error('API key invalid or expired.'); }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  S.apiKeyValid = true;
  const text = data.choices?.[0]?.message?.content || '';
  return cleanAndParseJSON(text);
}

// ── URL parser & Canonicalizer ──────────────────────────────────────
function parseURL(raw) {
  try {
    const url = new URL(raw.trim());
    const h = url.hostname.replace('www.', '').replace(/^m\./, '');
    if (h.includes('youtu.be') || h.includes('youtube.com')) {
      let id=null, type='Video';
      if (h==='youtu.be') id=url.pathname.slice(1).split('?')[0];
      else if (url.pathname.includes('/shorts/')) { id=url.pathname.split('/shorts/')[1].split('?')[0]; type='Short'; }
      else id=url.searchParams.get('v');
      if (id) {
        const parsed = { platform:'youtube', id, type, url:raw.trim() };
        parsed.canonicalKey = `youtube:${id}`;
        return parsed;
      }
    }
    if (h.includes('instagram.com')) {
      const m=url.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (m) {
        const parsed = { platform:'instagram', id:m[2], type:m[1]==='reel'?'Reel':'Post', url:raw.trim() };
        parsed.canonicalKey = `instagram:${m[2]}`;
        return parsed;
      }
    }
    if (h.includes('facebook.com') || h.includes('fb.watch')) {
      const shareMatch = url.pathname.match(/\/share\/(?:v|r)\/([A-Za-z0-9_-]+)/);
      const videoMatch = url.pathname.match(/\/(?:watch|videos|reel)\/(?:[^/]+\/)?([A-Za-z0-9_-]+)/);
      const qv = url.searchParams.get('v');
      const id = shareMatch?.[1] || videoMatch?.[1] || qv || url.pathname.split('/').filter(Boolean).pop();
      const type = url.pathname.includes('/reel/') ? 'Reel' : 'Video';
      if (id) {
        const parsed = { platform:'facebook', id, type, url:raw.trim() };
        parsed.canonicalKey = `facebook:${id}`;
        return parsed;
      }
    }
    if (h.includes('twitter.com')||h.includes('x.com')) {
      const m=url.pathname.match(/\/status\/(\d+)/);
      if (m) {
        const parsed = { platform:'twitter', id:m[1], type:'Post', url:raw.trim() };
        parsed.canonicalKey = `twitter:${m[1]}`;
        return parsed;
      }
    }
    if (h.includes('github.com')) {
      const parts=url.pathname.split('/').filter(Boolean);
      if (parts.length>=2) {
        const repoId = parts.slice(0,2).join('/');
        const parsed = { platform:'github', id:repoId, type:'Repo', url:raw.trim() };
        parsed.canonicalKey = `github:${repoId.toLowerCase()}`;
        return parsed;
      }
    }
    const cleanWebUrl = `${url.origin}${url.pathname}`.toLowerCase().replace(/\/+$/, '');
    return { platform:'web', id:h, type:'Article', url:raw.trim(), canonicalKey:`web:${cleanWebUrl}` };
  } catch {}
  return null;
}

function getCanonicalKey(parsed) {
  if (!parsed) return null;
  if (parsed.canonicalKey) return parsed.canonicalKey;
  if (parsed.platform && parsed.id) return `${parsed.platform}:${parsed.id}`;
  return parsed.url ? parsed.url.trim().toLowerCase() : null;
}

function renderMarkdown(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

// ── Persistent Deterministic Cache Helpers ─────────────────────────
function findCachedSummary(parsed) {
  if (!parsed) return null;
  const canonicalKey = getCanonicalKey(parsed);

  // 1. Direct match from persistent url-cache
  if (canonicalKey) {
    const direct = sg('url-cache:' + canonicalKey);
    if (direct) return direct;
  }

  // 2. Search in S.urlSummaries
  if (Array.isArray(S.urlSummaries)) {
    const found = S.urlSummaries.find(s => {
      if (s.canonicalKey && canonicalKey && s.canonicalKey === canonicalKey) return true;
      if (parsed.id && (s.url || '').includes(parsed.id)) return true;
      if (s.url && parsed.url && s.url.trim().toLowerCase() === parsed.url.trim().toLowerCase()) return true;
      return false;
    });
    if (found) return found;
  }

  return null;
}

function saveSummaryToCache(summary) {
  if (!summary) return;
  const parsed = parseURL(summary.url);
  const canonicalKey = summary.canonicalKey || (parsed ? getCanonicalKey(parsed) : null);
  if (canonicalKey) {
    summary.canonicalKey = canonicalKey;
    ss('url-cache:' + canonicalKey, summary);
  }
  const existingIdx = (S.urlSummaries || []).findIndex(s =>
    (s.canonicalKey && canonicalKey && s.canonicalKey === canonicalKey) ||
    (s.id && s.id === summary.id) ||
    (parsed?.id && (s.url || '').includes(parsed.id))
  );
  if (existingIdx >= 0) {
    S.urlSummaries[existingIdx] = summary;
  } else {
    S.urlSummaries.unshift(summary);
  }
  S.urlSummaries = S.urlSummaries.slice(0, 100);
  ss('ai-summaries', S.urlSummaries);
}

function formatSummaryAsMarkdown(s) {
  if (!s) return '';
  let md = `# ${s.title || 'Summary'}\n\n`;
  if (s.overview) {
    md += `${s.overview}\n\n`;
  }
  if (Array.isArray(s.phases) && s.phases.length > 0) {
    md += `### **Key Phases & Workflow:**\n\n`;
    s.phases.forEach(p => {
      const timeStr = p.timeRange ? ` (${p.timeRange})` : (p.timestamp ? ` (${p.timestamp})` : '');
      md += `* **${p.title || 'Phase'}${timeStr}:** ${p.summary || ''}\n`;
      if (Array.isArray(p.subPoints) && p.subPoints.length > 0) {
        p.subPoints.forEach(sp => {
          md += `    * ${sp}\n`;
        });
      }
    });
    md += `\n`;
  } else if (Array.isArray(s.points) && s.points.length > 0) {
    md += `### **Key Points:**\n\n`;
    s.points.forEach(p => {
      const txt = typeof p === 'string' ? p : (p.timestamp ? `**[${p.timestamp}]** ${p.text}` : p.text || '');
      md += `* ${txt}\n`;
    });
    md += `\n`;
  }
  if (Array.isArray(s.takeaways) && s.takeaways.length > 0) {
    md += `### **Key Takeaways:**\n\n`;
    s.takeaways.forEach(t => {
      md += `* ${t}\n`;
    });
    md += `\n`;
  }
  if (s.url) {
    md += `*Source:* ${s.url}\n`;
  }
  return md.trim();
}

function copySummaryText(btn, id) {
  let item = S.urlResult?.id === id ? S.urlResult : (S.urlSummaries || []).find(s => s.id === id);
  if (!item && S.urlResult) item = S.urlResult;
  if (!item) return;
  const md = formatSummaryAsMarkdown(item);
  const markCopied = () => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-check"></i> Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(md).then(markCopied).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = md;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      markCopied();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = md;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    markCopied();
  }
}

function resolveAssetUrl(rel) {
  if (!rel) return '';
  if (rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('data:')) return rel;
  
  const cleanRel = rel.replace(/^\/+/, '');
  
  // If hosted under /wise-ai-daily (GitHub Pages)
  if (typeof location !== 'undefined' && location.pathname && location.pathname.includes('/wise-ai-daily')) {
    return `/wise-ai-daily/${cleanRel}`;
  }
  
  return `./${cleanRel}`;
}

function getPhaseSnapshotUrl(p, youtubeId, idx = 0) {
  if (!youtubeId) return p?.snapshotUrl ? resolveAssetUrl(p.snapshotUrl) : null;
  
  const sec = (typeof p?.seconds === 'number') ? p.seconds : 0;
  
  // Exact mapping for known tutorial videos with curated snapshots
  if (youtubeId === 'PEEBZwGetyc') {
    if (sec < 60) return resolveAssetUrl('snapshots/PEEBZwGetyc/snap_0.jpg');
    if (sec < 140) return resolveAssetUrl('snapshots/PEEBZwGetyc/snap_100.jpg');
    if (sec < 250) return resolveAssetUrl('snapshots/PEEBZwGetyc/snap_170.jpg');
    if (sec < 400) return resolveAssetUrl('snapshots/PEEBZwGetyc/snap_345.jpg');
    if (sec < 550) return resolveAssetUrl('snapshots/PEEBZwGetyc/snap_460.jpg');
    return resolveAssetUrl('snapshots/PEEBZwGetyc/snap_660.jpg');
  }
  
  if (youtubeId === 'Qsi9MeLh95Q') {
    if (sec < 100) return resolveAssetUrl('snapshots/Qsi9MeLh95Q/snap_65.jpg');
    if (sec < 200) return resolveAssetUrl('snapshots/Qsi9MeLh95Q/snap_170.jpg');
    if (sec < 300) return resolveAssetUrl('snapshots/Qsi9MeLh95Q/snap_240.jpg');
    if (sec < 450) return resolveAssetUrl('snapshots/Qsi9MeLh95Q/snap_360.jpg');
    return resolveAssetUrl('snapshots/Qsi9MeLh95Q/snap_526.jpg');
  }
  
  if (youtubeId === 'vwLVjHEGGK0') {
    if (sec < 500) return resolveAssetUrl('snapshots/vwLVjHEGGK0/snap_156.jpg');
    if (sec < 2000) return resolveAssetUrl('snapshots/vwLVjHEGGK0/snap_689.jpg');
    return resolveAssetUrl('snapshots/vwLVjHEGGK0/snap_3011.jpg');
  }

  if (youtubeId === 'ewgAKF9j__o') {
    if (sec < 60) return resolveAssetUrl('snapshots/ewgAKF9j__o/snap_0.jpg');
    if (sec < 120) return resolveAssetUrl('snapshots/ewgAKF9j__o/snap_75.jpg');
    if (sec < 180) return resolveAssetUrl('snapshots/ewgAKF9j__o/snap_150.jpg');
    return resolveAssetUrl('snapshots/ewgAKF9j__o/snap_210.jpg');
  }

  if (p && p.snapshotUrl && !p.snapshotUrl.includes('undefined')) {
    return resolveAssetUrl(p.snapshotUrl);
  }

  // Check if a direct file was named snap_${sec}.jpg
  if (sec !== undefined) {
    return resolveAssetUrl(`snapshots/${youtubeId}/snap_${sec}.jpg`);
  }
  
  // For other videos without local snapshots, use YouTube scene frame snapshots (1.jpg, 2.jpg, 3.jpg)
  const frameNum = (idx % 3) + 1;
  return `https://img.youtube.com/vi/${youtubeId}/${frameNum}.jpg`;
}

function parseDurationToSeconds(str) {
  if (!str) return null;
  const cleaned = String(str).trim();
  const parts = cleaned.split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  // Check for "4m" or "4m 6s"
  const mMatch = cleaned.match(/^(\d+)\s*m(?:in)?(?:\s*(\d+)\s*s)?/i);
  if (mMatch) {
    return parseInt(mMatch[1], 10) * 60 + (mMatch[2] ? parseInt(mMatch[2], 10) : 0);
  }
  return null;
}

/**
 * Uses the YouTube IFrame Player API to silently read the real video duration.
 * Creates a hidden 1x1 iframe, waits for onReady, grabs getDuration(), destroys it.
 * Resolves with duration in seconds (number) or null on timeout/error.
 */
function getYouTubeDuration(videoId, timeoutMs = 6000) {
  return new Promise(resolve => {
    if (!videoId) { resolve(null); return; }

    // Reuse a loaded YT API if already present
    const tryCreate = () => {
      let resolved = false;
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(container);

      const timer = setTimeout(() => {
        if (!resolved) { resolved = true; cleanup(); resolve(null); }
      }, timeoutMs);

      let player;
      function cleanup() {
        clearTimeout(timer);
        try { if (player) player.destroy(); } catch {}
        try { container.remove(); } catch {}
      }

      try {
        player = new YT.Player(container, {
          videoId,
          playerVars: { autoplay: 0, controls: 0, mute: 1, disablekb: 1, fs: 0, rel: 0, playsinline: 1 },
          events: {
            onReady: (e) => {
              if (resolved) return;
              resolved = true;
              const dur = e.target.getDuration();
              cleanup();
              resolve(dur > 0 ? Math.round(dur) : null);
            },
            onError: () => {
              if (!resolved) { resolved = true; cleanup(); resolve(null); }
            }
          }
        });
      } catch(err) {
        if (!resolved) { resolved = true; cleanup(); resolve(null); }
      }
    };

    if (window.YT && window.YT.Player) {
      tryCreate();
    } else {
      // Load the IFrame API script if not already loading
      const existing = document.getElementById('yt-iframe-api-script');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'yt-iframe-api-script';
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
      // Poll until YT.Player is available (max 5s)
      let polls = 0;
      const poll = setInterval(() => {
        polls++;
        if (window.YT && window.YT.Player) {
          clearInterval(poll);
          tryCreate();
        } else if (polls > 50) {
          clearInterval(poll);
          resolve(null);
        }
      }, 100);
    }
  });
}

function formatSecondsToTimestamp(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function scalePhasesToDuration(phases, targetDurationSec) {
  if (!phases || !phases.length || !targetDurationSec) return phases;
  
  let currentMax = 0;
  phases.forEach(p => {
    if (typeof p.seconds === 'number' && p.seconds > currentMax) currentMax = p.seconds;
    if (p.timeRange) {
      const parts = p.timeRange.split('-');
      if (parts[1]) {
        const sec = parseDurationToSeconds(parts[1]);
        if (sec && sec > currentMax) currentMax = sec;
      }
    }
  });

  if (currentMax <= targetDurationSec && currentMax > targetDurationSec * 0.75) {
    return phases; // Already within realistic bounds
  }

  const ratio = currentMax > 0 ? (targetDurationSec / currentMax) : 1;

  return phases.map((p, i) => {
    const newStartSec = Math.floor((p.seconds || 0) * ratio);
    const nextPhase = phases[i + 1];
    const nextStartSec = nextPhase ? Math.floor((nextPhase.seconds || 0) * ratio) : targetDurationSec;
    const newRange = `${formatSecondsToTimestamp(newStartSec)} - ${formatSecondsToTimestamp(nextStartSec)}`;
    return {
      ...p,
      seconds: newStartSec,
      timestamp: formatSecondsToTimestamp(newStartSec),
      timeRange: newRange
    };
  });
}

function adjustSummaryDuration(cardId) {
  const summary = S.urlSummaries.find(s => (s.id || s.canonicalKey) === cardId) || S.urlResult;
  if (!summary) return;

  const currentDur = summary.duration || '';
  const input = prompt('Enter actual video duration (e.g. 4:06 or 12:30):', currentDur);
  if (!input) return;

  const targetSec = parseDurationToSeconds(input);
  if (!targetSec || targetSec <= 0) {
    alert('Please enter a valid duration like 4:06 or 15:30');
    return;
  }

  summary.duration = formatSecondsToTimestamp(targetSec);
  if (Array.isArray(summary.phases) && summary.phases.length) {
    summary.phases = scalePhasesToDuration(summary.phases, targetSec);
  }

  // Update points as well
  if (Array.isArray(summary.points) && summary.points.length && summary.phases.length) {
    summary.points = summary.phases.map(p => ({
      timestamp: p.timestamp || '0:00',
      seconds: p.seconds || 0,
      text: `${p.title ? p.title + ': ' : ''}${p.summary || ''}`
    }));
  }

  saveSummaryToCache(summary);
  render();
}

function toggleAllSnapshots(cardId) {
  S.showSnapshots = !S.showSnapshots;
  render();
}

function togglePhaseSnapshot(cardId, idx) {
  const key = `${cardId}_${idx}`;
  S.activeSnapshots[key] = !S.activeSnapshots[key];
  render();
}

function playSnapshotMoment(cardId, idx) {
  const key = `${cardId}_${idx}`;
  S.activePlayerMoments[key] = true;
  render();
}

function closeSnapshotPlayer(cardId, idx) {
  const key = `${cardId}_${idx}`;
  delete S.activePlayerMoments[key];
  render();
}

function openLightbox(url, title) {
  S.lightbox = { url, title };
  render();
}

function closeLightbox() {
  S.lightbox = null;
  render();
}

function getYouTubeVideoId(r, p) {
  if (p && p.videoId) return p.videoId;
  if (r && r.videoId) return r.videoId;
  if (r && r.canonicalKey && r.canonicalKey.startsWith('youtube:')) {
    return r.canonicalKey.replace('youtube:', '');
  }
  const parsed = parseURL(r?.url || '');
  if (parsed && parsed.platform === 'youtube' && parsed.id) {
    return parsed.id;
  }
  if (r && r.platform === 'youtube' && r.id && !r.id.startsWith('sum-')) {
    return r.id;
  }
  return null;
}

function buildLightbox() {
  if (!S.lightbox) return '';
  return `
    <div class="lightbox-overlay" onclick="closeLightbox()">
      <div class="lightbox-modal" onclick="event.stopPropagation()">
        <div class="lightbox-header">
          <span style="font-weight:600;font-size:14px;color:#fff">${S.lightbox.title || 'Key Moment Snapshot'}</span>
          <button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.3);padding:2px 8px" onclick="closeLightbox()"><i class="ti ti-x"></i></button>
        </div>
        <img src="${S.lightbox.url}" class="lightbox-img" alt="${S.lightbox.title || ''}" />
      </div>
    </div>
  `;
}

function normalizeSummaryOutput(raw, parsed, cleanTitle, videoAuthor, url) {
  const res = { ...raw };
  if (cleanTitle && (!res.title || res.title === 'Video Summary' || res.title === 'Page Summary')) {
    res.title = cleanTitle;
  }
  if (videoAuthor && (!res.source || res.source === 'Creator' || res.source === 'Author')) {
    res.source = videoAuthor;
  }
  res.url = url;
  res.platform = parsed.platform;
  res.type = parsed.type;
  res.date = res.date || TODAY;
  res.createdAt = res.createdAt || new Date().toISOString();
  res.id = res.id || ('sum-' + Date.now());

  // Ensure phases array
  if (!Array.isArray(res.phases)) res.phases = [];

  // Filter out placeholder texts & compute seconds + snapshotUrl
  const placeholderRegex = /^(opening context|first main point|second main point|third main point|closing takeaway|insight \d|hook|phase name)/i;
  res.phases = res.phases.filter(p => {
    const t = (p.title || '').trim();
    const s = (p.summary || '').trim();
    return !placeholderRegex.test(t) && !placeholderRegex.test(s);
  }).map((p, idx) => {
    let sec = (typeof p.seconds === 'number') ? p.seconds : undefined;
    if (sec === undefined && p.timestamp) {
      const parts = String(p.timestamp).split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        sec = parts[0] * 60 + parts[1];
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    const finalSec = sec !== undefined ? sec : 0;
    const yId = (parsed.platform === 'youtube' && parsed.id) ? parsed.id : null;
    return {
      ...p,
      seconds: finalSec,
      snapshotUrl: getPhaseSnapshotUrl({ ...p, seconds: finalSec }, yId, idx)
    };
  });

  // Scale phases proportionally if they exceed duration
  const targetDurationSec = parseDurationToSeconds(S.urlDuration) || parseDurationToSeconds(res.duration);
  if (targetDurationSec && targetDurationSec > 0 && res.phases.length > 0) {
    res.duration = formatSecondsToTimestamp(targetDurationSec);
    res.phases = scalePhasesToDuration(res.phases, targetDurationSec);
    const yId = (parsed.platform === 'youtube' && parsed.id) ? parsed.id : null;
    res.phases = res.phases.map((p, idx) => ({
      ...p,
      snapshotUrl: getPhaseSnapshotUrl(p, yId, idx)
    }));
  }

  // Ensure points array exists for backwards compatibility
  if (!Array.isArray(res.points) || res.points.length === 0) {
    if (res.phases.length > 0) {
      res.points = res.phases.map(p => ({
        timestamp: p.timestamp || '0:00',
        seconds: p.seconds || 0,
        text: `${p.title ? p.title + ': ' : ''}${p.summary || ''}`
      }));
    } else {
      res.points = [];
    }
  }

  // Ensure takeaways array
  if (!Array.isArray(res.takeaways)) res.takeaways = [];

  return res;
}


// ── Daily digest ─────────────────────────────────────────────────
async function fetchDigest() {
  if (!S.apiKey) { S.showSetup=true; render(); return; }
  S.loading=true; S.loadError=''; render();

  // Pre-fetch real trending stories from free public CORS-enabled feeds
  let realFeedsContext = '';
  try {
    const [hnRes, hfRes] = await Promise.allSettled([
      fetch('https://hn.algolia.com/api/v1/search?query=AI+OR+LLM+OR+GPT&tags=story&hitsPerPage=6'),
      fetch('https://huggingface.co/api/daily_papers')
    ]);

    const realItems = [];
    if (hnRes.status === 'fulfilled' && hnRes.value.ok) {
      const hnData = await hnRes.value.json();
      (hnData.hits || []).slice(0, 4).forEach(h => {
        const u = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
        if (h.title && u) {
          realItems.push(`- Title: "${h.title}" | Platform: "web" | Source: "Hacker News" | Real URL: ${u}`);
        }
      });
    }

    if (hfRes.status === 'fulfilled' && hfRes.value.ok) {
      const hfData = await hfRes.value.json();
      (hfData || []).slice(0, 4).forEach(p => {
        if (p.title && p.paper?.id) {
          realItems.push(`- Title: "${p.title}" | Platform: "paper" | Source: "Hugging Face Daily Papers" | Real URL: https://huggingface.co/papers/${p.paper.id}`);
        }
      });
    }

    if (realItems.length > 0) {
      realFeedsContext = `\nREAL VERIFIED STORIES FROM TODAY (Include these with their exact Real URLs):\n${realItems.join('\n')}\n`;
    }
  } catch (e) {
    console.warn('Could not pre-fetch live feeds:', e);
  }

  const followStr = S.following.length
    ? '\nAlso include latest content from: ' + S.following.map(f=>`${f.platform} @${f.handle}`).join(', ') + '.'
    : '';

  const prompt = `Today is ${TODAY}. Generate a daily AI news digest of 12 varied trending AI/ML items from the last 24 hours.
Mix of:
- Breaking AI model or product announcements (OpenAI, Anthropic, Google, Meta, Mistral, xAI)
- Trending GitHub repos for AI/ML
- New research papers (arXiv, Hugging Face)
- Viral AI posts on X/Twitter
- YouTube AI videos trending
- AI startup/funding news
- Hacker News top AI threads${followStr}
${realFeedsContext}
URL GENERATION RULES (CRITICAL):
1. For items from the REAL VERIFIED STORIES list above, PRESERVE their exact Real URL.
2. For model/product announcements or news articles without a verified exact URL, ALWAYS use a Google News search URL: "https://news.google.com/search?q=KEYWORDS" (e.g. "https://news.google.com/search?q=Anthropic+Claude+4.5" or "https://news.google.com/search?q=OpenAI+GPT-5").
3. For GitHub repos: Use "https://github.com/search?q=KEYWORDS&type=repositories" or the exact real repo URL.
4. For research papers without an exact link: Use "https://arxiv.org/search/?query=KEYWORDS&searchtype=all".
5. For YouTube videos: Use "https://www.youtube.com/results?search_query=KEYWORDS".
6. STRICTLY FORBIDDEN: NEVER invent non-existent deep slugs like "https://www.anthropic.com/news/claude-4-5" or fake blog paths that cause 404 errors. Every URL MUST open successfully.

You MUST return exactly 12 items in the "items" array, numbered item-1 to item-12. Do not stop early. Each item needs 3 bullet point key insights.

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

// ── Summarise URL (Deterministic with Persistent Caching) ──────────
async function summarizeURL(forceRefresh = false) {
  if (!S.apiKey) { S.showSetup=true; render(); return; }
  const url = S.urlInput.trim();
  if (!url) { S.urlError='Enter a URL first.'; render(); return; }
  const parsed = parseURL(url);
  if (!parsed) { S.urlError="Doesn't look like a valid URL."; render(); return; }

  const canonicalKey = getCanonicalKey(parsed);

  // 1. Check persistent cache FIRST (guarantees identical output on repeated clicks)
  if (!forceRefresh) {
    const cached = findCachedSummary(parsed);
    if (cached) {
      S.urlError = '';
      S.urlLoading = false;
      const cachedResult = { ...cached, isCached: true };
      S.urlResult = cachedResult;
      saveSummaryToCache(cachedResult);
      render();
      return;
    }
  }

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

  // Resolve real duration: user override > auto-detect from YT IFrame API > fallback prompt guidance
  let userDurationSec = parseDurationToSeconds(S.urlDuration);
  let detectedDurationSec = null;

  if (!userDurationSec && parsed.platform === 'youtube' && parsed.id) {
    // Silently load a 1x1 hidden player to get real duration
    try {
      detectedDurationSec = await getYouTubeDuration(parsed.id, 6000);
    } catch {}
  }

  const resolvedDurationSec = userDurationSec || detectedDurationSec;
  const resolvedDurationStr = resolvedDurationSec ? formatSecondsToTimestamp(resolvedDurationSec) : null;

  // Compute ideal phase count: 1 phase per ~2.5 minutes, minimum 2, no hard cap
  const numPhases = resolvedDurationSec
    ? Math.max(2, Math.round(resolvedDurationSec / 150))
    : null; // Let model decide if we have no duration info

  const durationInstruction = resolvedDurationSec
    ? `ACTUAL VIDEO DURATION: ${resolvedDurationStr} (${resolvedDurationSec} seconds total).
REQUIRED NUMBER OF PHASES: ${numPhases} — one per roughly ${Math.round(resolvedDurationSec / numPhases)} seconds.
ALL phase timestamps MUST be strictly within 0:00 and ${resolvedDurationStr}.
The final phase MUST end exactly at ${resolvedDurationStr}.
Distribute phases evenly across the full runtime — do NOT cluster them all in the first few minutes.
NEVER generate any timestamp beyond ${resolvedDurationStr}.`
    : `PHASE SIZING RULES (no duration provided):
- Infer realistic video length from title, channel and format.
- Generate one phase per roughly 2-3 minutes of estimated runtime.
- Every timestamp MUST stay within the estimated video duration.
- The final phase MUST conclude at the estimated end time.`;

  const prompt = isVideo
    ? `You are an elite video summarizer and research analyst. Produce an authoritative, comprehensive, deeply technical and highly structured summary of this video:
URL: ${url}
Title: "${cleanTitle || 'Video'}"
${videoAuthor ? `Channel / Creator: "${videoAuthor}"` : ''}

${durationInstruction}

GOAL: Produce an insightful, structured summary that feels like an expert breakdown.
1. Executive Overview: 2-3 sentences explaining what this video is about, the creator's core methodology or thesis, and who benefits from it.
2. Key Phases / Chapters: Break down the video into sequential phases matching the actual duration:
   - "title": Descriptive, meaningful chapter name
   - "timeRange": e.g. "0:00 - 1:30" (MUST strictly stay within actual video length)
   - "timestamp": Start timestamp e.g. "0:00"
   - "seconds": Start time in seconds (integer)
   - "summary": 2-3 sentences explaining the concepts, tools, or techniques demonstrated
   - "subPoints": 2-3 specific actionable sub-points, settings, workflows, or rules of thumb mentioned
3. Key Takeaways: 3-4 bulleted core principles, rules of thumb, or key lessons.
4. STRICT FORBIDDEN LIST:
   - NEVER use placeholder text: "opening context", "first main point", "second main point", "hook", "insight 1", "key takeaway", "closing thoughts".
   - NEVER write vague or empty sentences. Every single point must contain real domain concepts, instructions, or insights.
   - NEVER use ellipses (...) or placeholder brackets [...] in any array or object. Output strictly valid standard JSON with complete string values.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "title": "${(cleanTitle || 'Video Summary').replace(/"/g, '\\"')}",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "${(videoAuthor || 'Creator').replace(/"/g, '\\"')}",
  "duration": "${resolvedDurationStr || 'realistic duration e.g. 4:06 or 12:30'}",
  "overview": "2-3 sentence executive overview of what this video teaches and who it is for",
  "takeaways": [
    "Core principle or insight 1",
    "Core principle or insight 2",
    "Core principle or insight 3"
  ],
  "phases": [
    {
      "title": "Phase Name",
      "timeRange": "0:00 - 1:30",
      "timestamp": "0:00",
      "seconds": 0,
      "summary": "Detailed summary of what happens in this phase without trailing dots",
      "subPoints": [
        "Specific actionable detail or technique A",
        "Specific actionable detail or technique B"
      ]
    }
  ]
}`
    : `You are an expert research analyst summarizing this ${parsed.platform} publication:
URL: ${url}
Title: "${cleanTitle || 'Page'}"
${videoAuthor ? `Author/Source: "${videoAuthor}"` : ''}

GOAL: Produce an authoritative, comprehensive summary.
1. Executive Overview: 2-3 sentences explaining the background, main thesis, and significance.
2. Key Sections / Topics: 4 to 6 detailed sections, each with a title, summary, and 2-3 specific sub-points.
3. Key Takeaways: 3-4 actionable insights or conclusions.
4. FORBIDDEN: Do not use placeholders, generic phrases, ellipses (...), or placeholder brackets [...].

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "title": "${(cleanTitle || 'Page Summary').replace(/"/g, '\\"')}",
  "platform": "${parsed.platform}",
  "type": "${parsed.type}",
  "url": "${url}",
  "source": "${(videoAuthor || 'Author').replace(/"/g, '\\"')}",
  "overview": "2-3 sentence executive overview of the page content.",
  "takeaways": [
    "Actionable takeaway 1",
    "Actionable takeaway 2",
    "Actionable takeaway 3"
  ],
  "phases": [
    {
      "title": "Section Title",
      "summary": "Detailed section summary explaining key concepts and findings",
      "subPoints": [
        "Specific detail 1",
        "Specific detail 2"
      ]
    }
  ]
};`;

  try {
    const rawResult = await callGroq(prompt, 3000);
    const finalResult = normalizeSummaryOutput(rawResult, parsed, cleanTitle, videoAuthor, url);
    finalResult.canonicalKey = canonicalKey;
    finalResult.isCached = true;
    saveSummaryToCache(finalResult);

    S.urlResult = finalResult;
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
  return items.map(item => {
    const resolvedUrl = resolveItemLink(item);
    const hub = getOfficialHub(item.url || resolvedUrl, item.source, item.title);
    const safeTitle = (item.title || 'AI Story').replace(/'/g, "\\'");
    const safeUrl = resolvedUrl.replace(/'/g, "\\'");

    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        ${item.importance==='high'?'<span class="tag t-hot"><i class="ti ti-flame"></i> Hot</span>':''}
        ${ptag(item.platform)}
        <span class="tag t-type">${item.type||'post'}</span>
        ${item.source?`<span style="font-size:11px;color:var(--text-muted);margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${item.source}</span>`:''}
      </div>

      <a href="${resolvedUrl}" target="_blank" rel="noopener" class="card-title" title="Open verified news and coverage">
        ${item.title} <i class="ti ti-external-link" style="font-size:12px;color:var(--text-muted)"></i>
      </a>

      ${(item.points||[]).map(p=>`<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${p}</span></div>`).join('')}

      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-color);flex-wrap:wrap">
        <a href="${resolvedUrl}" target="_blank" rel="noopener" class="btn-ghost" style="font-size:11px;padding:3px 9px;text-decoration:none;display:inline-flex;align-items:center;gap:4px" title="Read coverage on Google News / Source">
          <i class="ti ti-news"></i> Read Story
        </a>
        ${hub ? `
          <a href="${hub.url}" target="_blank" rel="noopener" class="btn-ghost" style="font-size:11px;padding:3px 9px;text-decoration:none;display:inline-flex;align-items:center;gap:4px" title="Visit official page / newsroom">
            <i class="ti ti-building"></i> ${hub.label}
          </a>
        ` : ''}
        <button onclick="summarizeResearchedStory('${safeTitle}', '${safeUrl}')" class="btn-ghost" style="font-size:11px;padding:3px 9px;display:inline-flex;align-items:center;gap:4px" title="Summarize in AI Daily">
          <i class="ti ti-sparkles"></i> Summarize
        </button>
      </div>
    </div>`;
  }).join('');
}

function summarizeResearchedStory(title, url) {
  S.tab = 'add';
  S.urlInput = url;
  S.urlError = '';
  render();
  if (S.apiKey) {
    summarizeURL(false);
  }
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
// ── Tab: Add URL ─────────────────────────────────────────────────
function buildAdd() {
  const r = S.urlResult;
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
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <input class="input-field" type="url" placeholder="Paste any URL here…"
        value="${S.urlInput}"
        oninput="S.urlInput=this.value;S.urlError=''"
        onkeydown="if(event.key==='Enter')summarizeURL(false)"
        style="flex:1;min-width:220px" />
      <input class="input-field" type="text" placeholder="Duration e.g. 4:06 (optional)"
        value="${S.urlDuration || ''}"
        oninput="S.urlDuration=this.value"
        style="width:145px;font-size:12px"
        title="Specify video duration (optional) so phase timestamps match exactly" />
      <button class="btn-primary" onclick="summarizeURL(false)" ${S.urlLoading||S.modelsLoading?'disabled':''}>
        ${S.urlLoading?`<span class="pulse-dot"></span>`:`<i class="ti ti-sparkles"></i>`} Summarize
      </button>
    </div>
    ${S.urlError?`<div class="error-box"><i class="ti ti-alert-circle"></i> ${S.urlError}</div>`:''}
    ${S.urlLoading?`<div class="loading-row"><span class="pulse-dot"></span> Analyzing content deeply with ${S.activeModel || 'AI'}…</div><div class="skeleton" style="height:180px"></div>`:''}
    ${r&&!S.urlLoading?renderSummaryCard(r, r.id, { isCurrentResult: true }):''}`;
}

// ── Summary Card Renderer ─────────────────────────────────────────
function renderSummaryCard(r, id = null, opts = {}) {
  if (!r) return '';
  const isVideo = ['youtube','instagram','facebook'].includes(r.platform);
  const cardId = id || r.id || ('sum-' + Date.now());
  const isCurrent = opts.isCurrentResult || false;

  const deleteBtn = (id && !isCurrent) ? `
    <button class="btn-ghost" style="padding:2px 7px;font-size:11px;color:var(--text-danger)" onclick="deleteSummary('${id}')" title="Delete summary">
      <i class="ti ti-trash"></i>
    </button>` : '';

  const rerunBtn = (isCurrent || r.url) ? `
    <button class="btn-ghost" style="padding:2px 8px;font-size:11px" onclick="S.urlInput='${(r.url || '').replace(/'/g, "\\'")}';summarizeURL(true)" title="Force re-analyze with AI">
      <i class="ti ti-refresh"></i> Re-analyze
    </button>` : '';

  const copyBtn = `
    <button class="btn-ghost" style="padding:2px 8px;font-size:11px" onclick="copySummaryText(this, '${cardId}')" title="Copy full markdown summary">
      <i class="ti ti-copy"></i> Copy
    </button>`;

  const hasPhases = Array.isArray(r.phases) && r.phases.length > 0;
  const hasTakeaways = Array.isArray(r.takeaways) && r.takeaways.length > 0;

  return `<div class="card" style="margin-bottom:14px">
    <!-- Top badge bar -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      ${ptag(r.platform)}
      <span class="tag t-type">${r.type || 'Summary'}</span>
      ${r.source ? `<span style="font-size:11px;color:var(--text-muted)">${r.source}</span>` : ''}
      ${r.duration ? `<span style="font-size:11px;color:var(--text-muted)">${r.duration}</span>` : ''}
      <span class="badge-cached"><i class="ti ti-check-double"></i> Saved Analysis</span>
      ${r.date ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto">${formatDateLabel(r.date)}</span>` : ''}
    </div>

    <!-- Title -->
    <a href="${r.url || '#'}" target="_blank" rel="noopener" class="card-title" style="font-size:15px;font-weight:600;margin-bottom:12px;line-height:1.4">
      ${r.title || 'Summary'} <i class="ti ti-external-link" style="font-size:12px;color:var(--text-muted)"></i>
    </a>

    <!-- Executive Overview -->
    ${r.overview ? `
      <div class="summary-overview">
        <div class="overview-label"><i class="ti ti-sparkles"></i> Executive Overview</div>
        <div class="overview-text">${renderMarkdown(r.overview)}</div>
      </div>
    ` : ''}

    <!-- Rich Phases / Milestones with Key Moment Snapshots -->
    ${hasPhases ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 10px 0;flex-wrap:wrap;gap:8px">
        <div class="phases-title" style="margin:0"><i class="ti ti-timeline"></i> Key Phases & Workflow</div>
        ${isVideo ? `
          <button class="btn-snapshot-toggle ${S.showSnapshots ? 'active' : ''}" onclick="toggleAllSnapshots('${cardId}')" title="Toggle visual snapshots for all key moments">
            <i class="ti ti-camera"></i> <span>${S.showSnapshots ? 'Hide Key Snapshots' : '📸 Show Key Moment Snapshots'}</span>
          </button>
        ` : ''}
      </div>
      ${r.phases.map((p, idx) => {
        const timeRange = p.timeRange || p.timestamp || '';
        const snapshotKey = `${cardId}_${idx}`;
        const isSnapshotOpen = S.showSnapshots || !!S.activeSnapshots[snapshotKey];
        const isPlaying = !!S.activePlayerMoments[snapshotKey];
        const youtubeId = (r.platform === 'youtube') ? getYouTubeVideoId(r, p) : null;
        const jumpHref = (r.platform === 'youtube' && youtubeId && p.seconds !== undefined) 
          ? `https://youtu.be/${youtubeId}?t=${p.seconds}` 
          : (r.url ? `${r.url}&t=${p.seconds}s` : '#');
        const snapshotImg = getPhaseSnapshotUrl(p, youtubeId, idx);
        const fallbackFrameUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/${(idx % 3) + 1}.jpg` : '';
        const displayImg = snapshotImg || fallbackFrameUrl;

        return `<div class="phase-card">
          <div class="phase-header">
            ${timeRange ? `<a class="ts-pill" href="${jumpHref}" target="_blank" rel="noopener" title="Jump to timestamp on YouTube"><i class="ti ti-player-play"></i> ${timeRange}</a>` : ''}
            ${isVideo ? `
              <button class="ts-pill btn-snapshot-pill ${isSnapshotOpen ? 'active' : ''}" onclick="togglePhaseSnapshot('${cardId}', ${idx})" title="Show/hide snapshot of this key moment">
                <i class="ti ti-camera"></i> Snapshot
              </button>
            ` : ''}
            <span class="phase-name">${renderMarkdown(p.title || 'Phase')}</span>
          </div>

          ${(isVideo && isSnapshotOpen) ? `
            <div class="moment-snapshot-box">
              ${isPlaying && youtubeId ? `
                <div class="snapshot-video-wrapper">
                  <iframe class="snapshot-iframe" src="https://www.youtube.com/embed/${youtubeId}?start=${p.seconds || 0}&autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding:4px 8px">
                    <a href="https://youtu.be/${youtubeId}?t=${p.seconds || 0}" target="_blank" rel="noopener" class="btn-ghost" style="padding:2px 8px;font-size:11px" title="Open directly in YouTube">
                      <i class="ti ti-external-link"></i> Open on YouTube (${timeRange})
                    </a>
                    <button class="btn-ghost" style="padding:2px 8px;font-size:11px" onclick="closeSnapshotPlayer('${cardId}', ${idx})">
                      <i class="ti ti-x"></i> Close Video
                    </button>
                  </div>
                </div>
              ` : `
                <div class="snapshot-media-wrapper">
                  ${displayImg ? `
                    <img src="${displayImg}" alt="${p.title}" class="snapshot-img" loading="lazy" onerror="this.onerror=null;this.src='${fallbackFrameUrl}'" onclick="openLightbox('${displayImg}', '${(p.title || '').replace(/'/g, "\\'")}')" />
                  ` : ''}
                  <div class="snapshot-overlay">
                    <span class="snapshot-badge"><i class="ti ti-clock"></i> ${timeRange}</span>
                    <div style="display:flex;gap:6px">
                      ${youtubeId ? `
                        <button class="snapshot-action-btn" onclick="playSnapshotMoment('${cardId}', ${idx})" title="Watch this moment">
                          <i class="ti ti-player-play"></i> Play Moment
                        </button>
                      ` : ''}
                      ${displayImg ? `
                        <button class="snapshot-action-btn" onclick="openLightbox('${displayImg}', '${(p.title || '').replace(/'/g, "\\'")}')" title="Zoom snapshot">
                          <i class="ti ti-zoom-in"></i> Zoom
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `}
              <div class="snapshot-caption">
                <i class="ti ti-sparkles" style="color:var(--brand)"></i> <span><strong>Key Moment:</strong> ${renderMarkdown(p.title || '')} (${timeRange})</span>
              </div>
            </div>
          ` : ''}

          ${p.summary ? `<div class="phase-summary">${renderMarkdown(p.summary)}</div>` : ''}
          ${Array.isArray(p.subPoints) && p.subPoints.length ? `
            <div class="sub-points-list">
              ${p.subPoints.map(sp => `
                <div class="sub-bullet-row">
                  <i class="ti ti-corner-down-right"></i>
                  <span>${renderMarkdown(sp)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>`;
      }).join('')}
    ` : ''}

    <!-- Fallback for legacy points if no phases -->
    ${!hasPhases && Array.isArray(r.points) && r.points.length ? `
      <div class="phases-title"><i class="ti ti-list"></i> Highlights</div>
      ${r.points.map(p => {
        if (typeof p === 'object' && p !== null) {
          const href = (r.platform === 'youtube' && p.seconds !== undefined) ? `${r.url}&t=${p.seconds}s` : r.url;
          return `<div class="bullet">
            <a class="ts-link${r.platform !== 'youtube' ? ' ts-approx' : ''}" href="${href}" target="_blank" rel="noopener">${p.timestamp || '0:00'}</a>
            <span class="bullet-text">${renderMarkdown(p.text || '')}</span>
          </div>`;
        } else {
          return `<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${renderMarkdown(String(p))}</span></div>`;
        }
      }).join('')}
    ` : ''}

    <!-- Key Takeaways -->
    ${hasTakeaways ? `
      <div class="takeaways-card">
        <div class="takeaways-title"><i class="ti ti-bulb"></i> Core Takeaways & Principles</div>
        ${r.takeaways.map(t => `
          <div class="takeaway-item">
            <i class="ti ti-check"></i>
            <span>${renderMarkdown(t)}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Bottom Actions Toolbar -->
    <div class="summary-actions">
      ${copyBtn}
      ${rerunBtn}
      ${r.platform === 'youtube' ? `
        <button class="btn-ghost" style="padding:2px 8px;font-size:11px" onclick="adjustSummaryDuration('${cardId}')" title="Adjust phase timestamps to match actual video duration">
          <i class="ti ti-clock-edit"></i> Adjust Duration
        </button>
      ` : ''}
      ${deleteBtn}
      ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener" style="font-size:12px;color:var(--text-muted);margin-left:auto;display:inline-flex;align-items:center;gap:4px">Open original <i class="ti ti-external-link" style="font-size:12px"></i></a>` : ''}
    </div>
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
    const overviewMatch = (s.overview || '').toLowerCase().includes(q);
    const takeawaysMatch = (s.takeaways || []).some(t => (t || '').toLowerCase().includes(q));
    const phasesMatch = (s.phases || []).some(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.summary || '').toLowerCase().includes(q) ||
      (p.subPoints || []).some(sp => (sp || '').toLowerCase().includes(q))
    );
    const pointsMatch = (s.points || []).some(p => {
      const txt = typeof p === 'string' ? p : (p.text || '');
      return txt.toLowerCase().includes(q);
    });
    return titleMatch || sourceMatch || overviewMatch || takeawaysMatch || phasesMatch || pointsMatch;
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
      ${filteredDigestItems.map(item => {
        const resolvedUrl = resolveItemLink(item);
        const hub = getOfficialHub(item.url || resolvedUrl, item.source, item.title);
        const safeTitle = (item.title || 'AI Story').replace(/'/g, "\\'");
        const safeUrl = resolvedUrl.replace(/'/g, "\\'");

        return `<div class="card" style="margin-bottom:12px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
            <span class="tag t-type" style="font-size:10px">${formatDateLabel(item.digestDate)}</span>
            ${item.importance === 'high' ? '<span class="tag t-hot"><i class="ti ti-flame"></i> Hot</span>' : ''}
            ${ptag(item.platform)}
            <span class="tag t-type">${item.type || 'post'}</span>
            ${item.source ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">${item.source}</span>` : ''}
          </div>
          <a href="${resolvedUrl}" target="_blank" rel="noopener" class="card-title">
            ${item.title} <i class="ti ti-external-link" style="font-size:12px;color:var(--text-muted)"></i>
          </a>
          ${(item.points || []).map(p => {
            const txt = typeof p === 'string' ? p : (p.text || '');
            return `<div class="bullet"><div class="bullet-dot"></div><span class="bullet-text">${txt}</span></div>`;
          }).join('')}
          <div style="display:flex;gap:8px;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-color);flex-wrap:wrap">
            <a href="${resolvedUrl}" target="_blank" rel="noopener" class="btn-ghost" style="font-size:11px;padding:3px 9px;text-decoration:none;display:inline-flex;align-items:center;gap:4px">
              <i class="ti ti-news"></i> Read Story
            </a>
            ${hub ? `
              <a href="${hub.url}" target="_blank" rel="noopener" class="btn-ghost" style="font-size:11px;padding:3px 9px;text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                <i class="ti ti-building"></i> ${hub.label}
              </a>
            ` : ''}
            <button onclick="summarizeResearchedStory('${safeTitle}', '${safeUrl}')" class="btn-ghost" style="font-size:11px;padding:3px 9px;display:inline-flex;align-items:center;gap:4px">
              <i class="ti ti-sparkles"></i> Summarize
            </button>
          </div>
        </div>`;
      }).join('')}
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
    ${buildLightbox()}
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
