---
name: Compile BBWPs for blog samples
description: Always compile blog sample .pathogen files as BBWPs so user can preview at localhost:3001/website/bbwp/
type: feedback
---

When creating blog sample .pathogen files, always compile them as BBWPs (via compile-bbwp.ts) in addition to compiling the raw .svg for the blog pipeline. The user checks progress via the BBWP index at localhost:3001/website/bbwp/ and expects to see the latest samples there.

**Why:** The user assumed the blog sample pipeline and BBWP pipeline were the same. They weren't — blog samples only produce raw .svg files visible in the full blog site at localhost:3000. BBWPs are self-contained HTML pages viewable at localhost:3001.

**How to apply:** After compiling any blog sample to .svg via the CLI, also run `npx tsx scripts/compile-bbwp.ts <file>` to generate a BBWP. This ensures the user can always preview samples at the BBWP index without needing to run the full website.
