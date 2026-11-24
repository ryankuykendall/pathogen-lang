# The string methods, as drafted for docs/syntax.md (held 2026-11-24)

These sections stood in `docs/syntax.md`'s Strings section, between `.empty()`/indexing and `.append(value)`, replacing today's `### .split()`. Today's `.split()` (no separator: an array of characters) is unchanged in the docs while this is held.

Checked against the running language when they were drafted: every example parsed, and the behaviour they describe was the proposal (note 72, question 3), not yet built.

---

### `.split(separator?)`

With a separator, splits the string at each place the separator appears. Without one, or with an empty one, splits it into its characters:

```
let fields = `a,b,,c`.split(`,`);  // ["a", "b", "", "c"]
let chars = `abc`.split();         // ["a", "b", "c"]
for (ch in chars) {
  log(ch);
}
```

Two separators side by side give an empty string between them, as `,,` does above. For text with runs of spaces, split on one space and drop the empty strings:

```
let words = `  oak   ash `.trim().split(` `).filter {|word| !word.empty() };  // ["oak", "ash"]
```

### `.lines()`

Splits the string at each line break (`\n`, `\r\n` or `\r`) into an array of lines, without the breaks. A line break at the very end doesn't add an empty line, and an empty string gives `[]`:

```
let planted = `oak\nash\nbirch\n`;
let trees = planted.lines();  // ["oak", "ash", "birch"]
```

It's the usual first step in reading an imported [text file](#data-import-text).

### `.trim()`

Returns the string without the spaces, tabs and line breaks at its start and end:

```
let cell = `  42 \t`;
log(cell.trim());  // "42"
```

### `.replace(find, replacement)`

Returns a new string with every occurrence of `find` replaced by `replacement`. `find` can't be empty:

```
let date = `2026-11-23`;
log(date.replace(`-`, `/`));  // "2026/11/23"
```

### `.startsWith(prefix)` and `.endsWith(suffix)`

Return `true` if the string starts with `prefix` (or ends with `suffix`), `false` otherwise:

```
let row = `# a comment`;
if (row.startsWith(`#`)) {
  // skip it
}
let isData = `cities.json`.endsWith(`.json`);  // true
```

### `.toNumber()`

Returns the number the string writes, or `null` if it doesn't write one. Spaces around it are allowed; a sign, a fraction and an exponent are read; anything else gives `null`, so you can test it:

```
log(`12`.toNumber());      // 12
log(` -3.5 `.toNumber());  // -3.5
log(`.5`.toNumber());      // 0.5
log(`1e3`.toNumber());     // 1000
log(`12px`.toNumber());    // null
log(``.toNumber());        // null

let field = `12px`;
let width = field.toNumber();
if (width == null) {
  log(`not a number: ${field}`);
}
```

Hexadecimal (`0x10`), `Infinity`, a comma for the decimal point (`1,5`) and a unit (`45deg`) all give `null`. For a number with a unit, take the unit off first, then give the number its unit: `"45deg".replace("deg", "").toNumber() * 1deg` is the angle 45deg.
