# Physical Units — Design Sketch (2026-08-30)

*Prompted by user question: where do units live — in the language file or at
export time — and what do ViewBox numbers mean in real-world terms? Expands
R1 in `general-language-requirements.md`.*

## Options considered

1. **Export-time binding only** — geometry unitless; export dialog maps
   viewBox→physical. Rejected as the primary model: the survey's flagship
   asks (0.25in seam allowance, mm fret tables, kerf values, drill specs)
   need units *written in source*, and shared modules (joints kit) cannot
   assume a caller's scale. Kept as the fallback for undeclared documents.
2. **Document-level unit binding + literal conversion** ← **recommended**
3. **Full unit-bearing runtime type** (UnitValue à la AngleValue) —
   deferred: AngleValue precedent shows the parity/formatter cost
   (toNumber chokepoint, annotated traps), plus the dimensional-analysis
   rabbit hole. Revisit only if unit-checked module APIs prove necessary.

## Recommended model (option 2)

- A document declaration — `define Units(mm)` (or unit-suffixed ViewBox
  dims) — binds **1 user-space unit = 1 declared unit**.
- Unit literals (`0.25in`, `6pt`, `3mm`) are **converted to the document
  unit at eval time**, like the existing percent suffix — numbers are plain
  by runtime, so **annotated-evaluator parity cost ≈ zero** (the decisive
  advantage over option 3).
- Suffixes MUST work inside `calc()` from day one (generalized from the
  cutting-room pi/deg-in-calc lesson).
- This mirrors SVG's own two-layer semantics: `viewBox` = user space,
  `width="300mm"` = physical binding. We adopt our output format's model.

## What ViewBox means to the user

With Units declared, `define ViewBox(0, 0, 300, 200)` **is the material**:
a 300×200 mm sheet, a 24×36 in pattern page. The readable `viewbox` struct
gains nothing new; the numbers simply carry the declared meaning. Without a
declaration: today's abstract canvas, fully backward compatible; export
dialog binding remains available.

## Export contract

- SVG: emit physical `width`/`height` + viewBox (the mapping is native SVG)
- PDF: dialog pre-fills true size from the declaration; user may still
  override (print at 50%)
- DXF: `$INSUNITS` from the declaration (what makes DXF "trustworthy" — see
  dxf-export-research.md)

## Extension for scale modeling (A14/A19)

`define Units(mm, scale: 1:87)` — author in prototype dimensions, geometry
resolves at model scale; regenerating at 1:160 is a one-token change. Rides
the same declaration; defer past v1 but keep the syntax slot in mind.

## Open design questions

- Do stroke widths / font sizes read as physical too? (Proposed: yes —
  they already scale through viewBox at export; declaring makes it honest.)
- Mixed-unit literals in one file: allowed (all convert), or lint-worthy?
- `ctx`/query outputs: report in document units (plain numbers, as today).

---

# v2 refinement (2026-08-30, later) — user input from live workspace experience

*Context: user is condensing a sprawling ViewBox on a Pathogen.Studio art
piece where all lengths derive from the primary font size, using
curried-style lambdas as relative units:*

```pathogen
let myFontSize = 32;
let fontRel = {|size| return size * myFontSize};
// font-size: fontRel(1);  stroke-width: fontRel(0.05); ...
```

## User's objections to body-level unit suffixes (v1 model)

1. **Mixed-unit calc() chaos**: suffixes in the body create the expectation
   that `calc(3.2mm * 1in + 2ft)` should mean something — dimensional-
   analysis complexity arriving through the back door, and a rich source of
   user error.
2. **Override/resize semantics**: scattered suffixes make CLI/export unit
   overrides ambiguous (do literals re-convert?). A single declaration
   point makes `--units`-style remapping trivial.

## User's proposal — declaration-only units with derived units

```pathogen
define ViewBox(0, 0, 2000, 1000) in Units(Unit.mm);
// plywood sheet in tenths of an inch:
define ViewBox(0, 0, 960, 480) in Units(Unit.inch * 0.1);
```

- Units appear in **exactly one place**; the body stays bare numbers.
- `Unit.*` as enum-like values with expression arithmetic for derived
  units. **No `calc()` wrapper needed**: calc() exists for lenient
  style-block value parsing (AST-builder style parser); a `define` argument
  position is already a native expression context.
- Derived units quietly subsume the scale-model extension:
  `Units(Unit.mm * (1/87))` ≈ the v1 `scale: 1:87` idea, with no extra
  syntax.

## Revised recommendation (supersedes v1's literal-suffix mechanism)

- **Declaration-only physical units** (user's syntax direction), body
  numbers stay plain — zero annotated-parity cost preserved, dimensional
  arithmetic never arises.
- For in-body physical values (0.25in seam allowance, fret tables):
  **conversion functions, not suffixes** — `inch(0.25)` → document units.
  Plain stdlib; explicit; composes with overrides; same idiom as the
  user's fontRel lambda.
- **Relative-unit (em) pattern**: the fontRel lambda is CSS's `em`
  reinvented as a function — document it as the recommended pattern now;
  consider `define Em(expr)` sugar later. The units design must not
  preclude relative-unit systems; physical units are one binding among
  possible ones.
- Status: captured for future design work, **not scheduled** — revisit
  when R1 is taken up in earnest.
