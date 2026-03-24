// Gradient Rendering Service
// Orchestrates WebGPU rendering with Canvas 2D fallback and LRU caching.

import type { GradientOutput, GradientStop } from '../types/compiler.js';
import { getConicPipeline } from './conic-pipeline.js';
import { getFreeformPipeline } from './freeform-pipeline.js';
import { COLOR_POINT_STRIDE, FREEFORM_PARAMS_SIZE } from './freeform-shader.js';
import { getMeshPipeline } from './mesh-pipeline.js';
import { MESH_PARAMS_SIZE, MESH_VERTEX_STRIDE } from './mesh-shader.js';
import { flattenToSegments } from './svg-path-parser.js';
import { hashGradient, TextureCache } from './texture-cache.js';
import { getTopoLaplacePipeline } from './topo-laplace-pipeline.js';
import {
  LAPLACE_INIT_PARAMS_SIZE,
  LAPLACE_JACOBI_PARAMS_SIZE,
  LAPLACE_RENDER_PARAMS_SIZE,
} from './topo-laplace-shader.js';
import { getTopoPipeline } from './topo-pipeline.js';
import { CONTOUR_HEADER_STRIDE, SEGMENT_STRIDE, TOPO_COLOR_STOP_STRIDE, TOPO_PARAMS_SIZE } from './topo-shader.js';
import { destroyDevice, getDevice, isWebGPUAvailable } from './webgpu-device.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Pipeline result returned by conic/freeform/mesh/topo pipeline getters. */
interface RenderPipelineResult {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  format: GPUTextureFormat;
}

/** Pipeline result returned by the topo-laplace pipeline getter. */
interface LaplacePipelineResult {
  device: GPUDevice;
  initPipeline: GPUComputePipeline;
  jacobiPipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  format: GPUTextureFormat;
}

/** Contour with a pre-parsed Path2D, used by the Laplace solver. */
interface ParsedContour {
  elevation: number;
  path2d: Path2D;
}

/** Contour with both a Path2D and flattened segments, used by the distance-field Canvas 2D fallback. */
interface ParsedContourWithSegments {
  elevation: number;
  path2d: Path2D;
  segments: Float32Array;
}

/** Parsed mesh grid point with linear RGBA. */
interface ParsedGridPoint {
  x: number;
  y: number;
  rgba: number[];
}

/** Parsed color stop with linear RGBA. */
interface ParsedColorStop {
  offset: number;
  rgba: number[];
}

/** Contour header for the GPU topo shader. */
interface ContourHeader {
  elevation: number;
  segmentStart: number;
  segmentCount: number;
}

/** Easing function signature. */
type EasingFn = (t: number) => number;

/** Easing name to integer mapping for GPU shaders. */
type EasingName = 'linear' | 'smoothstep' | 'ease-in' | 'ease-out' | 'ease-in-out';

const EASING_MAP: Record<EasingName, number> = {
  linear: 0,
  smoothstep: 1,
  'ease-in': 2,
  'ease-out': 3,
  'ease-in-out': 4,
};

// ---------------------------------------------------------------------------
// Texture size clamping
// ---------------------------------------------------------------------------

/** Maximum canvas dimension for Canvas 2D fallback to avoid memory exhaustion. */
const MAX_CANVAS_2D_DIM = 16384;

/**
 * Reduce the effective scale so both dimensions stay within maxDim.
 * Returns the clamped scale — always <= input scale, >= 0.25 to avoid degenerate textures.
 */
function clampScale(w: number, h: number, scale: number, maxDim: number): number {
  const maxNeeded = Math.max(w * scale, h * scale);
  if (maxNeeded <= maxDim) return scale;
  const clamped = maxDim / Math.max(w, h);
  const result = Math.max(clamped, 0.25);
  console.warn(
    `[GradientService] Texture ${Math.round(w * scale)}×${Math.round(h * scale)} exceeds max ${maxDim}×${maxDim}, reducing scale from ${scale}× to ${result.toFixed(2)}×`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const cache = new TextureCache(32);

let _gpuAvailable: boolean | null = null;
let _initialized = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the gradient service. Probes WebGPU availability.
 * Safe to call multiple times (no-op after first).
 */
export async function init(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  _gpuAvailable = await isWebGPUAvailable();
  if (_gpuAvailable) {
    console.log('[GradientService] WebGPU available — conic gradients will render via GPU');
  } else {
    console.log('[GradientService] WebGPU not available — falling back to Canvas 2D');
  }
}

/** Whether WebGPU rendering is active. */
export function isGPUActive(): boolean {
  return _gpuAvailable === true;
}

/**
 * Render all conic gradients from a compilation result.
 * Returns a Map of gradient ID to data URL for SVG DOM injection.
 */
export async function renderConicGradients(
  gradients: GradientOutput[],
  width: number,
  height: number,
  scale: number = 2,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const conics = gradients.filter((g) => g.type === 'conic');
  if (conics.length === 0) return result;

  for (const grad of conics) {
    const key = hashGradient(grad, width * scale, height * scale);
    const cached = cache.get(key);
    if (cached) {
      result.set(grad.id, cached);
      continue;
    }

    let dataUrl: string | null = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderConicWebGPU(grad, width, height, scale);
      } catch (e: unknown) {
        console.warn('[GradientService] WebGPU render failed, falling back to Canvas 2D:', (e as Error).message);
        dataUrl = renderConicCanvas2D(grad, width, height, scale);
      }
    } else {
      dataUrl = renderConicCanvas2D(grad, width, height, scale);
    }

    if (dataUrl) {
      cache.set(key, dataUrl);
      result.set(grad.id, dataUrl);
    }
  }

  return result;
}

/**
 * Render all freeform gradients from a compilation result.
 * Returns a Map of gradient ID to data URL for SVG DOM injection.
 */
export async function renderFreeformGradients(
  gradients: GradientOutput[],
  width: number,
  height: number,
  scale: number = 2,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const freeforms = gradients.filter((g) => g.type === 'freeform');
  if (freeforms.length === 0) return result;

  for (const grad of freeforms) {
    const gw = grad.freeformWidth || width;
    const gh = grad.freeformHeight || height;
    const key = hashGradient(grad, gw * scale, gh * scale);
    const cached = cache.get(key);
    if (cached) {
      result.set(grad.id, cached);
      continue;
    }

    let dataUrl: string | null = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderFreeformWebGPU(grad, gw, gh, scale);
      } catch (e: unknown) {
        console.warn('[GradientService] Freeform WebGPU render failed, falling back to Canvas 2D:', (e as Error).message);
        dataUrl = renderFreeformCanvas2D(grad, gw, gh, scale);
      }
    } else {
      dataUrl = renderFreeformCanvas2D(grad, gw, gh, scale);
    }

    if (dataUrl) {
      cache.set(key, dataUrl);
      result.set(grad.id, dataUrl);
    }
  }

  return result;
}

