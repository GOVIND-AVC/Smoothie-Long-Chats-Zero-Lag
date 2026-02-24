// content/content.js
// ─────────────────────────────────────────────────────────────────────────────
// Main coordinator. The heavy lifting is done by fetch-interceptor.js
// (page world) which truncates JSON before React renders anything.
//
// This script's jobs:
//   1. Listen for smoothie:truncated event → show the "load more" banner
//   2. Handle popup messages (updateLimit, loadMore, getStats, etc.)
//   3. When user loads more, reload the conversation via the ChatGPT URL
//      with an updated limit so the interceptor serves more messages
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  if (window.__smoothieContentLoaded) return;
  window.__smoothieContentLoaded = true;

  if (!location.hostname.includes('chat.openai.com') &&
      !location.hostname.includes('chatgpt.com')) return;

  console.log('[Smoothie] Content coordinator loaded');

  // ── State ──────────────────────────────────────────────────────────────────
  let convData     = null;
  let currentLimit = window.__smoothieLimit ?? 10;
  let bannerEl     = null;
  let hideTimer    = null;   // auto-hide after initial show
  let scrollBound  = false;  // scroll listener attached?

  // ── Listen for truncation event from page world ────────────────────────────
  window.addEventListener('smoothie:truncated', (e) => {
    convData = e.detail;
    currentLimit = convData.limit;
    console.log('[Smoothie] Truncation confirmed:', convData);
    showBanner(convData.hidden, convData.totalOriginal);
    sendStats();
  });

  // ── Banner ─────────────────────────────────────────────────────────────────

  function buildBannerEl(hidden, total) {
    const b = document.createElement('div');
    b.id        = 'smoothie-banner';
    b.className = 'smoothie-load-banner';
    b.innerHTML = `
      <div class="si-banner-inner">
        <span class="si-info">
          ⚡ <strong>${hidden}</strong> older messages not loaded
          <span class="si-sub">(showing last ${currentLimit} of ${total})</span>
        </span>
        <div class="si-actions">
          <button class="si-btn si-btn-sm" data-add="10">+10</button>
          <button class="si-btn si-btn-sm" data-add="25">+25</button>
          <button class="si-btn si-btn-sm" data-add="50">+50</button>
          <button class="si-btn si-btn-all">Load All</button>
        </div>
      </div>`;
    b.addEventListener('click', e => {
      const btn = e.target.closest('[data-add]');
      if (btn) { loadMore(parseInt(btn.dataset.add, 10)); return; }
      if (e.target.closest('.si-btn-all')) loadMore(99999);
    });
    return b;
  }

  function showBanner(hidden, total) {
    if (hidden <= 0) { removeBanner(); return; }

    // Reuse existing element if already in DOM, just update text
    if (!bannerEl || !bannerEl.isConnected) {
      removeBanner();
      bannerEl = buildBannerEl(hidden, total);
      waitForChat(() => {
        const first = document.querySelector(
          '[data-testid^="conversation-turn-"], [data-message-author-role], main article'
        );
        const parent = first?.parentElement ?? document.querySelector('main');
        if (parent) parent.insertBefore(bannerEl, parent.firstChild);
        else document.body.prepend(bannerEl);
        attachScrollWatcher();
      });
    }

    // Show with animation, then auto-hide after 4 s
    revealBanner();
    scheduleHide();
  }

  function revealBanner() {
    if (!bannerEl) return;
    bannerEl.classList.remove('si-hidden');
    bannerEl.classList.add('si-visible');
  }

  function hideBannerQuietly() {
    if (!bannerEl) return;
    bannerEl.classList.remove('si-visible');
    bannerEl.classList.add('si-hidden');
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    // Auto-hide after 4 seconds unless user is hovering
    hideTimer = setTimeout(() => {
      if (bannerEl && !bannerEl.matches(':hover')) hideBannerQuietly();
    }, 4000);
  }

  // Keep visible while hovered
  function attachHoverKeepAlive() {
    if (!bannerEl) return;
    bannerEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    bannerEl.addEventListener('mouseleave', () => scheduleHide());
  }

  // Show banner when user scrolls near the top (within 300px)
  function attachScrollWatcher() {
    if (scrollBound) return;
    scrollBound = true;
    attachHoverKeepAlive();

    const scroller = document.querySelector('main') ?? window;
    const getScrollTop = () =>
      scroller === window ? window.scrollY : scroller.scrollTop;

    let lastTop = getScrollTop();

    scroller.addEventListener('scroll', () => {
      const top       = getScrollTop();
      const nearTop   = top < 300;
      const scrollingUp = top < lastTop;
      lastTop = top;

      if (nearTop || scrollingUp && top < 600) {
        // User is near top or scrolling up toward it — show banner
        if (bannerEl && !bannerEl.classList.contains('si-visible')) {
          revealBanner();
          scheduleHide();
        }
      }
    }, { passive: true });
  }

  function removeBanner() {
    clearTimeout(hideTimer);
    bannerEl?.remove();
    bannerEl = null;
    document.getElementById('smoothie-banner')?.remove();
  }

  function waitForChat(cb, attempts = 0) {
    const found = document.querySelector(
      '[data-testid^="conversation-turn-"], [data-message-author-role], main article'
    );
    if (found) { cb(); return; }
    if (attempts < 20) setTimeout(() => waitForChat(cb, attempts + 1), 300);
  }

  // ── Load more: increase limit and trigger a soft reload of conversation ─────
  function loadMore(n) {
    const newLimit = currentLimit + n;
    currentLimit   = newLimit;

    // Update limit via data attribute (CSP-safe) so fetch-interceptor picks it up
    document.documentElement.setAttribute('data-smoothie-limit', newLimit);

    // Save to storage
    chrome.storage.local.get('settings', (r) => {
      const s = r.settings || {};
      s.messageLimit = newLimit;
      chrome.storage.local.set({ settings: s });
    });

    // Reload the current conversation — ChatGPT is a SPA so we navigate
    // to the same URL which triggers a fresh fetch (now intercepted with new limit)
    removeBanner();
    const href = location.href;
    history.replaceState(null, '', href);
    // Dispatch a popstate so React Router re-fetches the conversation
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));

    console.log(`[Smoothie] Reloading with limit=${newLimit}`);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  function getStats() {
    const visible = document.querySelectorAll(
      '[data-testid^="conversation-turn-"]'
    ).length || document.querySelectorAll('[data-message-author-role]').length;

    return {
      total:           convData?.totalOriginal ?? visible,
      visible:         visible,
      hidden:          convData?.hidden ?? 0,
      domElements:     document.getElementsByTagName('*').length,
      estimatedMemory: performance?.memory
        ? Math.round(performance.memory.usedJSHeapSize / 1024) : 0,
      timestamp:       Date.now()
    };
  }

  function sendStats() {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ action: 'statsUpdate', stats: getStats() }).catch(() => {});
  }

  // ── Popup message listener ─────────────────────────────────────────────────

  if (chrome.runtime?.id) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      switch (msg.action) {

        case 'getStats':
          sendResponse(getStats());
          return true;

        case 'updateLimit': {
          document.documentElement.setAttribute('data-smoothie-limit', msg.limit);
          currentLimit = msg.limit;
          chrome.storage.local.get('settings', r => {
            const s = r.settings || {};
            s.messageLimit = msg.limit;
            chrome.storage.local.set({ settings: s });
          });
          break;
        }

        case 'loadMore':
          loadMore(msg.count ?? 10);
          break;

        case 'showAll':
          loadMore(99999);
          break;

        case 'trimNow':
          // Re-navigate to apply current limit
          window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
          break;
      }
      return true;
    });
  }

  // ── Periodic stats push ────────────────────────────────────────────────────
  setInterval(sendStats, 3000);

})();