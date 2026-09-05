/**
 * Source patches applied to vendored bundles after esbuild writes them.
 *
 * Each patch is anchored on an exact substring and must apply exactly once,
 * so a dependency upgrade that moves or fixes the code fails the build loudly
 * instead of silently shipping the unpatched behaviour.
 */

/**
 * svg2pdf.js (2.7.x) parses `<image href="data:...">` with
 *
 *   /^\s*data:(([^/,;]+\/[^/,;]+)(?:;([^,;=]+=[^,;=]+))?)?(?:;(base64))?,((?:.|\s)*)$/i
 *
 * The payload group `((?:.|\s)*)` is an alternation inside a repetition: V8's
 * backtracking engine pushes one frame per character, so a rasterized
 * gradient (a 4000×4000 conic fill is a ~41 MB data URI) throws
 * `RangeError: Maximum call stack size exceeded` from `String.match` before
 * the image is even decoded (field report, 2026-09-05, vector-mode PDF
 * export). `[\s\S]*` matches exactly the same strings with a plain character
 * class loop and no per-character backtracking.
 */
export const SVG2PDF_DATA_URI_PAYLOAD_GROUP = '(?:;(base64))?,((?:.|\\s)*)$/i';
export const SVG2PDF_DATA_URI_PAYLOAD_GROUP_PATCHED = '(?:;(base64))?,([\\s\\S]*)$/i';

export function patchSvg2pdfDataUriRegex(source: string): { source: string; applied: number } {
  const parts = source.split(SVG2PDF_DATA_URI_PAYLOAD_GROUP);
  return { source: parts.join(SVG2PDF_DATA_URI_PAYLOAD_GROUP_PATCHED), applied: parts.length - 1 };
}

/** Patches keyed by vendor bundle name; each must apply exactly `expected` times. */
export const VENDOR_PATCHES: Record<
  string,
  { apply: (source: string) => { source: string; applied: number }; expected: number; label: string }[]
> = {
  'pdf-export': [
    {
      apply: patchSvg2pdfDataUriRegex,
      expected: 1,
      label: 'svg2pdf data-URI regex: (?:.|\\s)* → [\\s\\S]* (stack-safe on multi-megabyte images)',
    },
  ],
};

/** Apply every patch registered for `name`; throws when a patch does not apply exactly as expected. */
export function applyVendorPatches(name: string, source: string): { source: string; labels: string[] } {
  const labels: string[] = [];
  let out = source;
  for (const patch of VENDOR_PATCHES[name] ?? []) {
    const result = patch.apply(out);
    if (result.applied !== patch.expected) {
      throw new Error(
        `Vendor patch for ${name} applied ${result.applied}× (expected ${patch.expected}): ${patch.label}. ` +
          'The dependency changed — re-check whether the patch is still needed and update scripts/lib/vendor-patches.ts.',
      );
    }
    out = result.source;
    labels.push(patch.label);
  }
  return { source: out, labels };
}
