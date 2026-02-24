// content/interceptor.js
// ─────────────────────────────────────────────────────────────────────────────
// TRUE VIRTUALIZATION — removes message nodes from the DOM entirely.
//
// display:none still keeps nodes in the DOM tree, so the browser still
// parses, styles, and lays them out — causing the "page unresponsive" hang
// on large chats.
//
// This interceptor:
//   1. Fires at document_start (before any HTML renders)
//   2. Catches every conversation-turn node the moment it's inserted
//   3. Immediately REMOVES it from the DOM and stores it in a JS array
//   4. Re-inserts only the last N nodes (the visible window)
//   5. Uses a sentinel <div> as a placeholder so re-insertion works
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

class MessageInterceptor {
  constructor(storage) {
    this.storage       = storage;
    this.limit         = 10;       // visible window size
    this.pool          = [];       // [{node, placeholder}] — ALL turns, ordered
    this.observer      = null;
    this.bannerEl      = null;
    this.ready         = false;
    this._initPromise  = this._init();
    this._rebalanceScheduled = false;
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  async _init() {
    try {
      const s = await this.storage.getSettings();
      this.limit = Math.max(1, s.messageLimit ?? 10);
    } catch { /* use default */ }

    // Pick up nodes captured by early-capture.js before storage was ready
    if (window.__smoothieEarlyHandoff) {
      window.__smoothieEarlyLimit = this.limit;
      window.__smoothieEarlyHandoff(this);
    }

    this._attachObserver();
    this.ready = true;
    console.log(`[Smoothie] Interceptor ready — limit=${this.limit}, pool=${this.pool.length}`);
  }

  // ── MutationObserver ───────────────────────────────────────────────────────

  _attachObserver() {
    const root = document.documentElement; // watch from the very top

    this.observer = new MutationObserver(mutations => {
      let changed = false;

      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;

          // Direct match
          if (this._isTurn(node)) {
            this._capture(node);
            changed = true;
            continue;
          }

          // Batch: whole subtree arrived at once (SPA navigation)
          if (node.querySelectorAll) {
            const turns = node.querySelectorAll(
              '[data-testid^="conversation-turn-"],[data-message-author-role]'
            );
            if (turns.length) {
              // Process in document order
              turns.forEach(t => { this._capture(t); changed = true; });
            }
          }
        }
      }

      if (changed) this._scheduleRebalance();
    });

    this.observer.observe(root, { childList: true, subtree: true });
  }

  _isTurn(node) {
    return (
      node.matches?.('[data-testid^="conversation-turn-"]') ||
      node.matches?.('[data-message-author-role]')
    );
  }

  // ── Capture: remove node, leave placeholder ────────────────────────────────

  _capture(node) {
    // Skip if already captured
    if (this.pool.some(e => e.node === node)) return;
    // Skip placeholders we inserted ourselves
    if (node.dataset?.smoothiePlaceholder) return;

    const placeholder = document.createElement('div');
    placeholder.dataset.smoothiePlaceholder = 'true';
    placeholder.style.cssText = 'display:none!important;height:0;overflow:hidden';

    // Insert placeholder where the node is, then remove the node
    if (node.parentNode) {
      node.parentNode.insertBefore(placeholder, node);
      node.parentNode.removeChild(node);
    }

    this.pool.push({ node, placeholder });
  }

  // ── Rebalance: re-insert the tail window ───────────────────────────────────

  _scheduleRebalance() {
    if (this._rebalanceScheduled) return;
    this._rebalanceScheduled = true;
    // Use microtask so we batch all captures from one mutation callback
    queueMicrotask(() => {
      this._rebalanceScheduled = false;
      this._rebalance();
      this._updateBanner();
    });
  }

  _rebalance() {
    const total     = this.pool.length;
    const hideUntil = Math.max(0, total - this.limit); // first visible index

    for (let i = 0; i < total; i++) {
      const { node, placeholder } = this.pool[i];

      if (i < hideUntil) {
        // Should be OUT of DOM
        if (node.isConnected) node.parentNode?.removeChild(node);
      } else {
        // Should be IN DOM, replacing placeholder
        if (!node.isConnected && placeholder.isConnected) {
          placeholder.parentNode.insertBefore(node, placeholder);
        }
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setLimit(n) {
    this.limit = Math.max(1, n);
    this._rebalance();
    this._updateBanner();
    console.log(`[Smoothie] limit → ${this.limit}`);
  }

  get hiddenCount()  { return Math.max(0, this.pool.length - this.limit); }
  get totalCount()   { return this.pool.length; }
  get visibleCount() { return Math.min(this.pool.length, this.limit); }

  loadMore(n = 10) {
    const was = this.hiddenCount;
    if (was === 0) return 0;
    const reveal = Math.min(n, was);
    this.limit += reveal;
    this._rebalance();
    this._updateBanner();

    // Scroll to the top of the newly revealed block
    const firstNewIdx = this.pool.length - this.limit;
    const firstNew = this.pool[Math.max(0, firstNewIdx)]?.node;
    if (firstNew?.isConnected) {
      setTimeout(() => firstNew.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
    return reveal;
  }

  showAll() {
    this.limit = this.pool.length;
    this._rebalance();
    this._updateBanner();
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.showAll();
    this._removeBanner();
  }

  // ── Banner ─────────────────────────────────────────────────────────────────

  _updateBanner() {
    const hidden = this.hiddenCount;
    if (hidden === 0) { this._removeBanner(); return; }

    if (!this.bannerEl?.isConnected) this._createBanner();

    const c = this.bannerEl?.querySelector('.si-hidden-count');
    if (c) c.textContent = hidden;
  }

  _createBanner() {
    this._removeBanner();

    const b = document.createElement('div');
    b.className = 'smoothie-load-banner';
    b.innerHTML = `
      <div class="si-banner-inner">
        <span class="si-info">
          ⚡ <strong><span class="si-hidden-count">${this.hiddenCount}</span></strong>
          older messages not loaded
        </span>
        <div class="si-actions">
          <button class="si-btn si-btn-sm" data-load="10">Load 10</button>
          <button class="si-btn si-btn-sm" data-load="25">Load 25</button>
          <button class="si-btn si-btn-sm" data-load="50">Load 50</button>
          <button class="si-btn si-btn-all">Load All</button>
        </div>
      </div>`;

    b.addEventListener('click', e => {
      const btn = e.target.closest('[data-load]');
      if (btn) { this.loadMore(parseInt(btn.dataset.load, 10)); return; }
      if (e.target.closest('.si-btn-all')) this.showAll();
    });

    // Insert before the first visible message
    const firstVisible = this.pool[this.hiddenCount]?.node;
    if (firstVisible?.isConnected && firstVisible.parentNode) {
      firstVisible.parentNode.insertBefore(b, firstVisible);
    } else {
      const main = document.querySelector('main');
      (main ?? document.body).prepend(b);
    }

    this.bannerEl = b;
  }

  _removeBanner() {
    this.bannerEl?.remove();
    this.bannerEl = null;
    document.querySelectorAll('.smoothie-load-banner').forEach(x => x.remove());
  }
}