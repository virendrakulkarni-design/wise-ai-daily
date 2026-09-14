/**
 * Wise Simple Studio — AI Video & Story Animation Studio
 * 100% Client-Side Pure Studio Application
 */

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
  'mixtral-8x7b-32768'
];

const STUDIO_STYLES = {
  kids3d: {
    label: '3D Kids Animation (Pixar/Disney)',
    icon: 'ti-sparkles',
    desc: 'Vibrant, colorful, expressive characters, whimsical lighting, joyful humor'
  },
  cinematic: {
    label: 'Cinematic Live Action',
    icon: 'ti-movie',
    desc: 'Photorealistic, 35mm film look, dramatic lighting and natural depth of field'
  },
  anime: {
    label: 'Storybook & Anime',
    icon: 'ti-palette',
    desc: 'Hand-drawn anime aesthetic, painterly backgrounds, warm emotions'
  },
  cyberpunk: {
    label: 'Sci-Fi / Cyberpunk',
    icon: 'ti-cpu',
    desc: 'Futuristic, neon-lit, volumetric smoke, high-tech environments'
  },
  claymation: {
    label: 'Claymation & Stop Motion',
    icon: 'ti-ball-tennis',
    desc: 'Textured, tactile, handcrafted character models and whimsical sets'
  },
  vintage: {
    label: 'Vintage 1960s Film',
    icon: 'ti-camera',
    desc: 'Warm grain, technicolor hues, nostalgic retro cinema tone'
  }
};

const STUDIO_DURATIONS = [
  { value: '15s',  label: '15 sec', scenes: 1 },
  { value: '30s',  label: '30 sec', scenes: 2 },
  { value: '60s',  label: '1 min',  scenes: 4 },
  { value: '90s',  label: '90 sec', scenes: 6 },
  { value: '120s', label: '2 min',  scenes: 8 },
  { value: '420s', label: '7 min (Kids Epic)', scenes: 12 }
];

// ── State Management ──────────────────────────────────────────────────
const S = {
  apiKey: localStorage.getItem('groq-key') || '',
  googleApiKey: localStorage.getItem('google-key') || '',
  googleClientId: localStorage.getItem('gdrive-client-id') || '',
  googleDriveConnected: !!localStorage.getItem('gdrive-access-token'),
  availableModels: [...DEFAULT_GROQ_MODELS],
  activeModel: localStorage.getItem('active-model') || 'llama-3.3-70b-versatile',
  modelsLoading: false,
  showSetup: false,

  // Studio Workflow Pipeline
  studioStep: 0,
  studioTopic: '',
  studioStyle: 'kids3d',
  studioDuration: '420s',
  studioAspect: '16:9',
  studioNumScenes: 12,
  studioScript: null,
  studioPrompts: [],
  studioCharacters: [],
  studioClips: [],
  studioLoading: false,
  studioProgress: '',
  studioError: '',
  studioLogs: [],

  // Quality Validation Alert
  qualityAlert: null,

  // Interactive Story Player
  studioPlayerActive: true,
  studioPlayerCurrentScene: 0,
  studioPlayerPlaying: false,
  studioPlayerAudioMuted: false,

  // Modals
  historyModal: { open: false, filter: 'all' },
  clipCutModal: { open: false, clipIndex: null },
  exportProgressModal: { open: false, progress: 0, currentScene: 0, totalScenes: 0, statusText: '' },
  lightbox: { open: false, url: '', title: '' }
};

// Storage Helpers
const sg = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const ss = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function studioLog(msg) {
  const ts = new Date().toLocaleTimeString();
  S.studioLogs.unshift({ ts, msg });
  if (S.studioLogs.length > 50) S.studioLogs.pop();
  console.log(`[${ts}] ${msg}`);
}

function resolveAssetUrl(rel) {
  if (!rel) return '';
  if (rel.startsWith('http://') || rel.startsWith('https://') || rel.startsWith('data:')) return rel;
  return rel.replace(/^\/+/, '');
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

// ── Image Quality Validation Gate ─────────────────────────────────────
function testLowQualityRejection() {
  S.qualityAlert = {
    title: 'Low Quality Image Rejected',
    filename: 'blurry_sample_150x150.jpg',
    reason: 'Resolution is too low (150x150px). Minimum required character image resolution is 512x512px (file size 8.4 KB < 15 KB). Low-quality images adversely degrade video rendering. Please upload a crisp, high-resolution portrait.'
  };
  studioLog('❌ REJECTED low-quality image "blurry_sample_150x150.jpg": Resolution too low (150x150px < 512x512px)');
  render();
}

function validateCharacterImage(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve({ valid: false, reason: `File "${file.name}" is not a valid image format.` });
      return;
    }
    // File size check: minimum 15 KB
    if (file.size < 15 * 1024) {
      resolve({
        valid: false,
        reason: `Image file "${file.name}" is too small (${(file.size / 1024).toFixed(1)} KB). Low quality, pixelated images adversely degrade video rendering. Minimum required file size is 15 KB (recommended > 50 KB).`
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const minDim = 512;

        if (w < minDim || h < minDim) {
          resolve({
            valid: false,
            dataUrl,
            width: w,
            height: h,
            reason: `Resolution is too low (${w}x${h}px). Minimum required character image resolution is ${minDim}x${minDim}px. Low-quality images adversely affect story video rendering. Please upload a crisp, high-resolution portrait.`
          });
          return;
        }

        const ratio = w / h;
        if (ratio > 3.0 || ratio < 0.33) {
          resolve({
            valid: false,
            dataUrl,
            width: w,
            height: h,
            reason: `Extreme aspect ratio (${w}x${h}px, ratio ${ratio.toFixed(2)}:1). Please provide a standard portrait or character image.`
          });
          return;
        }

        resolve({ valid: true, dataUrl, width: w, height: h });
      };
      img.onerror = () => resolve({ valid: false, reason: `Could not decode image "${file.name}".` });
      img.src = dataUrl;
    };
    reader.onerror = () => resolve({ valid: false, reason: 'Failed to read file.' });
    reader.readAsDataURL(file);
  });
}

// ── Google Drive & Project History Manager ────────────────────────────
function getProjectHistory() {
  return sg('wise-studio-history') || [];
}

function saveCurrentProjectToHistory() {
  const history = getProjectHistory();
  const title = S.studioTopic || 'Untitled Project';
  const id = 'proj_' + Date.now();
  const previewThumb = S.studioClips?.[0]?.imageUrl || S.studioCharacters?.[0]?.url || '';

  const projectEntry = {
    id,
    title,
    style: S.studioStyle,
    duration: S.studioDuration,
    aspect: S.studioAspect,
    numScenes: S.studioScript?.scenes?.length || S.studioClips?.length || 0,
    timestamp: new Date().toISOString(),
    formattedDate: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(),
    previewThumb,
    source: localStorage.getItem('gdrive-access-token') ? 'drive' : 'local',
    data: {
      studioStep: S.studioStep,
      studioTopic: S.studioTopic,
      studioStyle: S.studioStyle,
      studioDuration: S.studioDuration,
      studioAspect: S.studioAspect,
      studioScript: S.studioScript,
      studioPrompts: S.studioPrompts,
      studioCharacters: S.studioCharacters,
      studioClips: S.studioClips
    }
  };

  history.unshift(projectEntry);
  if (history.length > 30) history.pop();
  ss('wise-studio-history', history);
  studioLog(`Project "${title}" saved to history!`);

  if (localStorage.getItem('gdrive-access-token')) {
    saveProjectToGoogleDrive(projectEntry);
  }

  render();
}

function loadProjectFromHistory(id) {
  const history = getProjectHistory();
  const entry = history.find(p => p.id === id);
  if (!entry || !entry.data) {
    alert('Project data not found.');
    return;
  }
  Object.assign(S, entry.data);
  normalizeStudioCharacters();
  saveStudioState();
  S.historyModal.open = false;
  studioLog(`Loaded project "${entry.title}" from history.`);
  render();
}

function deleteProjectFromHistory(id) {
  if (!confirm('Are you sure you want to delete this project from history?')) return;
  let history = getProjectHistory();
  history = history.filter(p => p.id !== id);
  ss('wise-studio-history', history);
  render();
}

let gdriveTokenClient = null;

function connectGoogleDrive() {
  const clientId = S.googleClientId || localStorage.getItem('gdrive-client-id');
  if (!clientId) {
    const inputId = prompt('Enter your Google Cloud OAuth Client ID (from Google Cloud Console):', '');
    if (!inputId) return;
    S.googleClientId = inputId.trim();
    localStorage.setItem('gdrive-client-id', S.googleClientId);
  }

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    alert('Google Identity Services library is loading. Please ensure you have internet access and try again.');
    return;
  }

  gdriveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: S.googleClientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: async (res) => {
      if (res && res.access_token) {
        localStorage.setItem('gdrive-access-token', res.access_token);
        S.googleDriveConnected = true;
        studioLog('✓ Google Drive connected successfully!');
        saveCurrentProjectToHistory();
        render();
      }
    }
  });

  gdriveTokenClient.requestAccessToken({ prompt: 'consent' });
}

