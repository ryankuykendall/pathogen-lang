// Progressive enhancement for the workspace detail page hero
// (/u/:handle/:slug, SSR'd by website/_worker.ts).
//
// Upgrades the static approval-SVG plate into the live viewer chosen in the
// detail-hero-viewer design review (project-docs/detail-hero-viewer/, variant
// B·2): frameless stage, pan/zoom, a single hover-revealed fullscreen button,
// and layers gated to fullscreen. Everything interactive is the EXISTING
// component stack — <mini-preview> (sandboxed iframe render surface, shared
// PanZoomController, zoom pill, scroll hint, class-based viewport-fill
// fullscreen with the inspector button already fullscreen-only) plus
// <inspector-panel>. This module is only host glue, mirroring what
// <mini-workspace> does for blog embeds — do not grow viewer behavior here;
// grow it in the shared components.
//
// Loaded lazily by the detail page's inline module script (same pattern as
// detail-source-mount.ts). The page must load /dist/pan-zoom.global.js as a
// classic script first — mini-preview requires window.PathogenPanZoom.

import type { MiniPreview } from '../components/blog/mini-preview.js';
import type { InspectorPanel } from '../components/inspector-panel.js';

/** Minimal layer records for <layers-panel> (name/type/children/styles). */
interface DerivedLayer {
  name: string;
  type: 'path' | 'text';
  data: string;
  styles: Record<string, string>;
  isDefault: boolean;
}

const FULLSCREEN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

/**
 * Approval SVGs are captured without the `pathogen-metadata` block (the
 * default compiler output bans <script> per the security contract), so the
 * layer list is derived from the `data-layer-name` attributes every compiled
 * layer element carries in both CLI and playground output. Flat list, paint
 * order, swatch color from the first element's fill/stroke.
 */
function deriveLayers(svgString: string): DerivedLayer[] {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (doc.documentElement.nodeName !== 'svg') return [];
  const seen = new Map<string, DerivedLayer>();
  for (const el of Array.from(doc.querySelectorAll('[data-layer-name]'))) {
    const name = el.getAttribute('data-layer-name');
    if (!name || seen.has(name)) continue;
    const styles: Record<string, string> = {};
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    if (fill) styles.fill = fill;
    if (stroke) styles.stroke = stroke;
    seen.set(name, {
      name,
      type: el.tagName.toLowerCase() === 'text' ? 'text' : 'path',
      data: '',
      styles,
      isDefault: false,
    });
  }
  return [...seen.values()];
}

/** Read the hero SVG: legacy inline markup, else fetch the R2 approval SVG. */
async function obtainSvgString(stage: HTMLElement): Promise<string | null> {
  const inline = stage.querySelector('.detail-plate-art svg');
  if (inline) return inline.outerHTML;

  const obj = stage.querySelector('object.detail-plate-art[type="image/svg+xml"]') as HTMLObjectElement | null;
  if (!obj?.data) return null;
  const res = await fetch(obj.data, { credentials: 'omit' });
  if (!res.ok) return null;
  const text = await res.text();
  return text.includes('<svg') ? text : null;
}

/**
 * The inspector overlay, wired the way <mini-workspace> wires it: lazy-load
 * the panel on the preview's `toggle-inspector` event, append with the
 * `fullscreen-overlay open` classes (its own CSS positions it above the
 * fullscreen preview), close on any fullscreen transition, and let Esc close
 * the panel before a second Esc exits fullscreen.
 */
