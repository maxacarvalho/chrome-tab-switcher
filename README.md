# Chrome Tab Switcher Preview

A minimal Chrome extension that shows a floating tab switcher with thumbnail previews, inspired by the macOS app switcher style in the reference screenshot.

## What it does

- Opens a centered tab picker overlay in the current window.
- Cycles through tabs with keyboard shortcuts.
- Shows cached previews for tabs you have recently focused.
- Falls back to direct tab switching on pages where Chrome does not allow content script injection.

## Shortcut

Default: `Ctrl+Q` (macOS uses the physical Control key via `MacCtrl+Q`, not Command).

Rebind at `chrome://extensions/shortcuts`.

Linux note: Chrome on Linux binds `Ctrl+Q` to Quit, so Linux users will want to rebind the extension shortcut to avoid the conflict. The shortcuts page flags the conflict.

Chrome extensions cannot register `Control+Tab` as a command shortcut — the commands API does not support `Tab` as a key, and browser-reserved shortcuts take priority.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   `/Users/maaxxicarvalho/Code/chrome-tab-switcher`

## How to use it

- Press `Ctrl+Q` to open the preview switcher (opens on the next tab).
- Keep `Ctrl` held; tap `Q` again or press `Arrow Right` / `Arrow Down` to advance; `Arrow Left` / `Arrow Up` to go back.
- Release `Ctrl` to commit the current selection. `Enter` or a click on a preview card also commits.
- Press `Escape` to dismiss without switching.

## Notes

- Thumbnail previews are captured when a tab becomes active or finishes loading while active.
- Chrome internal pages like `chrome://` may not show the overlay, so the extension falls back to plain tab switching there.
