// sidepanel.js
const el = {
  status: document.getElementById("status"),
  cover: document.getElementById("cover"),
  titleRaw: document.getElementById("titleRaw"),
  titleJp: document.getElementById("titleJp"),
  titleSep: document.getElementById("titleSep"),
  pages: document.getElementById("pages"),
  amazonEn: document.getElementById("amazonEn"),
  ebayEn: document.getElementById("ebayEn"),
  amazonJp: document.getElementById("amazonJp"),
  ebayJp: document.getElementById("ebayJp"),
  lens: document.getElementById("lens"),
  yt: document.getElementById("yt"),
  historyList: document.getElementById("historyList"),
  clearHistory: document.getElementById("clearHistory"),
};

const HISTORY_KEY = "searchHistory:v1";
const HISTORY_LIMIT = 200;      // salviamo più elementi...
const HISTORY_VISIBLE_MAX = 4;  // ...ma la UI ne mostra ~4 alla volta con scroll

let lastUrl = null;

function normalizeText(s) { return (s || "").replace(/\s+/g, " ").trim(); }

function absolutizeUrl(u) {
  if (!u) return "";
  if (u.startsWith("//")) return "https:" + u;
  return u;
}

function youtubeSearchUrl(q) {
  const qq = encodeURIComponent(((q || "") + " flipthrough").trim());
  return `https://www.youtube.com/results?search_query=${qq}`;
}

async function tryFindFirstYoutubeVideo(q) {
  const url = youtubeSearchUrl(q);
  try {
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (!m) return null;
    return `https://www.youtube.com/watch?v=${m[1]}`;
  } catch {
    return null;
  }
}

function clearUi(message = "") {
  el.status.textContent = message;
  el.cover.style.display = "none";

  el.titleRaw.textContent = ""; if (el.titleRaw) el.titleRaw.removeAttribute("href");
  el.titleRaw.removeAttribute("href");

  el.titleJp.style.display = "none";
  el.titleJp.textContent = "";

  el.pages.textContent = "—";
}

async function loadHistory() {
  const out = await chrome.storage.local.get([HISTORY_KEY]);
  const arr = Array.isArray(out?.[HISTORY_KEY]) ? out[HISTORY_KEY] : [];
  return arr;
}

async function saveHistory(arr) {
  await chrome.storage.local.set({ [HISTORY_KEY]: arr.slice(0, HISTORY_LIMIT) });
}

function historyItemFromPayload(p) {
  return {
    url: p.url || "",
    titleRaw: normalizeText(p.titleRaw || ""),
    titleJp: normalizeText(p.titleJp || ""),
    cover: p.coverDataUrl || p.coverUrl || "",
    detectedAt: Number.isFinite(p.detectedAt) ? p.detectedAt : Date.now(),
  };
}

async function pushHistory(p) {
  if (!p?.url) return;
  const item = historyItemFromPayload(p);
  const arr = await loadHistory();

  // dedup by url
  const next = [item, ...arr.filter(x => x?.url && x.url !== item.url)];
  await saveHistory(next);
  renderHistory(next);
}

async function removeHistory(url) {
  const arr = await loadHistory();
  const next = arr.filter(x => x?.url !== url);
  await saveHistory(next);
  renderHistory(next);
}

async function clearHistoryAll() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  renderHistory([]);
}

