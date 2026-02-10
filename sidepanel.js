// sidepanel.js
const el = {
  status: document.getElementById("status"),
  cover: document.getElementById("cover"),
  titleRaw: document.getElementById("titleRaw"),
  titleJp: document.getElementById("titleJp"),
  pages: document.getElementById("pages"),
  amazonEn: document.getElementById("amazonEn"),
  ebayEn: document.getElementById("ebayEn"),
  amazonJp: document.getElementById("amazonJp"),
  ebayJp: document.getElementById("ebayJp"),
  lens: document.getElementById("lens"),
  yt: document.getElementById("yt")
};

function setText(node, value, fallback = "—") {
  node.textContent = (value && String(value).trim()) ? String(value).trim() : fallback;
}
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
    const m = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!m || !m[1]) return null;
    return `https://www.youtube.com/watch?v=${m[1]}`;
  } catch {
    return null;
  }
}

function clearUi() {
  el.status.textContent = "Apri una pagina prodotto su Suruga-ya (EN).";
  el.cover.style.display = "none";
  el.titleRaw.textContent = "";
  el.titleJp.style.display = "none";
  setText(el.pages, null);
}

let lastUrl = null;

async function render(p) {
  if (!p) return clearUi();
  if (p.url && p.url === lastUrl) return;
  lastUrl = p.url || null;

  el.status.textContent = "";

  el.titleRaw.textContent = p.titleRaw || "";
  if (p.titleJp) {
    el.titleJp.textContent = p.titleJp;
    el.titleJp.style.display = "";
  } else {
    el.titleJp.style.display = "none";
  }

  // COVER: preferisci coverDataUrl per render sempre (no hotlink)
  const coverSrc = absolutizeUrl(p.coverDataUrl || p.coverUrl || "");
  if (coverSrc) {
    el.cover.src = coverSrc;
    el.cover.style.display = "block";
  } else {
    el.cover.style.display = "none";
  }

  setText(el.pages, Number.isFinite(p.pages) ? String(p.pages) : null);

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
}

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs?.[0]?.id;

  chrome.runtime.sendMessage({ type: "GET_LAST_PRODUCT", tabId }, (resp) => {
    if (chrome.runtime.lastError) {
      el.status.textContent = "Errore: " + chrome.runtime.lastError.message;
      return;
    }
    render(resp?.payload ?? null);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SIDEPANEL_UPDATE") render(msg.payload ?? null);
  });
}

init().catch((e) => {
  el.status.textContent = "Init error: " + (e?.message || e);
});
