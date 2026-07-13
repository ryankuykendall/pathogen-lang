# Blog synopsis (for review) — variableOffset post (post27)

**Working title:** *The Swelling Line: Variable Offsets, Ribbons, and Letterforms*

*(~255 words)*

Pathogen's `offset()` draws a uniform parallel curve — useful, but static. This
post introduces **`variableOffset`** and **`compoundVariableOffset`**, two new
PathBlock methods that let the offset distance *breathe*: swelling, pinching, and
tapering along a path, with per-stop control over how smoothly the curve flows.

We build the idea from the ground up. First, the mental model: the spine is a
**rail** that positions and aims points — its own shape vanishes, leaving a fresh
curve you sculpt with gradient-stop-like syntax. Next, the heart of the feature:
**`CurveContinuity`** (G0 / G1 / G2), which makes each join a sharp corner, a
kink-free bend, or a seamless curvature-continuous flow. We show all three on
identical points so the difference is unmistakable, then shape the endpoints with
`PolarVector` handles.

From open strokes we move to **`compoundVariableOffset`** — two profiles that close
into a filled, variable-width **ribbon**, finished with butt, round, elliptical, or
tapered end caps. Think calligraphy: a digital brush whose pressure varies as it
travels.

The finale brings it home. We convert the letters of **"Pathogen"** into PathBlocks
with `PathBlock.fromGlyph`, isolate a clean contour from each, and wrap every letter
in flowing compound-offset **auras** — an ornamental, illuminated wordmark with the
crisp glyphs riding on top.

**Audience:** Pathogen users and creative coders comfortable with PathBlocks who want
expressive, generative strokes and lettering. By the end, readers can trace
variable-width ribbons along any path — including their own type.

---

## Sample list (each an interactive `<mini-workspace>`)
1. `offset()` vs `variableOffset()` — the hook.
2. Straight-spine ramping wave — the rail model.
3. G0 / G1 / G2 on identical knots — the centerpiece.
4. Endpoint tangents (spine-derived / PolarVector / spine-relative).
5. `compoundVariableOffset` ribbon.
6. Cap gallery — butt / round / elliptical / tapered.
7. Glyph teaching beat — naive closed outline → `contours[0]` isolation.
8. Glyph simple offset — a single-letter calligraphic stroke.
9. **Finale** — "Pathogen" wordmark with per-glyph compound auras (Baumans).

## Finale aesthetic — under review
Four explorations saved in `spikes/`: `word-finale-pathogen` (Playfair, dark,
dramatic), `finale-baumans` (Baumans, dark, cohesive flowing auras), `finale-baumans-light`
(cream, editorial), `finale-baumans-calm` (tight restrained auras). Baumans's
single-contour letters give the smoothest auras. Direction TBD by user.
