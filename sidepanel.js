// sidepanel.js
// Handle close request from background (no animation)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SIDEPANEL_CLOSE_REQUEST") {
    chrome.runtime.sendMessage({ type: "SIDEPANEL_CLOSE_ANIM_DONE", tabId: msg?.tabId }, () => void chrome.runtime.lastError);
    sendResponse?.({ ok: true });
    return true;
  }
  return false;
});


const el = {
  status: document.getElementById("status"),
  cover: document.getElementById("cover"),
  titleRaw: document.getElementById("titleRaw"),
  titleJp: document.getElementById("titleJp"),
  titleSep: document.getElementById("titleSep"),
  pages: document.getElementById("pages"),
  priceEur: document.getElementById("priceEur"),
  priceYen: document.getElementById("priceYen"),
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


const PAGES_CACHE_KEY = "sy_pages_cache_v1";
const PAGES_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

async function loadPagesCache() {
  const obj = await chrome.storage.local.get(PAGES_CACHE_KEY);
  return obj?.[PAGES_CACHE_KEY] && typeof obj[PAGES_CACHE_KEY] === "object" ? obj[PAGES_CACHE_KEY] : {};
}

async function getCachedPages(cacheKey) {
  if (!cacheKey) return null;
  const cache = await loadPagesCache();
  const hit = cache[cacheKey];
  if (!hit || !Number.isFinite(hit.pages)) return null;
  const ts = Number.isFinite(hit.ts) ? hit.ts : 0;
  if (Date.now() - ts > PAGES_CACHE_TTL_MS) return null;
  return hit.pages;
}

async function setCachedPages(cacheKey, pages) {
  if (!cacheKey || !Number.isFinite(pages)) return;
  const cache = await loadPagesCache();
  cache[cacheKey] = { pages, ts: Date.now() };
  await chrome.storage.local.set({ [PAGES_CACHE_KEY]: cache });
}

function makePagesCacheKey(p) {
  // Prefer ISBN if we ever add it; for now use maker+author+title
  const t = normalizeText((p.titleJp || p.titleRaw || "").toLowerCase());
  const a = normalizeText((p.author || "").toLowerCase());
  const m = normalizeText((p.maker || "").toLowerCase());
  if (!t) return "";
  return `t:${t}|a:${a}|m:${m}`.slice(0, 220);
}

function tokenOverlapScore(a, b) {
  const A = new Set(normalizeText(a).toLowerCase().split(/\s+/).filter(Boolean));
  const B = new Set(normalizeText(b).toLowerCase().split(/\s+/).filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(A.size, B.size);
}

async function resolvePagesTextFirst(p) {
  const queryTitle = normalizeText(p.titleJp || p.titleRaw || "");
  if (!queryTitle) return null;

  // --- 1) Google Books ---
  try {
    const qParts = [];
    // use quoted title to reduce noise
    qParts.push(`intitle:"${queryTitle.replace(/"/g, "")}"`);
    const author = normalizeText(p.author || "");
    if (author) qParts.push(`inauthor:"${author.replace(/"/g, "")}"`);
    const q = qParts.join("+");
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`;
    const r = await fetch(url);
    if (r.ok) {
      const data = await r.json();
      const items = Array.isArray(data.items) ? data.items : [];
      let best = null;
      for (const it of items) {
        const vi = it?.volumeInfo || {};
        const pc = vi.pageCount;
        if (!Number.isFinite(pc) || pc <= 0) continue;
        const tScore = tokenOverlapScore(queryTitle, vi.title || "");
        let aScore = 0;
        const viAuthors = Array.isArray(vi.authors) ? vi.authors.join(" ") : "";
        if (author && viAuthors) aScore = tokenOverlapScore(author, viAuthors);
        let mScore = 0;
        const maker = normalizeText(p.maker || "");
        if (maker && vi.publisher) mScore = tokenOverlapScore(maker, vi.publisher);
        const score = tScore * 0.65 + aScore * 0.25 + mScore * 0.10;
        if (!best || score > best.score) best = { pages: pc, score };
      }
      if (best && best.score >= 0.35) return best.pages;
    }
  } catch (e) {
    // ignore
  }

  // --- 2) Wikidata entity search + number of pages (P1104) ---
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(queryTitle)}&language=ja&format=json&limit=5&origin=*`;
    const r1 = await fetch(searchUrl);
    if (r1.ok) {
      const s = await r1.json();
      const results = Array.isArray(s.search) ? s.search : [];
      for (const res of results) {
        const id = res?.id;
        if (!id) continue;
        const entUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(id)}&format=json&props=claims&origin=*`;
        const r2 = await fetch(entUrl);
        if (!r2.ok) continue;
        const ent = await r2.json();
        const claims = ent?.entities?.[id]?.claims;
        const p1104 = claims?.P1104;
        if (Array.isArray(p1104) && p1104[0]?.mainsnak?.datavalue?.value?.amount) {
          const amt = p1104[0].mainsnak.datavalue.value.amount; // string like "+160"
          const n = parseInt(String(amt).replace(/[^0-9]/g, ""), 10);
          if (Number.isFinite(n) && n > 0 && n < 50000) return n;
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}
const HISTORY_LIMIT = 200;      // salviamo più elementi...

const FX_KEY = "fx:jpy_eur:v1";
const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

function formatYen(n) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.round(n);
  return `¥${v.toLocaleString("en-US")}`;
}

function formatEur(n) {
  if (!Number.isFinite(n)) return "—";
  // due decimali, virgola italiana
  return `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getJpyToEurRate() {
  try {
    const cached = await chrome.storage.local.get([FX_KEY]);
    const obj = cached?.[FX_KEY];
    if (obj && typeof obj === "object") {
      const ts = Number(obj.ts);
      const rate = Number(obj.rate);
      if (Number.isFinite(ts) && Number.isFinite(rate) && rate > 0) {
        if ((Date.now() - ts) < FX_MAX_AGE_MS) return rate;
      }
    }
  } catch {
    // ignore cache errors
  }

  // fetch fresh rate (best-effort)
  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=JPY&symbols=EUR", {
      credentials: "omit",
      cache: "no-store"
    });
    if (!res.ok) return null;
    const json = await res.json();
    const rate = Number(json?.rates?.EUR);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    await chrome.storage.local.set({ [FX_KEY]: { ts: Date.now(), rate } });
    return rate;
  } catch {
    return null;
  }
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

  el.titleRaw.textContent = "";
  el.titleRaw.removeAttribute("href");

  el.titleJp.style.display = "none";
  el.titleJp.textContent = "";
  if (el.titleSep) el.titleSep.style.display = "none";

  el.pages.textContent = "—";

  if (el.priceEur) el.priceEur.textContent = "—";
  if (el.priceYen) el.priceYen.textContent = "(—)";
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
    priceYen: Number.isFinite(p.priceYen) ? p.priceYen : null,
    priceEur: Number.isFinite(p.priceEur) ? p.priceEur : null,
    outOfStock: !!p.outOfStock,
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

    // price badge (left of the X)
    const showEur = Number.isFinite(item.priceEur);
    const showYen = Number.isFinite(item.priceYen);
    const isOos = !!item.outOfStock;
    if (isOos || showEur || showYen) {
      const price = document.createElement("div");
      price.className = "hPrice";
      price.textContent = isOos ? "OoS" : (showEur ? formatEur(item.priceEur) : formatYen(item.priceYen));
      row.appendChild(price);
    }

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

// Pages autofill (transparent): only when missing
if (!Number.isFinite(p.pages)) {
  const cacheKey = makePagesCacheKey(p);
  const cached = await getCachedPages(cacheKey);
  if (Number.isFinite(cached)) {
    el.pages.textContent = String(cached);
  } else {
    const resolved = await resolvePagesTextFirst(p);
    if (Number.isFinite(resolved)) {
      el.pages.textContent = String(resolved);
      await setCachedPages(cacheKey, resolved);
    }
  }
}

  // Price: show EUR big + JPY inline (best-effort conversion)
  let priceYen = Number.isFinite(p.priceYen) ? p.priceYen : null;
  if (el.priceYen) el.priceYen.textContent = priceYen != null ? `(${formatYen(priceYen)})` : "(—)";

  // 1) Preferisci il valore EUR già presente in pagina (più accurato rispetto al FX esterno)
  let priceEur = Number.isFinite(p.priceEur) ? p.priceEur : null;

  // 2) fallback: se non c'è EUR in pagina, prova conversione best-effort via FX
  if (priceEur == null && priceYen != null) {
    const rate = await getJpyToEurRate();
    if (Number.isFinite(rate) && rate > 0) priceEur = priceYen * rate;
  }
  if (p.outOfStock) {
    if (el.priceEur) el.priceEur.textContent = "Out of stock";
    if (el.priceYen) el.priceYen.textContent = "";
    priceEur = null;
    priceYen = null;
  } else {
    if (el.priceEur) el.priceEur.textContent = priceEur != null ? formatEur(priceEur) : "—";
  }

  // keep computed price for history
  p.priceYen = priceYen;
  p.priceEur = priceEur;

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
