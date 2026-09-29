#!/usr/bin/env bash
# Build the CitCat marketing site into ./site/ for Cloudflare Pages.
#
#   - runtime.js is copied from the app source so the live demo always runs the
#     same engine the app ships; demo-showcase.json is built from the landing
#     showreel template (templates/landing-showreel.citcat) -- a different file
#     from the editor's own startup demo, see the copy step below
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
# The wire name stays demo-showcase.json (fetch call, cache headers below) but
# the source template moved: templates/demo-showcase.citcat is the *editor's*
# startup seed (embedded in src-tauri via include_str!, never touched by this
# script) and templates/landing-showreel.citcat is the richer showreel built
# for the public site. See _teams/citcat/knowledge/demo-content-split.md.
cp "$ROOT/templates/landing-showreel.citcat" "$OUT/demo-showcase.json"
# Its Image/Video/Svg objects carry paths relative to the project's own folder
# (same convention as examples/*/assets/), so the asset folder has to land at
# the matching relative location under the site root too. Only the media
# itself ships -- not _gen_assets.py, which is source, not a site asset.
copy_showreel_assets() {
  mkdir -p "$1/landing-showreel-assets"
  find "$ROOT/templates/landing-showreel-assets" -maxdepth 1 -type f \
       ! -name '_*' -exec cp {} "$1/landing-showreel-assets/" \;
}
copy_showreel_assets "$OUT"

# Keep the in-repo docs copies in sync so docs/landing.html opens correctly from a clone
cp "$OUT/runtime.js"          "$ROOT/docs/runtime.js"
cp "$OUT/demo-showcase.json"  "$ROOT/docs/demo-showcase.json"
rm -rf "$ROOT/docs/landing-showreel-assets"
copy_showreel_assets "$ROOT/docs"

# ---- Embed player ----
# docs/embed.js is generated, never hand-written: it is the engine verbatim plus
# the <citcat-player> wrapper, so the embed player cannot drift away from the
# HTML5 export the way the old hand-copied engine did.
python3 "$ROOT/scripts/build-embed.py"
cp "$ROOT/docs/embed.js"      "$OUT/embed.js"
cp "$ROOT/docs/player.html"   "$OUT/player.html"

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

/landing-showreel-assets/*
  Cache-Control: public, max-age=86400

/embed.js
  Cache-Control: public, max-age=86400

/player.html
  Cache-Control: public, max-age=0, must-revalidate
HEADERS

echo "built $OUT"
echo "  runtime.js         ?v=$V_RUNTIME"
echo "  demo-showcase.json ?v=$V_DEMO"
ls -la "$OUT"
