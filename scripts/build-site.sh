#!/usr/bin/env bash
# Build the CitCat marketing site into ./site/ for Cloudflare Pages.
#
#   - runtime.js and demo-showcase.json are copied from the app source so the live
#     demo always runs the same engine the app ships
#   - ?v= cache-busting strings are rewritten to the content hash of each asset
#   - docs/manual.md is rendered to manual.html (no runtime markdown dependency)
#
# Deploy:  npx wrangler pages deploy site --project-name citcat
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/site"

rm -rf "$OUT"
mkdir -p "$OUT"

# ---- Assets straight from the app source (single source of truth) ----
cp "$ROOT/src/js/runtime.js"                 "$OUT/runtime.js"
cp "$ROOT/templates/demo-showcase.citcat"    "$OUT/demo-showcase.json"

# Keep the in-repo docs copies in sync so docs/landing.html opens correctly from a clone
cp "$OUT/runtime.js"          "$ROOT/docs/runtime.js"
cp "$OUT/demo-showcase.json"  "$ROOT/docs/demo-showcase.json"

# ---- Cache busting: content hash per asset ----
V_RUNTIME="$(shasum -a 256 "$OUT/runtime.js"        | cut -c1-10)"
V_DEMO="$(shasum -a 256 "$OUT/demo-showcase.json"   | cut -c1-10)"

sed -e "s|runtime\.js?v=[A-Za-z0-9]*|runtime.js?v=${V_RUNTIME}|g" \
    -e "s|demo-showcase\.json?v=[A-Za-z0-9]*|demo-showcase.json?v=${V_DEMO}|g" \
    "$ROOT/docs/landing.html" > "$OUT/index.html"

# ---- Manual ----
ANALYTICS="$(grep -o '<script defer src="https://umami[^>]*></script>' "$ROOT/docs/landing.html" || true)"
python3 "$ROOT/scripts/md2html.py" "$ROOT/docs/manual.md" "$OUT/manual.html" "$ANALYTICS"

# ---- Cloudflare Pages headers ----
cat > "$OUT/_headers" <<'HEADERS'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/runtime.js
  Cache-Control: public, max-age=31536000, immutable

/demo-showcase.json
  Cache-Control: public, max-age=31536000, immutable
HEADERS

echo "built $OUT"
echo "  runtime.js         ?v=$V_RUNTIME"
echo "  demo-showcase.json ?v=$V_DEMO"
ls -la "$OUT"