function wireInspector(preview: MiniPreview, layers: DerivedLayer[]): () => void {
  let panel: InspectorPanel | null = null;
  let panelOpen = false;
  let previewFullscreen = false;
  const layerVisibility: Record<string, boolean> = {};

  const closeInspector = (): void => {
    if (!panel) return;
    panel.remove();
    panel = null;
    panelOpen = false;
  };

  const openInspector = async (): Promise<void> => {
    await import('../components/inspector-panel.js');
    panel = document.createElement('inspector-panel') as InspectorPanel;
    panel.classList.add('fullscreen-overlay', 'open');
    // Append before setData — the panel forwards data to its child panels
    // only after connectedCallback has rendered them.
    document.body.appendChild(panel);
    panel.setData({
      layers,
      masks: [],
      clipPaths: [],
      gradients: [],
      cssProperties: [],
      layerVisibility: { ...layerVisibility },
    });
    panel.addEventListener('layer-visibility-change', (e: Event) => {
      const { name, visible } = (e as CustomEvent<{ name: string; visible?: boolean }>).detail;
      layerVisibility[name] = visible !== false;
      preview.setLayerVisibility(name, visible !== false);
    });
    panel.addEventListener('toggle-inspector', closeInspector);
    panelOpen = true;
  };

  preview.addEventListener('toggle-inspector', () => {
    if (panelOpen) closeInspector();
    else void openInspector();
  });

  // Any fullscreen transition (enter or exit) dismisses the overlay — same
  // policy as mini-workspace, and exit must not strand a fixed panel over
  // the restored page.
  preview.addEventListener('fullscreen-change', (e: Event) => {
    previewFullscreen = Boolean((e as CustomEvent<{ fullscreen: boolean }>).detail?.fullscreen);
    closeInspector();
  });

  // Esc closes the inspector first (capture + stopPropagation beats the
  // fullscreen toggle's own document listener); the next Esc exits fullscreen.
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && panelOpen && previewFullscreen) {
      e.stopPropagation();
      closeInspector();
    }
  };
  document.addEventListener('keydown', onKeydown, true);

  // Teardown, mirroring mini-workspace's disconnectedCallback. The detail
  // page is SSR/MPA today so this is unused, but a future SPA absorption of
  // the route (or a re-mount) must not stack document listeners.
  return () => {
    document.removeEventListener('keydown', onKeydown, true);
    closeInspector();
  };
}

/**
 * Upgrade the static hero plate to the live viewer. Returns false (leaving
 * the SSR markup untouched) whenever any prerequisite is missing — the
 * static <object>/<img> chain remains the no-JS and failure experience.
 */
export async function mountHeroViewer(stage: HTMLElement): Promise<boolean> {
  if (!('PathogenPanZoom' in window)) return false;
  // Idempotency: a second call must not stack viewers or document listeners.
  if (stage.classList.contains('detail-hero-live')) return false;

  const svgString = await obtainSvgString(stage);
  if (!svgString) return false;
  const layers = deriveLayers(svgString);

  await import('../components/blog/mini-preview.js');

  const viewport = document.createElement('div');
  viewport.className = 'detail-hero-viewport';
  const preview = document.createElement('mini-preview') as MiniPreview;
  viewport.appendChild(preview);

  const fsBtn = document.createElement('button');
  fsBtn.className = 'detail-hero-fullscreen';
  fsBtn.title = 'Fullscreen';
  fsBtn.setAttribute('aria-label', 'View fullscreen');
  fsBtn.innerHTML = FULLSCREEN_ICON;
  // Delegate to mini-preview's internal toggle so attachFullscreenBehavior
  // keeps owning the state machine (setting the .fullscreen class directly
  // would desync its closure flag and break Esc).
  fsBtn.addEventListener('click', () => {
    (preview.shadowRoot?.querySelector('#fullscreen-toggle') as HTMLButtonElement | null)?.click();
  });
  viewport.appendChild(fsBtn);

  // Swap the static art for the live viewer only after everything above
  // succeeded; from here the stage is frameless (CSS keys off the class).
  for (const el of Array.from(stage.querySelectorAll('.detail-plate-art, .detail-plate-fallback'))) {
    el.remove();
  }
  stage.classList.add('detail-hero-live');
  stage.appendChild(viewport);

  preview.setSvgContent(svgString);
  wireInspector(preview, layers);
  return true;
}
