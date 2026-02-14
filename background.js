// background.js (MV3)
const keyFor = (tabId) => `lastProduct:${tabId}`;
const LAST_ACTIVE_KEY = "lastProduct:active";

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

function isSurugayaEnUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.endsWith("suruga-ya.com") && url.pathname.startsWith("/en/");
  } catch {
    return false;
  }
}

async function storePayloadForTab(tabId, incomingPayload) {
  if (!tabId) return null;
  if (!incomingPayload) {
    chrome.storage.session.set({ [keyFor(tabId)]: null }, () => void chrome.runtime.lastError);
    return null;
  }

  const payload = { ...incomingPayload, detectedAt: Date.now() };

  if (payload.coverUrl) {
    const dataUrl = await fetchCoverAsDataUrl(payload.coverUrl);
    if (dataUrl) payload.coverDataUrl = dataUrl;
  }

  chrome.storage.session.set({ [keyFor(tabId)]: payload }, () => void chrome.runtime.lastError);
  return payload;
}

async function setLastActivePayload(payload) {
  // salvo l'ultimo risultato "valido" mostrato (serve quando la tab attiva NON è Suruga-ya)
  chrome.storage.session.set({ [LAST_ACTIVE_KEY]: payload ?? null }, () => void chrome.runtime.lastError);
}

function broadcastToSidepanel(tabId, payload) {
  ensureSidePanelEnabled(tabId);

  // prova ad aprire il pannello (se l'utente l'ha già aperto o lo vuole aprire)
  chrome.sidePanel.open({ tabId }).catch(() => {});

  chrome.runtime.sendMessage({ type: "SIDEPANEL_UPDATE", payload, tabId }, () => void chrome.runtime.lastError);
}

async function updateSidepanelForActiveTab(tabId) {
  if (!tabId) return;

  // prima prova: usa payload già salvato per questa tab
  const stored = await new Promise((resolve) => {
    chrome.storage.session.get([keyFor(tabId)], (o) => {
      void chrome.runtime.lastError;
      resolve(o?.[keyFor(tabId)] ?? null);
    });
  });

  if (stored) {
    broadcastToSidepanel(tabId, stored);
    // aggiorna anche l'ultimo risultato "globale"
    await setLastActivePayload(stored);
    return;
  }

  // se la tab attiva NON è Suruga-ya, NON pulire la UI: mantieni l'ultimo risultato valido
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url || !isSurugayaEnUrl(tab.url)) {
    return;
  }

  // tenta scan con retry (il content script può non essere pronto subito dopo il cambio tab / navigazione)
  const maxAttempts = 4;
  const delayMs = 450;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "SCAN_NOW" }, (r) => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true, payload: r?.payload ?? null });
      });
    });

    if (resp.ok) {
      const payload = await storePayloadForTab(tabId, resp.payload);
      if (payload) {
        await setLastActivePayload(payload);
        broadcastToSidepanel(tabId, payload);
      }
      return;
    }

    // se la pagina non è ancora pronta, aspetta un attimo e riprova
    await new Promise((r) => setTimeout(r, delayMs));
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

      const payload = await storePayloadForTab(tabId, msg.payload);

      // IMPORTANT: aggiorna la sidebar SOLO se questa tab è attiva (sincronizzazione con tab corrente)
      const isActive = !!sender?.tab?.active;
      if (isActive) {
        await setLastActivePayload(payload);
        broadcastToSidepanel(tabId, payload);
      }

      sendResponse({ ok: true, payload, tabId, active: isActive });
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
      .then(() => {
        // appena aperto, forza sync con la tab corrente
        updateSidepanelForActiveTab(tabId).catch(() => {});
        // se la tab attiva non è Suruga-ya, mantieni visibile l'ultimo risultato valido
        chrome.tabs.get(tabId, (t) => {
          void chrome.runtime.lastError;
          if (!t?.url || !isSurugayaEnUrl(t.url)) {
            chrome.storage.session.get([LAST_ACTIVE_KEY], (stored) => {
              void chrome.runtime.lastError;
              const last = stored?.[LAST_ACTIVE_KEY] ?? null;
              if (last) broadcastToSidepanel(tabId, last);
            });
          }
        });
        sendResponse({ ok: true, opened: true });
      })
      .catch((e) => sendResponse({ ok: false, opened: false, error: String(e?.message || e) }));

    return true;
  }

  if (msg?.type === "GET_LAST_ACTIVE_PRODUCT") {
    chrome.storage.session.get([LAST_ACTIVE_KEY], (stored) => {
      void chrome.runtime.lastError;
      sendResponse({ ok: true, payload: stored?.[LAST_ACTIVE_KEY] ?? null });
    });
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

// --- Auto-sync: quando cambi tab (attiva) o cambia URL della tab attiva, aggiorna la sidebar ---
chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateSidepanelForActiveTab(tabId).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // aggiorna SOLO se la tab è attiva e l'URL è cambiato o il caricamento è completato
  if (!tab?.active) return;
  if (changeInfo?.url || changeInfo?.status === "complete") {
    updateSidepanelForActiveTab(tabId).catch(() => {});
  }
});
