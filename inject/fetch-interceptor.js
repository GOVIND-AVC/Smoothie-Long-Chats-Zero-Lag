// inject/fetch-interceptor.js
// ═════════════════════════════════════════════════════════════════════════════
// Runs in the PAGE world (not content-script world) so it can override
// window.fetch before React's module system boots.
//
// ChatGPT loads conversation history via:
//   GET /backend-api/conversation/<id>
//   Response: { mapping: { <uuid>: { message, parent, children } } }
//
// We intercept that response JSON and slice it to the last N messages
// before React ever sees the data. React renders only those messages.
// ═════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (window.__smoothieFetchPatched) return;
  window.__smoothieFetchPatched = true;

  // Read limit from data attribute set by injector.js (CSP-safe, no inline script)
  function getLimit() {
    const attr = document.documentElement.getAttribute('data-smoothie-limit');
    return attr ? parseInt(attr, 10) : 10;
  }
  Object.defineProperty(window, '__smoothieLimit', {
    get: () => {
      const attr = document.documentElement.getAttribute('data-smoothie-limit');
      return attr ? parseInt(attr, 10) : 10;
    },
    set: (v) => {
      document.documentElement.setAttribute('data-smoothie-limit', v);
    },
    configurable: true
  });
  window.__smoothieConvData = null;

  // ── URL matcher ────────────────────────────────────────────────────────────

  function isConvUrl(url) {
    return typeof url === 'string' &&
      (url.includes('/backend-api/conversation/') ||
       url.includes('/backend/conversation/')) &&
      !url.includes('/continuation') &&
      !url.includes('/messages');
  }

  // ── Core: truncate the mapping tree ───────────────────────────────────────

  function truncateMapping(mapping, limit) {
    if (!mapping || typeof mapping !== 'object') return mapping;

    const ids = Object.keys(mapping);
    if (ids.length <= limit + 3) return mapping;

    // Build children map and find root
    const childMap = {};
    let rootId = null;
    for (const id of ids) {
      childMap[id] = mapping[id].children ?? [];
      if (!mapping[id].parent) rootId = id;
    }
    if (!rootId) rootId = ids[0];

    // Walk longest path root → leaf
    function deepest(id) {
      const ch = childMap[id] ?? [];
      if (!ch.length) return [id];
      let best = [];
      for (const c of ch) {
        const p = deepest(c);
        if (p.length > best.length) best = p;
      }
      return [id, ...best];
    }

    const chain    = deepest(rootId);
    const total    = chain.length;
    if (total <= limit + 3) return mapping;

    // Keep: first 2 nodes (root + system) + last `limit` nodes
    const KEEP_HEAD  = 2;
    const keepFrom   = Math.max(KEEP_HEAD, total - limit);
    const keepSet    = new Set([
      ...chain.slice(0, KEEP_HEAD),
      ...chain.slice(keepFrom)
    ]);

    // Rebuild mapping
    const out = {};
    for (const id of keepSet) {
      out[id] = {
        ...mapping[id],
        children: (mapping[id].children ?? []).filter(c => keepSet.has(c))
      };
    }

    // Re-wire: first kept turn's parent = last head node
    const junction    = chain[KEEP_HEAD - 1];   // last "head" node
    const firstKept   = chain[keepFrom];         // first "tail" node
    if (junction && firstKept && out[junction] && out[firstKept]) {
      out[junction] = { ...out[junction], children: [firstKept] };
      out[firstKept] = { ...out[firstKept], parent: junction };
    }

    const hidden = total - keepSet.size;
    console.log(`[Smoothie] Truncated: ${total} → ${keepSet.size} nodes (${hidden} hidden)`);

    window.__smoothieConvData = { totalOriginal: total, totalKept: keepSet.size, hidden, limit };
    window.dispatchEvent(new CustomEvent('smoothie:truncated', { detail: window.__smoothieConvData }));

    return out;
  }

  function patchBody(text) {
    try {
      const data = JSON.parse(text);
      if (data?.mapping) {
        data.mapping = truncateMapping(data.mapping, window.__smoothieLimit);
        return JSON.stringify(data);
      }
    } catch { }
    return text;
  }

  // ── Patch fetch ────────────────────────────────────────────────────────────

  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input
              : (input instanceof Request ? input.url : '');

    if (!isConvUrl(url)) return _fetch(input, init);

    console.log('[Smoothie] fetch intercept:', url);
    const res = await _fetch(input, init);
    try {
      const text    = await res.clone().text();
      const patched = patchBody(text);
      return new Response(patched, {
        status:     res.status,
        statusText: res.statusText,
        headers:    res.headers
      });
    } catch {
      return res;
    }
  };

  // ── Patch XHR (fallback) ───────────────────────────────────────────────────

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (m, url, ...r) {
    this.__sUrl = url ?? '';
    return _open.call(this, m, url, ...r);
  };

  XMLHttpRequest.prototype.send = function (...a) {
    if (isConvUrl(this.__sUrl)) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState !== 4) return;
        try {
          const patched = patchBody(this.responseText);
          if (patched !== this.responseText) {
            Object.defineProperty(this, 'responseText', { get: () => patched, configurable: true });
            Object.defineProperty(this, 'response',     { get: () => patched, configurable: true });
          }
        } catch { }
      }, { once: true });
    }
    return _send.apply(this, a);
  };

  console.log('[Smoothie] Network interceptor ready');
})();