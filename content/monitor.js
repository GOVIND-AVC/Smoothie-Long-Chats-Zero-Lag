// content/monitor.js
'use strict';

class ResourceMonitor {
  constructor(trimmer, interceptor) {
    this.trimmer      = trimmer;
    this.interceptor  = interceptor;
    this.interval     = null;
    this.warning      = null;
    this.WARN_DOM     = 3000;
    this.CRIT_DOM     = 5000;
    this.CHECK_MS     = 8000;
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this._check(), this.CHECK_MS);
    console.log('[Smoothie] ResourceMonitor started');
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
    this._removeWarning();
  }

  _check() {
    const stats = this.getResourceStats();
    if (!chrome.runtime?.id) { this.stop(); return; }
    chrome.runtime.sendMessage({ action: 'statsUpdate', stats }).catch(() => this.stop());

    if (stats.domElements > this.CRIT_DOM) {
      this._showWarning('critical', `⚠️ Critical: ${stats.domElements.toLocaleString()} DOM elements`);
    } else if (stats.domElements > this.WARN_DOM) {
      this._showWarning('warning', `⚠️ High DOM: ${stats.domElements.toLocaleString()} elements`);
    } else {
      this._removeWarning();
    }
  }

  getResourceStats() {
    const domElements = document.getElementsByTagName('*').length;
    let estimatedMemory = 0;
    if (performance?.memory) {
      estimatedMemory = Math.round(performance.memory.usedJSHeapSize / 1024);
    } else {
      estimatedMemory = Math.round(domElements * 200 / 1024);
    }
    return {
      domElements,
      estimatedMemory,
      hiddenMessages: (this.interceptor?.hiddenCount ?? 0) + (this.trimmer?.getHiddenCount() ?? 0),
      timestamp: Date.now()
    };
  }

  _showWarning(type, message) {
    this._removeWarning();
    const el = document.createElement('div');
    el.className = `chatgpt-warning chatgpt-warning-${type}`;
    el.innerHTML = `<span>${message}</span><button>Dismiss</button>`;
    el.querySelector('button').addEventListener('click', () => this._removeWarning());
    document.body.appendChild(el);
    this.warning = el;
    setTimeout(() => this._removeWarning(), 10000);
  }

  _removeWarning() { this.warning?.remove(); this.warning = null; }
}