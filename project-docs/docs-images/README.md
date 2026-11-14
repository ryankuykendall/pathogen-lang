# Images in the docs (2026-11-14)

"Approved...Let's add the image support, and then move onto 2e." The docs had no images. Step 10's review of `docs/workspace-files.md` asked for one annotated screenshot (finding 17), which waits for 2e's final UI. This builds what that screenshot needs. How to use it is in `docs/CLAUDE.md`, "Images".

## What a page writes

```markdown
![What it shows](images/workspace-files.png "An optional caption")
```

- a PNG in `docs/images/`, alt text required, in a paragraph of its own;
- `workspace-files.dark.png` beside it is shown in the dark theme;
- anything else stops the build with a message that names the page, the image and what to change.

## What was built

| Part | Where |
|---|---|
| The rules, the `<figure>`, the copy step | `scripts/lib/doc-images.ts` |
| The build | `scripts/build-docs.ts`: the per-page renderer, one error listing every problem, the CSS on the static page, the copy to `website/docs-static/images/` (served at `/docs/images/`) |
| How it looks | `playground/utils/doc-image-css.ts`, shared by the static page and the workspace's docs panel |
| The theme switch | `--doc-image-light` / `--doc-image-dark` in `playground/styles/theme.css`. Custom properties cross the docs panel's shadow root; a `[data-theme]` selector can't |
| The link check | `scripts/check-links.ts` also checks every image: status, `image/*` type, and a decode to a real width (a path the site doesn't hold can come back as an HTML page with 200) |

`docs-view.ts` isn't styled: no route reaches it (the router says `/docs` is the static page).

## For your design review

The screenshots below show two test images: one with a dark version, one without. They're shown on the static docs page and in the docs panel.

| | Light | Dark |
|---|---|---|
| Static page | `static-light.png` | `static-dark.png` |
| Docs panel | `panel-light.png` | `panel-dark.png` |

The style follows the docs' code blocks:
- a 1 px border in the theme's border colour, and the theme's medium radius;
- full width up to the image's own width;
- the caption below, small, in the secondary text colour;
- no side margins (in the 420 px panel, a figure's default 40 px would take a fifth of the width).

All of it is open to change.

**Approved 2026-11-14:** "The image styling is approved." The workspace files page's screenshot uses this styling when it's taken with 2e's final UI.

## Checks

- **Every page renders as before.** I saved the three outputs before the change (`tmp/doc-images/snapshot.ts`). After it, all 29 pages are byte-identical in `docs-content.js` and `docs.md`. The static page differs only inside its `<style>` block.
- **Unit tests:** `tests/build-docs-images.test.ts` (22). They cover:
  - the figure, outside any `<p>`;
  - the dark pair;
  - escaping the alt text and the caption once;
  - the reference form;
  - every paragraph shape unchanged;
  - each refusal, with its exact message;
  - copying only what's used, after emptying the folder;
  - refusing to empty a folder that isn't `images`.
- **In a browser:** `verify-doc-images.ts` runs 89 checks. It covers the static page (this build's page, with `:3000`'s real headers) and the docs panel (as served), each in light, dark, and the system setting both ways. It found one bug: in the panel, an image was 2 px wider than its room. The panel's shadow root lacks the page's border-box reset, so the shared CSS now sets `box-sizing`.
- **End to end:** a real image on a published page (`docs/snapshots.md`, put back afterwards). The figure reached both outputs, and both files were copied byte for byte. A missing image stopped the build: `docs/snapshots.md: ![A probe image](images/missing-probe.png): docs/images/missing-probe.png doesn't exist`.
- **No CSP** covers `/docs` or the playground page (`:3000/docs` sends none; the only CSPs are on the preview iframe and API responses). So nothing blocks same-origin images.

## The code review

No critical findings.

**Applied:**
- **Clearer messages.** Two images on adjacent lines, or a linked image, used to get "not on a line of its own", which misleads. The message now says "a paragraph of its own, with a blank line before and after it", and a linked image gets its own message.
- **Tests** for the reference form, adjacent images and a linked image.
- **`listDocImages`** no longer needs `Dirent.parentPath` (Node 20.12 or later).
- **A guard:** `copyDocImages` refuses to empty a folder not named `images`.
- **docs/CLAUDE.md** now says that a page not in `DOC_FILES` has its images checked only once it's registered.

**Not changed:**
- **Relative paths in `docs.md`.** The review said they resolve to nothing. They resolve correctly: from `/docs/docs.md`, `images/x.png` is `/docs/images/x.png`, the same file.
- **check-links and the docs panel.** check-links doesn't look inside the docs panel's shadow root, but it checks the static docs page, whose images use the same URLs.