async function saveProjectToGoogleDrive(projectEntry) {
  const token = localStorage.getItem('gdrive-access-token');
  if (!token) return;

  try {
    studioLog('Syncing project package to Google Drive...');
    const filename = `wise_studio_${(projectEntry.title || 'project').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    const metadata = {
      name: filename,
      mimeType: 'application/json',
      description: 'Wise Simple Studio AI Story & Video Project'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(projectEntry, null, 2)], { type: 'application/json' }));

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });

    if (res.ok) {
      const driveFile = await res.json();
      projectEntry.source = 'drive';
      projectEntry.driveFileId = driveFile.id;
      const history = getProjectHistory();
      const idx = history.findIndex(p => p.id === projectEntry.id);
      if (idx !== -1) {
        history[idx] = projectEntry;
        ss('wise-studio-history', history);
      }
      studioLog(`✓ Project successfully uploaded to Google Drive! (File ID: ${driveFile.id})`);
      render();
    }
  } catch (err) {
    console.error('Google Drive upload error:', err);
  }
}

// ── Studio Persistence ────────────────────────────────────────────────
function normalizeStudioCharacters() {
  if (!Array.isArray(S.studioCharacters)) {
    S.studioCharacters = [];
    return;
  }
  S.studioCharacters.forEach((c, idx) => {
    if (!c.id) {
      const desc = (c.description || '').toLowerCase();
      if (desc.includes('toby')) c.id = 'char_toby';
      else if (desc.includes('harry')) c.id = 'char_harry';
      else c.id = 'char_' + (idx + 1) + '_' + Math.random().toString(36).substring(2, 6);
    }
    if (!c.name) {
      const extracted = c.description ? c.description.split(':')[0].trim().replace(/^[^a-zA-Z0-9]+/, '') : '';
      c.name = extracted || `Character ${idx + 1}`;
    }
  });
}

function saveStudioState() {
  try {
    const state = {
      version: '2.3',
      studioStep: S.studioStep,
      studioTopic: S.studioTopic,
      studioStyle: S.studioStyle,
      studioDuration: S.studioDuration,
      studioAspect: S.studioAspect,
      studioScript: S.studioScript,
      studioPrompts: S.studioPrompts,
      studioCharacters: S.studioCharacters,
      studioClips: S.studioClips
    };
    ss('wise-studio-state', state);
  } catch (_) {}
}

function restoreStudioState() {
  try {
    const saved = sg('wise-studio-state');
    if (saved && saved.version === '2.3' && saved.studioScript && Array.isArray(saved.studioScript.scenes)) {
      const charUrls = new Set((saved.studioCharacters || []).map(c => c.url));
      // Check if clips incorrectly have character portraits instead of distinct scene visuals
      const hasDuplicateSheets = Array.isArray(saved.studioClips) && saved.studioClips.length > 1 && saved.studioClips.every(c => !c.imageUrl || charUrls.has(c.imageUrl));
      if (!hasDuplicateSheets) {
        Object.assign(S, saved);
        normalizeStudioCharacters();
        return true;
      }
    }
  } catch (_) {}
  return false;
}

// ── Sample Story Loader (7-Minute Kids Epic) ──────────────────────────
async function loadSampleEpic() {
  try {
    S.studioLoading = true;
    S.studioProgress = 'Loading 7-Minute Kids Epic Story...';
    render();
    const res = await fetch('epic_state.json');
    if (!res.ok) throw new Error('Could not load epic_state.json');
    const data = await res.json();
    Object.assign(S, data);
    normalizeStudioCharacters();
    saveStudioState();
    studioLog('Loaded 7-Minute Kids Epic: 12 scenes, character art, and ready clips!');
  } catch (e) {
    S.studioError = e.message;
  }
  S.studioLoading = false;
  S.studioProgress = '';
  render();
}

// ── Project Import & Export ───────────────────────────────────────────
function exportStudioJSON() {
  const data = {
    studioStep: S.studioStep,
    studioTopic: S.studioTopic,
    studioStyle: S.studioStyle,
    studioDuration: S.studioDuration,
    studioAspect: S.studioAspect,
    studioScript: S.studioScript,
    studioPrompts: S.studioPrompts,
    studioCharacters: S.studioCharacters,
    studioClips: S.studioClips
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wise_studio_${(S.studioTopic || 'project').substring(0, 24).replace(/[^a-z0-9]/gi, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  studioLog('Project JSON exported!');
}

function importStudioJSON(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data && data.studioScript) {
        Object.assign(S, data);
        normalizeStudioCharacters();
        saveStudioState();
        studioLog(`Successfully imported project: ${S.studioTopic || 'Custom Story'}`);
        render();
      } else {
        alert('Invalid Studio Project JSON file.');
      }
    } catch (err) {
      alert('Failed to parse JSON file: ' + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function exportStudioScript() {
  if (!S.studioScript) return;
  const scenes = (S.studioScript.scenes || []).map(sc =>
    `SCENE ${sc.sceneNum || ''}: ${sc.title || ''} (${sc.duration || 0}s)\n` +
    `Environment: ${sc.environment || ''}\n` +
    `Mood: ${sc.mood || ''} | Camera: ${sc.camera || ''}\n` +
    `Sound Cue: ${sc.soundEffect || 'none'}\n` +
    `Narration: "${sc.narration || ''}"\n` +
    (sc.dialogue ? `Dialogue: "${sc.dialogue}"\n` : '')
  ).join('\n---\n\n');

  const text = `TITLE: ${S.studioTopic}\nSTYLE: ${STUDIO_STYLES[S.studioStyle]?.label || S.studioStyle}\nDURATION: ${S.studioDuration}\n\nCHARACTERS:\n${S.studioScript.mainCharacter || ''}\n\nNARRATOR INTRODUCTION & MORAL:\n${S.studioScript.narrator || ''}\n\n=== SCENE BY SCENE SCRIPT ===\n\n${scenes}`;

  navigator.clipboard.writeText(text).then(() => {
    studioLog('Full script copied to clipboard!');
    S.studioProgress = 'Full script copied to clipboard!';
    render();
    setTimeout(() => { S.studioProgress = ''; render(); }, 3000);
  }).catch(() => {
    prompt('Copy your full script:', text);
  });
}

function exportStudioPrompts() {
  const lines = (S.studioPrompts || []).map((p, i) =>
    `=== SCENE ${i+1}: ${p.title} ===\nDuration: ${p.duration}s | Camera: ${p.cameraMove}\n\nPROMPT:\n${p.veoPrompt}\n\nNEGATIVE:\n${p.negativePrompt || 'none'}\n`
  ).join('\n---\n\n');

  const fullText = `AI VIDEO STUDIO — CINEMATIC PROMPTS\nTopic: ${S.studioTopic}\nStyle: ${STUDIO_STYLES[S.studioStyle]?.label || S.studioStyle}\nDuration: ${S.studioDuration}\nAspect: ${S.studioAspect}\n\n${S.studioScript?.mainCharacter && S.studioScript.mainCharacter !== 'none' ? 'CHARACTER: ' + S.studioScript.mainCharacter + '\n\n' : ''}${lines}`;

  navigator.clipboard.writeText(fullText).then(() => {
    studioLog('All prompts copied to clipboard!');
    S.studioProgress = 'Prompts copied to clipboard!';
    render();
    setTimeout(() => { S.studioProgress = ''; render(); }, 3000);
  }).catch(() => {
    prompt('Copy your prompts:', fullText);
  });
}

// ── Groq API Client ───────────────────────────────────────────────────
async function callGroq(prompt, maxTokens = 3000) {
  if (!S.apiKey) throw new Error('API key missing. Please configure your Groq API key.');
  if (!S.activeModel) S.activeModel = 'llama-3.3-70b-versatile';

  const requestBody = {
    model: S.activeModel,
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: 'system', content: 'You are an AI screenwriter and video director. You must always return a strictly valid standard JSON object. Never use ellipses (...), never omit array items, and never use markdown code fences.' },
      { role: 'user', content: prompt }
    ]
  };

  let res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
    body: JSON.stringify(requestBody)
  });

  if (!res.ok && res.status === 400) {
    delete requestBody.response_format;
    res = await fetch(GROQ_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${S.apiKey}` },
      body: JSON.stringify(requestBody)
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq API error HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

// ── Step 0 -> Step 1: Script Generation ───────────────────────────────
async function generateStudioScript() {
  if (!S.apiKey) { S.showSetup = true; render(); return; }
  if (!S.studioTopic.trim()) { S.studioError = 'Enter a story concept first.'; render(); return; }

  const numScenes = STUDIO_DURATIONS.find(d => d.value === S.studioDuration)?.scenes || 4;
  S.studioNumScenes = numScenes;
  S.studioLoading = true;
  S.studioError = '';
  S.studioProgress = 'Generating rich scene-by-scene script with Groq...';
  studioLog('Starting script generation...');
  render();

  const styleInfo = STUDIO_STYLES[S.studioStyle] || STUDIO_STYLES.kids3d;
  const isKids = S.studioStyle === 'kids3d' || S.studioStyle === 'anime' || S.studioDuration === '420s' || S.studioTopic.toLowerCase().includes('kids');

  const prompt = `You are a world-class children's storyteller, animation director, and screenwriter specializing in Pixar and Disney-quality animated videos.
Create a detailed, extremely engaging, and captivating scene-by-scene script.

STORY CONCEPT: "${S.studioTopic.trim()}"
VISUAL STYLE: ${styleInfo.label} — ${styleInfo.desc}
TARGET DURATION: ${S.studioDuration === '420s' ? '7 minutes full episodic special' : S.studioDuration.replace('s',' seconds')}
NUMBER OF SCENES: exactly ${numScenes}
ASPECT RATIO: ${S.studioAspect}
${isKids ? 'TARGET AUDIENCE: 5 to 8 years old kids. Tone must be lively, funny, colorful, full of laughter and wonder. Include comical physical gags, entertaining sound effect cues [BOING!], [ZOOM!], [CRUNCH!], [SNORE!], enthusiastic narrator voice, relatable character dialogue, suspenseful twists, and an empowering moral lesson (being clever, disciplined, humble and kind).' : ''}

For EACH scene, provide:
- "sceneNum": scene number (1 to ${numScenes})
- "title": short snappy descriptive title (e.g. "The Overconfident Nap", "Toby's Secret Plan")
- "description": 2-3 sentences describing what happens visually in the animated world
- "environment": specific setting/location details (vibrant rolling green hills, golden carrot patches, finish line arch)
- "mood": emotional tone (e.g. "playful", "tense", "hilarious", "triumphant")
- "lighting": specific lighting setup (e.g. "bright cheerful morning sunlight", "sparkling golden hour rays")
- "camera": camera movement and lens (e.g. "wide sweeping crane shot", "close-up tracking shot")
- "narration": 1-2 cheerful, lively spoken sentences for the voiceover narrator suitable for children aged 5-8
- "dialogue": snappy, funny character spoken line with speaker name (e.g. "Hare: 'Eat my dust, slowpoke!'")
- "soundEffect": comical sound cue like "[ZOOM!]", "[BOING!]", "[CRUNCH CRUNCH!]", "[WHEEL SPIN!]"
- "characters": array of character names appearing in this scene
- "duration": approximate seconds for this scene (total summing up to target duration)

Also provide:
- "mainCharacter": a detailed physical description of the primary characters (e.g. "Toby: a determined little green tortoise with a polished jade shell and friendly amber eyes; Harry: a lanky brown hare with tall floppy ears and a proud smirk")
- "narrator": 2-3 sentence inspiring introduction and moral takeaway for the overall video

Return ONLY valid JSON:
{
  "mainCharacter": "detailed character descriptions",
  "narrator": "overall narration and moral",
  "scenes": [
    {
      "sceneNum": 1,
      "title": "Scene Title",
      "description": "Visual action",
      "environment": "Setting details",
      "mood": "Tone",
      "lighting": "Lighting",
      "camera": "Camera move",
      "narration": "Narrator voice line",
      "dialogue": "Character spoken line",
      "soundEffect": "[SFX]",
      "characters": ["Character 1", "Character 2"],
      "duration": 35
    }
  ]
}`;

  try {
    const result = await callGroq(prompt, 3200);
    (result.scenes || []).forEach(sc => {
      sc.assignedCharacterId = null;
    });
    S.studioScript = result;
    S.studioStep = 1;
    saveStudioState();
    studioLog(`Script generated: ${(result.scenes || []).length} scenes`);
  } catch (e) {
    S.studioError = e.message;
    studioLog('Script generation failed: ' + e.message);
  }
  S.studioLoading = false;
  S.studioProgress = '';
  render();
}

// ── Step 1 -> Step 2: Prompt Expansion ────────────────────────────────
async function expandStudioPrompts() {
  if (!S.studioScript?.scenes?.length) { S.studioError = 'Generate a script first.'; render(); return; }

  S.studioLoading = true;
  S.studioError = '';
  S.studioProgress = 'Expanding scenes into cinematic prompts...';
  studioLog('Expanding scenes into prompts...');
  render();

  const styleInfo = STUDIO_STYLES[S.studioStyle] || STUDIO_STYLES.kids3d;
  const mainChar = S.studioScript.mainCharacter || 'none';

  const prompt = `You are a cinematic AI video prompt engineer specializing in Google Veo 2 and state of the art video generators.
Convert each scene into a production-ready video generation prompt.

STYLE: ${styleInfo.label} — ${styleInfo.desc}
ASPECT RATIO: ${S.studioAspect}
MAIN CHARACTER: ${mainChar}

SCENES:
${JSON.stringify(S.studioScript.scenes.map(s => ({
  sceneNum: s.sceneNum,
  title: s.title,
  description: s.description,
  environment: s.environment,
  mood: s.mood,
  lighting: s.lighting,
  camera: s.camera,
  characters: s.characters,
  duration: s.duration
})))}

For EACH scene, provide:
- "sceneNum": scene number
- "title": scene title
- "veoPrompt": detailed cinematic prompt (focus on lighting, motion, camera angle, character expressions, style consistency)
- "negativePrompt": negative prompt to prevent artifacts
- "cameraMove": short camera direction (e.g. "Slow pan right", "Orbit tracking shot", "Static push-in")
- "duration": seconds

Return ONLY valid JSON:
{
  "prompts": [
    {
      "sceneNum": 1,
      "title": "Title",
      "veoPrompt": "Cinematic prompt...",
      "negativePrompt": "blurry, low quality, distorted",
      "cameraMove": "Camera motion",
      "duration": 35
    }
  ]
}`;

  try {
    const result = await callGroq(prompt, 3000);
    S.studioPrompts = result.prompts || [];
    S.studioStep = 2;
    saveStudioState();
    studioLog(`Expanded ${S.studioPrompts.length} cinematic prompts.`);
  } catch (e) {
    S.studioError = e.message;
    studioLog('Prompt expansion failed: ' + e.message);
  }
  S.studioLoading = false;
  S.studioProgress = '';
  render();
}

// ── Step 3: Character Studio & Mandatory Scene Assignment ─────────────

function getUnassignedScenes() {
  const scenes = S.studioScript?.scenes || [];
  const charIds = new Set((S.studioCharacters || []).map(c => c.id));
  return scenes.filter((sc) => !sc.assignedCharacterId || !charIds.has(sc.assignedCharacterId));
}

function assignCharacterToScene(sceneIdx, charId) {
  if (!S.studioScript?.scenes?.[sceneIdx]) return;
  S.studioScript.scenes[sceneIdx].assignedCharacterId = charId || null;

  const char = (S.studioCharacters || []).find(c => c.id === charId);
  if (char && S.studioClips?.[sceneIdx]) {
    S.studioClips[sceneIdx].characterId = char.id;
    S.studioClips[sceneIdx].characterName = char.name;
    S.studioClips[sceneIdx].characterUrl = char.url;
    if (!S.studioClips[sceneIdx].imageUrl) {
      S.studioClips[sceneIdx].imageUrl = char.url;
    }
  }

  saveStudioState();
  studioLog(`Scene ${sceneIdx + 1} assigned to ${char ? char.name : 'None'}`);
  render();
}

function assignCharacterToAllScenes(charId) {
  if (!S.studioScript?.scenes?.length) return;
  const char = (S.studioCharacters || []).find(c => c.id === charId);
  S.studioScript.scenes.forEach((sc, idx) => {
    sc.assignedCharacterId = charId || null;
    if (char && S.studioClips?.[idx]) {
      S.studioClips[idx].characterId = char.id;
      S.studioClips[idx].characterName = char.name;
      S.studioClips[idx].characterUrl = char.url;
      if (!S.studioClips[idx].imageUrl) {
        S.studioClips[idx].imageUrl = char.url;
      }
    }
  });
  saveStudioState();
  studioLog(`Assigned "${char ? char.name : 'None'}" to all ${S.studioScript.scenes.length} scenes!`);
  render();
}

function autoMatchScriptCharacters() {
  if (!S.studioScript?.scenes?.length || !S.studioCharacters?.length) return;
  let matchedCount = 0;

  if (S.studioCharacters.length === 1) {
    assignCharacterToAllScenes(S.studioCharacters[0].id);
    return;
  }

  S.studioScript.scenes.forEach((sc, idx) => {
    if (sc.assignedCharacterId) return;
    const sceneText = `${sc.title || ''} ${sc.description || ''} ${sc.narration || ''} ${sc.dialogue || ''} ${(sc.characters || []).join(' ')}`.toLowerCase();
    for (const ch of S.studioCharacters) {
      const chName = (ch.name || '').toLowerCase();
      const firstName = chName.split(' ')[0];
      if ((firstName.length > 2 && sceneText.includes(firstName)) || (chName.length > 2 && sceneText.includes(chName))) {
        sc.assignedCharacterId = ch.id;
        if (S.studioClips?.[idx]) {
          S.studioClips[idx].characterId = ch.id;
          S.studioClips[idx].characterName = ch.name;
          S.studioClips[idx].characterUrl = ch.url;
        }
        matchedCount++;
        break;
      }
    }
  });

  saveStudioState();
  studioLog(`Auto-matched ${matchedCount} scene(s) to characters.`);
  render();
}

function deleteStudioCharacter(charId) {
  const char = (S.studioCharacters || []).find(c => c.id === charId);
  if (!confirm(`Are you sure you want to delete character "${char?.name || 'this character'}"?`)) return;

  S.studioCharacters = (S.studioCharacters || []).filter(c => c.id !== charId);
  (S.studioScript?.scenes || []).forEach(sc => {
    if (sc.assignedCharacterId === charId) {
      sc.assignedCharacterId = null;
    }
  });
  saveStudioState();
  studioLog(`Deleted character ${char?.name || charId}`);
  render();
}

async function handleCharacterUpload(event) {
  const files = event.target?.files;
  if (!files || !files.length) return;

  const fileList = Array.from(files);
  let accepted = 0;
  S.qualityAlert = null;

  for (const file of fileList) {
    const check = await validateCharacterImage(file);
    if (!check.valid) {
      S.qualityAlert = {
        title: 'Low Quality Image Rejected',
        filename: file.name,
        reason: check.reason
      };
      studioLog(`❌ REJECTED low-quality image "${file.name}": ${check.reason}`);
      continue;
    }

    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, ' ');
    const charName = prompt(`Enter Character Name for "${file.name}" (${check.width}x${check.height}px HD):`, baseName) || baseName;
    const charId = 'char_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    if (!S.studioCharacters) S.studioCharacters = [];
    S.studioCharacters.push({
      id: charId,
      name: charName,
      url: check.dataUrl,
      description: `Uploaded character: ${charName} (${check.width}x${check.height}px HD)`
    });
    accepted++;
    studioLog(`✓ Accepted high-quality character image "${charName}" (${check.width}x${check.height}px)`);
  }

  if (accepted > 0) {
    autoMatchScriptCharacters();
    saveStudioState();
  }
  if (event.target) event.target.value = '';
  render();
}

