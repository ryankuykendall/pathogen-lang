// Puppeteer verification for the named easing family (Phase 2 of
// project-docs/easing-interpolation): `ease(curve, t)`, the 21 new `Easing`
// members, and the topo-gradient renderers that share the same curve table.
//
// Scenario 1 — served bundle: EASING_ORDER has 26 curves in wire order, the
//   enum derives from it, stdlib.ease matches the table, buildEasingWgsl()
//   emits every case, and completions/hover know `ease` and `Easing.BounceOut`.
// Scenario 2 — generated WGSL compiles: both spliced topo shaders are handed
//   to WebGPU's createShaderModule and their compilation info is checked for
//   errors (skipped with a clear message if the headless Chrome has no GPU).
// Scenario 3 — a TopoGradient with a new easing renders in the preview on
//   both the distance and laplace methods (image-backed pattern present, no
//   error panel); a preview screenshot is saved to project-docs.
// Scenario 4 — `ease('wobble', t)` surfaces the positioned error listing the
//   valid names in the error panel.
//
// Requires `npm run dev:website` (or dev:stack) on localhost:3000, with the
// website rebuilt after the src/ change (PATHOGEN_API_BASE=http://localhost:8787
// npm run build:website while dev:stack is running).

import { Command } from 'commander';
import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';
import { withEasingWgsl } from '../playground/gpu/easing-wgsl';
import { TOPO_LAPLACE_RENDER_WGSL } from '../playground/gpu/topo-laplace-shader';
import { TOPO_FRAGMENT_WGSL, TOPO_VERTEX_WGSL } from '../playground/gpu/topo-shader';
import { buildEasingWgsl, EASING_ORDER } from '../src/stdlib/easing-curves';

const program = new Command();
program
  .name('debug-easing-family')
  .description('Puppeteer verification for ease(), the Easing family, and topo-gradient easing parity')
  .option('--pages-url <url>', 'Pages dev URL', 'http://localhost:3000')
  .option('--screenshot-dir <dir>', 'Where preview screenshots go', 'project-docs/easing-interpolation')
  .option('--require-gpu', 'Fail (instead of skipping) when headless Chrome exposes no WebGPU adapter', false)
  .parse();
const opts = program.opts<{ pagesUrl: string; screenshotDir: string; requireGpu: boolean }>();
const PAGES_URL = opts.pagesUrl;

function topoProgram(easing: string, method: 'distance' | 'laplace'): string {
  return `define ViewBox(0, 0, 300, 200);
let ring = @{ circle(0, 0, 70); closePath(); };
let peak = @{ circle(0, 0, 22); closePath(); };
let topo = TopoGradient('topo', 300, 200) {|g|
  g.contour(ring.project(150, 100), 0.4, Color('#f9e79f'));
  g.contour(peak.project(150, 100), 1, Color('#6e2c00'));
};
topo.baseColor = Color('#1a5276');
topo.easing = ${easing};
topo.method = '${method}';
${method === 'laplace' ? 'topo.iterations = 120;' : ''}
define PathLayer('bg') \${ fill: topo; }
layer('bg').apply { rect(0, 0, 300, 200); }
`;
}

const BAD_CURVE_PROGRAM = `let start = 1;
let eased = ease('wobble', 0.5);
M calc(eased) start
`;

function encodeState(code: string): string {
  return btoa(encodeURIComponent(JSON.stringify({ code })));
}

interface ProbeResult {
  imageHrefLength: number;
  errorPanelText: string | null;
  previewStale: boolean | null;
}

