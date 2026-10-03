# Reviews — `translateStartPointTo` / `translateCenterPointTo` (2026-10-03)

## code-reviewer — approve, 3 warnings, 3 suggestions

| # | Finding | Disposition |
|---|---|---|
| W1 | The ProjectedPath `anchor` error text still said "only on variableOffset results … equals startPoint" | **Fixed** — names the two methods and what `anchor` is on their results |
| W2 | A ProjectedPath with nothing drawn (`@{ m 5 5 }.project(…)`) came back empty but with the receiver's start/end points and an `anchor`; the PathBlock receiver returned a bare empty block | **Fixed** — both return an empty value with no `anchor`; the projected one reports the destination as its start/end. Pinned by a test |
| W3 | Meta handling differs by receiver (`derivedMeta` on a PathBlock, raw copy via `projectCommands` on a ProjectedPath) | **No change** — matches every sibling transform on each receiver; labels survive on both (now tested on both) |
| T1 | Matrix had no ProjectedPath row with a leading move or a mid-list move | **Fixed** — two rows added |
| T2 | Labels and empty cases tested on PathBlock only | **Fixed** |
| T3 | The round-trip check compared only the first drawn point | **Fixed** — the restored and in-place results' full path data and start points are compared |
| T4 | NaN / Infinity arguments unpinned | **No change** — behaviour matches `scale` / `project` (the value reaches path data and the `non-finite` warning fires there); not specific to these methods |
| S1 | `inlay-hints.ts` has a hand-kept method → return-type list without these methods | **No change** — `scale` / `rotate` are not in it either; noted as a drift-prone list |
| S2 | `translationReference` takes `startPoint` for one method only | **No change** |

## content-reviewer (4 personas) — 2 must-fix, 2 should

| # | Finding | Disposition |
|---|---|---|
| 1 | The `anchor` section's one-line rule ("the first point of the result, in the receiver's coordinates") is false for these methods, and the methods were filed under "re-based to its own first point" | **Fixed** — the two methods are introduced as a separate case; the rule is stated per kind; "keep their placement" reworded to "leave the geometry where it was" in both places |
| 2 | "`translateStartPointTo(0, 0)` or `translateCenterPointTo(0, 0)` returns one that does [start at the pen]" — the centre method does not | **Fixed** |
| 3 | The leading-move behaviour was the last sentence of the section and said "the same way" with no referent | **Fixed** — moved under the two bullets, with the measured values (`(20, 10)` drawn centre vs `centerPoint()` `(15, 5)`) |
| 4 | "pen" undefined; "receiver" jargon; `drawTo(anchor)` shown with one argument; the cross-references pointed at the table or had no link | **Fixed** — "pen" defined at first use, "the path you called the method on", `drawTo(anchor.x, anchor.y)`, all three cross-references link the method heading |
