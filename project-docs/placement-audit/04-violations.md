# 04 — Violations, ranked and costed

Every operation that breaks a principle from `03-principles.md`, ranked by how likely a user
is to hit it. Each carries a fix and what the fix would cost.

**On the cost numbers.** Counts are files that mention the method anywhere in
`website/blog/samples/` and `tests/`. They are an **upper bound**: only calls on a
*projected* receiver are affected by P3, and separating those needs per-call receiver typing,
which this audit did not attempt. **Byte-snapshot exposure is zero for every row** — none of
the 13 fixtures in `project-docs/render-pipeline-unification/snapshots/` uses any of these
methods.

---

## V1 — Six methods on a ProjectedPath return a PathBlock · P3 · **highest impact**

`subPath`, `union`, `difference`, `intersection`, `xor`, `cut`. All are declared as returning
`ProjectedPath` in `src/pathogen-api.ts`. Three of them (`union`/`difference`/`cut`) hand back
page numbers inside a relative value, so drawing the result double-places it.

| Method | samples | test files | Note |
|---|---|---|---|
| `cut` | 26 | 3 | the big one |
| `difference` | 13 | 4 | |
| `union` | 5 | 4 | |
| `xor` | 3 | 1 | |
| `subPath` | 1 | 3 | ISSUE-025 |
| `intersection` | 1 | 1 | |

**Fix A (conforming):** return a ProjectedPath from a projected receiver. Makes the
declarations true, removes four exceptions. Breaking for anyone relying on the relative
result — in practice that means code doing `M x y; piece.draw()`, which would then
double-place.

**Fix B (declare the truth):** change the declarations to `PathogenPathBlock`. Zero runtime
break, fixes completions and hover, leaves the inconsistency in place. This is ISSUE-025's
recorded option 1.

**Recommendation:** B now — it is documentation-only and removes a live false promise — and A
behind a version decision, since the same change would land for all six methods at once.

---

## V2 — `subPath`, `segment` and `reverse` discard position unrecoverably · P2 · **highest value, lowest cost**

They re-base to `(0,0)` and nothing on the result records what was removed. The caller must
still hold the receiver and know which `t` they asked for.

**Fix:** give them `anchor`, exactly as `variableOffset` has it. `result.drawTo(result.anchor)`
becomes an identity.

**Cost: none.** Purely additive — a new member on values that currently throw on `anchor`.
No return type changes, no output changes, no sample touched. Needs a declaration in
`pathogen-api.ts` plus `generate:completions`.

**This is the single highest value-to-risk item in the audit,** and it answers ISSUE-025
without changing what `subPath` returns.

---

## V3 — The positioned block is cursor-dependent · P1, P5 · **root cause**

`cut` pieces, `dash` pieces, `.contours` and `@{ m … }` literals carry position as a leading
`m`, which is correct only when drawn from `(0,0)`. From any other cursor they shift silently.

**Fix (containment, cheap):** warn when a value whose first command is a move is drawn from a
non-origin cursor. Additive, catches the cut-piece shift and the glyph-halo class of bug.

**Fix (elimination, expensive):** fold into V1 — on a projected receiver these return
ProjectedPaths and the state disappears for derived values. The `@{ m … }` literal keeps it,
by design.

**Cost:** the warning is free. Elimination is V1's cost.

---

## V4 — Emitting path data with no leading moveto is silent · P5 · **user-visible breakage**

Two forms, same cause: `05-defects.md` D1 (every defs producer) and ISSUE-015 (a normalized
block drawn first into a layer). Both produce invalid SVG that browsers discard, with
`warnings: []`.

Worse, **two published pages actively teach the idiom that triggers the layer form** —
`docs/variable-offset.md:154` and `docs/subscriptions.md:132` both show `edge.draw()`.

**Fix:** synthesize the moveto where `d` is built (defs and layers), and/or warn. The
`ProjectedPath.d` getter already synthesizes one, so the logic exists.

**Cost:** additive. Synthesizing changes output for programs that are currently broken, which
is the point. Byte-snapshot exposure: zero.

---

## V5 — `drawTo` anchors different things on the two receivers · P3 · **documentation-first**

PathBlock: the frame origin → `(x,y)`. ProjectedPath: the first inked point → `(x,y)`. These
coincide only when the block is not positioned. `docs/path-blocks.md:95` states the ink
version unconditionally.

**Fix:** pick one and document it. The ink version is the more useful and matches
`startPoint`'s definition; the frame version is what a positioned block needs.

**Cost:** changing `PathBlock.drawTo` to anchor the ink would move any program that relies on
the frame behaviour with a leading-`m` block. Documenting the split costs nothing and is the
right first step.

---

## V6 — Default pivots differ by receiver · P3 · **low**

`rotate`/`scale`/`mirror` pivot on `(0,0)` for a PathBlock and on `startPoint` for a
ProjectedPath. Defensible (a block has no `startPoint` worth pivoting on), but undocumented
and surprising when the same call is moved between receivers.

**Fix:** document. Changing it is not worth the break.

---

## V7 — Space conversions are silent · P4 · **medium, needs design**

A PathBlock appended to a `Marker` is read as marker-viewBox coordinates; a ProjectedPath
appended to the same is read as page coordinates inside a `0 0 mw mh` viewBox and renders
nothing. A query on a transformed layer answers pre-transform (D2). No conversion exists for
spaces 3–6.

**Fix:** reject with a message naming both spaces, or write the conversion. Either is a
design task, not a patch.

---

## Suggested order

1. **V2** — additive, highest value, answers ISSUE-025. Do this first.
2. **V4 / D1** — user-visible breakage, additive fix.
3. **D3, D6** — one-line correctness fixes with no design content.
4. **V1 Fix B** — declare the truth; removes the false promise at zero runtime risk.
5. **V3 warning, V5/V6 documentation** — cheap, and they make the surface teachable.
6. **V1 Fix A, V7** — the version decision and the design task. Not before the rest.
