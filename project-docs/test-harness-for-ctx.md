3. 
=====

Are we setting users up to be surprised/disappointed by allowing them to use reactive color with their gradients that rely on OffscreenCanvas and/or WebGPU? Should we be displaying a warning that that functionality will not be available it the user exports the SVG (e.g., the SVG cannot recompile.)

4. 
=====

Unit tests for all path drawing methods that could be potentially called in a Path Block to ensure that they can all draw in relative space (or that they are assumed to draw in relative space.)

=====

 Analysis of Canvas vs OffscreenCanvas: The current rendering pipeline is:

 1. Editor keystroke → 150ms debounce → updatePreview() (async)
 2. await compilerWorker.compileWithContext() — worker thread
 3. isStale(compilationId) check — discard if newer compilation started
 4. setLayersWithTiming() — synchronous DOM + Canvas rendering
 
 The concurrency control today is the compilationId + isStale() pattern (workspace-view.js:551-559). This already handles compilation races, but only because step 4 is synchronous — between the staleness check and the DOM update, no other code runs. If step 4 became async (e.g., await canvas.convertToBlob()), a second compilation could sneak in between the staleness check and the DOM write.

 Would RxJS help? RxJS's switchMap would elegantly solve this: each keystroke emits into a Subject, debounceTime(150) replaces the manual setTimeout, and switchMap auto-cancels the previous compilation+render when a new one starts. This would let setLayersWithTiming become async (for OffscreenCanvas) without race conditions — switchMap guarantees only the latest emission's inner observable runs to completion.

 However, adding RxJS is a significant architectural decision (new dependency, different mental model for the entire compilation pipeline, migration of the store subscription + debounce + compilation flow). For this cleanup sprint, the right call is to document the current approach, remove the hack, and defer the RxJS/OffscreenCanvas migration to a future architecture ticket. The current synchronous Canvas is performant (<1ms) and correct.

 Should this go hand in hand with conversion to Typescript?

 _____ Another reason to move to RxJS _____

   Bug 1 — WebGPU "adapter is consumed" race condition (webgpu-device.js):                                                                                                                                         
  - workspace-view.js calls renderConicGradients(), renderFreeformGradients(), and renderMeshGradients() in parallel via Promise.all()                                                                            
  - Each calls its pipeline's getDevice(), but since the first call hasn't resolved yet, gpuDevice is still null                                                                                                  
  - Second/third calls try requestDevice() on the already-consumed adapter → error                                                                                                                                
  - Fix: Added _devicePromise deduplication — concurrent callers await the same in-flight promise instead of each trying to create their own device                                                               

===== File a bug for the Chromium team? =====

Based on the debugging summary, the core issue is clear: SVG <pattern><image> doesn't render in Chrome's Shadow DOM, but direct <image> elements do. The conic gradient pipeline works because it uses an inline Canvas 2D fallback in svg-preview-pane.js, not the <pattern><image> approach.

===== JSON for Claude? =====

No JSON output mode. Let me test the flattener directly to verify the adaptive code works:

===== Absolute paths on PathBlocks from stdlib functions =====

This was supposed to be fixed before (the naive solution, which was just run '.toLowerCase()', clearly does not work!)

So the fix is: use relative path commands (m, c, z) instead of stdlib functions (moveTo, cubic) in PathBlocks, since those stdlib functions emit absolute commands which get mangled during projection. Let me rewrite the organic samples.
   
===== We should address this =====

let x = PathLayer('x') ${ 
  stroke-dasharray: 3 3; 
};

Ah, the issue is define PathLayer(...) vs let x = PathLayer(...). The define syntax doesn't support stroke-dasharray with spaces. Let me use let syntax instead. Let me fix all the sample files:               

===== let / reassignment bug to fix =====

<quote>
The more likely issue is the variable reassignment bug. In Pathogen, you need let cursor = calc(cursor + g.advanceWidth); to reassign, not cursor = calc(...). If the code uses bare assignment without let, it would fail to parse or silently not update, leaving cursor at 0 for every iteration — which would stack all glyphs at the same x position.

This was the exact bug we hit and fixed in glyph-layout.pathogen earlier (line 60 needed let added to the reassignment).
</quote>

This seem like something we need to address soon! cursor = calc(cursor + g.advanceWidth) should work as expected!

===== Calc in for range =====
The for range doesn't support calc() inline. Let me use a let variable.

  for (i in calc(5 - 2)) {...} //-- Does not work

===== Bug to Fix =====

The GPU rendering is failing because the playground TS migration broke the CLI's embedded server (it serves .ts files but imports reference .js). Let me try the non-GPU path first.

===== Update to homepage box-shadow =====

0 8px 8px 4px rgba(155, 93, 229, 0.075)

===== Post Blog Post Wisdom on Pathogen Language =====

