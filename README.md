# Chrome Tab Switcher Preview

A minimal Chrome extension that shows a floating tab switcher with thumbnail previews, inspired by the macOS app switcher style in the reference screenshot.

## What it does

- Opens a centered tab picker overlay in the current window.
- Cycles through tabs with keyboard shortcuts.
- Shows cached previews for tabs you have recently focused.
- Falls back to direct tab switching on pages where Chrome does not allow content script injection.

## Important shortcut limitation

Chrome extensions cannot register `Control+Tab` as a command shortcut. Chrome's commands API does not support `Tab` as a command key, and browser-reserved shortcuts take priority.

This extension therefore ships with:

- macOS forward: `Control + .`
- macOS backward: `Control + Shift + .`

You can change shortcuts in `chrome://extensions/shortcuts`, but Chrome still will not let an extension bind the exact `Control+Tab` combination.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   `/Users/maaxxicarvalho/Code/chrome-tab-switcher`

## How to use it

- Press `Control + .` to open the preview switcher.
- Press `Tab`, `Shift + Tab`, or the arrow keys to move across the tab previews.
- Press `Enter` or click a preview card to switch to that tab.
- Press `Escape` to dismiss without switching.

## Notes

- Thumbnail previews are captured when a tab becomes active or finishes loading while active.
- Chrome internal pages like `chrome://` may not show the overlay, so the extension falls back to plain tab switching there.
