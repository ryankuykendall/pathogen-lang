import { store } from '../state/store.js';
import type { CompileWarning, LayerOutput, LogEntry } from '../types/compiler.js';

/**
 * Per-section cap on captured rows. A program that fillets every glyph
 * contour emitted ~5,000 warnings plus their log mirrors on 2026-09-05; the
 * capture became a 10,000-line paste that nobody could read. Each section
 * keeps its first rows and ends with a count of what was left out.
 */
export const CAPTURE_LINE_LIMIT = 200;

export function buildDebugCapture(): string {
  const state = store.getAll();

  const timestamp = new Date().toISOString();
  const workspace = state.workspaceName || 'unsaved';
  const code = state.code || '';
  const status = state.compilationStatus || 'idle';
  const rawError = state.compilationError || 'none';
  // Format multi-line errors as markdown list for proper rendering
  const errorLines = rawError.split('\n').filter((l: string) => l.trim());
  const error = errorLines.length > 1
    ? '\n' + errorLines.map((l: string) => `- ${l}`).join('\n')
    : rawError;
  const toFixed = state.toFixed != null ? state.toFixed : 'off';
  const layers = (state.layers || []) as LayerOutput[];
  const layerVisibility = (state.layerVisibility || {}) as Record<string, boolean>;
  const logs = (state.logs || []) as LogEntry[];
  const warnings = (state.warnings || []) as CompileWarning[];
  const calledFunctions = (state.calledStdlibFunctions || []).join(', ') || 'none';

  // Build layers table
  let layersTable = '| # | Name | Type | Visible | Styles |\n|---|------|------|---------|--------|\n';
  let layerDetails = '';

  for (let i = 0; i < Math.min(layers.length, CAPTURE_LINE_LIMIT); i++) {
    const layer = layers[i];
    const visible = layerVisibility[layer.name] !== false ? 'yes' : 'no';
    const styleEntries = Object.entries(layer.styles || {});
    const stylesStr = styleEntries.length > 0 ? styleEntries.map(([k, v]) => `${k}: ${v}`).join(', ') : '(defaults)';

    layersTable += `| ${i} | ${layer.name} | ${layer.type} | ${visible} | ${stylesStr} |\n`;

    layerDetails += `\n### Layer ${i}: ${layer.name} (${layer.type})\n`;
    if (layer.type === 'text' && layer.textElements) {
      layerDetails += '```\n';
      for (const el of layer.textElements) {
        layerDetails += `<text>${el.children?.map((c: { text?: string }) => c.text || '').join('') || ''}</text>\n`;
      }
      layerDetails += '```\n';
    } else {
      layerDetails += `\`\`\`\n${layer.data || '(empty)'}\n\`\`\`\n`;
    }
  }

  if (layers.length > CAPTURE_LINE_LIMIT) {
    const omitted = layers.length - CAPTURE_LINE_LIMIT;
    layersTable += `| … | ${omitted} more layers (${layers.length} total) | | | |\n`;
    layerDetails += `\n(… ${omitted} more layers not shown)\n`;
  }

  if (layers.length === 0) {
    layersTable += '| - | (none) | - | - | - |\n';
    layerDetails = '\n(No layers produced)\n';
  }

  // Build log output
  // Warning mirrors are listed (grouped) under Warnings; keep only real log() output here.
  const plainLogs = logs.filter((entry) => entry.severity !== 'warn');
  const mirrored = logs.length - plainLogs.length;
  let logOutput = '';
  if (plainLogs.length > 0) {
    for (const entry of plainLogs.slice(0, CAPTURE_LINE_LIMIT)) {
      const prefix = entry.line != null ? `[line ${entry.line}] ` : '';
      const parts = (entry.parts || [])
        .map((p: { label?: string; value: string }) => {
          if (p.label) return `${p.label}: ${p.value}`;
          return p.value;
        })
        .join(' ');
      logOutput += `${prefix}${parts}\n`;
    }
    if (plainLogs.length > CAPTURE_LINE_LIMIT) {
      logOutput += `… ${plainLogs.length - CAPTURE_LINE_LIMIT} more (${plainLogs.length} total)\n`;
    }
  } else {
    logOutput = '(no log output)\n';
  }
  if (mirrored > 0) logOutput += `(${mirrored} warning mirror${mirrored === 1 ? '' : 's'} omitted — see Warnings)\n`;

  // One row per family (code + position + message with numbers removed), with
  // its count — the same grouping the console, CLI, and LSP use.
  const groupFn = window.PathogenLang?.groupWarnings;
  const groups: { first: CompileWarning; count: number }[] = groupFn
    ? groupFn(warnings)
    : warnings.map((w) => ({ first: w, count: 1 }));
  const warningLines = groups.slice(0, CAPTURE_LINE_LIMIT).map((g) => {
    const w = g.first;
    const where = w.line != null ? ` line ${w.line}${w.column != null ? `:${w.column}` : ''}` : '';
    const times = g.count > 1 ? ` (×${g.count.toLocaleString('en-US')})` : '';
    return `- [${w.code}]${where} ${w.message}${times}`;
  });
  if (groups.length > CAPTURE_LINE_LIMIT) {
    warningLines.push(`- … ${groups.length - CAPTURE_LINE_LIMIT} more families (${warnings.length} warnings total)`);
  }
  const warningOutput = warnings.length > 0 ? `${warningLines.join('\n')}\n` : '(no warnings)\n';

  return `# Debug Capture

**Timestamp:** ${timestamp}
**Workspace:** ${workspace}

## Issue
<!-- Describe the problem you're seeing -->

## Source Code
\`\`\`svg-path
${code}
\`\`\`

## Compilation
**Status:** ${status}
**Error:** ${error}
**Precision (toFixed):** ${toFixed}

## Layers
${layersTable}
${layerDetails}
## Warnings
${warningOutput}
## Log Output
\`\`\`
${logOutput}\`\`\`

## Canvas Settings
- Width: ${state.width}, Height: ${state.height}
- Background: ${state.background}
- Grid: ${state.gridEnabled ? 'enabled' : 'disabled'}, ${state.gridSize}px, ${state.gridColor}

## Called Functions
${calledFunctions}

---

## Diagnostic Prompt

You are analyzing a debug capture from pathogen-lang, a TypeScript
compiler that extends SVG path syntax with variables, expressions, control
flow, functions, multi-layer output, and text elements.

Key language concepts:
- Path commands (M, L, H, V, C, S, Q, T, A, Z) produce SVG path data
- \`calc()\` is required for math in path arguments; plain identifiers work
  for simple variable references
- \`layer\` blocks define named layers with style overrides; \`apply\` routes
  commands to layers
- \`text\`/\`tspan\` statements produce \`<text>\` SVG elements
- Context-aware functions (polarPoint, arcFromCenter, etc.) read pen position
- \`log()\` outputs debug values during compilation

The capture above contains the source code, compilation results, layer data,
log output, and canvas settings from the playground.

Please analyze:
1. If there's a compilation error, explain the root cause and suggest a fix
2. If the output looks wrong, trace the evaluation to identify where it
   diverges from expectations
3. Check for common issues: incorrect pen position, missing Z closepath,
   wrong arc flags, layer style conflicts, variable scoping, calc() missing
   in path arguments

The user's specific question:
<!-- Replace this with your question -->
`;
}
