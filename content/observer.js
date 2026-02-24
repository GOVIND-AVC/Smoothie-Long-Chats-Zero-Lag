// content/observer.js
'use strict';

class ChatObserver {
  constructor(trimmer, interceptor) {
    this.trimmer      = trimmer;
    this.interceptor  = interceptor;
    this.observer     = null;
    this.isPaused     = false;
    this.debounce     = null;
    this.retries      = 0;
    this.MAX_RETRY    = 6;
  }

  start() { this._findAndObserve(); }

  _findAndObserve() {
    const c = this._findContainer();
    if (c) {
      this._attach(c);
    } else if (this.retries < this.MAX_RETRY) {
      this.retries++;
      setTimeout(() => this._findAndObserve(), 2000);
    } else {
      console.error('[Smoothie] Observer: gave up');
    }
  }

  _findContainer() {
    const t = document.querySelector('[data-testid^="conversation-turn-"]');
    if (t) return t.parentElement ?? t;
    const r = document.querySelector('[data-message-author-role]');
    if (r) return r.parentElement ?? r;
    const a = document.querySelector('main article');
    if (a) return a.parentElement ?? a;
    return null;
  }

  _attach(container) {
    this.observer = new MutationObserver(mutations => {
      if (this.isPaused) return;

      let newMsg = false;
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (this._isMessage(n)) { newMsg = true; break; }
        }
        if (newMsg) break;
      }
      if (!newMsg) return;

      // Debounce — wait for streaming to finish
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => {
        this.interceptor?._rebalance();
        this.trimmer.trimToLimit();
      }, 800);
    });

    this.observer.observe(container, { childList: true, subtree: false });
    console.log('[Smoothie] Observer attached');
  }

  _isMessage(n) {
    if (n.nodeType !== 1) return false;
    return (
      n.getAttribute?.('data-testid')?.startsWith('conversation-turn-') ||
      n.hasAttribute?.('data-message-author-role') ||
      n.tagName === 'ARTICLE'
    );
  }

  pause()  { this.isPaused = true; }
  resume() {
    this.isPaused = false;
    setTimeout(() => {
      this.interceptor?._rebalance();
      this.trimmer.trimToLimit();
    }, 500);
  }
  stop() { this.observer?.disconnect(); this.observer = null; }
}