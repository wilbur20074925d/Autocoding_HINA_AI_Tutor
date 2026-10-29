/** Normal browsable pages (extension cannot run on chrome:// etc.). */
export const WEB_TAB_URL_PATTERNS = ['http://*/*', 'https://*/*', 'file://*/*', 'ftp://*/*'] as const;

export const BLOCKED_PAGE_SCHEMES = /^(chrome:|chrome-extension:|edge:|devtools:|view-source:|about:|chrome-search:|chrome-devtools:)/i;

export function isWebPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (BLOCKED_PAGE_SCHEMES.test(url)) return false;
  return /^(https?|file|ftp):\/\//i.test(url);
}
