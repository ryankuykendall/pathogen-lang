# 04 — Violations, ranked and costed

Revised 2026-09-24 after review: V2's cost was wrong, V4 carried a mis-citation, V3's warning
is not free, and V8 was missing. The order below changed as a result.

**On the cost numbers.** The counts column is **files mentioning the method anywhere, on any
receiver** — an upper bound, not exposure. Only calls on a *projected* receiver are affected
by P3, and separating those needs per-call receiver typing, which this audit did not attempt.
**Byte-snapshot exposure is zero for every row** (verified: none of the 13 fixtures in
`project-docs/render-pipeline-unification/snapshots/` uses any of these methods).

---

## V4 — Path data with no leading moveto is emitted silently · P5a · **DONE 2026-09-24**

Two forms, one cause (Cause B in `03`): command lists are not self-contained SVG and each
serializer decides independently whether to synthesize a moveto.

- **D1** — `Mask`/`ClipPath`/`Pattern`/`Marker.append()` and `.contour()` emit
  `<path d="H 40 V 40 H 0 Z"/>`. Invalid; browsers discard the path; the mask is empty.
- **ISSUE-015** — a block with no leading move drawn first into a layer emits `d="c 16.99…"`.
  Same shape, recorded since 2026-09-09.

`ProjectedPath.d` already synthesizes the moveto (`index.ts:6420`), so the logic exists and
only has to be reused.

**Cost:** additive. It changes output only for programs that are currently emitting invalid
SVG, which is the point. Snapshot exposure verified zero — and the reason is instructive: the
six defs fixtures author `@{ m 0 0 … }`, so they already serialize validly.

**Severity:** D1 is rated High in `05-defects.md`. ISSUE-015's fix is already recorded as
"warning + `M 0 0` prepend" in `glyph-halo-diagnosis/STATUS.md:147`.

> *Removed from this section:* a claim that two published pages teach the idiom that triggers
> the layer form. They do not. `variable-offset.md:178` and `subscriptions.md:132` both use a
> **projected** spine, where `draw()` emits its own `M`; the block-spine example at
> `variable-offset.md:212` writes `M calc(x + ribbon.anchor.x) …` first. The pages teach the
> correct idiom. D1's severity carries this row without the embellishment.

---

## V1+V2 — Declarations the runtime refuses · P3, P2 · **one pass, after a decision on `subPath`**

These are the same defect class and should land together.

**V1 — six methods return the wrong kind.** On a ProjectedPath, `subPath`, `union`,
`difference`, `intersection`, `xor` and `cut` hand back a PathBlock; all six are declared as
returning a `ProjectedPath`. The boolean ops and `cut` return page numbers inside a relative
value, so drawing one double-places it.

| Method | files mentioning (any receiver) | test files |
|---|---|---|
| `cut` | 26 | 3 |
| `difference` | 13 | 4 |
| `union` | 5 | 4 |
| `xor` | 3 | 1 |
| `subPath` | 1 | 3 |
| `intersection` | 1 | 1 |

**V2 — `anchor` is declared but throws.** `readonly anchor: PathogenPoint` is declared
**unconditionally** on `PathogenPathBlock` (`pathogen-api.ts:922`) and on
`PathogenProjectedPath` (`:1340`), while the runtime throws unless the value came from
`variableOffset` (`index.ts:6319`, `:6429`). So completions and hover already offer `.anchor`
on `subPath`/`segment`/`reverse` results and the runtime refuses it.

This corrects the first draft, which called V2 "Cost: none" and said it "needs a declaration
in `pathogen-api.ts`". The declaration exists. V2 is not an addition — it is the same
promise-vs-runtime drift as V1, and the honest argument for it is that it is a **live false
promise**, which is stronger than "additive".

