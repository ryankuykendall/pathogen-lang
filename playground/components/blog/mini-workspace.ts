// Mini-Workspace — display-only code+preview blog embed
// Progressive enhancement: static fallback upgrades to interactive CodeMirror + pannable SVG
//
// Chrome design: details/summary-style header (chevron + title) always visible at 28px.
// Clicking the summary slides an in-flow glass-blur control bar from 0 → 44px height,
// exposing the code-toggle, per-var color chips, Background, Grid, Reset and
// fullscreen. Suppresses the minimap in embedded mode; minimap appears only when
// mini-preview goes fullscreen.
//
// The code panel is <source-files> (2e, step 3b; mockups v12 to v14): one file, or
// several through `sourceFiles`, with the copy icon in the panel itself. A blog
// sample isn't a file, so its icon says "Copy the code". `hide-playground-link`
// hides the ↗ (the snapshots page, the review modal).

// The theme manager: on a static blog page, nothing else starts it.
import '../../utils/theme.js';
import { GRID_COLOR, GRID_SIZE, GRID_SIZES } from '../../utils/canvas-defaults.js';
import '../shared/pathogen-color-input.js';
// Statically, so <source-files> is defined before render() puts one in the panel: a
// property set on an element not yet upgraded would hide the class's setter.
import { shownPathOf } from '../shared/source-files.js';
import './mini-preview.js';

import type { SourceFile, SourceFileMarks, SourceFiles } from '../shared/source-files.js';
import type { MiniGrid } from './mini-preview.js';

// Background and Grid in the control bar (2d, step 9c; mockup v7 screen W, approved
// 2026-11-09). The background is the canvas behind the drawing, not a variable of the
// drawing's own. Both stay with the embed: Open in Playground carries the code alone,
// and nothing is remembered after the page.
const BG_DEFAULT = 'transparent';
const BG_SWATCHES: { name: string; value: string }[] = [
  { name: 'White', value: '#ffffff' },
  { name: 'Paper', value: '#f5f0e6' },
  { name: 'Light grey', value: '#e5e7eb' },
  { name: 'Slate', value: '#4b5563' },
  { name: 'Black', value: '#000000' },
];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const BG_TIP = 'Background: the canvas behind the drawing';
const GRID_TIP = 'Grid: lines on the canvas, under the drawing';
const RESET_TIP = 'Reset the background and the grid';
const RESET_TIP_VARS = 'Reset the variables, the background and the grid';
const RESET_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12a8 8 0 0 1 14-5l2-2M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5l-2 2M4 20v-4h4"/></svg>`;
const GRID_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9.33h16M4 14.67h16M9.33 4v16M14.67 4v16"/></svg>`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

