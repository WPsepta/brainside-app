/* ═══════════════════════════════════════════════════════════════
   ai-models.js — Shared AI Model Picker (v25)
   - HANYA provider "opencode"
   - Ikon brand asli via Simple Icons (hanya brand yang aktif)
   - Tombol X (tutup) di header
   - Label provider "Brain Side" (tanpa badge count)
   - Tanpa instruksi output file
   - Fallback endpoint (127.0.0.1:4096 / septa)
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_OPENCODE_ENDPOINT = 'http://127.0.0.1:4096';
const DEFAULT_OPENCODE_APIKEY   = 'septa';

const ONLY_PROVIDER_ID = 'opencode';
const PROVIDER_LABEL   = 'Brain Side';

export const DEFAULT_OPENCODE_MODEL = {
  id: 'oc-default',
  name: 'OpenCode Default',
  description: 'Default OpenCode',
  isActive: true,
  order: 1,
  provider: 'opencode',
  endpoint: DEFAULT_OPENCODE_ENDPOINT,
  apiKey: DEFAULT_OPENCODE_APIKEY,
  providerID: '',
  modelID: '',
  reasoning: false,
  attachment: false
};

export const DEFAULT_MODEL = DEFAULT_OPENCODE_MODEL;

const LS_MODELS    = 'bs_models_v2';
const LS_KEYS      = 'bs_keys_v2';
const LS_ACTIVE    = 'bs_ai_active_model_v1';
const LS_PROVIDERS = 'bs_providers_v1';

const _state = {
  models: [],
  allModels: [],
  activeModelId: null,
  adapter: null,
  onChange: null,
  allowedProviders: null,
  excludeProviders: null,
  mounted: false,
  openAnchor: null,
  remoteProviders: [],
  remoteLoaded: false,
  sendFormat: null
};

/* ═══════════════════════════════════════════════════════════════
   IKON BRAND — hanya brand yang dipakai di server OpenCode
   ═══════════════════════════════════════════════════════════════ */

const _BRAND_MAP = {
  'ling':      { letter: 'L', bg: '#EC4899' },
  'longcat':   { letter: 'L', bg: '#06B6D4' },
  'space':     { letter: 'S', bg: '#A855F7' },
  'bunny':     { letter: 'B', bg: '#EC4899' },
  'mimo':      { slug: 'xiaomi', color: 'FF6900' },
  'nemotron':  { slug: 'nvidia', color: '76B900' },
  'pickle':    { letter: 'P', bg: '#22C55E' },
  'muse':      { letter: 'M', bg: '#F59E0B' }
};

function _resolveIcon(family, name, modelID) {
  const f = String(family || '').toLowerCase().trim();
  const n = String(name || '').toLowerCase();
  const mid = String(modelID || '').toLowerCase();
  if (_BRAND_MAP[f]) return _BRAND_MAP[f];
  const keys = Object.keys(_BRAND_MAP);
  for (let i = 0; i < keys.length; i++) if (f.indexOf(keys[i]) !== -1) return _BRAND_MAP[keys[i]];
  for (let i = 0; i < keys.length; i++) if (n.indexOf(keys[i]) !== -1) return _BRAND_MAP[keys[i]];
  for (let i = 0; i < keys.length; i++) if (mid.indexOf(keys[i]) !== -1) return _BRAND_MAP[keys[i]];
  const letter = (name && name.trim() ? name.trim()[0] : '?').toUpperCase();
  return { letter: letter, bg: '#4a4a52' };
}

function _iconHTML(family, name, modelID) {
  const icon = _resolveIcon(family, name, modelID);
  if (icon.slug) {
    const url = 'https://cdn.simpleicons.org/' + icon.slug + '/' + icon.color;
    const letter = (name && name.trim() ? name.trim()[0] : '?').toUpperCase();
    return '<span class="model-icon-wrap">' +
             '<img class="model-icon-img" src="' + url + '" alt="" loading="lazy" ' +
                  'onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" />' +
             '<span class="model-icon-fb" style="display:none;background:#4a4a52">' + letter + '</span>' +
           '</span>';
  }
  return '<span class="model-icon-wrap">' +
           '<span class="model-icon-fb" style="display:flex;background:' + (icon.bg || '#4a4a52') + '">' + icon.letter + '</span>' +
         '</span>';
}

