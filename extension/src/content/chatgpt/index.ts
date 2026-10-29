import { BG_MESSAGE, type ScrapePayload } from '../../shared/scrapeTypes';
import { scrapeChatGptDom } from './scrapeChatGpt';

const DEBOUNCE_MS = 450;
const POLL_MS = 2500;

let lastFingerprint = '';
let debounceTimer: number | undefined;

function emitScrape(payload: ScrapePayload): void {
  if (!payload.fingerprint || payload.fingerprint === lastFingerprint) return;
  lastFingerprint = payload.fingerprint;
  void chrome.runtime.sendMessage({ type: BG_MESSAGE.SCRAPE, payload }).catch(() => {
    /* side panel / background may be asleep */
  });
}

function scheduleScrape(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    const payload = scrapeChatGptDom();
    if (payload.turns.length > 0) emitScrape(payload);
  }, DEBOUNCE_MS);
}

function boot(): void {
  scheduleScrape();
  const observer = new MutationObserver(() => scheduleScrape());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  window.setInterval(() => {
    const payload = scrapeChatGptDom();
    if (payload.turns.length > 0 && payload.fingerprint !== lastFingerprint) {
      emitScrape(payload);
    }
  }, POLL_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/** Allow manual scrape from devtools: window.__HINA_SCRAPE_CHATGPT__() */
declare global {
  interface Window {
    __HINA_SCRAPE_CHATGPT__?: () => ScrapePayload;
  }
}
window.__HINA_SCRAPE_CHATGPT__ = scrapeChatGptDom;
