/**
 * Subscriptions — `layer.subscribe(selector) {|match, i, sub| … }`.
 *
 * A subscription is a path query that runs itself at program end over a
 * WINDOW of its source layer's records: `subscribe` opens the window at the
 * current global record sequence, `unsubscribe()` at top level closes it.
 * Nothing is matched while drawing. Dispatch:
 *
 *   1. each subscription runs its selector once over the finalized commands
 *      in its window (the milestone-1 matcher — `:last` and negative `:nth`
 *      resolve against the whole window before anything fires);
 *   2. the global queue is replayed in program order (record sequence, then
 *      registration order), invoking callbacks as their records come up;
 *   3. records the callbacks produced may feed other subscriptions — another
 *      round — up to MAX_SUBSCRIPTION_ROUNDS, after which the chain is an error.
 *
 * A callback that records into its own source layer is an immediate error.
 * Contract: docs/subscriptions.md.
 */
import { matchPathQuery } from './path-query';

import type { EvaluationState, PathBlockCommand, PathLayerState, SubscriptionValue, Value } from './types';
import type { SourceLocation } from '../parser/ast';

export const MAX_SUBSCRIPTION_ROUNDS = 8;

export interface DispatchHooks {
  /** Finalized commands of a layer (corner ops applied), meta.record intact. */
  finalizedCommands: (layer: PathLayerState) => PathBlockCommand[];
  /** The LayerReference value a query result should point back at. */
  layerRef: (layer: PathLayerState) => Value;
  /** Run the callback body for one match. */
  invoke: (sub: SubscriptionValue, match: Value, ordinal: number, trigger: SourceLocation | undefined) => void;
  /** Build a line-formatted error. */
  fail: (message: string, loc: SourceLocation | undefined) => Error;
}

interface Event {
  sub: SubscriptionValue;
  subIndex: number;
  order: number;
  seq: number;
  key: string;
  value: Value;
  trigger: SourceLocation | undefined;
}

export function dispatchSubscriptions(evalState: EvaluationState, hooks: DispatchHooks): void {
  const subs = evalState.subscriptions ?? [];
  if (subs.length === 0) return;
  const pathLayers = (): PathLayerState[] =>
    [...evalState.layers.values()].filter((l): l is PathLayerState => l.layerType === 'PathLayer');
  const edges: [string, string][] = [];

  for (let round = 1; ; round++) {
    const events: Event[] = [];
    subs.forEach((sub, subIndex) => {
      if (sub.cancelled) return;
      const layer = evalState.layers.get(sub.layerName);
      if (layer?.layerType !== 'PathLayer') return;
      const end = sub.windowEnd ?? Number.POSITIVE_INFINITY;
      const fin = hooks.finalizedCommands(layer);
      const inWindow = (from: number, to: number): boolean => {
        for (let i = from; i < to; i++) {
          const r = fin[i].meta?.record;
          if (r === undefined || r < sub.windowStart || r >= end) return false;
        }
        return true;
      };
      const locBySeq = new Map<number, SourceLocation | undefined>();
      for (const r of layer.accum.records) {
        const s = r.commands[0]?.meta?.record;
        if (s !== undefined) locBySeq.set(s, r.loc);
      }
      const source = { kind: 'layer' as const, value: hooks.layerRef(layer), commands: fin };
      matchPathQuery(source, sub.selector, { subject: inWindow }).forEach((hit, order) => {
        if (sub.fired.has(hit.key)) return;
        events.push({
          sub,
          subIndex,
          order,
          seq: hit.record ?? -1,
          key: hit.key,
          value: hit.value,
          trigger: hit.record === null ? undefined : locBySeq.get(hit.record),
        });
      });
    });
    if (events.length === 0) return;
    if (round > MAX_SUBSCRIPTION_ROUNDS) {
      throw hooks.fail(
        `Subscriptions fed each other for ${MAX_SUBSCRIPTION_ROUNDS} rounds: ${describeChain(edges)}`,
        undefined,
      );
    }
    events.sort((a, b) => a.seq - b.seq || a.subIndex - b.subIndex || a.order - b.order);
    for (const ev of events) {
      if (ev.sub.cancelled) continue;
      ev.sub.fired.add(ev.key);
      ev.sub.count++;
      const before = new Map(pathLayers().map((l) => [l.name, l.accum.records.length]));
      evalState.dispatching = ev.sub;
      try {
        hooks.invoke(ev.sub, ev.value, ev.sub.count - 1, ev.trigger);
      } finally {
        evalState.dispatching = null;
      }
      for (const l of pathLayers()) {
        if (l.accum.records.length <= (before.get(l.name) ?? 0)) continue;
        if (l.name === ev.sub.layerName) {
          throw hooks.fail(`Subscription on '${l.name}' drew into '${l.name}' from its own callback`, ev.sub.loc);
        }
        edges.push([ev.sub.layerName, l.name]);
      }
    }
  }
}

/**
 * `a → b → a`: a cycle among the recorded layer-to-layer writes, searched from
 * the first source that wrote so the report starts where the program did; falls
 * back to the longest chain when no closed loop exists.
 */
function describeChain(edges: [string, string][]): string {
  if (edges.length === 0) return '(no layers written)';
  const out = new Map<string, Set<string>>();
  for (const [from, to] of edges) {
    if (!out.has(from)) out.set(from, new Set());
    out.get(from)!.add(to);
  }
  const starts = [...new Set(edges.map(([from]) => from))];
  const findCycle = (start: string): string[] | null => {
    const path: string[] = [start];
    const visit = (node: string): string[] | null => {
      for (const next of out.get(node) ?? []) {
        if (next === start) return [...path, next];
        if (path.includes(next)) continue;
        path.push(next);
        const found = visit(next);
        if (found) return found;
        path.pop();
      }
      return null;
    };
    return visit(start);
  };
  for (const start of starts) {
    const cycle = findCycle(start);
    if (cycle) return cycle.join(' → ');
  }
  const chain = [starts[0]];
  let current = starts[0];
  for (let i = 0; i < 16; i++) {
    const next = [...(out.get(current) ?? [])][0];
    if (next === undefined || chain.includes(next)) break;
    chain.push(next);
    current = next;
  }
  return chain.join(' → ');
}
