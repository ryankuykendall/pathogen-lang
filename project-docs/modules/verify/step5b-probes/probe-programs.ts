// 2d step 5b probes (note 52, "Probes first"), kept as the record of what was
// checked before building:
// 1. the module graph's file keys and order (is the entry in `order`?);
// 2. generateSvg on a workspace compile's result after a structured clone,
//    with a ConicGradient and with text;
// 3. what an error in an imported file looks like: the compile's message,
//    and getDiagnostics with the program's graph (does it find it?).
// Found (2026-11-13): keys are "/parts/gears.pathogen" and the entry is in
// neither; the conic gradient comes out as wedge paths and the text as <text>;
// getDiagnostics reruns the evaluator (source "pathogen-evaluator") and, for a
// parse error in an imported module, gives only the import line with no
// alsoIn, while the message names the module and its line.
// Run: npx tsx project-docs/modules/verify/step5b-probes/probe-programs.ts
import {
  compile,
  createMemoryProjectHost,
  generateSvg,
  getDiagnostics,
  resolveModules,
  StringTextDocument,
} from '../../../../src';

const GEARS = [
  'module;',
  'export fn gear(x, y, r) {',
  '  circle(x, y, r);',
  '}',
  'export fn broken(x) {',
  '  let a = [1, 2];',
  '  return a[x].nope;',
  '}',
  '',
].join('\n');

const KIT = [
  'module;',
  'import { gear } from "../parts/gears.pathogen";',
  'export fn kit(x) {',
  '  gear(x, 20, 10);',
  '}',
  '',
].join('\n');

const MAIN = [
  'import { gear } from "./parts/gears.pathogen";',
  "let wheel = ConicGradient('wheel', 100, 100) {|g|",
  "  g.stop(0, Color('#e63946'));",
  "  g.stop(1, Color('#264653'));",
  '};',
  'gear(100, 100, 40);',
  "let labels = TextLayer('labels') #{ font-size: 14; font-family: monospace; };",
  'labels.apply { text(10, 30)`Hello`; }',
  "let ring = PathLayer('ring') #{ fill: wheel; };",
  'ring.apply { circle(100, 100, 30); }',
  '',
].join('\n');

const TRY = ['import { kit } from "./demos/kit.pathogen";', 'kit(30);', ''].join('\n');

const BROKEN_RUNTIME = ['import { broken } from "./parts/gears.pathogen";', 'broken(5);', ''].join('\n');

const BROKEN_PARSE_LIB = ['module;', 'export fn gear(x, y, r) {', '  circle(x, y r);', '}', ''].join('\n');

async function main(): Promise<void> {
  const files = new Map<string, string>([
    ['main.pathogen', MAIN],
    ['try-sizes.pathogen', TRY],
    ['broken.pathogen', BROKEN_RUNTIME],
    ['parts/gears.pathogen', GEARS],
    ['demos/kit.pathogen', KIT],
  ]);
  const host = createMemoryProjectHost(files, { label: 'probe' });

  console.log('--- 1. graph keys');
  for (const entry of ['main.pathogen', 'try-sizes.pathogen']) {
    const { graph, errors } = await resolveModules(files.get(entry)!, { host, entry: `/${entry}` });
    console.log(entry, 'files:', [...graph.files.keys()], 'order:', graph.order, 'errors:', errors.length);
  }

  console.log('--- 2. generateSvg after structuredClone');
  {
    const { graph } = await resolveModules(MAIN, { host, entry: '/main.pathogen' });
    const result = compile(MAIN, { modules: graph });
    const cloned = structuredClone(result);
    console.log('result keys:', Object.keys(cloned));
    console.log('gradients:', JSON.stringify(cloned.gradients).slice(0, 200));
    const svg = generateSvg(cloned);
    console.log('svg length:', svg.length);
    console.log(svg.slice(0, 300));
    console.log('...tail:', svg.slice(-700));
  }

  console.log('--- 3a. runtime error in an imported fn');
  {
    const { graph } = await resolveModules(BROKEN_RUNTIME, { host, entry: '/broken.pathogen' });
    try {
      compile(BROKEN_RUNTIME, { modules: graph });
      console.log('no error');
    } catch (e) {
      console.log('message:', JSON.stringify((e as Error).message));
    }
    const d = getDiagnostics(new StringTextDocument(BROKEN_RUNTIME), { modules: graph, loadErrors: [] });
    console.log('diagnostics:', JSON.stringify(d));
  }

  console.log('--- 3b. parse error in an imported module');
  {
    const files2 = new Map(files);
    files2.set('parts/gears.pathogen', BROKEN_PARSE_LIB);
    const host2 = createMemoryProjectHost(files2, { label: 'probe' });
    const { graph, errors } = await resolveModules(MAIN, { host: host2, entry: '/main.pathogen' });
    console.log('load errors:', JSON.stringify(errors));
    try {
      compile(MAIN, { modules: graph });
      console.log('no error');
    } catch (e) {
      console.log('message:', JSON.stringify((e as Error).message));
    }
    const d = getDiagnostics(new StringTextDocument(MAIN), { modules: graph, loadErrors: errors });
    console.log('diagnostics:', JSON.stringify(d));
  }

  console.log('--- 3c. runtime error in the program itself');
  {
    const src = 'let a = [1];\nlet b = a[3].x;\nM 0 0\n';
    try {
      compile(src);
    } catch (e) {
      console.log('message:', JSON.stringify((e as Error).message));
    }
    console.log('diagnostics:', JSON.stringify(getDiagnostics(new StringTextDocument(src))));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
