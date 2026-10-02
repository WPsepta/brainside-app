/* ═══════════════════════════════════════════════════════════════
   Brain Side — Theme Manager (v2)
   - Storage key: bs_theme (auto-migrasi dari dsoc_theme)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const STORAGE_KEY = 'bs_theme';
  const LEGACY_KEYS = ['dsoc_theme']; // key lama yang akan dimigrasi
  const html = document.documentElement;

  function _migrateLegacy() {
    try {
      // Kalau key baru sudah ada, tidak perlu migrasi
      if (localStorage.getItem(STORAGE_KEY)) return;
      // Cek key lama satu per satu
      for (const oldKey of LEGACY_KEYS) {
        const oldVal = localStorage.getItem(oldKey);
        if (oldVal === 'dark' || oldVal === 'light') {
          localStorage.setItem(STORAGE_KEY, oldVal);
          // Hapus key lama setelah migrasi sukses
          try { localStorage.removeItem(oldKey); } catch (_) {}
          return;
        }
      }
    } catch (_) {}
  }

  function getTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {}
    return 'dark'; // default dark
  }

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    if (document.body) document.body.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }

  // Migrasi dulu sebelum baca
  _migrateLegacy();
  applyTheme(getTheme());

  window.BRAINSIDE_THEME = {
    get: function () { return html.getAttribute('data-theme') || 'dark'; },
    set: applyTheme,
    toggle: function () { applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
  };

  // Backward-compat: kalau ada kode lama yang masih pakai DSOC_THEME
  window.DSOC_THEME = window.BRAINSIDE_THEME;
})();