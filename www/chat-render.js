/* ═══════════════════════════════════════════════════════════════
   chat-render.js — Shared chat renderer (v13)
   - Markdown image support (Pollinations / AI image gen)
   - Download feedback: spinner → centang hijau
   - Streaming adaptif
   ═══════════════════════════════════════════════════════════════ */

const CH_LT = String.fromCharCode(60);
const CH_GT = String.fromCharCode(62);
const CH_FS = String.fromCharCode(47);

const DL_ICON_SVG = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const CHECK_ICON_SVG = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';

const MD_IMG_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/g;

function _clearEl(el) {
  if (!el) return;
  try { while (el.firstChild) el.removeChild(el.firstChild); } catch (_) {
    try { el.innerHTML = ''; } catch (__) {}
  }
}

function _normalizeLang(lang) {
  if (!lang) return 'text';
  const l = String(lang).toLowerCase();
  const map = {
    py:'python', js:'javascript', ts:'typescript', sh:'bash', shell:'bash',
    bat:'dos', cmd:'dos', ps1:'powershell', htm:'html', md:'markdown'
  };
  return map[l] || l;
}

function _langLabel(lang) {
  const l = _normalizeLang(lang);
  const map = {
    python:'Python', javascript:'JavaScript', typescript:'TypeScript',
    html:'HTML', css:'CSS', bash:'Bash', shell:'Shell', powershell:'PowerShell',
    dos:'Batch', json:'JSON', xml:'XML', yaml:'YAML', sql:'SQL', c:'C', cpp:'C++',
    java:'Java', go:'Go', rust:'Rust', php:'PHP', ruby:'Ruby', swift:'Swift',
    kotlin:'Kotlin', markdown:'Markdown', text:'Code'
  };
  return map[l] || (l ? l.toUpperCase() : 'Code');
}

function _langToExt(lang) {
  const map = {
    html: 'html', css: 'css', javascript: 'js', typescript: 'ts',
    python: 'py', bash: 'sh', shell: 'sh', powershell: 'ps1',
    dos: 'bat', json: 'json', xml: 'xml', yaml: 'yml', sql: 'sql',
    c: 'c', cpp: 'cpp', java: 'java', go: 'go', rust: 'rs',
    php: 'php', ruby: 'rb', swift: 'swift', kotlin: 'kt',
    markdown: 'md', text: 'txt'
  };
  return map[lang] || 'txt';
}

function _baseName(lang) {
  const map = {
    html: 'index', css: 'style', javascript: 'script', typescript: 'script',
    python: 'main', bash: 'script', shell: 'script', powershell: 'script',
    dos: 'script', json: 'data', yaml: 'config', markdown: 'readme',
    text: 'file'
  };
  return map[lang] || 'file';
}

function _isWebLang(lang) {
  return lang === 'html' || lang === 'css' || lang === 'javascript';
}

function _canPreviewGroup(codes) {
  return codes.some(c => c.lang === 'html');
}

function _formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function _generateFilenames(codes) {
  const totalByExt = {};
  codes.forEach(c => {
    const ext = _langToExt(c.lang);
    totalByExt[ext] = (totalByExt[ext] || 0) + 1;
  });
  const counter = {};
  return codes.map(c => {
    const ext = _langToExt(c.lang);
    counter[ext] = (counter[ext] || 0) + 1;
    const base = _baseName(c.lang);
    if (totalByExt[ext] === 1) return base + '.' + ext;
    return base + '-' + counter[ext] + '.' + ext;
  });
}

function _downloadFile(content, filename) {
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  } catch (_) { return false; }
}

function _copyToClipboard(text, btn, showToast) {
  navigator.clipboard.writeText(text).then(function () {
    if (btn) {
      btn.classList.add('copied');
      setTimeout(function () { btn.classList.remove('copied'); }, 1400);
    }
  }).catch(function () { showToast('Gagal menyalin'); });
}

