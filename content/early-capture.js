// content/early-capture.js
// ─────────────────────────────────────────────────────────────────────────────
// This runs at document_start BEFORE storage-utils.js is ready.
// It sets up a bare-bones MutationObserver with a hardcoded limit of 10
// so nodes are removed from DOM the instant they appear.
// Once the full MessageInterceptor initializes, it takes over this pool.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  if (window.__smoothieEarlyCapture) return;
  window.__smoothieEarlyCapture = true;

  // Will be upgraded to real limit once storage loads
  const DEFAULT_LIMIT = 10;

  window.__smoothieEarlyPool = [];   // shared with interceptor.js
  window.__smoothieEarlyLimit = DEFAULT_LIMIT;

  function isTurn(node) {
    return node.nodeType === 1 && (
      node.matches?.('[data-testid^="conversation-turn-"]') ||
      node.matches?.('[data-message-author-role]')
    );
  }

  function capture(node) {
    const pool = window.__smoothieEarlyPool;
    if (pool.some(e => e.node === node)) return;
    if (node.dataset?.smoothiePlaceholder || node.dataset?.smoothieEarly) return;

    const ph = document.createElement('div');
    ph.dataset.smoothieEarly = 'true';
    ph.style.cssText = 'display:none!important;height:0;overflow:hidden';

    if (node.parentNode) {
      node.parentNode.insertBefore(ph, node);
      node.parentNode.removeChild(node);
    }

    pool.push({ node, placeholder: ph });
    rebalance();
  }

  function rebalance() {
    const pool  = window.__smoothieEarlyPool;
    const limit = window.__smoothieEarlyLimit;
    const total = pool.length;
    const hideUntil = Math.max(0, total - limit);

    for (let i = 0; i < total; i++) {
      const { node, placeholder } = pool[i];
      if (i < hideUntil) {
        if (node.isConnected) node.parentNode?.removeChild(node);
      } else {
        if (!node.isConnected && placeholder.isConnected) {
          placeholder.parentNode.insertBefore(node, placeholder);
        }
      }
    }
  }

  const obs = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (isTurn(n)) { capture(n); continue; }
        n.querySelectorAll?.('[data-testid^="conversation-turn-"],[data-message-author-role]')
         .forEach(capture);
      }
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Hand off to MessageInterceptor when it's ready
  window.__smoothieEarlyHandoff = function (interceptor) {
    obs.disconnect();
    // Merge early pool into interceptor's pool
    const earlyPool = window.__smoothieEarlyPool;
    if (earlyPool.length > 0) {
      interceptor.pool = earlyPool.concat(interceptor.pool);
      interceptor._rebalance();
      interceptor._updateBanner();
    }
    console.log(`[Smoothie] Early handoff: ${earlyPool.length} nodes transferred`);
  };
})();