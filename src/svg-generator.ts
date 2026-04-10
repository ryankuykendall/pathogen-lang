/**
 * Generate a complete SVG string from a CompileResult.
 * Shared by CLI and VS Code preview panel.
 */

import { renderConicToWedges } from './conic-renderer';
import type { CompileResult } from '.';

export interface SvgGeneratorOptions {
  viewBox?: string;
  width?: string;
  height?: string;
  stroke?: string;
  fill?: string;
  strokeWidth?: string;
  includeMetadata?: boolean;
}

function escapeXml(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function generateSvg(result: CompileResult, options: SvgGeneratorOptions = {}): string {
  const viewBox = options.viewBox || '0 0 200 200';
  const width = options.width || '200';
  const height = options.height || '200';
  const defaultStroke = options.stroke || '#000';
  const defaultFill = options.fill || 'none';
  const defaultStrokeWidth = options.strokeWidth || '2';

  function renderLayerElement(layer: (typeof result.layers)[0], indent: string): string {
    const idAttr = layer.name && !layer.isDefault ? ` id="${escapeXml(layer.name)}"` : '';

    if (layer.type === 'group') {
      const attrs = Object.entries(layer.styles).map(([k, v]) => `${k}="${escapeXml(String(v))}"`);
      if (layer.transform) attrs.push(`transform="${escapeXml(layer.transform)}"`);
      const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
      const children = (layer.children || []).map((c) => renderLayerElement(c, `${indent}  `)).join('\n');
      if (children) {
        return `${indent}<g${idAttr}${attrStr}>\n${children}\n${indent}</g>`;
      }
      return `${indent}<g${idAttr}${attrStr}/>`;
    }
    if (layer.type === 'text' && layer.textElements) {
      return layer.textElements
        .map((te, i) => {
          const mergedStyles = te.styles ? { ...layer.styles, ...te.styles } : layer.styles;
          const attrs = Object.entries(mergedStyles)
            .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
            .join(' ');
          const teIdAttr = i === 0 ? idAttr : '';
          const transform =
            te.rotation != null ? ` transform="rotate(${radToDeg(te.rotation)}, ${te.x}, ${te.y})"` : '';
          const content = te.children
            .map((child) => {
              if (child.type === 'run') return escapeXml(child.text);
              const spAttrs = [
                child.dx != null ? `dx="${child.dx}"` : '',
                child.dy != null ? `dy="${child.dy}"` : '',
                child.rotation != null ? `rotate="${radToDeg(child.rotation)}"` : '',
                ...Object.entries(child.styles || {}).map(([k, v]) => `${k}="${escapeXml(String(v))}"`),
              ]
                .filter(Boolean)
                .join(' ');
              return `<tspan${spAttrs ? ` ${spAttrs}` : ''}>${escapeXml(child.text)}</tspan>`;
            })
            .join('');
          return `${indent}<text${teIdAttr} x="${te.x}" y="${te.y}"${transform}${attrs ? ` ${attrs}` : ''}>${content}</text>`;
        })
        .join('\n');
    }
    if (layer.type === 'fragment') {
      const parts: string[] = [];
      if (layer.fragmentDefs) parts.push(layer.fragmentDefs);
      if (layer.fragmentVisuals) parts.push(layer.fragmentVisuals);
      return parts.join('\n');
    }
    const stroke = layer.styles.stroke || defaultStroke;
    const fill = layer.styles.fill || defaultFill;
    const strokeWidth = layer.styles['stroke-width'] || defaultStrokeWidth;
    const handled = new Set(['stroke', 'fill', 'stroke-width']);
    const extraAttrs = Object.entries(layer.styles)
      .filter(([key]) => !handled.has(key))
      .map(([key, value]) => `${key}="${escapeXml(String(value))}"`)
      .join(' ');
    const extra = extraAttrs ? ` ${extraAttrs}` : '';
    const transformAttr = layer.transform ? ` transform="${escapeXml(layer.transform)}"` : '';
    return `${indent}<path${idAttr} d="${escapeXml(layer.data)}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${escapeXml(strokeWidth)}"${extra}${transformAttr}/>`;
  }

  const elements = result.layers.map((layer) => renderLayerElement(layer, '  ')).join('\n');

  // Build defs section
  const defsContent: string[] = [];
  for (const mask of result.masks) {
    const children = mask.elements
      .map((el) => {
        const styleAttrs = Object.entries(el.styles)
          .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
          .join(' ');
        return `    <path d="${escapeXml(el.pathData)}"${styleAttrs ? ` ${styleAttrs}` : ''}/>`;
      })
      .join('\n');
    defsContent.push(`  <mask id="${escapeXml(mask.id)}">\n${children}\n  </mask>`);
  }
  for (const clip of result.clipPaths) {
    const children = clip.elements.map((el) => `    <path d="${escapeXml(el.pathData)}"/>`).join('\n');
    defsContent.push(`  <clipPath id="${escapeXml(clip.id)}">\n${children}\n  </clipPath>`);
  }
  for (const grad of result.gradients) {
    if (grad.type === 'conic') {
      const svgW = parseInt(width, 10) || 200;
      const svgH = parseInt(height, 10) || 200;
      const wedges = renderConicToWedges(
        grad.cx ?? 0, grad.cy ?? 0,
        grad.from ?? 0, grad.to ?? 2 * Math.PI,
        grad.direction ?? 'cw', grad.spread ?? 'clamp',
        grad.stopsWithOklch ?? grad.stops, svgW, svgH,
      );
      const children = wedges.map((w) => `    <path d="${w.d}" fill="${escapeXml(w.fill)}"/>`).join('\n');
      defsContent.push(
        `  <pattern id="${escapeXml(grad.id)}" x="0" y="0" width="${svgW}" height="${svgH}" patternUnits="userSpaceOnUse">\n${children}\n  </pattern>`,
      );
      continue;
    }
    if (grad.type === 'mesh' || grad.type === 'freeform' || grad.type === 'topo') {
      let svgW: number, svgH: number;
      if (grad.type === 'mesh') { svgW = grad.meshWidth ?? 200; svgH = grad.meshHeight ?? 200; }
      else if (grad.type === 'freeform') { svgW = grad.freeformWidth ?? 200; svgH = grad.freeformHeight ?? 200; }
      else { svgW = grad.topoWidth ?? 200; svgH = grad.topoHeight ?? 200; }
      let avgColor = '#808080';
      if (grad.type === 'topo') {
        if (grad.topoBaseColor) avgColor = grad.topoBaseColor;
        else { const contours = grad.topoContours ?? []; if (contours.length > 0) avgColor = contours[0].color; }
      } else {
        const points = grad.type === 'mesh' ? (grad.meshGrid ?? []).flat() : (grad.freeformPoints ?? []);
        if (points.length > 0) avgColor = points[0].color;
      }
      defsContent.push(
        `  <pattern id="${escapeXml(grad.id)}" x="0" y="0" width="${svgW}" height="${svgH}" patternUnits="userSpaceOnUse">\n    <rect width="${svgW}" height="${svgH}" fill="${escapeXml(avgColor)}"/>\n  </pattern>`,
      );
      continue;
    }
    const tagName = grad.type === 'linear' ? 'linearGradient' : 'radialGradient';
    const attrParts = [`id="${escapeXml(grad.id)}"`];
    for (const [key, value] of Object.entries(grad.attrs)) {
      attrParts.push(`${key}="${escapeXml(value)}"`);
    }
    if (grad.spreadMethod) attrParts.push(`spreadMethod="${escapeXml(grad.spreadMethod)}"`);
    if (grad.gradientUnits) attrParts.push(`gradientUnits="${escapeXml(grad.gradientUnits)}"`);
    if (grad.gradientTransform) attrParts.push(`gradientTransform="${escapeXml(grad.gradientTransform)}"`);
    if (grad.colorInterpolation) attrParts.push(`color-interpolation="${escapeXml(grad.colorInterpolation)}"`);
    if (grad.href) attrParts.push(`href="#${escapeXml(grad.href)}"`);
    if (grad.stops.length === 0) {
      defsContent.push(`  <${tagName} ${attrParts.join(' ')}/>`);
    } else {
      const stops = grad.stops
        .map((s) => `    <stop offset="${s.offset}" stop-color="${escapeXml(s.color)}"/>`)
        .join('\n');
      defsContent.push(`  <${tagName} ${attrParts.join(' ')}>\n${stops}\n  </${tagName}>`);
    }
  }
  if (result.patterns) {
    for (const pat of result.patterns) {
      const attrParts = [
        `id="${escapeXml(pat.id)}" x="${pat.x}" y="${pat.y}" width="${pat.width}" height="${pat.height}"`,
      ];
      if (pat.patternUnits) attrParts.push(`patternUnits="${escapeXml(pat.patternUnits)}"`);
      if (pat.patternTransform) attrParts.push(`patternTransform="${escapeXml(pat.patternTransform)}"`);
      if (pat.patternContentUnits) attrParts.push(`patternContentUnits="${escapeXml(pat.patternContentUnits)}"`);
      const children = pat.elements
        .map((el) => {
          const styleStr = Object.entries(el.styles)
            .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
            .join(' ');
          return `    <path d="${escapeXml(el.pathData)}"${styleStr ? ` ${styleStr}` : ''}/>`;
        })
        .join('\n');
      defsContent.push(`  <pattern ${attrParts.join(' ')}>\n${children}\n  </pattern>`);
    }
  }
  const defsSection = defsContent.length > 0 ? `\n<defs>\n${defsContent.join('\n')}\n</defs>\n` : '';

  // Build @property style block
  let styleSection = '';
  if (result.cssProperties && result.cssProperties.length > 0) {
    const rules = result.cssProperties
      .map(
        (prop) =>
          `    @property ${prop.name} {\n      syntax: "${prop.syntax}";\n      inherits: ${prop.inherits};\n      initial-value: ${prop.initialValue};\n    }`,
      )
      .join('\n');
    styleSection = `\n  <style><![CDATA[\n${rules}\n  ]]></style>`;
  }

  // Optional inspector metadata
  let metadataSection = '';
  if (options.includeMetadata) {
    const stripLayerData = (layer: (typeof result.layers)[0]): Record<string, unknown> => {
      const { data: _d, fragmentDefs: _fd, fragmentVisuals: _fv, textElements: _te, children, ...rest } = layer;
      if (children) return { ...rest, children: children.map(stripLayerData) };
      return rest;
    };
    const metadata = {
      layers: result.layers.map(stripLayerData),
      masks: result.masks,
      clipPaths: result.clipPaths,
      gradients: result.gradients,
      cssProperties: result.cssProperties,
    };
    metadataSection = `\n<script type="application/json" id="pathogen-metadata"><![CDATA[${JSON.stringify(metadata)}]]></script>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(viewBox)}" width="${escapeXml(width)}" height="${escapeXml(height)}">${styleSection}
${defsSection}
${elements}${metadataSection}
</svg>`;
}
