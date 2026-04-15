if (!globalThis.__tabSwitcherPreviewInjected) {
  globalThis.__tabSwitcherPreviewInjected = true;

  const ROOT_ID = "__tab_switcher_preview_root__";

  let state = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING_SWITCHER") {
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type !== "SHOW_SWITCHER") {
      return false;
    }

    showSwitcher(message);
    sendResponse({ ok: true });
    return false;
  });

  function showSwitcher({ tabs, activeTabId }) {
  const sortedTabs = Array.isArray(tabs) ? tabs : [];

  if (!sortedTabs.length) {
    return;
  }

  if (!state) {
    state = createState(sortedTabs, activeTabId);
    moveSelection("forward");
    render();
    bindEvents();
    focusSelectedCard();
    return;
  }

  state.tabs = sortedTabs;
  state.activeTabId = activeTabId;
  moveSelection("forward");
  render();
  focusSelectedCard();
  }

  function createState(tabs, activeTabId) {
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTabId)
  );

  return {
    tabs,
    activeTabId,
    selectedIndex,
    modifierKey: getModifierKey(),
    cleanup: []
  };
  }

  function moveSelection(direction) {
  if (!state) {
    return;
  }

  const delta = direction === "backward" ? -1 : 1;
  state.selectedIndex = normalizeIndex(state.selectedIndex + delta, state.tabs.length);
  }

  function normalizeIndex(index, length) {
  return ((index % length) + length) % length;
  }

  function bindEvents() {
  const onKeyDown = (event) => {
    if (!state) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSwitcher();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      activateSelectedTab();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection("forward");
      render();
      focusSelectedCard();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection("backward");
      render();
      focusSelectedCard();
      return;
    }

    if (event.key === "q" || event.key === "Q") {
      event.preventDefault();
      moveSelection("forward");
      render();
      focusSelectedCard();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveVertical(1);
      render();
      focusSelectedCard();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveVertical(-1);
      render();
      focusSelectedCard();
      return;
    }
  };

  const onPointerDown = (event) => {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    if (event.target === root) {
      closeSwitcher();
    }
  };

  const onKeyUp = (event) => {
    if (!state) {
      return;
    }

    if (event.key === state.modifierKey) {
      event.preventDefault();
      activateSelectedTab();
    }
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("pointerdown", onPointerDown, true);

  state.cleanup.push(() => document.removeEventListener("keydown", onKeyDown, true));
  state.cleanup.push(() => document.removeEventListener("keyup", onKeyUp, true));
  state.cleanup.push(() => document.removeEventListener("pointerdown", onPointerDown, true));
}

  function moveVertical(rowDelta) {
  if (!state) {
    return;
  }

  const columns = getColumnCount(state.tabs.length);
  state.selectedIndex = normalizeIndex(state.selectedIndex + rowDelta * columns, state.tabs.length);
  }

  function render() {
  if (!state) {
    return;
  }

  let root = document.getElementById(ROOT_ID);
  const columns = getColumnCount(state.tabs.length);
  const cards = state.tabs
    .map((tab, index) => renderCard(tab, index === state.selectedIndex))
    .join("");

  if (root) {
    const grid = root.querySelector(".tsp-grid");
    if (grid) {
      grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
      grid.innerHTML = cards;
      bindCardClicks(root);
      return;
    }
  }

  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.documentElement.appendChild(root);
  }

  root.innerHTML = `
    <style>
      #${ROOT_ID} {
        --tsp-accent: #3478f6;
        --tsp-text: #1f2b3d;
        --tsp-muted: #5a6780;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(235, 239, 243, 0.34);
        backdrop-filter: blur(8px);
        font-family: "SF Pro Display", "Segoe UI", sans-serif;
        animation: tsp-fade-in 140ms ease-out;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      #${ROOT_ID} .tsp-shell {
        width: min(920px, calc(100vw - 48px));
        padding: 12px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(188, 196, 208, 0.7);
        box-shadow:
          0 24px 80px rgba(35, 48, 69, 0.22),
          inset 0 1px 0 rgba(255, 255, 255, 0.85);
        animation: tsp-shell-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      #${ROOT_ID} .tsp-grid {
        display: grid;
        gap: 10px;
      }

      #${ROOT_ID} .tsp-card {
        appearance: none;
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid rgba(204, 212, 224, 0.95);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 252, 0.98));
        box-shadow: 0 4px 16px rgba(56, 68, 89, 0.08);
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
        cursor: pointer;
      }

      #${ROOT_ID} .tsp-card.is-selected {
        border-color: rgba(52, 120, 246, 0.95);
        box-shadow:
          0 0 0 3px rgba(52, 120, 246, 0.92),
          0 16px 30px rgba(52, 120, 246, 0.18);
        transform: translateY(-2px);
      }

      #${ROOT_ID} .tsp-card:focus-visible {
        outline: none;
        border-color: var(--tsp-accent);
        box-shadow:
          0 0 0 3px rgba(52, 120, 246, 0.92),
          0 16px 30px rgba(52, 120, 246, 0.18);
      }

      #${ROOT_ID} .tsp-preview {
        position: relative;
        aspect-ratio: 16 / 10;
        background:
          linear-gradient(135deg, rgba(229, 236, 245, 0.85), rgba(245, 248, 251, 0.95));
        overflow: hidden;
      }

      #${ROOT_ID} .tsp-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      #${ROOT_ID} .tsp-empty {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--tsp-muted);
        font-size: 30px;
        font-weight: 600;
        letter-spacing: -0.04em;
      }

      #${ROOT_ID} .tsp-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px 10px;
        color: var(--tsp-text);
      }

      #${ROOT_ID} .tsp-favicon {
        width: 14px;
        height: 14px;
        border-radius: 4px;
        flex: 0 0 auto;
      }

      #${ROOT_ID} .tsp-favicon.is-fallback {
        display: grid;
        place-items: center;
        background: #dde5ef;
        color: #49576e;
        font-size: 9px;
        font-weight: 700;
      }

      #${ROOT_ID} .tsp-title {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.25;
      }

      @media (max-width: 720px) {
        #${ROOT_ID} .tsp-shell {
          width: min(100vw - 24px, 560px);
          padding: 10px;
          border-radius: 18px;
        }
      }

      @keyframes tsp-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes tsp-shell-in {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    </style>
    <div class="tsp-shell" role="dialog" aria-modal="true" aria-label="Tab switcher preview">
      <div class="tsp-grid" style="grid-template-columns: repeat(${columns}, minmax(0, 1fr));">${cards}</div>
    </div>
  `;

  bindCardClicks(root);
  }

  function bindCardClicks(root) {
  root.querySelectorAll("[data-tab-id]").forEach((node) => {
    node.addEventListener("click", () => {
      if (!state) {
        return;
      }

      const tabId = Number(node.getAttribute("data-tab-id"));
      const nextIndex = state.tabs.findIndex((tab) => tab.id === tabId);

      if (nextIndex >= 0) {
        state.selectedIndex = nextIndex;
        activateSelectedTab();
      }
    });
  });
  }

  function focusSelectedCard() {
  if (!state) {
    return;
  }

  const selected = document.querySelector(
    `#${ROOT_ID} [data-tab-id="${state.tabs[state.selectedIndex]?.id}"]`
  );

  if (selected instanceof HTMLElement) {
    selected.focus({ preventScroll: true });
  }
  }

  function renderCard(tab, isSelected) {
  const title = escapeHtml(tab.title || "Untitled tab");
  const previewMarkup = tab.previewDataUrl
    ? `<img alt="" src="${escapeHtml(tab.previewDataUrl)}">`
    : `<div class="tsp-empty">${escapeHtml(getInitials(tab.title, tab.url))}</div>`;
  const faviconMarkup = tab.favIconUrl
    ? `<img class="tsp-favicon" alt="" src="${escapeHtml(tab.favIconUrl)}">`
    : `<div class="tsp-favicon is-fallback">${escapeHtml(getInitials(tab.title, tab.url, 1))}</div>`;
  const selectedClass = isSelected ? " is-selected" : "";

  return `
    <button class="tsp-card${selectedClass}" type="button" data-tab-id="${tab.id}">
      <div class="tsp-preview">${previewMarkup}</div>
      <div class="tsp-meta">
        ${faviconMarkup}
        <div class="tsp-title">${title}</div>
      </div>
    </button>
  `;
  }

  function getColumnCount(count) {
  if (count <= 4) {
    return Math.max(count, 1);
  }

  if (count <= 8) {
    return 4;
  }

  return 5;
  }

  function getModifierKey() {
  return "Control";
  }

  function getInitials(title, url, maxChars = 2) {
  let source = (title || "").trim();
  if (!source && url) {
    try {
      source = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      source = url;
    }
  }
  if (!source) {
    source = "Tab";
  }
  const words = source.split(/[\s.\-_]+/).filter(Boolean);

  if (!words.length) {
    return "T";
  }

  return words
    .slice(0, maxChars)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
  }

  function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  }

  function activateSelectedTab() {
  if (!state) {
    return;
  }

  const selected = state.tabs[state.selectedIndex];
  if (!selected?.id) {
    closeSwitcher();
    return;
  }

  chrome.runtime.sendMessage({
    type: "ACTIVATE_TAB",
    tabId: selected.id,
    windowId: selected.windowId
  });

  closeSwitcher();
  }

  function closeSwitcher() {
  if (!state) {
    return;
  }

  const cleanup = state.cleanup || [];
  for (const callback of cleanup) {
    callback();
  }

  state = null;
  document.getElementById(ROOT_ID)?.remove();
  }
}
