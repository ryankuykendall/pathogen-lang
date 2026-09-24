#!/usr/bin/env bash
# Regenerates the producer/origin matrix by compiling one tiny program per case,
# so a method that throws is recorded as a result rather than killing the run.
# Usage:  bash project-docs/placement-audit/probes/run-probes.sh [--md]
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

CASES="project-docs/placement-audit/probes/cases.tsv"

# A POSITIONED block (leading m) and a projected path, so "keeps its place" and
# "re-bases to its own first point" are distinguishable in the result.
recv_block="@{ m 40 25 h 60 as segment('edge') v 30 h -60 z }"
# F9: a NON-positioned block, so "kind" and "carries a leading m" vary independently.
recv_flat="@{ h 60 as segment('edge') v 30 h -60 z }"
other_flat="@{ m 30 15 h 60 v 30 h -60 z }"
knife_flat="@{ m 30 0 v 30 }"
other_block="@{ m 70 40 h 60 v 30 h -60 z }"
knife_block="@{ m 70 25 v 30 }"

recv_projected="@{ h 60 as segment('edge') v 30 h -60 z }.project(200, 300)"
other_projected="@{ h 60 v 30 h -60 z }.project(230, 315)"
knife_projected="@{ v 30 }.project(230, 300)"

emit_row() {  # receiver_id  label  expression
  local rid="$1" label="$2" expr="$3"
  local R OTHER KNIFE
  case "$rid" in
    block)     R="$recv_block";     OTHER="$other_block";     KNIFE="$knife_block" ;;
    flat)      R="$recv_flat";      OTHER="$other_flat";      KNIFE="$knife_flat" ;;
    projected) R="$recv_projected"; OTHER="$other_projected"; KNIFE="$knife_projected" ;;
  esac
  expr="${expr//OTHER/$OTHER}"
  expr="${expr//KNIFE/$KNIFE}"
  expr="${expr//R./RECV.}"

  # --print-logs echoes the log EXPRESSION then '= ' then the value, so the row is
  # built into a variable first: logging a bare identifier keeps the template out
  # of the output and leaves exactly one 'ROW|' on the line.
  local prog
  prog="define ViewBox(0, 0, 800, 800);
define default PathLayer('probe') #{ fill: none; };
let RECV = ${R};
M 0 0;
let RESULT = ${expr};
let row = \`ROW|${rid}|${label}|\${RESULT.startPoint}|\${RESULT.d}\`;
log(row);"

  local out
  out=$(npx tsx src/cli.ts -e "$prog" --print-logs 2>&1)
  if grep -q 'ROW|' <<<"$out"; then
    grep -o 'ROW|.*' <<<"$out" | head -1
  else
    local err
    err=$(grep -oE '(Error|error):.*' <<<"$out" | head -1 | cut -c1-90)
    echo "ROW|${rid}|${label}|THREW|${err:-unknown error}"
  fi
}

RAW=$(mktemp)
grep -v '^#' "$CASES" | grep -v '^[[:space:]]*$' | while IFS=$'\t' read -r rid label expr; do
  [ -z "${rid:-}" ] && continue
  emit_row "$rid" "$label" "$expr"
done | tee "$RAW" >/dev/null

python3 "$(dirname "$0")/format-matrix.py" "$RAW"
rm -f "$RAW"
