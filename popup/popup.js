// popup/popup.js  —  Neon Glass theme
'use strict';

document.addEventListener('DOMContentLoaded', async () => {

  // ── Refs ───────────────────────────────────────────────────────────────────
  const errorBox    = document.getElementById('error-message');
  const reloadBtn   = document.getElementById('reload-page-btn');
  const reloadNote  = document.getElementById('reload-note');
  const enableTrim  = document.getElementById('enable-trim');
  const limitSlider = document.getElementById('message-limit');
  const limitLabel  = document.getElementById('limit-value');
  const load10Btn   = document.getElementById('load-10-btn');
  const load25Btn   = document.getElementById('load-25-btn');
  const load50Btn   = document.getElementById('load-50-btn');
  const showAllBtn  = document.getElementById('show-all-btn');
  const trimNowBtn  = document.getElementById('trim-now-btn');
  const resetLink   = document.getElementById('reset-link');

  const totalEl   = document.getElementById('total-messages');
  const visibleEl = document.getElementById('visible-messages');
  const hiddenEl  = document.getElementById('hidden-messages');
  const domEl     = document.getElementById('dom-elements');
  const memEl     = document.getElementById('estimated-memory');
  const scoreEl   = document.getElementById('performance-score');
  const bar       = document.getElementById('performance-bar');

  // ── Init ───────────────────────────────────────────────────────────────────
  await loadSettings();
  updateSliderTrack();

  // ── Settings ───────────────────────────────────────────────────────────────
  async function loadSettings() {
    const s = await getSettings();
    enableTrim.checked     = s.enableTrim   ?? true;
    limitSlider.value      = s.messageLimit ?? 10;
    limitLabel.textContent = s.messageLimit ?? 10;
  }

  function getSettings() {
    return new Promise(r =>
      chrome.storage.local.get('settings', res => r(res.settings || {}))
    );
  }

  async function saveSetting(key, val) {
    const s = await getSettings();
    s[key] = val;
    return new Promise(r => chrome.storage.local.set({ settings: s }, r));
  }

  // ── Slider track fill ──────────────────────────────────────────────────────
  function updateSliderTrack() {
    const min = parseFloat(limitSlider.min);
    const max = parseFloat(limitSlider.max);
    const val = parseFloat(limitSlider.value);
    const pct = ((val - min) / (max - min)) * 100;
    limitSlider.style.setProperty('--pct', pct + '%');
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  reloadBtn?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });

  // Reload-note button (was inline onclick — moved here for CSP compliance)
  document.getElementById('reload-note-btn')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });

  enableTrim.addEventListener('change', async e => {
    await saveSetting('enableTrim', e.target.checked);
  });

  limitSlider.addEventListener('input', e => {
    limitLabel.textContent = e.target.value;
    updateSliderTrack();
  });

  limitSlider.addEventListener('change', async e => {
    const limit = parseInt(e.target.value, 10);
    await saveSetting('messageLimit', limit);
    send({ action: 'updateLimit', limit });
    if (reloadNote) reloadNote.style.display = 'flex';
  });

  load10Btn.addEventListener('click',  () => { send({ action: 'loadMore', count: 10  }); window.close(); });
  load25Btn.addEventListener('click',  () => { send({ action: 'loadMore', count: 25  }); window.close(); });
  load50Btn.addEventListener('click',  () => { send({ action: 'loadMore', count: 50  }); window.close(); });
  showAllBtn.addEventListener('click', () => { send({ action: 'showAll'              }); window.close(); });

  trimNowBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  });

  resetLink.addEventListener('click', async e => {
    e.preventDefault();
    if (!confirm('Reset all settings to defaults?')) return;
    await chrome.storage.local.remove('settings');
    await loadSettings();
    updateSliderTrack();
    if (reloadNote) reloadNote.style.display = 'none';
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'statsUpdate') updateDisplay(msg.stats);
  });

  // ── Polling ────────────────────────────────────────────────────────────────
  let failures = 0;

  async function poll() {
    const tabs = await new Promise(r =>
      chrome.tabs.query({ active: true, currentWindow: true }, r)
    );
    const tab = tabs[0];
    if (!tab?.id) return;
    const url = tab.url ?? '';
    if (!url.includes('chatgpt.com') && !url.includes('chat.openai.com')) {
      hideError(); return;
    }
    chrome.tabs.sendMessage(tab.id, { action: 'getStats' }, res => {
      if (chrome.runtime.lastError || !res) {
        if (++failures >= 8) showError();
        return;
      }
      failures = 0; hideError(); updateDisplay(res);
    });
  }

  poll();
  const timer = setInterval(poll, 2000);
  window.addEventListener('unload', () => clearInterval(timer));

  // ── Helpers ────────────────────────────────────────────────────────────────
  function send(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
    });
  }
  function showError() { if (errorBox) errorBox.style.display = 'block'; }
  function hideError() { if (errorBox) errorBox.style.display = 'none';  }

  function updateDisplay(s) {
    // Stat numbers
    animateNumber(totalEl,   s.total   ?? 0);
    animateNumber(visibleEl, s.visible ?? 0);
    animateNumber(hiddenEl,  s.hidden  ?? 0);

    // DOM elements
    const dom = s.domElements ?? 0;
    domEl.textContent = dom > 0 ? dom.toLocaleString() : '—';
    domEl.className   = 'perf-val' +
      (dom > 5000 ? ' stat-critical' : dom > 3000 ? ' stat-warning' : ' ok');

    // Memory
    const mem = s.estimatedMemory ?? 0;
    memEl.textContent = mem > 0
      ? (mem >= 1024 ? `${(mem/1024).toFixed(1)}MB` : `${mem}KB`) : '—';

    // Score
    const sc = calcScore(s);
    if ((s.total ?? 0) > 0) {
      scoreEl.textContent = `${sc}%`;
      bar.style.width = `${sc}%`;
      // Color the bar based on score
      if (sc < 50) {
        bar.style.background = 'linear-gradient(90deg, #FF4D6A, #FF8C42)';
        bar.style.boxShadow  = '0 0 10px rgba(255,77,106,0.5)';
      } else if (sc < 75) {
        bar.style.background = 'linear-gradient(90deg, #FFB547, #D7FF3F)';
        bar.style.boxShadow  = '0 0 10px rgba(255,181,71,0.4)';
      } else {
        bar.style.background = 'linear-gradient(90deg, #D7FF3F, #A8FF47)';
        bar.style.boxShadow  = '0 0 10px rgba(215,255,63,0.35)';
      }
    }
  }

  // Smooth number animation
  function animateNumber(el, target) {
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    el.textContent = target === 0 ? '—' : target.toLocaleString();
  }

  function calcScore(s) {
    let sc = 100;
    const d = s.domElements ?? 0;
    if      (d > 5000) sc -= 40;
    else if (d > 3000) sc -= 20;
    else if (d > 2000) sc -= 10;
    if ((s.hidden ?? 0) > 0 && (s.hidden / (s.total || 1)) > 0.3) sc += 10;
    return Math.max(0, Math.min(100, Math.round(sc)));
  }
});