# 06 — Vocabulary

The docs use **five** names for the global frame, **eleven** for the local one, and define
**none** of them. Two terms mean opposite things in the same file. This is the list to
collapse before any of it goes user-facing.

## One name, two opposite meanings

**"normalized to `(0,0)` origin"**

| Meaning | Where |
|---|---|
| position **discarded**, re-based to its own first point | `path-blocks.md:620` (`subPath`), `:539`, `textblock.md:203`, `variable-offset.md:154` |
| position **preserved**, the whole set shares the subject's frame | `path-blocks.md:1105` (`cut`), `:1154` (`dash`), `:1223` (`outline`) |

`:1105` manages both in one sentence: *"Pieces keep their original placement inside the
subject (like the set operations, results are normalized to a `(0, 0)` origin)."*

## One name, five meanings

**"anchor"** — a `Point` property holding a removed translation (`variable-offset.md`); the
`drawTo` contract, as a verb (`path-blocks.md:86`); a **method** on `ProjectedText` returning
a bbox point (`textblock.md:85`); the `BBoxAnchor`/`VerticalAnchor` enums (`syntax.md:584`);
and CSS `text-anchor` (`layers.md:407`).

## Five names for the global frame

page coordinates · absolute coordinates · canvas space · user space · absolute space

## Eleven for the local one

the block's origin · the block origin `(0,0)` · relative to origin `(0,0)` · its own
coordinate frame · block-local coordinates · subject-local placement · the spine's coordinate
space · glyph-space / glyph origin · frame origin · local origin `(0,0)` · halo-space

## Same idea, two vocabularies

| "has no position" | "has a position" |
|---|---|
| free-floating · normalized · re-based · re-origined · relative, portable | anchored · registered · keeps its placement · in place · re-registered |

Ten terms, two concepts, no cross-references.

## `startPoint` and `endPoint` are defined on different principles

`startPoint` is an **ink** concept with a stated invariant (`get(0) == startPoint`).
`endPoint` is a **pen** concept — "final cursor position" — with no invariant, and no page
states any `get(1)` relationship. Yet the ink/pen distinction is the load-bearing difference
between `draw()` and `drawTo()`.

## Proposed collapse

| Concept | Use | Retire |
|---|---|---|
| the global frame | **page coordinates** | absolute/canvas/user/absolute space |
| a value's own frame | **local coordinates** | the other ten |
| has a position | **placed** | anchored, registered, in place |
| has no position | **free-floating** | normalized, re-based, re-origined |
| the act of discarding position | **re-basing** | normalizing |
| the removed translation | **`anchor`** (the property only) | the verb sense — use "placing" |
| seating ink at a target | **placing** | anchoring |

Then define "page coordinates" and "local coordinates" once, in one place, and link every
other page to it. `01-spaces.md` is the draft of that place.
