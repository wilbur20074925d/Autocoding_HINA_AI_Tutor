# Supabase Edge Functions

## `hina-label-messages`

HINA coding for chat turns via **Kimi (Moonshot) API**, same prompts as the web app. Used by the Chrome extension and optionally the web app when `VITE_HINA_LABEL_EDGE=true`.

### Deploy

Set `KIMI_API_KEY` (and optional `KIMI_MODEL`) in **Dashboard → Edge Functions → Secrets**, then from repo root:

```bash
npx supabase login          # once per machine
npm run supabase:deploy-label
```

Or manually: `supabase functions deploy hina-label-messages --project-ref YOUR_REF --use-api`

Optional secrets: `KIMI_API_BASE` (default `https://api.moonshot.ai/v1`), `KIMI_LABEL_MODEL` (default `moonshot-v1-32k`).

### Local serve

```bash
supabase secrets set KIMI_API_KEY=your_kimi_key
# Or pass VITE_KIMI_API_KEY from ../.env when serving locally
supabase functions serve hina-label-messages --env-file ../.env
```

The function reads `Authorization: Bearer <user jwt>` from the client (`supabase.functions.invoke`).

### Regenerate codebook

If `src/utils/hinaCodes.ts` changes:

```bash
npx tsx -e "
import { HINA_CODES, getDimensionMeta } from './src/utils/hinaCodes.ts';
import fs from 'fs';
const lines = HINA_CODES.map((code, i) => ({
  i: i + 1,
  id: code.id,
  dimensionId: code.dimension,
  dimension: getDimensionMeta(code.dimension).label,
  code: code.label,
  definition: code.prompt,
}));
fs.writeFileSync('./supabase/functions/hina-label-messages/codebook.json', JSON.stringify(lines, null, 2));
"
```
