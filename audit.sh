#!/bin/bash
# Completion audit: every generated page and raw asset must return 200 through the tunnel.
URL="https://lung-associations-plaza-dale.trycloudflare.com"
SITEDIR="${1:-/root/elden-site/site}"
cd "$SITEDIR" || exit 1
fail=0; n=0
check() {
  local path="$1" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL$path")
  n=$((n+1))
  if [ "$code" != "200" ]; then echo "FAIL $code $path"; fail=$((fail+1)); fi
}
while IFS= read -r f; do check "$f"; done < <(find . -name '*.html' | sed 's|^\.||')
while IFS= read -r f; do check "$f"; done < <(find ./raw -type f | sed 's|^\.||')
check /search.html
check /search-index.json
check /hljs/github-dark.min.css
echo "checked $n URLs through tunnel, failures=$fail"