**Real cost of V2:** the member exists, so no declaration churn — but per-method semantics are
undecided (what is `reverse().anchor`? `segment('edge').anchor` on a multi-subpath receiver?),
`anchor` does not compose (see P2's caveat), and the project's gates apply: `docs/` page
first, `generate:completions`, three-surface parity, and a test that presumably pins today's
throw.

**Fix A (conforming):** return a ProjectedPath from a projected receiver. Makes the
declarations true and removes six exceptions. Breaking for code doing `M x y; piece.draw()`,
which would then double-place.

**Fix B (declare the truth):** change the six declarations to `PathogenPathBlock`. Zero
runtime break, fixes completions and hover, leaves the inconsistency. ISSUE-025's option 1.

**These interact — see the decision below.** Fix B then Fix A is two rounds of declaration
churn, and Fix B legitimizes the behaviour Fix A must undo.

---

## The `subPath` decision (ISSUE-025)

The first draft gave three answers and picked none. One answer:

**Take Fix B now, and treat Fix A as closed.** Reasons: the `d`-level behaviour of `cut` and
the boolean ops — pieces sharing one frame so that drawing them all at one origin reassembles
the shape — is genuinely useful and is what 26 files rely on; Fix A would change it.
Declaring the truth costs nothing and removes six false promises today.

Under that decision, **V2 is the substantive half**: `subPath` keeps returning a PathBlock,
and gains a working `anchor` so the discarded position is recoverable. That is the answer to
ISSUE-025 — not a change of return type.

If Fix A is ever revisited, note that `anchor` on a projected result is trivially
`startPoint`, so V2's surface would become redundant there.

---

## V3 — Cursor-dependent placement is undiagnosable · P5b · **needs design, not code**

`dash`, `cut` and `.contours` inject a leading `m` even from a non-positioned receiver
(measured: `@{ h 100 }.dash(…)[2].d` = `m 30 0 l 20 0`). Drawn from a non-origin cursor they
shift silently.

The first draft said "the warning is free". It is not. `M 10 10; block.draw();` with a
positioned block is ordinary, correct relative drawing, so a warning keyed on "first command
is a move and the cursor is not the origin" fires on exactly the authored intent P1 protects.
A usable signal has to distinguish *injected* from *authored* positioning — which is design
work, and an argument for P1 (make the type say it) over a heuristic.

---

## V8 — `buildPathBlockFromCommands` has no enforced convention · P1 · **cheapest durable fix**

Omitting `origin` destroys the frame; passing `{x:0, y:0}` preserves it (`index.ts:1206`).
Every derived PathBlock is one of these two spellings, chosen by hand, and the misreading is
one character from a silent placement bug.

**Fix:** split into `fromCommandsRebased(cmds)` and `fromCommandsKeepingFrame(cmds)`.
Internal only, zero user-visible surface, mechanical. It does not fix any existing bug — it
stops the next method from picking wrong, which is how this matrix accumulated.

---

## V5 — `drawTo` anchors different things on the two receivers · P3 · **documentation-first**

PathBlock: the frame origin → `(x,y)`. ProjectedPath: the first inked point → `(x,y)`.
ProjectedText: `origin`. Three definitions across four `draw*` entry points. These coincide
only when the block is not positioned. `docs/path-blocks.md:95` states the ink version
unconditionally.

**Fix:** document the split. Changing `PathBlock.drawTo` would move any program relying on
frame anchoring with a positioned block.

---

## V6 — Default pivots differ by receiver · P3 · **low**

`rotate`/`scale`/`mirror` pivot on `(0,0)` for a PathBlock and on `startPoint` for a
ProjectedPath. Defensible, undocumented, surprising when a call moves between receivers.
**Fix:** document.

---

## V7 — Space conversions are silent · P4 · **medium, needs design**

A PathBlock appended to a `Marker` is read as marker-viewBox coordinates; a ProjectedPath
appended to the same keeps page numbers inside a `0 0 mw mh` viewBox and renders nothing. A
query on a transformed layer answers pre-transform (D2). Spaces 3–6 have no conversion.

**Fix:** P4's rejection message is the cheap half and can land alone. Writing the conversions
is the design task.

---

## V9 — Text is ungraded · P2 · **gap, not a finding**

No `cases.tsv` text receiver, no text row in the grading table — yet **D8 is a P2 violation**
(`ProjectedText.polarProject` stores a delta as `origin`). Either extend the matrix to text
receivers or state the exclusion. `03` now states it.

---

## Suggested order

1. ~~**V4 / D1 + ISSUE-015**~~ — **done 2026-09-24.** Repaired at both serialization
   boundaries, relative `m 0 0` for layers and an absolute first point for defs. One scope
   finding worth recording: the layer guard sits in `finalizeStore`, so it repairs *all* layer
   output, not only `draw()` — 22 unit tests asserted the unrepaired strings and were updated.
   No sample or snapshot moved.
2. **D3, D6** — one-line fixes to measured wrongness on declared APIs (`drawTo` dropping every
   label; `rotateAtVertexIndex` ignoring its index).
3. **The `subPath` decision**, then **V1 Fix B + V2** as one "make the declarations true" pass.
4. **V8** — two named constructors; stops the next drift.
5. **Documentation** — V5, V6, and `06`'s vocabulary collapse.
6. **V3, V7, V9** — the design tasks. Not before the rest.

The first draft put V2 first on the strength of "Cost: none". That was wrong, and with the
cost corrected the order inverts: **V4 goes first**, on severity.
