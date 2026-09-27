#!/usr/bin/env bash
# Re-runs the measured defects in 05-defects.md.
# Each probe prints one of:
#   PRESENT    the bug reproduces
#   FIXED      it no longer does
#   MITIGATED  the agreed mitigation holds (D2 — Option A is deliberately unbuilt)
#   AS-SPEC    the behaviour is by design and unchanged (D6)
#   CHANGED    a by-design behaviour moved — go and look
# so this doubles as the regression check if any of them are ever addressed.
#
#   bash project-docs/placement-audit/probes/run-defects.sh
set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

pass() { printf '  %-9s %s\n' "FIXED" "$1"; }
fail() { printf '  %-9s %s\n' "PRESENT" "$1"; }
label() { printf '  %-9s %s\n' "$1" "$2"; }

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

echo "D2 — a query on a transformed layer answers pre-transform (MITIGATED — Option A unbuilt, see D2-layer-transform-queries.md)"
# Three checks. (1) the original defect — still expected to reproduce, because applying the
# transform to query results (Option A) was deliberately not built; if it stops reproducing,
# someone built it. (2) the shorthand reads back through ctx.transform (fact 1). (3) the
# cross-layer subscription warning fires (option D).
q=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 400, 400);
define default PathLayer('sink') #{ fill: none; };
let moved = PathLayer('moved') #{ fill: none; translate-x: 100; translate-y: 50; };
moved.apply { M 10 10; L 60 10; }
let q = \`\${layer('moved').query('endpoint:last').point}\`;
log(q);
" --print-logs 2>&1 | grep -oE 'Point\([0-9.,  ]*\)' | head -1)
rb=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 400, 400);
define default PathLayer('sink') #{ fill: none; };
let moved = PathLayer('moved') #{ fill: none; translate-x: 100; translate-y: 50; };
moved.apply { M 10 10; L 60 10; }
let out = \`readback=\${layer('moved').ctx.transform.translate.x},\${layer('moved').ctx.transform.translate.y}\`;
log(out);
" --print-logs 2>&1 | grep -oE 'readback=[0-9,]+' | head -1)
wn=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 400, 400);
define default PathLayer('sink') #{ fill: none; };
let src = PathLayer('src') #{ fill: none; translate-x: 100; translate-y: 50; };
let dst = PathLayer('dst') #{ fill: #c00; };
src.subscribe('endpoint') {|pt, i, sub| dst.apply { circle(pt.x, pt.y, 2); } };
src.apply { M 10 10; L 60 10; }
" --print-logs 2>&1 | grep -c "Subscription on 'src' drew into 'dst'")
if [ "$q" = "Point(160, 60)" ]; then
  label "CHANGED" "query reports post-transform $q — Option A was built; update D2-layer-transform-queries.md"
elif [ "$rb" = "readback=100,50" ] && [ "$wn" -ge 1 ]; then
  label "MITIGATED" "query reports $q (layer's own space, documented); shorthand reads back 100,50; layer-transform warning fires"
else
  fail "mitigation regressed: readback=${rb:-none}, warnings=${wn:-0} (query reports ${q:-nothing})"
fi

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

echo "D5 — the conic gradient ignores the viewBox origin"
# The viewBox starts at (-100, -100); the pattern tile (and the inner-fill mask behind it)
# must start there too, or the visible area shows wrapped tiles of the wrong quadrant.
out=$(npx tsx src/cli.ts -e "
define ViewBox(-100, -100, 200, 200);
let g = ConicGradient('g', 0, 0) {|c|
  c.stop(0, Color('#e63946'));
  c.stop(1, Color('#264653'));
};
define default PathLayer('bg') #{ fill: g; stroke: none; };
M -100 -100;
h 200;
v 200;
h -200;
z;
" --output-svg-file=/dev/stdout 2>/dev/null | grep -oE '<pattern id="g" x="[-0-9.]+" y="[-0-9.]+"' | head -1)
if [ "$out" = '<pattern id="g" x="-100" y="-100"' ]; then pass "pattern tile starts at the viewBox origin: $out"; else fail "viewBox starts at -100,-100 but ${out:-no pattern emitted}"; fi

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
  label "CHANGED" "the re-basing was removed — check post40/shattered-glyph ($out)"
else
  label "AS-SPEC" "index inert (re-based result); rotate() and atVertex(2) agree to $sep"
fi

echo "D7 — a bare number in the layer rotate key silently means radians"
# Fixed 2026-09-26 by rejecting the literal: a bare 45 in a radians slot is an error that
# names both spellings; 45deg compiles and emits rotate(45). Both halves must hold.
err=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 200, 200);
define default PathLayer('p') #{ fill: none; rotate: 45; };
M 10 10;
h 50;
" --output-svg-file=/dev/stdout 2>&1 >/dev/null | head -1)
out=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 200, 200);
define default PathLayer('p') #{ fill: none; rotate: 45deg; };
M 10 10;
h 50;
" --output-svg-file=/dev/stdout 2>/dev/null | grep -oE 'rotate\([-0-9.]+\)' | head -1)
if grep -q '45 needs a unit' <<<"$err" && [ "$out" = "rotate(45)" ]; then
  pass "bare 45 is rejected (\"45 needs a unit\"); 45deg emits rotate(45)"
else
  fail "bare 45 → ${err:-compiled silently}; 45deg → ${out:-nothing}"
fi

echo "D8 — ProjectedText.polarProject stores a delta as origin"
# The unchained call reports the true origin; chaining it after project(50, 100) must
# report the same point, not the prior origin subtracted from it.
out=$(npx tsx src/cli.ts -e "
define ViewBox(0, 0, 400, 400);
define default PathLayer('p') #{ fill: none; };
let t = &{ text(0, 16)\`X\` } << #{ font-size: 16; };
let direct = \`direct=\${t.polarProject(100, 100, 0deg, 50, BBoxAnchor.TopLeft).origin}\`;
let chained = \`chained=\${t.project(50, 100).polarProject(100, 100, 0deg, 50, BBoxAnchor.TopLeft).origin}\`;
log(direct);
log(chained);
M 0 0;
" --print-logs 2>&1 | grep -oE '(direct|chained)=Point\([-0-9., ]*\)' | tr '\n' ' ')
if grep -q 'chained=Point(150, 100)' <<<"$out"; then pass "origin is cumulative: $out"; else fail "${out}— chained should equal direct; the prior origin was subtracted instead of kept"; fi

echo "D9 — dash() % resolves against the combined drawn length (AS-SPEC — documented; the denominator is .length)"
# Decided 2026-09-26: the combined total stays (one absolute dash length across all subpaths,
# like SVG), the pattern restarts per subpath, and the number is exactly .length. A 100+20
# receiver at 50% therefore gets a first dash of 60 — ratio 0.5 of .length. Per-contour
# division is documented as dashing each .contours entry.
out=$(npx tsx src/cli.ts -e "
define default PathLayer('p') #{ fill: none; };
let p = @{ h 100 m 10 0 h 20 };
let first = p.dash(#{ stroke-dasharray: 50%; })[0].path.length;
let out = \`ratio=\${calc(first / p.length)}\`;
log(out);
M 0 0;
" --print-logs 2>&1 | grep -oE 'ratio=[0-9.]+' | head -1)
if [ "$out" = "ratio=0.5" ]; then
  label "AS-SPEC" "50% of a 100+20 receiver is 60, half of .length (combined); the pattern restarts per subpath — documented"
else
  label "CHANGED" "50% of a 100+20 receiver gave $out of .length — the denominator moved; update docs/path-blocks.md"
fi

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
