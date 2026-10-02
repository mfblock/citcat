#!/usr/bin/env bash
# Build the CitCat marketing site into ./site/ for Cloudflare Pages.
#
#   - runtime.js is copied from the app source so the live demo always runs the
#     same engine the app ships; demo-showcase.json is built from the landing
#     showreel template (templates/landing-showreel.citcat) -- a different file
#     from the editor's own startup demo, see the copy step below
#   - ?v= cache-busting strings are rewritten to the content hash of each asset
#   - docs/manual.md is rendered to manual.html (no runtime markdown dependency)
#   - docs/gallery.html ships all 8 demo projects: 6 native <citcat-player>
#     tiles plus 2 citcat-cli-batch-exported HTML5 tiles (product-showcase's
#     data bindings only resolve through the exporter, not the browser engine)
#   - citcat-cli is built in release mode as part of this script, so the two
#     exported tiles never go stale against either .citcat file or its data
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

# ---- Gallery page: all 8 demo projects ----
# Spec: _teams/citcat/design/gallery-page/FO-gallery-page.md. docs/gallery.html
# is a static sibling of index.html (same relative-path base, see below), so
# the six native <citcat-player> tiles' project JSON and asset folders land at
# the SAME relative locations the editor/export already use -- a Image/Video/
# Audio/Svg object's `content` path is resolved by the browser against the
# PAGE's own location, never against the JSON's fetch URL, so gallery.html
# must sit at site root for these to resolve (exactly like demo-showcase.json
# and landing-showreel-assets/ already do for index.html above).
mkdir -p "$OUT/gallery-assets"

# Each .citcat file already IS the wire JSON <citcat-player> fetches (same
# convention as demo-showcase.json above) -- just copy, no conversion step.
cp "$ROOT/templates/landing-showreel.citcat"                     "$OUT/gallery-assets/landing-showreel.json"
cp "$ROOT/templates/demo-showcase.citcat"                        "$OUT/gallery-assets/demo-showcase.json"
cp "$ROOT/templates/citcat-reel.citcat"                          "$OUT/gallery-assets/citcat-reel.json"
cp "$ROOT/examples/presentation/company-intro.citcat"            "$OUT/gallery-assets/company-intro.json"
cp "$ROOT/examples/interactive-training/safety-training.citcat"  "$OUT/gallery-assets/safety-training.json"
cp "$ROOT/examples/music-video/lyric-video.citcat"                "$OUT/gallery-assets/lyric-video.json"

# citcat-reel's own asset folder: ambient pad/chime, hand-drawn SVG mark (inline
# in the project, not a file), mock canvas still, trimmed video. Mara's file —
# see the commit that added templates/citcat-reel.citcat for the full story.
mkdir -p "$OUT/assets/citcat-reel"
find "$ROOT/templates/assets/citcat-reel" -maxdepth 1 -type f ! -name '_*' \
     -exec cp {} "$OUT/assets/citcat-reel/" \;

# lyric-video's own asset folder (skyline/rain/grain stills + a short clip).
# Its background-music object points at midnight-rain.mp3, which
# examples/music-video/README.md says plainly is not shipped -- "the visuals
# run either way" -- a documented absence, not a build gap.
mkdir -p "$OUT/assets"
find "$ROOT/examples/music-video/assets" -maxdepth 1 -type f ! -name '_*' \
     -exec cp {} "$OUT/assets/" \;

# demo-showcase, company-intro and safety-training carry no external assets —
# shapes, text and buttons only.

# ---- Two exported-HTML5 product tiles (the data-binding pair) ----
# product-showcase[-sqlite].citcat both carry {{placeholder}} bindings the
# browser engine never resolves -- only citcat-cli's export path does (see
# examples/product-catalogue/README.md, "A note on where binding happens").
# Generated fresh on every build (not run by hand once and committed) so a
# future edit to either .citcat file or its data source can't silently leave
# the embedded output stale -- the same principle that example's own
# _build.py/_gen_sqlite.py/_gen_assets.py already state for themselves.
echo "building citcat-cli (release) for the gallery's batch-export tiles..."
cargo build --release --manifest-path "$ROOT/src-tauri/Cargo.toml" --bin citcat-cli --quiet
CITCAT_CLI="$ROOT/src-tauri/target/release/citcat-cli"

build_showcase_tile() {
  # $1 = project  $2 = db source  $3 = output filename under gallery-assets/
  # remaining args are passed through to `citcat-cli batch` (e.g. --table)
  local project="$1" db="$2" out_name="$3"
  shift 3
  local tmp
  tmp="$(mktemp -d)"
  # The exporter's --single-file embeds each Image/Video/Audio/Svg object's
  # `content` as base64 by reading it as a plain relative path (see
  # src-tauri/src/export/html.rs, encode_file_base64/collect_asset_paths) --
  # resolved against the PROCESS's cwd, not the project file's own folder.
  # examples/product-catalogue/README.md's own usage says "From this
  # directory" for exactly this reason. Running from $ROOT instead silently
  # produced an empty ASSETS map and a literal images/ecospin.png left in the
  # exported HTML -- it 404s instead of erroring, the same preview.py-shaped
  # trap this build script is supposed to be guarding against. cd into the
  # project's own directory, matching the README, so the embed actually lands.
  ( cd "$(dirname "$project")" && \
    "$CITCAT_CLI" batch "$(basename "$project")" "$tmp" \
      --db "$(basename "$db")" --single-file --name-column sku "$@" >/dev/null )
  # Batch exports one self-contained HTML file per data row; the gallery shows
  # one representative row (the first, alphabetically) -- the point being
  # demonstrated is the export mechanism and the bound layout working, not
  # browsing all five rows in a marketing tile.
  local first
  first="$(find "$tmp" -maxdepth 1 -name '*.html' | sort | head -1)"
  cp "$first" "$OUT/gallery-assets/$out_name"
  rm -rf "$tmp"
}
build_showcase_tile \
  "$ROOT/examples/product-catalogue/product-showcase.citcat" \
  "$ROOT/examples/product-catalogue/sample-products.csv" \
  "product-showcase.html"
build_showcase_tile \
  "$ROOT/examples/product-catalogue/product-showcase-sqlite.citcat" \
  "$ROOT/examples/product-catalogue/products.sqlite" \
  "product-showcase-sqlite.html" \
  --table products

# ---- Gallery page itself ----
cp "$ROOT/docs/gallery.html" "$OUT/gallery.html"

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

/assets/*
  Cache-Control: public, max-age=86400

/gallery-assets/*
  Cache-Control: public, max-age=86400

/embed.js
  Cache-Control: public, max-age=86400

/player.html
  Cache-Control: public, max-age=0, must-revalidate
HEADERS

echo "built $OUT"
echo "  runtime.js         ?v=$V_RUNTIME"
echo "  demo-showcase.json ?v=$V_DEMO"
echo "  gallery.html       (8 tiles: 6 native + 2 exported HTML5)"
ls -la "$OUT"
