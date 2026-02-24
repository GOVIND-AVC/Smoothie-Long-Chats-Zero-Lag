// content/bookmarks.js
'use strict';

class BookmarkManager {
  constructor(storage) {
    this.storage   = storage;
    this.bookmarks = {};
  }

  async init() {
    this.bookmarks = await this.storage.getBookmarks();
    console.log(`[Smoothie] BookmarkManager: ${Object.keys(this.bookmarks).length} bookmarks loaded`);
  }

  async addBookmark(messageId, messageData) {
    const bm = await this.storage.addBookmark(messageId, messageData);
    if (bm) {
      this.bookmarks[messageId] = bm;
      this._highlight(messageId);
    }
    return bm;
  }

  async removeBookmark(messageId) {
    const ok = await this.storage.removeBookmark(messageId);
    if (ok) {
      delete this.bookmarks[messageId];
      this._unhighlight(messageId);
    }
    return ok;
  }

  async toggleBookmark(messageId, messageData) {
    return this.bookmarks[messageId]
      ? this.removeBookmark(messageId)
      : this.addBookmark(messageId, messageData);
  }

  isBookmarked(messageId) { return !!this.bookmarks[messageId]; }
  getAllBookmarks()        { return this.bookmarks; }

  _highlight(messageId) {
    const el = document.querySelector(`[data-testid="${messageId}"]`);
    if (!el) return;
    el.classList.add('chatgpt-bookmarked');
    if (!el.querySelector('.bookmark-indicator')) {
      const ind = document.createElement('div');
      ind.className = 'bookmark-indicator';
      ind.textContent = '🔖 Bookmarked';
      ind.addEventListener('click', () => this.removeBookmark(messageId));
      el.appendChild(ind);
    }
  }

  _unhighlight(messageId) {
    const el = document.querySelector(`[data-testid="${messageId}"]`);
    if (!el) return;
    el.classList.remove('chatgpt-bookmarked');
    el.querySelector('.bookmark-indicator')?.remove();
  }

  refreshHighlights() {
    Object.keys(this.bookmarks).forEach(id => this._highlight(id));
  }
}