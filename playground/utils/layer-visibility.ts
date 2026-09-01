// Pure helpers for the layerVisibility store map (unit-tested directly).

interface NamedLayer {
  name: string;
  children?: NamedLayer[];
}

/** All layer names in the tree, group children included. */
export function collectLayerNames(layers: NamedLayer[], into = new Set<string>()): Set<string> {
  for (const layer of layers) {
    into.add(layer.name);
    if (layer.children) collectLayerNames(layer.children, into);
  }
  return into;
}

/**
 * Drop visibility entries for layers that no longer exist. Returns the SAME
 * reference when nothing is stale so identity-based change detection (the
 * store's set guard and inspector-panel's differential setData cache) can
 * skip the no-op update — this runs on every compile, and allocating a
 * fresh map here used to defeat the differential cache every time.
 */
export function pruneVisibility(current: Record<string, boolean>, liveNames: Set<string>): Record<string, boolean> {
  let stale = false;
  for (const name of Object.keys(current)) {
    if (!liveNames.has(name)) {
      stale = true;
      break;
    }
  }
  if (!stale) return current;
  const cleaned: Record<string, boolean> = {};
  for (const [name, visible] of Object.entries(current)) {
    if (liveNames.has(name)) cleaned[name] = visible;
  }
  return cleaned;
}
