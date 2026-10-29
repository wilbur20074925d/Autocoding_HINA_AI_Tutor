<div align="center">

<img src="public/images/HINA%20AI%20Tutor.png" alt="HINA AI Tutor" width="160" />

# Autocoding HINA AI Tutor

An explanation-first AI tutoring platform for students and teachers, with **HINA** (Human–AI Interaction Node Analysis) labelling, session analytics, and a Chrome extension for in-browser help.

</div>

---

## Overview

**Autocoding HINA AI Tutor** is a focused web application plus Chrome extension built for classroom use. Students chat with an AI tutor tied to **class sessions**; conversations are stored in **Supabase** and can be analysed with the **HINA coding framework** (cognitive, metacognitive, socio-emotional, and coordinative dimensions). Teachers review transcripts, export data, and run class-level HINA insights.

The project shares the same Supabase backend as **StreamLearn**, so existing accounts and chat history remain compatible where tables overlap.

---

## Features

### Web app — students

| Area | Description |
|------|-------------|
| **Authentication** | Sign in, sign up, and password reset (Supabase Auth). Optional 2FA support via profile fields. |
| **Class sessions** | Join or select a class session, then open the AI tutor for that course context. |
| **AI Tutor chat** | Multi-turn chat with markdown, LaTeX (KaTeX), and file attachments. Modes include default and **learning** (explanation-first, concise replies with optional reflection questions). |
| **Model routing** | Responses can be generated via **Google Gemini**, **ZenMux** (GPT-4o), **OpenRouter**, or **Claude**, depending on configuration and UI selection. |
| **HINA analysis** | Live and historical **Student Hina Analysis**: dimension profiles, plots, session comparison, and node-level labelling when the Edge Function is deployed. |
| **Chat report** | Post-session report with learning-process metrics (stages, roles, evidence, and related analytics). |
| **Extension bridge** | When the Chrome extension is recording, messages from `localhost:5174` can sync into the selected extension chat session. |

### Web app — teachers / staff

| Area | Description |
|------|-------------|
| **Session dashboard** | Browse AI tutor sessions for students in a class. |
| **Transcripts** | Read full conversation threads with search and sorting. |
| **Export** | Download session data (including ZIP/CSV-style exports where implemented). |
| **Teacher HINA analysis** | Class- and session-level HINA visualisations and insights. |
| **Session management** | Delete or manage sessions with confirmation dialogs. |

### Chrome extension (`extension/`)

| Area | Description |
|------|-------------|
| **Side panel** | Sign in, pick **class session** and **chat session**, configure shortcuts, and run HINA analysis UI. |
| **Ask from clipboard** | Paste a question (or use **Ctrl+W** / **⌘W** on supported pages) to get step-by-step help. |
| **Screenshot region** | **Ctrl+Shift+W** / **⌘⇧W** to capture a screen region; GPT-4o (via ZenMux) reads the image and answers. |
| **On-page overlay** | Floating **HINA AI Tutor** panel for follow-up chat; messages sync to Supabase (`metadata.tutor: true`). |
| **External chat archive** | Import ChatGPT share links or pasted transcripts into a session. |
| **Localhost capture** | Content script mirrors the web app tutor on `http://localhost:5174` while capture is active. |

See [extension/README.md](extension/README.md) for extension-specific setup and shortcuts.

---

## HINA framework (brief)

**HINA** labels each message turn along four dimensions:

- **Cognitive** — asking, requesting solutions, synthesizing, critiquing  
- **Metacognitive** — planning, monitoring, evaluating the learning process  
- **Socio-emotional** — greetings, thanks, agreement, empathy  
- **Coordinative** — task clarification, coordination, resources  

Code definitions live in `src/utils/hinaCodes.ts`. Labelling can run:

- **In the browser** (Kimi API key in `.env` when Edge is off), or  
- **Via Supabase Edge Function** `hina-label-messages` (Kimi API; recommended for the extension; set `VITE_HINA_LABEL_EDGE=true`).

Deploy instructions: [supabase/functions/README.md](supabase/functions/README.md).

The shared tutor system prompt (`src/shared/aiTutorSystemPrompt.ts`) enforces **explanation-first** teaching and is used by both the web app and the extension.

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| **Frontend** | React 18, TypeScript, Vite 5, Tailwind CSS |
| **UI & content** | Lucide icons, react-markdown, remark/rehype (GFM, math, raw HTML), KaTeX |
| **Charts** | react-plotly.js, Plotly |
| **Backend / auth** | Supabase (Auth, Postgres, Edge Functions) |
| **AI providers** | `@google/generative-ai`, ZenMux, OpenRouter, Claude (service modules under `src/services/`) |
| **Extension** | Chrome Manifest V3, `@crxjs/vite-plugin`, side panel + content scripts |
| **Documents** | pdfjs-dist, jspdf, jszip (exports and attachments) |

---

## Project structure

