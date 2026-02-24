// lib/storage-utils.js
'use strict';

class StorageManager {
  constructor() {
    // Use chrome.storage.local via property so tests can stub it
    this._storage = () => chrome.storage.local;
  }

  // ── Defaults ───────────────────────────────────────────────────────────────

  async initializeDefaults() {
    const settings = await this.getSettings();
    if (!settings.initialized) {
      const defaults = {
        messageLimit:      10,
        enableTrim:        true,
        pauseOnScroll:     true,
        showStats:         true,
        bookmarkHighlight: true,
        initialized:       true
      };
      await this.saveSettings(defaults);
      return defaults;
    }
    return settings;
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  async getSettings() {
    try {
      const r = await this._get('settings');
      return r.settings || {};
    } catch { return {}; }
  }

  async saveSettings(settings) {
    try {
      await this._set({ settings });
      return true;
    } catch { return false; }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async saveStats(stats) {
    if (!this._contextValid()) return false;
    try {
      await this._set({ lastStats: stats });
      // Keep rolling history (last 50)
      const history = await this.getStatsHistory();
      history.push({ ...stats, timestamp: Date.now() });
      if (history.length > 50) history.shift();
      await this._set({ statsHistory: history });
      return true;
    } catch (e) {
      if (!String(e).includes('Extension context invalidated')) {
        console.error('[Smoothie] saveStats error:', e);
      }
      return false;
    }
  }

  async getStatsHistory() {
    try {
      const r = await this._get('statsHistory');
      return r.statsHistory || [];
    } catch { return []; }
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  async getBookmarks() {
    try {
      const r = await this._get('bookmarks');
      return r.bookmarks || {};
    } catch { return {}; }
  }

  async addBookmark(messageId, messageData) {
    try {
      const bm = await this.getBookmarks();
      bm[messageId] = { ...messageData, id: messageId, timestamp: Date.now() };
      await this._set({ bookmarks: bm });
      return bm[messageId];
    } catch { return null; }
  }

  async removeBookmark(messageId) {
    try {
      const bm = await this.getBookmarks();
      delete bm[messageId];
      await this._set({ bookmarks: bm });
      return true;
    } catch { return false; }
  }

  async updateBookmark(messageId, updates) {
    try {
      const bm = await this.getBookmarks();
      if (!bm[messageId]) return null;
      bm[messageId] = { ...bm[messageId], ...updates };
      await this._set({ bookmarks: bm });
      return bm[messageId];
    } catch { return null; }
  }

  // ── Clear ──────────────────────────────────────────────────────────────────

  async clearAllData() {
    try {
      await new Promise((res, rej) =>
        chrome.storage.local.clear(
          () => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()
        )
      );
      return true;
    } catch { return false; }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _contextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  }

  _get(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, result => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result);
      });
    });
  }

  _set(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }
}

// Global singleton used by all content scripts
const storageManager = new StorageManager();