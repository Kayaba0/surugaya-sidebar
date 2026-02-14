// content.js
function normalizeText(s) { return (s || "").replace(/\s+/g, " ").trim(); }
function isProductUrl() { return /\/en\/product\//i.test(location.pathname); }
function hasOgBasics() {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim();
  const ogImage = document.querySelector('meta[property="og:image"]')?.content?.trim();
  return !!(ogTitle && ogImage);
}
function isProbablyProductPage() { return isProductUrl() && hasOgBasics(); }

function absolutizeUrl(u) {
  if (!u) return "";
  if (u.startsWith("//")) return "https:" + u;
  return u;
}

function extractCoverUrl() {
  return absolutizeUrl(document.querySelector('meta[property="og:image"]')?.content?.trim() || "");
}
function extractTitleRaw() {
  return (
    document.querySelector("h1")?.textContent?.trim() ||
    document.querySelector('meta[property="og:title"]')?.content?.trim() ||
    document.title?.trim() ||
    ""
  );
}
function extractTitleJp() {
  const bodyText = document.body?.innerText || "";
  const m = bodyText.match(/Japanese\s*title\s*:\s*(.+)/i);
  if (m && m[1]) return normalizeText(m[1].split("\n")[0]);
  return "";
}
function findPagesInText(text) {
  const t = (text || "").toLowerCase();
  const patterns = [
    /\b(\d{1,5})\s*page\s*specification\b/i,
    /\bpages?\s*[:\-]?\s*(\d{1,5})\b/i,
    /\b(\d{1,5})\s*pages?\b/i
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0 && n < 50000) return n;
    }
  }
  return null;
}
function extractPages() {
  const body = document.body?.innerText || "";
  return findPagesInText(body);
}

function buildPayloadIfProduct() {
  if (!isProbablyProductPage()) return null;

  const titleRaw = extractTitleRaw();
  const titleJp = extractTitleJp();
  const coverUrl = extractCoverUrl();
  const pages = extractPages();

  if (!titleRaw || !coverUrl) return null;

  return { url: location.href, coverUrl, titleRaw, titleJp, pages };
}

function ensureFab() {
  let fab = document.getElementById("syFab");
  if (fab) return fab;
  fab = document.createElement("button");
  fab.id = "syFab";
  fab.type = "button";
  fab.innerHTML = '<span class="dot"></span><span>Artbook Info</span>';
  fab.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" }, () => void chrome.runtime.lastError);
  });
  (document.body || document.documentElement).appendChild(fab);
  return fab;
}

let lastSentHref = null;

function sendIfProduct() {
  const fab = ensureFab();
  const payload = buildPayloadIfProduct();

  if (!payload) {
    fab.style.display = "none";
    return;
  }

  fab.style.display = "inline-flex";
  fab.style.alignItems = "center";
  fab.style.gap = "8px";

  if (lastSentHref === location.href) return;
  lastSentHref = location.href;

  chrome.runtime.sendMessage({
    type: "PRODUCT_DETECTED",
    payload
  }, () => void chrome.runtime.lastError);
}

// consenti al sidepanel di forzare la scansione della tab corrente
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SCAN_NOW") {
    const payload = buildPayloadIfProduct();
    sendResponse({ ok: true, payload });
    return true;
  }
  return false;
});

sendIfProduct();
setTimeout(sendIfProduct, 900);

const obs = new MutationObserver(() => {
  if (location.href !== lastSentHref) sendIfProduct();
});
obs.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", () => sendIfProduct());
