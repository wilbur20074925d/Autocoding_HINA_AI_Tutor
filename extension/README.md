# HINA Chrome Extension (AI Tutor)

Ask the **HINA AI tutor** while browsing: paste a question (**Ctrl+C / Ctrl+V**) or capture a **screenshot region** with a keyboard shortcut. Answers appear in a **floating panel** on the page and are **saved** to your selected HINA chat session. Optional: archive full external AI transcripts; **StudentHinaAnalysis** runs in the side panel.

## Setup

1. Root `.env` needs:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same as web app)
   - `VITE_ZENMUX_API_KEY` (GPT-4o tutor via [ZenMux](https://zenmux.ai/))

2. Build:

```bash
npm run extension:build   # from repo root
```

3. Chrome → `chrome://extensions` → **Load unpacked** → `extension/dist`.

4. Side panel: sign in → **class session** → **chat session**.

## Two ways to ask

### 1 · Paste / clipboard (Ctrl+C → Ctrl+V)

- Side panel → **Ask tutor** → paste or **Paste from clipboard & ask**
- Default **Ctrl+W** (Windows) / **Command+W** (Mac — ⌘W) on **any website tab** (in-page listener; Chrome may reserve ⌘W for “close tab”)
- Does not run on `chrome://` or the Web Store; works on http(s), file URLs, and inside iframes
- Customize in side panel → **Keyboard shortcuts**

### 2 · Screenshot region

- Default **Ctrl+Shift+W** / **Command+Shift+W** (⌘⇧W on Mac)
- Drag a box around the question on any page; **GPT-4o** reads the image and replies in numbered steps.

## On-page overlay

A small **HINA AI Tutor** panel appears bottom-right. You can **continue chatting** there; messages sync to Supabase (`metadata.tutor: true`).

## Optional

- **Archive external chat** — paste share link or full transcript into section 5.
- **Localhost live capture** — mirrors `http://localhost:5174` tutor while recording is on.
- **Node-level HINA** — full analysis UI in the side panel (Edge Function labelling when deployed).

## Dev

```bash
cd extension && npm run dev
```

Reload the extension after rebuilds.

## Chrome Web Store

See [CHROME_WEB_STORE.md](./CHROME_WEB_STORE.md). Quick pack: `npm run extension:store-zip` from repo root.
Privacy policy (required): deploy site with `public/privacy/` → https://hina-tutor.com/privacy/
