// content/scroll-manager.js
'use strict';

class ScrollManager {
  constructor(observer, trimmer) {
    this.observer  = observer;
    this.trimmer   = trimmer;
    this.timeout   = null;
    this.lastY     = 0;
    this.direction = 'down';
    this.scrolling = false;
    this.PAUSE_MS  = 2000;
    this.THRESHOLD = 50;
    this._handler  = this._onScroll.bind(this);
  }

  start() {
    window.addEventListener('scroll', this._handler, { passive: true });
    console.log('[Smoothie] ScrollManager started');
  }

  stop() {
    window.removeEventListener('scroll', this._handler);
    this.observer.resume();
  }

  _onScroll() {
    const y    = window.scrollY;
    const diff = y - this.lastY;

    if (Math.abs(diff) > this.THRESHOLD) {
      this.direction = diff > 0 ? 'down' : 'up';
    }
    this.lastY = y;

    // Pause observer when user scrolls up to read history
    if (this.direction === 'up' && !this.scrolling) {
      this.scrolling = true;
      this.observer.pause();
    }

    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this._onScrollEnd(), 150);
  }

  _onScrollEnd() {
    this.scrolling = false;

    if (this.direction === 'up') {
      // Wait before re-enabling trim so user can read
      setTimeout(() => {
        if (!this.scrolling) this.observer.resume();
      }, this.PAUSE_MS);
    } else {
      this.observer.resume();
    }
  }

  isNearBottom() {
    return (window.scrollY + window.innerHeight) >
           (document.documentElement.scrollHeight - 500);
  }

  scrollToMessage(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}