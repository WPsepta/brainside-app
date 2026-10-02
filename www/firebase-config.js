/* ═══════════════════════════════════════════════════════════════
   Brain Side — Firebase Config (v6)
   Project: brainside-124f2
   ═══════════════════════════════════════════════════════════════ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAOMBuXW0J2mPcOL4Kqf7jDOZGwzNcUFOQ",
  authDomain: "brainside-124f2.firebaseapp.com",
  projectId: "brainside-124f2",
  storageBucket: "brainside-124f2.firebasestorage.app",
  messagingSenderId: "518363293462",
  appId: "1:518363293462:web:8a292e3525c1e62bc2d237",
  measurementId: "G-BYWMWF8D6V"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

/* ═══════════════════════════════════════════════════════════════
   USER AI SETTINGS — Firestore: users/{uid}/settings/ai
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_AI_SETTINGS = {
  models: [],
  apiKey: '',
  endpoints: [],
  activeModelId: null,
  instructions: '',
  memory: ''
};

export async function getUserSettings(uid) {
  if (!uid) return { ...DEFAULT_AI_SETTINGS };
  try {
    const ref = doc(db, 'users', uid, 'settings', 'ai');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() || {};
      return {
        models:        Array.isArray(d.models)      ? d.models      : [],
        apiKey:        typeof d.apiKey === 'string' ? d.apiKey      : '',
        endpoints:     Array.isArray(d.endpoints)   ? d.endpoints   : [],
        activeModelId: d.activeModelId || null,
        instructions:  typeof d.instructions === 'string' ? d.instructions : '',
        memory:        typeof d.memory === 'string'       ? d.memory       : ''
      };
    }
  } catch (e) {
    console.warn('[firebase-config] getUserSettings error:', e);
  }
  return { ...DEFAULT_AI_SETTINGS };
}

export async function saveUserSettings(uid, data) {
  if (!uid) return;
  try {
    const ref = doc(db, 'users', uid, 'settings', 'ai');
    const payload = {};
    if (data.models !== undefined)        payload.models = data.models;
    if (data.apiKey !== undefined)        payload.apiKey = data.apiKey;
    if (data.endpoints !== undefined)     payload.endpoints = data.endpoints;
    if (data.activeModelId !== undefined) payload.activeModelId = data.activeModelId;
    if (data.instructions !== undefined)  payload.instructions = data.instructions;
    if (data.memory !== undefined)        payload.memory = data.memory;
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.warn('[firebase-config] saveUserSettings error:', e);
    throw e;
  }
}

/**
 * Adapter untuk initModelPicker() — baca/tulis ke Firestore.
 * Kalau user guest (uid null), fallback ke localStorage otomatis.
 */
export function createAISettingsAdapter(uid) {
  const LS_MODELS = 'bs_models_v2';
  const LS_KEYS   = 'bs_keys_v2';
  const LS_ACTIVE = 'bs_ai_active_model_v1';

  // Guest mode
  if (!uid) {
    return {
      isGuest: true,
      get: async () => {
        try {
          const raw = localStorage.getItem(LS_MODELS);
          if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
        } catch (_) {}
        return [];
      },
      set: async (models) => {
        try { localStorage.setItem(LS_MODELS, JSON.stringify(models)); } catch (_) {}
      },
      getKeys: async () => {
        try {
          const raw = localStorage.getItem(LS_KEYS);
          if (raw) {
            const d = JSON.parse(raw);
            return { apiKeys: Array.isArray(d.apiKeys) ? d.apiKeys : [], endpoints: Array.isArray(d.endpoints) ? d.endpoints : [] };
          }
        } catch (_) {}
        return { apiKeys: [], endpoints: [] };
      },
      setKeys: async (keys) => {
        try { localStorage.setItem(LS_KEYS, JSON.stringify(keys)); } catch (_) {}
      },
      getActiveId: async () => {
        try { return localStorage.getItem(LS_ACTIVE) || null; } catch (_) { return null; }
      },
      setActiveId: async (id) => {
        try { id ? localStorage.setItem(LS_ACTIVE, id) : localStorage.removeItem(LS_ACTIVE); } catch (_) {}
      }
    };
  }

  // Logged-in mode (Firestore)
  let _cache = null;
  let _loadPromise = null;

  /* ⭐ _loadPromise di-reset saat error, jadi panggilan berikutnya bisa retry.
     Sebelumnya kalau _load() gagal, promise rejected di-cache selamanya. */
  function _load() {
    if (_cache) return Promise.resolve(_cache);
    if (_loadPromise) return _loadPromise;
    _loadPromise = getUserSettings(uid).then(function (s) {
      _cache = s;
      return s;
    }).catch(function (err) {
      _loadPromise = null; // allow retry on next call
      throw err;
    });
    return _loadPromise;
  }

  return {
    isGuest: false,
    async get() {
      const s = await _load();
      return s.models || [];
    },
    async set(models) {
      const s = await _load();
      s.models = models;
      await saveUserSettings(uid, { models });
    },
    async getKeys() {
      const s = await _load();
      const apiKeys = s.apiKey ? [{ value: s.apiKey, isDefault: true }] : [];
      const endpoints = Array.isArray(s.endpoints) ? s.endpoints : [];
      return { apiKeys, endpoints };
    },
    async setKeys(keys) {
      const s = await _load();
      const apiKey = (keys.apiKeys || []).find(k => k.isDefault)?.value || (keys.apiKeys[0]?.value || '');
      const endpoints = keys.endpoints || [];
      s.apiKey = apiKey;
      s.endpoints = endpoints;
      await saveUserSettings(uid, { apiKey, endpoints });
    },
    async getActiveId() {
      const s = await _load();
      return s.activeModelId || null;
    },
    async setActiveId(id) {
      const s = await _load();
      s.activeModelId = id;
      await saveUserSettings(uid, { activeModelId: id });
    },
    clearCache() { _cache = null; _loadPromise = null; }
  };
}