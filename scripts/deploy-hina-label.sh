#!/usr/bin/env bash
# Deploy hina-label-messages Edge Function (Kimi HINA labelling).
# Prerequisites: Supabase Secrets KIMI_API_KEY (+ optional KIMI_MODEL) in Dashboard.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# From VITE_SUPABASE_URL (https://<ref>.supabase.co)
PROJECT_REF="${SUPABASE_PROJECT_REF:-vankbytditrqigkrjqfp}"

if [[ -x "$ROOT/node_modules/.bin/supabase" ]]; then
  SUPABASE_CMD=("$ROOT/node_modules/.bin/supabase")
elif command -v supabase >/dev/null 2>&1; then
  SUPABASE_CMD=(supabase)
else
  SUPABASE_CMD=(npx supabase)
fi

if ! "${SUPABASE_CMD[@]}" projects list >/dev/null 2>&1; then
  echo ""
  echo "Supabase CLI 未登录。请在本机终端（Cursor 里新开一个 Terminal）执行："
  echo ""
  echo "  cd \"$ROOT\""
  echo "  npx supabase login"
  echo ""
  echo "浏览器授权后，再运行："
  echo ""
  echo "  npm run supabase:deploy-label"
  echo ""
  echo "或使用 Access Token（Dashboard → Account → Access Tokens）："
  echo "  export SUPABASE_ACCESS_TOKEN=你的token"
  echo "  npm run supabase:deploy-label"
  echo ""
  exit 1
fi

echo "Deploying hina-label-messages to project ${PROJECT_REF} ..."
"${SUPABASE_CMD[@]}" functions deploy hina-label-messages \
  --project-ref "$PROJECT_REF" \
  --use-api

echo ""
echo "Done. Test: log in on the app → Student HINA Analysis → Deploy."
