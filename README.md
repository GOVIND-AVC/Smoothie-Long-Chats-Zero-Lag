# 🥤 Smoothie

> **Network-layer performance boost for ChatGPT long chats**  
> Smoothie intercepts conversation payloads *before render* so the UI stays responsive even as threads grow.

> *Smooth scrolling, smooth chatting, smooth performance.*

Current version: **1.0.0**

---

## ⚡ Why Smoothie feels faster

Most lag comes from rendering very large conversation trees. Smoothie reduces that work **up front**:

- Injects at `document_start`
- Intercepts conversation responses in page context
- Truncates mapping to recent turns (+ required head nodes)
- Lets you progressively load more only when needed

**Result:** less initial DOM pressure and smoother interaction in long threads.

---

## ✨ Key capabilities

- **Pre-render interception** via patched `fetch` and `XMLHttpRequest`
- **Configurable message window** (slider `5` → `100`, step `5`)
- **Incremental restore** controls (`+10`, `+25`, `+50`, `ALL`)
- **Live performance panel** (total/visible/hidden, DOM nodes, memory estimate, score)
- **Local persistence** of settings in `chrome.storage.local`

---

## 🧠 Architecture (current implementation)

### 1) Early injector (`document_start`)

- `content/injector.js` reads `settings.messageLimit` (default `10`)
- Writes `<html data-smoothie-limit="N">`
- Injects `inject/fetch-interceptor.js` into page world

### 2) Network interceptor (page world)

- `inject/fetch-interceptor.js` patches:
  - `window.fetch`
  - `XMLHttpRequest`
- Matches conversation endpoints (for example `/backend-api/conversation/...`)
- Truncates payload `mapping` before React consumes it
- Dispatches `smoothie:truncated` event with totals + hidden count

### 3) UI coordinator (content script)

- `content/content.js` listens for `smoothie:truncated`
- Renders banner: “older messages not loaded”
- Handles popup actions:
  - `updateLimit`
  - `loadMore`
  - `showAll`
  - `trimNow`
  - `getStats`
- `loadMore` increases limit and triggers ChatGPT SPA refresh behavior

---

## 🕹 Popup controls

- **Message Limiting** toggle
- **Initial messages to load** slider (`5` to `100`)
- **Load older messages** buttons (`+10`, `+25`, `+50`, `ALL`)
- **Reload with current limit** quick action
- **Performance cards**:
  - Total
  - Visible
  - Hidden
  - DOM nodes
  - Estimated memory
  - Performance score

---

## 🔐 Permissions

From `manifest.json`:

- `storage` — save settings and local stats
- `activeTab` — message active ChatGPT tab from popup
- `alarms` — service worker keepalive interval
- `scripting` — runtime script support
- Host permissions:
  - `https://chat.openai.com/*`
  - `https://chatgpt.com/*`

---

## 🚀 Install (developer mode)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `SmoothieExtension` folder
5. Open ChatGPT and refresh once

---

## 🗂 Project structure

```text
SmoothieExtension/
├─ manifest.json
├─ background/
│  └─ service-worker.js
├─ inject/
│  └─ fetch-interceptor.js
├─ content/
│  ├─ injector.js
│  ├─ content.js
│  ├─ styles.css
│  ├─ trimmer.js
│  ├─ observer.js
│  ├─ monitor.js
│  ├─ scroll-manager.js
│  └─ bookmarks.js
├─ popup/
│  ├─ popup.html
│  ├─ popup.css
│  └─ popup.js
├─ lib/
│  └─ storage-utils.js
└─ icons/
```

---

## ⚠ Known limitations

- Smoothie only changes what is rendered in browser; server-side history is untouched.
- `Load All` can still be heavy for very large threads by design.
- If ChatGPT changes response schema/endpoints, interceptor logic may need adjustment.

---

## 🧪 Dev notes

- Default message limit is `10`
- Active limit is mirrored via `data-smoothie-limit` on `<html>`
- Stats are pushed periodically from content script for popup display

---

## 🛡 Privacy

- No external analytics endpoint is implemented in this repo.
- Settings/stats are stored locally using `chrome.storage.local`.
- Script scope is limited to ChatGPT domains in `host_permissions`.