function renderHistory(arr) {
  if (!el.historyList) return;

  el.historyList.innerHTML = "";

  const list = Array.isArray(arr) ? arr : [];
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "status";
    empty.textContent = "No recent searches yet.";
    el.historyList.appendChild(empty);
    return;
  }

  for (const item of list) {
    const row = document.createElement("div");
    row.className = "hItem";
    row.setAttribute("role", "listitem");

    row.addEventListener("click", () => {
      if (item.url) chrome.tabs.create({ url: item.url });
    });

    const img = document.createElement("img");
    img.className = "hCover";
    img.alt = "Cover";
    img.loading = "lazy";
    img.src = absolutizeUrl(item.cover || "");
    row.appendChild(img);

    const mid = document.createElement("div");
    mid.className = "hMid";

    const t = document.createElement("div");
    t.className = "hTitle";
    t.textContent = item.titleRaw || "—";
    mid.appendChild(t);

    const s = document.createElement("div");
    s.className = "hSub";
    s.textContent = item.titleJp || item.url || "";
    mid.appendChild(s);

    row.appendChild(mid);

    const del = document.createElement("button");
    del.className = "hDel";
    del.type = "button";
    del.textContent = "×";
    del.title = "Remove";
    del.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (item.url) removeHistory(item.url).catch(() => {});
    });
    row.appendChild(del);

    el.historyList.appendChild(row);
  }
}

async function render(p) {
  if (!p) {
    clearUi("");
    return;
  }

  if (p.url && p.url === lastUrl) return;
  lastUrl = p.url || null;

  el.status.textContent = "";

  el.titleRaw.textContent = p.titleRaw || "";
  if (p.url && el.titleRaw) el.titleRaw.href = p.url;

  if (p.titleJp) {
    el.titleJp.textContent = p.titleJp;
    el.titleJp.style.display = "";
    if (el.titleSep) el.titleSep.style.display = "";
  } else {
    el.titleJp.style.display = "none";
    if (el.titleSep) el.titleSep.style.display = "none";
  }

  // COVER: preferisci coverDataUrl per render sempre (no hotlink)
  const coverSrc = absolutizeUrl(p.coverDataUrl || p.coverUrl || "");
  if (coverSrc) {
    el.cover.src = coverSrc;
    el.cover.style.display = "block";
  } else {
    el.cover.style.display = "none";
  }

  el.pages.textContent = Number.isFinite(p.pages) ? String(p.pages) : "—";

  const qEn = (p.titleRaw || "").trim();
  const qJp = (p.titleJp || "").trim();

  el.amazonEn.href = `https://www.amazon.com/s?k=${encodeURIComponent(qEn)}`;
  el.ebayEn.href = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(qEn)}`;

  el.amazonJp.href = `https://www.amazon.co.jp/s?k=${encodeURIComponent(qJp || qEn)}`;
  el.ebayJp.href = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(qJp || qEn)}&LH_PrefLoc=2`;

  // Lens con cover URL originale (più probabile che Lens la legga)
  const lensImg = absolutizeUrl(p.coverUrl || "");
  el.lens.href = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(lensImg)}`;

  // YouTube: prova primo video, altrimenti search
  const ytQ = (qEn || qJp).trim();
  el.yt.href = youtubeSearchUrl(ytQ);
  const first = await tryFindFirstYoutubeVideo(ytQ);
  if (first) el.yt.href = first;

  // aggiorna storico
  pushHistory(p).catch(() => {});
}

async function init() {
  // carica storico al boot
  renderHistory(await loadHistory());

  el.clearHistory?.addEventListener("click", () => {
    clearHistoryAll().catch(() => {});
  });

  // inizializza con la tab corrente
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs?.[0]?.id;

  chrome.runtime.sendMessage({ type: "GET_LAST_PRODUCT", tabId }, (resp) => {
    if (chrome.runtime.lastError) {
      clearUi("");
      return;
    }
    const p = resp?.payload ?? null;
    if (p) {
      render(p).catch(() => {});
      return;
    }
    // se la tab corrente non ha un risultato (es. non Suruga-ya), mostra l'ultimo risultato valido
    chrome.runtime.sendMessage({ type: "GET_LAST_ACTIVE_PRODUCT" }, (r2) => {
      if (chrome.runtime.lastError) return;
      render(r2?.payload ?? null).catch(() => {});
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SIDEPANEL_UPDATE") {
      // sicurezza: se arriva un payload nullo, non svuotare la UI (mantieni l'ultimo risultato)
      if (msg.payload == null) return;
      render(msg.payload).catch(() => {});
    }
  });
}

init().catch((e) => {
  clearUi("Init error: " + (e?.message || e));
});
