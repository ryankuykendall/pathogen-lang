# Exporting Your Work

Pathogen Studio can export any workspace as a self-contained image with an embedded **legend** — a caption card carrying the title, creator, date, description, and the Pathogen source that produced the artwork. Exports come in two formats: **SVG** for the web and further editing, and **PDF** for print — including poster-size prints handled by a third-party print shop.

## Export with Legend

1. Open the workspace you want to export.
2. From the overflow menu (`⋮`), choose **Export with Legend**.
3. Fill in the legend fields — name, description, export date, and creator. The **SVGX Code** block is included automatically.
4. Drag the legend card anywhere over the artwork; drag its corner handle to resize. Enable **Snap** in the bottom bar for grid-aligned placement.
5. Choose a format — **SVG** or **PDF** — and press **Download**.

Under **Advanced Export Settings** you can include the workspace grid in the export and set its color.

The legend footer reads *Created in pathogen.studio*.

## SVG export

The SVG export is fully self-contained: the legend's fonts are embedded directly in the file as data URIs, so the file renders identically offline, in any browser, with no font substitution. Use SVG when you want to keep the export editable, embed it in a web page, or re-import it into design tools.

## PDF export (print-ready)

The PDF export is built for handing off to a print shop. It solves the problem that generic SVG-to-PDF converters routinely mangle: **font fidelity**. Before the PDF is generated, every piece of text — in your artwork and in the legend — is converted to vector outlines. The PDF contains no font references at all, so there is nothing for a print shop's software to substitute. What you see in the editor is what comes off the press, at any size.

### Page sizing

Three ways to size the page, selected from **Page size**:

- **Match artwork — exact print size.** You enter the printed size of the *artwork itself*; the aspect ratio is locked to your `ViewBox`, so editing width recomputes height and vice versa. The page is the artwork plus your margins — the artwork prints at exactly the size you typed, with no letterboxing. This is the mode to use when you know how large the piece should be on the wall.
- **Presets.** US sizes (18 × 24 in and 24 × 36 in posters, Letter, Tabloid) and ISO A-series (A4 through A0), with a portrait/landscape toggle. The artwork scales to fit the printable area (page minus margins), centered.
- **Custom page.** Enter any page width and height (1–100 inches per side). A chain-link toggle locks the page to your artwork's aspect ratio; unlock it for a free page shape, and the artwork scales to fit, centered.

A single **Units** selector (inches or centimeters) applies to every dimension — sizes and margins — and each input shows its unit beside the value. A live summary line beneath the size controls spells out exactly what will print: the artwork's printed dimensions and the resulting page size.

### Margins, bleed, and crop marks

- **Margins** inset the printable area on all four sides (default 0.5 in). In Match-artwork mode they extend the page outward instead, so the artwork size you entered is preserved.
- **Bleed + crop marks** adds a 0.125 in / 3 mm bleed around the trimmed page and corner crop marks outside it — the setup commercial printers ask for on edge-to-edge posters. The bleed convention follows your Units selection: 0.125 in when working in inches, 3 mm when working in centimeters. The artwork background color extends to the bleed edge, so there are no white slivers after trimming.

If you're unsure whether your print shop wants bleed, leave the option on for posters and off for framed prints with a border.

### Vector or raster artwork

The **Artwork** setting chooses how your artwork is written into the PDF:

- **Vector** — exact path geometry, crisp at any print size. The default for most artwork.
- **Raster** — the artwork is embedded as a print-resolution image (300 DPI, sized for your page). Text outlines and the legend stay vector either way.

Very complex artwork — hundreds of thousands of path segments, as dense generative patterns can produce — makes technically valid vector PDFs that Preview, Acrobat, and print-shop software render for minutes or show as blank. The export detects this and defaults such artwork to **Raster**, which previews instantly and prints reliably; you can always switch back to Vector.

### What stays vector

Paths, strokes, linear and radial gradients, patterns, clip paths, and all text (as outlines) are written to the PDF as true vectors — they stay crisp at any print size. Two constructs always fall back to a high-resolution raster:

- Conic, mesh, and freeform gradients are rasterized (as they are in every Pathogen output).
- If your artwork uses **masks or filters**, the artwork layer is embedded as a 300 DPI image sized for your chosen page; the legend remains vector. A notice appears in the export dialog when this happens.

### Known limitations

- Text outlining fetches font glyph data from Google Fonts, using the Latin subset. Text in non-Latin scripts may be missing glyphs in the outlined output.
- Outlined text is no longer selectable or searchable in the PDF — a deliberate trade for guaranteed print fidelity.
