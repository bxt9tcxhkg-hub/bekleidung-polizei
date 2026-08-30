#!/usr/bin/env bash
set -euo pipefail

# Idempotent dependency refresh for the Vite + React frontend.
npm ci

# Vite reads the Supabase connection details from .env at dev/build time and
# createClient() throws if they are missing. Provide safe placeholders so the
# dev server and production build always boot without real credentials. If real
# VITE_SUPABASE_* values are injected as secrets, they are used instead. An
# existing .env (e.g. one a developer created) is never overwritten.
if [ ! -f .env ]; then
  cat > .env <<EOF
VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://placeholder.supabase.co}
VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY:-placeholder-anon-key}
EOF
fi
