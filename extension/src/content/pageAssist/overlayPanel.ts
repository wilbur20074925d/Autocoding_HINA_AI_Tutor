import type { TutorOverlayMessage } from '../../shared/tutorMessages';
import { TUTOR_MSG } from '../../shared/tutorMessages';
import { renderMarkdownLite } from '../../shared/markdownLite';
import { extractTrailingQuestion } from '../../shared/tutorMessageUi';
import {
  readOverlayBranding,
  tutorIconUrl,
  type OverlayBranding,
  OVERLAY_BRANDING_KEY,
} from '../../shared/overlayBranding';

const ROOT_ID = 'hina-tutor-overlay-root';
const THINKING_ROW_ID = 'hina-tutor-thinking-row';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeDataImageUrl(url: string | undefined): string | null {
  if (!url || !url.startsWith('data:image/')) return null;
  return url;
}

function cropToDataUrl(
  img: HTMLImageElement,
  rect: { x: number; y: number; width: number; height: number }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not crop the screenshot.');
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export class TutorOverlayPanel {
  private root: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private cropInline: HTMLElement | null = null;
  private cropFrame: HTMLElement | null = null;
  private cropImg: HTMLImageElement | null = null;
  private cropBox: HTMLElement | null = null;
  private composerEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private hdrTutorImg: HTMLImageElement | null = null;
  private branding: OverlayBranding | null = null;
  private brandingListener: ((changes: { [key: string]: chrome.storage.StorageChange }) => void) | null = null;
  private minimized = false;
  private cropDrag: { x: number; y: number } | null = null;
  private cropBusy = false;
  /** User dragged the panel — do not snap back to bottom-right on updates. */
  private userPlaced = false;
  /** Hide the tutor panel so full-page drag selection receives clicks. */
  suspendForRegionCapture(): void {
    const el = document.getElementById(ROOT_ID);
    if (el) el.style.display = 'none';
  }

  resumeAfterRegionCapture(): void {
    const el = document.getElementById(ROOT_ID);
    if (el) el.style.display = '';
  }

  ensureMounted(): void {
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      this.bindRefs();
      this.wireChrome(existing);
      this.wireCropHandlers();
      this.wireMessageActions();
      return;
    }

    const host = document.createElement('div');
    host.id = ROOT_ID;
    host.innerHTML = `
<style>
  #${ROOT_ID} {
    all: initial;
    position: fixed !important;
    right: 16px;
    bottom: 16px;
    left: auto;
    top: auto;
    width: min(392px, calc(100vw - 32px));
    max-height: min(540px, 72vh);
    z-index: 2147483647 !important;
    pointer-events: auto !important;
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    font-size: 13px;
    color: #0f172a;
    box-shadow: 0 28px 80px -32px rgba(15,23,42,.55);
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    background: #fff;
    display: flex;
    flex-direction: column;
    transition: box-shadow .2s ease, transform .2s ease;
  }
  #${ROOT_ID}:hover { box-shadow: 0 32px 88px -28px rgba(15,23,42,.5); }
  #${ROOT_ID}.minimized {
    max-height: 48px;
    width: auto;
    min-width: 200px;
    border-radius: 999px;
    overflow: hidden;
  }
  #${ROOT_ID}.minimized .hdr { border-radius: 999px; padding: 10px 14px; }
  #${ROOT_ID}.busy .hdr-dot { animation: hina-pulse 1s ease-in-out infinite; }
  @keyframes hina-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes hina-spin { to { transform: rotate(360deg); } }
  #${ROOT_ID} * { box-sizing: border-box; }
  #${ROOT_ID} .hdr {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 12px;
    background: linear-gradient(135deg, #f8fafc 0%, #fff 50%, #f1f5f9 100%);
    border-bottom: 1px solid #e2e8f0;
    color: #0f172a;
    cursor: move; user-select: none; flex-shrink: 0;
  }
  #${ROOT_ID} .hdr-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
  #${ROOT_ID} .hdr-mark {
    width: 28px; height: 28px; border-radius: 10px; background: #1e293b;
    color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 2px rgba(15,23,42,.15);
  }
  #${ROOT_ID} .hdr-title { font-size: 13px; font-weight: 600; letter-spacing: -.02em; }
  #${ROOT_ID} .hdr-sub { font-size: 10px; font-weight: 500; color: #64748b; margin-top: 1px; }
  #${ROOT_ID} .hdr-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #10b981; flex-shrink: 0;
  }
  #${ROOT_ID} .hdr-actions { display: flex; gap: 4px; flex-shrink: 0; }
  #${ROOT_ID} .hdr button {
    all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; line-height: 1; color: #475569;
    border: 1px solid #e2e8f0; background: #fff;
    transition: background .15s, border-color .15s, color .15s;
  }
  #${ROOT_ID} .hdr button:hover { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
  #${ROOT_ID} .body { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  #${ROOT_ID} .crop-inline {
    margin-bottom: 10px; border-radius: 14px; border: 1px dashed #94a3b8;
    background: #fff; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.06);
    animation: hina-in .25s ease-out;
  }
  #${ROOT_ID} .crop-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 8px 10px; color: #334155; font-size: 11px; font-weight: 600;
    background: linear-gradient(180deg,#f1f5f9,#e2e8f0);
    border-bottom: 1px solid #e2e8f0;
  }
  #${ROOT_ID} .crop-toolbar button {
    all: unset; cursor: pointer; padding: 4px 10px; border-radius: 8px;
    border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font-size: 11px; font-weight: 600;
  }
  #${ROOT_ID} .crop-toolbar button:hover { background: #f8fafc; border-color: #94a3b8; }
  #${ROOT_ID} .crop-frame { position: relative; max-height: min(220px, 36vh); overflow: auto; cursor: crosshair; background: #0f172a; }
  #${ROOT_ID} .crop-img { display: block; width: 100%; height: auto; max-height: min(220px, 36vh); object-fit: contain; user-select: none; }
  #${ROOT_ID} .bubble .shot {
    margin: 6px 0 4px; border-radius: 10px; overflow: hidden;
    border: 1px solid rgba(148,163,184,.35);
  }
  #${ROOT_ID} .bubble.user .shot { border-color: #475569; }
  #${ROOT_ID} .bubble .shot img {
    display: block; width: 100%; max-height: 168px; object-fit: contain;
    background: #020617; cursor: zoom-in;
  }
  #${ROOT_ID} .bubble.assistant .shot img { background: #f8fafc; }
  #${ROOT_ID} .crop-box {
    position: absolute; border: 2px solid #94a3b8; background: rgba(30,41,59,.35);
    display: none; pointer-events: none; border-radius: 4px;
    box-shadow: 0 0 0 9999px rgba(15,23,42,.45);
  }
  #${ROOT_ID} .msgs {
    flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 12px;
    background: linear-gradient(180deg,#f8fafc,#fff); min-height: 96px;
    scroll-behavior: smooth; -webkit-overflow-scrolling: touch;
  }
  #${ROOT_ID} .empty {
    text-align: center; padding: 20px 12px; color: #64748b; font-size: 12px; font-weight: 500; line-height: 1.5;
  }
  #${ROOT_ID} .empty strong { color: #334155; display: block; margin-bottom: 4px; font-size: 13px; }
  #${ROOT_ID} .msg-row {
    display: flex; gap: 8px; margin-bottom: 12px; align-items: flex-end;
    animation: hina-in .25s ease-out;
  }
  #${ROOT_ID} .msg-row.assistant { align-items: flex-start; }
  @keyframes hina-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  #${ROOT_ID} .msg-row.user { flex-direction: row-reverse; }
  #${ROOT_ID} .msg-row .bubble-wrap { min-width: 0; width: 100%; max-width: calc(100% - 36px); flex: 1 1 auto; }
  #${ROOT_ID} .msg-row.assistant .bubble-wrap { max-width: calc(100% - 36px); }
  #${ROOT_ID} .msg-row.user .bubble-wrap { display: flex; justify-content: flex-end; }
  #${ROOT_ID} .avatar {
    width: 28px; height: 28px; border-radius: 999px; flex-shrink: 0;
    overflow: hidden; border: 1px solid #e2e8f0; background: #f1f5f9;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: #475569;
  }
  #${ROOT_ID} .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  #${ROOT_ID} .bubble {
    padding: 10px 11px; border-radius: 14px; line-height: 1.5;
    white-space: normal; word-break: break-word; max-width: 100%;
  }
  #${ROOT_ID} .bubble .role {
    display: block; font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .08em; margin-bottom: 4px; color: #64748b;
  }
  #${ROOT_ID} .bubble.user {
    background: #f1f5f9; color: #0f172a; border: 1px solid #e2e8f0; border-bottom-right-radius: 6px;
    word-wrap: break-word; overflow-wrap: anywhere; max-width: 100%;
  }
  #${ROOT_ID} .bubble.user .content { line-height: 1.6; font-size: 15px; }
  #${ROOT_ID} .bubble.user .role { color: #64748b; }
  #${ROOT_ID} .tutor-card {
    width: 100%; max-width: 100%; box-sizing: border-box;
    border-radius: 14px; border-bottom-left-radius: 6px;
    border: 1px solid #e2e8f0; background: #fff;
    box-shadow: 0 1px 2px rgba(15,23,42,.04);
    user-select: text; -webkit-user-select: text;
    overflow: hidden;
  }
  #${ROOT_ID} .tutor-card-hdr {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    border-bottom: 1px solid #f1f5f9; padding: 6px 10px;
  }
  #${ROOT_ID} .tutor-card-hdr strong { font-size: 12px; font-weight: 600; color: #1e293b; }
  #${ROOT_ID} .tutor-card-hdr button {
    all: unset; cursor: pointer; font-size: 11px; font-weight: 600; color: #94a3b8;
    padding: 2px 6px; border-radius: 6px;
  }
  #${ROOT_ID} .tutor-card-hdr button:hover { background: #f1f5f9; color: #475569; }
  #${ROOT_ID} .tutor-card-body {
    padding: 12px 14px; color: #334155; font-size: 15px; line-height: 1.65;
    max-width: 100%; overflow-x: hidden; overflow-y: visible;
    word-wrap: break-word; overflow-wrap: anywhere;
  }
  #${ROOT_ID} .tutor-card-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    border-top: 1px solid #f1f5f9; background: rgba(248,250,252,.85);
    padding: 6px 10px;
  }
  #${ROOT_ID} .tutor-card-foot button {
    all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 600; color: #475569;
    border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 4px 8px;
  }
  #${ROOT_ID} .tutor-card-foot button:hover { border-color: #cbd5e1; background: #f8fafc; color: #0f172a; }
  #${ROOT_ID} .markdown-content.tutor-md {
    display: flex; flex-direction: column; gap: 0;
    font-size: 15px; line-height: 1.65; color: #334155;
  }
  #${ROOT_ID} .markdown-content .md-p,
  #${ROOT_ID} .markdown-content p {
    margin: 0 0 0.65em; padding: 0;
    line-height: 1.65; letter-spacing: -0.01em;
  }
  #${ROOT_ID} .markdown-content .md-p:last-child,
  #${ROOT_ID} .markdown-content p:last-child { margin-bottom: 0; }
  #${ROOT_ID} .markdown-content strong { font-weight: 600; color: #0f172a; }
  #${ROOT_ID} .markdown-content em { color: #475569; }
  #${ROOT_ID} .markdown-content .md-h1 { font-size: 16px; font-weight: 600; margin: 0.75em 0 0.4em; color: #0f172a; line-height: 1.35; }
  #${ROOT_ID} .markdown-content .md-h2 {
    font-size: 15px; font-weight: 600; margin: 0.75em 0 0.4em; padding-bottom: 0.35em;
    border-bottom: 1px solid #f1f5f9; color: #0f172a; line-height: 1.35;
  }
  #${ROOT_ID} .markdown-content .md-h3, #${ROOT_ID} .markdown-content .md-h4,
  #${ROOT_ID} .markdown-content .md-h5, #${ROOT_ID} .markdown-content .md-h6 {
    font-size: 14px; font-weight: 600; margin: 0.65em 0 0.35em; color: #1e293b; line-height: 1.4;
  }
  #${ROOT_ID} .markdown-content .md-h:first-child { margin-top: 0; }
  #${ROOT_ID} .markdown-content ul.md-ul, #${ROOT_ID} .markdown-content ol.md-ol {
    margin: 0 0 0.65em 0; padding: 0 0 0 1.25em;
    list-style-position: outside;
  }
  #${ROOT_ID} .markdown-content ul.md-ul { list-style-type: disc; }
  #${ROOT_ID} .markdown-content ol.md-ol { list-style-type: decimal; }
  #${ROOT_ID} .markdown-content .md-li {
    margin: 0 0 0.4em; padding-left: 0.15em;
    line-height: 1.6;
  }
  #${ROOT_ID} .markdown-content .md-inline-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
    background: #f1f5f9; border: 1px solid #e2e8f0; padding: 1px 5px; border-radius: 4px;
  }
  #${ROOT_ID} .markdown-content .md-code-block {
    margin: 10px 0; overflow: hidden; border-radius: 12px; border: 1px solid #334155; background: #0f172a;
  }
  #${ROOT_ID} .markdown-content .md-code-hdr {
    padding: 6px 10px; border-bottom: 1px solid rgba(51,65,85,.8); background: #1e293b;
  }
  #${ROOT_ID} .markdown-content .code-lang {
    font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;
  }
  #${ROOT_ID} .markdown-content pre.md-pre {
    margin: 0; padding: 10px 12px; overflow-x: auto; font-size: 12px; line-height: 1.45; color: #e2e8f0;
  }
  #${ROOT_ID} .markdown-content pre.md-pre code { background: transparent; padding: 0; color: inherit; }
  #${ROOT_ID} .markdown-content .md-quote {
    margin: 8px 0; padding: 8px 10px; border-left: 3px solid #cbd5e1; background: #f8fafc;
    border-radius: 0 8px 8px 0; color: #475569;
  }
  #${ROOT_ID} .markdown-content .md-hr { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
  #${ROOT_ID} .markdown-content a { color: #0f172a; font-weight: 500; text-decoration: underline; text-decoration-color: #cbd5e1; }
  #${ROOT_ID} .tutor-step-row {
    display: flex; gap: 10px; align-items: flex-start; margin: 0 0 10px; padding: 10px 12px;
    border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc;
    max-width: 100%; box-sizing: border-box;
  }
  #${ROOT_ID} .tutor-step-badge {
    flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    background: #1e293b; color: #fff; padding: 4px 8px; border-radius: 8px; line-height: 1.2;
  }
  #${ROOT_ID} .tutor-step-main { min-width: 0; flex: 1; }
  #${ROOT_ID} .tutor-step-main .md-p,
  #${ROOT_ID} .tutor-step-main p { margin: 0 0 0.5em; font-size: 14px; color: #334155; line-height: 1.6; }
  #${ROOT_ID} .tutor-step-main .md-p:last-child { margin-bottom: 0; }
  #${ROOT_ID} .tutor-card.thinking { border-style: dashed; background: #fafafa; }
  #${ROOT_ID} .tutor-card.thinking .tutor-card-body {
    display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 13px; font-weight: 500;
  }
  #${ROOT_ID} .thinking-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #64748b;
    animation: hina-pulse 1s ease-in-out infinite;
  }
  #${ROOT_ID} .writing-badge {
    font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
    border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
    padding: 2px 6px; border-radius: 6px; margin-left: 6px;
  }
  #${ROOT_ID} .hdr-mark img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
  #${ROOT_ID} .composer { border-top: 1px solid #e2e8f0; padding: 10px; background: #fff; flex-shrink: 0; }
  #${ROOT_ID} textarea {
    width: 100%; min-height: 52px; max-height: 96px; resize: vertical; border: 1px solid #e2e8f0;
    border-radius: 12px; padding: 10px 11px; font: inherit; font-weight: 500;
    transition: border-color .15s, box-shadow .15s;
  }
  #${ROOT_ID} textarea:focus { outline: none; border-color: #94a3b8; box-shadow: 0 0 0 3px rgba(30,41,59,.08); }
  #${ROOT_ID} .row { display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
  #${ROOT_ID} .row button[data-hina-send] {
    border: none; border-radius: 10px; padding: 9px 14px; cursor: pointer;
    background: #1e293b; color: #fff; font-weight: 600; font-size: 12px;
    transition: background .15s, opacity .15s;
  }
  #${ROOT_ID} .row button[data-hina-send]:hover:not(:disabled) { background: #334155; }
  #${ROOT_ID} .row button[data-hina-send]:disabled { opacity: .55; cursor: not-allowed; }
  #${ROOT_ID} .foot { font-size: 10px; color: #94a3b8; font-weight: 500; }
  #${ROOT_ID} .status {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 500; color: #64748b; padding: 0 12px 8px; flex-shrink: 0;
  }
  #${ROOT_ID} .status:empty { display: none; padding: 0; }
  #${ROOT_ID} .status .spin {
    width: 12px; height: 12px; border: 2px solid #cbd5e1; border-top-color: #1e293b;
    border-radius: 50%; animation: hina-spin .7s linear infinite; flex-shrink: 0;
  }
</style>
<div class="hdr" data-hina-drag>
  <div class="hdr-brand">
    <span class="hdr-mark"><img data-hina-hdr-icon alt="" /></span>
    <div>
      <div class="hdr-title">HINA Tutor</div>
      <div class="hdr-sub">On this page</div>
    </div>
    <span class="hdr-dot" aria-hidden="true"></span>
  </div>
  <span class="hdr-actions">
    <button type="button" data-hina-minimize title="Minimize">−</button>
    <button type="button" data-hina-close title="Close">×</button>
  </span>
</div>
<div class="body" data-hina-body>
  <div class="msgs" data-hina-messages>
    <div class="empty" data-hina-empty>
      <strong>Ask from this page</strong>
      Use your shortcut after highlighting or copying text — replies appear here.
    </div>
    <div class="crop-inline" data-hina-crop-inline hidden>
      <div class="crop-toolbar">
        <span>Select question area in chat</span>
        <button type="button" data-hina-crop-cancel>Cancel</button>
      </div>
      <div class="crop-frame" data-hina-crop-frame>
        <img class="crop-img" data-hina-crop-img alt="Page preview" />
        <div class="crop-box" data-hina-crop-box></div>
      </div>
    </div>
  </div>
  <div class="status" data-hina-status></div>
  <div class="composer" data-hina-composer>
    <textarea data-hina-input placeholder="Follow up or paste a question… (Enter to send)" rows="2"></textarea>
    <div class="row">
      <button type="button" data-hina-send>Send</button>
      <span class="foot">Saved to your HINA chat session</span>
    </div>
  </div>
</div>`;

    const parent = document.body || document.documentElement;
    parent.appendChild(host);
    this.root = host;
    this.bindRefs();
    this.wireCropHandlers();
    this.wireChrome(host);
  }

  private bindRefs(): void {
    const host = document.getElementById(ROOT_ID);
    if (!host) return;
    this.root = host;
    this.bodyEl = host.querySelector('[data-hina-body]');
    this.listEl = host.querySelector('[data-hina-messages]');
    this.inputEl = host.querySelector('[data-hina-input]');
    this.statusEl = host.querySelector('[data-hina-status]');
    this.cropInline = host.querySelector('[data-hina-crop-inline]');
    this.cropFrame = host.querySelector('[data-hina-crop-frame]');
    this.cropImg = host.querySelector('[data-hina-crop-img]');
    this.cropBox = host.querySelector('[data-hina-crop-box]');
    this.composerEl = host.querySelector('[data-hina-composer]');
    this.emptyEl = host.querySelector('[data-hina-empty]');
    this.sendBtn = host.querySelector('[data-hina-send]');
    this.hdrTutorImg = host.querySelector('[data-hina-hdr-icon]');
    void this.applyBranding();
  }

  private createAvatar(role: 'user' | 'assistant'): HTMLElement {
    const el = document.createElement('div');
    el.className = 'avatar';
    el.setAttribute('aria-hidden', 'true');
    const branding = this.branding;
    const icon = tutorIconUrl();
    if (role === 'assistant') {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = 'HINA AI Tutor';
      el.appendChild(img);
      return el;
    }
    if (branding?.userAvatarUrl) {
      const img = document.createElement('img');
      img.src = branding.userAvatarUrl;
      img.alt = branding.userName;
      el.appendChild(img);
      return el;
    }
    el.textContent = branding?.userInitials || 'U';
    return el;
  }

  private async applyBranding(): Promise<void> {
    this.branding = await readOverlayBranding();
    const icon = tutorIconUrl();
    if (this.hdrTutorImg) {
      this.hdrTutorImg.src = icon;
      this.hdrTutorImg.alt = 'HINA';
    }
  }

  private replyWithQuestion(question: string): void {
    if (!this.inputEl) return;
    this.inputEl.value = question;
    this.inputEl.focus();
    this.scrollChatToBottom();
  }

  private async copyPlainText(text: string, button?: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      if (button) {
        const prev = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => {
          button.textContent = prev;
        }, 1200);
      }
    } catch {
      /* selection still works */
    }
  }

  private wireMessageActions(): void {
    if (!this.listEl || this.listEl.dataset.hinaActionsWired === '1') return;
    this.listEl.dataset.hinaActionsWired = '1';
    this.listEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const copyBtn = target.closest('[data-hina-copy-reply]') as HTMLButtonElement | null;
      if (copyBtn) {
        const raw = copyBtn.getAttribute('data-reply-text');
        if (raw) void this.copyPlainText(raw, copyBtn);
        return;
      }
      const replyBtn = target.closest('[data-hina-reply-q]') as HTMLButtonElement | null;
      if (replyBtn) {
        const q = replyBtn.getAttribute('data-question');
        if (q) this.replyWithQuestion(q);
      }
    });
  }

  showThinking(label = 'AI Tutor is thinking…'): void {
    this.ensureMounted();
    if (!this.listEl) return;
    this.hideThinking();
    if (this.emptyEl) this.emptyEl.hidden = true;

    const row = document.createElement('div');
    row.className = 'msg-row assistant';
    row.id = THINKING_ROW_ID;

    const wrap = document.createElement('div');
    wrap.className = 'bubble-wrap';
    const card = document.createElement('div');
    card.className = 'tutor-card thinking';
    card.innerHTML = `
      <div class="tutor-card-hdr">
        <strong>AI Tutor<span class="writing-badge">Writing</span></strong>
      </div>
      <div class="tutor-card-body">
        <span class="thinking-dot" aria-hidden="true"></span>
        <span>${escapeHtml(label)}</span>
      </div>`;
    wrap.appendChild(card);
    row.appendChild(this.createAvatar('assistant'));
    row.appendChild(wrap);
    this.insertMessageBubble(row);
    this.scrollChatToBottom();
    this.root?.classList.add('busy');
  }

  hideThinking(): void {
    document.getElementById(THINKING_ROW_ID)?.remove();
    this.root?.classList.remove('busy');
  }

  private buildAssistantCard(content: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'tutor-card';

    const hdr = document.createElement('div');
    hdr.className = 'tutor-card-hdr';
    hdr.innerHTML = '<strong>AI Tutor</strong>';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('data-hina-copy-reply', '1');
    copyBtn.setAttribute('data-reply-text', content);
    hdr.appendChild(copyBtn);
    card.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'tutor-card-body';
    body.innerHTML = renderMarkdownLite(content);
    card.appendChild(body);

    const trailing = extractTrailingQuestion(content);
    if (trailing) {
      const foot = document.createElement('div');
      foot.className = 'tutor-card-foot';
      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.setAttribute('data-hina-reply-q', '1');
      replyBtn.setAttribute('data-question', trailing);
      replyBtn.textContent = '↩ Answer this';
      foot.appendChild(replyBtn);
      card.appendChild(foot);
    }

    return card;
  }

  private ensureBrandingListener(): void {
    if (this.brandingListener) return;
    this.brandingListener = (changes) => {
      if (changes[OVERLAY_BRANDING_KEY]) void this.applyBranding();
    };
    chrome.storage.onChanged.addListener(this.brandingListener);
  }

  private wireChrome(host: HTMLElement): void {
    if (host.dataset.hinaWired === '1') return;
    host.dataset.hinaWired = '1';

    host.querySelector('[data-hina-close]')?.addEventListener('click', () => {
      this.clearCrop();
      if (this.brandingListener) {
        chrome.storage.onChanged.removeListener(this.brandingListener);
        this.brandingListener = null;
      }
      host.remove();
      this.root = null;
    });
    host.querySelector('[data-hina-minimize]')?.addEventListener('click', () => {
      this.minimized = !this.minimized;
      host.classList.toggle('minimized', this.minimized);
      if (this.bodyEl) this.bodyEl.style.display = this.minimized ? 'none' : 'flex';
    });

    host.querySelector('[data-hina-crop-cancel]')?.addEventListener('click', () => {
      this.clearCrop();
      this.setStatus(null);
      this.syncEmptyState();
    });
    host.querySelector('[data-hina-send]')?.addEventListener('click', () => void this.sendFollowUp());
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendFollowUp();
      }
    });

    this.enableDrag(host.querySelector('[data-hina-drag]') as HTMLElement, host);
    this.ensureBrandingListener();
    this.wireMessageActions();
    void this.applyBranding();
  }

  dockBottomRight(): void {
    this.ensureMounted();
    if (!this.root || this.userPlaced) return;
    this.root.style.left = 'auto';
    this.root.style.top = 'auto';
    this.root.style.right = '16px';
    this.root.style.bottom = '16px';
  }

  private setPanelPosition(panel: HTMLElement, left: number, top: number): void {
    const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
    const x = Math.min(maxLeft, Math.max(8, left));
    const y = Math.min(maxTop, Math.max(8, top));
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }

  private enableDrag(handle: HTMLElement, panel: HTMLElement): void {
    if (handle.dataset.hinaDragWired === '1') return;
    handle.dataset.hinaDragWired = '1';

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      e.preventDefault();
      this.setPanelPosition(panel, startLeft + e.clientX - startX, startTop + e.clientY - startY);
    };

    const onUp = () => {
      if (dragging) {
        dragging = false;
        this.userPlaced = true;
      }
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = `${startLeft}px`;
      panel.style.top = `${startTop}px`;
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mouseup', onUp, true);
    });
  }

  setStatus(text: string | null): void {
    if (!this.statusEl) return;
    if (!text) {
      this.statusEl.innerHTML = '';
      this.root?.classList.remove('busy');
      return;
    }
    const busy = /thinking|analyzing/i.test(text);
    this.root?.classList.toggle('busy', busy);
    this.statusEl.innerHTML = busy
      ? `<span class="spin" aria-hidden="true"></span><span>${escapeHtml(text)}</span>`
      : escapeHtml(text);
  }

  isVisible(): boolean {
    const el =
      this.root && document.getElementById(ROOT_ID) === this.root
        ? this.root
        : document.getElementById(ROOT_ID);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 80 && rect.height >= 36;
  }

  private insertMessageBubble(node: HTMLElement): void {
    if (!this.listEl) return;
    if (this.cropInline?.parentElement === this.listEl) {
      this.listEl.insertBefore(node, this.cropInline);
    } else {
      this.listEl.appendChild(node);
    }
  }

  private scrollChatToBottom(): void {
    if (!this.listEl) return;
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  private syncEmptyState(): void {
    if (!this.listEl || !this.emptyEl) return;
    const hasBubble = Boolean(this.listEl.querySelector('.msg-row'));
    const cropOpen = this.cropInline && !this.cropInline.hidden;
    this.emptyEl.hidden = hasBubble || Boolean(cropOpen);
  }

  appendMessages(messages: TutorOverlayMessage[]): void {
    this.ensureMounted();
    if (!this.branding) void this.applyBranding();
    if (!this.listEl) return;
    if (this.emptyEl) this.emptyEl.hidden = true;
    for (const msg of messages) {
      const row = document.createElement('div');
      row.className = `msg-row ${msg.role}`;

      const wrap = document.createElement('div');
      wrap.className = 'bubble-wrap';

      if (msg.role === 'assistant') {
        wrap.appendChild(this.buildAssistantCard(msg.content));
      } else {
        const bubble = document.createElement('div');
        bubble.className = 'bubble user';
        const branding = this.branding;
        const role = document.createElement('span');
        role.className = 'role';
        role.textContent = branding?.userName?.split(/\s+/)[0] || 'You';
        bubble.appendChild(role);

        const imgUrl = safeDataImageUrl(msg.imageDataUrl);
        if (imgUrl) {
          const shot = document.createElement('div');
          shot.className = 'shot';
          const img = document.createElement('img');
          img.src = imgUrl;
          img.alt = 'Screenshot question';
          shot.appendChild(img);
          bubble.appendChild(shot);
        }

        if (msg.content.trim()) {
          const content = document.createElement('div');
          content.className = 'content';
          content.innerHTML = escapeHtml(msg.content).replace(/\n/g, '<br/>');
          bubble.appendChild(content);
        }
        wrap.appendChild(bubble);
      }
      row.appendChild(this.createAvatar(msg.role));
      row.appendChild(wrap);
      this.insertMessageBubble(row);
    }
    this.scrollChatToBottom();
    this.syncEmptyState();
  }

  private showCropInChat(dataUrl: string): void {
    if (this.emptyEl) this.emptyEl.hidden = true;
    if (this.cropImg) this.cropImg.src = dataUrl;
    if (this.cropBox) this.cropBox.style.display = 'none';
    if (this.cropInline) this.cropInline.hidden = false;
    this.scrollChatToBottom();
  }

  clearCrop(): void {
    this.cropDrag = null;
    this.cropBusy = false;
    if (this.cropBox) this.cropBox.style.display = 'none';
    if (this.cropInline) this.cropInline.hidden = true;
    if (this.cropImg) this.cropImg.removeAttribute('src');
  }

  async startCropFromSnapshot(): Promise<void> {
    this.ensureMounted();
    this.dockBottomRight();
    const res = (await chrome.runtime.sendMessage({ type: TUTOR_MSG.OVERLAY_GET_SNAPSHOT })) as {
      ok?: boolean;
      imageDataUrl?: string;
    };
    if (!res?.ok || !res.imageDataUrl) {
      this.setStatus('Could not load page preview. Try the shortcut again.');
      return;
    }
    this.showCropInChat(res.imageDataUrl);
    this.setStatus(null);
  }

  startCropWithImage(dataUrl: string): void {
    this.ensureMounted();
    this.dockBottomRight();
    this.showCropInChat(dataUrl);
  }

  private wireCropHandlers(): void {
    if (!this.cropFrame || this.cropFrame.dataset.hinaCropWired === '1') return;
    this.cropFrame.dataset.hinaCropWired = '1';

    const localPoint = (event: MouseEvent) => {
      const img = this.cropImg!;
      const bounds = img.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };

    const moveDrag = (event: MouseEvent) => {
      if (!this.cropDrag || !this.cropBox) return;
      const point = localPoint(event);
      const x = Math.min(this.cropDrag.x, point.x);
      const y = Math.min(this.cropDrag.y, point.y);
      this.cropBox.style.left = `${x}px`;
      this.cropBox.style.top = `${y}px`;
      this.cropBox.style.width = `${Math.abs(point.x - this.cropDrag.x)}px`;
      this.cropBox.style.height = `${Math.abs(point.y - this.cropDrag.y)}px`;
    };

    const endDrag = (event: MouseEvent) => {
      window.removeEventListener('mousemove', moveDrag);
      window.removeEventListener('mouseup', endDrag);
      if (!this.cropDrag || this.cropBusy || !this.cropImg) return;
      const start = this.cropDrag;
      this.cropDrag = null;
      const point = localPoint(event);
      const maxW = this.cropImg.clientWidth || 0;
      const maxH = this.cropImg.clientHeight || 0;
      const x = Math.max(0, Math.min(start.x, point.x, maxW));
      const y = Math.max(0, Math.min(start.y, point.y, maxH));
      const width = Math.min(maxW, Math.max(start.x, point.x)) - x;
      const height = Math.min(maxH, Math.max(start.y, point.y)) - y;
      if (width < 12 || height < 12) {
        if (this.cropBox) this.cropBox.style.display = 'none';
        this.setStatus('Selection too small. Drag a larger area.');
        return;
      }
      if (!this.cropImg.naturalWidth || !this.cropImg.clientWidth) {
        this.setStatus('Preview still loading. Try again.');
        return;
      }
      this.cropBusy = true;
      try {
        const scaleX = this.cropImg.naturalWidth / this.cropImg.clientWidth;
        const scaleY = this.cropImg.naturalHeight / this.cropImg.clientHeight;
        const imageDataUrl = cropToDataUrl(this.cropImg, {
          x: x * scaleX,
          y: y * scaleY,
          width: width * scaleX,
          height: height * scaleY,
        });
        this.clearCrop();
        this.showThinking('Analyzing screenshot…');
        void chrome.runtime
          .sendMessage({ type: TUTOR_MSG.OVERLAY_CROP_ASK, imageDataUrl })
          .then((res?: { ok?: boolean; error?: string }) => {
            if (res && res.ok === false) {
              this.setStatus(res.error || 'Tutor request failed.');
            }
          })
          .finally(() => {
            this.cropBusy = false;
          });
      } catch (error) {
        this.cropBusy = false;
        this.setStatus(error instanceof Error ? error.message : String(error));
      }
    };

    this.cropFrame.addEventListener('mousedown', (event) => {
      if (this.cropBusy || this.cropInline?.hidden || event.button !== 0 || !this.cropImg) return;
      this.cropDrag = localPoint(event);
      if (this.cropBox) {
        this.cropBox.style.display = 'block';
        this.cropBox.style.left = `${this.cropDrag.x}px`;
        this.cropBox.style.top = `${this.cropDrag.y}px`;
        this.cropBox.style.width = '0';
        this.cropBox.style.height = '0';
      }
      window.addEventListener('mousemove', moveDrag);
      window.addEventListener('mouseup', endDrag);
      event.preventDefault();
      event.stopPropagation();
    });
  }

  private async sendFollowUp(): Promise<void> {
    const text = this.inputEl?.value.trim();
    if (!text || this.sendBtn?.disabled) return;
    this.inputEl!.value = '';
    if (this.sendBtn) this.sendBtn.disabled = true;
    this.appendMessages([
      { id: `u-${Date.now()}`, role: 'user', content: text, createdAt: new Date().toISOString() },
    ]);
    this.showThinking('AI Tutor is thinking…');
    this.setStatus(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: TUTOR_MSG.OVERLAY_USER_MESSAGE,
        text,
      });
      if (response?.error) throw new Error(response.error);
    } catch (error) {
      this.hideThinking();
      this.setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (this.sendBtn) this.sendBtn.disabled = false;
    }
  }
}

export const tutorOverlay = new TutorOverlayPanel();
