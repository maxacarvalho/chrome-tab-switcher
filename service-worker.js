const thumbnailCache = new Map();
const MAX_THUMBNAILS = 20;
const CAPTURE_MIN_INTERVAL_MS = 550;
const lastCaptureByWindow = new Map();

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.windowId) {
    return;
  }

  await openSwitcher({
    windowId: tab.windowId,
    direction: "forward"
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "show-switcher-forward" && command !== "show-switcher-backward") {
    return;
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!activeTab?.windowId) {
    return;
  }

  const direction = command === "show-switcher-backward" ? "backward" : "forward";

  await openSwitcher({
    windowId: activeTab.windowId,
    direction
  });
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await captureWindowPreview(windowId, tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active || !tab.windowId) {
    return;
  }

  await captureWindowPreview(tab.windowId, tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  thumbnailCache.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ACTIVATE_TAB") {
    activateTab(message.tabId, message.windowId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});

async function openSwitcher({ windowId, direction }) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    windowId
  });

  if (!activeTab?.id) {
    return;
  }

  await captureWindowPreview(windowId, activeTab.id);

  const tabs = await chrome.tabs.query({ windowId });
  const payload = {
    type: "SHOW_SWITCHER",
    direction,
    tabs: tabs.map((tab) => serializeTab(tab)),
    activeTabId: activeTab.id
  };

  try {
    await sendSwitcherMessage(activeTab.id, payload);
  } catch (error) {
    await activateAdjacentTab(tabs, activeTab.id, direction);
  }
}

async function ensureSwitcherInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING_SWITCHER" });
    return;
  } catch (error) {
    // Continue to injection when the content script is not available yet.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"]
  });
}

async function sendSwitcherMessage(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return;
  } catch (error) {
    // Try injecting the switcher and sending again.
  }

  await ensureSwitcherInjected(tabId);
  await delay(60);
  await chrome.tabs.sendMessage(tabId, payload);
}

async function activateAdjacentTab(tabs, activeTabId, direction) {
  if (!tabs.length) {
    return;
  }

  const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);

  if (currentIndex === -1) {
    return;
  }

  const step = direction === "backward" ? -1 : 1;
  const nextIndex = (currentIndex + step + tabs.length) % tabs.length;
  const nextTab = tabs[nextIndex];

  if (nextTab?.id) {
    await activateTab(nextTab.id, nextTab.windowId);
  }
}

async function activateTab(tabId, windowId) {
  await chrome.tabs.update(tabId, { active: true });

  if (typeof windowId === "number") {
    await chrome.windows.update(windowId, { focused: true });
  }
}

function serializeTab(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || "Untitled tab",
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || "",
    active: Boolean(tab.active),
    previewDataUrl: thumbnailCache.get(tab.id)?.dataUrl || ""
  };
}

async function captureWindowPreview(windowId, tabId) {
  if (!windowId || !tabId) {
    return;
  }

  const now = Date.now();
  const last = lastCaptureByWindow.get(windowId) || 0;
  if (now - last < CAPTURE_MIN_INTERVAL_MS) {
    return;
  }
  lastCaptureByWindow.set(windowId, now);

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 55
    });

    if (!dataUrl) {
      return;
    }

    thumbnailCache.set(tabId, {
      dataUrl,
      capturedAt: Date.now()
    });

    trimThumbnailCache();
  } catch (error) {
    // Restricted pages and capture timing races are expected occasionally.
  }
}

function trimThumbnailCache() {
  if (thumbnailCache.size <= MAX_THUMBNAILS) {
    return;
  }

  const oldestEntries = [...thumbnailCache.entries()]
    .sort((left, right) => left[1].capturedAt - right[1].capturedAt)
    .slice(0, thumbnailCache.size - MAX_THUMBNAILS);

  for (const [tabId] of oldestEntries) {
    thumbnailCache.delete(tabId);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