/**
 * Render all mesh gradients from a compilation result.
 * Returns a Map of gradient ID to data URL for SVG DOM injection.
 */
export async function renderMeshGradients(
  gradients: GradientOutput[],
  width: number,
  height: number,
  scale: number = 2,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const meshes = gradients.filter((g) => g.type === 'mesh');
  if (meshes.length === 0) return result;

  for (const grad of meshes) {
    const gw = grad.meshWidth || width;
    const gh = grad.meshHeight || height;
    const key = hashGradient(grad, gw * scale, gh * scale);
    const cached = cache.get(key);
    if (cached) {
      result.set(grad.id, cached);
      continue;
    }

    let dataUrl: string | null = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderMeshWebGPU(grad, gw, gh, scale);
      } catch (e: unknown) {
        console.warn('[GradientService] Mesh WebGPU render failed, falling back to Canvas 2D:', (e as Error).message);
        dataUrl = renderMeshCanvas2D(grad, gw, gh, scale);
      }
    } else {
      dataUrl = renderMeshCanvas2D(grad, gw, gh, scale);
    }

    if (dataUrl) {
      cache.set(key, dataUrl);
      result.set(grad.id, dataUrl);
    }
  }

  return result;
}

/**
 * Render all topo gradients from a compilation result.
 * Returns a Map of gradient ID to data URL for SVG DOM injection.
 */
export async function renderTopoGradients(
  gradients: GradientOutput[],
  width: number,
  height: number,
  scale: number = 2,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const topos = gradients.filter((g) => g.type === 'topo');
  if (topos.length === 0) return result;

  for (const grad of topos) {
    const gw = grad.topoWidth || width;
    const gh = grad.topoHeight || height;
    const key = hashGradient(grad, gw * scale, gh * scale);
    const cached = cache.get(key);
    if (cached) {
      result.set(grad.id, cached);
      continue;
    }

    let dataUrl: string | null = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderTopoWebGPU(grad, gw, gh, scale);
      } catch (e: unknown) {
        console.warn('[GradientService] Topo WebGPU render failed, falling back to Canvas 2D:', (e as Error).message);
        dataUrl = renderTopoCanvas2D(grad, gw, gh, scale);
      }
    } else {
      dataUrl = renderTopoCanvas2D(grad, gw, gh, scale);
    }

    if (dataUrl) {
      cache.set(key, dataUrl);
      result.set(grad.id, dataUrl);
    }
  }

  return result;
}

/** Clear the texture cache. Call on cleanup / disconnectedCallback. */
export function clearCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single conic gradient via WebGPU.
 */
async function renderConicWebGPU(grad: GradientOutput, w: number, h: number, scale: number): Promise<string> {
  const pipelineResult = await getConicPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  scale = clampScale(w, h, scale, device.limits.maxTextureDimension2D);
  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  // Always use DOM canvas — OffscreenCanvas lacks toDataURL(), and blob URLs
  // from createObjectURL don't render in SVG <image> elements in Shadow DOM.
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Uniform buffer (ConicParams, 64 bytes) ---
  const fromAngle = grad.from ?? 0;
  const toAngle = grad.to ?? fromAngle + 2 * Math.PI;
  const innerRadius = (grad.innerRadius ?? 0) * scale;
  const direction = grad.direction === 'ccw' ? -1.0 : 1.0;

  // Spread: 0 = clamp, 1 = repeat, 2 = transparent
  let spreadVal = 0.0;
  if (grad.spread === 'repeat') spreadVal = 1.0;
  else if (grad.spread === 'transparent') spreadVal = 2.0;

  // innerFill mode: 0 = transparent (hard), 1 = center (smooth), 2 = custom (smooth), 3 = transparent-blend (smooth)
  const innerFill = grad.innerFill ?? 'transparent';
  let innerFillMode = 0;
  let innerFillRGBA = [0, 0, 0, 0];
  if (innerFill === 'center') {
    innerFillMode = 1;
  } else if (innerFill === 'transparent-blend') {
    innerFillMode = 3;
  } else if (innerFill !== 'transparent') {
    // CSS color string — parse to RGBA
    innerFillMode = 2;
    innerFillRGBA = cssColorToLinearRGBA(innerFill);
  }

  const uniformData = new ArrayBuffer(64);
  const f32 = new Float32Array(uniformData);
  const u32 = new Uint32Array(uniformData);

  f32[0] = (grad.cx ?? w / 2) / w; // center.x in UV space [0,1]
  f32[1] = (grad.cy ?? h / 2) / h; // center.y in UV space [0,1]
  f32[2] = fromAngle;
  f32[3] = toAngle;
  f32[4] = innerRadius;
  f32[5] = direction;
  f32[6] = spreadVal;
  u32[7] = innerFillMode; // inner_fill_mode
  f32[8] = pw; // resolution.x
  f32[9] = ph; // resolution.y
  const stops = grad.stopsWithOklch || grad.stops || [];
  u32[10] = stops.length; // stop_count
  // u32[11] = _pad
  f32[12] = innerFillRGBA[0]; // inner_fill_color.r
  f32[13] = innerFillRGBA[1]; // inner_fill_color.g
  f32[14] = innerFillRGBA[2]; // inner_fill_color.b
  f32[15] = innerFillRGBA[3]; // inner_fill_color.a

  const uniformBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // --- Stops storage buffer ---
  // Each ColorStop: 5 x f32 (offset, r, g, b, a) = 20 bytes, stride 20 (alignment 4)
  const FLOATS_PER_STOP = 5;
  const stopCount = Math.max(stops.length, 1); // At least 1 for valid buffer
  const stopBufferSize = stopCount * FLOATS_PER_STOP * 4;
  const stopData = new Float32Array(stopCount * FLOATS_PER_STOP);
  for (let i = 0; i < stops.length; i++) {
    const rgba = cssColorToLinearRGBA(stops[i].color);
    const base = i * FLOATS_PER_STOP;
    stopData[base] = stops[i].offset;
    stopData[base + 1] = rgba[0];
    stopData[base + 2] = rgba[1];
    stopData[base + 3] = rgba[2];
    stopData[base + 4] = rgba[3];
  }

  const stopBuffer = device.createBuffer({
    size: stopBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(stopBuffer, 0, stopData);

  // --- Bind group ---
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: stopBuffer } },
    ],
  });

  // --- Render pass ---
  const textureView = context.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0); // Full-screen triangle
  pass.end();
  device.queue.submit([encoder.finish()]);

  // --- Read back as data URL ---
  const dataUrl = await canvasToDataURL(canvas);

  // Cleanup GPU resources
  uniformBuffer.destroy();
  stopBuffer.destroy();

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Freeform WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single freeform gradient via WebGPU.
 */