/* ⭐ Parser: split by code blocks (```...```) */
function _parseCodeBlocks(text) {
  const regex = /```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g;
  const out = [];
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', content: text.slice(last, m.index) });
    out.push({ type: 'code', lang: _normalizeLang(m[1] || 'text'), content: m[2].replace(/\n$/, '') });
    last = regex.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', content: text.slice(last) });
  return out;
}

/* ⭐ Parser baru: split by code blocks + markdown images */
function _parseMessageSegments(text) {
  const rawSegs = _parseCodeBlocks(text);
  const out = [];
  rawSegs.forEach(seg => {
    if (seg.type !== 'text') { out.push(seg); return; }
    MD_IMG_REGEX.lastIndex = 0;
    let lastImg = 0, im;
    while ((im = MD_IMG_REGEX.exec(seg.content)) !== null) {
      if (im.index > lastImg) out.push({ type: 'text', content: seg.content.slice(lastImg, im.index) });
      out.push({ type: 'image', alt: im[1] || 'Gambar', url: im[2] });
      lastImg = MD_IMG_REGEX.lastIndex;
    }
    if (lastImg < seg.content.length) out.push({ type: 'text', content: seg.content.slice(lastImg) });
  });
  return out;
}

function _hasMarkdownImage(text) {
  MD_IMG_REGEX.lastIndex = 0;
  return MD_IMG_REGEX.test(text);
}

function _appendImage(bubble, seg) {
  const img = document.createElement('img');
  img.className = 'msg-image';
  img.src = seg.url;
  img.alt = seg.alt || 'Gambar';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('click', function(e) {
    e.stopPropagation();
    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightboxImg');
    if (lb && lbImg) {
      lbImg.src = seg.url;
      lb.classList.add('show');
      if (typeof lb.dataset !== 'undefined') lb.dataset.bsSourceUrl = seg.url;
      if (typeof window.__bsOpenLightbox === 'function') {
        try { window.__bsOpenLightbox(seg.url, seg.alt); } catch (_) {}
      }
    } else {
      try { window.open(seg.url, '_blank'); } catch (_) {}
    }
  });
  bubble.appendChild(img);
}

function _splitHtmlBlock(html) {
  let htmlPart = html;
  let cssPart = '';
  let jsPart = '';
  let found = false;

  const styleMatches = [];
  htmlPart = htmlPart.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, function (m, css) {
    styleMatches.push(css);
    return '';
  });
  if (styleMatches.length) {
    cssPart = styleMatches.join('\n\n').trim();
    found = true;
  }

  const scriptMatches = [];
  htmlPart = htmlPart.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, function (m, js) {
    scriptMatches.push(js);
    return '';
  });
  if (scriptMatches.length) {
    jsPart = scriptMatches.join('\n\n').trim();
    found = true;
  }

  if (!found) return null;
  htmlPart = htmlPart.replace(/\n{3,}/g, '\n\n').trim();
  return { html: htmlPart, css: cssPart, js: jsPart };
}

function _maybeExpandSingle(codes) {
  if (codes.length !== 1) return codes.slice();
  const c = codes[0];
  if (c.lang !== 'html') return codes.slice();
  const split = _splitHtmlBlock(c.content);
  if (!split || (!split.css && !split.js)) return codes.slice();
  const out = [];
  if (split.html) out.push({ lang: 'html', content: split.html });
  if (split.css) out.push({ lang: 'css', content: split.css });
  if (split.js) out.push({ lang: 'javascript', content: split.js });
  return out;
}

function _loadJSZip() {
  return new Promise(function (resolve, reject) {
    if (window.JSZip) return resolve(window.JSZip);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = function () { resolve(window.JSZip); };
    s.onerror = function () { reject(new Error('Failed to load JSZip')); };
    document.head.appendChild(s);
  });
}

function _buildHtmlFromCodes(codes) {
  let htmlCode = '', cssCode = '', jsCode = '';
  codes.forEach(function (c) {
    if (c.lang === 'html') htmlCode += (htmlCode ? '\n' : '') + c.content;
    else if (c.lang === 'css') cssCode += (cssCode ? '\n' : '') + c.content;
    else if (c.lang === 'javascript') jsCode += (jsCode ? '\n' : '') + c.content;
  });
  const htmlHasHtml = /<html[\s>]/i.test(htmlCode);
  const htmlHasHead = /<head[\s>]/i.test(htmlCode);
  const htmlHasBody = /<body[\s>]/i.test(htmlCode);
  if (htmlHasHtml) {
    let result = htmlCode;
    if (cssCode) {
      const styleTag = CH_LT + 'style' + CH_GT + cssCode + CH_LT + CH_FS + 'style' + CH_GT;
      if (htmlHasHead) result = result.replace(/<\/head>/i, styleTag + CH_LT + CH_FS + 'head' + CH_GT);
      else result = result.replace(/<html([^>]*)>/i, '<html$1>' + CH_LT + 'head' + CH_GT + styleTag + CH_LT + CH_FS + 'head' + CH_GT);
    }
    if (jsCode) {
      const scriptTag = CH_LT + 'script' + CH_GT + jsCode + CH_LT + CH_FS + 'script' + CH_GT;
      if (htmlHasBody) result = result.replace(/<\/body>/i, scriptTag + CH_LT + CH_FS + 'body' + CH_GT);
      else result = result + scriptTag;
    }
    return result;
  }
  const parts = [];
  parts.push(CH_LT + '!DOCTYPE html' + CH_GT);
  parts.push(CH_LT + 'html' + CH_GT);
  parts.push(CH_LT + 'head' + CH_GT);
  parts.push(CH_LT + 'meta charset="utf-8"' + CH_GT);
  parts.push(CH_LT + 'meta name="viewport" content="width=device-width,initial-scale=1"' + CH_GT);
  if (cssCode) { parts.push(CH_LT + 'style' + CH_GT); parts.push(cssCode); parts.push(CH_LT + CH_FS + 'style' + CH_GT); }
  parts.push(CH_LT + CH_FS + 'head' + CH_GT);
  parts.push(CH_LT + 'body' + CH_GT);
  parts.push(htmlCode || '<div id="app"></div>');
  if (jsCode) { parts.push(CH_LT + 'script' + CH_GT); parts.push(jsCode); parts.push(CH_LT + CH_FS + 'script' + CH_GT); }
  parts.push(CH_LT + CH_FS + 'body' + CH_GT);
  parts.push(CH_LT + CH_FS + 'html' + CH_GT);
  return parts.join('');
}

function _injectRendererStyles() {
  if (document.getElementById('chatRendererStyles')) return;
  const s = document.createElement('style');
  s.id = 'chatRendererStyles';
  s.textContent = `
.code-box-tabs{display:flex;gap:2px;align-items:center;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.code-box-tabs::-webkit-scrollbar{display:none}
.code-box-tab{padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;font-family:inherit;background:transparent;border:1px solid transparent;color:rgba(255,255,255,.5);cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,border-color .15s;-webkit-tap-highlight-color:transparent}
.code-box-tab:hover{color:rgba(255,255,255,.85);background:rgba(255,255,255,.05)}
.code-box-tab.active{color:#fff;background:rgba(10,132,255,.2);border-color:rgba(10,132,255,.4)}
.code-box-btn.icon-only{padding:6px;width:28px;height:28px;justify-content:center}
.code-box-btn.icon-only svg{width:14px;height:14px}
.code-box-btn.icon-only.active{background:rgba(10,132,255,.2);color:#0a84ff;border-color:rgba(10,132,255,.4)}

.code-box.preview-mode{max-height:none}
.code-box.preview-mode .code-box-content{display:none}
.code-box .inline-preview{display:none;margin:0;background:#fff;position:relative}
.code-box.preview-mode .inline-preview{display:block}
.inline-preview-frame{width:100%;height:65vh;min-height:360px;border:none;background:#fff;display:block;pointer-events:none}
.inline-preview-overlay{position:absolute;inset:0;background:transparent;cursor:pointer;display:flex;align-items:flex-end;justify-content:flex-end;padding:10px}
.inline-preview-hint{background:rgba(10,132,255,.9);color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;pointer-events:none;display:inline-flex;align-items:center;gap:5px;backdrop-filter:blur(10px)}
.inline-preview-hint svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}

/* ⭐ Markdown image di bubble AI */
.msg-bubble img.msg-image{max-width:100%;max-height:420px;border-radius:14px;display:block;object-fit:contain;cursor:zoom-in;user-select:none;margin:6px 0;background:#0d1117;border:1px solid rgba(255,255,255,.08)}

.file-cards-box{margin:10px 0;border-radius:12px;background:#0d1117;border:1px solid rgba(255,255,255,.1);overflow:hidden}
.file-cards-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);background:#161b22}
.file-cards-title{font-size:11px;font-weight:800;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.06em}
.file-cards-list{display:flex;flex-direction:column}
.file-card{display:flex;align-items:center;gap:12px;padding:11px 14px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;text-align:left;width:100%;font-family:inherit;transition:background .15s;-webkit-tap-highlight-color:transparent}
.file-card:last-child{border-bottom:none}
.file-card:hover{background:rgba(255,255,255,.03)}
.file-card-icon{width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);display:grid;place-items:center;flex-shrink:0;color:#0a84ff;font-size:16px;line-height:1}
.file-card-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.file-card-info{flex:1;min-width:0}
.file-card-name{font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-card-meta{font-size:11px;color:rgba(255,255,255,.45);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file-card-download{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;color:rgba(255,255,255,.45);flex-shrink:0;transition:background .15s,color .15s}
.file-card:hover .file-card-download{color:#0a84ff;background:rgba(10,132,255,.1)}
.file-card-download svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

.file-card-download.loading{color:#0a84ff;background:rgba(10,132,255,.12)}
.file-card-download.loading svg{animation:fileDlSpin .7s linear infinite}
.file-card-download.success{color:#34c759!important;background:rgba(52,199,89,.16)!important}
.file-card-download.success svg{animation:none}
@keyframes fileDlSpin{to{transform:rotate(360deg)}}

.zip-box{margin:10px 0;border-radius:12px;background:#0d1117;border:1px solid rgba(255,255,255,.1);padding:16px 14px;display:flex;align-items:center;gap:14px}
.zip-icon{width:44px;height:44px;border-radius:10px;background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.3);display:grid;place-items:center;flex-shrink:0;color:#0a84ff}
.zip-icon svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.zip-info{flex:1;min-width:0}
.zip-title{font-size:13.5px;font-weight:700;color:#fff}
.zip-meta{font-size:11.5px;color:rgba(255,255,255,.5);margin-top:3px}
.zip-btn{padding:9px 16px;border-radius:10px;background:#0a84ff;color:#fff;border:1px solid rgba(255,255,255,.15);font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent;display:inline-flex;align-items:center;gap:6px;flex-shrink:0;transition:background .2s,border-color .2s,color .2s}
.zip-btn:active{transform:scale(.96)}
.zip-btn:disabled{cursor:not-allowed}
.zip-btn svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.zip-btn.loading{background:#1c3a5e;color:#8dbdff;border-color:rgba(10,132,255,.4);cursor:wait}
.zip-btn.loading svg{animation:fileDlSpin .7s linear infinite}
.zip-btn.success{background:rgba(52,199,89,.2);color:#34c759;border-color:rgba(52,199,89,.45)}
.zip-btn.success svg{animation:none}

.cpm-overlay{position:fixed;inset:0;z-index:2600;background:#0a0a0c;display:none;flex-direction:column}
.cpm-overlay.show{display:flex}
.cpm-topbar{flex-shrink:0;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#141417;border-bottom:1px solid rgba(255,255,255,.06)}
.cpm-icon-btn{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#1a1a1d;border:1px solid rgba(255,255,255,.08);color:#fff;cursor:pointer;padding:0;flex-shrink:0;transition:background .15s,border-color .15s}
.cpm-icon-btn:hover{background:#222226;border-color:rgba(255,255,255,.15)}
.cpm-icon-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.cpm-toggle{display:flex;gap:0;padding:4px;border-radius:999px;background:#1a1a1d;border:1px solid rgba(255,255,255,.08);flex:1;max-width:240px;margin:0 auto}
.cpm-toggle-btn{flex:1;padding:8px 16px;border-radius:999px;background:transparent;border:none;color:rgba(255,255,255,.55);font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .2s,color .2s;-webkit-tap-highlight-color:transparent}
.cpm-toggle-btn.active{background:#2a2a2e;color:#fff}
.cpm-body{flex:1;overflow:auto;display:flex;flex-direction:column;background:#0a0a0c}
.cpm-body iframe{flex:1;width:100%;border:none;background:#fff}
.cpm-body pre{margin:0;padding:16px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:13px;line-height:1.6;color:#e6edf3;background:#0d1117;white-space:pre;overflow:auto;flex:1}
.cpm-body pre code{background:transparent!important}
.scroll-bottom-btn.is-streaming::before{inset:3px!important;border-width:2px!important;border-top-color:#0a84ff!important;border-right-color:#0a84ff!important;border-left-color:transparent!important;border-bottom-color:transparent!important}
`;
  document.head.appendChild(s);
}

function _fileIconSvg(lang) {
  const l = _normalizeLang(lang);
  if (l === 'html') return '<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
  if (l === 'css') return '<svg viewBox="0 0 24 24"><path d="M9 4h6l1 16H8z"/><line x1="5" y1="9" x2="19" y2="9"/></svg>';
  if (l === 'javascript' || l === 'typescript') return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9v6M13 9v6M9 12h4"/></svg>';
  if (l === 'python') return '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="10" cy="14" r="1"/></svg>';
  if (l === 'json') return '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  if (l === 'markdown') return '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>';
  return '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

export function createChatRenderer(opts) {
  opts = opts || {};
  const showToast = typeof opts.showToast === 'function' ? opts.showToast : function () {};
  const scrollEl = opts.scrollEl || null;
  const getPinned = typeof opts.getPinned === 'function' ? opts.getPinned : function () { return true; };
  const getHljs = typeof opts.getHljs === 'function' ? opts.getHljs : function () {
    return (typeof window !== 'undefined') ? window.hljs : null;
  };

  _injectRendererStyles();

  function scrollIfPinned() {
    try { if (scrollEl && getPinned()) scrollEl.scrollTop = scrollEl.scrollHeight; } catch (_) {}
  }

  function triggerDownload(dlEl, content, filename, opts) {
    opts = opts || {};
    if (dlEl.classList.contains('loading') || dlEl.classList.contains('success')) return;
    const originalHTML = opts.originalHTML || dlEl.innerHTML;

    dlEl.classList.add('loading');
    dlEl.innerHTML = DL_ICON_SVG;

    setTimeout(function () {
      const ok = _downloadFile(content, filename);
      dlEl.classList.remove('loading');
      if (ok) {
        dlEl.classList.add('success');
        dlEl.innerHTML = CHECK_ICON_SVG;
        setTimeout(function () {
          dlEl.classList.remove('success');
          dlEl.innerHTML = originalHTML;
        }, 1500);
      } else {
        dlEl.innerHTML = originalHTML;
        showToast('Gagal download');
      }
    }, 200);
  }

  /* Fullscreen Modal */
  let cpmOverlay = null;
  let cpmIframe = null;
  let cpmPre = null;
  let cpmToggleBtns = [];
  let cpmCurrentCodes = null;

  function _ensureCpmDOM() {
    if (cpmOverlay) return;
    cpmOverlay = document.createElement('div');
    cpmOverlay.className = 'cpm-overlay';
    cpmOverlay.innerHTML =
      '<div class="cpm-topbar">' +
        '<button class="cpm-icon-btn cpm-close" type="button" aria-label="Tutup">' +
          '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<div class="cpm-toggle">' +
          '<button class="cpm-toggle-btn" data-mode="code" type="button">Kode</button>' +
          '<button class="cpm-toggle-btn active" data-mode="preview" type="button">Pratinjau</button>' +
        '</div>' +
        '<button class="cpm-icon-btn cpm-share" type="button" aria-label="Bagikan">' +
          '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="cpm-body"></div>';
    document.body.appendChild(cpmOverlay);
    cpmToggleBtns = cpmOverlay.querySelectorAll('.cpm-toggle-btn');
    cpmOverlay.querySelector('.cpm-close').addEventListener('click', closeCodePreview);
    cpmOverlay.querySelector('.cpm-share').addEventListener('click', async function () {
      if (!cpmCurrentCodes) return;
      const fullCode = cpmCurrentCodes.map(function (c) { return '```' + c.lang + '\n' + c.content + '\n```'; }).join('\n\n');
      try {
        if (navigator.share) { await navigator.share({ title: 'Brain Side Code', text: fullCode }); return; }
        if (navigator.clipboard) { await navigator.clipboard.writeText(fullCode); showToast('Kode disalin'); return; }
        showToast('Share tidak didukung');
      } catch (err) { if (err && err.name === 'AbortError') return; }
    });
    cpmToggleBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const mode = btn.dataset.mode;
        cpmToggleBtns.forEach(function (b) { b.classList.toggle('active', b === btn); });
        _cpmSetMode(mode);
      });
    });
  }

  function _cpmSetMode(mode) {
    const body = cpmOverlay.querySelector('.cpm-body');
    if (mode === 'code') {
      if (cpmIframe) cpmIframe.style.display = 'none';
      if (!cpmPre && cpmCurrentCodes) {
        cpmPre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = cpmCurrentCodes.map(function (c) { return '/* === ' + _langLabel(c.lang) + ' === */\n' + c.content; }).join('\n\n');
        cpmPre.appendChild(code);
        body.appendChild(cpmPre);
      } else if (cpmPre) cpmPre.style.display = 'block';
    } else {
      if (cpmPre) cpmPre.style.display = 'none';
      if (cpmIframe) cpmIframe.style.display = 'block';
    }
  }

  function openCodePreview(codes) {
    try {
      _ensureCpmDOM();
      cpmCurrentCodes = codes;
      const body = cpmOverlay.querySelector('.cpm-body');
      _clearEl(body);
      cpmIframe = null;
      cpmPre = null;
      const html = _buildHtmlFromCodes(codes);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      cpmIframe = document.createElement('iframe');
      cpmIframe.src = url;
      cpmIframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
      body.appendChild(cpmIframe);
      cpmToggleBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.mode === 'preview'); });
      _cpmSetMode('preview');
      cpmOverlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    } catch (err) { showToast('Gagal membuka preview'); console.warn('openCodePreview error:', err); }
  }

  function closeCodePreview() {
    try {
      if (cpmOverlay) cpmOverlay.classList.remove('show');
      document.body.style.overflow = '';
    } catch (_) {}
  }

  function _buildInlinePreview(codes) {
    const wrap = document.createElement('div');
    wrap.className = 'inline-preview';
    const html = _buildHtmlFromCodes(codes);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.className = 'inline-preview-frame';
    iframe.src = url;
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
    wrap.appendChild(iframe);
    const overlay = document.createElement('div');
    overlay.className = 'inline-preview-overlay';
    overlay.innerHTML = '<span class="inline-preview-hint"><svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>Full screen</span>';
    overlay.addEventListener('click', function (e) { e.stopPropagation(); openCodePreview(codes); });
    wrap.appendChild(overlay);
    return wrap;
  }

  function _toggleInlinePreview(box, codes, btn) {
    let existing = box.querySelector('.inline-preview');
    if (existing) {
      const isPreview = box.classList.toggle('preview-mode');
      if (btn) btn.classList.toggle('active', isPreview);
      return;
    }
    const preview = _buildInlinePreview(codes);
    box.appendChild(preview);
    box.classList.add('preview-mode');
    if (btn) btn.classList.add('active');
    setTimeout(function () { try { box.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (_) {} }, 100);
  }

  function buildCodeBoxTabs(codes) {
    const box = document.createElement('div');
    box.className = 'code-box';
    const header = document.createElement('div');
    header.className = 'code-box-header';
    const dots = document.createElement('div');
    dots.className = 'code-box-dots';
    dots.innerHTML = '<span class="d1"></span><span class="d2"></span><span class="d3"></span>';
    header.appendChild(dots);

    const tabsEl = document.createElement('div');
    tabsEl.className = 'code-box-tabs';
    const tabEls = [];
    codes.forEach(function (c, idx) {
      const tab = document.createElement('button');
      tab.className = 'code-box-tab' + (idx === 0 ? ' active' : '');
      tab.type = 'button';
      tab.dataset.codeIdx = String(idx);
      tab.textContent = _langLabel(c.lang);
      tabsEl.appendChild(tab);
      tabEls.push(tab);
    });
    header.appendChild(tabsEl);

    const actions = document.createElement('div');
    actions.className = 'code-box-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-box-btn icon-only';
    copyBtn.type = 'button';
    copyBtn.title = 'Salin';
    copyBtn.dataset.act = 'copy';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    actions.appendChild(copyBtn);

    let prevBtn = null;
    if (_canPreviewGroup(codes)) {
      prevBtn = document.createElement('button');
      prevBtn.className = 'code-box-btn icon-only';
      prevBtn.type = 'button';
      prevBtn.title = 'Preview';
      prevBtn.dataset.act = 'preview';
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      actions.appendChild(prevBtn);
    }
    header.appendChild(actions);
    box.appendChild(header);

    const pre = document.createElement('pre');
    pre.className = 'code-box-content';
    const hljs = getHljs();
    const codeEls = [];
    codes.forEach(function (c, idx) {
      const codeEl = document.createElement('code');
      codeEl.className = 'language-' + c.lang;
      codeEl.dataset.codeIdx = String(idx);
      codeEl.textContent = c.content;
      if (hljs && c.content.length < 50000) { try { hljs.highlightElement(codeEl); } catch (_) {} }
      codeEl.style.display = (idx === 0) ? 'block' : 'none';
      codeEls.push(codeEl);
      pre.appendChild(codeEl);
    });
    box.appendChild(pre);

    tabEls.forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        e.stopPropagation();
        const idx = tab.dataset.codeIdx;
        tabEls.forEach(function (t) { t.classList.toggle('active', t.dataset.codeIdx === idx); });
        codeEls.forEach(function (el) { el.style.display = (el.dataset.codeIdx === idx) ? 'block' : 'none'; });
      });
    });

    header.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'copy') {
          const activeTab = header.querySelector('.code-box-tab.active');
          const idx = parseInt(activeTab.dataset.codeIdx, 10);
          _copyToClipboard(codes[idx].content, b, showToast);
        } else if (act === 'preview') {
          _toggleInlinePreview(box, codes, b);
        }
      });
    });
    return box;
  }

  function buildSingleCodeBox(c) {
    const box = document.createElement('div');
    box.className = 'code-box';
    const header = document.createElement('div');
    header.className = 'code-box-header';
    const dots = document.createElement('div');
    dots.className = 'code-box-dots';
    dots.innerHTML = '<span class="d1"></span><span class="d2"></span><span class="d3"></span>';
    header.appendChild(dots);
    const langEl = document.createElement('div');
    langEl.className = 'code-box-lang';
    langEl.textContent = _langLabel(c.lang);
    header.appendChild(langEl);

    const actions = document.createElement('div');
    actions.className = 'code-box-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-box-btn icon-only';
    copyBtn.type = 'button';
    copyBtn.title = 'Salin';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    actions.appendChild(copyBtn);

    let prevBtn = null;
    if (c.lang === 'html') {
      prevBtn = document.createElement('button');
      prevBtn.className = 'code-box-btn icon-only';
      prevBtn.type = 'button';
      prevBtn.title = 'Preview';
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      actions.appendChild(prevBtn);
    }
    header.appendChild(actions);
    box.appendChild(header);

    const pre = document.createElement('pre');
    pre.className = 'code-box-content';
    const codeEl = document.createElement('code');
    codeEl.className = 'language-' + c.lang;
    codeEl.textContent = c.content;
    const hljs = getHljs();
    if (hljs && c.content.length < 50000) { try { hljs.highlightElement(codeEl); } catch (_) {} }
    pre.appendChild(codeEl);
    box.appendChild(pre);

    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _copyToClipboard(c.content, copyBtn, showToast);
    });
    if (prevBtn) {
      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _toggleInlinePreview(box, [c], prevBtn);
      });
    }
    return box;
  }

  function buildFileCards(codes) {
    const box = document.createElement('div');
    box.className = 'file-cards-box';
    const filenames = _generateFilenames(codes);
    const header = document.createElement('div');
    header.className = 'file-cards-header';
    const title = document.createElement('span');
    title.className = 'file-cards-title';
    title.textContent = codes.length + ' file';
    header.appendChild(title);

    if (_canPreviewGroup(codes)) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'code-box-btn icon-only';
      prevBtn.type = 'button';
      prevBtn.title = 'Preview';
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      prevBtn.addEventListener('click', function (e) { e.stopPropagation(); openCodePreview(codes); });
      header.appendChild(prevBtn);
    }
    box.appendChild(header);

    const list = document.createElement('div');
    list.className = 'file-cards-list';
    codes.forEach(function (c, idx) {
      const card = document.createElement('button');
      card.className = 'file-card';
      card.type = 'button';
      const icon = document.createElement('div');
      icon.className = 'file-card-icon';
      icon.innerHTML = _fileIconSvg(c.lang);
      card.appendChild(icon);
      const info = document.createElement('div');
      info.className = 'file-card-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'file-card-name';
      nameEl.textContent = filenames[idx];
      info.appendChild(nameEl);
      const metaEl = document.createElement('div');
      metaEl.className = 'file-card-meta';
      metaEl.textContent = _langLabel(c.lang) + ' · ' + _formatSize(new Blob([c.content]).size);
      info.appendChild(metaEl);
      card.appendChild(info);
      const dlIcon = document.createElement('div');
      dlIcon.className = 'file-card-download';
      dlIcon.innerHTML = DL_ICON_SVG;
      card.appendChild(dlIcon);
      card.addEventListener('click', function (e) {
        e.stopPropagation();
        triggerDownload(dlIcon, c.content, filenames[idx]);
      });
      list.appendChild(card);
    });
    box.appendChild(list);
    return box;
  }

  function buildZipButton(codes) {
    const box = document.createElement('div');
    box.className = 'zip-box';
    const icon = document.createElement('div');
    icon.className = 'zip-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 8v13H3V8"/><polyline points="1 3 23 3 21 8 3 8 1 3"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
    box.appendChild(icon);
    const info = document.createElement('div');
    info.className = 'zip-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'zip-title';
    titleEl.textContent = codes.length + ' file dalam 1 ZIP';
    info.appendChild(titleEl);
    const metaEl = document.createElement('div');
    metaEl.className = 'zip-meta';
    const totalSize = codes.reduce(function (acc, c) { return acc + new Blob([c.content]).size; }, 0);
    metaEl.textContent = 'Ukuran: ' + _formatSize(totalSize);
    info.appendChild(metaEl);
    box.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'zip-btn';
    btn.type = 'button';
    const DEFAULT_HTML = DL_ICON_SVG + '<span>Download ZIP</span>';
    btn.innerHTML = DEFAULT_HTML;
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      if (btn.classList.contains('loading') || btn.classList.contains('success')) return;
      btn.classList.add('loading');
      btn.disabled = true;
      btn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg><span>Loading...</span>';
      try {
        const JSZip = await _loadJSZip();
        const zip = new JSZip();
        const filenames = _generateFilenames(codes);
        codes.forEach(function (c, idx) { zip.file(filenames[idx], c.content); });
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'brainside-files.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

        btn.classList.remove('loading');
        btn.classList.add('success');
        btn.innerHTML = CHECK_ICON_SVG + '<span>Selesai</span>';
        setTimeout(function () {
          btn.classList.remove('success');
          btn.innerHTML = DEFAULT_HTML;
          btn.disabled = false;
        }, 1500);
      } catch (err) {
        console.warn('ZIP error:', err);
        showToast('Gagal membuat ZIP');
        btn.classList.remove('loading');
        btn.innerHTML = DEFAULT_HTML;
        btn.disabled = false;
      }
    });
    box.appendChild(btn);
    return box;
  }

  /* ⭐ Renderer utama — handle text, code, image */
  function _renderMixedSegs(bubble, segs) {
    const codeSegs = segs.filter(s => s.type === 'code');
    const totalCode = codeSegs.length;

    // Banyak code block: pakai card / zip (existing logic)
    if (totalCode >= 4) {
      let placed = false;
      segs.forEach(s => {
        if (s.type === 'text') {
          const t = s.content.replace(/^\n+|\n+$/g, '');
          if (t) {
            const div = document.createElement('div');
            div.className = 'msg-text-part';
            div.textContent = t;
            bubble.appendChild(div);
          }
        } else if (s.type === 'image') {
          _appendImage(bubble, s);
        } else if (s.type === 'code' && !placed) {
          if (totalCode >= 6) bubble.appendChild(buildZipButton(codeSegs));
          else bubble.appendChild(buildFileCards(codeSegs));
          placed = true;
        }
      });
      return;
    }

    // Sedikit / tidak ada code: iterate per segmen
    let i = 0;
    while (i < segs.length) {
      const s = segs[i];
      if (s.type === 'text') {
        const t = s.content.replace(/^\n+|\n+$/g, '');
        if (t) {
          const div = document.createElement('div');
          div.className = 'msg-text-part';
          div.textContent = t;
          bubble.appendChild(div);
        }
        i++;
      } else if (s.type === 'image') {
        _appendImage(bubble, s);
        i++;
      } else {
        const groupCodes = [s];
        while (i + 1 < segs.length && segs[i + 1].type === 'code') {
          i++;
          groupCodes.push(segs[i]);
        }
        const expanded = _maybeExpandSingle(groupCodes);
        if (expanded.length > 1 && expanded.every(c => _isWebLang(c.lang))) {
          bubble.appendChild(buildCodeBoxTabs(expanded));
        } else {
          expanded.forEach(c => bubble.appendChild(buildSingleCodeBox(c)));
        }
        i++;
      }
    }
  }

  function renderMessageRich(bubble, text) {
    if (!text) { bubble.textContent = ''; return; }
    const hasCode = text.indexOf('```') !== -1;
    const hasImg = _hasMarkdownImage(text);

    if (!hasCode && !hasImg) { bubble.textContent = text; return; }

    const segs = _parseMessageSegments(text);
    if (segs.length === 1 && segs[0].type === 'text') {
      bubble.textContent = segs[0].content;
      return;
    }
    _clearEl(bubble);
    _renderMixedSegs(bubble, segs);
  }

  function _calcLineDelay(totalLines) {
    const TARGET_TOTAL_MS = 1800;
    const MIN_DELAY = 6;
    const MAX_DELAY = 45;
    if (totalLines <= 0) return MAX_DELAY;
    const ideal = TARGET_TOTAL_MS / totalLines;
    return Math.max(MIN_DELAY, Math.min(MAX_DELAY, ideal));
  }

  async function streamRichRender(bubble, fullText, ctrl, startFrom) {
    const fresh = (startFrom === undefined || startFrom === null);
    if (fresh) { _clearEl(bubble); startFrom = 0; }

    // ⭐ Kalau fullText cuma markdown image → langsung render (tanpa animasi)
    const imgOnlyMatch = String(fullText || '').match(/^\s*!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)\s*$/);
    if (imgOnlyMatch && (fresh || startFrom === 0)) {
      _clearEl(bubble);
      _appendImage(bubble, { type: 'image', alt: imgOnlyMatch[1] || 'Gambar', url: imgOnlyMatch[2] });
      ctrl.stoppedAt = null;
      return;
    }

    const segs = _parseMessageSegments(fullText);
    const hasCode = segs.some(s => s.type === 'code');
    const hasImg = segs.some(s => s.type === 'image');
    const waitResume = async function () {
      if (ctrl.paused) await new Promise(function (r) { ctrl.resumeResolve = r; });
    };

    // Kalau ada image → langsung render statis (tidak ada animasi streaming)
    if (hasImg) {
      _clearEl(bubble);
      _renderMixedSegs(bubble, segs);
      ctrl.stoppedAt = null;
      scrollIfPinned();
      return;
    }

    if (!hasCode) {
      let textDiv = bubble.querySelector('.msg-text-part');
      if (!textDiv) {
        textDiv = document.createElement('div');
        textDiv.className = 'msg-text-part';
        bubble.appendChild(textDiv);
      }
      const totalLines = (fullText.match(/\n/g) || []).length + 1;
      const lineDelay = _calcLineDelay(totalLines);

      let i = startFrom;
      while (i < fullText.length) {
        if (ctrl.aborted) { ctrl.stoppedAt = i; return; }
        await waitResume();
        const nl = fullText.indexOf('\n', i);
        const end = nl === -1 ? fullText.length : nl + 1;
        textDiv.textContent += fullText.slice(i, end);
        i = end;
        scrollIfPinned();
        await new Promise(function (r) { return setTimeout(r, lineDelay); });
      }
      ctrl.stoppedAt = null;
      return;
    }

    _clearEl(bubble);

    if (ctrl.aborted) {
      _renderMixedSegs(bubble, segs);
      ctrl.stoppedAt = null;
      return;
    }

    const codeSegs = segs.filter(s => s.type === 'code');
    const totalOriginal = codeSegs.length;
    const cardMode = totalOriginal >= 4;
    let cardPlaced = false;

    for (let k = 0; k < segs.length; k++) {
      if (ctrl.aborted) { ctrl.stoppedAt = null; return; }
      await waitResume();
      const seg = segs[k];
      if (seg.type === 'text') {
        const textDiv = document.createElement('div');
        textDiv.className = 'msg-text-part';
        bubble.appendChild(textDiv);
        const lines = seg.content.replace(/^\n+|\n+$/g, '').split('\n');
        const segDelay = _calcLineDelay(lines.length);
        for (let li = 0; li < lines.length; li++) {
          if (ctrl.aborted) { ctrl.stoppedAt = null; return; }
          await waitResume();
          textDiv.textContent += lines[li] + (li < lines.length - 1 ? '\n' : '');
          scrollIfPinned();
          await new Promise(function (r) { return setTimeout(r, segDelay); });
        }
      } else if (seg.type === 'image') {
        _appendImage(bubble, seg);
        scrollIfPinned();
      } else {
        if (cardMode) {
          if (!cardPlaced) {
            if (totalOriginal >= 6) bubble.appendChild(buildZipButton(codeSegs));
            else bubble.appendChild(buildFileCards(codeSegs));
            cardPlaced = true;
          }
          continue;
        }
        const groupCodes = [seg];
        while (k + 1 < segs.length && segs[k + 1].type === 'code') {
          k++;
          groupCodes.push(segs[k]);
        }
        const expanded = _maybeExpandSingle(groupCodes);
        if (expanded.length > 1 && expanded.every(c => _isWebLang(c.lang))) {
          bubble.appendChild(buildCodeBoxTabs(expanded));
        } else {
          expanded.forEach(c => bubble.appendChild(buildSingleCodeBox(c)));
        }
        scrollIfPinned();
        await new Promise(function (r) { return setTimeout(r, 40); });
      }
    }
    ctrl.stoppedAt = null;
  }

  async function renderWithResumeBtn(o) {
    const aiEl = o.aiEl;
    const aiBubble = o.aiBubble;
    const fullText = o.fullText || '';
    const onComplete = typeof o.onComplete === 'function' ? o.onComplete : function () {};
    const onNewCtrl = typeof o.onNewCtrl === 'function' ? o.onNewCtrl : function () {};

    async function runOnce(from) {
      const ctrl = { aborted: false, paused: false, resumeResolve: null, stoppedAt: null };
      onNewCtrl(ctrl);
      await streamRichRender(aiBubble, fullText, ctrl, from);
      return ctrl;
    }

    function attachBtn(from) {
      const btn = document.createElement('button');
      btn.className = 'resume-btn-full';
      btn.type = 'button';
      btn.textContent = 'Lanjutkan';
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        btn.remove();
        const ctrl = await runOnce(from);
        if (ctrl.aborted && ctrl.stoppedAt !== null) attachBtn(ctrl.stoppedAt);
        else onComplete();
      });
      aiEl.appendChild(btn);
    }

    const ctrl = await runOnce(0);
    if (ctrl.aborted && ctrl.stoppedAt !== null) attachBtn(ctrl.stoppedAt);
    else onComplete();
  }

  return {
    setPreviewElements: function () {},
    openCodePreview: openCodePreview,
    closeCodePreview: closeCodePreview,
    buildCodeBox: buildCodeBoxTabs,
    buildCodeBoxTabs: buildCodeBoxTabs,
    buildSingleCodeBox: buildSingleCodeBox,
    buildFileCards: buildFileCards,
    buildZipButton: buildZipButton,
    renderMessageRich: renderMessageRich,
    streamRichRender: streamRichRender,
    renderWithResumeBtn: renderWithResumeBtn,
    parseCodeBlocks: _parseCodeBlocks,
    parseMessageSegments: _parseMessageSegments,
    normalizeLang: _normalizeLang,
    langLabel: _langLabel,
    langToExt: _langToExt
  };
}