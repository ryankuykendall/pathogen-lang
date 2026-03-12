# PathBlock Blog Series — Round Table Review

Date: 2026-03-11

Three personas reviewed all 4 blog posts, then cross-critiqued each other's assessments.

## Personas
- **UXD**: Principal UX Designer (design tool company)
- **UXE**: Principal UX Engineer (developer tools background)
- **PM**: Sr. Staff Product Manager (developer tools)

---

## Phase 1: Initial Assessments

### UXD Assessment

#### Post 1: Introduction to PathBlocks
**Strengths:** Excellent progressive disclosure. Anatomy diagram with color-coded legend anchors mental model. Dual-pattern approach (manual vs drawTo) directly addresses learner mental model. Radial leaf pattern emotionally compelling.
**Weaknesses:** Grid backgrounds add visual noise. Code placement in diagrams disconnected. `.vertices` callout missing teaching moment about relative vs absolute. No "try editing" affordance.

#### Post 2: Parametric Sampling
**Strengths:** Arc-length parameterization explanation rigorous without being pedantic. Anatomy diagram exceptional. Practical fence example brilliant.
**Weaknesses:** First `<mini-workspace>` doesn't appear until 40% through post. Curve Support section reads like reference docs wedged into narrative. Fence demo lacks visual variation. Missing cos/sin intermediate step.

#### Post 3: Fillets and Chamfers
**Strengths:** Anatomy diagrams superb. Three subsections per operation. Edge cases section refreshingly honest.
**Weaknesses:** Six API variants pushes information density past comfort threshold. Gallery lacks "when to use each" design guidance. Curve-junction limitation buried. No chamfer vs fillet guidance.

#### Post 4: Boolean Operations
**Strengths:** Four-quadrant comparison layout masterclass in information design. Chaining example pays off composability thread. Curve preservation well-explained.
**Weaknesses:** "How It Works" is implementation detail most readers won't need (~1/3 of post). Only 2 interactive demos (fewest in series). Stdlib example (plate with hole) deserves its own demo. Series recap is missed opportunity.

---

### UXE Assessment

#### Post 1: Introduction to PathBlocks
**Strengths:** Mental model clear with @{ } syntax. Excellent anatomy diagram. Progressive examples build well. Code samples short and runnable. Clear doc links.
**Weaknesses:** "Relative offsets from implicit (0,0)" needs diagram before explanation. No warning about closed vs open PathBlocks early. Missing "common pitfalls." Grid example too basic. No performance implications.

#### Post 2: Parametric Sampling
**Strengths:** Arc-length distinction correctly explained. partition() introduced idiomatically. Fence demo production-quality. Curve support correctly documented.
**Weaknesses:** Leap from .get(t) to partition(8) too sudden. No arc-length vs raw Bézier comparison demo. Missing guidance on choosing n. Fence demo too SVG-intricate before simpler example. Open vs closed path sampling not mentioned.

#### Post 3: Fillets and Chamfers
**Strengths:** Clean presentation order. Anatomy diagrams excellent. Realistic edge cases. Chaining pattern shown. Per-vertex ops demonstrate selective treatment.
**Weaknesses:** Elliptical fillet section lacks motivation. Line-line limitation buried. Gallery doesn't show extreme angles. No performance note. Missing acute angle behavior.

#### Post 4: Boolean Operations
**Strengths:** Four operations consistent pattern. Implementation at right depth. Curve preservation highlighted. Chaining ties series together. Classification table.
**Weaknesses:** No error example for closed-path requirement. No visual of multi-component XOR. .project() easy to forget. Performance unaddressed. Winding number unexplained.

---

### PM Assessment

#### Post 1: Introduction to PathBlocks
**Strengths:** Clear value prop from workflow pain point. Anatomy-first pedagogy. Natural progression. First-class value positioning. Compelling radial pattern.
**Weaknesses:** Missing workflow context. No comparison to alternatives. Undefined audience. Properties section incomplete (no demo). CLI/playground gap.

#### Post 2: Parametric Sampling
**Strengths:** Arc-length normalization well explained. Anatomy excellent. Fence is a real job. partition() as workhorse. Curve support clearly scoped.
**Weaknesses:** Underexplains perpendicular use case. No performance context. Isolation from Post 1. .project() nuance glossed over. No failure modes.