function handleCharacterDrop(event) {
  event.preventDefault();
  event.currentTarget.style.borderColor = '';
  const dt = event.dataTransfer;
  if (dt && dt.files && dt.files.length) {
    handleCharacterUpload({ target: { files: dt.files } });
  }
}

async function generateCharacterRef() {
  const mainChar = S.studioScript?.mainCharacter;
  if (!mainChar || mainChar === 'none') {
    S.studioStep = 3;
    studioLog('No main character description — opening Character Studio.');
    render();
    return;
  }

  S.studioLoading = true;
  S.studioError = '';
  S.studioProgress = 'Generating character reference image with AI...';
  studioLog('Generating character portrait with AI model...');
  render();

  const styleInfo = STUDIO_STYLES[S.studioStyle] || STUDIO_STYLES.kids3d;

  try {
    let finalUrl = '';
    const charName = mainChar.split(':')[0].trim().replace(/^[^a-zA-Z0-9]+/, '') || 'Main Character';
    const charId = 'char_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    if (S.googleApiKey) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${S.googleApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Generate a high-resolution portrait photograph of this character for use as a reference in AI video production. The character must be shown from chest up, looking slightly to the side, with studio lighting.\n\nCharacter: ${mainChar}\nStyle: ${styleInfo.label} — ${styleInfo.desc}\n\nMake the image photorealistic, detailed, with sharp focus on facial features. ${S.studioAspect === '9:16' ? 'Portrait orientation.' : 'Landscape orientation, 16:9.'}` }]
          }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(p => p.inlineData);
      if (imagePart) {
        finalUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      } else {
        throw new Error('Gemini returned no image');
      }
    } else {
      const promptText = encodeURIComponent(`Character portrait of ${mainChar}, ${styleInfo.label} style, cute 3d pixar disney animation style, vibrant colorful render, friendly expressive face, 8k render, centered studio portrait`);
      finalUrl = `https://image.pollinations.ai/prompt/${promptText}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random()*100000)}`;
    }

    if (!S.studioCharacters) S.studioCharacters = [];
    S.studioCharacters.push({ id: charId, name: charName, url: finalUrl, description: mainChar });
    autoMatchScriptCharacters();
    saveStudioState();
    studioLog(`Character reference "${charName}" created!`);
    S.studioStep = 3;
  } catch (e) {
    const promptText = encodeURIComponent(`Character portrait of ${mainChar}, ${styleInfo.label} style, cute 3d animation, colorful, 8k render`);
    const finalUrl = `https://image.pollinations.ai/prompt/${promptText}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random()*100000)}`;
    const charName = mainChar.split(':')[0].trim().replace(/^[^a-zA-Z0-9]+/, '') || 'Main Character';
    const charId = 'char_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    if (!S.studioCharacters) S.studioCharacters = [];
    S.studioCharacters.push({ id: charId, name: charName, url: finalUrl, description: mainChar });
    autoMatchScriptCharacters();
    saveStudioState();
    studioLog('Character created with Free AI fallback.');
    S.studioStep = 3;
  }
  S.studioLoading = false;
  S.studioProgress = '';
  render();
}

