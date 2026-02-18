// content.js
function normalizeText(s) { return (s || "").replace(/\s+/g, " ").trim(); }
function normalizeTitle(raw) {
  let t = normalizeText(raw || "");
  if (!t) return t;

  // Capture appendix / bonus items so we can re-add them cleanly (e.g. posters)
  // Example input:
  // "Anime and manga books With Appendix) The First Slam Dunk re : Source Spelling poster"
  // Desired:
  // "The First Slam Dunk re:Source + Spelling poster"
  let appendixLabel = "";
  if (/\bwith\s+appendix\b/i.test(t)) {
    // Common bonus strings we want to preserve
    const bonusCandidates = [
      /\bspelling\s+poster\b/i,
      /\bposter\b/i,
      /\bclear\s+file\b/i,
    ];
    for (const rx of bonusCandidates) {
      const m = t.match(rx);
      if (m && m[0]) {
        // Prefer the more specific label when available
        if (/spelling\s+poster/i.test(m[0])) { appendixLabel = "Spelling poster"; break; }
        if (/poster/i.test(m[0])) appendixLabel = "Poster";
        if (/clear\s+file/i.test(m[0])) appendixLabel = "Clear file";
      }
    }
  }

  // Remove common catalog/category prefixes that make titles too long
  const prefixes = [
    /^Anime\s+and\s+manga\s+books\s+/i,
    /^Anime\s+Mook\s+/i,
    /^Mook\s+/i,
    /^PC\s+and\s+smartphone\s+game\s+books\s+/i,
    /^PC\s*&\s*smartphone\s+game\s+books\s+/i,
    /^PC\s+and\s+smartphone\s+game\s+book\s+/i,
    /^smartphone\s+game\s+books\s+/i,
    /^game\s+books\s+/i,
    /^Anime\s+book\s+/i,
    /^Art\s*book\s+/i,
    /^\(?With\s+Appendix\)?\s*/i,
  ];
  // Peel multiple prefixes if they appear stacked
  let changed = true;
  while (changed) {
    changed = false;
    for (const rx of prefixes) {
      if (rx.test(t)) { t = t.replace(rx, ""); changed = true; }
    }
  }

  // Prefer a cleaner "Art of" phrasing
  t = t.replace(/\bThe\s+Art\s+of\b/ig, "Art of");

  // Remove bonus words from the core title (we re-add a clean label below)
  if (appendixLabel) {
    t = t.replace(/\bWith\s+Appendix\)?\b\s*/ig, "");
    t = t.replace(/\bSpelling\s+poster\b/ig, "");
    if (/^Poster$/i.test(appendixLabel)) t = t.replace(/\bposter\b/ig, "");
    if (/^Clear file$/i.test(appendixLabel)) t = t.replace(/\bclear\s+file\b/ig, "");
  }

  // If "Art of" is glued to the previous clause, add a separator
  t = t.replace(/(\bReborn)\s+(Art of\b)/i, "$1 - $2");

  // Fix hyphen spacing like "-Another" -> "- Another"
  t = t.replace(/-\s*([A-Za-z])/g, "- $1");

  // Fix spacing around colons for cases like "re : Source" -> "re:Source"
  // (keep it targeted, don't collapse all colons globally)
  t = t.replace(/\bre\s*:\s*source\b/ig, "re:Source");

  // Collapse multiple spaces again
  t = normalizeText(t);

  // Smart title-casing for ALL-CAPS words (keep roman numerals)
  const isRoman = (w) => /^[IVXLCDM]+$/.test(w);
  t = t.split(" ").map(w => {
    if (/^[A-Z0-9'’:-]+$/.test(w) && /[A-Z]/.test(w) && w.length > 2 && !isRoman(w)) {
      // Keep common acronyms
      if (/^(FFXIV|FFVII|FFIX|FFX|FFXI|FFXII|FFXIII|FFXV|FFXVI)$/.test(w)) return w;
      // Preserve trailing punctuation
      const m = w.match(/^([A-Z0-9'’]+)([^A-Z0-9'’]*)$/);
      const core = m ? m[1] : w;
      const tail = m ? m[2] : "";
      return core.charAt(0) + core.slice(1).toLowerCase() + tail;
    }
    return w;
  }).join(" ");

  // Minor cleanup for common patterns
  t = t.replace(/\s+-\s+/g, " - ");
  t = normalizeText(t);

  // Re-append appendix label in a consistent form
  if (appendixLabel) {
    t = `${t} + ${appendixLabel}`;
    t = normalizeText(t);
  }

  return t;
}
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