function escapeAttr(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

interface CssVar {
  name: string;
  defaultValue: string;
}

interface ImportState {
  code: string;
  w: number;
  h: number;
  title: string;
  desc: string;
}

/**
 * Several files for the code panel (the snapshots page, the review modal): the files,
 * the workspace's folders and main, and the file to open on, the program that drew
 * the image. Without it, the panel shows the child `<code>` as one file.
 */
export interface MiniWorkspaceFiles {
  files: SourceFile[];
  folders: string[];
  main: string | null;
  open: string | null;
  /** A re-review's marks for the code panel (2e step 5e; the review modal). */
  marks?: SourceFileMarks | null;
}

/** A blog sample isn't a file: the copy icon names it so. */
const SAMPLE_COPY_LABEL = 'the code';
/** The title when an embed has no caption. */
const DEFAULT_CAPTION = 'Code & Preview';

export class MiniWorkspace extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['caption', 'code-open', 'hide-playground-link'];
  }

  private _sourceCode: string = '';
  private _svgContent: string = '';
  private _width: number = 200;
  private _height: number = 200;
  private _cssVars: CssVar[] = [];
  private _imgSrc: string | undefined;

  // Inspector state
  private _inspectorMetadata: Record<string, unknown> | null = null;
  private _inspectorEl: (HTMLElement & { setData(data: Record<string, unknown>): void }) | null = null;
  private _inspectorOpen: boolean = false;
  private _isPreviewFullscreen: boolean = false;
  private _inspectorKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  // Document-level signal that some mini-workspace transitioned fullscreen.
  // Every instance listens and closes its own inspector on receipt — the
  // panel has its own `position: fixed` / z-index 10000 so it stays glued
  // to the viewport when its host shrinks back, and it'd leak between
  // sibling mini-workspaces in the same blog post otherwise.
  private _crossInstanceCloseHandler: (() => void) | null = null;

  // Several files for the code panel, when given (see MiniWorkspaceFiles).
  private _files: MiniWorkspaceFiles | null = null;

  // Bar transition handler cleanup
  private _onBarTransitionEnd: ((e: TransitionEvent) => void) | null = null;

  // Guard against binding the chip-group delegated listener twice when vars
  // arrive late via async SVG fetch (_wireChipGroup runs both in
  // setupEventListeners and _injectVarControls).
  private _chipGroupWired: boolean = false;

  /**
   * The file the reader has open in the code panel, when it isn't the drawing's:
   * a re-attached embed (a fresh panel) opens on it again (2e step 5e).
   */
  private _shownFile: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.addEventListener('source-file-open', (e) => {
      // Its own code panel's, not one nested deeper.
      if (e.target !== this._viewer) return;
      this._shownFile = (e as CustomEvent<{ path: string }>).detail.path;
    });
  }

  /** Several files for the code panel; null shows the child `<code>`. The panel follows when set later. */
  set sourceFiles(value: MiniWorkspaceFiles | null) {
    this._shownFile = null;
    this._files = value
      ? {
          files: [...value.files],
          folders: [...value.folders],
          main: value.main,
          open: value.open,
          marks: value.marks ?? null,
        }
      : null;
    this._sourceCode = this._files ? this._drawingText(this._files) : this._childCode();
    this._readSize();
    this._fillCodePanel();
    this._syncPlaygroundLink();
  }

  get sourceFiles(): MiniWorkspaceFiles | null {
    return this._files;
  }

  attributeChangedCallback(name: string): void {
    // Before the first render (an upgrade with the attribute already set), connectedCallback does this.
    if (!this.shadowRoot?.querySelector('.content-area')) return;
    if (name === 'code-open') this._syncCodeOpen();
    else if (name === 'hide-playground-link') this._syncPlaygroundLink();
    // A snapshot renamed while it's shown (the snapshots page sets the caption again).
    else if (name === 'caption') {
      const title = this.shadowRoot.querySelector('.mw-title');
      if (title) title.textContent = this.getAttribute('caption') || DEFAULT_CAPTION;
    }
  }

  connectedCallback(): void {
    // render() builds a fresh bar and preview, at their defaults: the instance's own state
    // follows, or a re-attached embed would show Default while it held another colour (step 9c).
    this._background = BG_DEFAULT;
    this._grid = { enabled: false, size: GRID_SIZE, color: GRID_COLOR };
    this._bgOpen = false;
    this._bgPending = false;
    this._chipGroupWired = false;
    this._captureChildren();
    this._initCssVars();
    this.render();
    this.setupEventListeners();

    const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement & {
      setSvgContent(svg: string): void;
      setCssVar(name: string, value: string): void;
      removeCssVar(name: string): void;
    };
    if (this._svgContent && preview) {
      preview.setSvgContent(this._svgContent);
    }
    if (this._cssVars.length > 0 && preview) {
      for (const v of this._cssVars) preview.setCssVar(v.name, v.defaultValue);
    }

    // render() built a fresh code panel: it gets its files, and opens if the code is open.
    this._fillCodePanel();
    this._syncCodeOpen();
    this._syncPlaygroundLink();
  }

  disconnectedCallback(): void {
    this._closeBackground(false);
    if (this._inspectorOpen) this._closeInspector();
    if (this._crossInstanceCloseHandler) {
      document.removeEventListener('mini-workspace-close-inspector', this._crossInstanceCloseHandler);
      this._crossInstanceCloseHandler = null;
    }
    if (this._onBarTransitionEnd) {
      const bar = this.shadowRoot?.querySelector('#glass-bar');
      if (bar) bar.removeEventListener('transitionend', this._onBarTransitionEnd as EventListener);
    }
  }

  /** The child `<code>`'s text: a blog sample, or the program that drew a snapshot. */
  private _childCode(): string {
    const codeEl = this.querySelector('code') || this.querySelector('pre code');
    return codeEl?.textContent ?? '';
  }

  private _captureChildren(): void {
    // With several files, the code is the program that drew the image, wherever it sits.
    this._sourceCode = this._files ? this._drawingText(this._files) : this._childCode();
    this._readSize();

    const svgChild = this.querySelector('svg');
    if (svgChild) {
      this._svgContent = svgChild.outerHTML;
      this._extractMetadata(svgChild);
    }

    const imgChild = this.querySelector('img');
    if (imgChild && !this._svgContent) {
      this._imgSrc = imgChild.getAttribute('src') || undefined;
      if (this._imgSrc) this._fetchSvg(this._imgSrc);
    }

    const svgSrc = this.getAttribute('svg-src');
    if (svgSrc && !this._svgContent) this._fetchSvg(svgSrc);
  }

  /** The drawing's size (what Open in Playground carries): a child <svg>'s, else the code's ViewBox. */
  private _readSize(): void {
    if (this._sourceCode) {
      // Prefer `define ViewBox(originX, originY, width, height);` — the
      // canonical source-of-truth introduced when viewBox moved out of
      // workspace storage. Falls back to the legacy `// viewBox=` comment
      // for older pre-rendered blog snippets that still carry it.
      const defineMatch = this._sourceCode.match(
        /define\s+ViewBox\s*\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/,
      );
      if (defineMatch) {
        this._width = parseFloat(defineMatch[1]);
        this._height = parseFloat(defineMatch[2]);
      } else {
        const vbMatch = this._sourceCode.match(/\/\/\s*viewBox\s*=\s*"(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/);
        if (vbMatch) {
          this._width = parseInt(vbMatch[3], 10);
          this._height = parseInt(vbMatch[4], 10);
        }
      }
    }
    // A child <svg>'s own size wins.
    const svgChild = this.querySelector('svg');
    const w = svgChild?.getAttribute('width');
    const h = svgChild?.getAttribute('height');
    if (w) this._width = parseFloat(w);
    if (h) this._height = parseFloat(h);
  }

  private async _fetchSvg(url: string): Promise<void> {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        this._svgContent = await resp.text();
        const doc = new DOMParser().parseFromString(this._svgContent, 'image/svg+xml');
        this._extractMetadata(doc.documentElement);
        const preview = this.shadowRoot!.querySelector('mini-preview') as HTMLElement & {
          setSvgContent(svg: string): void;
        };
        if (preview) preview.setSvgContent(this._svgContent);

        if (this._cssVars.length === 0) {
          this._initCssVars();
          if (this._cssVars.length > 0) this._injectVarControls();
        }
      }
    } catch (err) {
      console.warn('mini-workspace: failed to fetch SVG:', err);
    }
  }

  /**
   * Populate the chip-group inside the glass-bar after an async SVG load
   * that surfaces late-arriving CSS vars.
   */
  private _injectVarControls(): void {
    const chipGroup = this.shadowRoot!.querySelector('#chip-group') as HTMLElement | null;
    if (!chipGroup || chipGroup.children.length > 0) return;

    chipGroup.innerHTML = this._renderChipGroupInner();
    // Reset now puts the variables back too.
    const reset = this.shadowRoot!.querySelector('#canvas-reset');
    reset?.setAttribute('data-tip', this._resetTip());
    reset?.setAttribute('aria-label', this._resetTip());

    const preview = this.shadowRoot!.querySelector('mini-preview') as
      | (HTMLElement & { setCssVar(n: string, v: string): void; removeCssVar(n: string): void })
      | null;
    if (preview) {
      for (const v of this._cssVars) preview.setCssVar(v.name, v.defaultValue);
    }

    this._wireChipGroup();
  }

  private _renderChipGroupInner(): string {
    if (this._cssVars.length === 0) return '';
    const chips = this._cssVars
      .map((v) => {
        // Values from `vars=` attribute are caller-controlled; escape before
        // interpolation to keep quoted attributes and the style declaration
        // from being broken out of.
        const name = escapeAttr(v.name);
        const value = escapeAttr(v.defaultValue);
        return `
        <label class="chip" style="--chip-color:${value}" aria-label="${name}">
          <span class="dot"></span>
          <pathogen-color-input compact value="${value}" data-var="${name}"></pathogen-color-input>
          <span class="chip-label">${name}</span>
        </label>
      `;
      })
      .join('');
    // Reset sits outside this group, after Background and Grid, and puts the variables back too (step 9c).
    return `
      <span class="glass-divider"></span>
      ${chips}
    `;
  }

  private _wireChipGroup(): void {
    if (this._chipGroupWired) return;
    const chipGroup = this.shadowRoot!.querySelector('#chip-group') as HTMLElement | null;
    if (!chipGroup) return;
    this._chipGroupWired = true;
    const preview = this.shadowRoot!.querySelector('mini-preview') as
      | (HTMLElement & { setCssVar(n: string, v: string): void })
      | null;

    chipGroup.addEventListener('color-change', (e: Event) => {
      const target = e.target as HTMLElement;
      const varName = target.dataset.var;
      if (!varName) return;
      const value = (e as CustomEvent<{ value: string }>).detail.value;
      if (preview) preview.setCssVar(varName, value);
      const chip = target.closest('.chip') as HTMLElement | null;
      if (chip) chip.style.setProperty('--chip-color', value);
    });
  }

  // --- Background, Grid and Reset (2d, step 9c) ---

  private _background = BG_DEFAULT;

  private _grid: MiniGrid = { enabled: false, size: GRID_SIZE, color: GRID_COLOR };

  private _bgOpen = false;

  // Background pressed while the bar is still unfolding (overflow hidden): it opens once the bar has.
  private _bgPending = false;

  private get _miniPreview(): (HTMLElement & { background: string; grid: MiniGrid }) | null {
    return this.shadowRoot!.querySelector('mini-preview');
  }

  /** Background, Grid (its size while it's on), and Reset, after the variable chips. */
  private _renderCanvasControls(): string {
    const swatches = BG_SWATCHES.map(
      (s) =>
        `<button class="swatch" type="button" data-color="${s.value}" aria-label="${escapeAttr(`${s.name}, ${s.value}`)}" title="${escapeAttr(s.name)}" aria-pressed="false" style="--swatch:${s.value}"></button>`,
    ).join('');
    const sizes = GRID_SIZES.map(
      (n) => `<option value="${n}"${n === GRID_SIZE ? ' selected' : ''}>${n}px</option>`,
    ).join('');
    return `
      <span class="bg-control" id="bg-control">
        <button class="icon-btn bar-chip" id="bg-btn" type="button" data-tip="${BG_TIP}" aria-haspopup="dialog" aria-expanded="false" aria-controls="bg-popover"><span class="bg-swatch"></span><span>Background</span></button>
        <div class="bg-popover" id="bg-popover" role="dialog" aria-label="Background" hidden>
          <div class="bg-popover-title">Background</div>
          <div class="swatches">${swatches}</div>
          <div class="bg-row">
            <input id="bg-hex" type="text" spellcheck="false" autocomplete="off" placeholder="#rrggbb" aria-label="Background, as a hex colour" aria-invalid="false">
            <button id="bg-default" class="link-btn" type="button">Default</button>
          </div>
        </div>
      </span>
      <span class="grid-control" id="grid-control">
        <button class="icon-btn bar-chip" id="grid-btn" type="button" data-tip="${GRID_TIP}" aria-pressed="false">${GRID_ICON}<span>Grid</span></button>
        <select id="grid-size" aria-label="Grid size" hidden>${sizes}</select>
      </span>
      <button class="icon-btn" id="canvas-reset" type="button" data-tip="${this._resetTip()}" aria-label="${this._resetTip()}">${RESET_ICON}</button>
    `;
  }

  private _resetTip(): string {
    return this._cssVars.length > 0 ? RESET_TIP_VARS : RESET_TIP;
  }

  private _wireCanvasControls(): void {
    const root = this.shadowRoot!;
    const bgBtn = root.querySelector<HTMLButtonElement>('#bg-btn')!;
    const popover = root.querySelector<HTMLElement>('#bg-popover')!;
    const hex = root.querySelector<HTMLInputElement>('#bg-hex')!;
    bgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._bgOpen) this._closeBackground(false);
      // The bar clips what hangs below it until it has finished unfolding: open then.
      else if (!this.classList.contains('bar-fully-open')) this._bgPending = true;
      else this._openBackground();
    });
    // Tab out of it, or the bar scrolled sideways under it (a narrow screen): it closes.
    const control = root.querySelector<HTMLElement>('#bg-control')!;
    control.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (to !== null && !control.contains(to)) this._closeBackground(false);
    });
    root.querySelector('.glass-bar-inner')!.addEventListener('scroll', () => this._closeBackground(false));
    popover.addEventListener('click', (e) => {
      e.stopPropagation();
      const swatch = (e.target as HTMLElement).closest<HTMLElement>('.swatch');
      if (swatch) this._setBackground(swatch.dataset.color!);
    });
    root.querySelector('#bg-default')!.addEventListener('click', () => this._setBackground(BG_DEFAULT));
    const takeHex = (): void => {
      const value = hex.value.trim();
      if (value === '' || value === (this._background === BG_DEFAULT ? '' : this._background)) {
        hex.setAttribute('aria-invalid', 'false');
        return;
      }
      // A value that isn't a hex colour is marked, and changes nothing.
      if (!HEX.test(value)) {
        hex.setAttribute('aria-invalid', 'true');
        return;
      }
      this._setBackground(value.toLowerCase());
    };
    hex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        takeHex();
      }
    });
    hex.addEventListener('change', takeHex);
    hex.addEventListener('input', () => hex.setAttribute('aria-invalid', 'false'));
    // Esc closes the popover only; the keyboard goes back to Background.
    popover.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this._closeBackground(true);
    });

    const gridBtn = root.querySelector<HTMLButtonElement>('#grid-btn')!;
    const gridSize = root.querySelector<HTMLSelectElement>('#grid-size')!;
    gridBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._setGrid({ ...this._grid, enabled: !this._grid.enabled });
    });
    gridSize.addEventListener('change', () => this._setGrid({ ...this._grid, size: parseInt(gridSize.value, 10) }));

    root.querySelector('#canvas-reset')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this._resetCanvas();
    });
  }

  private readonly _onOutsideBackground = (e: Event): void => {
    if (!e.composedPath().includes(this.shadowRoot!.querySelector('#bg-control')!)) this._closeBackground(false);
  };

  private _openBackground(): void {
    const root = this.shadowRoot!;
    this._bgOpen = true;
    // Under its button, inside the embed: placed against the bar, which doesn't scroll.
    const bar = root.querySelector<HTMLElement>('#glass-bar')!.getBoundingClientRect();
    const btn = root.querySelector<HTMLElement>('#bg-btn')!.getBoundingClientRect();
    const popover = root.querySelector<HTMLElement>('#bg-popover')!;
    const left = Math.max(8, Math.min(btn.left - bar.left, bar.width - 220 - 8));
    popover.style.setProperty('--popover-left', `${Number.isFinite(left) ? left : 10}px`);
    popover.hidden = false;
    root.querySelector('#bg-btn')!.setAttribute('aria-expanded', 'true');
    root.querySelector('#bg-btn')!.classList.add('active');
    document.addEventListener('pointerdown', this._onOutsideBackground, true);
    const pressed = root.querySelector<HTMLElement>('.swatch[aria-pressed="true"]');
    (pressed ?? root.querySelector<HTMLElement>('.swatch'))?.focus();
  }

  private _closeBackground(toButton: boolean): void {
    if (!this._bgOpen) return;
    const root = this.shadowRoot!;
    this._bgOpen = false;
    root.querySelector<HTMLElement>('#bg-popover')!.hidden = true;
    const btn = root.querySelector<HTMLElement>('#bg-btn')!;
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('active');
    document.removeEventListener('pointerdown', this._onOutsideBackground, true);
    if (toButton) btn.focus();
  }

  private _setBackground(value: string): void {
    this._background = value;
    const preview = this._miniPreview;
    if (preview) preview.background = value;
    const root = this.shadowRoot!;
    for (const swatch of root.querySelectorAll<HTMLElement>('.swatch')) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.color === value));
    }
    const hex = root.querySelector<HTMLInputElement>('#bg-hex')!;
    hex.value = value === BG_DEFAULT ? '' : value;
    hex.setAttribute('aria-invalid', 'false');
    const btn = root.querySelector<HTMLElement>('#bg-btn')!;
    btn.classList.toggle('set', value !== BG_DEFAULT);
    btn.style.setProperty('--bg-color', value === BG_DEFAULT ? 'transparent' : value);
  }

  private _setGrid(grid: MiniGrid): void {
    this._grid = { ...grid };
    const preview = this._miniPreview;
    if (preview) preview.grid = this._grid;
    const root = this.shadowRoot!;
    const btn = root.querySelector<HTMLElement>('#grid-btn')!;
    btn.setAttribute('aria-pressed', String(grid.enabled));
    btn.classList.toggle('active', grid.enabled);
    const size = root.querySelector<HTMLSelectElement>('#grid-size')!;
    size.hidden = !grid.enabled;
    size.value = String(grid.size);
  }

  /** Reset: the variables as the post set them, the background and the grid as the embed starts. */
  private _resetCanvas(): void {
    const root = this.shadowRoot!;
    const preview = root.querySelector<HTMLElement & { setCssVar: (n: string, v: string) => void }>('mini-preview');
    for (const v of this._cssVars) {
      const input = root.querySelector<HTMLElement & { value: string }>(
        `#chip-group pathogen-color-input[data-var="${v.name}"]`,
      );
      if (input) input.value = v.defaultValue;
      const chip = input?.closest('.chip') as HTMLElement | null;
      if (chip) chip.style.setProperty('--chip-color', v.defaultValue);
      if (preview) preview.setCssVar(v.name, v.defaultValue);
    }
    this._closeBackground(false);
    this._setBackground(BG_DEFAULT);
    this._setGrid({ enabled: false, size: GRID_SIZE, color: GRID_COLOR });
  }

  // --- CSS Variable Detection ---

  private _initCssVars(): void {
    const varsAttr = this.getAttribute('vars');
    if (varsAttr) {
      this._cssVars = this._parseVarsAttribute(varsAttr);
      return;
    }
    if (this._svgContent) {
      this._cssVars = this._detectCssVarsFromSvg(this._svgContent);
    }
  }

  private _parseVarsAttribute(raw: string): CssVar[] {
    return raw
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const colonIdx = pair.indexOf(':');
        if (colonIdx === -1) return null;
        const name = pair.slice(0, colonIdx).trim();
        const defaultValue = pair.slice(colonIdx + 1).trim();
        return { name, defaultValue };
      })
      .filter((v): v is CssVar => v !== null);
  }

  private _detectCssVarsFromSvg(svgContent: string): CssVar[] {
    const styleMatch = svgContent.match(/<style>([\s\S]*?)<\/style>/);
    if (!styleMatch) return [];

    const vars: CssVar[] = [];
    const propRegex = /@property\s+(--[\w-]+)\s*\{([^}]*)\}/g;
    let match;
    while ((match = propRegex.exec(styleMatch[1])) !== null) {
      const body = match[2];
      if (!body.includes('"<color>"') && !body.includes('"&lt;color&gt;"')) continue;
      const valMatch = body.match(/initial-value:\s*(#[\da-fA-F]{3,8})/);
      if (valMatch) {
        vars.push({ name: match[1], defaultValue: valMatch[1] });
      }
    }
    return vars;
  }

  // --- The code panel: <source-files> ---

  private get _viewer(): SourceFiles | null {
    return this.shadowRoot?.querySelector<SourceFiles>('source-files') ?? null;
  }

  /** The file the panel opens on: the one named, else the main; the viewer's own rule after that. */
  private _openPath(files: MiniWorkspaceFiles): string | null {
    return shownPathOf(files.files, files.open ?? files.main);
  }

  /** The text of the program that drew the image: the very file the panel shows first. */
  private _drawingText(files: MiniWorkspaceFiles): string {
    const path = this._openPath(files);
    return files.files.find((f) => f.path === path)?.text ?? '';
  }

  /** Give the panel its files: several when given, else the child `<code>` as one sample. */
  private _fillCodePanel(): void {
    const viewer = this._viewer;
    if (!viewer) return;
    if (this._files) {
      viewer.copyLabel = null;
      viewer.folders = this._files.folders;
      viewer.main = this._files.main;
      viewer.marks = this._files.marks ?? null;
      viewer.files = this._files.files;
      viewer.open = this._shownFile ?? this._openPath(this._files);
    } else {
      viewer.copyLabel = SAMPLE_COPY_LABEL;
      viewer.folders = [];
      viewer.main = null;
      viewer.marks = null;
      viewer.files = [{ path: 'main.pathogen', text: this._sourceCode, kind: 'program' }];
      viewer.open = null;
    }
  }

  /**
   * The code open or closed, whoever set the attribute: the toggle shows it, and the panel
   * loads its editor. Closed, the panel is out of the keyboard's way (nothing to copy).
   */
  private _syncCodeOpen(): void {
    const open = this.hasAttribute('code-open');
    const toggle = this.shadowRoot!.querySelector('#code-toggle');
    toggle?.classList.toggle('active', open);
    toggle?.setAttribute('aria-pressed', String(open));
    this.shadowRoot!.querySelector<HTMLElement>('.code-panel')?.toggleAttribute('inert', !open);
    if (open) this._viewer?.activate().catch(() => undefined);
  }

  private _syncPlaygroundLink(): void {
    const link = this.shadowRoot!.querySelector<HTMLElement>('.playground-link');
    if (link) link.hidden = this.hasAttribute('hide-playground-link') || this._drawingLost();
  }

  /**
   * Show one of the files in the code panel, keeping everything else (2e step 5e: the
   * review modal's changes box opens the files it names). A path not among the
   * files (a removed one) changes nothing. Setting `sourceFiles` again forgets it,
   * so call this after.
   */
  openFile(path: string): void {
    if (!this._files?.files.some((f) => f.path === path)) return;
    // The drawing's program stays what it is (Open in Playground, the size): only the panel moves.
    this._shownFile = path;
    if (this._viewer) this._viewer.open = path;
  }

  /** The program that drew the image couldn't be read (2e step 5d): there's no code to open in the playground. */
  private _drawingLost(): boolean {
    if (!this._files) return false;
    const path = this._openPath(this._files);
    return this._files.files.find((f) => f.path === path)?.unreadable === true;
  }

  // --- "Open in Playground" ---

  private _getImportState(): ImportState {
    const commentLines = this._sourceCode
      .split('\n')
      .filter((l) => l.trim().startsWith('//'))
      .map((l) => l.replace(/^\/\/\s*/, '').trim())
      .filter((l) => l && !l.startsWith('viewBox'));
    return {
      code: this._sourceCode,
      w: this._width,
      h: this._height,
      title: commentLines[0] || '',
      desc: this.getAttribute('caption') || '',
    };
  }

  private _handlePlaygroundClick(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    const state = this._getImportState();
    const key = `mw-import-${Date.now()}`;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full */
    }
    window.open(`/workspace/new?import=${encodeURIComponent(key)}`, '_blank');
  }

  // --- Inspector ---

  private _extractMetadata(svgEl: Element): void {
    const metaScript = svgEl.querySelector('script#pathogen-metadata');
    if (metaScript?.textContent) {
      try {
        this._inspectorMetadata = JSON.parse(metaScript.textContent);
      } catch {
        // Invalid metadata JSON
      }
    }
  }

  private async _openInspector(): Promise<void> {
    if (this._inspectorOpen) return;
    // Claim the slot synchronously so a second toggle-inspector fired during
    // the dynamic import can't race past this guard and create a duplicate panel.
    this._inspectorOpen = true;

    await import('../inspector-panel.js');

    this._inspectorEl = document.createElement('inspector-panel') as HTMLElement & {
      setData(data: Record<string, unknown>): void;
    };
    this._inspectorEl.classList.add('fullscreen-overlay', 'open');
    this.shadowRoot!.appendChild(this._inspectorEl);
    // Pass metadata if we have it; otherwise hand over empty defaults so the
    // panel renders its frame without crashing on missing sub-sections.
    this._inspectorEl.setData(
      this._inspectorMetadata ?? { layers: [], masks: [], clipPaths: [], gradients: [], cssProperties: [] },
    );

    this._inspectorEl.addEventListener('toggle-inspector', () => this._closeInspector());

    this._inspectorEl.addEventListener('layer-visibility-change', ((e: CustomEvent) => {
      const { name, visible } = e.detail;
      const preview = this.shadowRoot!.querySelector('mini-preview') as
        | (HTMLElement & { setLayerVisibility?(n: string, v: boolean): void })
        | null;
      // The compiled SVG lives inside the iframe document, not the shadow
      // root — `mini-preview.setLayerVisibility` forwards the toggle across
      // the iframe boundary. The pre-iframe code path queried the shadow
      // root directly and silently no-op'd after the security migration.
      preview?.setLayerVisibility?.(name, visible !== false);
    }) as EventListener);

    this._inspectorEl.addEventListener('cssvar-override', ((e: CustomEvent) => {
      const { varName, value } = e.detail;
      const preview = this.shadowRoot!.querySelector('mini-preview') as
        | (HTMLElement & { setCssVar?(n: string, v: string): void; removeCssVar?(n: string): void })
        | null;
      if (preview) {
        if (value && preview.setCssVar) preview.setCssVar(varName, value);
        else if (preview.removeCssVar) preview.removeCssVar(varName);
      }
    }) as EventListener);

    this._inspectorKeydownHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this._inspectorOpen && this._isPreviewFullscreen) {
        e.stopPropagation();
        this._closeInspector();
      }
    };
    document.addEventListener('keydown', this._inspectorKeydownHandler, true);
  }

  private _closeInspector(): void {
    if (!this._inspectorOpen) return;
    if (this._inspectorEl) {
      this._inspectorEl.remove();
      this._inspectorEl = null;
    }
    if (this._inspectorKeydownHandler) {
      document.removeEventListener('keydown', this._inspectorKeydownHandler, true);
      this._inspectorKeydownHandler = null;
    }
    this._inspectorOpen = false;
  }

  // --- Summary (details-style) open/close + events ---

  private _toggleBar(open?: boolean): void {
    const currentlyOpen = this.classList.contains('bar-open');
    const next = open === undefined ? !currentlyOpen : open;
    const summary = this.shadowRoot!.querySelector('#summary') as HTMLElement | null;

    if (next) {
      this.classList.add('bar-open');
      summary?.setAttribute('aria-expanded', 'true');
      // .bar-fully-open toggled in transitionend
    } else {
      // The bar folds: Background's popover goes with it, or one waiting to open (step 9c).
      this._bgPending = false;
      this._closeBackground(false);
      this.classList.remove('bar-fully-open'); // hide overflow immediately
      this.classList.remove('bar-open');
      summary?.setAttribute('aria-expanded', 'false');
    }
  }

  private setupEventListeners(): void {
    const summary = this.shadowRoot!.querySelector('#summary');
    const bar = this.shadowRoot!.querySelector('#glass-bar') as HTMLElement | null;

    // Background, Grid and Reset (step 9c).
    this._wireCanvasControls();

    // Click the summary row to toggle the glass-bar.
    if (summary) {
      summary.addEventListener('click', () => this._toggleBar());
    }

    // Stop clicks inside the bar from bubbling to the summary and re-collapsing.
    if (bar) {
      bar.addEventListener('click', (e) => e.stopPropagation());

      this._onBarTransitionEnd = (e: TransitionEvent): void => {
        if (e.propertyName !== 'height') return;
        if (this.classList.contains('bar-open')) {
          this.classList.add('bar-fully-open');
          // Background pressed while the bar unfolded (step 9c).
          if (this._bgPending) {
            this._bgPending = false;
            this._openBackground();
          }
        }
      };
      bar.addEventListener('transitionend', this._onBarTransitionEnd as EventListener);
    }

    // Code toggle (inside glass-bar)
    const codeToggle = this.shadowRoot!.querySelector('#code-toggle');
    if (codeToggle) {
      // The attribute's change does the rest (_syncCodeOpen).
      codeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAttribute('code-open');
      });
    }

    // Playground launch
    const playgroundLink = this.shadowRoot!.querySelector('.playground-link');
    if (playgroundLink) {
      playgroundLink.addEventListener('click', (e: Event) => this._handlePlaygroundClick(e));
    }

    // Fullscreen button — delegates to mini-preview's internal toggle so the
    // existing attachFullscreenBehavior() wiring still owns the state machine.
    const fsBtn = this.shadowRoot!.querySelector('#fullscreen-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mp = this.shadowRoot!.querySelector('mini-preview') as HTMLElement | null;
        const previewFsBtn = mp?.shadowRoot?.querySelector('#fullscreen-toggle') as HTMLButtonElement | null;
        previewFsBtn?.click();
      });
    }

    // Inspector toggle + fullscreen tracking — listens on mini-preview.
    const miniPreview = this.shadowRoot!.querySelector('mini-preview');
    if (miniPreview) {
      miniPreview.addEventListener('toggle-inspector', () => {
        if (this._inspectorOpen) this._closeInspector();
        else this._openInspector();
      });

      miniPreview.addEventListener('fullscreen-change', ((e: CustomEvent) => {
        this._isPreviewFullscreen = e.detail.fullscreen;
        // Any fullscreen transition (enter or exit) dismisses the inspector.
        //   • Exit: the panel is `position: fixed` with z-index 10000, so
        //     when the mini-preview's host shrinks back from fullscreen the
        //     panel orphans at viewport top-right. Close it.
        //   • Enter: ensure we start with a clean state — relevant when
        //     this instance left the inspector open from a prior fullscreen
        //     session, and broadcast so sibling mini-workspaces in the same
        //     blog post also close their inspectors (otherwise a sibling's
        //     stale panel floats over this fresh fullscreen view).
        document.dispatchEvent(
          new CustomEvent('mini-workspace-close-inspector', { bubbles: false }),
        );
      }) as EventListener);
    }

    // Listen for the broadcast so OTHER instances' fullscreen transitions
    // close this instance's inspector. Stored on the instance so
    // disconnectedCallback can remove the listener.
    this._crossInstanceCloseHandler = (): void => {
      if (this._inspectorOpen) this._closeInspector();
    };
    document.addEventListener('mini-workspace-close-inspector', this._crossInstanceCloseHandler);

    // Chip group (present if vars were detected synchronously)
    this._wireChipGroup();
  }

  private render(): void {
    const rawCaption = this.getAttribute('caption');
    // escapeHtml already handles &<> — caption is rendered as text in <h2>.
    const caption = escapeHtml(rawCaption || DEFAULT_CAPTION);
    const codeOpen = this.hasAttribute('code-open');
    const chipGroupInner = this._renderChipGroupInner();

    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          margin: 1.5rem 0;
          height: 60dvh;
          min-height: 50dvh;
          max-height: 80dvh;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-lg, 12px);
          overflow: hidden;
          background: var(--bg-elevated, #ffffff);
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
          position: relative;
          overflow: visible;
        }

        /* --- Summary (always visible, 28px, click to toggle glass-bar) --- */
        .mw-summary {
          all: unset;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 14px 0 10px;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          background: var(--bg-elevated, #ffffff);
          cursor: pointer;
          flex-shrink: 0;
          user-select: none;
          transition: background var(--transition-base, 0.15s ease);
        }
        .mw-summary:hover { background: var(--bg-tertiary, #f0f1f2); }
        .mw-summary:focus { outline: none; }
        .mw-summary:focus-visible { outline: none; }

        .chevron {
          width: 14px; height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary, #94a3b8);
          transform: rotate(0deg);
          transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
                      color var(--transition-base, 0.15s ease);
          flex-shrink: 0;
        }
        .mw-summary:hover .chevron { color: var(--text-secondary, #64748b); }
        :host(.bar-open) .chevron {
          transform: rotate(90deg);
          color: var(--accent-color, #10b981);
        }
        .chevron svg { width: 10px; height: 10px; stroke-width: 2.4; }

        .mw-title {
          margin: 0;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary, #1a1a2e);
          letter-spacing: 0.01em;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }

        /* --- Glass bar: in-flow, height-animated 0 → 44px --- */
        .glass-bar {
          flex-shrink: 0;
          position: relative;
          z-index: 5;
          height: 0;
          overflow: hidden;
          background: color-mix(in srgb, var(--bg-elevated, #ffffff) 82%, transparent);
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          border-bottom: 1px solid transparent;
          transition: height 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
                      border-bottom-color 0.22s ease;
        }
        :host(.bar-open) .glass-bar {
          height: 44px;
          border-bottom-color: var(--border-color, #e2e8f0);
        }
        /* After the height transition completes, overflow opens so dropdown
           tooltips can escape the bar's bounds. */
        :host(.bar-fully-open) .glass-bar { overflow: visible; }

        .glass-bar-inner {
          display: flex;
          align-items: center;
          height: 44px;
          padding: 0 10px;
          gap: 6px;
        }

        /* Icon buttons inside the bar */
        .icon-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          background: transparent;
          border: 0;
          border-radius: var(--radius-sm, 4px);
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
          transition: all var(--transition-base, 0.15s ease);
          position: relative;
        }
        .icon-btn:hover {
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
          color: var(--accent-color, #10b981);
        }
        .icon-btn.active {
          background: var(--accent-subtle, rgba(16, 185, 129, 0.1));
          color: var(--accent-color, #10b981);
        }
        .icon-btn svg {
          width: 14px;
          height: 14px;
          stroke-width: 1.8;
        }

        /* Tooltips on icon buttons */
        .icon-btn[data-tip]::after {
          content: attr(data-tip);
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%) translateY(-4px);
          font-size: 0.625rem;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-primary, #1a1a2e);
          background: var(--bg-elevated, #ffffff);
          border: 1px solid var(--border-color, #e2e8f0);
          padding: 3px 8px;
          white-space: nowrap;
          border-radius: var(--radius-sm, 4px);
          opacity: 0;
          pointer-events: none;
          transition: all var(--transition-base, 0.15s ease);
          z-index: 10;
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
        }
        .icon-btn:hover[data-tip]::after {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        /* Right-aligned variant — avoids clipping when button is at the bar edge */
        .icon-btn[data-tip-align="right"]::after {
          left: auto;
          right: 0;
          transform: translateX(0) translateY(-4px);
        }
        .icon-btn[data-tip-align="right"]:hover::after {
          transform: translateX(0) translateY(0);
        }
        /* Left-aligned variant — same, for the leftmost button */
        .icon-btn[data-tip-align="left"]::after {
          left: 0;
          right: auto;
          transform: translateX(0) translateY(-4px);
        }
        .icon-btn[data-tip-align="left"]:hover::after {
          transform: translateX(0) translateY(0);
        }

        .glass-divider {
          width: 1px;
          height: 16px;
          background: var(--border-color, #e2e8f0);
          margin: 0 4px;
          flex-shrink: 0;
        }

        /* Background and Grid (2d, step 9c; mockup v7 screen W): labelled buttons in the bar. */
        /* Not positioned: Background's popover is placed against the bar itself (.glass-bar),
           so a bar that scrolls sideways on a narrow screen doesn't cut it off. */
        .bg-control,
        .grid-control {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .icon-btn.bar-chip {
          width: auto;
          gap: 6px;
          padding: 0 8px 0 6px;
          font-size: 0.75rem;
          white-space: nowrap;
        }
        .bar-chip .bg-swatch {
          width: 14px;
          height: 14px;
          border-radius: 3px;
          background: var(--bg-color, transparent);
          box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0);
          flex-shrink: 0;
        }
        #grid-size {
          height: 24px;
          padding: 0 4px;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          background: var(--bg-elevated, #ffffff);
          color: var(--text-primary, #1a1a2e);
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-size: 0.6875rem;
        }
        #grid-size[hidden] { display: none; }

        /* Background's popover: five swatches, a hex value, and Default. */
        .bg-popover {
          position: absolute;
          top: calc(100% + 6px);
          left: var(--popover-left, 10px);
          z-index: 20;
          width: 220px;
          box-sizing: border-box;
          padding: 10px 12px 12px;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-elevated, #ffffff);
          box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.16));
        }
        .bg-popover[hidden] { display: none; }
        .bg-popover-title {
          margin-bottom: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary, #1a1a2e);
        }
        .swatches {
          display: grid;
          grid-template-columns: repeat(5, 28px);
          gap: 6px;
          margin-bottom: 10px;
        }
        .swatch {
          width: 28px;
          height: 28px;
          padding: 0;
          border: 0;
          border-radius: var(--radius-sm, 4px);
          background: var(--swatch);
          box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0);
          cursor: pointer;
        }
        .swatch[aria-pressed='true'] {
          box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0), 0 0 0 2px var(--bg-elevated, #ffffff),
                      0 0 0 4px var(--secondary-accent, #9461c4);
        }
        .swatch:focus-visible {
          outline: 2px solid var(--secondary-accent, #9461c4);
          outline-offset: 2px;
        }
        .bg-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
        }
        #bg-hex {
          min-width: 0;
          height: 28px;
          box-sizing: border-box;
          padding: 0 8px;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: var(--radius-sm, 4px);
          background: var(--bg-primary, #ffffff);
          color: var(--text-primary, #1a1a2e);
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-size: 0.75rem;
        }
        #bg-hex[aria-invalid='true'] {
          border-color: var(--error-color, #ef4444);
        }
        .link-btn {
          padding: 0;
          border: 0;
          background: none;
          font: inherit;
          font-size: 0.75rem;
          color: var(--secondary-accent-text, #5e3590);
          cursor: pointer;
        }
        .link-btn:hover { text-decoration: underline; }

        /* A narrow embed: the bar scrolls sideways rather than the page. */
        @media (max-width: 600px) {
          .glass-bar-inner {
            overflow-x: auto;
            scrollbar-width: none;
          }
        }

        /* Per-CSS-var color chips */
        .chip-group {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 8px 0 4px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          cursor: pointer;
          position: relative;
          transition: background var(--transition-base, 0.15s ease);
        }
        .chip:hover {
          background: var(--bg-tertiary, #f0f1f2);
        }
        .chip .dot {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--chip-color, transparent);
          box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0),
                      0 0 0 2px transparent;
          transition: box-shadow var(--transition-base, 0.15s ease);
          flex-shrink: 0;
        }
        .chip:hover .dot,
        .chip:focus-within .dot {
          box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0),
                      0 0 0 2px var(--accent-color, #10b981);
        }
        .chip .chip-label {
          font-family: var(--font-mono, 'Inconsolata', monospace);
          font-size: 0.6875rem;
          color: var(--text-secondary, #64748b);
          letter-spacing: 0;
          white-space: nowrap;
        }
        .chip:hover .chip-label {
          color: var(--text-primary, #1a1a2e);
        }
        .chip pathogen-color-input {
          opacity: 0;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          padding: 0;
          margin: 0;
          border: 0;
          cursor: pointer;
        }

        /* Playground button — accent fill, always rightmost */
        .icon-btn.playground {
          background: var(--accent-color, #10b981);
          color: var(--accent-text, #ffffff);
          position: absolute;
          right: -0.6rem;
          top: 0.8rem;
          z-index: 25;
        }
        .icon-btn.playground:hover {
          background: var(--accent-hover, #059669);
          color: var(--accent-text, #ffffff);
        }

        /* Content area */
        .content-area {
          display: grid;
          grid-template-columns: 0fr 1fr;
          grid-template-rows: 1fr;
          transition: grid-template-columns 0.3s ease;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        :host([code-open]) .content-area {
          grid-template-columns: 1fr 1fr;
        }

        /* Code panel */
        .code-panel {
          overflow: hidden;
          min-width: 0;
          border-right: 1px solid var(--border-color, #e2e8f0);
          display: flex;
          flex-direction: column;
          position: relative;
        }

        source-files {
          flex: 1;
          min-height: 0;
        }
        .playground-link[hidden] { display: none; }

        /* Preview panel */
        .preview-panel {
          min-width: 0;
          min-height: 0;
          overflow: visible;
          position: relative;
        }
        mini-preview {
          width: 100%;
          height: 100%;
        }

        /* Responsive */
        @media (max-width: 768px) {
          :host([code-open]) .content-area {
            grid-template-columns: 1fr;
            grid-template-rows: 200px 1fr;
          }
          .code-panel {
            border-right: none;
            border-bottom: 1px solid var(--border-color, #e2e8f0);
          }
          /* Stacked, the code meets the embed's corner: its copy icon steps left of the ↗. */
          :host(:not([hide-playground-link])) source-files {
            --source-files-float-right: 30px;
          }
        }
      </style>

      <button class="mw-summary" id="summary" type="button" aria-expanded="false" aria-controls="glass-bar">
        <span class="chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 6l6 6-6 6"/></svg>
        </span>
        <h2 class="mw-title">${caption}</h2>
      </button>

      <button class="icon-btn playground playground-link" type="button" data-tip="Open in playground workspace" data-tip-align="right" aria-label="Open in playground workspace">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>
      </button>

      <div class="glass-bar" id="glass-bar">
        <div class="glass-bar-inner">
          <button class="icon-btn${codeOpen ? ' active' : ''}" id="code-toggle" type="button" data-tip="Toggle code" data-tip-align="left" aria-pressed="${codeOpen}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3"/></svg>
          </button>

          <span class="chip-group" id="chip-group">${chipGroupInner}</span>

          <span class="glass-divider"></span>
          ${this._renderCanvasControls()}

          <span class="glass-divider"></span>
          <button class="icon-btn" id="fullscreen-btn" type="button" data-tip="Fullscreen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
          </button>
        </div>
      </div>

      <div class="content-area">
        <div class="code-panel"${codeOpen ? '' : ' inert'}>
          <source-files></source-files>
        </div>
        <div class="preview-panel">
          <mini-preview></mini-preview>
        </div>
      </div>
    `;
  }
}

customElements.define('mini-workspace', MiniWorkspace);
