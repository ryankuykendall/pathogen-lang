# Wedge Analysis — Features Ranked by Domains Unlocked (Stage 4, 2026-08-30)

Per the survey's method decision: rank *features by domains unlocked*, not
just domains by score. "Touched" = named in a profile; "gated" = the domain
cannot start without it. Sizes from `general-language-requirements.md`.

## The ranking

| Rank | Feature | Touched | Gated | Size | Leverage note |
|------|---------|---------|-------|------|---------------|
| 1 | Modules (R2) | ~26 | 3 | L | Also the delivery vehicle for every shared kit — multiplies all later work |
| 2 | Physical units (R1) | ~22 | 0 | L | Zero hard gates but the trust prerequisite for all physical output |
| 3 | Multi-view export (R3) | ~18 | 5 | M | Best reach-per-cost on the board |
| 4 | Data import (R4) | ~18 | 5 | M | Phase 1 (CSV/JSON) alone unlocks E1/C6/B4-adjacent work |
| 5 | Machine-format export (R5) | ~12 | 2–3 | M | One biarc lowering pass → three formats |
| 6 | CLI batch (R7) | ~12 | 0 | S–M | The seller-economy story; cheap because it rides R3 |
| 7 | Number+date formatting (R8) | ~11+4 | 1 | S | Date arithmetic alone unlocks planners E2 (288) |
| 8 | Robust offset() (R6) | ~9 | 2* | M–L | *Quilting + die-cutting call current behavior disqualifying — a blocker, not a gap |
| 9 | Sheet nesting (R9) | ~8 | 0 | M | Simple version suffices |
| 10 | Parameter sliders (R10) | ~8 | 1 | M | Playground-only; the STEM/live-demo story |
| 11 | Testing (R12) | ~5 | 0 | M | Credibility with code-native tiers |
| 12 | HTTP (R11) | 3 | 1 | M | Narrow but two flagship narratives (e-ink, data art) |

## The three wedges, confirmed and revised

Stage 1 predicted physical units + robust offset + machine export as the
wedges. The full survey **confirms units and offset** and **revises the
third**: multi-view export outreaches machine export 18 to 12 and gates
more domains. Machine export stays top-five because its gates are absolute
where they bind (a router cannot eat SVG).

The genuine surprise is **modules at #1** — not on the Stage 1 wedge list
because it was assumed as background. The matrix shows it is the delivery
mechanism for ~10 shared kits (joints, checks, chart kits, palettes…),
meaning every kit built before modules exist gets built into the core and
calcifies. **Modules should precede kit-building.**

## Sequencing recommendation (phases, not dates)

- **Phase 0 — now, no prerequisites:** the offset() fix (blocker, engine
  work, independent of everything) + immediate content from zero-gap
  domains (sashiko, guilloche, mandala, weaving drawdowns, kirigami
  basics) — the blog pipeline starts before any feature lands.
- **Phase A — foundations:** modules (R2), physical units (R1). Long
  poles; everything downstream composes with them.
- **Phase B — output side:** multi-view export (R3) + CLI batch (R7)
  as one design; DXF (R5) behind the js-dxf/ezdxf audit; number/date
  formatting (R8) opportunistically (small).
- **Phase C — input side:** data import (R4) phase 1→2→3; then HTTP (R11).
- **Phase D — amplifiers:** nesting (R9), sliders (R10), testing (R12),
  and the shared kits as *library releases* proving R2.

## Feature → top-tier domain coverage check

The eight ≥400 domains (see RECOMMENDATIONS) collectively need: units,
modules, offset, multi-view, DXF-lite, data import P1, nesting-lite. Phases
A+B cover six of eight fully; the two data-gated ones (fantasy maps need
nothing! coloring needs only R3) — in fact **seven of eight top-tier
domains are served by Phase A+B alone.** That is the wedge thesis holding.