function extractMaker() {
  const body = document.body?.innerText || "";
  // Suruga-ya EN pages often have "Maker: KADOKAWA"
  let m = body.match(/\bMaker\s*:\s*([^\n]+)/i);
  if (m && m[1]) return normalizeText(m[1]);
  // JP variants
  m = body.match(/\bメーカー\s*[:：]\s*([^\n]+)/);
  if (m && m[1]) return normalizeText(m[1]);
  return "";
}

function extractAuthor() {
  const body = document.body?.innerText || "";
  let m = body.match(/\bAuthor\s*:\s*([^\n]+)/i);
  if (m && m[1]) return normalizeText(m[1]);
  // "著:" is common
  m = body.match(/\b著\s*[:：]\s*([^\n]+)/);
  if (m && m[1]) return normalizeText(m[1]);
  return "";
}

function extractOutOfStock() {
  const body = document.body?.innerText || "";
  // Common EN/JP phrases
  if (/out\s*of\s*stock/i.test(body)) return true;
  if (/(在庫なし|品切れ|売り切れ)/.test(body)) return true;
  // Button states
  const addBtn = document.querySelector('button, a');
  // Quick check: disabled add-to-cart buttons containing "Add to cart"
  const btns = Array.from(document.querySelectorAll('button, a'));
  for (const b of btns) {
    const t = (b.innerText || "").toLowerCase();
    if (t.includes("add to cart") && (b.disabled || b.getAttribute("aria-disabled")==="true")) return true;
  }
  return false;
}

