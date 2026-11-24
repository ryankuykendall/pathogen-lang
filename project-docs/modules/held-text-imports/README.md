# Held: text imports and the string methods

2026-11-24. 3a's first drafts (note 72, note 73) imported `.txt` files as strings, and added string methods for reading them. Both are on hold:

> "In the initial round of work, I would like to limit the supported data file types to well known structured file formats such as JSON, CSV, TSV, YAML, and SVG. For some reason we have also added a generic .txt files with some plans for adding methods that would allow us to more easily parse those files. In order to do that adequately, we would need to support regular expressions and that is too out of scope for the initial round of work. So let's put a hold on .txt files for the time being until we have a better idea of what we want to support."

The drafts are kept here, as they were when the hold came, for when text is taken up again (with regular expressions, or a better idea of what to support):

- `data-import-v1-draft.md`: the whole first draft of `docs/data-import.md`, with its "Text" section (the `profile.txt` example and its reader), the `.txt` row of the file types, the text hover (`data/profile.txt · text, 6 lines`) and the not-UTF-8 message.
- `syntax-string-methods-draft.md`: the string methods drafted for `docs/syntax.md`: `.split(separator?)`, `.lines()`, `.trim()`, `.replace(find, replacement)`, `.startsWith(prefix)`, `.endsWith(suffix)` and `.toNumber()`.

What stayed in the docs: the correction that `.empty()` and `.includes()` return `true`/`false`, not `1`/`0`. That's how strings behave today, so it isn't part of the hold.

Note 74 has the rest of the answers, and the backlog has the entry ("Text imports and string methods").