After authoring a blog post such as our data visualization post on Radial Hierarchical Bar Charts, what can we learn and reflect on that would help us make PL more ergonomic and expressive to use? Since there was a good deal of data, could it be more expressive Array methods like find, any, all, etc.?

===== Another reason to do native radial wedges =====

Found the issue. When the fillet radius exceeds the arc length of a small edge,splitCommandAtParametricT returns a degenerate command with empty args. Let me fix the fillet to skip corners where the trim would consume the entire edge:

===== XOR bug with arcs =====

The investigation and documentation are saved at project-docs/radial-bar-chart/xor-arc-tangent-bug.md

===== Font measuremet bug =====

Let's follow-up on this as a feature project-docs/radial-bar-chart/text-highlight-measurement-bug.md

4 project-docs (feature summary, wedge diagnostics, XOR bug, text highlight bug)

===== Code Formatting Questionnaire =====

Follow-up on this:

Yes, that's a great idea — and it's actually a better approach than me asking abstract questions like "do you prefer 2 or 4 spaces?" in isolation.

Here's how I'd structure it:

Step 1: I review the docs and existing codebase samples to identify every formatting decision point — there are more than you'd think in Pathogen because of the mix of path commands, style blocks, control  
flow, and expression contexts.                               
                                      
Step 2: I produce a questionnaire document (saved to project-docs/developer-experience/) with ~15-25 code snippets, each showing a specific formatting scenario in a "raw/messy" form. Categories would
include things like:

- Indentation: nested blocks, chained control flow, style blocks
- Path command spacing: M 10 20 vs M10 20, arguments on one line vs split
- Semicolons: always, never, or statement-type-dependent
- Style blocks: ${ stroke: red; fill: none; } single-line vs multi-line, property alignment
- Operator spacing: calc(x + 10) vs calc(x+10), ternaries
- Trailing commas: arrays, function args, object literals
- Blank lines: between top-level declarations, inside loops, before/after layer definitions
- Long lines: wrapping strategy for function calls with many args, long path command sequences
- Block braces: same-line vs next-line for for, fn, if
- Template literals: formatting inside interpolation ${expr}

Step 3: You reformat each snippet the way you want it to look, and add commentary explaining why — "I want breathing room here" or "these should be compact because they're always read together."

That gives me both the formatter spec and the golden-file test fixtures in one pass. We'd end up with a document like project-docs/developer-experience/formatter-style-guide-v1.md that becomes the
authoritative reference when Phase 27 arrives.

This is worth doing well before Phase 27 since the style decisions also inform the TextMate grammar (Phase 6-7) and snippets (Phase 8) — those should emit code in the canonical style.

===== Documenting our processes =====

/btw How are we planning on documenting what needs to get updated with our language service when new features are added to the Pathogen Language?

Great question — the plan doesn't currently address this, and it's an important gap.

Right now the compiler lifecycle in src/CLAUDE.md defines the sequence: docs first → failing tests → implement → visual verify → full test suite. But there's no step that says "update language-services" when you add a new keyword, stdlib function, or syntax construct.

Here's what I'd recommend:

Add a language-services checklist to the compiler lifecycle

When a new feature touches any of these, the corresponding language-services module needs updating:

┌───────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┐
│         What changed          │                                   Language-services to update                                   │
├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ New keyword or reserved word  │ completion-data.ts (completions), hover-data.ts (hover docs), TextMate grammar, snippets        │
├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ New stdlib function           │ completion-data.ts (signature + info), hover-data.ts, snippet if it's a common pattern          │
├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ New built-in type/constructor │ type-inference.ts (member completions), completion-data.ts                                      │
├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ New method on existing type   │ type-inference.ts, completion-data.ts                                                           │
├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ New syntax construct          │ TextMate grammar, scope-analysis.ts (if it introduces scope), symbols.ts (if it's a definition) │
├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ New operator                  │ TextMate grammar                                                                                │
├───────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ New style property            │ Style block completions data                                                                    │
└───────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┘

Where to document this

The natural place is src/CLAUDE.md in the "Key Files for Common Tasks" table — add a row like:

▎ | Add language feature | src/language-services/completion-data.ts, hover-data.ts, type-inference.ts, TextMate grammar |

And update the "Development Lifecycle" to include a step between "implement" and "visual verify":

▎ 3.5. Update language-services — If the feature adds keywords, functions, types, or syntax, update the corresponding language-services modules. Run tests/language-services/ to verify.

The deeper issue: data-driven vs. code-derived

Right now the playground's 994-line codemirror-setup.ts has hardcoded completion lists that go stale when new stdlib functions are added. The ideal long-term solution is to derive completion data
programmatically from the stdlib exports and parser keyword list — so adding a function to stdlib/math.ts automatically makes it appear in completions. We're not there yet (that's more of a Phase 12-14
design decision), but it's worth keeping in mind as we build completion-data.ts: structure the data so it could eventually be auto-generated from source.

I'll add this to the roadmap artifact when we're back to implementation.
