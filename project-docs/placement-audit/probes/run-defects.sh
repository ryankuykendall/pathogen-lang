#!/usr/bin/env bash
# Re-runs the measured defects in 05-defects.md.
# Each probe prints PRESENT (bug reproduces) or FIXED (it no longer does), so this
# doubles as the regression check if any of them are ever addressed.
#
#   bash project-docs/placement-audit/probes/run-defects.sh
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

pass() { printf '  %-8s %s\n' "FIXED" "$1"; }
fail() { printf '  %-8s %s\n' "PRESENT" "$1"; }

echo "D1 — defs producers emit path data with no leading moveto"
out=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 200, 200);
define default PathLayer('p') #{ fill: #000; };
let m = Mask('m1');
m.append(@{ h 40 v 40 h -40 z });
M 10 10;
h 50;
" --output-svg-file=/dev/stdout 2>/dev/null | grep -oE '<path d="[^"]*"' | head -1)
if grep -qE '<path d="[Mm] ' <<<"$out"; then pass "mask path starts with a moveto: $out"; else fail "$out"; fi

echo "D2 — a query on a transformed layer answers pre-transform"
out=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 400, 400);
define default PathLayer('sink') #{ fill: none; };
let moved = PathLayer('moved') #{ fill: none; translate-x: 100; translate-y: 50; };
moved.apply { M 10 10; L 60 10; }
let q = \`\${layer('moved').query('endpoint:last').point}\`;
log(q);
" --print-logs 2>&1 | grep -oE 'Point\([0-9.,  ]*\)' | head -1)
if [ "$out" = "Point(160, 60)" ]; then pass "query reports post-transform $out"; else fail "query reports $out, geometry renders at Point(160, 60)"; fi

echo "D3 — ProjectedPath.drawTo drops labels"
out=$(npx tsx src/cli.ts -e "
define default PathLayer('p') #{ fill: none; };
let b = @{ h 20 as segment('s1') v 20 as segment('s2') };
let moved = b.project(0, 0).drawTo(9, 9);
let n = 0;
for (c in moved.commands) { if (c.segment != null) { n = calc(n + 1); } }
let out = \`labels=\${n}\`;
log(out);
" --print-logs 2>&1 | grep -oE 'labels=[0-9]+' | head -1)
if [ "$out" = "labels=2" ]; then pass "labels survive ($out)"; else fail "$out of 2 survive drawTo"; fi

echo "D4 — ProjectedPath boolean ops return a relative value"
out=$(npx tsx src/cli.ts -e "
define default PathLayer('p') #{ fill: none; };
let a = @{ h 40 v 40 h -40 z }.project(100, 100);
let b = @{ h 40 v 40 h -40 z }.project(120, 120);
let out = \`\${a.union(b).d}\`;
log(out);
M 0 0;
" --print-logs 2>&1 | grep -oE '= [Mm] .*' | tail -1 | cut -c3-40)
if [[ "$out" == M\ * ]]; then pass "union returns absolute data: $out"; else fail "union returns relative data: $out"; fi

echo "D6 — rotateAtVertexIndex index is inert on a PathBlock (BY DESIGN — see 05-defects.md)"
# Compare numerically, not as strings: rotating about (0,0) and about vertex 2
# differ by ~10 units, while two runs of the same rotation differ by ~1e-14.
out=$(npx tsx src/cli.ts -e "
define default PathLayer('p') #{ fill: none; };
let b = @{ m 40 25 h 60 v 30 h -60 z };
let atOrigin = b.rotate(15deg).startPoint;
let atVertex = b.rotateAtVertexIndex(2, 15deg).startPoint;
let sep = calc(abs(atOrigin.x - atVertex.x) + abs(atOrigin.y - atVertex.y));
let out = \`separation=\${sep}\`;
log(out);
M 0 0;
" --print-logs 2>&1 | grep -oE 'separation=[0-9.e-]+' | head -1)
sep="${out#separation=}"
if [ -n "$sep" ] && awk -v s="$sep" 'BEGIN { exit !(s > 0.001) }'; then
  printf '  %-8s %s\n' "CHANGED" "the re-basing was removed — check post40/shattered-glyph ($out)"
else
  printf '  %-8s %s\n' "AS-SPEC" "index inert (re-based result); rotate() and atVertex(2) agree to $sep"
fi

echo "D7 — a bare number in the layer rotate key is radians"
out=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 200, 200);
define default PathLayer('p') #{ fill: none; rotate: 45; };
M 10 10;
h 50;
" --output-svg-file=/dev/stdout 2>/dev/null | grep -oE 'rotate\([-0-9.]+\)' | head -1)
if [ "$out" = "rotate(45)" ]; then pass "bare 45 means 45 degrees"; else fail "bare 45 emits $out (45 radians)"; fi

echo "ISSUE-015 — a normalized block drawn first into a layer emits no moveto"
out=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 200, 200);
define default PathLayer('sink') #{ fill: none; };
let ribbon = PathLayer('ribbon') #{ fill: none; };
let edge = @{ h 100 }.variableOffset() {|go, pb|
  go.stop(0%, 0, CurveContinuity.G1);
  go.stop(50%, 10, CurveContinuity.G2);
  go.stop(100%, 0, CurveContinuity.G1);
};
ribbon.apply { edge.draw(); }
" --output-svg-file=/dev/stdout 2>/dev/null | grep -oE 'id="ribbon" d="[^"]{0,12}' | head -1)
if grep -qE 'd="[Mm] ' <<<"$out"; then pass "ribbon starts with a moveto"; else fail "${out:-ribbon path} has no leading moveto"; fi
