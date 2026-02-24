// content/injector.js
// Runs at document_start (content-script world).
// Injects fetch-interceptor.js into the PAGE world.
// Passes the limit via a custom DOM attribute on <html> — no inline script needed.
(function () {
  'use strict';

  if (window.__smoothieInjected) return;
  window.__smoothieInjected = true;

  // Read limit from storage, write it onto <html data-smoothie-limit="N">
  // fetch-interceptor.js reads this attribute instead of window.__smoothieLimit
  function injectWithLimit(limit) {
    // Write limit as a data attribute — no inline script, CSP safe
    document.documentElement.setAttribute('data-smoothie-limit', limit);

    const s   = document.createElement('script');
    s.src     = chrome.runtime.getURL('inject/fetch-interceptor.js');
    s.onload  = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
    console.log(`[Smoothie] Injected interceptor, limit=${limit}`);
  }

  try {
    chrome.storage.local.get('settings', (result) => {
      const limit = result?.settings?.messageLimit ?? 10;
      injectWithLimit(limit);
    });
  } catch {
    injectWithLimit(10);
  }
})();