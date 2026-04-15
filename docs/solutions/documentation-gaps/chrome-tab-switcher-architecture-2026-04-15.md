---
title: Chrome Tab Switcher Preview — purpose and implementation reference
date: 2026-04-15
category: documentation-gaps
module: chrome-tab-switcher
problem_type: documentation_gap
component: tooling
severity: medium
applies_when:
  - onboarding to the extension for the first time
  - modifying the keyboard interaction model or injection path
  - debugging thumbnail capture or message delivery between contexts
  - deciding whether to add a build step, dependency, or new file
tags: [chrome-extension, manifest-v3, architecture, onboarding, keyboard-shortcuts]
---

# Chrome Tab Switcher Preview — purpose and implementation reference

## Context

This is the inaugural compound document for the project. Until now, architectural knowledge lived only in `CLAUDE.md` and in scattered memory observations (e.g., the injection race, the nested `getModifierKey` regression, the modifier-reassignment footgun). New contributors — human or agent — had no searchable entry point into `docs/solutions/` that explained what the extension is, why it is shaped the way it is, and which invariants must not be broken.

The extension itself is a Manifest V3 unpacked Chrome extension that shows a floating tab picker with thumbnail previews, triggered by a keyboard shortcut and committed on modifier release (Mac-style Cmd+Tab semantics). It intentionally has no build step, no package manager, no tests, and no dependencies.

## Guidance

### Purpose

Provide a fast, previewable tab switcher that works across windows with keyboard-first ergonomics. The picker opens on shortcut, advances selection while the modifier is held, and commits on release. Enter/click commit immediately; Escape cancels.

### File layout

Three source files, two execution contexts, message-passing between them:

| File | Context | Responsibility |
|------|---------|----------------|
| `manifest.json` | — | MV3 manifest; permissions `tabs` + `scripting`; host `<all_urls>`; one command (`show-switcher`, default `Ctrl+Q`; `MacCtrl+Q` on Mac — the physical Control key, not Command). |
| `service-worker.js` | MV3 background module | Source of truth. Owns thumbnail cache `Map<tabId, {dataUrl, capturedAt}>`, capped at `MAX_THUMBNAILS = 20`, JPEG q=55 via `chrome.tabs.captureVisibleTab`. Captures on `tabs.onActivated` and `tabs.onUpdated(status=complete)`. Handles toolbar clicks + the single command, calls `openSwitcher({windowId})`, posts `SHOW_SWITCHER` to the active tab's content script. |
| `content-script.js` | Injected at `document_idle` on `<all_urls>` | Renders the floating picker under `ROOT_ID`. Owns local `state` (`tabs`, `activeTabId`, `selectedIndex`, `modifierKey`, `cleanup`). Handles keyboard navigation, sends `ACTIVATE_TAB` on commit. Responds to `PING_SWITCHER`. |

### Message protocol

- Worker → content: `SHOW_SWITCHER`, `PING_SWITCHER`
- Content → worker: `ACTIVATE_TAB`
- `DISMISS_SWITCHER` has a worker handler but no sender — a latent dead path, not a bug.

### Injection / delivery race

`sendSwitcherMessage` tries `chrome.tabs.sendMessage` first. On failure it calls `ensureSwitcherInjected` (pings, then `chrome.scripting.executeScript`s the file), then **waits `delay(60)` before resending**. The sleep fixes a real race where the freshly-injected listener is not yet registered. Do not remove it without a replacement. If the whole flow throws, `openSwitcher` falls back to `activateAdjacentTab` so the keybinding still cycles tabs on restricted pages (chrome://, Web Store, etc.) where content scripts cannot run.

### Interaction model (hold-release)

1. User presses `Ctrl+Q` — picker opens on the next tab.
2. While `Ctrl` stays held, each additional `Q` press (or arrow keys) advances selection; `ArrowLeft` / `ArrowUp` walk backward.
3. Releasing `Ctrl` commits the current selection and closes the picker.

The commit-on-release is implemented in the content script's `keyup` handler against `state.modifierKey` (constant `"Control"` — `MacCtrl` in the manifest maps to Control on Mac).

### Non-negotiable invariants

- **`getModifierKey()` must stay at the top level inside the IIFE.** A prior regression nested it and triggered a `ReferenceError`.
- **Do not add generic "Control/Meta keydown" reassignments inside `onKeyDown`.** A prior version did that and caused the active modifier to silently flip to Meta if the user tapped Cmd mid-session.
- **Keep vanilla JS only.** No bundler, no TypeScript, no dependencies, unless the user explicitly asks.
- **Do not hoist helpers out of the content script IIFE guard.** The `globalThis.__tabSwitcherPreviewInjected` guard means top-level `const`/`let` are scoped to it; hoisting loses the double-injection guard.
- **Thumbnail capture silently swallows errors** (restricted pages, capture throttling). This is intentional; do not add user-facing error surfacing.
- **Chrome's built-in `Ctrl+Tab` cannot be overridden by extensions.** Prior investigation confirmed this. The extension uses `Ctrl+Q` instead; users can rebind at `chrome://extensions/shortcuts` (Linux users should — Chrome on Linux binds `Ctrl+Q` to Quit).

## Why This Matters

The extension has no test harness, no CI, no type checker — the codebase's only safety nets are the invariants above and the iteration loop below. Skipping them is how regressions like the nested `detectModifierKey` `ReferenceError` (fixed 2026-04-13) and the modifier-key-flip bug get reintroduced. Capturing the invariants here makes them searchable from `docs/solutions/` for future sessions and tools that may not have loaded `CLAUDE.md`.

## When to Apply

- Before changing anything in `content-script.js`'s keyboard handling or IIFE structure
- Before touching `sendSwitcherMessage` / `ensureSwitcherInjected` / the `delay(60)` sleep
- Before adding files, dependencies, a build step, or a test runner (the answer is almost certainly "don't")
- When onboarding a new agent session or collaborator to the project

## Examples

### Iteration loop

1. Load the directory at `chrome://extensions` → "Load unpacked" (Developer mode on).
2. After edits, click the reload icon on the extension card — content scripts only re-inject on navigation or via the worker's `chrome.scripting.executeScript` fallback.
3. Trigger with `Ctrl+Q` (Mac: `MacCtrl+Q`, the physical Control key) or the toolbar action.
4. Debug the service worker from the extension card's "service worker" link; debug the content script from the host page's DevTools.
5. If keys don't fire, check `chrome://extensions/shortcuts` — the defaults conflict with other extensions often.

### Typical request dispatch

```
User presses Ctrl+Q
  → worker's commands.onCommand fires for "show-switcher"
  → openSwitcher({windowId})
  → chrome.tabs.query({windowId}) + merge thumbnailCache
  → sendSwitcherMessage(activeTab.id, { type: 'SHOW_SWITCHER', tabs, ... })
      ├─ success: content script renders picker, user holds Ctrl, advances with Q or arrows
      └─ failure: ensureSwitcherInjected → delay(60) → retry
           └─ if still failing: activateAdjacentTab fallback (restricted page)
User releases Ctrl
  → content keyup handler fires against state.modifierKey === "Control"
  → sendMessage({ type: 'ACTIVATE_TAB', tabId: selectedTabId })
  → worker calls chrome.tabs.update(tabId, { active: true })
```

## Related

- `CLAUDE.md` at the repo root — the source this doc was distilled from; keep both in sync when architecture changes
- Prior memory observations: the injection race (2026-04-12), the nested `getModifierKey` regression (2026-04-13), the Ctrl+Tab override investigation (2026-04-14)