/* ═══════════════════════════════════════════════════════════════
   ADAPTER
   ═══════════════════════════════════════════════════════════════ */

function _filterAllowed(arr) {
  let out = arr.slice();
  if (_state.allowedProviders) out = out.filter(m => _state.allowedProviders.includes(m.provider));
  if (_state.excludeProviders) out = out.filter(m => !_state.excludeProviders.includes(m.provider));
  return out;
}
function _defaultSeed() { return [DEFAULT_OPENCODE_MODEL]; }
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function _defaultAdapter() {
  return {
    async get() {
      try {
        const raw = localStorage.getItem(LS_MODELS);
        if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
      } catch (_) {}
      return null;
    },
    async set(models) { try { localStorage.setItem(LS_MODELS, JSON.stringify(models)); } catch (_) {} },
    async getKeys() {
      try {
        const raw = localStorage.getItem(LS_KEYS);
        if (raw) {
          const d = JSON.parse(raw);
          return { apiKeys: Array.isArray(d.apiKeys) ? d.apiKeys : [], endpoints: Array.isArray(d.endpoints) ? d.endpoints : [] };
        }
      } catch (_) {}
      return { apiKeys: [], endpoints: [] };
    },
    async setKeys(keys) { try { localStorage.setItem(LS_KEYS, JSON.stringify(keys)); } catch (_) {} },
    async getActiveId() { try { return localStorage.getItem(LS_ACTIVE) || null; } catch (_) { return null; } },
    async setActiveId(id) { try { id ? localStorage.setItem(LS_ACTIVE, id) : localStorage.removeItem(LS_ACTIVE); } catch (_) {} }
  };
}

/* ═══════════════════════════════════════════════════════════════
   FETCH PROVIDERS — hanya "opencode"
   ═══════════════════════════════════════════════════════════════ */

function _getEndpointAndAuth() {
  const m = getActiveModel() || DEFAULT_OPENCODE_MODEL;
  const endpoint = (m.endpoint || DEFAULT_OPENCODE_ENDPOINT).replace(/\/+$/, '');
  const apiKey = m.apiKey || DEFAULT_OPENCODE_APIKEY;
  return { endpoint, apiKey };
}

async function _fetchProviders() {
  const { endpoint, apiKey } = _getEndpointAndAuth();
  if (!endpoint) throw new Error('Endpoint OpenCode belum diatur di Profile.');

  const headers = { 'accept': 'application/json' };
  if (apiKey) headers.authorization = 'Basic ' + btoa('opencode:' + apiKey);

  const res = await fetch(endpoint + '/provider', { headers });
  if (!res.ok) throw new Error('Gagal fetch /provider (HTTP ' + res.status + ')');
  const data = await res.json();

  const list = data.all || data.providers || data || [];
  const providers = [];

  list.forEach(p => {
    if (!p || !p.id) return;
    // ⭐ Filter: cuma provider "opencode"
    if (p.id !== ONLY_PROVIDER_ID) return;

    const modelsArr = [];
    const modelsMap = p.models || {};
    Object.keys(modelsMap).forEach(mid => {
      const mm = modelsMap[mid] || {};
      if (mm.status === 'deprecated') return;
      modelsArr.push({
        providerID: p.id,
        providerName: p.name || p.id,
        modelID: mm.id || mid,
        name: mm.name || mid,
        family: mm.family || '',
        reasoning: !!(mm.capabilities && mm.capabilities.reasoning),
        attachment: !!(mm.capabilities && mm.capabilities.attachment),
        context: (mm.limit && mm.limit.context) || 0,
        cost: mm.cost || null
      });
    });
    if (modelsArr.length) {
      providers.push({
        id: p.id,
        name: p.name || p.id,
        source: p.source || '',
        models: modelsArr
      });
    }
  });

  _state.remoteProviders = providers;
  _state.remoteLoaded = true;
  try { localStorage.setItem(LS_PROVIDERS, JSON.stringify(providers)); } catch (_) {}
  return providers;
}

