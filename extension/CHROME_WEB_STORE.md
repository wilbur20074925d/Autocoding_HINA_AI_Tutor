# Chrome Web Store — HINA AI Tutor Extension

## Before you upload

1. **Deploy privacy policy on the website** (required URL for the listing):

   ```bash
   npm run build
   # deploy dist/ to hina-tutor.com (includes public/privacy/index.html)
   ```

   Privacy URL: **https://hina-tutor.com/privacy/** (or `/privacy/index.html`)

2. **Production `.env`** (repo root) — same Supabase as production; ZenMux for extension tutor:

   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_ZENMUX_API_KEY`
   - `VITE_HINA_LABEL_EDGE=true` (HINA uses Supabase Edge + `KIMI_API_KEY` secret — not bundled in the extension)

3. **Bump version** in `extension/manifest.json` (`version`) for each store update.

4. **Build store ZIP**:

   ```bash
   npm run extension:store-zip
   ```

   Upload **`extension/hina-ai-tutor-chrome-store.zip`** (root must contain `manifest.json`).

---

## Developer Dashboard checklist

1. [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole) — pay one-time registration if needed.
2. **New item** → upload ZIP.
3. **Store listing** (English recommended for review):

   | Field | Suggested text |
   |-------|----------------|
   | **Name** | HINA AI Tutor |
   | **Summary** | Ask an explanation-first AI tutor from any page via clipboard or screenshot; syncs to your class chat. |
   | **Description** | HINA AI Tutor helps students get step-by-step help while browsing. Sign in with your HINA class account, pick a chat session, then paste a question or capture a screen region. Replies appear in a floating panel and save to Supabase for your course. Includes optional HINA conversation analysis in the side panel. Requires an account from your instructor / hina-tutor.com. |
   | **Category** | Education |
   | **Language** | English (add Chinese if you maintain a second listing locale) |

4. **Privacy**

   - Privacy policy URL: `https://hina-tutor.com/privacy/`
   - Single purpose: *Educational AI tutoring tied to class sessions.*
   - Justify **broad host access**: user-initiated tutor help on arbitrary study websites (shortcuts, overlay, screenshot question).

5. **Assets**

   - Icon: `extension/icons/icon128.png`
   - Screenshots (1280×800 or 640×400): side panel login, on-page overlay, sample tutor reply (no real student PII).

6. **Distribution**

   - **Public** or **Unlisted** (link-only for pilot classes).
   - Restrict to regions if needed.

7. **Submit for review** — first review often takes several days; `<all_urls>` may trigger extra questions — reply using the permission section in the privacy policy.

---

## After approval

- Share the store install link with students.
- Each release: bump `manifest.json` version → `npm run extension:store-zip` → upload new package in Dashboard → submit update.

---

## Do not put in the ZIP

- Source code (`extension/src/`), `node_modules/`, `.env`
- Only contents of **`extension/dist/`** after `npm run extension:build`
