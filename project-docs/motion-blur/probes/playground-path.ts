// Verify the PLAYGROUND render path (buildDefs + mountInto = direct DOM
// construction, not string serialization) renders MotionBlur — especially the
// progressive feImage + sibling gradient/rect — and that the cleanup selector
// removes the defs on recompile. Uses the built dist/index.global.js, the exact
// artifact the playground loads.
// Run: npx tsx project-docs/motion-blur/probes/playground-path.ts
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '../../../dist/index.global.js'), 'utf8');

const CLEANUP_SELECTOR =
  '[data-fragment-layer], [data-mask-def], [data-clippath-def], [data-gradient-def], [data-pattern-def], [data-marker-def], [data-filter-def]';

const html = `<!doctype html><html><body style="margin:0;background:#fff">
<svg id="preview" width="200" height="200" viewBox="0 0 200 200">
  <defs id="d"></defs>
  <rect x="55" y="30" width="90" height="140" fill="#a01020" filter="url(#pathogen-motion-blur-1)"/>
</svg>
</body></html>`;

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: 'new' as unknown as boolean });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 200, height: 200, deviceScaleFactor: 3 });
    await p.setContent(html, { waitUntil: 'networkidle0' });
    await p.addScriptTag({ content: bundle });

    // Replicate svg-preview-pane: buildDefs(emitPlaygroundDataAttrs) → mountInto.
    // Pass as a plain string so tsx/esbuild does not inject __name helpers.
    const script = `(function(sel){
      var PL = window.PathogenLang;
      var src = "let f = MotionBlurFilter() {|f| f.type = MotionBlurType.Progressive; f.distance = 9; f.angle = 90deg; };\\n"
        + "define PathLayer('a') \${ fill: hotpink; filter: f; }\\n"
        + "layer('a').apply { rect(55, 30, 90, 140); }";
      var defsEl = document.getElementById('d');
      function mount(){
        var result = PL.compile(src);
        var olds = defsEl.querySelectorAll(sel);
        for (var i=0;i<olds.length;i++) olds[i].remove();
        var vnodes = PL.buildDefs(result, { emitPlaygroundDataAttrs: true });
        PL.mountInto(defsEl, vnodes);
        return result.filters[0].id;
      }
      var id = mount();
      var afterFirst = { gradients: defsEl.querySelectorAll('linearGradient').length, rects: defsEl.querySelectorAll('rect').length, filters: defsEl.querySelectorAll('filter').length, feImages: defsEl.querySelectorAll('feImage').length };
      mount(); mount();
      var afterThird = { gradients: defsEl.querySelectorAll('linearGradient').length, rects: defsEl.querySelectorAll('rect').length, filters: defsEl.querySelectorAll('filter').length };
      var feImage = defsEl.querySelector('feImage');
      var href = feImage ? (feImage.getAttribute('href') || feImage.getAttribute('xlink:href')) : null;
      return { id: id, afterFirst: afterFirst, afterThird: afterThird, href: href };
    })(${JSON.stringify(CLEANUP_SELECTOR)})`;
    const report = await p.evaluate(script);

    await p.screenshot({ path: join(here, 'playground-path.png') });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
