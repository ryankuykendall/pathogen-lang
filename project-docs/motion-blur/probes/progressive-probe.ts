// One-off empirical probe: which SVG-filter mechanism produces a progressive
// (spatially-ramping) blur, and does it track the filtered element's bounds?
// Renders several candidate filters in headless Chromium and screenshots them.
// NOT part of the test suite — supports the MotionBlurFilter design decision.
//
// Run: npx tsx project-docs/motion-blur/probes/progressive-probe.ts

import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// A source that makes vertical-direction blur obvious: stack of thin horizontal
// bars. Sharp bars read as crisp lines; blurred bars smear into grey.
function bars(): string {
  let s = '';
  for (let y = 12; y < 192; y += 18) {
    s += `<rect x="10" y="${y}" width="180" height="7" fill="#111"/>`;
  }
  return s;
}

// Same content but confined to a SMALL bbox in the top-left quadrant, to expose
// whether a "progressive" filter ramps over the ELEMENT or over the viewport.
function smallBars(): string {
  let s = '';
  for (let y = 8; y < 92; y += 12) {
    s += `<rect x="8" y="${y}" width="84" height="5" fill="#111"/>`;
  }
  return s;
}

const defs = `
<defs>
  <!-- vertical alpha ramp, objectBoundingBox so it tracks whatever it fills -->
  <linearGradient id="vgrad" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="1"/>
  </linearGradient>

  <!-- mask source rects for feImage variants -->
  <rect id="maskRectAbs" x="0" y="0" width="200" height="200" fill="url(#vgrad)"/>
  <rect id="maskRectPct" x="0" y="0" width="100%" height="100%" fill="url(#vgrad)"/>

  <!-- A: feImage of an ABSOLUTE-sized gradient rect, overlay-merge -->
  <filter id="fA" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/>
    <feImage href="#maskRectAbs" result="m"/>
    <feComposite in="b" in2="m" operator="in" result="fade"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="fade"/></feMerge>
  </filter>

  <!-- B: feImage of a PERCENT-sized gradient rect, overlay-merge -->
  <filter id="fB" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/>
    <feImage href="#maskRectPct" result="m"/>
    <feComposite in="b" in2="m" operator="in" result="fade"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="fade"/></feMerge>
  </filter>

  <!-- C: feFlood discrete bands (assumes 0..200 extent), stacked blur levels -->
  <filter id="fC" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
    <feGaussianBlur in="SourceGraphic" stdDeviation="0"  result="l0"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="3"  result="l1"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="7"  result="l2"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="l3"/>
    <feFlood x="0" y="0"   width="200" height="50" flood-color="#fff" result="f0"/>
    <feComposite in="l0" in2="f0" operator="in" result="m0"/>
    <feFlood x="0" y="50"  width="200" height="50" flood-color="#fff" result="f1"/>
    <feComposite in="l1" in2="f1" operator="in" result="m1"/>
    <feFlood x="0" y="100" width="200" height="50" flood-color="#fff" result="f2"/>
    <feComposite in="l2" in2="f2" operator="in" result="m2"/>
    <feFlood x="0" y="150" width="200" height="50" flood-color="#fff" result="f3"/>
    <feComposite in="l3" in2="f3" operator="in" result="m3"/>
    <feMerge><feMergeNode in="m0"/><feMergeNode in="m1"/><feMergeNode in="m2"/><feMergeNode in="m3"/></feMerge>
  </filter>

  <!-- ref: uniform blur -->
  <filter id="fU" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="6"/>
  </filter>
</defs>`;

function panel(label: string, inner: string): string {
  return `
  <figure style="margin:0;text-align:center;font:12px monospace">
    <svg width="200" height="200" viewBox="0 0 200 200" style="background:#fff;border:1px solid #ccc">
      ${defs}
      ${inner}
    </svg>
    <figcaption>${label}</figcaption>
  </figure>`;
}

const page = `<!doctype html><html><body style="margin:16px;background:#eee">
  <div style="display:grid;grid-template-columns:repeat(3,200px);gap:18px">
    ${panel('0 reference (sharp)', `<g>${bars()}</g>`)}
    ${panel('1 uniform blur', `<g filter="url(#fU)">${bars()}</g>`)}
    ${panel('A feImage abs-rect (full)', `<g filter="url(#fA)">${bars()}</g>`)}
    ${panel('B feImage pct-rect (full)', `<g filter="url(#fB)">${bars()}</g>`)}
    ${panel('C feFlood bands (full)', `<g filter="url(#fC)">${bars()}</g>`)}
    ${panel('A small bbox (top-left)', `<g filter="url(#fA)">${smallBars()}</g>`)}
    ${panel('B small bbox (top-left)', `<g filter="url(#fB)">${smallBars()}</g>`)}
    ${panel('C small bbox (top-left)', `<g filter="url(#fC)">${smallBars()}</g>`)}
  </div>
</body></html>`;

async function main(): Promise<void> {
  const outHtml = join(here, 'progressive-probe.html');
  writeFileSync(outHtml, page);
  const browser = await puppeteer.launch({ headless: 'new' as unknown as boolean });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 700, height: 760, deviceScaleFactor: 2 });
    await p.setContent(page, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    const out = join(here, 'progressive-probe.png');
    await p.screenshot({ path: out });
    console.log('wrote', out);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
