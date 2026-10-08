#!/bin/bash
# Static verification of the generated site: every inline script must parse,
# every anchor must have a target, HTML tag balance must hold on code pages.
set -u
BASE="${1:-http://localhost:8090}"
SITEDIR="${2:-/root/elden-site/site}"
TMP=$(mktemp -d)
fail=0

# collect all html pages
cd "$SITEDIR"
pages=$(find . -name '*.html' | sed 's|^\.||')

for p in $pages; do
  html=$(curl -s "$BASE$p")
  [ -z "$html" ] && { echo "EMPTY $p"; fail=1; continue; }

  # 1. every inline <script> (without src) must parse as JS
  n=$(grep -o '<script>' <<< "$html" | wc -l)
  if [ "$n" -gt 0 ]; then
    awk '/<script>/{f=1;next} /<\/script>/{f=0} f' <<< "$html" > "$TMP/s.js"
    node --check "$TMP/s.js" 2>"$TMP/s.err" || { echo "JS SYNTAX FAIL $p"; cat "$TMP/s.err"; fail=1; }
  fi

  # 2. every href="#..." anchor must have a matching id (same page)
  ids=$(grep -o 'id="[^"]*"' <<< "$html" | sed 's/id="//;s/"//' | sort -u)
  bad=0
  for a in $(grep -o 'href="#[^"]*"' <<< "$html" | sed 's/href="#//;s/"//' | grep -v '^$'); do
    grep -qx "$a" <<< "$ids" || bad=$((bad+1))
  done
  [ "$bad" -gt 0 ] && { echo "DANGLING ANCHORS ($bad) on $p"; fail=1; }

  # 3. span balance on code pages
  if [[ "$p" == *".rs.html" || "$p" == *".py.html" ]]; then
    o=$(grep -o '<span' <<< "$html" | wc -l); c=$(grep -o '</span>' <<< "$html" | wc -l)
    [ "$o" = "$c" ] || { echo "SPAN IMBALANCE $p: $o open vs $c close"; fail=1; }
  fi
done

echo "pages checked: $(wc -l <<< "$pages"), fail=$fail"
rm -rf "$TMP"
exit $fail