function _loadProvidersFromCache() {
  try {
    const raw = localStorage.getItem(LS_PROVIDERS);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) {
      const filtered = arr.filter(p => p && p.id === ONLY_PROVIDER_ID);
      if (filtered.length) {
        _state.remoteProviders = filtered;
        _state.remoteLoaded = true;
        return filtered;
      }
    }
  } catch (_) {}
  return null;
}

export async function refreshRemoteProviders() { return await _fetchProviders(); }
export function getRemoteProviders() { return _state.remoteProviders.slice(); }
export function getAllRemoteModels() {
  const out = [];
  _state.remoteProviders.forEach(p => { p.models.forEach(m => out.push(m)); });
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */

export async function initModelPicker(opts = {}) {
  _state.adapter = opts.adapter || _defaultAdapter();
  _state.onChange = opts.onChange || null;
  _state.allowedProviders = Array.isArray(opts.allowedProviders) && opts.allowedProviders.length ? opts.allowedProviders.slice() : null;
  _state.excludeProviders = Array.isArray(opts.excludeProviders) && opts.excludeProviders.length ? opts.excludeProviders.slice() : null;

  _loadProvidersFromCache();
  _state.models = await loadModels();
  const storedActive = await _state.adapter.getActiveId();
  _state.activeModelId = storedActive || (_state.models[0] && _state.models[0].id) || null;

  injectStyles();
  injectDOM();
  attachEvents();
  renderAllModelBtns();
  _state.mounted = true;
}

export function getModels() { return _filterAllowed(_state.models).filter(m => m.isActive !== false); }
export function getAllModels() { return _state.allModels.slice(); }
export function getActiveModelId() { return _state.activeModelId; }

export function getActiveModel() {
  const pool = _filterAllowed(_state.models);
  let id = _state.activeModelId;
  let found = pool.find(x => x.id === id);
  if (!found) found = pool.find(x => x.isActive !== false) || pool[0];
  if (!found) found = _defaultSeed()[0];
  return found;
}

export function renderAllModelBtns() { document.querySelectorAll('.model-btn').forEach(renderModelBtn); }

export async function refreshModels() {
  _state.models = await loadModels();
  renderAllModelBtns();
  const pop = document.getElementById('modelPopover');
  if (pop && pop.classList.contains('show')) renderSheetList();
}

export async function setActiveModel(id, opts = {}) {
  const target = _state.allModels.find(x => x.id === id) || _state.models.find(x => x.id === id);
  if (!target) return;
  if (_state.allowedProviders && !_state.allowedProviders.includes(target.provider)) return;
  if (_state.excludeProviders && _state.excludeProviders.includes(target.provider)) return;
  _state.activeModelId = id;
  try { if (_state.adapter && _state.adapter.setActiveId) await _state.adapter.setActiveId(id); } catch (_) {}
  renderAllModelBtns();
  if (_state.onChange) { try { _state.onChange(target); } catch (_) {} }
  if (opts.onChange) { try { opts.onChange(target); } catch (_) {} }
}

export async function saveModelsToStorage(models) {
  const normalized = normalizeModels(models);
  if (_state.adapter && _state.adapter.set) {
    try { await _state.adapter.set(normalized); } catch (_) {}
  }
  _state.allModels = normalized;
  _state.models = _filterAllowed(normalized);
}

/* ═══════════════════════════════════════════════════════════════
   ASK AI
   ═══════════════════════════════════════════════════════════════ */

export async function askAIDynamic(model, message, conversationId, guestId, files, callbacks) {
  if (!model) model = getActiveModel();
  const provider = model.provider || 'opencode';
  if (provider === 'opencode') return await askOpenCode(model, message, conversationId, guestId, files, callbacks);
  throw new Error('Provider "' + provider + '" belum didukung.');
}

function _parseOpenCodeResponse(data) {
  let reply = '';
  const outFiles = [];
  if (typeof data === 'string') return { reply: data, files: outFiles };
  if (Array.isArray(data && data.parts)) {
    data.parts.forEach(p => {
      if (!p) return;
      if (p.type === 'reasoning' || p.type === 'thinking') return;
      if (p.type === 'text' || p.type === 'text-delta') { reply += p.text || p.delta || ''; return; }
      if (p.type === 'file' || p.type === 'image' || p.type === 'attachment') {
        const url = p.url || p.dataUrl || p.src || p.content;
        if (!url) return;
        const mime = p.mime || p.mimeType || p.contentType || (p.type === 'image' ? 'image/png' : 'application/octet-stream');
        const name = p.filename || p.name || (String(mime).indexOf('image/') === 0 ? 'image.png' : 'file');
        if (String(mime).indexOf('image/') === 0) reply += '\n\n![' + name + '](' + url + ')';
        else outFiles.push({ name, type: mime, dataUrl: url, size: p.size || 0 });
        return;
      }
      if (p.type === 'tool' && p.state && Array.isArray(p.state.output)) {
        p.state.output.forEach(o => { if (o && o.type === 'text' && o.text) reply += o.text; });
      }
    });
    return { reply, files: outFiles };
  }
  if (data && data.content) return { reply: String(data.content), files: outFiles };
  if (data && data.reply) return { reply: typeof data.reply === 'string' ? data.reply : JSON.stringify(data.reply), files: outFiles };
  if (data && data.message && data.message.content) {
    const c = data.message.content;
    if (Array.isArray(c)) { c.forEach(x => { if (x && x.text) reply += x.text; }); return { reply, files: outFiles }; }
    return { reply: String(c), files: outFiles };
  }
  return { reply: JSON.stringify(data), files: outFiles };
}

function _isTextFile(filename, mimeType) {
  const name = String(filename || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (mime.indexOf('text/') === 0) return true;
  if (['application/json','application/xml','application/javascript','application/x-javascript','application/x-yaml','application/yaml','application/x-sh','application/sql'].indexOf(mime) !== -1) return true;
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  const ext = name.slice(dot + 1);
  const TEXT_EXTS = ['txt','md','markdown','rst','log','csv','tsv','json','xml','yaml','yml','toml','ini','cfg','conf','env','properties','js','mjs','cjs','jsx','ts','tsx','py','pyw','rb','php','go','rs','java','kt','kts','scala','swift','c','cc','cpp','cxx','h','hh','hpp','cs','m','mm','dart','lua','pl','pm','r','jl','ex','exs','erl','hs','sh','bash','zsh','fish','ksh','bat','cmd','ps1','psm1','html','htm','xhtml','css','scss','sass','less','styl','sql','graphql','gql','prisma','gradle','makefile','mk','dockerfile','gitignore','editorconfig','svg','vtt','srt','tex','bib'];
  return TEXT_EXTS.indexOf(ext) !== -1;
}

function _buildOpenCodeParts(message, files) {
  const parts = [];
  const text = (message || '').trim();
  if (text) parts.push({ type: 'text', text });
  if (Array.isArray(files) && files.length) {
    files.forEach(f => {
      if (!f || !f.dataUrl) return;
      const isImage = f.type && f.type.indexOf('image/') === 0;
      const isText = _isTextFile(f.name, f.type);
      let mime = f.type || 'application/octet-stream';
      if (isText) mime = 'text/plain';
      parts.push({ type: 'file', mime, filename: f.name || 'file', url: f.dataUrl });
      if (isImage) {
        parts.push({ type: 'text', text: '[User melampirkan gambar: ' + (f.name || 'image') + ']' });
      } else {
        const sizeKB = (((f.size || 0) / 1024).toFixed(1)) + ' KB';
        const note = isText
          ? '[User melampirkan file teks: ' + (f.name || 'file') + ' (' + sizeKB + '). Baca isi teks di bawah ini sebagai konteks.]'
          : '[User melampirkan file: ' + (f.name || 'file') + ' (' + (f.type || '?') + ', ' + sizeKB + ')]';
        parts.push({ type: 'text', text: note });
      }
    });
  }
  if (!parts.length) parts.push({ type: 'text', text: text || '' });
  return parts;
}

function _buildBodiesWithModel(baseParts, model) {
  const bodies = [];
  if (!model || !model.providerID || !model.modelID) {
    bodies.push({ parts: baseParts });
    return bodies;
  }
  bodies.push({ parts: baseParts, model: { providerID: model.providerID, modelID: model.modelID } });
  bodies.push({ parts: baseParts, providerID: model.providerID, modelID: model.modelID });
  bodies.push({ parts: baseParts, model: model.providerID + '/' + model.modelID });
  return bodies;
}

async function _postMessage(endpoint, sessionId, headers, body) {
  const res = await fetch(endpoint + '/session/' + sessionId + '/message', {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  const rawText = await res.text();
  let data; try { data = JSON.parse(rawText); } catch (_) { data = rawText; }
  return { ok: res.ok, status: res.status, data, rawText };
}

async function askOpenCode(model, message, conversationId, guestId, files, callbacks) {
  const endpoint = (model.endpoint || DEFAULT_OPENCODE_ENDPOINT).replace(/\/+$/, '');
  if (!endpoint) throw new Error('Endpoint OpenCode belum diatur.');

  const headers = { 'content-type': 'application/json' };
  const apiKey = model.apiKey || DEFAULT_OPENCODE_APIKEY;
  if (apiKey) headers.authorization = 'Basic ' + btoa('opencode:' + apiKey);

  let sessionId = conversationId || null;
  if (!sessionId) {
    const resS = await fetch(endpoint + '/session', {
      method: 'POST', headers, body: JSON.stringify({ title: 'Brain Side' })
    });
    if (!resS.ok) throw new Error('Gagal buat sesi OpenCode (HTTP ' + resS.status + ')');
    const dataS = await resS.json();
    sessionId = dataS.id || dataS.sessionId || (dataS.session && dataS.session.id);
    if (!sessionId) throw new Error('Response OpenCode tidak berisi session id');
  }

  const parts = _buildOpenCodeParts(message, files);
  const bodies = _buildBodiesWithModel(parts, model);
  const formatsToTry = _state.sendFormat !== null ? [_state.sendFormat] : [0, 1, 2];
  let lastErr = null, success = null;

  for (const fmtIdx of formatsToTry) {
    if (!bodies[fmtIdx]) continue;
    try {
      const r = await _postMessage(endpoint, sessionId, headers, bodies[fmtIdx]);
      if (r.ok) { _state.sendFormat = fmtIdx; success = r; break; }
      lastErr = new Error(typeof r.data === 'string' ? r.data : (r.data.error || r.data.message || 'HTTP ' + r.status));
      if (r.status === 401 || r.status === 403) break;
    } catch (e) { lastErr = e; }
  }

  if (!success) throw lastErr || new Error('Semua format gagal.');
  const parsed = _parseOpenCodeResponse(success.data);
  if (typeof (callbacks || {}).onDone === 'function') { try { callbacks.onDone(); } catch (_) {} }
  return { reply: parsed.reply || '(kosong)', conversationId: sessionId, files: parsed.files || [] };
}

/* ═══════════════════════════════════════════════════════════════
   LOAD / SAVE
   ═══════════════════════════════════════════════════════════════ */

async function loadModels() {
  let arr = null, hasFetched = false;
  if (_state.adapter && typeof _state.adapter.get === 'function') {
    try {
      const r = await _state.adapter.get();
      if (Array.isArray(r)) { arr = r; hasFetched = true; }
    } catch (_) {}
  }
  if (hasFetched) {
    const normalized = normalizeModels(arr);
    if (!normalized.length) {
      const seed = normalizeModels(_defaultSeed());
      _state.allModels = seed;
      if (_state.adapter && typeof _state.adapter.set === 'function') { try { await _state.adapter.set(seed); } catch (_) {} }
      return _filterAllowed(seed);
    }
    _state.allModels = normalized;
    return _filterAllowed(normalized);
  }
  const seed = normalizeModels(_defaultSeed());
  _state.allModels = seed;
  if (_state.adapter && typeof _state.adapter.set === 'function') { try { await _state.adapter.set(seed); } catch (_) {} }
  return seed;
}

function normalizeModels(arr) {
  return (arr || [])
    .filter(m => m && m.provider === 'opencode')
    .map((m, i) => ({
      id: m.id || ('m_' + i + '_' + Date.now()),
      name: m.name || ('Model ' + (i + 1)),
      description: m.description || '',
      isActive: m.isActive !== false,
      order: typeof m.order === 'number' ? m.order : i,
      iconEmoji: m.iconEmoji || '🤖',
      provider: 'opencode',
      endpoint: m.endpoint || DEFAULT_OPENCODE_ENDPOINT,
      apiKey: m.apiKey || DEFAULT_OPENCODE_APIKEY,
      providerID: m.providerID || '',
      modelID: m.modelID || '',
      reasoning: !!m.reasoning,
      attachment: !!m.attachment
    }));
}

export async function getStoredKeys() {
  if (_state.adapter && _state.adapter.getKeys) { try { return await _state.adapter.getKeys(); } catch (_) {} }
  return { apiKeys: [], endpoints: [] };
}

/* ═══════════════════════════════════════════════════════════════
   UI
   ═══════════════════════════════════════════════════════════════ */

function injectStyles() {
  if (document.getElementById('aiModelsStyles')) return;
  const s = document.createElement('style');
  s.id = 'aiModelsStyles';
  s.textContent = `
.model-btn{height:32px;padding:0 8px 0 5px;border-radius:16px;display:flex;align-items:center;gap:6px;color:#8a8a92;background:#0f0f12;border:1px solid rgba(255,255,255,.08);cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;flex-shrink:0;max-width:170px}
.model-btn:hover{color:#fff;background:#1a1a1d}
.model-btn-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.model-btn-caret{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:2.5;flex-shrink:0;opacity:.7}
.model-btn .model-icon-wrap{width:22px;height:22px}
.model-btn .model-icon-img{width:18px;height:18px}
.model-btn .model-icon-fb{width:20px;height:20px;font-size:11px}
.model-icon-wrap{width:26px;height:26px;flex-shrink:0;display:grid;place-items:center;border-radius:7px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);overflow:hidden;position:relative}
.model-icon-img{width:20px;height:20px;object-fit:contain;display:block}
.model-icon-fb{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;line-height:1;text-transform:uppercase}
.model-popover{position:fixed;z-index:1500;width:340px;max-width:calc(100vw - 32px);min-width:280px;padding:6px;border-radius:18px;background:#1a1a1d;border:1px solid rgba(255,255,255,.08);box-shadow:0 16px 40px rgba(0,0,0,.7);opacity:0;transform:translateY(12px) scale(.92);transform-origin:bottom left;pointer-events:none;transition:opacity .28s,transform .36s;max-height:min(75vh,560px);display:flex;flex-direction:column;overflow:hidden}
.model-popover.show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.model-popover-head{padding:8px 10px 6px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;min-height:36px}
.model-popover-title{font-size:11px;font-weight:800;color:#6a6a72;letter-spacing:.06em;text-transform:uppercase}
.model-close-btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#8a8a92;cursor:pointer;padding:0;transition:background .15s,color .15s}
.model-close-btn:hover{background:rgba(255,255,255,.12);color:#fff}
.model-close-btn svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round}
.model-popover-list{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px;flex:1}
.model-popover-status{padding:16px 12px;font-size:11.5px;color:#6a6a72;text-align:center;line-height:1.5}
.model-popover-status.err{color:#ff5f57}
.model-popover-status b{color:#8a8a92}
.model-provider-label{padding:8px 12px 4px;font-size:10px;font-weight:800;color:#4a4a52;letter-spacing:.08em;text-transform:uppercase;position:sticky;top:0;background:#1a1a1d;z-index:1}
.model-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;cursor:pointer;background:transparent;border:none;width:100%;text-align:left;font-family:inherit;margin-bottom:1px}
.model-item:hover{background:#222226}
.model-item.active{background:rgba(10,132,255,.14)}
.model-item-body{flex:1;min-width:0}
.model-item-name{font-size:12.5px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.model-item-desc{font-size:10.5px;color:#6a6a72;margin-top:3px;display:flex;gap:6px;align-items:center}
.model-tag{display:inline-flex;padding:1px 6px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.04em}
.model-tag.r{background:rgba(255,149,0,.18);color:#ff9500;border:1px solid rgba(255,149,0,.35)}
.model-tag.v{background:rgba(52,199,89,.18);color:#34c759;border:1px solid rgba(52,199,89,.35)}
.model-item-check{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;color:#0a84ff;opacity:0}
.model-item.active .model-item-check{opacity:1}
.model-item-check svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.6}
`;
  document.head.appendChild(s);
}

function injectDOM() {
  if (document.getElementById('modelPopover')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="model-popover" id="modelPopover">' +
      '<div class="model-popover-head">' +
        '<div class="model-popover-title">Pilih Model</div>' +
        '<button class="model-close-btn" id="modelCloseBtn" type="button" title="Tutup"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div>' +
      '<div class="model-popover-list" id="modelPopoverList"></div>' +
    '</div>';
  document.body.appendChild(wrap.firstElementChild);

  const btn = document.getElementById('modelCloseBtn');
  if (btn) btn.addEventListener('click', function(e) {
    e.stopPropagation();
    closeModelSheet();
  });
}

function attachEvents() {
  const pop = document.getElementById('modelPopover');
  if (!pop) return;
  pop.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', e => {
    if (!pop.classList.contains('show')) return;
    if (pop.contains(e.target) || e.target.closest('.model-btn')) return;
    closeModelSheet();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop.classList.contains('show')) closeModelSheet(); });
  document.addEventListener('click', e => {
    const btn = e.target.closest('.model-btn');
    if (!btn) return;
    e.stopPropagation();
    if (pop.classList.contains('show') && _state.openAnchor === btn) { closeModelSheet(); return; }
    openModelSheet(btn);
  }, true);
}

function renderModelBtn(btn) {
  const m = getActiveModel();
  const name = btn.querySelector('.model-btn-name');
  let iconWrap = btn.querySelector('.model-icon-wrap');
  const oldIcon = btn.querySelector('.model-btn-icon');
  if (oldIcon) oldIcon.remove();
  if (!iconWrap) {
    const holder = document.createElement('span');
    holder.innerHTML = _iconHTML('', m.name, m.modelID);
    iconWrap = holder.firstElementChild;
    btn.insertBefore(iconWrap, btn.firstChild);
  } else {
    const holder = document.createElement('span');
    holder.innerHTML = _iconHTML('', m.name, m.modelID);
    iconWrap.replaceWith(holder.firstElementChild);
  }
  if (name) name.textContent = m.name || 'Model';
}

function renderSheetList() {
  const list = document.getElementById('modelPopoverList');
  if (!list) return;
  list.innerHTML = '';

  const active = getActiveModel();
  const providers = _state.remoteProviders;

  if (!providers.length) {
    list.innerHTML = '<div class="model-popover-status">Belum ada model dari server. Buka ulang popover untuk sinkronisasi.</div>';
    return;
  }

  providers.forEach(p => {
    if (!p.models || !p.models.length) return;

    const lbl = document.createElement('div');
    lbl.className = 'model-provider-label';
    // ⭐ Badge count dihapus — hanya label "Brain Side" saja
    lbl.innerHTML = '<span>' + escapeHTML(PROVIDER_LABEL) + '</span>';
    list.appendChild(lbl);

    p.models.forEach(rm => {
      const isActive = active && active.providerID === rm.providerID && active.modelID === rm.modelID;
      const item = document.createElement('button');
      item.className = 'model-item' + (isActive ? ' active' : '');
      item.type = 'button';
      const hasTags = rm.reasoning || rm.attachment;
      item.innerHTML =
        _iconHTML(rm.family, rm.name, rm.modelID) +
        '<div class="model-item-body">' +
          '<div class="model-item-name">' + escapeHTML(rm.name) + '</div>' +
          (hasTags ? '<div class="model-item-desc">' +
            (rm.reasoning ? '<span class="model-tag r">THINK</span>' : '') +
            (rm.attachment ? '<span class="model-tag v">VISION</span>' : '') +
          '</div>' : '') +
        '</div>' +
        '<div class="model-item-check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>';

      item.addEventListener('click', async () => {
        const newModel = {
          id: 'rm_' + rm.providerID + '_' + rm.modelID,
          name: rm.name,
          description: rm.providerName,
          isActive: true,
          order: 0,
          provider: 'opencode',
          endpoint: active.endpoint || DEFAULT_OPENCODE_ENDPOINT,
          apiKey: active.apiKey || DEFAULT_OPENCODE_APIKEY,
          providerID: rm.providerID,
          modelID: rm.modelID,
          reasoning: rm.reasoning,
          attachment: rm.attachment
        };
        const existing = _state.allModels.filter(x => x.id !== newModel.id);
        existing.unshift(newModel);
        await saveModelsToStorage(existing);
        await setActiveModel(newModel.id);
        closeModelSheet();
      });
      list.appendChild(item);
    });
  });
}

function getVisibleModelBtn() {
  const btns = document.querySelectorAll('.model-btn');
  for (const b of btns) { if (b.offsetParent !== null) return b; }
  return btns[0] || null;
}

function positionPopover(pop, anchor) {
  if (!anchor) { pop.style.left = '16px'; pop.style.bottom = '80px'; pop.style.top = 'auto'; return; }
  const r = anchor.getBoundingClientRect();
  const margin = 12;
  const pw = pop.offsetWidth || 340;
  let left = r.left;
  if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
  if (left < margin) left = margin;
  const bottom = Math.max(margin, window.innerHeight - r.top + margin);
  pop.style.left = left + 'px';
  pop.style.bottom = bottom + 'px';
  pop.style.top = 'auto';
}

export function openModelSheet(anchorEl) {
  document.querySelectorAll('.attach-menu.show').forEach(m => m.classList.remove('show'));

  // Auto-fetch provider kalau belum ada
  if (!_state.remoteLoaded || !_state.remoteProviders.length) {
    const list = document.getElementById('modelPopoverList');
    if (list) list.innerHTML = '<div class="model-popover-status">Memuat model...</div>';
    _fetchProviders().then(function() {
      renderSheetList();
    }).catch(function(err) {
      const l = document.getElementById('modelPopoverList');
      if (l) l.innerHTML = '<div class="model-popover-status err">Gagal: ' + escapeHTML(err.message) + '</div>';
    });
  } else {
    renderSheetList();
  }

  const pop = document.getElementById('modelPopover');
  if (!pop) return;
  const anchor = anchorEl || getVisibleModelBtn();
  pop.classList.add('show');
  positionPopover(pop, anchor);
  _state.openAnchor = anchor || null;
}

export function closeModelSheet() {
  const pop = document.getElementById('modelPopover');
  if (pop) pop.classList.remove('show');
  _state.openAnchor = null;
}