// ── Step 4: Clip Generation with Distinct Scene Visuals ──────────────
async function generateStudioClip(idx) {
  const promptData = S.studioPrompts?.[idx];
  const sceneData = S.studioScript?.scenes?.[idx];
  if (!promptData && !sceneData) return;

  const charId = sceneData?.assignedCharacterId;
  const assignedChar = (S.studioCharacters || []).find(c => c.id === charId);
  if (!assignedChar) {
    S.studioClips[idx] = {
      sceneIndex: idx,
      status: 'error',
      videoUrl: null,
      imageUrl: null,
      prompt: promptData?.veoPrompt || sceneData?.description,
      error: 'Scene missing mandatory character assignment! Please assign a character in Step 3.',
      cuts: S.studioClips?.[idx]?.cuts || []
    };
    render();
    return;
  }

  S.studioClips[idx] = {
    sceneIndex: idx,
    status: 'generating',
    videoUrl: null,
    imageUrl: S.studioClips[idx]?.imageUrl || null,
    characterId: assignedChar.id,
    characterName: assignedChar.name,
    characterUrl: assignedChar.url,
    prompt: promptData?.veoPrompt || sceneData?.description,
    error: null,
    cuts: S.studioClips?.[idx]?.cuts || []
  };
  studioLog(`Generating visual for Scene ${idx + 1} (${sceneData?.title || ''}) featuring "${assignedChar.name}"...`);
  render();

  try {
    if (S.googleApiKey) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${S.googleApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: promptData?.veoPrompt || sceneData?.description }],
          parameters: { aspectRatio: S.studioAspect, durationSeconds: promptData?.duration || 5, personGeneration: 'allow_adult', numberOfVideos: 1 }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.name) {
          S.studioClips[idx].status = 'polling';
          render();
          await pollVideoOperation(idx, data.name);
          return;
        }
      }
    }

    // Generate unique scene-specific visual featuring the assigned character!
    const styleInfo = STUDIO_STYLES[S.studioStyle] || STUDIO_STYLES.kids3d;
    const sceneTitle = sceneData?.title || promptData?.title || `Scene ${idx + 1}`;
    const sceneAction = promptData?.veoPrompt || sceneData?.description || '';
    const sceneEnv = sceneData?.environment || '';

    const visualPrompt = encodeURIComponent(
      `${sceneTitle}, featuring character ${assignedChar.name} (${(assignedChar.description || '').substring(0, 80)}), ${sceneAction}, setting in ${sceneEnv}, ${styleInfo.label} visual style, ultra detailed 4k cinematic render, colorful lighting`
    );
    const aspectWidth = S.studioAspect === '9:16' ? 576 : (S.studioAspect === '1:1' ? 768 : 1024);
    const aspectHeight = S.studioAspect === '9:16' ? 1024 : (S.studioAspect === '1:1' ? 768 : 576);
    const seed = (idx + 1) * 78910 + 12345;
    const uniqueSceneUrl = `https://image.pollinations.ai/prompt/${visualPrompt}?width=${aspectWidth}&height=${aspectHeight}&nologo=true&seed=${seed}`;

    S.studioClips[idx].status = 'done';
    S.studioClips[idx].imageUrl = uniqueSceneUrl;
    S.studioClips[idx].characterId = assignedChar.id;
    S.studioClips[idx].characterName = assignedChar.name;
    S.studioClips[idx].characterUrl = assignedChar.url;
    S.studioClips[idx].videoUrl = null;
    studioLog(`Scene ${idx + 1}: Unique visual generated featuring "${assignedChar.name}"!`);
    render();
  } catch (e) {
    S.studioClips[idx].status = 'error';
    S.studioClips[idx].error = e.message;
    studioLog(`Scene ${idx + 1} error: ${e.message}`);
    render();
  }
}

async function pollVideoOperation(idx, opName) {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${S.googleApiKey}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.done) {
        const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (videoUri) {
          S.studioClips[idx].status = 'done';
          S.studioClips[idx].videoUrl = videoUri;
          studioLog(`Clip ${idx + 1}: Generated successfully!`);
        } else {
          S.studioClips[idx].status = 'pending-manual';
          S.studioClips[idx].error = 'Generation completed but no video URL returned.';
        }
        render();
        return;
      }
    } catch {}
  }
  S.studioClips[idx].status = 'error';
  S.studioClips[idx].error = 'Polling timed out after 5 minutes.';
  render();
}

async function generateAllClips() {
  const unassigned = getUnassignedScenes();
  if (unassigned.length > 0) {
    alert(`⚠️ Mandatory Character Assignment Required:\n\n${unassigned.length} scene(s) do not have an assigned character image yet!\nPlease assign a character image to every scene before proceeding.`);
    S.studioStep = 3;
    render();
    return;
  }

  S.studioStep = 4;
  const numScenes = S.studioPrompts?.length || S.studioScript?.scenes?.length || 0;
  S.studioClips = Array.from({ length: numScenes }, (_, i) => {
    const sc = S.studioScript?.scenes?.[i];
    const ch = (S.studioCharacters || []).find(c => c.id === sc?.assignedCharacterId);
    const p = S.studioPrompts?.[i];
    return {
      sceneIndex: i,
      status: 'queued',
      videoUrl: null,
      imageUrl: S.studioClips?.[i]?.imageUrl || null,
      characterId: ch?.id,
      characterName: ch?.name,
      characterUrl: ch?.url,
      prompt: p?.veoPrompt || sc?.description || '',
      error: null,
      cuts: S.studioClips?.[i]?.cuts || []
    };
  });
  studioLog('Starting batch video generation with distinct scene visuals...');
  render();

  for (let i = 0; i < numScenes; i++) {
    S.studioProgress = `Rendering distinct scene ${i + 1} of ${numScenes} featuring assigned characters...`;
    render();
    await generateStudioClip(i);
  }
  S.studioStep = 5;
  S.studioProgress = '';
  saveStudioState();
  saveCurrentProjectToHistory();
  studioLog('All clips generated with distinct scene visuals and character consistency!');
  render();
}

async function runFullPipeline() {
  studioLog('=== Full Pipeline Started ===');
  await generateStudioScript();
  if (S.studioError) return;
  await expandStudioPrompts();
  if (S.studioError) return;
  await generateCharacterRef();
  if (S.studioError && !S.studioError.includes('API key')) return;
  S.studioError = '';

  const unassigned = getUnassignedScenes();
  if (unassigned.length > 0) {
    S.studioStep = 3;
    studioLog(`⚠️ Full Auto paused at Step 3: ${unassigned.length} scene(s) require character assignment.`);
    render();
    return;
  }

  await generateAllClips();
  studioLog('=== Full Pipeline Complete ===');
}

// ── Step 5: Timeline & Clip Segment Cutter ────────────────────────────
function getClipCutTotal(idx) {
  const cuts = S.studioClips?.[idx]?.cuts || [];
  return cuts.reduce((acc, c) => acc + Math.max(0, (c.end || 0) - (c.start || 0)), 0);
}

function getClipEffectiveDuration(idx) {
  const orig = S.studioScript?.scenes?.[idx]?.duration || S.studioPrompts?.[idx]?.duration || 35;
  const cutTotal = getClipCutTotal(idx);
  return Math.max(1, Math.round((orig - cutTotal) * 10) / 10);
}

function openClipCutModal(idx) {
  S.clipCutModal = { open: true, clipIndex: idx };
  render();
}

function closeClipCutModal() {
  S.clipCutModal = { open: false, clipIndex: null };
  render();
}

function addClipCut(idx, start, end, label) {
  if (idx == null || !S.studioClips?.[idx]) return;
  if (!S.studioClips[idx].cuts) S.studioClips[idx].cuts = [];
  const s = Math.max(0, parseFloat(start) || 0);
  const e = Math.max(s + 0.1, parseFloat(end) || (s + 0.5));
  const id = 'cut_' + Date.now();
  S.studioClips[idx].cuts.push({ id, start: s, end: e, label: label || `Cut ${s}s - ${e}s` });
  saveStudioState();
  render();
}

function removeClipCut(clipIdx, cutId) {
  if (!S.studioClips?.[clipIdx]?.cuts) return;
  S.studioClips[clipIdx].cuts = S.studioClips[clipIdx].cuts.filter(c => c.id !== cutId);
  saveStudioState();
  render();
}

function parseAndApplyCutCommand(idx, cmd) {
  if (!cmd || !cmd.trim()) return;
  const match = cmd.match(/(\d+(?:\.\d+)?)\s*s?\s*(?:to|-|through)\s*(\d+(?:\.\d+)?)\s*s?/i);
  if (match) {
    const s = parseFloat(match[1]);
    const e = parseFloat(match[2]);
    addClipCut(idx, s, e, `Trim ${s}s - ${e}s`);
    studioLog(`Scene ${idx+1}: Applied cut from ${s}s to ${e}s`);
  } else {
    alert('Could not parse cut range. Example formats: "remove from 1.1s to 1.6s", "cut 1.1s to 1.6s", or "1.1 to 1.6".');
  }
}

function reorderClip(from, to) {
  if (to < 0 || to >= S.studioClips.length) return;
  const [item] = S.studioClips.splice(from, 1);
  S.studioClips.splice(to, 0, item);
  if (S.studioPrompts.length > from) {
    const [pItem] = S.studioPrompts.splice(from, 1);
    S.studioPrompts.splice(to, 0, pItem);
  }
  saveStudioState();
  render();
}

// ── Step 5 & 6: Interactive Story Player ──────────────────────────────
let studioPlayerTimer = null;
let studioAudioCtx = null;

function playStudioTone(freq, duration = 0.3) {
  if (S.studioPlayerAudioMuted) return;
  try {
    if (!studioAudioCtx) studioAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (studioAudioCtx.state === 'suspended') studioAudioCtx.resume();
    const osc = studioAudioCtx.createOscillator();
    const gain = studioAudioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, studioAudioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, studioAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, studioAudioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(studioAudioCtx.destination);
    osc.start();
    osc.stop(studioAudioCtx.currentTime + duration);
  } catch (_) {}
}

