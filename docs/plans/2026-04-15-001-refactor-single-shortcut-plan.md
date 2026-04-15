---
title: Collapse tab switcher to a single shortcut (default Ctrl+Q)
type: refactor
status: active
date: 2026-04-15
---

# Collapse tab switcher to a single shortcut (default Ctrl+Q)

## Overview

Replace the current two-command setup (`show-switcher-forward`, `show-switcher-backward`) with a single command, defaulted to `Ctrl+Q` (and `MacCtrl+Q` on macOS). Users can rebind it at `chrome://extensions/shortcuts`, which gives us "configurable" for free without adding an options page.

Opening the switcher always advances one tab forward (Mac-style Cmd+Tab). Inside the picker, only arrow keys and a further press of `Q` move the selection. `Tab` / `Shift+Tab` are no longer bound. Since the extension is not yet published to the Chrome Web Store, no backward-compatibility or migration work is required.

## Problem Frame

The extension currently reserves two global keybindings. Two shortcuts is redundant given the picker already supports bidirectional navigation once open, and it doubles the surface area for OS/browser shortcut conflicts (which are frequent per `CLAUDE.md`). The user wants one shortcut, configurable, defaulting to `Ctrl+Q`.

## Requirements Trace

- R1. Only one global command is registered by the extension.
- R2. Default binding is `Ctrl+Q` (Win/Linux) and `MacCtrl+Q` (Mac).
- R3. The binding remains user-reconfigurable via `chrome://extensions/shortcuts` (Chrome's built-in mechanism).
- R4. Opening the switcher advances to the next tab; the hold-release commit model is preserved.
- R5. Inside the picker, selection moves only via the four arrow keys (`ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`) and a further press of the `Q` key (which advances forward). `Tab` and `Shift+Tab` are not bound.
- R6. Fallback path (`activateAdjacentTab`) on restricted pages still cycles forward.

## Scope Boundaries

- No new options page — reconfiguration piggybacks on Chrome's built-in shortcuts UI.
- No changes to the thumbnail cache, capture pipeline, or message protocol semantics.
- No changes to picker rendering, styles, or selection logic beyond what removing `direction`-on-open requires.

### Deferred to Separate Tasks

- If we later want backward-open as a second optional command, add it then. Not in scope here.

## Context & Research

### Relevant Code and Patterns

- `manifest.json` lines 20–35 — the two `commands` entries to collapse into one.
- `service-worker.js` — `onCommand` listener switches on command name to set `direction`; `openSwitcher({windowId, direction})` and `activateAdjacentTab(tabs, activeTabId, direction)` thread the value through.
- `content-script.js:23` `showSwitcher({ tabs, activeTabId, direction })` — calls `moveSelection(direction)` once on open to pre-advance selection. `Tab`/`Shift+Tab` handlers at lines ~93/101 already handle in-picker direction.
- `README.md` lines 18–19 and `CLAUDE.md` loading/testing section — reference the current shortcuts, need updating.
- `docs/solutions/documentation-gaps/chrome-tab-switcher-architecture-2026-04-15.md` — architecture doc references both commands; update for consistency.

### Institutional Learnings

- Chrome's built-in `Ctrl+Tab` cannot be overridden by extensions (obs 1459). `Ctrl+Q` is not in that reserved set for extension commands, but on some Linux distros Chrome itself binds `Ctrl+Q` to quit — acceptable: users hit this already and Chrome's `chrome://extensions/shortcuts` surfaces conflicts. No code change needed; note in README.
- Prior regression around modifier handling (obs 1445, 1496): don't touch the `keyup`/`keydown` modifier logic in `content-script.js`. `state.modifierKey = "Control"` is correct for both `Ctrl` and `MacCtrl` and must stay.

### External References

- Chrome `chrome.commands` docs: a single-command extension with a `suggested_key` is still fully reconfigurable through `chrome://extensions/shortcuts`. No manifest flag needed.

## Key Technical Decisions

- **Single command name: `show-switcher`** (drop the `-forward`/`-backward` suffix). Rationale: fewer moving parts; the name describes intent, not direction.
- **Mac binding uses `MacCtrl+Q` — the physical Control key on the Mac keyboard, not Command.** In Chrome's command manifest, `MacCtrl` is the token for the actual Control key on macOS; `Ctrl` in the same slot would bind to Command. The user's intent is the real Control key, and `MacCtrl+Q` is exactly that. As a bonus, `Cmd+Q` is reserved by macOS for Quit App anyway, so we couldn't use it even if we wanted to.
- **Windows/Linux default: `Ctrl+Q`.** Chrome on Windows has no built-in binding on `Ctrl+Q`, so it's free. Chrome on Linux does bind `Ctrl+Q` to Quit, which means Linux users may need to rebind via `chrome://extensions/shortcuts`. Accepted: keeping the same key across platforms gives users one mental model, and Linux rebinding is a 10-second fix that the shortcuts page surfaces conflicts for. Alternatives considered: `Alt+Q` (avoids the Linux conflict but breaks cross-platform mental model) — rejected. If Linux friction turns out to matter, revisit.
- **Rip `direction` out of the extension entirely.** The command handler, `openSwitcher`, `activateAdjacentTab`, the `SHOW_SWITCHER` message payload, and `showSwitcher` in the content script all lose the parameter. The picker opens on the next tab forward unconditionally; `Shift+Tab` / `ArrowLeft` / `ArrowUp` still walk backward inside the picker. Rationale: with only one entry point, `direction` is dead weight — it appears in five functions and two message payloads to carry a constant. Removing it is a small, mechanical diff and leaves the codebase easier to reason about. If a backward-open binding is ever added later, reintroducing the parameter is trivial.
- **No backward-compatibility considerations.** The extension is not yet published to the Chrome Web Store, so there are no existing users whose custom bindings, saved state, or installed versions need to be preserved. Rename commands, change message payloads, and remove keybindings freely. This also removes any "migration note" obligation from the README.
- **Remove `Tab`/`Shift+Tab` from the picker's key handler.** The current handler combines `Tab`/`Shift+Tab` with the arrow keys in a single branch (`content-script.js:91` and `:99`). Split them: keep the arrow branches, drop the Tab branches. Add a `"q"`/`"Q"` case that advances selection forward (mirrors `ArrowRight`/`ArrowDown` behavior). Rationale: the user wants a minimal, focused key set — arrows for spatial navigation, `Q` as the "next" chord that matches the opening shortcut. Leaving `Tab` bound would keep a second forward-motion key with subtly different semantics (browsers conventionally own `Tab` for focus cycling, which is confusing inside a modal picker).

## Open Questions

### Resolved During Planning

- *Should "configurable" mean a new options UI?* No — `chrome://extensions/shortcuts` already provides it. Confirmed by the user's "it's ok to be configurable" phrasing (permissive, not prescriptive).
- *Does removing backward-open lose functionality?* No — `Shift+Tab` / `ArrowLeft` / `ArrowUp` inside the picker still walk backward.

### Deferred to Implementation

- None. `direction` is removed in this plan, not deferred.

## Implementation Units

- [ ] **Unit 1: Collapse manifest commands to one**

**Goal:** Register a single `show-switcher` command with `Ctrl+Q` / `MacCtrl+Q` defaults.

**Requirements:** R1, R2, R3

**Dependencies:** None.

**Files:**
- Modify: `manifest.json`

**Approach:**
- Replace the two entries under `commands` with one keyed `show-switcher`, `suggested_key` `{ default: "Ctrl+Q", mac: "MacCtrl+Q" }`, description "Show the tab switcher".

**Patterns to follow:**
- Existing `commands` block structure in `manifest.json`.

**Test scenarios:**
- Happy path: load unpacked → `chrome://extensions/shortcuts` lists exactly one command for this extension with the expected defaults.
- Edge case: the old command names no longer appear in the shortcuts page (confirming clean removal, not duplication).

**Verification:**
- Only one entry for this extension appears in `chrome://extensions/shortcuts`; pressing `Ctrl+Q` (or `MacCtrl+Q` on Mac) fires the new command after reloading the extension.

---

- [ ] **Unit 2: Rip `direction` out of the service worker**

**Goal:** Route the single command to `openSwitcher` and remove the `direction` parameter end-to-end in the background side. Picker always opens on the next tab forward; backward navigation lives only inside the picker.

**Requirements:** R1, R4, R6

**Dependencies:** Unit 1.

**Files:**
- Modify: `service-worker.js`

**Approach:**
- In the `chrome.commands.onCommand` listener, replace the two-command guard and the `direction` ternary with a single check for `"show-switcher"`, then call `openSwitcher({ windowId })`.
- Remove the `direction` parameter from `openSwitcher`. The `SHOW_SWITCHER` message payload posted to the content script drops the `direction` field. The signature becomes `openSwitcher({ windowId })`.
- Remove the `direction` parameter from `activateAdjacentTab`. Inline the forward step — `const step = 1;` replaces the `direction === "backward" ? -1 : 1` expression, and the index math simplifies accordingly.
- Toolbar action path (`chrome.action.onClicked`) is updated to call `openSwitcher({ windowId })` without `direction`. Audit for any other call sites that passed `direction` and strip them.
- No callers outside this file should still reference `direction` for switcher purposes after this unit — grep `direction` in `service-worker.js` to confirm only unrelated usages remain (e.g., CSS `flex-direction` in the content script is a separate concern).

**Patterns to follow:**
- Existing early-return shape of the `onCommand` listener and the message-posting helper `sendSwitcherMessage`.

**Test scenarios:**
- Happy path: pressing the bound shortcut on a normal page → switcher opens with selection advanced one tab forward.
- Integration: pressing the shortcut on a restricted page (`chrome://extensions`, Web Store) → `activateAdjacentTab` fallback fires and cycles to the next tab forward (content-script injection fails, as expected).
- Edge case: single-tab window → handler runs without throwing; switcher either shows the lone tab or the fallback no-ops gracefully (match current behavior).
- Edge case: active tab is the last tab in the window → fallback wraps to the first tab (confirm forward-wrap behavior is preserved after removing the direction-dependent index math).
- Error path: unknown command string → listener returns early (defensive check still in place).

**Verification:**
- Shortcut press opens the switcher on normal pages; on restricted pages it cycles forward via the fallback without console errors. Grepping `service-worker.js` for `direction` returns no switcher-related hits.

---

- [ ] **Unit 3: Rip `direction` out of the content script**

**Goal:** Remove the `direction` parameter from the picker open path. In-picker navigation (`Shift+Tab`, arrow keys) is the sole mechanism for reverse motion.

**Requirements:** R4, R5

**Dependencies:** Unit 2.

**Files:**
- Modify: `content-script.js`

**Approach:**
- `showSwitcher({ tabs, activeTabId })` — drop the `direction` parameter from the destructure.
- `createState(tabs, activeTabId)` — drop the `direction` parameter; the returned `state` object no longer carries a default-direction concept.
- In the open sequence, replace `moveSelection(direction)` with `moveSelection("forward")`. The `moveSelection(dir)` helper itself stays — it's still used by the arrow-key handlers — but its only callers in the open path and in the `Q` handler always pass `"forward"`.
- The `SHOW_SWITCHER` message handler no longer reads `direction` off the payload.
- **Revise `onKeyDown` to drop `Tab` / `Shift+Tab` and add a `Q` handler:**
  - Line ~91: change the `ArrowRight || (Tab && !shiftKey)` branch to `ArrowRight` only.
  - Line ~99: change the `ArrowLeft || (Tab && shiftKey)` branch to `ArrowLeft` only.
  - Add a new branch after the arrow handlers: `if (event.key === "q" || event.key === "Q") { event.preventDefault(); moveSelection("forward"); render(); return; }`. Match both cases so Caps Lock doesn't break it.
  - The `Q` branch must `preventDefault` so the keystroke doesn't leak to the host page (e.g., typing `q` in a focused input on the page behind the picker).
  - The re-fire path via the service worker (holding Ctrl and tapping `Q` re-triggers `chrome.commands.onCommand`) continues to work as a secondary mechanism; the content-script handler just makes it robust when Chrome debounces or drops the repeated command for any reason.
- Do **not** modify `state.modifierKey` handling, `keyup` commit logic, or `getModifierKey()` — prior regressions (obs 1445, 1496) warn against it.

**Patterns to follow:**
- Existing IIFE structure and the `state` object shape.

**Test scenarios:**
- Happy path (open + advance via Q): shortcut press → picker opens with next tab pre-selected; while holding Control, tapping `Q` again advances to the next tab; releasing Control commits.
- Happy path (arrow navigation): open picker, press `ArrowRight` / `ArrowDown` → selection walks forward; `ArrowLeft` / `ArrowUp` → selection walks backward.
- Edge case: active tab is the last tab in the window → opening picker wraps to the first tab (forward-wrap preserved).
- Edge case (Tab removed): open picker, press `Tab` → nothing happens (focus does not leak to the host page; if it does, that's acceptable since `Tab` is no longer a picker-controlled key).
- Edge case (Caps Lock): open picker with Caps Lock on, tap `Q` → `event.key === "Q"` branch fires; selection advances.
- Edge case (Q in host page): open picker over a page with a focused `<input>` and type `q` → the `preventDefault` on the `Q` handler stops the character from reaching the input.
- Integration: `Enter` commits, `Escape` cancels, click-on-card commits — all unchanged.

**Verification:**
- All picker interactions behave identically to the pre-change version on a multi-tab window. Grepping `content-script.js` for `direction` returns only unrelated CSS usages (e.g., `flex-direction`), no parameter or message-field references.

---

- [ ] **Unit 4: Update user-facing docs**

**Goal:** Point README and CLAUDE.md at the new single shortcut; mention the rebinding path and the one-time loss of prior custom rebindings.

**Requirements:** R2, R3

**Dependencies:** Units 1–3 (so docs match shipped behavior).

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/solutions/documentation-gaps/chrome-tab-switcher-architecture-2026-04-15.md`

**Approach:**
- README: replace the forward/backward bullet list with a single "Default: `Ctrl+Q` (macOS uses the physical Control key via `MacCtrl+Q`, not Command)" line, plus a short "Rebind at `chrome://extensions/shortcuts`" note and a one-liner warning for Linux users that Chrome binds `Ctrl+Q` to Quit — they'll want to rebind. Document picker keys: arrow keys or another `Q` press to advance, `Enter` to commit, `Escape` to cancel, releasing the modifier commits.
- `CLAUDE.md`: update the "Loading & testing" step-3 example from `Ctrl+Period / Ctrl+Shift+Period` to `Ctrl+Q`, remove the "two commands" framing in the architecture section, and update any in-picker key references that mention `Tab` to the new `arrows + Q` set.
- Architecture solution doc: update the service-worker row and the flow diagram comment to reflect one command → always forward; update the interaction-model section to drop `Tab` bindings and add the `Q` re-press path.

**Patterns to follow:**
- Existing docs tone (terse, no emojis).

**Test scenarios:**
- Test expectation: none — docs-only, no behavioral change.

**Verification:**
- Grep for `Ctrl+Period`, `show-switcher-forward`, `show-switcher-backward`, and `Ctrl+Shift+Period` across the repo returns no hits except in git history.

## System-Wide Impact

- **Interaction graph:** `chrome.commands.onCommand` → `openSwitcher` → `sendSwitcherMessage` → content-script `SHOW_SWITCHER` handler. Hop 1 is the command rename; hops 2–4 shed the `direction` parameter but otherwise behave identically.
- **Error propagation:** Unchanged. `openSwitcher` still falls back to `activateAdjacentTab` on throw — the fallback just steps forward unconditionally now.
- **State lifecycle risks:** None. Thumbnail cache, `__tabSwitcherPreviewInjected` guard, and `state.cleanup` are untouched.
- **API surface parity:** `openSwitcher` signature changes from `({windowId, direction})` to `({windowId})`. Toolbar-action path is updated in the same commit to match.
- **Message protocol:** The `SHOW_SWITCHER` payload shrinks by one field (`direction` removed). The content script is updated in the same change set, so there is no cross-version payload skew to worry about for an unpacked extension.
- **Integration coverage:** Restricted-page fallback is the main non-obvious cross-layer behavior — manually verify on `chrome://extensions` that the fallback still cycles forward after the index-math simplification in `activateAdjacentTab`.
- **Unchanged invariants:** `state.modifierKey = "Control"`, `getModifierKey()` top-level placement, the `delay(60)` post-injection sleep, and the `moveSelection(direction)` helper used by in-picker `Tab`/`Shift+Tab`/arrow handlers all remain exactly as-is.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `Ctrl+Q` conflicts with Chrome's built-in quit on Linux. | Document in README; users rebind via `chrome://extensions/shortcuts`. Not a code fix. Windows and macOS are unaffected. |
| A lingering reference to `direction` or `"backward"` after the rip-out causes a silent parameter-undefined bug. | After Units 2–3, grep both `service-worker.js` and `content-script.js` for `direction` and `backward`; confirm only unrelated hits remain (CSS `flex-direction`, arrow-key handler locals). |
| `activateAdjacentTab` wrap-around math regresses when the direction-dependent index expression is inlined. | Include the "last tab wraps to first" edge-case scenario in Unit 2's test list and verify manually. |
| `Q` keystrokes leak to the host page when the picker is open over an input field. | `preventDefault()` on the `Q` handler in `onKeyDown`. Covered by the "Q in host page" test scenario in Unit 3. |

## Documentation / Operational Notes

- Pre-publication: no Chrome Web Store listing exists, so there are no live users, no version-migration obligations, and no need to worry about custom-binding preservation. Rename and reshape freely.
- No version bump required by this refactor. The user may choose to bump `manifest.json` `version` when they eventually cut a first release, but that's orthogonal.

## Sources & References

- `manifest.json:20-35`
- `service-worker.js` `onCommand` listener and `openSwitcher`
- `content-script.js:23` `showSwitcher`, lines ~93/101 navigation handlers
- `docs/solutions/documentation-gaps/chrome-tab-switcher-architecture-2026-04-15.md`
- Prior obs: 1441 (injection delay), 1445 (modifier key release), 1459 (Ctrl+Tab reservation), 1496 (modifier tracking regression)
