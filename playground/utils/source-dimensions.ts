// Extract viewBox / width / height from a Pathogen source comment.
//
// Mirrors the autoDetectDimensions logic in scripts/compile-bbwp.ts so
// the playground (admin moderation SVG capture, possible future
// re-renders on the detail page) reads dimensions the same way the
// CLI does. If we ever decide to make the dimensions a first-class
// language construct, both call sites swap at once.
//
// Recognized comment patterns (first match wins):
//   1. `// Set viewBox: WxH, width: W, height: H`
//   2. `// viewBox="x y w h"`  (or any quoted `viewBox=` / `viewBox:` form)
//   3. Standalone `// width: N` / `// height: N`
//
// All return values are strings so they pass through to lib.generateSvg
// (which accepts strings for viewBox/width/height).

export interface SourceDimensions {
  viewBox?: string;
  width?: string;
  height?: string;
}

export function extractSourceDimensions(source: string): SourceDimensions {
  const result: SourceDimensions = {};

  // Pattern 0 (canonical): `define ViewBox(originX, originY, width, height);`
  const defineMatch =
    /define\s+ViewBox\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/.exec(
      source,
    );
  if (defineMatch) {
    result.viewBox = `${defineMatch[1]} ${defineMatch[2]} ${defineMatch[3]} ${defineMatch[4]}`;
    result.width = defineMatch[3];
    result.height = defineMatch[4];
    return result;
  }

  // Pattern 1 (legacy comment): `Set viewBox: W x H, width: W, height: H`
  const setMatch =
    /\/\/\s*Set\s+viewBox:\s*(\d+)\s*x\s*(\d+)\s*,\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)/i.exec(source);
  if (setMatch) {
    result.viewBox = `0 0 ${setMatch[1]} ${setMatch[2]}`;
    result.width = setMatch[3];
    result.height = setMatch[4];
    return result;
  }

  // Pattern 2 (legacy comment): `viewBox="x y w h"` or `viewBox=x y w h`
  const vbMatch = /viewBox[=:]\s*"?(\d+\s+\d+\s+\d+\s+\d+)"?/i.exec(source);
  if (vbMatch) {
    result.viewBox = vbMatch[1];
    const parts = vbMatch[1].split(/\s+/);
    result.width = parts[2];
    result.height = parts[3];
  }

  // Pattern 3: standalone `// width: N` / `// height: N` lines that
  // override (or fill in) the values picked up from Pattern 2.
  const wMatch = /\/\/.*width[=:]\s*(\d+)/i.exec(source);
  const hMatch = /\/\/.*height[=:]\s*(\d+)/i.exec(source);
  if (wMatch && !result.width) result.width = wMatch[1];
  if (hMatch && !result.height) result.height = hMatch[1];

  return result;
}

// Convenience: return dimensions with fallbacks applied. Use this at
// call sites that need to hand non-optional strings to lib.generateSvg.
export function dimensionsOrDefault(source: string): {
  viewBox: string;
  width: string;
  height: string;
} {
  const detected = extractSourceDimensions(source);
  return {
    viewBox: detected.viewBox ?? '0 0 200 200',
    width: detected.width ?? '200',
    height: detected.height ?? '200',
  };
}