#### Post 3: Fillets and Chamfers
**Strengths:** Geometric clarity. Three operations give real choice. Edge cases handled. Chaining ties back. CSS border-radius comparison.
**Weaknesses:** Line-line limitation huge and glossed over. No practical design use case beyond CSS. Rotation parameter unexplained. Per-vertex API clunky. No curve type detection warning.

#### Post 4: Boolean Operations
**Strengths:** Algorithm at right level. Curve preservation as differentiator. Four operations clear. Chaining ties series. Classification table.
**Weaknesses:** No scope limitations warned. No use case narrative. .project() requirement subtle. No performance caveat. String representation not shown.

---

## Phase 2: Cross-Critiques

### UXD critiquing UXE
**Where right:** The .get(t)-to-partition(8) pacing concern is valid. Closed-vs-open PathBlocks distinction deserved earlier treatment.
**Where missed mark:** "No performance implications" overweighted for a tutorial series. Series "lacks interactivity" is wrong — mini-workspaces ARE interactive. Fence demo order assessed incorrectly (simpler demo precedes it).
**Caught that I missed:** Acute angle fillet behavior is a real gap.

### UXD critiquing PM
**Where right:** "Unmotivated" critique strongest point. Audience genuinely undefined. .project() requirement is subtle.
**Where missed mark:** "Line-line only glossed over" overstates — Post 3 states it explicitly. "Per-vertex API clunky" is subjective. "No competitive comparison" misplaced for a language-documentation blog.
**Caught that I missed:** Posts don't build on each other's examples (Post 2 defines fresh variables vs reusing Post 1's arrow). Value proposition asserted but not demonstrated comparatively.

### UXE critiquing UXD
**Where right:** Grid background critique is actionable. Code placement disconnected observation spot-on. Four-quadrant boolean layout praise well-earned.
**Where missed mark:** `.vertices` teaching moment is a phantom issue — the anatomy diagram already teaches relative coords. "No try editing" misses that "Open in Playground" link exists on every mini-workspace.
**Caught that I missed:** partition() properties table is clinical when every other concept gets a visual demo.

### UXE critiquing PM
**Where right:** "Unmotivated" diagnosis is most important structural observation. Posts read as "here's what it does" not "here's a problem you have." Line-line limitation gets only one sentence.
**Where missed mark:** "No comparison to alternatives" and "undefined audience" are product marketing concerns, not blog concerns. .project() gets a dedicated section in Post 1 and is used consistently throughout.
**Caught that I missed:** Per-vertex API requires knowing vertex index from .vertices but post never shows how to discover the right index.

### PM critiquing UXD
**Where right:** Grid background observation is sharpest call. Code placement disconnected is accurate. "No try editing" confirmed — CodeMirror is read-only.
**Where missed mark:** `.vertices` relative-vs-absolute concern overweighted — post addresses it. Grid example "too basic" misreads purpose. Front-loading limitations before capabilities is poor pedagogy.
**Caught that I missed:** Chamfer vs fillet design guidance gap is genuine. "Reads as educational reference rather than hands-on exploration" is key product insight.

### PM critiquing UXE
**Where right:** .get(t)-to-partition(8) leap is dead-on. No error example for closed-path requirement is legitimate. .project() being easy to forget is accurate.
**Where missed mark:** "No performance implications" overweighted for blog content. "No interactive demo" ignores platform constraint (mini-workspace is display-only by design). "Winding number unexplained" — target audience already writes SVG paths.
**Caught that I missed:** Open vs closed path sampling gap in Post 2. Three-stage chaining pipeline in Post 4 already renders all three stages (UXE may not have closely examined the demo).

---

## Consensus Actions (incorporated into final versions)

1. **Post 1:** Audience framing added to opening. `.project()` section expanded with explanation. Playground CTA added. Stdlib function signatures fixed.
2. **Post 2:** Opening links back to Post 1. Bridging example added between .get(t) and partition(n). Curve Support section condensed from bullet list to paragraph.
3. **Post 3:** Chamfer-vs-fillet design guidance added to introduction. Line-line scope note moved up to before first fillet example. Elliptical fillet motivation strengthened with CSS border-radius analogy. Forward reference to boolean ops softened.
4. **Post 4:** "How It Works" trimmed (table kept, verbose steps condensed). Stdlib example promoted to mini-workspace with new sample. Series recap replaced with capstone example showing full pipeline. Playground CTA added.
