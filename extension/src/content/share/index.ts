import {
  scrapeSharePageTranscript,
  turnsToLabeledTranscript,
  waitForShareTurns,
} from './shareDomScrape';

const MSG = 'HINA_SCRAPE_SHARE_PAGE';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MSG) return false;

  void (async () => {
    try {
      let transcript: string | null = scrapeSharePageTranscript()?.transcript ?? null;
      if (!transcript) {
        const turns = await waitForShareTurns();
        transcript = turnsToLabeledTranscript(turns);
      }
      if (!transcript?.trim()) {
        sendResponse({ ok: false, error: 'No conversation blocks found on this share page.' });
        return;
      }
      sendResponse({ ok: true, transcript, url: location.href });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});

console.info('[HINA Capture] Share page helper loaded', location.href);
