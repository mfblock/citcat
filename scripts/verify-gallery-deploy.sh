#!/usr/bin/env bash
# Verify the deployed gallery actually serves real media, not Cloudflare
# Pages' 200 SPA-fallback HTML for a missing path.
#
# Vera's observation that caused this script to exist: "On Pages a 200 proves
# nothing -- check content-type, not status, wherever the build verifies a
# deploy." A `curl -o /dev/null -w "%{http_code}"` check happily passes with
# 200 against a wrong/missing asset path, because Cloudflare Pages serves its
# SPA fallback (index.html) instead of a 404. That's exactly the bug class
# that let the gallery-page defect (FO-gallery-page.md §8) go unnoticed until
# Mirjam looked at the page herself.
#
# Two passes, both content-type-based, no bare status checks:
#
#   1. Every file actually staged under site/gallery-assets/ (built by
#      scripts/build-site.sh) -- asserts the deployed URL's Content-Type
#      *category* (image/*, video/*, audio/*; application/json and text/html
#      stay exact-matched, nothing media-shaped about them) matches what the
#      file's extension implies. Broad category rather than exact subtype
#      (was: image/png, now: image/*) per Vera's hardening request -- a
#      legitimate server-side subtype quirk (e.g. audio/mp3 vs audio/mpeg)
#      shouldn't fail the gate; only the SPA-fallback failure mode (always
#      text/html, never starting with the right category) should.
#
#   2. Every Image/Video/Audio `content` path *referenced inside* each
#      project's own staged JSON (recursively, including scene background
#      images) -- resolved project-relative, the same way
#      src/js/embed-wrapper.js's _resolveAssetPaths resolves it for the real
#      page. This is the pass 1 cannot do: pass 1 only ever looks at
#      files that exist on disk, so a project that *declares* an asset which
#      was never generated/staged at all -- lyric-video.citcat's
#      midnight-rain.mp3 dangling reference, caught 2026-10-02 -- was
#      invisible to it. Pass 2 walks the declaration itself, so a future
#      example that forgets to generate an asset it references fails loudly
#      here instead of silently 200-ing HTML on the live page.
#
# Usage: scripts/verify-gallery-deploy.sh [base-url]
#   (default base-url: https://citcat.mirjam-block.eu)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="$ROOT/site/gallery-assets"
BASE_URL="${1:-https://citcat.mirjam-block.eu}"

if [ ! -d "$SITE" ]; then
  echo "verify-gallery-deploy: $SITE does not exist -- run scripts/build-site.sh first" >&2
  exit 2
fi

# Broad content-type category expected for a given file extension. Prefix
# match against the live Content-Type header, not an exact subtype -- see
# header comment.
expected_prefix() {
  case "${1##*.}" in
    json) echo "application/json" ;;
    html) echo "text/html" ;;
    png|gif|jpg|jpeg|svg|webp) echo "image/" ;;
    mp4|webm|mov) echo "video/" ;;
    mp3|wav|ogg|m4a) echo "audio/" ;;
    *)    echo "" ;;
  esac
}

content_type_of() {
  curl -sS -L -o /dev/null -D - "$1" | tr -d '\r' \
    | awk -F': ' 'tolower($1)=="content-type"{t=tolower($2)} END{print t}'
}

fail=0
checked=0

echo "-- pass 1: staged files on disk --"
while IFS= read -r -d '' file; do
  rel="${file#"$SITE"/}"
  want="$(expected_prefix "$rel")"
  [ -z "$want" ] && continue
  url="$BASE_URL/gallery-assets/$rel"
  # -L: Cloudflare Pages 308-redirects a bare *.html request to its
  # extensionless clean URL (e.g. product-showcase.html -> product-showcase)
  # before serving it -- the same thing a browser's iframe follows
  # transparently. Follow it so that's not reported as a false failure.
  got="$(content_type_of "$url")"
  checked=$((checked + 1))
  case "$got" in
    "$want"*) echo "ok    $rel  ($got)" ;;
    *)
      echo "FAIL  $rel  want=${want}*  got=${got:-<empty>}  url=$url" >&2
      fail=$((fail + 1))
      ;;
  esac
done < <(find "$SITE" -type f -print0)

echo "-- pass 2: assets referenced inside each project's own JSON --"
while IFS= read -r -d '' json; do
  rel="${json#"$SITE"/}"          # e.g. lyric-video/lyric-video.json
  projdir="$(dirname "$rel")"      # e.g. lyric-video
  while IFS=$'\t' read -r otype content; do
    [ -z "$content" ] && continue
    case "$otype" in
      Image) want="image/" ;;
      Video) want="video/" ;;
      Audio) want="audio/" ;;
      *) continue ;;
    esac
    url="$BASE_URL/gallery-assets/$projdir/$content"
    got="$(content_type_of "$url")"
    checked=$((checked + 1))
    case "$got" in
      "$want"*) echo "ok    $projdir/$content  ($got)" ;;
      *)
        echo "FAIL  $projdir/$content  want=${want}*  got=${got:-<empty>}  url=$url" >&2
        fail=$((fail + 1))
        ;;
    esac
  done < <(python3 - "$json" <<'PYEOF'
import json, sys

d = json.load(open(sys.argv[1]))
seen = set()

def emit(otype, content):
    if not content:
        return
    if content.startswith(("http://", "https://", "data:")):
        return
    key = (otype, content)
    if key in seen:
        return
    seen.add(key)
    print(f"{otype}\t{content}")

def walk(o):
    if isinstance(o, dict):
        ot = o.get("object_type")
        if ot in ("Image", "Video", "Audio"):
            emit(ot, o.get("content"))
        bg = o.get("background")
        if isinstance(bg, dict) and bg.get("image"):
            emit("Image", bg["image"])
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)

walk(d)
PYEOF
)
done < <(find "$SITE" -maxdepth 2 -name '*.json' -print0)

echo "---"
echo "checked $checked gallery asset(s) against $BASE_URL, $fail mismatch(es)"
if [ "$fail" -gt 0 ]; then
  exit 1
fi