async function probe(page: Page): Promise<ProbeResult> {
  return page.evaluate(() => {
    const deepQuery = (root: Document | ShadowRoot | Element, selector: string): Element | null => {
      const direct = (root as Document).querySelector?.(selector);
      if (direct) return direct;
      for (const el of Array.from((root as Document).querySelectorAll?.('*') ?? [])) {
        if (el.shadowRoot) {
          const found = deepQuery(el.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const result: ProbeResult = { imageHrefLength: 0, errorPanelText: null, previewStale: null };
    const container = deepQuery(document, '#preview-container');
    if (container) result.previewStale = container.classList.contains('stale');
    const iframe = deepQuery(document, 'iframe') as HTMLIFrameElement | null;
    if (iframe?.contentDocument) {
      const image = iframe.contentDocument.querySelector('pattern image');
      const href = image?.getAttribute('href') ?? image?.getAttribute('xlink:href') ?? '';
      if (href.startsWith('data:image')) result.imageHrefLength = href.length;
    }
    const errPanel = deepQuery(document, 'error-panel');
    if (errPanel?.shadowRoot && getComputedStyle(errPanel).display !== 'none') {
      const text = Array.from(errPanel.shadowRoot.querySelectorAll(':not(style)'))
        .map((el) => (el.children.length === 0 ? el.textContent?.trim() : ''))
        .filter(Boolean)
        .join(' | ');
      if (text) result.errorPanelText = text.slice(0, 400);
    }
    return result;
  });
}

interface ServedResult {
  order: string[];
  enumBounce: string | undefined;
  enumKeys: number;
  easeBounce: number;
  easeBackIn: number;
  wgslCases: number;
  easeCompletion: { detail?: string; insertText?: string } | null;
  bounceMemberDetail: string | undefined;
  hover: string | null;
}

async function probeServed(page: Page): Promise<ServedResult> {
  return page.evaluate(() => {
    type Doc = object;
    interface Item {
      label: string;
      detail?: string;
      insertText?: string;
    }
    const lang = (
      window as unknown as {
        PathogenLang: {
          EASING_ORDER: readonly string[];
          BUILTIN_ENUMS: Record<string, Record<string, string>>;
          stdlib: { ease: (curve: string, t: number) => number };
          buildEasingWgsl: () => string;
          StringTextDocument: new (source: string) => Doc;
          getCompletions: (doc: Doc, pos: { line: number; character: number }) => Item[];
          getHoverInfo: (doc: Doc, pos: { line: number; character: number }) => { contents: string } | null;
        };
      }
    ).PathogenLang;
    const wgsl = lang.buildEasingWgsl();
    const easeItem = lang
      .getCompletions(new lang.StringTextDocument('let e = ea'), { line: 0, character: 10 })
      .find((i) => i.label === 'ease');
    const bounceItem = lang
      .getCompletions(new lang.StringTextDocument('Easing.'), { line: 0, character: 7 })
      .find((i) => i.label === 'BounceOut');
    const hover = lang.getHoverInfo(new lang.StringTextDocument("let e = ease('bounce-out', 0.5);"), {
      line: 0,
      character: 9,
    });
    return {
      order: [...lang.EASING_ORDER],
      enumBounce: lang.BUILTIN_ENUMS.Easing?.BounceOut,
      enumKeys: Object.keys(lang.BUILTIN_ENUMS.Easing ?? {}).length,
      easeBounce: lang.stdlib.ease('bounce-out', 0.5),
      easeBackIn: lang.stdlib.ease('back-in', 0.5),
      wgslCases: (wgsl.match(/case \d+u: \{/g) ?? []).length,
      easeCompletion: easeItem ? { detail: easeItem.detail, insertText: easeItem.insertText } : null,
      bounceMemberDetail: bounceItem?.detail,
      hover: hover?.contents ?? null,
    };
  });
}

interface WgslCompileResult {
  available: boolean;
  errors: string[];
}

async function compileWgslInPage(page: Page, shaders: Record<string, string>): Promise<WgslCompileResult> {
  return page.evaluate(async (sources: Record<string, string>) => {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return { available: false, errors: [] };
    const adapter = (await gpu.requestAdapter()) as { requestDevice: () => Promise<unknown> } | null;
    if (!adapter) return { available: false, errors: [] };
    const device = (await adapter.requestDevice()) as {
      createShaderModule: (d: { code: string }) => {
        getCompilationInfo: () => Promise<{ messages: { type: string; message: string; lineNum: number }[] }>;
      };
    };
    const errors: string[] = [];
    for (const [name, code] of Object.entries(sources)) {
      const info = await device.createShaderModule({ code }).getCompilationInfo();
      for (const m of info.messages) {
        if (m.type === 'error') errors.push(`${name}:${m.lineNum}: ${m.message}`);
      }
    }
    return { available: true, errors };
  }, shaders);
}

async function withPage<T>(code: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'],
    defaultViewport: { width: 1400, height: 1000 },
  });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => {
      d.dismiss().catch(() => undefined);
    });
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    await page.evaluateOnNewDocument(() => {
      (window as unknown as { __name?: <T>(fn: T) => T }).__name = <T>(fn: T): T => fn;
      try {
        localStorage.setItem('pathogen-lang:userId', 'e2e-easing-family');
      } catch {
        /* ignore */
      }
    });
    await page.goto(`${PAGES_URL}/workspace/scratch?state=${encodeState(code)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function waitForRender(page: Page): Promise<ProbeResult> {
  let result: ProbeResult = { imageHrefLength: 0, errorPanelText: null, previewStale: null };
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    result = await probe(page);
    if (result.errorPanelText || (result.imageHrefLength > 0 && result.previewStale === false)) break;
  }
  return result;
}

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures++;
}

const splicedShaders = {
  'topo-distance': withEasingWgsl(TOPO_FRAGMENT_WGSL, buildEasingWgsl()),
  'topo-laplace-render': withEasingWgsl(TOPO_LAPLACE_RENDER_WGSL, buildEasingWgsl()),
  'topo-vertex': TOPO_VERTEX_WGSL,
};

console.log('━━━ Scenario 1: served bundle knows the family ━━━');
await withPage(topoProgram('Easing.BounceOut', 'distance'), async (page) => {
  const served = await probeServed(page);
  console.log('served EASING_ORDER:', served.order.length, 'first five:', served.order.slice(0, 5).join(','));
  console.log('served ease completion:', JSON.stringify(served.easeCompletion));
  console.log('served Easing.BounceOut detail:', served.bounceMemberDetail);
  check('served EASING_ORDER matches the source table', JSON.stringify(served.order) === JSON.stringify(EASING_ORDER));
  check('served Easing enum has 26 members and BounceOut = bounce-out', served.enumKeys === 26 && served.enumBounce === 'bounce-out');
  check('served stdlib.ease bounce-out(0.5) is 0.765625', served.easeBounce === 0.765625);
  check('served stdlib.ease back-in(0.5) overshoots below 0', served.easeBackIn < 0);
  check('served buildEasingWgsl emits 26 cases', served.wgslCases === 26);
  check(
    'completion offers ease with its detail',
    served.easeCompletion?.detail === 'ease(curve, t) — Apply a named Easing curve to t; curve is an Easing member or its string',
  );
  check('completion offers Easing.BounceOut', served.bounceMemberDetail === 'Easing.BounceOut → "bounce-out"');
  check('hover on ease shows the detail', !!served.hover && served.hover.includes('Apply a named Easing curve'));

  console.log('\n━━━ Scenario 2: generated WGSL compiles under WebGPU ━━━');
  const wgsl = await compileWgslInPage(page, splicedShaders);
  if (!wgsl.available) {
    if (opts.requireGpu) {
      check('WebGPU adapter available for the WGSL compile check (--require-gpu)', false);
    } else {
      console.log(
        'WebGPU is not available in this headless Chrome; WGSL compile check SKIPPED. Pass --require-gpu to make this a failure.',
      );
    }
  } else {
    for (const e of wgsl.errors) console.log('[wgsl error]', e);
    check('spliced topo shaders compile with no WGSL errors', wgsl.errors.length === 0);
  }

  console.log('\n━━━ Scenario 3a: TopoGradient easing = Easing.BounceOut (distance) renders ━━━');
  const distance = await waitForRender(page);
  console.log('image href length:', distance.imageHrefLength, 'error:', distance.errorPanelText ?? '(none)');
  check('distance method: no compile error', !distance.errorPanelText);
  check('distance method: image-backed pattern rendered', distance.imageHrefLength > 1000);
  const frame = await page.$('pierce/iframe');
  if (frame) {
    const path = `${opts.screenshotDir}/preview-topo-bounce-out-distance.png`;
    await frame.screenshot({ path });
    console.log('screenshot:', path);
  }
});

console.log('\n━━━ Scenario 3b: TopoGradient easing = Easing.ElasticInOut (laplace) renders ━━━');
await withPage(topoProgram('Easing.ElasticInOut', 'laplace'), async (page) => {
  const laplace = await waitForRender(page);
  console.log('image href length:', laplace.imageHrefLength, 'error:', laplace.errorPanelText ?? '(none)');
  check('laplace method: no compile error', !laplace.errorPanelText);
  check('laplace method: image-backed pattern rendered', laplace.imageHrefLength > 1000);
  const frame = await page.$('pierce/iframe');
  if (frame) {
    const path = `${opts.screenshotDir}/preview-topo-elastic-in-out-laplace.png`;
    await frame.screenshot({ path });
    console.log('screenshot:', path);
  }
});

console.log('\n━━━ Scenario 3c: the string form on a gradient, Easing.BackIn spelled as back-in ━━━');
await withPage(topoProgram("'back-in'", 'distance'), async (page) => {
  const result = await waitForRender(page);
  check('string easing name renders too', !result.errorPanelText && result.imageHrefLength > 1000);
});

console.log('\n━━━ Scenario 4: unknown curve surfaces a positioned error ━━━');
await withPage(BAD_CURVE_PROGRAM, async (page) => {
  const result = await waitForRender(page);
  console.log('error:', result.errorPanelText ?? '(none)');
  check(
    "ease('wobble') shows the unknown-curve error with its line and the valid names",
    !!result.errorPanelText &&
      result.errorPanelText.includes("ease: unknown curve 'wobble'") &&
      result.errorPanelText.includes('Line 2') &&
      result.errorPanelText.includes('bounce-in-out'),
  );
});

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
