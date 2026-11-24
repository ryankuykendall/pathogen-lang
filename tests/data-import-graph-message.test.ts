/**
 * Phase 3a, step 6: a graph with data crosses a message as text
 * (src/host/load-modules.ts graphForMessage / graphFromMessage). The
 * playground resolves imports on the main thread and posts the graph to its
 * compile worker; structured clone would copy every data value (several
 * times its file's size) on every compile. So data goes as text, and the
 * worker reads it again, once per text (the loader's cache).
 */
import { describe, expect, it } from 'vitest';

import { compile } from '../src';
import { graphForMessage, graphFromMessage, resolveModules } from '../src/host/load-modules';

import type { HostReadResult, ProjectFileHost } from '../src/host/types';

const GEARS = '[{ "x": 50, "r": 10 }, { "x": 150, "r": 20 }]';
const MAIN = 'import gears from "./data/gears.json";\nfor (gear in gears) {\n  circle(gear.x, 50, gear.r);\n}\n';

function host(files: Record<string, string>): ProjectFileHost {
  return {
    projectLabel: 'Gear studies',
    readFile: async (path): Promise<HostReadResult> =>
      files[path] === undefined
        ? { ok: false, code: 'not-found', osPath: path }
        : { ok: true, bytes: new TextEncoder().encode(files[path]) },
  };
}

describe('a graph as a message', () => {
  it('data goes as text only, and comes back as the same values', async () => {
    const { graph } = await resolveModules(MAIN, {
      host: host({ '/data/gears.json': GEARS }),
      entry: '/main.pathogen',
    });
    const message = graphForMessage(graph);
    const sent = message.data?.get('/data/gears.json');
    expect(sent && 'value' in sent).toBe(false);
    expect(sent?.text).toBe(GEARS);
    // structuredClone stands in for postMessage.
    const received = graphFromMessage(structuredClone(message), 'worker');
    expect(compile(MAIN, { modules: received }).layers).toEqual(compile(MAIN, { modules: graph }).layers);
  });

  it('read once per text: the same text again gives the same value', async () => {
    const { graph } = await resolveModules(MAIN, {
      host: host({ '/data/gears.json': GEARS }),
      entry: '/main.pathogen',
    });
    const first = graphFromMessage(structuredClone(graphForMessage(graph)), 'worker');
    const second = graphFromMessage(structuredClone(graphForMessage(graph)), 'worker');
    expect(second.data?.get('/data/gears.json')?.value).toBe(first.data?.get('/data/gears.json')?.value);
  });

  it('a graph with no data is the same graph', async () => {
    const { graph } = await resolveModules('M 0 0', { host: host({}), entry: '/main.pathogen' });
    expect(graphFromMessage(graphForMessage(graph), 'worker')).toEqual(graph);
  });
});
