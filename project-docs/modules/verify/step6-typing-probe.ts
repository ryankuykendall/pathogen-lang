// Phase 3a step 6's typing check (note 81), measured in Node: what the
// playground does per keystroke (after its debounce) in a workspace with large
// data files, and what each compile costs to post the graph to its worker.
//   npx tsx project-docs/modules/verify/step6-typing-probe.ts          (the graph key as it is now)
//   npx tsx project-docs/modules/verify/step6-typing-probe.ts before   (the graph key before note 81)
// The "imports resolved" column always measures the engine as it is: its
// before numbers in note 81 came from the memory host before it answered
// with text (commit 644cd0d2's src/host/memory-host.ts).
import { createMemoryProjectHost, planImports, resolveModules } from '../../../src';
import { graphForMessage, graphFromMessage } from '../../../src/host/load-modules';

const MB = 1024 * 1024;
const record = (i: number): string => `{"x":${i},"y":${i * 2},"label":"gear ${i}"}`;
function dataText(bytes: number): string {
  const parts: string[] = [];
  let size = 2;
  for (let i = 0; size < bytes - 40; i++) {
    const r = record(i);
    parts.push(r);
    size += r.length + 1;
  }
  return `[${parts.join(',')}]`;
}

// The playground's graphKey (playground/services/workspace-modules.ts): BEFORE
// wrote every other file's text into the key; AFTER writes a version number.
const versions = new Map<string, { text: string; version: number }>();
let last = 0;
function graphKey(texts: Map<string, string>, openFile: string): string {
  const open = texts.get(openFile) ?? '';
  const sorted = [...texts].filter(([path]) => path !== openFile).sort(([a], [b]) => (a < b ? -1 : 1));
  const others =
    process.argv[2] === 'before'
      ? sorted
      : sorted.map(([path, text]) => {
          const known = versions.get(path);
          if (known?.text === text) return [path, known.version];
          last += 1;
          versions.set(path, { text, version: last });
          return [path, last];
        });
  return JSON.stringify([openFile, planImports(open).map((p) => p.written), others, []]);
}

async function measure(label: string, dataFiles: number, bytesEach: number): Promise<void> {
  const texts = new Map<string, string>();
  const imports: string[] = [];
  for (let i = 0; i < dataFiles; i++) {
    texts.set(`data/d${i}.json`, dataText(bytesEach));
    imports.push(`import d${i} from "./data/d${i}.json";`);
  }
  let main = `${imports.join('\n')}\nlog(d0.length);\n`;
  texts.set('main.pathogen', main);

  const times = { key: [] as number[], resolve: [] as number[] };
  for (let keystroke = 0; keystroke < 8; keystroke++) {
    main += '// x\n';
    texts.set('main.pathogen', main);
    let t = performance.now();
    graphKey(texts, 'main.pathogen');
    times.key.push(performance.now() - t);
    t = performance.now();
    const host = createMemoryProjectHost(texts, { label: 'Probe' });
    const { errors } = await resolveModules(main, { host, entry: '/main.pathogen' });
    times.resolve.push(performance.now() - t);
    if (errors.length > 0) throw new Error(errors[0].message);
  }
  // The first resolve reads the JSON; the rest are what typing costs.
  const typing = (xs: number[]): string => (xs.slice(1).reduce((a, b) => a + b, 0) / (xs.length - 1)).toFixed(1);
  console.log(
    `${label}: graph key ${typing(times.key)} ms, imports resolved ${typing(times.resolve)} ms a keystroke (first resolve ${times.resolve[0].toFixed(0)} ms)`,
  );
}

await measure('one 5 MB data file', 1, 5 * MB);
await measure('ten 5 MB data files (50 MB)', 10, 5 * MB);

// Each compile posts the graph to the worker (structured clone), which reads
// the data texts again through its cache.
{
  const texts = new Map<string, string>();
  const imports: string[] = [];
  for (let i = 0; i < 10; i++) {
    texts.set(`data/d${i}.json`, dataText(5 * MB));
    imports.push(`import d${i} from "./data/d${i}.json";`);
  }
  const main = `${imports.join('\n')}\nlog(d0.length);\n`;
  texts.set('main.pathogen', main);
  const { graph } = await resolveModules(main, {
    host: createMemoryProjectHost(texts, { label: 'Probe' }),
    entry: '/main.pathogen',
  });
  const clone: number[] = [];
  const reread: number[] = [];
  for (let i = 0; i < 6; i++) {
    let t = performance.now();
    const message = structuredClone(graphForMessage(graph));
    clone.push(performance.now() - t);
    t = performance.now();
    graphFromMessage(message, 'worker');
    reread.push(performance.now() - t);
  }
  const avg = (xs: number[]): string => (xs.slice(1).reduce((a, b) => a + b, 0) / (xs.length - 1)).toFixed(1);
  console.log(
    `50 MB to the worker: clone ${avg(clone)} ms, worker's re-read ${avg(reread)} ms a compile (first ${reread[0].toFixed(0)} ms)`,
  );
}
