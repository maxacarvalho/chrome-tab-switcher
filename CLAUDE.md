# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Tab Switcher Preview — an unpacked Manifest V3 extension that shows a floating tab picker with thumbnail previews.

## Loading & testing

No build step, no package manager, no tests. Iteration loop:

1. Load the directory at `chrome://extensions` → "Load unpacked" (enable Developer mode).
2. After edits, click the reload icon on the extension card — content scripts only re-inject on navigation or via the service worker's `chrome.scripting.executeScript` fallback.
3. Trigger with `Ctrl+Period` / `Ctrl+Shift+Period` (Mac: `MacCtrl+...`) or the toolbar action.
4. Debug the service worker from the extension card's "service worker" link; debug the content script from the host page's DevTools.

The default command shortcuts conflict frequently — check `chrome://extensions/shortcuts` if keys don't fire. Note: Chrome's built-in `Ctrl+Tab` cannot be overridden by extensions (see prior investigation).

## Architecture

Three files, two execution contexts, message-passing between them:

- **`service-worker.js`** (MV3 background module) — the source of truth. Owns the thumbnail cache (`Map<tabId, {dataUrl, capturedAt}>`, capped at `MAX_THUMBNAILS = 20`, JPEG q=55 via `chrome.tabs.captureVisibleTab`). Captures previews opportunistically on `tabs.onActivated` and `tabs.onUpdated(status=complete)`. Handles toolbar clicks and the two registered commands, then calls `openSwitcher({windowId, direction})` which queries all tabs in the window, serializes them with cached thumbnails, and posts `SHOW_SWITCHER` to the active tab's content script.
- **`content-script.js`** — injected at `document_idle` into all URLs and guarded by `globalThis.__tabSwitcherPreviewInjected` against double-injection. Renders the floating picker into a single DOM root (`ROOT_ID`), owns a local `state` object (`tabs`, `activeTabId`, `selectedIndex`, `modifierKey`, `cleanup`), handles keyboard navigation, and sends `ACTIVATE_TAB` back to the worker on selection. Responds to `PING_SWITCHER` so the worker can detect whether re-injection is needed. Note: the worker has a `DISMISS_SWITCHER` handler but nothing currently sends it — a latent dead path, not a bug.
- **`manifest.json`** — MV3, permissions `tabs` + `scripting`, host `<all_urls>`.

### Injection / message delivery

`sendSwitcherMessage` first tries `chrome.tabs.sendMessage`; on failure it calls `ensureSwitcherInjected` (which pings, then `chrome.scripting.executeScript`s the file) and then **waits `delay(60)` before resending** — this sleep fixes a real race where the newly-injected listener isn't registered yet. Don't remove it without a replacement. If the whole flow throws, `openSwitcher` falls back to `activateAdjacentTab` so the keybinding still cycles tabs on restricted pages (chrome://, Web Store, etc.) where content scripts can't run.

### Interaction model (hold-release)

The picker uses Mac-style Cmd+Tab semantics, intentionally:

1. User presses `Ctrl+Period` (or the bound shortcut) — picker opens on the next tab.
2. User keeps the modifier (`Ctrl`) held; each additional `Period` press advances the selection.
3. Releasing the modifier commits the current selection and closes the picker.

Enter and click also commit immediately; Escape cancels. The commit-on-modifier-release is implemented in the content script's `keyup` handler against `state.modifierKey` (constant `"Control"` — `MacCtrl` in the manifest maps to Control on Mac). Do not add generic "Control/Meta keydown" reassignments inside `onKeyDown`; a prior version did that and caused the active modifier to silently flip to Meta if the user tapped Cmd mid-session.

`getModifierKey()` must stay at the top level inside the IIFE, not nested inside another function — a prior regression nested it and triggered a ReferenceError.

## Documented Solutions

`docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.

## Conventions

- Vanilla JS only, no bundler, no TypeScript, no dependencies. Keep it that way unless the user asks otherwise.
- The content script's IIFE guard means top-level `const`/`let` are scoped — don't hoist helpers out of it.
- Thumbnail capture silently swallows errors (restricted pages, capture throttling) — this is intentional; don't add user-facing error surfacing.