```
Hina_tutor/
├── public/
│   └── images/
│       └── HINA AI Tutor.png      # App logo & favicon
├── src/
│   ├── App.tsx                    # Auth routing, student vs teacher views
│   ├── components/
│   │   ├── AITutorNew/            # Chat UI, HINA student analysis, chat report
│   │   ├── Auth/                  # Login / signup
│   │   ├── Sessions/              # Class session picker
│   │   └── Teacher/               # Staff sessions, exports, teacher HINA
│   ├── services/                  # Supabase, AI APIs, analytics, sessions
│   ├── hooks/                     # e.g. live HINA labelling
│   ├── utils/                     # HINA codes, plots, labelling, roles
│   └── shared/
│       └── aiTutorSystemPrompt.ts
├── extension/                     # Chrome extension (separate Vite build)
│   ├── manifest.json
│   ├── src/
│   │   ├── background.ts
│   │   ├── sidepanel/             # React side panel UI
│   │   ├── content/               # Page assist, localhost bridge, ChatGPT scrape
│   │   └── services/              # Tutor orchestration, ZenMux, sync
│   └── README.md
├── supabase/
│   ├── migrations/                # e.g. HINA_users table
│   └── functions/
│       └── hina-label-messages/   # HINA labelling Edge Function (Kimi)
├── .env.example
├── vite.config.ts                 # Dev server: localhost:5174
└── package.json
```

Primary Supabase tables used by the tutor (naming in code):

- `HINA_users` — profiles (see migration `20261019140000_hina_users.sql`)
- `HINA_chat_sessions` / `HINA_chat_messages` — tutor conversations

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**
- A **Supabase** project (URL + anon key)
- API keys for the models you plan to use (at minimum, configure what your deployment needs)
- **Chrome** (for the extension)
- **Supabase CLI** (optional, for deploying Edge Functions)

---

## Environment variables

Copy the example file and fill in values:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (client-safe) |
| `VITE_GEMINI_API_KEY` | For Gemini / client-side HINA | Google Generative AI |
| `VITE_ZENMUX_API_KEY` | For ZenMux / extension tutor | GPT-4o via [ZenMux](https://zenmux.ai/) |
| `VITE_KIMI_API_KEY` | For HINA labelling (browser fallback) | [Kimi API](https://platform.kimi.ai/) when Edge is off |
| `VITE_OPENROUTER_API_KEY` | Optional | OpenRouter models |
| `VITE_HINA_LABEL_EDGE` | Optional | Set to `true` to call Edge Function for HINA labelling |

**Secrets that must not go in the frontend `.env`:**

- `KIMI_API_KEY` on Supabase → **Edge Functions → Secrets** (used by `hina-label-messages` for HINA coding only)

The extension build reads the **same root `.env`** for Supabase and ZenMux keys.

---

## Run the web app locally

```bash
npm install
cp .env.example .env   # if you have not already
npm run dev
```

Open **http://localhost:5174** (port is fixed in `vite.config.ts`).

Production build and preview:

```bash
npm run build
npm run preview
```

---

## Build and load the Chrome extension

From the repository root:

```bash
npm run extension:install
npm run extension:build
```

1. Open **chrome://extensions**
2. Enable **Developer mode**
3. **Load unpacked** → select **`extension/dist`**
4. Open the extension **side panel**, sign in, choose class + chat session

Watch mode during extension development:

```bash
npm run extension:dev
```

Reload the extension in Chrome after each rebuild.

### Web + extension integration test

```bash
# Terminal 1
npm run dev

# Terminal 2 — after extension code changes
npm run extension:build
```

1. Load `extension/dist`, sign in, select class and chat session, start capture if needed.  
2. Use the web app at **http://localhost:5174** with the **same account**.  
3. Select the **same chat session** in the side panel so messages mirror correctly.

---

## Supabase Edge Function (HINA labelling)

```bash
supabase secrets set KIMI_API_KEY=your_kimi_key
supabase functions deploy hina-label-messages
```

Local serve:

```bash
supabase functions serve hina-label-messages --env-file .env
```

Details and codebook regeneration: [supabase/functions/README.md](supabase/functions/README.md).

---

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (port **5174**) |
| `npm run build` | Production build of the web app |
| `npm run preview` | Preview production build |
| `npm run extension:install` | `npm install` in `extension/` |
| `npm run extension:build` | Build unpacked extension to `extension/dist` |
| `npm run extension:dev` | Extension watch build |

Inside `extension/`:

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite watch build for the extension |
| `npm run build` | One-off extension build |
| `npm run icons:sync` | Regenerate extension icons from `public/images/HINA AI Tutor.png` |

---

## User roles

- **Student** — class sessions → AI tutor chat, HINA analysis, chat report.  
- **Staff / teacher** — session list, transcripts, exports, teacher HINA analysis (`isStaffRole` in `src/utils/roles.ts`).

---

## Security notes

- Never commit `.env` or API keys. Use `.env.example` as a template only.  
- The Supabase **anon** key is public by design; protect data with **Row Level Security** policies in Supabase.  
- Edge Function secrets (`KIMI_API_KEY`) belong in the Supabase dashboard, not in client bundles.

---

## Related documentation

- [extension/README.md](extension/README.md) — shortcuts, overlay, clipboard and screenshot flows  
- [supabase/functions/README.md](supabase/functions/README.md) — `hina-label-messages` deploy and codebook  

---

## License

Private project (`"private": true` in `package.json`). Add a license file here if you intend to open-source or share the repository.