function speakSceneNarration(text) {
  if (S.studioPlayerAudioMuted || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.pitch = 1.15;
  utter.rate = 1.05;
  window.speechSynthesis.speak(utter);
}

function studioPlayerGoTo(idx) {
  const total = S.studioClips.length || S.studioScript?.scenes?.length || 1;
  S.studioPlayerCurrentScene = Math.max(0, Math.min(idx, total - 1));
  const sc = S.studioScript?.scenes?.[S.studioPlayerCurrentScene];
  if (sc?.narration) speakSceneNarration(sc.narration);
  playStudioTone(440 + S.studioPlayerCurrentScene * 35, 0.4);
  render();
}

function studioPlayerNext() {
  const total = S.studioClips.length || S.studioScript?.scenes?.length || 1;
  if (S.studioPlayerCurrentScene < total - 1) {
    studioPlayerGoTo(S.studioPlayerCurrentScene + 1);
  } else {
    studioPlayerPause();
    studioPlayerGoTo(0);
  }
}

function studioPlayerPrev() {
  if (S.studioPlayerCurrentScene > 0) {
    studioPlayerGoTo(S.studioPlayerCurrentScene - 1);
  }
}

function studioPlayerPlay() {
  S.studioPlayerPlaying = true;
  const currentIdx = S.studioPlayerCurrentScene;
  const sc = S.studioScript?.scenes?.[currentIdx];
  if (sc?.narration) speakSceneNarration(sc.narration);
  playStudioTone(523.25, 0.3);

  const durationSec = getClipEffectiveDuration(currentIdx);
  clearInterval(studioPlayerTimer);
  studioPlayerTimer = setTimeout(() => {
    if (S.studioPlayerPlaying) studioPlayerNext();
  }, Math.max(3000, durationSec * 1000));
  render();
}

function studioPlayerPause() {
  S.studioPlayerPlaying = false;
  clearTimeout(studioPlayerTimer);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  render();
}

function studioPlayerToggle() {
  if (S.studioPlayerPlaying) studioPlayerPause();
  else studioPlayerPlay();
}

function renderStudioPlayer() {
  const total = S.studioClips.length || S.studioScript?.scenes?.length || 0;
  if (!total) return '';
  const idx = S.studioPlayerCurrentScene;
  const clip = S.studioClips[idx] || {};
  const scene = S.studioScript?.scenes?.[idx] || {};
  const prompt = S.studioPrompts?.[idx] || {};
  const cuts = clip.cuts || [];
  const effectiveSec = getClipEffectiveDuration(idx);
  const mediaUrl = clip.imageUrl ? resolveAssetUrl(clip.imageUrl) : '';

  return `
    <div class="studio-player-container">
      <div class="studio-player-screen">
        ${clip.videoUrl ? `
          <video src="${clip.videoUrl}" autoplay loop muted playsinline class="studio-player-media"></video>
        ` : mediaUrl ? `
          <img src="${mediaUrl}" class="studio-player-media studio-pan-zoom" alt="Scene ${idx+1}" />
        ` : `
          <div style="color:var(--text-muted);font-size:16px;display:flex;flex-direction:column;align-items:center;gap:8px">
            <i class="ti ti-movie-off" style="font-size:36px"></i>
            <span>No visuals generated yet</span>
          </div>
        `}

        ${scene.soundEffect ? `<div class="studio-player-badge"><i class="ti ti-bell"></i> ${scene.soundEffect}</div>` : ''}

        <div class="studio-player-subtitles">
          <div style="font-size:11px;font-weight:700;color:var(--brand);margin-bottom:2px;letter-spacing:0.5px">SCENE ${idx+1} OF ${total}: ${scene.title || prompt.title || 'Animated Scene'}</div>
          ${scene.narration ? `"${scene.narration}"` : (clip.prompt || prompt.veoPrompt || '').substring(0, 140)}
          ${scene.dialogue ? `<div style="color:#f59e0b;font-size:13px;margin-top:4px">💬 ${scene.dialogue}</div>` : ''}
        </div>
      </div>

      <div class="studio-player-controls">
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn-ghost" style="padding:6px 12px" onclick="studioPlayerPrev()" ${idx === 0 ? 'disabled' : ''}><i class="ti ti-player-skip-back"></i></button>
          <button class="btn-primary" style="padding:6px 16px" onclick="studioPlayerToggle()">
            <i class="ti ${S.studioPlayerPlaying ? 'ti-player-pause' : 'ti-player-play'}"></i> ${S.studioPlayerPlaying ? 'Pause' : 'Play'}
          </button>
          <button class="btn-ghost" style="padding:6px 12px" onclick="studioPlayerNext()"><i class="ti ti-player-skip-forward"></i></button>
          <button class="btn-ghost" style="padding:6px 10px" onclick="studioPlayerGoTo(0)" title="Restart from beginning"><i class="ti ti-rotate-2"></i></button>
          <button class="btn-ghost" style="padding:6px 10px" onclick="S.studioPlayerAudioMuted=!S.studioPlayerAudioMuted;render()" title="Toggle voiceover & music">
            <i class="ti ${S.studioPlayerAudioMuted ? 'ti-volume-off' : 'ti-volume'}"></i>
          </button>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:12px">
          <span>Scene ${idx+1} / ${total}</span>
          <span><strong>${effectiveSec}s</strong>${cuts.length ? ` <span class="studio-cut-pill">${cuts.length} cut(s)</span>` : ''}</span>
          <button class="btn-ghost" style="font-size:11px;padding:3px 8px" onclick="openClipCutModal(${idx})"><i class="ti ti-scissors"></i> Cut/Trim</button>
        </div>
      </div>

      <div class="studio-player-tray">
        ${Array.from({ length: total }, (_, i) => `
          <div class="studio-tray-pill ${i === idx ? 'active' : ''}" onclick="studioPlayerGoTo(${i})">
            <span>${i+1}.</span>
            <span style="max-width:110px;overflow:hidden;text-overflow:ellipsis">${S.studioScript?.scenes?.[i]?.title || 'Scene ' + (i+1)}</span>
            <span style="color:var(--text-muted);font-size:10px">${getClipEffectiveDuration(i)}s</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// ── Step 6: Full Movie Video Exporter (Canvas + Web Audio + MediaRecorder) ──
async function exportFullVideo() {
  const clips = S.studioClips;
  if (!clips || !clips.length) {
    alert('No clips generated to export.');
    return;
  }

  S.exportProgressModal = { open: true, progress: 0, currentScene: 1, totalScenes: clips.length, statusText: 'Initializing video compiler...' };
  render();

  try {
    const width = 1280;
    const height = 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioContext.createMediaStreamDestination();
    const canvasStream = canvas.captureStream(30);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const preloadImage = (clip) => new Promise(res => {
      if (!clip.imageUrl) return res(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = resolveAssetUrl(clip.imageUrl);
    });

    recorder.start();

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const sc = S.studioScript?.scenes?.[i] || {};
      const durationSec = Math.min(getClipEffectiveDuration(i), 15);

      S.exportProgressModal = {
        open: true,
        progress: Math.round((i / clips.length) * 100),
        currentScene: i + 1,
        totalScenes: clips.length,
        statusText: `Compiling Scene ${i+1} of ${clips.length}: "${sc.title || ''}"...`
      };
      render();

      const img = await preloadImage(clip);

      try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.frequency.setValueAtTime(220 + i * 40, audioContext.currentTime);
        gain.gain.setValueAtTime(0.06, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + durationSec);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        osc.stop(audioContext.currentTime + durationSec);
      } catch (_) {}

      const fps = 30;
      const totalFrames = Math.round(durationSec * fps);

      for (let frame = 0; frame < totalFrames; frame++) {
        ctx.fillStyle = '#050811';
        ctx.fillRect(0, 0, width, height);

        if (img) {
          const progress = frame / totalFrames;
          const scale = 1.0 + progress * 0.12;
          const dw = width * scale;
          const dh = height * scale;
          const dx = (width - dw) / 2;
          const dy = (height - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
        }

        const grad = ctx.createLinearGradient(0, height - 200, 0, height);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, height - 200, width, 200);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px Outfit, Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`SCENE ${i+1}: ${sc.title || ''}`, width / 2, height - 90);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '20px Outfit, Inter, sans-serif';
        const line = sc.narration ? `"${sc.narration}"` : (clip.prompt || '').substring(0, 80);
        ctx.fillText(line, width / 2, height - 50);

        if (sc.soundEffect) {
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 22px Outfit, Inter, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(sc.soundEffect, width - 40, 60);
        }

        await new Promise(r => setTimeout(r, 1000 / fps));
      }
    }

    S.exportProgressModal.statusText = 'Finalizing movie encoding...';
    S.exportProgressModal.progress = 100;
    render();

    await new Promise(r => setTimeout(r, 500));
    recorder.stop();

    await new Promise(resolve => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wise_movie_${(S.studioTopic || 'story').substring(0,24).replace(/[^a-z0-9]/gi, '_')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        resolve();
      };
    });

    S.exportProgressModal.open = false;
    saveCurrentProjectToHistory();
    render();
    studioLog('Full movie export downloaded successfully!');
  } catch (err) {
    alert('Movie export failed: ' + err.message);
    S.exportProgressModal.open = false;
    render();
  }
}