function parseYenAmount(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseEurAmount(raw) {
  if (!raw) return null;
  // Suruga-ya mostra spesso EUR con punto decimale (es. 28.07)
  const s = String(raw).trim().replace(/[^0-9.,]/g, "");
  if (!s) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized = s;

  if (hasDot && hasComma) {
    // se contiene sia punto che virgola, prendi l'ultimo come separatore decimale
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const decSep = lastDot > lastComma ? "." : ",";
    const thouSep = decSep === "." ? "," : ".";
    normalized = s.replaceAll(thouSep, "").replace(decSep, ".");
  } else if (hasComma && !hasDot) {
    // assumiamo virgola decimale
    normalized = s.replaceAll(".", "").replace(",", ".");
  } else {
    // punto decimale o solo interi
    normalized = s.replaceAll(",", "");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function extractPriceYen() {
  // best-effort: try DOM selectors first, then fallback to text scan
  const selectors = [
    "[data-test='product-price']",
    "[data-testid='product-price']",
    ".price",
    ".product-price",
    "#price",
  ];
  for (const sel of selectors) {
    const t = document.querySelector(sel)?.textContent?.trim();
    if (!t) continue;
    // supporta sia "¥ 5,106" sia "5,106JPY"
    const m1 = t.match(/[¥￥]\s*([0-9][0-9,\.]*)/);
    const m2 = t.match(/\b([0-9][0-9,\.]*)\s*JPY\b/i);
    const raw = (m1 && m1[1]) ? m1[1] : ((m2 && m2[1]) ? m2[1] : null);
    if (raw) {
      const n = parseYenAmount(raw);
      if (n != null) return n;
    }
  }

  const body = document.body?.innerText || "";

  // 0) PRIORITÀ: prezzo "Used" (su Suruga-ya è spesso quello più rilevante)
  // Esempi: "Used\n5,106JPY" oppure "Used 5,106JPY"
  const used = body.match(/\bUsed\b[\s\S]{0,80}?\b([0-9][0-9,\.]*)\s*JPY\b/i);
  if (used && used[1]) {
    const n = parseYenAmount(used[1]);
    if (n != null) return n;
  }

  // 0b) alternativa: "Used" con simbolo yen
  const usedY = body.match(/\bUsed\b[\s\S]{0,80}?[¥￥]\s*([0-9][0-9,\.]*)/i);
  if (usedY && usedY[1]) {
    const n = parseYenAmount(usedY[1]);
    if (n != null) return n;
  }

  // 1) Prefer "Price:"-like lines (reduces chance to pick shipping)
  const pref = body.match(/\b(?:price|sale\s*price|selling\s*price)\b\s*[:\-]?\s*(?:[¥￥]\s*)?([0-9][0-9,\.]*)\s*(?:JPY\b)?/i);
  if (pref && pref[1]) {
    const n = parseYenAmount(pref[1]);
    if (n != null) return n;
  }

  // 1b) "Listed price" su Suruga-ya spesso è "Listed price: 3,960JPY"
  const listed = body.match(/\bListed\s*price\b\s*[:\-]?\s*([0-9][0-9,\.]*)\s*JPY\b/i);
  if (listed && listed[1]) {
    const n = parseYenAmount(listed[1]);
    if (n != null) return n;
  }

  // 2) First yen occurrence as fallback
  const anyY = body.match(/[¥￥]\s*([0-9][0-9,\.]*)/);
  if (anyY && anyY[1]) {
    const n = parseYenAmount(anyY[1]);
    if (n != null) return n;
  }

  const anyJpy = body.match(/\b([0-9][0-9,\.]*)\s*JPY\b/i);
  if (anyJpy && anyJpy[1]) {
    const n = parseYenAmount(anyJpy[1]);
    if (n != null) return n;
  }

  return null;
}

function extractPriceEur() {
  // Suruga-ya EN spesso mostra "Reference 28.07 [Euro(EUR)]" accanto a un select.
  // In pratica può esserci un a-capo tra numero e "Euro(EUR)", quindi accettiamo anche testo intermedio.
  const body = document.body?.innerText || "";

  // 1) Robust: "Reference <numero> ... Euro(EUR)" entro una finestra di caratteri
  const m = body.match(/\bReference\b\s*([0-9]+(?:[\.,][0-9]+)?)\b[\s\S]{0,60}?(?:Euro\s*\(\s*EUR\s*\)|\bEUR\b|\bEuro\b)/i);
  if (m && m[1]) {
    const n = parseEurAmount(m[1]);
    if (n != null) return n;
  }

  // 2) Fallback: se c'è "Reference" ma non c'è "Euro" vicino, prendi comunque il primo numero dopo Reference
  // (alcune pagine rendono il selettore valuta in modo non testuale nel body)
  const mRefOnly = body.match(/\bReference\b\s*([0-9]+(?:[\.,][0-9]+)?)/i);
  if (mRefOnly && mRefOnly[1]) {
    const n = parseEurAmount(mRefOnly[1]);
    if (n != null) return n;
  }

  // fallback: cerca un valore in EUR esplicito "€" (più raro)
  const m2 = body.match(/[€]\s*([0-9]+(?:[\.,][0-9]+)?)/);
  if (m2 && m2[1]) {
    const n = parseEurAmount(m2[1]);
    if (n != null) return n;
  }
  return null;
}

function buildPayloadIfProduct() {
  if (!isProbablyProductPage()) return null;

  const titleRaw = normalizeTitle(extractTitleRaw());
  const titleJp = extractTitleJp();
  const coverUrl = extractCoverUrl();
  const pages = extractPages();
  const priceYen = extractPriceYen();
  const priceEur = extractPriceEur();

  if (!titleRaw || !coverUrl) return null;

    const maker = extractMaker();
  const author = extractAuthor();
  const outOfStock = extractOutOfStock();

  return { url: location.href, coverUrl, titleRaw, titleJp, author, maker, pages, priceYen, priceEur, outOfStock };
}

function ensureFab() {
  let fab = document.getElementById("syFab");
  if (fab) return fab;
  fab = document.createElement("button");
  fab.id = "syFab";
  fab.type = "button";
  fab.dataset.open = "0";
    fab.innerHTML =
    '<span class="icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">  <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/>  <path d="M16.2 16.2L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    + '</span>'
    + '<span class="label">Artbook Info</span>'
    + '';
  fab.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_SIDEPANEL" }, () => void chrome.runtime.lastError);
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
  if (msg?.type === "SIDEPANEL_STATE") {
    const fab = document.getElementById("syFab");
    if (fab) {
      fab.dataset.open = msg?.isOpen ? "1" : "0";
      const a = fab.querySelector(".arrow");
      if (a) a.textContent = msg?.isOpen ? ">" : "<";
    }
    sendResponse?.({ ok: true });
    return true;
  }
  
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
