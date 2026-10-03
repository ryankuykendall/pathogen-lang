#!/usr/bin/env bash
# Compile every published sample (website/blog/samples/**/*.pathogen) with --json and
# list the warnings carrying one code: one line per warning, then a per-file count and
# a total. compare-samples.sh diffs rendered SVG and so cannot see a warning; this is
# the measurement a new warning needs before it ships ("no published sample trips it").
#
#   bash project-docs/placement-audit/probes/count-warnings.sh <warning-code> [more dirs…]
#
# Extra directories (e.g. docs/samples) are scanned as well.
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

code="${1:?warning-code}"; shift
dirs=(website/blog/samples "$@")

files=0; hit_files=0; total=0; failed=0
while IFS= read -r src; do
  files=$((files + 1))
  if ! json="$(npx tsx src/cli.ts "$src" --json 2>/dev/null)"; then
    failed=$((failed + 1)); echo "FAILED $src"; continue
  fi
  lines="$(printf '%s' "$json" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const ws = (JSON.parse(s).warnings || []).filter((w) => w.code === process.argv[1]);
      for (const w of ws) console.log(`${process.argv[2]}:${w.line ?? "?"}:${w.column ?? "?"} ${w.message}`);
    });' "$code" "$src")"
  if [ -n "$lines" ]; then
    n="$(printf '%s\n' "$lines" | wc -l | tr -d ' ')"
    hit_files=$((hit_files + 1)); total=$((total + n))
    printf '%s\n' "$lines"
  fi
done < <(find "${dirs[@]}" -name '*.pathogen' | sort)
echo "$code: $total warnings in $hit_files of $files files ($failed failed to compile)"