async function renderFreeformWebGPU(grad: GradientOutput, w: number, h: number, scale: number): Promise<string> {
  const pipelineResult = await getFreeformPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Freeform pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  scale = clampScale(w, h, scale, device.limits.maxTextureDimension2D);
  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  // Always use DOM canvas — blob URLs don't render in SVG <image> in Shadow DOM
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Uniform buffer (FreeformParams, 32 bytes) ---
  const points = grad.freeformPoints || [];
  const interpVal = (grad as GradientOutputExtended).interpolation === 'oklch' ? 1 : 0;

  const uniformData = new ArrayBuffer(FREEFORM_PARAMS_SIZE);
  const f32 = new Float32Array(uniformData);
  const u32 = new Uint32Array(uniformData);

  f32[0] = pw; // resolution.x
  f32[1] = ph; // resolution.y
  f32[2] = grad.freeformWidth || w; // grad_size.x
  f32[3] = grad.freeformHeight || h; // grad_size.y
  f32[4] = grad.falloff ?? 2.0; // falloff
  u32[5] = points.length; // point_count
  u32[6] = interpVal; // interpolation
  // u32[7] = _pad

  const uniformBuffer = device.createBuffer({
    size: FREEFORM_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // --- Points storage buffer ---
  const FLOATS_PER_POINT = 6; // x, y, r, g, b, a
  const pointCount = Math.max(points.length, 1);
  const pointData = new Float32Array(pointCount * FLOATS_PER_POINT);
  for (let i = 0; i < points.length; i++) {
    const rgba = cssColorToLinearRGBA(points[i].color);
    const base = i * FLOATS_PER_POINT;
    pointData[base] = points[i].x;
    pointData[base + 1] = points[i].y;
    pointData[base + 2] = rgba[0];
    pointData[base + 3] = rgba[1];
    pointData[base + 4] = rgba[2];
    pointData[base + 5] = rgba[3];
  }

  const pointBuffer = device.createBuffer({
    size: pointCount * FLOATS_PER_POINT * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(pointBuffer, 0, pointData);

  // --- Bind group ---
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: pointBuffer } },
    ],
  });

  // --- Render pass ---
  const textureView = context.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0);
  pass.end();
  device.queue.submit([encoder.finish()]);

  const dataUrl = await canvasToDataURL(canvas);

  uniformBuffer.destroy();
  pointBuffer.destroy();

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Mesh WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single mesh gradient via WebGPU.
 */
async function renderMeshWebGPU(grad: GradientOutput, w: number, h: number, scale: number): Promise<string> {
  const pipelineResult = await getMeshPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Mesh pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  scale = clampScale(w, h, scale, device.limits.maxTextureDimension2D);
  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  // Always use DOM canvas — blob URLs don't render in SVG <image> in Shadow DOM
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Uniform buffer (MeshParams, 32 bytes) ---
  const grid = grad.meshGrid || [];
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const interpVal = (grad as GradientOutputExtended).interpolation === 'oklch' ? 1 : 0;

  const uniformData = new ArrayBuffer(MESH_PARAMS_SIZE);
  const f32 = new Float32Array(uniformData);
  const u32 = new Uint32Array(uniformData);

  f32[0] = pw; // resolution.x
  f32[1] = ph; // resolution.y
  f32[2] = grad.meshWidth || w; // grad_size.x
  f32[3] = grad.meshHeight || h; // grad_size.y
  u32[4] = rows; // rows
  u32[5] = cols; // cols
  u32[6] = interpVal; // interpolation
  // u32[7] = _pad

  const uniformBuffer = device.createBuffer({
    size: MESH_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // --- Vertices storage buffer (row-major) ---
  const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, a
  const totalVertices = Math.max(rows * cols, 1);
  const vertexData = new Float32Array(totalVertices * FLOATS_PER_VERTEX);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pt = grid[r][c];
      const rgba = cssColorToLinearRGBA(pt.color);
      const base = (r * cols + c) * FLOATS_PER_VERTEX;
      vertexData[base] = pt.x;
      vertexData[base + 1] = pt.y;
      vertexData[base + 2] = rgba[0];
      vertexData[base + 3] = rgba[1];
      vertexData[base + 4] = rgba[2];
      vertexData[base + 5] = rgba[3];
    }
  }

  const vertexBuffer = device.createBuffer({
    size: totalVertices * FLOATS_PER_VERTEX * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertexData);

  // --- Bind group ---
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: vertexBuffer } },
    ],
  });

  // --- Render pass ---
  const textureView = context.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0);
  pass.end();
  device.queue.submit([encoder.finish()]);

  const dataUrl = await canvasToDataURL(canvas);

  uniformBuffer.destroy();
  vertexBuffer.destroy();

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Canvas 2D fallbacks
// ---------------------------------------------------------------------------

/**
 * Render a single freeform gradient via Canvas 2D (pixel-by-pixel IDW).
 */
