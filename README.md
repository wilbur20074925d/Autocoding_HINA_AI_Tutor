# AUTO_HINA_AITUTOR

Hina Tutor is a focused frontend for the AI tutor: login, the student chat, and the teacher session review. It uses the same Supabase project as StreamLearn, so existing accounts and chat history stay in place.

## Screens

- Signed out: login, signup, and password reset
- Student: AI Tutor chat, Hina analysis, and chat report
- Teacher: AI Tutor session list, transcripts, export, and class Hina analysis

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The dev server uses port 5174. Fill `.env` with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`
- `VITE_ZENMUX_API_KEY`
- `VITE_OPENROUTER_API_KEY`

```bash
npm run build
npm run preview
```
