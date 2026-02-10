// background.js (MV3)
const keyFor = (tabId) => `lastProduct:${tabId}`;

function ensureSidePanelEnabled(tabId) {
  chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true }, () => {
    void chrome.runtime.lastError;
  });
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchCoverAsDataUrl(url) {
  if (!url) return "";
  try {
    const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "image/jpeg";
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 6_000_000) return "";
    const b64 = arrayBufferToBase64(buf);
    return `data:${ct};base64,${b64}`;
  } catch {
    return "";
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PRODUCT_DETECTED") {
    (async () => {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: "No sender tabId" });
        return;
      }

      const payload = { ...msg.payload, detectedAt: Date.now() };

      if (payload.coverUrl) {
        const dataUrl = await fetchCoverAsDataUrl(payload.coverUrl);
        if (dataUrl) payload.coverDataUrl = dataUrl;
      }

      chrome.storage.session.set({ [keyFor(tabId)]: payload }, () => void chrome.runtime.lastError);
      ensureSidePanelEnabled(tabId);

      chrome.sidePanel.open({ tabId }).catch(() => {});

      chrome.runtime.sendMessage({ type: "SIDEPANEL_UPDATE", payload, tabId }, () => void chrome.runtime.lastError);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg?.type === "OPEN_SIDEPANEL") {
    const tabId = sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No sender tabId (OPEN_SIDEPANEL)" });
      return true;
    }

    ensureSidePanelEnabled(tabId);
    chrome.sidePanel.open({ tabId })
      .then(() => sendResponse({ ok: true, opened: true }))
      .catch((e) => sendResponse({ ok: false, opened: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg?.type === "GET_LAST_PRODUCT") {
    const tabId = msg?.tabId;
    if (!tabId) {
      sendResponse({ ok: true, payload: null });
      return true;
    }
    chrome.storage.session.get([keyFor(tabId)], (stored) => {
      void chrome.runtime.lastError;
      sendResponse({ ok: true, payload: stored?.[keyFor(tabId)] ?? null, tabId });
    });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message type" });
  return false;
});
