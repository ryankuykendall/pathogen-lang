#!/usr/bin/env bash
# Render every published sample (website/blog/samples/**/*.pathogen) to SVG through
# the CLI wedge path (no --render-gpu, so the output is deterministic), or diff two
# such render directories byte-for-byte. The safety net for behaviour-preserving
# refactors of the evaluator (V8 was the first user; the D4 comparison was never
# checked in, hence this script).
#
#   bash project-docs/placement-audit/probes/compare-samples.sh render <out-dir>
#   bash project-docs/placement-audit/probes/compare-samples.sh diff <dir-a> <dir-b>
#
# Three samples use random() and differ from THEMSELVES between runs — render twice
# and diff the two "before" directories first to know which files to discount.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

mode="${1:-}"
case "$mode" in
  render)
    out="${2:?out-dir}"
    mkdir -p "$out"
    n=0; failed=0
    while IFS= read -r src; do
      rel="${src#website/blog/samples/}"
      dst="$out/${rel%.pathogen}.svg"
      mkdir -p "$(dirname "$dst")"
      if ! npx tsx src/cli.ts "$src" --output-svg-file="$dst" >/dev/null 2>"$dst.err"; then
        failed=$((failed + 1)); echo "FAILED $src: $(head -1 "$dst.err")"
      else
        rm -f "$dst.err"
      fi
      n=$((n + 1))
    done < <(find website/blog/samples -name '*.pathogen' | sort)
    echo "rendered $n samples into $out ($failed failed)"
    ;;
  diff)
    a="${2:?dir-a}"; b="${3:?dir-b}"
    same=0; differ=0; missing=0
    while IFS= read -r fa; do
      rel="${fa#$a/}"; fb="$b/$rel"
      if [ ! -f "$fb" ]; then missing=$((missing + 1)); echo "MISSING in $b: $rel"; continue; fi
      if cmp -s "$fa" "$fb"; then same=$((same + 1)); else differ=$((differ + 1)); echo "DIFFERS: $rel"; fi
    done < <(find "$a" -name '*.svg' | sort)
    echo "identical: $same · differ: $differ · missing: $missing"
    [ "$differ" -eq 0 ] && [ "$missing" -eq 0 ]
    ;;
  *)
    echo "usage: $0 render <out-dir> | diff <dir-a> <dir-b>" >&2; exit 2 ;;
esac