function renderFreeformCanvas2D(grad: GradientOutput, w: number, h: number, scale: number): string | null {
  try {
    scale = clampScale(w, h, scale, MAX_CANVAS_2D_DIM);
    const pw = w * scale;
    const ph = h * scale;
    // Always use DOM canvas for 2D fallback — OffscreenCanvas lacks toDataURL()
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const points = (grad.freeformPoints || []).map((p) => ({
      x: p.x,
      y: p.y,
      rgba: cssColorToLinearRGBA(p.color),
    }));

    if (points.length === 0) return null;

    const falloff = grad.falloff ?? 2.0;
    const gw = grad.freeformWidth || w;
    const gh = grad.freeformHeight || h;
    const imageData = ctx.createImageData(pw, ph);
    const data = imageData.data;

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        // Map pixel to gradient coordinate space
        const gx = (px / pw) * gw;
        const gy = (py / ph) * gh;

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let totalA = 0;
        let totalWeight = 0;
        for (const pt of points) {
          const dx = gx - pt.x;
          const dy = gy - pt.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const weight = 1 / Math.max(d, 0.001) ** falloff;
          totalR += pt.rgba[0] * weight;
          totalG += pt.rgba[1] * weight;
          totalB += pt.rgba[2] * weight;
          totalA += pt.rgba[3] * weight;
          totalWeight += weight;
        }

        const idx = (py * pw + px) * 4;
        data[idx] = Math.round(Math.min(1, Math.max(0, totalR / totalWeight)) * 255);
        data[idx + 1] = Math.round(Math.min(1, Math.max(0, totalG / totalWeight)) * 255);
        data[idx + 2] = Math.round(Math.min(1, Math.max(0, totalB / totalWeight)) * 255);
        data[idx + 3] = Math.round(Math.min(1, Math.max(0, totalA / totalWeight)) * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (canvas.toDataURL) {
      return canvas.toDataURL('image/png');
    }
    return null;
  } catch (e: unknown) {
    console.warn('[GradientService] Freeform Canvas 2D fallback failed:', (e as Error).message);
    return null;
  }
}

/**
 * Render a single mesh gradient via Canvas 2D (pixel-by-pixel bilinear patches).
 */
function renderMeshCanvas2D(grad: GradientOutput, w: number, h: number, scale: number): string | null {
  try {
    scale = clampScale(w, h, scale, MAX_CANVAS_2D_DIM);
    const pw = w * scale;
    const ph = h * scale;
    // Always use DOM canvas for 2D fallback — OffscreenCanvas lacks toDataURL()
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grid = grad.meshGrid || [];
    const rows = grid.length;
    const cols = rows > 0 ? grid[0].length : 0;
    if (rows < 2 || cols < 2) return null;

    // Pre-parse colors
    const parsedGrid: ParsedGridPoint[][] = grid.map((row) =>
      row.map((p) => ({
        x: p.x,
        y: p.y,
        rgba: cssColorToLinearRGBA(p.color),
      })),
    );

    const gw = grad.meshWidth || w;
    const gh = grad.meshHeight || h;
    const imageData = ctx.createImageData(pw, ph);
    const data = imageData.data;

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const gx = (px / pw) * gw;
        const gy = (py / ph) * gh;

        let found = false;
        let rOut = 0;
        let gOut = 0;
        let bOut = 0;
        let aOut = 0;

        // Iterate patches
        for (let r = 0; r < rows - 1 && !found; r++) {
          for (let c = 0; c < cols - 1 && !found; c++) {
            const p00 = parsedGrid[r][c];
            const p10 = parsedGrid[r][c + 1];
            const p01 = parsedGrid[r + 1][c];
            const p11 = parsedGrid[r + 1][c + 1];

            // Bounding box check
            const minX = Math.min(p00.x, p10.x, p01.x, p11.x);
            const maxX = Math.max(p00.x, p10.x, p01.x, p11.x);
            const minY = Math.min(p00.y, p10.y, p01.y, p11.y);
            const maxY = Math.max(p00.y, p10.y, p01.y, p11.y);

            if (gx < minX || gx > maxX || gy < minY || gy > maxY) continue;

            // Inverse bilinear mapping
            const uv = inverseBilinearCPU(gx, gy, p00, p10, p01, p11);
            if (uv && uv[0] >= -0.01 && uv[0] <= 1.01 && uv[1] >= -0.01 && uv[1] <= 1.01) {
              // smoothstep eases transitions at patch boundaries
              const u = smoothstep(Math.max(0, Math.min(1, uv[0])));
              const v = smoothstep(Math.max(0, Math.min(1, uv[1])));

              // Bilinear interpolation
              rOut = lerp(lerp(p00.rgba[0], p10.rgba[0], u), lerp(p01.rgba[0], p11.rgba[0], u), v);
              gOut = lerp(lerp(p00.rgba[1], p10.rgba[1], u), lerp(p01.rgba[1], p11.rgba[1], u), v);
              bOut = lerp(lerp(p00.rgba[2], p10.rgba[2], u), lerp(p01.rgba[2], p11.rgba[2], u), v);
              aOut = lerp(lerp(p00.rgba[3], p10.rgba[3], u), lerp(p01.rgba[3], p11.rgba[3], u), v);
              found = true;
            }
          }
        }

        const idx = (py * pw + px) * 4;
        if (found) {
          data[idx] = Math.round(Math.min(1, Math.max(0, rOut)) * 255);
          data[idx + 1] = Math.round(Math.min(1, Math.max(0, gOut)) * 255);
          data[idx + 2] = Math.round(Math.min(1, Math.max(0, bOut)) * 255);
          data[idx + 3] = Math.round(Math.min(1, Math.max(0, aOut)) * 255);
        }
        // else: transparent (ImageData defaults to 0)
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (canvas.toDataURL) {
      return canvas.toDataURL('image/png');
    }
    return null;
  } catch (e: unknown) {
    console.warn('[GradientService] Mesh Canvas 2D fallback failed:', (e as Error).message);
    return null;
  }
}

/** Point with x/y coordinates for bilinear mapping. */
interface BilinearPoint {
  x: number;
  y: number;
}

/** CPU inverse bilinear mapping. Returns [u, v] or null. */
function inverseBilinearCPU(
  px: number,
  py: number,
  p00: BilinearPoint,
  p10: BilinearPoint,
  p01: BilinearPoint,
  p11: BilinearPoint,
): [number, number] | null {
  const ex = p10.x - p00.x;
  const ey = p10.y - p00.y;
  const fx = p01.x - p00.x;
  const fy = p01.y - p00.y;
  const gx = p00.x - p10.x + p11.x - p01.x;
  const gy = p00.y - p10.y + p11.y - p01.y;
  const hx = px - p00.x;
  const hy = py - p00.y;

  const k2 = gx * fy - gy * fx;
  const k1 = ex * fy - ey * fx + hx * gy - hy * gx;
  const k0 = hx * ey - hy * ex;

  if (Math.abs(k2) < 0.0001) {
    // Linear case
    const v = -k0 / k1;
    const ud = ex + gx * v;
    let u: number;
    if (Math.abs(ud) > 0.0001) {
      u = (hx - fx * v) / ud;
    } else {
      u = (hy - fy * v) / (ey + gy * v);
    }
    return [u, v];
  }

  const disc = k1 * k1 - 4 * k0 * k2;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  let v = (-k1 - sqrtDisc) / (2 * k2);
  if (v < -0.01 || v > 1.01) v = (-k1 + sqrtDisc) / (2 * k2);

  const ud = ex + gx * v;
  let u: number;
  if (Math.abs(ud) > 0.0001) {
    u = (hx - fx * v) / ud;
  } else {
    u = (hy - fy * v) / (ey + gy * v);
  }
  return [u, v];
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep: S-curve with zero derivative at 0 and 1. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Conic Canvas 2D fallback
// ---------------------------------------------------------------------------

/**
 * Render a single conic gradient via Canvas 2D.
 * Same algorithm as svg-preview-pane.js inline rendering.
 * Note: innerRadius is NOT supported in Canvas 2D (silently ignored).
 */
function renderConicCanvas2D(grad: GradientOutput, w: number, h: number, scale: number): string | null {
  try {
    scale = clampScale(w, h, scale, MAX_CANVAS_2D_DIM);
    // Always use DOM canvas for 2D fallback — OffscreenCanvas lacks toDataURL()
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fromAngle = grad.from ?? 0;
    const toAngle = grad.to ?? fromAngle + 2 * Math.PI;
    const cx = (grad.cx ?? 0) * scale;
    const cy = (grad.cy ?? 0) * scale;
    const conicGrad = ctx.createConicGradient(fromAngle, cx, cy);
    const stops = grad.stopsWithOklch || grad.stops || [];
    const totalAngle = toAngle - fromAngle;
    const fullRevolution = 2 * Math.PI;

    for (const s of stops) {
      const scaledOffset = (s.offset * totalAngle) / fullRevolution;
      if (scaledOffset >= 0 && scaledOffset <= 1) {
        conicGrad.addColorStop(Math.min(1, Math.max(0, scaledOffset)), s.color);
      }
    }

    ctx.fillStyle = conicGrad;
    ctx.fillRect(0, 0, w * scale, h * scale);

    // OffscreenCanvas doesn't have toDataURL — use sync path if available
    if (canvas.toDataURL) {
      return canvas.toDataURL('image/png');
    }

    // OffscreenCanvas: must return null here (async path handled by caller)
    return null;
  } catch (e: unknown) {
    console.warn('[GradientService] Canvas 2D fallback failed:', (e as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Topo WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single topo gradient via WebGPU.
 */
async function renderTopoWebGPU(
  grad: GradientOutput,
  w: number,
  h: number,
  scale: number,
): Promise<string | null> {
  if ((grad.topoMethod || 'distance') === 'laplace') {
    return renderTopoLaplaceWebGPU(grad, w, h, scale);
  }
  const pipelineResult = await getTopoPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Topo pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  scale = clampScale(w, h, scale, device.limits.maxTextureDimension2D);
  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Flatten contour paths to line segments ---
  // Sort contours by elevation (lowest first) for smooth blending algorithm
  const contours = [...(grad.topoContours || [])].sort((a, b) => a.elevation - b.elevation);
  const stops = grad.stopsWithOklch || [];
  const allSegments: Float32Array[] = []; // Float32Array segments per contour
  const contourHeaders: ContourHeader[] = []; // { elevation, segmentStart, segmentCount }
  let globalSegmentIdx = 0;

  for (const c of contours) {
    const segs = flattenToSegments(c.path, 8);
    const segCount = segs.length / 4; // each segment = 4 floats
    contourHeaders.push({
      elevation: c.elevation,
      segmentStart: globalSegmentIdx,
      segmentCount: segCount,
    });
    allSegments.push(segs);
    globalSegmentIdx += segCount;
  }

  const totalSegments = Math.max(globalSegmentIdx, 1);

  // --- Easing mode ---
  const easingVal = EASING_MAP[(grad.topoEasing || 'linear') as EasingName] ?? 0;
  const interpVal = (grad as GradientOutputExtended).interpolation === 'oklch' ? 1 : 0;

  // --- Uniform buffer (TopoParams, 32 bytes) ---
  const uniformData = new ArrayBuffer(TOPO_PARAMS_SIZE);
  const f32 = new Float32Array(uniformData);
  const u32 = new Uint32Array(uniformData);

  f32[0] = pw; // resolution.x
  f32[1] = ph; // resolution.y
  f32[2] = grad.topoWidth || w; // grad_size.x
  f32[3] = grad.topoHeight || h; // grad_size.y
  u32[4] = contours.length; // contour_count
  u32[5] = stops.length; // stop_count
  u32[6] = easingVal; // easing
  u32[7] = interpVal; // interpolation

  const uniformBuffer = device.createBuffer({
    size: TOPO_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // --- Contour headers storage buffer ---
  const contourCount = Math.max(contours.length, 1);
  const headerData = new ArrayBuffer(contourCount * CONTOUR_HEADER_STRIDE);
  const headerF32 = new Float32Array(headerData);
  const headerU32 = new Uint32Array(headerData);

  for (let i = 0; i < contourHeaders.length; i++) {
    const base = i * 4; // 4 values per header (16 bytes / 4)
    headerF32[base] = contourHeaders[i].elevation;
    headerU32[base + 1] = contourHeaders[i].segmentStart;
    headerU32[base + 2] = contourHeaders[i].segmentCount;
    headerU32[base + 3] = 0; // padding
  }

  const headerBuffer = device.createBuffer({
    size: contourCount * CONTOUR_HEADER_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(headerBuffer, 0, headerData);

  // --- Segments storage buffer ---
  const segmentData = new Float32Array(totalSegments * 4);
  let offset = 0;
  for (const segs of allSegments) {
    segmentData.set(segs, offset);
    offset += segs.length;
  }

  const segmentBuffer = device.createBuffer({
    size: totalSegments * SEGMENT_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(segmentBuffer, 0, segmentData);

  // --- Color stops storage buffer ---
  const stopCount = Math.max(stops.length, 1);
  const stopData = new Float32Array(stopCount * 4);
  for (let i = 0; i < stops.length; i++) {
    const rgba = cssColorToLinearRGBA(stops[i].color);
    const base = i * 4;
    stopData[base] = stops[i].offset;
    stopData[base + 1] = rgba[0];
    stopData[base + 2] = rgba[1];
    stopData[base + 3] = rgba[2];
  }

  const stopBuffer = device.createBuffer({
    size: stopCount * TOPO_COLOR_STOP_STRIDE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(stopBuffer, 0, stopData);

  // --- Bind group (4 entries) ---
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: headerBuffer } },
      { binding: 2, resource: { buffer: segmentBuffer } },
      { binding: 3, resource: { buffer: stopBuffer } },
    ],
  });

  // --- Render pass ---
  const textureView = context.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3, 1, 0, 0);
  pass.end();
  device.queue.submit([encoder.finish()]);

  const dataUrl = await canvasToDataURL(canvas);

  // Cleanup GPU resources
  uniformBuffer.destroy();
  headerBuffer.destroy();
  segmentBuffer.destroy();
  stopBuffer.destroy();

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Topo Laplace WebGPU — Jacobi solver via compute shaders
// ---------------------------------------------------------------------------

async function renderTopoLaplaceWebGPU(
  grad: GradientOutput,
  w: number,
  h: number,
  scale: number,
): Promise<string | null> {
  const pipelineResult = await getTopoLaplacePipeline() as LaplacePipelineResult | null;
  if (!pipelineResult) throw new Error('Topo Laplace pipeline unavailable');
  const { device, renderPipeline, format } = pipelineResult;

  scale = clampScale(w, h, scale, device.limits.maxTextureDimension2D);
  const pw = w * scale;
  const ph = h * scale;
  const iterations = grad.topoIterations ?? 200;

  // --- Canvas & texture ---
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Could not get webgpu context');
  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Prepare contours ---
  const contours: ParsedContour[] = [...(grad.topoContours || [])]
    .sort((a, b) => a.elevation - b.elevation)
    .map((c) => ({ elevation: c.elevation, path2d: new Path2D(c.path) }));
  const stops = grad.stopsWithOklch || [];
  if (stops.length === 0) return null;

  const easingVal = EASING_MAP[(grad.topoEasing || 'linear') as EasingName] ?? 0;
  const interpVal = (grad as GradientOutputExtended).interpolation === 'oklch' ? 1 : 0;

  const gw = grad.topoWidth || w;
  const gh = grad.topoHeight || h;

  // --- CPU Gauss-Seidel + SOR at adaptive resolution ---
  // Solve resolution adapts to iteration count: higher iterations -> finer grid
  // At solve_dim S with optimal SOR, convergence needs ~S iterations
  const maxDim = Math.max(gw, gh);
  const solveDim = Math.min(maxDim, Math.max(16, Math.ceil(iterations * 0.9)));
  const solveScale = solveDim / maxDim;
  const sw = Math.max(16, Math.ceil(gw * solveScale));
  const sh = Math.max(16, Math.ceil(gh * solveScale));

  const spread = grad.topoBlend ?? 1.0;
  const elevation = laplaceSolveCPU(contours, gw, gh, sw, sh, iterations, spread);

  // --- Upload solved elevation to GPU texture ---
  const elevationTex = device.createTexture({
    size: [sw, sh],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // WebGPU requires bytesPerRow to be a multiple of 256
  const bytesPerRow = Math.ceil((sw * 4) / 256) * 256;
  const paddedData = new Uint8Array(bytesPerRow * sh);
  const srcBytes = new Uint8Array(elevation.buffer);
  for (let y = 0; y < sh; y++) {
    paddedData.set(srcBytes.subarray(y * sw * 4, (y + 1) * sw * 4), y * bytesPerRow);
  }
  // The local webgpu.d.ts types dataLayout as GPUTexelCopyBufferInfo (which requires `buffer`),
  // but the actual WebGPU spec uses GPUTexelCopyBufferLayout (offset, bytesPerRow, rowsPerImage)
  // for writeTexture's dataLayout parameter. Cast to satisfy the local type definition.
  device.queue.writeTexture(
    { texture: elevationTex },
    paddedData,
    { bytesPerRow } as unknown as GPUTexelCopyBufferInfo,
    { width: sw, height: sh },
  );

  // --- Render uniform buffer ---
  const renderData = new ArrayBuffer(LAPLACE_RENDER_PARAMS_SIZE);
  const renderF32 = new Float32Array(renderData);
  const renderU32 = new Uint32Array(renderData);
  renderF32[0] = pw;
  renderF32[1] = ph;
  renderU32[2] = stops.length;
  renderU32[3] = easingVal;
  renderU32[4] = interpVal;

  const renderUniformBuffer = device.createBuffer({
    size: LAPLACE_RENDER_PARAMS_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(renderUniformBuffer, 0, renderData);

  // --- Color stops buffer ---
  const stopCount = Math.max(stops.length, 1);
  const stopData = new Float32Array(stopCount * 4);
  for (let i = 0; i < stops.length; i++) {
    const rgba = cssColorToLinearRGBA(stops[i].color);
    const base = i * 4;
    stopData[base] = stops[i].offset;
    stopData[base + 1] = rgba[0];
    stopData[base + 2] = rgba[1];
    stopData[base + 3] = rgba[2];
  }

  const stopBuffer = device.createBuffer({
    size: stopCount * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(stopBuffer, 0, stopData);

  // --- Render bind group ---
  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: renderUniformBuffer } },
      { binding: 1, resource: { buffer: stopBuffer } },
      { binding: 2, resource: elevationTex.createView() },
    ],
  });

  // --- Render pass (GPU does color mapping + bilinear upsample) ---
  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ],
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, renderBindGroup);
  renderPass.draw(3, 1, 0, 0);
  renderPass.end();

  device.queue.submit([encoder.finish()]);

  const dataUrl = await canvasToDataURL(canvas);

  // Cleanup
  renderUniformBuffer.destroy();
  stopBuffer.destroy();
  elevationTex.destroy();

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Shared CPU Laplace solver: Gauss-Seidel with SOR at reduced resolution
// ---------------------------------------------------------------------------

/**
 * Solve nabla^2 h = 0 on a sw x sh grid using Gauss-Seidel + SOR.
 * Contour boundaries are Dirichlet conditions; image edges fixed at 0.
 * Returns a Float32Array of elevation values.
 */
function laplaceSolveCPU(
  contours: ParsedContour[],
  gw: number,
  gh: number,
  sw: number,
  sh: number,
  iterations: number,
  spread: number,
): Float32Array {
  const elevation = new Float32Array(sw * sh);
  const mask = new Uint8Array(sw * sh); // 1 = boundary (fixed)

  // Temporary canvas for Path2D containment checks
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = 1;
  tmpCanvas.height = 1;
  const tmpCtx = tmpCanvas.getContext('2d') as CanvasRenderingContext2D;

  const stepX = gw / sw; // pixel size in gradient space
  const stepY = gh / sh;

  // --- Initialize elevation + boundary mask ---
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x;

      // Image edges: boundary at elevation 0
      if (x === 0 || y === 0 || x === sw - 1 || y === sh - 1) {
        elevation[idx] = 0;
        mask[idx] = 1;
        continue;
      }

      // Map solve-grid pixel to gradient coordinate space
      const gx = (x + 0.5) * stepX;
      const gy = (y + 0.5) * stepY;

      // Determine elevation from innermost contour (lowest->highest, last wins)
      let elev = 0;
      let isBoundary = false;
      for (const c of contours) {
        const inside = tmpCtx.isPointInPath(c.path2d, gx, gy);
        if (inside) elev = c.elevation;

        // Only mark as boundary if pixel is INSIDE this contour AND has a neighbor outside.
        // This creates a 1-pixel boundary on the inner edge of each contour.
        // Pixels outside the contour remain free and can diffuse toward the boundary,
        // which is what creates the smooth gradient between contour levels.
        if (!isBoundary && inside) {
          const left = tmpCtx.isPointInPath(c.path2d, gx - stepX, gy);
          const right = tmpCtx.isPointInPath(c.path2d, gx + stepX, gy);
          const up = tmpCtx.isPointInPath(c.path2d, gx, gy - stepY);
          const down = tmpCtx.isPointInPath(c.path2d, gx, gy + stepY);
          if (!left || !right || !up || !down) {
            isBoundary = true;
          }
        }
      }

      // Boundary: fixed at contour elevation. Free: region elevation as initial guess.
      elevation[idx] = elev;
      mask[idx] = isBoundary ? 1 : 0;
    }
  }

  // --- Gauss-Seidel + SOR iteration (in-place, converges much faster than Jacobi) ---
  // Optimal omega for 2D Laplace on an N x N grid: 2 / (1 + sin(pi/N))
  const N = Math.max(sw, sh);
  const omega = 2 / (1 + Math.sin(Math.PI / N));

  // Save initial region elevations for spread blending
  const initial = spread < 1.0 ? new Float32Array(elevation) : null;

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const idx = y * sw + x;
        if (mask[idx]) continue; // boundary: skip

        const left = elevation[idx - 1];
        const right = elevation[idx + 1];
        const up = elevation[idx - sw];
        const down = elevation[idx + sw];
        const avg = (left + right + up + down) * 0.25;
        elevation[idx] += omega * (avg - elevation[idx]);
      }
    }
  }

  // Apply spread: lerp between flat region values (0) and full Laplace solution (1)
  if (initial) {
    for (let i = 0; i < elevation.length; i++) {
      elevation[i] = initial[i] + spread * (elevation[i] - initial[i]);
    }
  }

  return elevation;
}

// ---------------------------------------------------------------------------
// Topo Canvas 2D fallback
// ---------------------------------------------------------------------------

/**
 * Render a single topo gradient via Canvas 2D (pixel-by-pixel SDF).
 */
function renderTopoCanvas2D(grad: GradientOutput, w: number, h: number, scale: number): string | null {
  if ((grad.topoMethod || 'distance') === 'laplace') {
    return renderTopoLaplaceCanvas2D(grad, w, h, scale);
  }
  try {
    scale = clampScale(w, h, scale, MAX_CANVAS_2D_DIM);
    const pw = w * scale;
    const ph = h * scale;
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Sort contours by elevation (lowest first) for smooth blending algorithm
    const contours: ParsedContourWithSegments[] = [...(grad.topoContours || [])]
      .sort((a, b) => a.elevation - b.elevation)
      .map((c) => ({
        elevation: c.elevation,
        path2d: new Path2D(c.path),
        segments: flattenToSegments(c.path, 8),
      }));

    const stops: ParsedColorStop[] = (grad.stopsWithOklch || []).map((s) => ({
      offset: s.offset,
      rgba: cssColorToLinearRGBA(s.color),
    }));

    if (stops.length === 0) return null;

    const gw = grad.topoWidth || w;
    const gh = grad.topoHeight || h;
    const imageData = ctx.createImageData(pw, ph);
    const data = imageData.data;

    const easingFn = getEasingFn((grad.topoEasing || 'linear') as EasingName);
    const bw = Math.min(gw, gh) * 0.08; // bandwidth: half-width of transition zone

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        // Map pixel to gradient coordinate space
        const gx = (px / pw) * gw;
        const gy = (py / ph) * gh;

        // Smooth signed-distance blending: process contours lowest to highest
        let elevation = 0;
        for (const c of contours) {
          const inside = ctx.isPointInPath(c.path2d, gx, gy);
          const uDist = minDistToSegments(gx, gy, c.segments);
          const sd = inside ? -uDist : uDist;

          const rawBlend = Math.max(0, Math.min(1, 0.5 - sd / (2 * bw)));
          const blend = easingFn(rawBlend);
          elevation = elevation * (1 - blend) + c.elevation * blend;
        }

        // Sample color ramp
        const color = sampleRamp(stops, elevation);
        const idx = (py * pw + px) * 4;
        data[idx] = Math.round(Math.min(1, Math.max(0, color[0])) * 255);
        data[idx + 1] = Math.round(Math.min(1, Math.max(0, color[1])) * 255);
        data[idx + 2] = Math.round(Math.min(1, Math.max(0, color[2])) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL ? canvas.toDataURL('image/png') : null;
  } catch (e: unknown) {
    console.warn('[GradientService] Topo Canvas 2D fallback failed:', (e as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Topo Laplace Canvas 2D fallback — 4x downscale Jacobi + bilinear upsample
// ---------------------------------------------------------------------------

function renderTopoLaplaceCanvas2D(grad: GradientOutput, w: number, h: number, scale: number): string | null {
  try {
    scale = clampScale(w, h, scale, MAX_CANVAS_2D_DIM);
    const pw = w * scale;
    const ph = h * scale;
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const iterations = grad.topoIterations ?? 200;

    const contours: ParsedContour[] = [...(grad.topoContours || [])]
      .sort((a, b) => a.elevation - b.elevation)
      .map((c) => ({ elevation: c.elevation, path2d: new Path2D(c.path) }));

    const stops: ParsedColorStop[] = (grad.stopsWithOklch || []).map((s) => ({
      offset: s.offset,
      rgba: cssColorToLinearRGBA(s.color),
    }));

    if (stops.length === 0) return null;

    const gw = grad.topoWidth || w;
    const gh = grad.topoHeight || h;
    const easingFn = getEasingFn((grad.topoEasing || 'linear') as EasingName);

    // Adaptive solve resolution (same formula as WebGPU path)
    const maxDim = Math.max(gw, gh);
    const solveDim = Math.min(maxDim, Math.max(16, Math.ceil(iterations * 0.9)));
    const solveScale = solveDim / maxDim;
    const lw = Math.max(16, Math.ceil(gw * solveScale));
    const lh = Math.max(16, Math.ceil(gh * solveScale));

    // Shared CPU Laplace solver (Gauss-Seidel + SOR)
    const spreadVal = grad.topoBlend ?? 1.0;
    const src = laplaceSolveCPU(contours, gw, gh, lw, lh, iterations, spreadVal);

    // --- Bilinear upsample to full resolution + color ramp ---
    const imageData = ctx.createImageData(pw, ph);
    const data = imageData.data;

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        // Map full-res pixel to low-res coordinates
        const lxf = ((px + 0.5) / pw) * lw - 0.5;
        const lyf = ((py + 0.5) / ph) * lh - 0.5;

        // Bilinear sample
        const x0 = Math.max(0, Math.floor(lxf));
        const y0 = Math.max(0, Math.floor(lyf));
        const x1 = Math.min(lw - 1, x0 + 1);
        const y1 = Math.min(lh - 1, y0 + 1);
        const fx = lxf - x0;
        const fy = lyf - y0;

        const e00 = src[y0 * lw + x0];
        const e10 = src[y0 * lw + x1];
        const e01 = src[y1 * lw + x0];
        const e11 = src[y1 * lw + x1];

        const elev = e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy;

        // Apply easing AFTER solve (post-process)
        const easedElev = easingFn(Math.max(0, Math.min(1, elev)));

        // Sample color ramp
        const color = sampleRamp(stops, easedElev);
        const idx = (py * pw + px) * 4;
        data[idx] = Math.round(Math.min(1, Math.max(0, color[0])) * 255);
        data[idx + 1] = Math.round(Math.min(1, Math.max(0, color[1])) * 255);
        data[idx + 2] = Math.round(Math.min(1, Math.max(0, color[2])) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL ? canvas.toDataURL('image/png') : null;
  } catch (e: unknown) {
    console.warn('[GradientService] Topo Laplace Canvas 2D fallback failed:', (e as Error).message);
    return null;
  }
}

/** Minimum distance from point to any segment in a Float32Array [x1,y1,x2,y2,...] */
function minDistToSegments(px: number, py: number, segments: Float32Array): number {
  let minDist = Infinity;
  for (let i = 0; i < segments.length; i += 4) {
    const ax = segments[i];
    const ay = segments[i + 1];
    const bx = segments[i + 2];
    const by = segments[i + 3];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0.0001) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const dist = Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/** Get easing function by name */
function getEasingFn(name: string): EasingFn {
  switch (name) {
    case 'smoothstep':
      return (t: number) => t * t * (3 - 2 * t);
    case 'ease-in':
      return (t: number) => t * t;
    case 'ease-out':
      return (t: number) => 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
    default:
      return (t: number) => t; // linear
  }
}

/** Sample a color ramp at a given elevation */
function sampleRamp(stops: ParsedColorStop[], elevation: number): number[] {
  if (stops.length === 0) return [0.5, 0.5, 0.5];
  if (stops.length === 1 || elevation <= stops[0].offset) return stops[0].rgba;
  if (elevation >= stops[stops.length - 1].offset) return stops[stops.length - 1].rgba;

  for (let i = 0; i < stops.length - 1; i++) {
    if (elevation >= stops[i].offset && elevation <= stops[i + 1].offset) {
      const range = stops[i + 1].offset - stops[i].offset;
      const t = range > 0.0001 ? (elevation - stops[i].offset) / range : 0;
      return [
        stops[i].rgba[0] + (stops[i + 1].rgba[0] - stops[i].rgba[0]) * t,
        stops[i].rgba[1] + (stops[i + 1].rgba[1] - stops[i].rgba[1]) * t,
        stops[i].rgba[2] + (stops[i + 1].rgba[2] - stops[i].rgba[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1].rgba;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Shared 1x1 canvas for CSS color to RGBA conversion. */
let _colorCanvas: HTMLCanvasElement | null = null;
let _colorCtx: CanvasRenderingContext2D | null = null;

/**
 * Parse any CSS color string to linear RGBA [0,1] values.
 * Uses the browser's CSS color parser via Canvas 2D fillStyle.
 */
function cssColorToLinearRGBA(color: string): number[] {
  if (!_colorCanvas) {
    _colorCanvas = document.createElement('canvas');
    _colorCanvas.width = 1;
    _colorCanvas.height = 1;
    _colorCtx = _colorCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  }

  _colorCtx!.clearRect(0, 0, 1, 1);
  _colorCtx!.fillStyle = color;
  _colorCtx!.fillRect(0, 0, 1, 1);
  const data = _colorCtx!.getImageData(0, 0, 1, 1).data;

  return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
}

/**
 * Convert a canvas to a data URL (PNG).
 * All WebGPU render paths use DOM canvas, so toDataURL() is always available.
 */
async function canvasToDataURL(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Extended GradientOutput type for runtime properties not in the type definition
// ---------------------------------------------------------------------------

/**
 * GradientOutput with the `interpolation` field that is present at runtime
 * but not yet declared in the compiler type definitions.
 */
interface GradientOutputExtended extends GradientOutput {
  interpolation?: string;
}

// ---------------------------------------------------------------------------
// Public service object
// ---------------------------------------------------------------------------

/** Singleton service instance for convenient import. */
export const gpuGradientService = {
  init,
  isGPUActive,
  renderConicGradients,
  renderFreeformGradients,
  renderMeshGradients,
  renderTopoGradients,
  clearCache,
};

export default gpuGradientService;
