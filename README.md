# Suruga-ya Sidebar

Browser extension for Microsoft Edge that enhances product pages on **suruga-ya.com/en** by providing a modern side panel with visual and marketplace references for books and artbooks.

The extension adds a floating action button (FAB) on product pages, allowing users to open a dark, glass-style sidebar with relevant information and external search links.

---

## Features

- Automatic detection of Suruga-ya product pages (EN)
- Floating button to open the Edge Side Panel
- Dark, glass-style minimal UI
- Book cover displayed in the sidebar (always visible via dataURL conversion)
- Product title (as provided by Suruga-ya)
- Japanese title when available
- Page count extraction (best-effort)
- Quick links to:
  - Amazon
  - eBay
  - Amazon Japan
  - eBay (JP)
- Visual search via Google Lens
- YouTube flipthrough search (best-effort)

---

## How It Works

1. The content script detects Suruga-ya product pages and injects a floating button.
2. When a product is detected, metadata (title, cover, pages) is sent to the background service worker.
3. The background worker caches the data and converts the cover image into a data URL to ensure reliable rendering.
4. The Edge Side Panel displays the information and external links.

---

## Installation (Development)

1. Open Microsoft Edge and navigate to: edge://extensions/
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project folder containing `manifest.json`

Navigate to a product page on `https://www.suruga-ya.com/en/` and use the floating button to open the sidebar.

---

## Project Structure
.
├── manifest.json
├── background.js
├── content.js
├── content.css
├── sidepanel.html
├── sidepanel.js
├── sidepanel.css
└── icons/


---

## Technical Notes

- Built using **Manifest V3**
- Uses the **Edge Side Panel API**
- No external API keys required
- YouTube and Lens integrations are best-effort and may depend on third-party page behavior

---

## License

This project is released under the MIT License.

