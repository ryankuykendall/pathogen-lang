# 2f code: review (2026-11-23)

One code-reviewer pass over the 2f build, before the commit: `preview.ts`, `preview-programs.ts`, `preview-drawings.ts`, `program-drawing.ts`, `programs-thread.ts`, `programs-worker.ts`, `webview-html.ts`, `src/ui/program-chip.ts`, `readProjectMain` and the CLI. No critical findings: 8 warnings, 4 suggestions. The reviewer found no problem in the drawing queue's generation and cancel logic, the thread's ref/unref, the message checks, the disposal, the chip's move, or `readProjectMain` (the CLI's messages and behaviour unchanged).

| # | Finding | Disposition |
|---|---|---|
| 1 | The page's `ready` could arrive before the first refresh had read the project; it then drew the file being edited (a module, say) for a moment, and started the drawings early | **Fixed:** nothing is sent until the first refresh has worked out what's shown, and that refresh sends it. Test: opened from a module's tab, the page's first update is the main |
| 2 | A press was credited to whichever tab was active when its queued refresh ran, not the tab pressed | **Fixed:** the refresh carries the pressed document; a press on a tab already left still chooses that tab's program in its own project. Test added |
| 3 | `samePathKey` spelled a deleted file by its resolved path but an existing one by its real path, so under a link (`/tmp`, a linked checkout) a deleted import never marked its rows out of date | **Fixed:** a file not on disk gets its nearest folder that is, by its real path, then the rest as given. Test: a file through a link, before and after it's deleted |
| 4 | One failed read forgot the choice for good: a save that replaces the file, or a checkout, sent the preview back to the main | **Fixed:** a missing choice shows the main but is kept for `MISSING_GRACE_MS` (2 s); back in time, it's shown again; gone longer, it's forgotten even if a file of that name returns. A renamed project folder now moves its choice too. Tests added |
| 5 | Too many disk reads per update: a path key per row and per imported file, on every keystroke | **Fixed:** keys are worked out once per list update; the dots aren't computed when they can't show; the queue reports a change only when a row starts spinning; the programs to draw are worked out when the list changes |
| 6 | Leaving a project didn't stop its draws | **Fixed:** the list going empty tells the queue, which forgets its rows |
| 7 | Every stopped draw ends the thread, so the next one loads the library and its fonts again | **Kept.** The playground's programs worker is stopped the same way. Worth revisiting if typing in a module that many programs import feels slow |
| 8 | `showPrograms` calls the chip's `close()` without checking the chip was registered | **No change:** without the pan-zoom bundle the page stops before it listens for any message ("Pan/zoom controller not loaded") |
| S1 | One helper for the shown key and `isShown` | Not taken: the two are four lines apart, and the panel test covers both |
| S2 | A library-level test that `{}` reads as `listed: false` | Already there: `tests/node-project-main.test.ts` pins `listed` for `{}`, a listed main, and a broken list |
| S3 | The `as unknown as` casts of the loaded library | Not taken: the extension's library types are its own on purpose (it can't import the library's) |
| S4 | A listed program that's missing or a module gets no row and no word | Flagged to you in note 66 ("Decided while building"): it follows the playground |
