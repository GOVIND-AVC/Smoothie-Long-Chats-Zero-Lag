// content/trimmer.js
// Safety-net pass for nodes already in the DOM when the interceptor missed them.
// Uses the same remove-from-DOM strategy (not display:none).
'use strict';

class MessageTrimmer {
  constructor(storage) {
    this.storage        = storage;
    this.messageLimit   = 10;
    this.removedNodes   = [];    // [{node, placeholder}]
    this.totalMessages  = 0;
    this.visibleMessages = 0;
    this.trimIndicator  = null;
    this.isTrimming     = false;
    this._statsSendTimer = null;
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const s = await this.storage.getSettings();
      this.messageLimit = s.messageLimit ?? 10;
    } catch { }
  }

  initializeStats() {
    const msgs = this.getAllMessages();
    this.totalMessages   = msgs.length;
    this.visibleMessages = msgs.length; // trimmer hasn't removed anything yet
    if (this.totalMessages > 0) this._sendStats();
  }

  async updateLimit(n) {
    this.messageLimit = Math.max(1, n);
    try {
      const s = await this.storage.getSettings();
      await this.storage.saveSettings({ ...s, messageLimit: this.messageLimit });
    } catch { }
    return this.trimToLimit();
  }

  getAllMessages() {
    let m = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
    if (m.length) return m;
    m = Array.from(document.querySelectorAll('main [data-message-author-role]'));
    if (m.length) return m;
    return Array.from(document.querySelectorAll('main article'));
  }

  async trimToLimit() {
    if (this.isTrimming) return;
    this.isTrimming = true;
    try {
      const msgs = this.getAllMessages();
      this.totalMessages = msgs.length + this.removedNodes.length;

      if (msgs.length <= this.messageLimit) {
        this._sendStats();
        return;
      }

      const toRemove = msgs.slice(0, msgs.length - this.messageLimit);
      for (const node of toRemove) {
        this._removeNode(node);
      }

      this.visibleMessages = this.messageLimit;
      this._updateIndicator(this.removedNodes.length);
      this._sendStats();
    } finally {
      this.isTrimming = false;
    }
  }

  _removeNode(node) {
    if (!node.isConnected) return;
    const placeholder = document.createElement('div');
    placeholder.dataset.smoothieTrimmer = 'true';
    placeholder.style.cssText = 'display:none!important;height:0;overflow:hidden';
    node.parentNode.insertBefore(placeholder, node);
    node.parentNode.removeChild(node);
    this.removedNodes.push({ node, placeholder });
  }

  showAllMessages() {
    for (const { node, placeholder } of this.removedNodes) {
      if (placeholder.isConnected) {
        placeholder.parentNode.insertBefore(node, placeholder);
      }
    }
    this.removedNodes = [];
    this.visibleMessages = this.totalMessages;
    this.removeTrimIndicator();
    this._sendStats();
  }

  loadMoreMessages(count) {
    const batch = this.removedNodes.splice(0, count);
    for (const { node, placeholder } of batch) {
      if (placeholder.isConnected) {
        placeholder.parentNode.insertBefore(node, placeholder);
      }
    }
    if (this.removedNodes.length === 0) {
      this.removeTrimIndicator();
    } else {
      this._updateIndicator(this.removedNodes.length);
    }
    this.visibleMessages = this.getAllMessages().length;
    this._sendStats();
  }

  _updateIndicator(hiddenCount) {
    if (this.trimIndicator?.isConnected) {
      const s = this.trimIndicator.querySelector('.trim-message span');
      if (s) s.textContent = `⚡ ${hiddenCount} older messages not loaded`;
    } else {
      this.showTrimIndicator(hiddenCount);
    }
  }

  showTrimIndicator(hiddenCount) {
    this.removeTrimIndicator();
    const el = document.createElement('div');
    el.className = 'chatgpt-trim-indicator';
    el.innerHTML = `
      <div class="trim-content">
        <div class="trim-message"><span>⚡ ${hiddenCount} older messages not loaded</span></div>
        <div class="trim-buttons">
          <button class="trim-btn trim-btn-primary"   id="trim-load-25">Load 25</button>
          <button class="trim-btn trim-btn-secondary" id="trim-load-50">Load 50</button>
          <button class="trim-btn trim-btn-secondary" id="trim-show-all">Show All</button>
        </div>
      </div>`;

    const first = document.querySelector('[data-testid^="conversation-turn-"]');
    const parent = first?.parentElement;
    if (parent) parent.insertBefore(el, parent.firstChild);
    else document.querySelector('main')?.prepend(el);

    this.trimIndicator = el;
    el.querySelector('#trim-load-25')?.addEventListener('click', () => this.loadMoreMessages(25));
    el.querySelector('#trim-load-50')?.addEventListener('click', () => this.loadMoreMessages(50));
    el.querySelector('#trim-show-all')?.addEventListener('click', () => this.showAllMessages());
  }

  removeTrimIndicator() {
    this.trimIndicator?.remove();
    this.trimIndicator = null;
  }

  getStats() {
    const visible = this.getAllMessages().length;
    this.visibleMessages = visible;
    this.totalMessages   = visible + this.removedNodes.length;
    return {
      total:       this.totalMessages,
      visible:     this.visibleMessages,
      hidden:      this.removedNodes.length,
      domElements: document.getElementsByTagName('*').length
    };
  }

  _sendStats() {
    if (this._statsSendTimer) return;
    this._statsSendTimer = setTimeout(() => {
      this._statsSendTimer = null;
      const stats = this.getStats();
      this.storage.saveStats(stats).catch(() => {});
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({ action: 'statsUpdate', stats }).catch(() => {});
      }
    }, 500);
  }

  getHiddenCount() { return this.removedNodes.length; }
}