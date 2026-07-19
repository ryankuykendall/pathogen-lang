---
title: "Print-Ready PDF Export: From Playground to Poster"
slug: print-ready-pdf-export
date: 2026-07-18
description: "Export with Legend now produces print-ready PDFs — real page sizes, margins, bleed and crop marks, and text converted to vector outlines so your fonts survive any print shop."
---

There has always been a gap between finishing a piece in [Pathogen Studio](https://pathogen.studio/) and holding it in your hands. **Export with Legend** gave you a beautiful self-contained SVG — but the moment you wanted a poster, you were on your own: find a web SVG-to-PDF converter, upload your artwork, and hope. Too often the file that came back had quietly swapped your fonts for whatever the converter had lying around. The piece on the wall didn't match the piece on the screen.

As of today, that gap is closed. **Export with Legend can produce a print-ready PDF directly** — real physical page sizes, margins, bleed and crop marks, and one guarantee at the center of it all: the type that prints is exactly the type you designed.

## Text becomes paths

The reason converters mangle fonts is that SVG text is a *reference* — `font-family: 'Baumans'` only works if the machine rendering the file has Baumans, and a print shop's RIP almost never does. So instead of shipping references, the PDF export ships **shapes**. Before the PDF is generated, every piece of text — in your artwork and in the legend — is converted to vector outlines, glyph by glyph, using the same font data the playground renders with.

The result is a PDF with no font references at all. There is nothing to substitute, nothing to miss, nothing for the print counter's software to "helpfully" replace. Zoom to 6400% in any PDF viewer and your letterforms are curves, as crisp as the rest of the artwork, at any size from postcard to A0.

## Sized for the print counter

The PDF settings live right in the export dialog:

<img src="/blog/pdf-export-modal.png" alt="The Export with Legend dialog with PDF format selected, showing the Orbital Study artwork and the PDF settings: page size, units, artwork size with a linked aspect-ratio lock, margins, and a bleed + crop marks option" loading="lazy">

Pick **PDF — print-ready** as the format and choose how the page gets its size:

- **Match artwork — exact print size.** The default, and the mode poster printing wants. You type the printed size of the artwork itself — say, 24 inches wide — and the height follows automatically, locked to your `ViewBox`'s aspect ratio. The page is the artwork plus margins. No letterboxing, no surprises: the number you type is the size on the wall.
- **Standard pages.** US poster sizes (18 × 24, 24 × 36), Letter and Tabloid for proofs, and the ISO A-series from A4 up to A0, each with a portrait/landscape toggle. Artwork scales to fit the printable area, centered.
- **Custom page.** Any page size from 1 to 100 inches per side, with an aspect-ratio lock you can toggle off when the page shape and the artwork shape need to differ.

One **Units** selector — inches or centimeters — applies everywhere, and a live summary line tells you exactly what will happen before you download: *"Artwork 800 × 1000 units prints at 24 × 30 in — page 25 × 31 in with margins."*

## Bleed, crop marks, and the last half inch

If you have ever handed a file to a commercial printer, you have heard the question: *"Does it have bleed?"* Edge-to-edge posters are printed slightly oversized and trimmed down; the **bleed** is the extra margin of artwork that gets cut away, so no white sliver survives at the edge. The **crop marks** are the hairlines that tell the cutter where to trim.

The export handles both with a single checkbox. Your artwork's background extends to the bleed edge automatically, and corner crop marks land in a slug area outside the trim:

<img src="/blog/pdf-export-poster.png" alt="The Orbital Study PDF page: artwork extending to the bleed edge, crop marks at the corners, and the legend in the lower right" loading="lazy">

Up close, a corner shows the anatomy — the artwork running past the trim line into the bleed, and the crop hairlines sitting safely outside it:

<img src="/blog/pdf-export-cropmarks.png" alt="A zoomed corner of the PDF showing the crop mark hairlines outside the artwork's bleed area" loading="lazy">

The legend rides along, of course — with its footer now reading *Created in pathogen.studio*.

## What stays vector

Nearly everything. Paths, strokes, linear and radial gradients, patterns, and clip paths are written to the PDF as true vectors, and all text goes in as outlines. One honest trade-off comes with that: outlined text is no longer selectable or searchable in the PDF — shapes can't be copied as words. For a print file, that's the right trade; keep the SVG export if you want a version with live text.

An **Artwork** toggle picks vector or raster output for the artwork itself. Dense generative pieces — hundreds of thousands of path segments — make vector PDFs that print-shop software and PDF viewers chew on for minutes, so the export detects them and defaults to a print-resolution raster instead (the legend and all text stay vector). Two other constructs always fall back to a high-resolution raster: conic, mesh, and freeform gradients (which are rasterized in every Pathogen output), and artwork that uses [masks](/docs#masks-masks-and-clip-paths) or [filters](/docs#filters-filters), which is embedded as a 300 DPI image sized for your chosen page — the export dialog tells you when this happens, and the legend stays vector regardless.

## Try it

Here is a piece begging to be printed at 24 inches. Open any workspace, choose **Export with Legend** from the menu, switch the format to PDF, and type the size you want to hold:

<mini-workspace src="samples/post29/orbital-study.pathogen" caption="A poster-shaped study — concentric orbits with a measured, centered title set in Baumans. Export it at 24 inches wide and the title prints in exactly these letterforms." code-open></mini-workspace>

The full details — every page preset, how margins interact with each sizing mode, and the current limitations — are in the [exporting documentation](/docs#exporting-exporting-your-work). Print something.
