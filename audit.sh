#!/bin/bash
# Completion audit: every generated page and raw asset must return 200 through
# whatever is serving the site — usually the live tunnel.
#
#   URL=https://foo.trycloudflare.com bash audit.sh [SITEDIR]
#
# URL comes from the environment, not a default: hard-coding whatever tunnel a
# previous run happened to get would silently audit the wrong host.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
URL="${URL:-}"
SITEDIR="${1:-$HERE/site}"

if [ -z "$URL" ]; then
  echo "usage: URL=https://<host> bash audit.sh [SITEDIR]" >&2
  exit 2
fi
URL="${URL%/}"

cd "$SITEDIR" || { echo "no such site dir: $SITEDIR" >&2; exit 1; }
fail=0; n=0
check() {
  local path="$1" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL$path")
  n=$((n+1))
  if [ "$code" != "200" ]; then echo "FAIL $code $path"; fail=$((fail+1)); fi
}
while IFS= read -r f; do check "/${f#./}"; done < <(find . -name '*.html' -type f | sort)
while IFS= read -r f; do check "/${f#./}"; done < <(find ./raw -type f | sort)
check /search.html
check /search-index.json
check /hljs/github-dark.min.css
echo "checked $n URLs through $URL, failures=$fail"
exit $((fail > 0))