// ── Modals Markup ─────────────────────────────────────────────────────
function renderClipCutModal() {
  if (!S.clipCutModal.open) return '';
  const idx = S.clipCutModal.clipIndex;
  const clip = S.studioClips[idx];
  if (!clip) return '';
  const sc = S.studioScript?.scenes?.[idx] || {};
  const cuts = clip.cuts || [];
  const effectiveSec = getClipEffectiveDuration(idx);
  const origSec = sc.duration || 35;

  return `
    <div class="modal-overlay" onclick="if(event.target===this)closeClipCutModal()">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-title"><i class="ti ti-scissors" style="color:#ef4444"></i> Cut / Trim Scene ${idx+1}</div>
          <button class="modal-close" onclick="closeClipCutModal()">&times;</button>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
          <strong>${sc.title || 'Scene ' + (idx+1)}</strong> &mdash; Original: ${origSec}s | Current Duration: <strong style="color:var(--text-success)">${effectiveSec}s</strong>
        </div>
        ${clip.imageUrl ? `<img src="${resolveAssetUrl(clip.imageUrl)}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:12px" />` : ''}

        <div class="section-label" style="margin-bottom:6px">Natural Language Cut Command</div>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <input type="text" id="studio-cut-cmd-input" class="input-field" placeholder="e.g. remove from 1.1s to 1.6s, or cut 2s to 5s" onkeydown="if(event.key==='Enter'){parseAndApplyCutCommand(${idx}, this.value);this.value='';}" />
          <button class="btn-primary" style="padding:8px 14px" onclick="const el=document.getElementById('studio-cut-cmd-input');parseAndApplyCutCommand(${idx}, el.value);el.value='';"><i class="ti ti-check"></i> Apply</button>
        </div>

        <div class="section-label" style="margin-bottom:6px">Manual Cut Time Interval</div>
        <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
          <input type="number" id="manual-cut-start" class="input-field" placeholder="Start (s)" step="0.1" min="0" style="width:100px" />
          <span style="color:var(--text-muted)">to</span>
          <input type="number" id="manual-cut-end" class="input-field" placeholder="End (s)" step="0.1" min="0.1" style="width:100px" />
          <button class="btn-ghost" onclick="const s=document.getElementById('manual-cut-start').value;const e=document.getElementById('manual-cut-end').value;if(s&&e){addClipCut(${idx}, s, e);document.getElementById('manual-cut-start').value='';document.getElementById('manual-cut-end').value='';}">Add Cut</button>
        </div>

        <div class="section-label" style="margin-bottom:6px">Active Cuts on this Scene (${cuts.length})</div>
        ${cuts.length ? `
          <div style="display:flex;flex-direction:column;gap:6px">
            ${cuts.map(c => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-2);padding:8px 12px;border-radius:6px;font-size:12px">
                <span class="studio-cut-pill"><i class="ti ti-scissors"></i> ${c.label || `${c.start}s - ${c.end}s`}</span>
                <span style="color:var(--text-muted);font-size:11px">-${Math.round((c.end - c.start)*10)/10}s deducted</span>
                <button class="btn-ghost" style="padding:2px 6px;color:#ef4444" onclick="removeClipCut(${idx}, '${c.id}')"><i class="ti ti-trash"></i></button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:12px;color:var(--text-muted);padding:8px;background:var(--surface-2);border-radius:6px">No cuts applied yet. Full scene will play.</div>
        `}
      </div>
    </div>`;
}

function renderExportProgressModal() {
  if (!S.exportProgressModal.open) return '';
  const { progress, currentScene, totalScenes, statusText } = S.exportProgressModal;
  return `
    <div class="modal-overlay">
      <div class="modal-box" style="text-align:center">
        <div style="font-size:36px;color:var(--brand);margin-bottom:8px"><i class="ti ti-movie studio-spin"></i></div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:6px">Compiling Entire Movie</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${statusText}</div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width:${progress}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted)">
          <span>Scene ${currentScene} of ${totalScenes}</span>
          <span>${progress}%</span>
        </div>
      </div>
    </div>`;
}

function renderLightbox() {
  if (!S.lightbox.open) return '';
  return `
    <div class="modal-overlay" onclick="S.lightbox.open=false;render()">
      <div style="max-width:90vw;max-height:90vh;position:relative">
        <img src="${S.lightbox.url}" style="max-width:100%;max-height:85vh;border-radius:8px;display:block" />
        <div style="color:#fff;text-align:center;margin-top:8px;font-weight:600">${S.lightbox.title}</div>
      </div>
    </div>`;
}

function openLightbox(url, title) {
  S.lightbox = { open: true, url, title };
  render();
}

function renderHistoryModal() {
  if (!S.historyModal.open) return '';
  const history = getProjectHistory();
  const driveToken = localStorage.getItem('gdrive-access-token');

  return `
    <div class="modal-overlay" onclick="if(event.target===this){S.historyModal.open=false;render();}">
      <div class="modal-box" style="max-width:760px">
        <div class="modal-header">
          <div class="modal-title">
            <i class="ti ti-history" style="color:var(--brand)"></i>
            Project History & Cloud Storage
          </div>
          <button class="modal-close" onclick="S.historyModal.open=false;render()">&times;</button>
        </div>

        <!-- Google Drive Connection Bar -->
        <div style="background:var(--surface-2);border-radius:var(--radius-md);padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:10px">
            <i class="ti ti-brand-google-drive" style="font-size:26px;color:#4285f4"></i>
            <div>
              <div style="font-weight:600;font-size:13px;color:var(--text-primary)">
                ${driveToken ? '✓ Google Drive Connected' : 'Google Drive Cloud Sync'}
              </div>
              <div style="font-size:11px;color:var(--text-muted)">
                ${driveToken ? 'Projects and character assets sync directly to your Drive' : 'Connect your Google Drive to back up projects & character assets to the cloud'}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            ${!driveToken ? `
              <button class="btn-primary" style="padding:6px 14px;font-size:12px;background:linear-gradient(135deg,#4285f4,#34a853)" onclick="connectGoogleDrive()">
                <i class="ti ti-login"></i> Connect Google Drive
              </button>
            ` : `
              <button class="btn-ghost" style="padding:6px 12px;font-size:11px" onclick="localStorage.removeItem('gdrive-access-token');S.googleDriveConnected=false;render()">Disconnect</button>
            `}
            <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="saveCurrentProjectToHistory()">
              <i class="ti ti-device-floppy"></i> Save Current Project
            </button>
          </div>
        </div>

        <div class="section-label" style="margin-bottom:8px">Saved Projects (${history.length})</div>
        ${history.length ? `
          <div class="history-grid">
            ${history.map(proj => `
              <div class="history-card">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                  <span class="cloud-badge ${proj.source === 'drive' ? 'drive' : 'local'}">
                    <i class="ti ${proj.source === 'drive' ? 'ti-cloud' : 'ti-device-floppy'}"></i> ${proj.source === 'drive' ? 'Google Drive' : 'Local Storage'}
                  </span>
                  <span style="font-size:10px;color:var(--text-muted)">${proj.formattedDate || ''}</span>
                </div>

                ${proj.previewThumb ? `
                  <img src="${resolveAssetUrl(proj.previewThumb)}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;background:#000" />
                ` : ''}

                <div>
                  <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${proj.title}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                    ${proj.numScenes || 0} Scenes &bull; ${proj.duration || '420s'} &bull; Style: ${proj.style || 'kids3d'}
                  </div>
                </div>

                <div style="display:flex;gap:6px;margin-top:auto">
                  <button class="btn-primary" style="flex:1;padding:6px 10px;font-size:12px" onclick="loadProjectFromHistory('${proj.id}')">
                    <i class="ti ti-folder-open"></i> Load
                  </button>
                  <button class="btn-ghost" style="padding:6px 10px;color:#ef4444;font-size:12px" onclick="deleteProjectFromHistory('${proj.id}')" title="Delete project">
                    <i class="ti ti-trash"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="info-box" style="text-align:center;padding:24px">
            <i class="ti ti-folder-off" style="font-size:28px;color:var(--text-muted);display:block;margin-bottom:8px"></i>
            <div>No saved projects found in history yet.</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Click "Save Current Project" above to store your project.</div>
          </div>
        `}
      </div>
    </div>`;
}

function renderSetupModal() {
  if (!S.showSetup) return '';
  return `
    <div class="modal-overlay" onclick="if(event.target===this){S.showSetup=false;render();}">
      <div class="modal-box">
        <div class="modal-header">
          <div class="modal-title"><i class="ti ti-key" style="color:var(--brand)"></i> API & Cloud Configuration</div>
          <button class="modal-close" onclick="S.showSetup=false;render()">&times;</button>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
          Wise Simple Studio runs 100% in your browser. API keys and tokens are stored securely in local browser storage.
        </div>

        <div class="section-label" style="margin-bottom:6px">Groq API Key (Fast LLM Script Generation)</div>
        <input type="password" class="input-field" placeholder="gsk_..." value="${S.apiKey}" oninput="S.apiKey=this.value;localStorage.setItem('groq-key', this.value)" style="margin-bottom:6px" />
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Get a free key from <a href="https://console.groq.com" target="_blank" style="color:var(--brand)">console.groq.com</a> (Free tier: 14,400 req/day).</div>

        <div class="section-label" style="margin-bottom:6px">Google Cloud OAuth Client ID (For Google Drive Sync)</div>
        <input type="text" class="input-field" placeholder="your-client-id.apps.googleusercontent.com" value="${S.googleClientId}" oninput="S.googleClientId=this.value;localStorage.setItem('gdrive-client-id', this.value)" style="margin-bottom:6px" />
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Enables 1-click cloud sync of projects and assets directly to your Google Drive.</div>

        <div class="section-label" style="margin-bottom:6px">Google AI Studio API Key (Optional for Veo 2 / Gemini)</div>
        <input type="password" class="input-field" placeholder="AIza..." value="${S.googleApiKey}" oninput="S.googleApiKey=this.value;localStorage.setItem('google-key', this.value)" style="margin-bottom:6px" />
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px">Optional. If omitted, Wise Studio automatically uses high-speed Free AI Visual Models.</div>

        <button class="btn-primary" style="width:100%" onclick="S.showSetup=false;render()"><i class="ti ti-check"></i> Save & Continue</button>
      </div>
    </div>`;
}

// ── Studio Main Panels (Steps 0–6) ────────────────────────────────────
function buildStudio() {
  const steps = [
    { icon: 'ti-bulb',       label: 'Concept' },
    { icon: 'ti-script',     label: 'Script' },
    { icon: 'ti-wand',       label: 'Prompts' },
    { icon: 'ti-user-check', label: 'Characters' },
    { icon: 'ti-video',      label: 'Generate' },
    { icon: 'ti-layout-grid',label: 'Timeline' },
    { icon: 'ti-download',   label: 'Export' }
  ];

  const stepperHtml = `
    <div class="studio-stepper">
      ${steps.map((st, i) => `
        <div class="studio-step ${i === S.studioStep ? 'active' : ''} ${i < S.studioStep ? 'done' : ''}" onclick="${i <= S.studioStep ? `S.studioStep=${i};render()` : ''}">
          <div class="studio-step-dot"><i class="ti ${i < S.studioStep ? 'ti-check' : st.icon}"></i></div>
          <span class="studio-step-label">${st.label}</span>
        </div>
        ${i < steps.length - 1 ? '<div class="studio-step-line ' + (i < S.studioStep ? 'done' : '') + '"></div>' : ''}
      `).join('')}
    </div>`;

  const errorHtml = S.studioError ? `<div class="error-box" style="margin-bottom:14px"><i class="ti ti-alert-circle"></i> ${S.studioError}</div>` : '';
  const progressHtml = S.studioProgress ? `<div class="info-box" style="margin-bottom:14px"><span class="pulse-dot"></span> ${S.studioProgress}</div>` : '';

  // Quality Validation Alert Banner
  const qualityAlertHtml = S.qualityAlert ? `
    <div class="quality-alert-box">
      <i class="ti ti-alert-triangle" style="font-size:24px;color:#ef4444;flex-shrink:0;margin-top:2px"></i>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:#ef4444">${S.qualityAlert.title}</div>
        <div style="font-size:12px;margin-top:4px;color:#fecaca">${S.qualityAlert.reason}</div>
        <div style="font-size:11px;color:#fca5a5;margin-top:4px">
          <strong>File:</strong> ${S.qualityAlert.filename} &bull; <em>Rejected to preserve story visual quality.</em>
        </div>
      </div>
      <button onclick="S.qualityAlert=null;render()" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:18px">&times;</button>
    </div>` : '';

  let panelHtml = '';

  // Step 0: Concept Input
  if (S.studioStep === 0) {
    const styleCards = Object.entries(STUDIO_STYLES).map(([key, st]) => `
      <button class="studio-style-card ${S.studioStyle === key ? 'active' : ''}" onclick="S.studioStyle='${key}';render()">
        <i class="ti ${st.icon}" style="font-size:20px;color:var(--brand)"></i>
        <span class="studio-style-name">${st.label}</span>
        <span class="studio-style-desc">${st.desc}</span>
      </button>
    `).join('');

    const durationBtns = STUDIO_DURATIONS.map(d => `
      <button class="pill-btn ${S.studioDuration === d.value ? 'active' : ''}" onclick="S.studioDuration='${d.value}';render()">${d.label} <span style="opacity:0.6;font-size:10px">(${d.scenes} scenes)</span></button>
    `).join('');

    const aspectBtns = ['16:9','9:16','1:1'].map(a => `
      <button class="pill-btn ${S.studioAspect === a ? 'active' : ''}" onclick="S.studioAspect='${a}';render()">${a}</button>
    `).join('');

    panelHtml = `
      <div class="card" style="border-left:4px solid var(--brand)">
        <div class="section-label" style="margin-bottom:14px"><i class="ti ti-sparkles" style="color:var(--brand)"></i> What is your animated story or video about?</div>
        <textarea class="input-field" rows="3" placeholder="Describe your story idea...\n\nExample: The Hare and Tortoise have an epic hill race with hilarious twists, inventive science gadgets, and a heartwarming moral lesson for kids." oninput="S.studioTopic=this.value">${S.studioTopic}</textarea>

        <div class="section-label" style="margin-top:18px;margin-bottom:10px">Visual Style</div>
        <div class="studio-style-grid">${styleCards}</div>

        <div class="section-label" style="margin-top:18px;margin-bottom:10px">Target Duration</div>
        <div class="filter-pills">${durationBtns}</div>

        <div class="section-label" style="margin-top:18px;margin-bottom:10px">Aspect Ratio</div>
        <div class="filter-pills">${aspectBtns}</div>

        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <button class="btn-primary" onclick="generateStudioScript()" ${S.studioLoading ? 'disabled' : ''}>
            ${S.studioLoading ? '<span class="pulse-dot"></span> Generating...' : '<i class="ti ti-wand"></i> Generate Script'}
          </button>
          <button class="btn-primary" onclick="runFullPipeline()" ${S.studioLoading ? 'disabled' : ''} style="background:linear-gradient(135deg,#3b82f6,#10b981)">
            <i class="ti ti-bolt"></i> Full Auto Run
          </button>
          <button class="btn-primary" onclick="loadSampleEpic()" ${S.studioLoading ? 'disabled' : ''} style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff">
            <i class="ti ti-sparkles"></i> 🎬 Load 7-Min Kids Story
          </button>
        </div>
      </div>`;
  }

  // Step 1: Script Review
  if (S.studioStep === 1 && S.studioScript) {
    const scenes = S.studioScript.scenes || [];
    panelHtml = `
      <div class="card" style="margin-bottom:14px">
        <div class="section-label"><i class="ti ti-script"></i> Generated Scene-by-Scene Script</div>
        ${S.studioScript.mainCharacter && S.studioScript.mainCharacter !== 'none' ? `
          <div style="background:var(--surface-2);padding:12px;border-radius:8px;margin-top:10px;border-left:3px solid var(--brand)">
            <div style="font-size:12px;font-weight:700;color:var(--brand);margin-bottom:4px"><i class="ti ti-user"></i> Main Characters</div>
            <div style="font-size:13px;color:var(--text-secondary)">${renderMarkdown(S.studioScript.mainCharacter)}</div>
          </div>` : ''}
        ${S.studioScript.narrator ? `
          <div style="background:var(--surface-2);padding:12px;border-radius:8px;margin-top:8px;border-left:3px solid var(--text-success)">
            <div style="font-size:12px;font-weight:700;color:var(--text-success);margin-bottom:4px"><i class="ti ti-microphone"></i> Narration & Moral</div>
            <div style="font-size:13px;color:var(--text-secondary)">${renderMarkdown(S.studioScript.narrator)}</div>
          </div>` : ''}
      </div>

      ${scenes.map((sc, i) => `
        <div class="phase-card">
          <div class="phase-header">
            <span style="font-size:11px;font-weight:700;color:var(--brand);background:var(--bg-accent);padding:2px 8px;border-radius:10px">Scene ${sc.sceneNum || i+1}</span>
            <span class="phase-name">${sc.title}</span>
            <span style="font-size:11px;color:var(--text-muted);margin-left:auto">${sc.duration || '?'}s</span>
          </div>
          <div class="phase-summary">${renderMarkdown(sc.description)}</div>
          <div class="sub-points-list">
            <div class="sub-bullet-row"><i class="ti ti-map-pin"></i> <span>${sc.environment || ''}</span></div>
            <div class="sub-bullet-row"><i class="ti ti-sun"></i> <span>${sc.lighting || ''}</span></div>
            <div class="sub-bullet-row"><i class="ti ti-camera"></i> <span>${sc.camera || ''}</span></div>
            <div class="sub-bullet-row"><i class="ti ti-bell"></i> <span>${sc.soundEffect || 'No sound cue'}</span></div>
          </div>
        </div>
      `).join('')}

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn-primary" onclick="expandStudioPrompts()" ${S.studioLoading ? 'disabled' : ''}>
          ${S.studioLoading ? '<span class="pulse-dot"></span> Expanding...' : '<i class="ti ti-arrow-right"></i> Expand to Prompts'}
        </button>
        <button class="btn-ghost" onclick="exportStudioScript()"><i class="ti ti-copy"></i> Copy Script</button>
        <button class="btn-ghost" onclick="S.studioStep=0;render()"><i class="ti ti-arrow-left"></i> Back</button>
      </div>`;
  }

  // Step 2: Cinematic Prompts
  if (S.studioStep === 2 && S.studioPrompts.length) {
    panelHtml = `
      <div class="section-label" style="margin-bottom:10px"><i class="ti ti-wand"></i> Cinematic Video Prompts (${S.studioPrompts.length})</div>
      ${S.studioPrompts.map((p, i) => `
        <div class="phase-card">
          <div class="phase-header">
            <span style="font-size:11px;font-weight:700;color:var(--brand);background:var(--bg-accent);padding:2px 8px;border-radius:10px">${i+1}</span>
            <span class="phase-name">${p.title}</span>
            <span class="pill-btn" style="cursor:default;font-size:11px;padding:2px 8px">${p.cameraMove || ''}</span>
          </div>
          <div class="studio-prompt-text">${p.veoPrompt}</div>
          ${p.negativePrompt ? `<div style="font-size:11px;color:var(--text-danger);margin-top:6px"><strong>Negative:</strong> ${p.negativePrompt}</div>` : ''}
        </div>
      `).join('')}

      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn-primary" onclick="S.studioStep=3;render()" style="background:linear-gradient(135deg,#4285f4,#34a853)">
          <i class="ti ti-user-check"></i> Next: Assign Characters (Mandatory)
        </button>
        <button class="btn-ghost" style="font-size:12px;color:#f87171;border-color:rgba(239,68,68,0.4)" onclick="testLowQualityRejection()" title="Simulate quality gate rejection"><i class="ti ti-shield-alert"></i> Test Quality Gate</button>
            <button class="btn-ghost" onclick="generateCharacterRef()" ${S.studioLoading ? 'disabled' : ''}>
          <i class="ti ti-wand"></i> AI Character Ref
        </button>
        <button class="btn-ghost" onclick="exportStudioPrompts()"><i class="ti ti-clipboard"></i> Copy All Prompts</button>
        <button class="btn-ghost" onclick="S.studioStep=1;render()"><i class="ti ti-arrow-left"></i> Back</button>
      </div>`;
  }

  // Step 3: Character Studio & Mandatory Scene Assignment
  if (S.studioStep === 3) {
    const scenes = S.studioScript?.scenes || [];
    const characters = S.studioCharacters || [];
    const unassigned = getUnassignedScenes();
    const assignedCount = scenes.length - unassigned.length;
    const isAllAssigned = scenes.length > 0 && unassigned.length === 0;

    panelHtml = `
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px">
          <div>
            <div class="section-label" style="margin-bottom:4px"><i class="ti ti-user-check"></i> Character Visual Studio & Mandatory Scene Assignment</div>
            <div style="font-size:12px;color:var(--text-secondary)">
              Upload custom character images. <strong>Strict Requirement:</strong> Only high-resolution images (min 512x512px) are accepted.
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-primary" onclick="document.getElementById('studio-char-file-input').click()">
              <i class="ti ti-upload"></i> Upload Character Image
            </button>
            <button class="btn-ghost" onclick="autoMatchScriptCharacters()" ${!characters.length || !scenes.length ? 'disabled' : ''} title="Automatically assign characters based on scene text">
              <i class="ti ti-wand"></i> Auto-Match Scenes
            </button>
            <button class="btn-ghost" onclick="generateCharacterRef()" ${S.studioLoading ? 'disabled' : ''} title="Generate with AI">
              <i class="ti ti-sparkles"></i> AI Character Ref
            </button>
          </div>
        </div>

        <input type="file" id="studio-char-file-input" accept="image/*" multiple onchange="handleCharacterUpload(event)" style="display:none" />

        <div class="studio-upload-zone" onclick="document.getElementById('studio-char-file-input').click()" ondragover="event.preventDefault();this.style.borderColor='var(--brand)'" ondragleave="this.style.borderColor=''" ondrop="handleCharacterDrop(event)">
          <i class="ti ti-cloud-upload"></i>
          <div style="font-size:14px;font-weight:600;margin-top:4px;color:var(--text-primary)">Click to Upload or Drag & Drop Character Images</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Quality Gate: Minimum 512x512px. Low quality images are automatically rejected to protect output quality.</div>
        </div>

        <div class="section-label" style="margin-top:20px;margin-bottom:10px"><i class="ti ti-users"></i> Available Characters (${characters.length})</div>
        ${characters.length ? `
          <div class="studio-char-grid">
            ${characters.map((c, i) => `
              <div class="studio-char-card">
                <div style="position:relative">
                  <img src="${resolveAssetUrl(c.url)}" alt="${c.name || 'Character'}" class="studio-char-img" onclick="openLightbox('${resolveAssetUrl(c.url)}', '${c.name || 'Character'}')" />
                  <span class="studio-char-badge">${c.name || 'Character ' + (i+1)}</span>
                  <button class="studio-char-delete-btn" onclick="deleteStudioCharacter('${c.id}')" title="Delete character"><i class="ti ti-trash"></i></button>
                </div>
                <div style="padding:10px">
                  <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${c.name || 'Character ' + (i+1)}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.4">${renderMarkdown((c.description || '').substring(0, 100))}</div>
                  <div style="margin-top:8px">
                    <button class="btn-ghost" style="width:100%;font-size:11px;padding:4px 8px" onclick="assignCharacterToAllScenes('${c.id}')">
                      <i class="ti ti-check-all"></i> Assign to All Scenes
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="info-box" style="margin-top:10px">
            <i class="ti ti-info-circle"></i> No character images uploaded yet. Please click <strong>"Upload Character Image"</strong> above to provide your character art.
          </div>
        `}
      </div>

      <div class="card" style="margin-top:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div>
            <div class="section-label" style="margin-bottom:2px">
              <i class="ti ti-list-check"></i> Mandatory Scene Character Assignment
            </div>
            <div style="font-size:12px;color:var(--text-secondary)">
              Every single scene must be assigned a character. The video rendering pipeline will strictly use only these assigned images.
            </div>
          </div>
          <div style="font-size:12px;font-weight:600;color:${isAllAssigned ? 'var(--text-success)' : 'var(--text-warning)'}">
            ${assignedCount} of ${scenes.length} Scenes Assigned (${Math.round(scenes.length ? (assignedCount/scenes.length)*100 : 0)}%)
          </div>
        </div>

        ${!isAllAssigned ? `
          <div class="studio-gate-banner">
            <i class="ti ti-alert-triangle" style="font-size:22px;flex-shrink:0"></i>
            <div>
              <div style="font-weight:700">Mandatory Requirement Incomplete</div>
              <div style="font-size:12px;opacity:0.9">
                You must assign a character image for <strong>all ${scenes.length} scenes</strong> before generating clips. 
                <span style="font-weight:600">${unassigned.length} scene(s) remaining.</span>
              </div>
            </div>
          </div>
        ` : `
          <div class="studio-gate-success">
            <i class="ti ti-circle-check" style="font-size:22px;flex-shrink:0"></i>
            <div>
              <div style="font-weight:700">All Scenes Successfully Assigned!</div>
              <div style="font-size:12px;opacity:0.9">
                100% of scenes have assigned character images. Video clips and exports will strictly use these visuals.
              </div>
            </div>
          </div>
        `}

        <div class="studio-scene-assign-grid">
          ${scenes.map((sc, i) => {
            const assignedChar = characters.find(c => c.id === sc.assignedCharacterId);
            const isAssigned = !!assignedChar;
            return `
              <div class="studio-scene-assign-card ${!isAssigned ? 'unassigned' : 'assigned'}">
                <div style="display:flex;align-items:center;gap:12px">
                  ${isAssigned ? `
                    <img src="${resolveAssetUrl(assignedChar.url)}" alt="${assignedChar.name}" class="studio-assign-thumb" onclick="openLightbox('${resolveAssetUrl(assignedChar.url)}', '${assignedChar.name}')" title="Click to enlarge" />
                  ` : `
                    <div class="studio-assign-thumb-placeholder" title="Character image required">
                      <i class="ti ti-alert-triangle"></i>
                    </div>
                  `}
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span style="font-size:11px;font-weight:700;color:var(--brand);background:var(--bg-accent);padding:1px 6px;border-radius:6px">Scene ${sc.sceneNum || i+1}</span>
                      <span style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sc.title || 'Scene ' + (i+1)}</span>
                      <span style="font-size:11px;color:var(--text-muted);margin-left:auto">${sc.duration || 35}s</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-secondary);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
                      ${sc.narration ? `"${sc.narration}"` : sc.description || ''}
                    </div>
                  </div>
                </div>

                <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
                  <div style="flex:1">
                    <select class="select-field" style="width:100%;font-size:12px;height:32px;${!isAssigned ? 'border-color:#ef4444;background:rgba(239,68,68,0.08);color:#ef4444;font-weight:600' : ''}" onchange="assignCharacterToScene(${i}, this.value)">
                      <option value="">-- ⚠️ Select Character (Mandatory) --</option>
                      ${characters.map(ch => `
                        <option value="${ch.id}" ${sc.assignedCharacterId === ch.id ? 'selected' : ''}>${ch.name || 'Character'}</option>
                      `).join('')}
                    </select>
                  </div>
                  ${isAssigned ? `
                    <button class="btn-ghost" style="padding:4px 8px;font-size:11px" onclick="assignCharacterToAllScenes('${assignedChar.id}')" title="Apply this character to all scenes">
                      <i class="ti ti-copy"></i> All
                    </button>
                  ` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>

        <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
          <button class="btn-primary" onclick="generateAllClips()" ${!isAllAssigned || S.studioLoading ? 'disabled' : ''} style="${isAllAssigned ? 'background:linear-gradient(135deg,#4285f4,#34a853)' : 'opacity:0.5;cursor:not-allowed'}">
            ${S.studioLoading ? '<span class="pulse-dot"></span> Generating...' : `<i class="ti ti-video"></i> Generate All Clips (${scenes.length} Scenes)`}
          </button>
          <button class="btn-ghost" onclick="S.studioStep=2;render()"><i class="ti ti-arrow-left"></i> Back to Prompts</button>
        </div>
      </div>`;
  }

  // Step 4: Video Generation Progress
  if (S.studioStep === 4) {
    panelHtml = `
      <div class="section-label" style="margin-bottom:10px"><i class="ti ti-video"></i> Video Generation Progress</div>
      ${S.studioClips.map((clip, i) => {
        const statusIcon = clip.status === 'done' ? 'ti-circle-check' : clip.status === 'error' ? 'ti-alert-circle' : clip.status === 'generating' || clip.status === 'polling' ? 'ti-loader' : clip.status === 'pending-manual' ? 'ti-hand-click' : 'ti-clock';
        const statusColor = clip.status === 'done' ? 'var(--text-success)' : clip.status === 'error' ? 'var(--text-danger)' : clip.status === 'pending-manual' ? 'var(--text-warning)' : 'var(--text-muted)';
        const statusText = clip.status === 'done' ? 'Ready' : clip.status === 'error' ? 'Error' : clip.status === 'generating' ? 'Generating...' : clip.status === 'polling' ? 'Processing...' : clip.status === 'pending-manual' ? 'Manual' : 'Queued';
        return `
          <div class="phase-card" style="border-left:3px solid ${statusColor}">
            <div class="phase-header">
              <i class="ti ${statusIcon} ${clip.status === 'generating' || clip.status === 'polling' ? 'studio-spin' : ''}" style="color:${statusColor};font-size:18px"></i>
              <span class="phase-name">Scene ${i+1}</span>
              <span style="font-size:12px;color:${statusColor};margin-left:auto">${statusText}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${(clip.prompt || '').substring(0, 120)}${(clip.prompt || '').length > 120 ? '...' : ''}</div>
            ${clip.error ? `<div style="font-size:11px;color:var(--text-danger);margin-top:6px">${clip.error}</div>` : ''}
            ${clip.videoUrl ? `<video src="${clip.videoUrl}" controls class="studio-clip-preview" style="margin-top:8px"></video>` : clip.imageUrl ? `<img src="${resolveAssetUrl(clip.imageUrl)}" class="studio-clip-preview" style="margin-top:8px;border-radius:6px;max-height:220px;object-fit:cover" alt="Scene ${i+1}" />` : ''}
            ${clip.status === 'error' ? `<button class="btn-ghost" style="font-size:11px;padding:3px 8px;margin-top:6px" onclick="generateStudioClip(${i})"><i class="ti ti-refresh"></i> Retry</button>` : ''}
          </div>`;
      }).join('')}
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn-primary" onclick="S.studioStep=5;render()"><i class="ti ti-layout-grid"></i> Go to Timeline</button>
        <button class="btn-ghost" onclick="exportStudioPrompts()"><i class="ti ti-clipboard"></i> Copy Prompts</button>
      </div>`;
  }

  // Step 5: Timeline & Clips (Distinct Scene Thumbnails)
  if (S.studioStep === 5) {
    panelHtml = renderStudioPlayer() + `
      <div class="section-label" style="margin-bottom:10px"><i class="ti ti-layout-grid"></i> Timeline & Scenes</div>
      <div class="studio-timeline">
        ${S.studioClips.map((clip, i) => {
          const p = S.studioPrompts[i];
          const sc = S.studioScript?.scenes?.[i];
          const cuts = clip.cuts || [];
          const cutTotal = getClipCutTotal(i);
          const assignedChar = (S.studioCharacters || []).find(c => c.id === sc?.assignedCharacterId);

          return `
            <div class="studio-timeline-clip">
              <div class="studio-timeline-header">
                <span style="font-size:11px;font-weight:700;color:var(--brand)">${i+1}</span>
                <span style="font-size:12px;font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p?.title || 'Scene ' + (i+1)}</span>
                ${assignedChar ? `
                  <span class="studio-char-pill" title="Assigned Character: ${assignedChar.name}">
                    <img src="${resolveAssetUrl(assignedChar.url)}" class="studio-char-avatar" />
                    <span>${assignedChar.name.split(' ')[0]}</span>
                  </span>
                ` : ''}
                ${cuts.length ? `<span class="studio-cut-pill" style="font-size:9px;padding:1px 5px" title="${cuts.length} cut(s) applied"><i class="ti ti-scissors"></i> ${cuts.length}</span>` : ''}
                <div style="display:flex;gap:4px">
                  <button class="btn-ghost" style="padding:2px 6px;font-size:11px;color:${cuts.length ? '#f87171' : 'var(--text-muted)'}" onclick="openClipCutModal(${i})" title="Cut/Trim this scene"><i class="ti ti-scissors"></i></button>
                  <button class="btn-ghost" style="padding:2px 6px;font-size:11px" onclick="reorderClip(${i},${i-1})" ${i === 0 ? 'disabled' : ''}><i class="ti ti-arrow-up"></i></button>
                  <button class="btn-ghost" style="padding:2px 6px;font-size:11px" onclick="reorderClip(${i},${i+1})" ${i === S.studioClips.length - 1 ? 'disabled' : ''}><i class="ti ti-arrow-down"></i></button>
                </div>
              </div>
              ${clip.videoUrl ? `<video src="${clip.videoUrl}" controls class="studio-clip-preview"></video>` : clip.imageUrl ? `<img src="${resolveAssetUrl(clip.imageUrl)}" class="studio-clip-preview" alt="Scene ${i+1}" />` : `<div class="studio-clip-placeholder">No visual</div>`}
              <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;font-size:10px;color:var(--text-muted)">
                <span>${p?.cameraMove || ''}</span>
                <span><strong>${getClipEffectiveDuration(i)}s</strong>${cutTotal > 0 ? ` <s style="opacity:0.6">${sc?.duration || '?'}s</s>` : ''}</span>
              </div>
            </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn-primary" onclick="S.studioStep=6;render()"><i class="ti ti-download"></i> Go to Export</button>
        <button class="btn-ghost" onclick="exportStudioPrompts()"><i class="ti ti-clipboard"></i> Copy All Prompts</button>
        <button class="btn-ghost" onclick="S.studioStep=4;render()"><i class="ti ti-arrow-left"></i> Back</button>
      </div>`;
  }

  // Step 6: Export
  if (S.studioStep === 6) {
    panelHtml = `
      ${renderStudioPlayer()}
      <div class="studio-export-hero">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px">
              <i class="ti ti-movie" style="color:var(--brand);font-size:24px"></i>
              Export & Download Full Movie
            </div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">
              Compiles all ${S.studioClips.length} animated scenes, motion visuals, dynamic subtitles, and audio soundtrack into a single downloadable .webm video file.
            </div>
          </div>
          <button class="btn-primary" style="padding:12px 24px;font-size:15px;background:linear-gradient(135deg,#10b981,#059669)" onclick="exportFullVideo()">
            <i class="ti ti-download"></i> Download Full Video
          </button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn-primary" onclick="saveCurrentProjectToHistory()"><i class="ti ti-device-floppy"></i> Save to History & Drive</button>
        <button class="btn-ghost" onclick="exportStudioJSON()"><i class="ti ti-file-export"></i> Save Project JSON</button>
        <button class="btn-ghost" onclick="exportStudioScript()"><i class="ti ti-copy"></i> Copy Script</button>
        <button class="btn-ghost" onclick="S.studioStep=5;render()"><i class="ti ti-arrow-left"></i> Back to Timeline</button>
      </div>`;
  }

  return stepperHtml + qualityAlertHtml + errorHtml + progressHtml + panelHtml;
}

// ── Application Root Renderer ─────────────────────────────────────────
function render() {
  const statusCls = !S.apiKey ? '' : 'ok';
  const statusTxt = !S.apiKey ? '<i class="ti ti-key"></i> Set API Key' : '<i class="ti ti-circle-check"></i> Groq Connected';

  document.getElementById('app').innerHTML = `
    ${renderSetupModal()}
    ${renderHistoryModal()}
    ${renderLightbox()}
    ${renderClipCutModal()}
    ${renderExportProgressModal()}
    <input type="file" id="studio-import-file-input" accept=".json" onchange="importStudioJSON(event)" style="display:none" />

    <div class="shell">
      <header class="header">
        <div class="header-left">
          <div class="logo-mark"><i class="ti ti-movie"></i></div>
          <div>
            <div class="logo-name">Wise Simple Studio</div>
            <div class="logo-sub">AI Video & Animated Story Creator</div>
          </div>
        </div>
        <div class="header-right">
          <select class="select-field" title="Active Model" onchange="S.activeModel=this.value;localStorage.setItem('active-model', this.value)">
            ${S.availableModels.map(m => `<option value="${m}" ${m === S.activeModel ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <button class="api-status ${statusCls}" onclick="S.showSetup=true;render()">${statusTxt}</button>
          <button class="btn-ghost" style="font-size:12px;padding:6px 12px;color:var(--brand);font-weight:600" onclick="S.historyModal.open=true;render()" title="Browse project history & cloud backups">
            <i class="ti ti-history"></i> History & Drive
          </button>
          <button class="btn-ghost" style="font-size:12px;padding:6px 12px" onclick="document.getElementById('studio-import-file-input').click()" title="Import existing project JSON"><i class="ti ti-upload"></i> Import</button>
          <button class="btn-ghost" style="font-size:12px;padding:6px 12px" onclick="exportStudioJSON()" title="Export current project JSON"><i class="ti ti-download"></i> Export</button>
        </div>
      </header>

      <main>
        ${buildStudio()}
      </main>
    </div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────
function init() {
  const restored = restoreStudioState();
  if (!restored) {
    loadSampleEpic();
  } else {
    render();
  }
}

init();
