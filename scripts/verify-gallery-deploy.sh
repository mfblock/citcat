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
# This walks every file actually staged under site/gallery-assets/ (built by
# scripts/build-site.sh) and asserts the deployed URL's Content-Type header
# matches what that file's extension implies -- any text/html coming back for
# an .mp4/.png/.json/etc. path means the real asset isn't being served.
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

expected_type() {
  case "${1##*.}" in
    json) echo "application/json" ;;
    html) echo "text/html" ;;
    png)  echo "image/png" ;;
    gif)  echo "image/gif" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    svg)  echo "image/svg+xml" ;;
    mp4)  echo "video/mp4" ;;
    webm) echo "video/webm" ;;
    mp3)  echo "audio/mpeg" ;;
    wav)  echo "audio/wav" ;;
    *)    echo "" ;;
  esac
}

fail=0
checked=0
while IFS= read -r -d '' file; do
  rel="${file#"$SITE"/}"
  want="$(expected_type "$rel")"
  [ -z "$want" ] && continue
  url="$BASE_URL/gallery-assets/$rel"
  got="$(curl -sS -o /dev/null -D - "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | head -1)"
  checked=$((checked + 1))
  case "$got" in
    "$want"*) echo "ok    $rel  ($got)" ;;
    *)
      echo "FAIL  $rel  want=$want got=${got:-<empty>}  url=$url" >&2
      fail=$((fail + 1))
      ;;
  esac
done < <(find "$SITE" -type f -print0)

echo "---"
echo "checked $checked gallery asset(s) against $BASE_URL, $fail mismatch(es)"
if [ "$fail" -gt 0 ]; then
  exit 1
fi
