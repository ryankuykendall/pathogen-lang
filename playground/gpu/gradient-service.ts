// Gradient Rendering Service
// Orchestrates WebGPU rendering with Canvas 2D fallback and LRU caching.

import type { GradientOutput, GradientStop } from '../types/compiler.js';
import { getConicPipeline } from './conic-pipeline.js';
import { getFreeformPipeline } from './freeform-pipeline.js';
import { COLOR_POINT_STRIDE, FREEFORM_PARAMS_SIZE } from './freeform-shader.js';
import { getMeshPipeline } from './mesh-pipeline.js';
import { MESH_PARAMS_SIZE, MESH_VERTEX_STRIDE } from './mesh-shader.js';
import { flattenToSegments } from './svg-path-parser.js';
import { withGpuErrorScopes } from './gpu-error-scopes.js';
import { MAX_CANVAS_2D_DIM, rasterSize, type RasterSize } from './raster-size.js';
import { hashGradient, TextureCache, type RenderPath } from './texture-cache.js';
import { getTopoLaplacePipeline } from './topo-laplace-pipeline.js';
import {
  LAPLACE_INIT_PARAMS_SIZE,
  LAPLACE_JACOBI_PARAMS_SIZE,
  LAPLACE_RENDER_PARAMS_SIZE,
} from './topo-laplace-shader.js';
import { getTopoPipeline } from './topo-pipeline.js';
import { CONTOUR_HEADER_STRIDE, SEGMENT_STRIDE, TOPO_COLOR_STOP_STRIDE, TOPO_PARAMS_SIZE } from './topo-shader.js';
import { destroyDevice, getDevice, getMaxTextureDimension2D, isWebGPUAvailable } from './webgpu-device.js';

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

/**
 * u32 shader mode for an easing name: its index in the compiler's curve table
 * (src/stdlib/easing-curves.ts, served as window.PathogenLang.EASING_ORDER).
 * Unknown or missing names fall back to 0 (linear). Read lazily so this module
 * keeps no load-order dependency on the bundle.
 */
function easingModeFor(name: string | undefined): number {
  const index = window.PathogenLang.easingModeIndex(name || 'linear');
  return index < 0 ? 0 : index;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const cache = new TextureCache(32);

let _gpuAvailable: boolean | null = null;
let _gpuForcedOff = false;
let _initialized = false;
let _initPromise: Promise<void> | null = null;

/** GPU cache keys whose render failed this session — skip straight to Canvas 2D for them. */
const gpuFailed = new Set<string>();
/** Notice text remembered per 2D cache key, re-issued on cache hits so a fallback stays visible. */
const noticeByKey = new Map<string, string>();

/** One console line, shaped like the compiler's own `[warn]` log entries. */
export interface GradientNotice {
  line: null;
  severity: 'warn';
  parts: { type: 'string'; value: string }[];
}
const MAX_NOTICES = 64;
const _notices: GradientNotice[] = [];

/** Queue a warning for the Pathogen console (drained by `takeNotices`). */
export function pushNotice(message: string): void {
  if (_notices.length >= MAX_NOTICES) return;
  _notices.push({ line: null, severity: 'warn', parts: [{ type: 'string', value: `[warn] ${message}` }] });
}

/** Return and clear the notices accumulated since the last call. */
export function takeNotices(): GradientNotice[] {
  return _notices.splice(0, _notices.length);
}

/**
 * `?gpu=off` in the URL or `localStorage.pathogenForceCanvas2D = '1'` forces
 * the Canvas 2D path — the way to check how a program renders in a browser
 * without WebGPU, or to exercise the fallback while working on it.
 */
function canvas2DForced(): boolean {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('gpu') === 'off') return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('pathogenForceCanvas2D') === '1') return true;
  } catch {
    // Storage or URL access can throw in sandboxed contexts; treat as not forced.
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the gradient service. Probes WebGPU availability.
 * Safe to call multiple times (no-op after first).
 */
export async function init(): Promise<void> {
  if (_initialized) return _initPromise ?? undefined;
  _initialized = true;
  _initPromise = (async () => {
    if (canvas2DForced()) {
      _gpuAvailable = false;
      _gpuForcedOff = true;
      console.log('[GradientService] WebGPU disabled by ?gpu=off / localStorage.pathogenForceCanvas2D — using Canvas 2D');
      return;
    }
    _gpuAvailable = await isWebGPUAvailable();
    if (_gpuAvailable) {
      // Create the device now so the first texture is keyed on its real limit.
      await getDevice();
      console.log(
        `[GradientService] WebGPU available — gradients render via GPU (max texture ${getMaxTextureDimension2D()}px)`,
      );
    } else {
      console.log('[GradientService] WebGPU not available — falling back to Canvas 2D');
    }
  })();
  return _initPromise;
}

/** Whether WebGPU rendering is active. */
export function isGPUActive(): boolean {
  return _gpuAvailable === true;
}

/** Human-readable family name for notices. */
type GradientFamily = 'conic' | 'freeform' | 'mesh' | 'topo';

interface FamilySpec {
  family: GradientFamily;
  /** Per-gradient raster extent in user units (mesh/freeform/topo carry their own). */
  extent: (grad: GradientOutput, width: number, height: number) => [number, number];
  gpu: (grad: GradientOutput, w: number, h: number, size: RasterSize) => Promise<string | null>;
  cpu: (grad: GradientOutput, w: number, h: number, size: RasterSize) => string | null;
  /** Properties the Canvas 2D path only approximates, named in the fallback notice. */
  cpuCaveat?: string;
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Render every gradient of one family: cache lookup keyed on the post-clamp
 * texture size and the path that produced it, WebGPU first (unless it already
 * failed for this key), Canvas 2D on any thrown error, and a Pathogen-console
 * notice whenever the fallback runs or both paths fail. A failed render is
 * never cached, so a blank image can never be served twice.
 */
async function renderFamily(
  spec: FamilySpec,
  gradients: GradientOutput[],
  width: number,
  height: number,
  scale: number,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const members = gradients.filter((g) => g.type === spec.family);
  if (members.length === 0) return result;
  await init();

  for (const grad of members) {
    const [gw, gh] = spec.extent(grad, width, height);
    const gpuSize = rasterSize(gw, gh, scale, getMaxTextureDimension2D());
    const cpuSize = rasterSize(gw, gh, scale, MAX_CANVAS_2D_DIM);
    const gpuKey = hashGradient(grad, gpuSize.pw, gpuSize.ph, 'gpu');
    const cpuKey = hashGradient(grad, cpuSize.pw, cpuSize.ph, '2d');
    const tryGpu = _gpuAvailable === true && !gpuFailed.has(gpuKey);

    if (tryGpu) {
      const hit = cache.get(gpuKey);
      if (hit) {
        result.set(grad.id, hit);
        continue;
      }
    }
    const cpuHit = cache.get(cpuKey);
    if (cpuHit) {
      const remembered = noticeByKey.get(cpuKey);
      if (remembered) pushNotice(remembered);
      result.set(grad.id, cpuHit);
      continue;
    }

    let dataUrl: string | null = null;
    let path: RenderPath = '2d';
    let gpuReason: string | null = null;

    if (tryGpu) {
      if (gpuSize.scale < scale) {
        console.warn(
          `[GradientService] ${spec.family} '${grad.id}': ${Math.round(gw * scale)}×${Math.round(gh * scale)} exceeds the ${getMaxTextureDimension2D()}px texture limit; rendering at ${gpuSize.pw}×${gpuSize.ph} (${gpuSize.scale.toFixed(3)}× per unit)`,
        );
      }
      try {
        dataUrl = await spec.gpu(grad, gw, gh, gpuSize);
        if (dataUrl === null) throw new Error('renderer produced no image');
        path = 'gpu';
      } catch (e: unknown) {
        gpuReason = describeError(e);
        gpuFailed.add(gpuKey);
        console.warn(`[GradientService] ${spec.family} '${grad.id}' WebGPU render failed, falling back to Canvas 2D:`, gpuReason);
        dataUrl = null;
      }
    }

    if (dataUrl === null) {
      try {
        dataUrl = spec.cpu(grad, gw, gh, cpuSize);
      } catch (e: unknown) {
        console.warn(`[GradientService] ${spec.family} '${grad.id}' Canvas 2D render failed:`, describeError(e));
        dataUrl = null;
      }
      if (dataUrl === null) {
        const why = gpuReason ? `WebGPU: ${gpuReason}; Canvas 2D also failed` : 'Canvas 2D failed';
        pushNotice(`Gradient '${grad.id}' (${spec.family}) could not be rasterized (${why}); fills using it will render empty.`);
        continue;
      }
      // Say so when WebGPU was expected (it failed) or deliberately switched
      // off; a browser with no WebGPU at all gets no per-compile nag.
      if (_gpuAvailable === true || _gpuForcedOff) {
        const caveat = spec.cpuCaveat ? ` ${spec.cpuCaveat}` : '';
        const why = gpuReason
          ? `WebGPU failed: ${gpuReason}`
          : 'WebGPU disabled by ?gpu=off / localStorage.pathogenForceCanvas2D';
        const msg = `Gradient '${grad.id}' (${spec.family}) rendered with the Canvas 2D fallback — ${why}.${caveat}`;
        noticeByKey.set(cpuKey, msg);
        pushNotice(msg);
      }
    }

    cache.set(path === 'gpu' ? gpuKey : cpuKey, dataUrl);
    result.set(grad.id, dataUrl);
  }

  return result;
}

const CONIC_FAMILY: FamilySpec = {
  family: 'conic',
  extent: (_grad, width, height) => [width, height],
  gpu: renderConicWebGPU,
  cpu: renderConicCanvas2D,
  cpuCaveat: 'Canvas 2D draws the same 1° wedges as the CLI, so innerRadius, innerFill and spread are approximated rather than shaded per pixel.',
};
const FREEFORM_FAMILY: FamilySpec = {
  family: 'freeform',
  extent: (grad, width, height) => [grad.freeformWidth || width, grad.freeformHeight || height],
  gpu: renderFreeformWebGPU,
  cpu: renderFreeformCanvas2D,
};
const MESH_FAMILY: FamilySpec = {
  family: 'mesh',
  extent: (grad, width, height) => [grad.meshWidth || width, grad.meshHeight || height],
  gpu: renderMeshWebGPU,
  cpu: renderMeshCanvas2D,
};
const TOPO_FAMILY: FamilySpec = {
  family: 'topo',
  extent: (grad, width, height) => [grad.topoWidth || width, grad.topoHeight || height],
  gpu: renderTopoWebGPU,
  cpu: renderTopoCanvas2D,
};

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
  return renderFamily(CONIC_FAMILY, gradients, width, height, scale);
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
  return renderFamily(FREEFORM_FAMILY, gradients, width, height, scale);
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
  return renderFamily(MESH_FAMILY, gradients, width, height, scale);
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
  return renderFamily(TOPO_FAMILY, gradients, width, height, scale);
}

/** Clear the texture cache. Call on cleanup / disconnectedCallback. */
export function clearCache(): void {
  cache.clear();
  gpuFailed.clear();
  noticeByKey.clear();
}

/** Throw before touching the canvas when a texture cannot fit the device. */
function assertWithinDeviceLimit(device: GPUDevice, pw: number, ph: number, label: string): void {
  const limit = device.limits.maxTextureDimension2D;
  if (pw > limit || ph > limit) {
    throw new Error(`${label}: texture ${pw}×${ph} exceeds maxTextureDimension2D ${limit}`);
  }
}

// ---------------------------------------------------------------------------
// WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single conic gradient via WebGPU.
 */
async function renderConicWebGPU(grad: GradientOutput, w: number, h: number, size: RasterSize): Promise<string> {
  const pipelineResult = await getConicPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const { scale, pw, ph } = size;
  assertWithinDeviceLimit(device, pw, ph, 'conic');
  return withGpuErrorScopes(device, 'conic', () => {

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
      innerFillRGBA = cssColorToRGBA(innerFill);
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
      const rgba = cssColorToRGBA(stops[i].color);
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
    const dataUrl = canvas.toDataURL('image/png');

    // Cleanup GPU resources
    uniformBuffer.destroy();
    stopBuffer.destroy();

    return dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Freeform WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single freeform gradient via WebGPU.
 */
async function renderFreeformWebGPU(grad: GradientOutput, w: number, h: number, size: RasterSize): Promise<string> {
  const pipelineResult = await getFreeformPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Freeform pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const { scale, pw, ph } = size;
  assertWithinDeviceLimit(device, pw, ph, 'freeform');
  return withGpuErrorScopes(device, 'freeform', () => {

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
      const rgba = cssColorToRGBA(points[i].color);
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

    const dataUrl = canvas.toDataURL('image/png');

    uniformBuffer.destroy();
    pointBuffer.destroy();

    return dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Mesh WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single mesh gradient via WebGPU.
 */
async function renderMeshWebGPU(grad: GradientOutput, w: number, h: number, size: RasterSize): Promise<string> {
  const pipelineResult = await getMeshPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Mesh pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const { scale, pw, ph } = size;
  assertWithinDeviceLimit(device, pw, ph, 'mesh');
  return withGpuErrorScopes(device, 'mesh', () => {

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
        const rgba = cssColorToRGBA(pt.color);
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

    const dataUrl = canvas.toDataURL('image/png');

    uniformBuffer.destroy();
    vertexBuffer.destroy();

    return dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Canvas 2D fallbacks
// ---------------------------------------------------------------------------

/**
 * Render a single freeform gradient via Canvas 2D (pixel-by-pixel IDW).
 */
function renderFreeformCanvas2D(grad: GradientOutput, w: number, h: number, size: RasterSize): string | null {
  try {
    const { pw, ph } = size;
    // Always use DOM canvas for 2D fallback — OffscreenCanvas lacks toDataURL()
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const points = (grad.freeformPoints || []).map((p) => ({
      x: p.x,
      y: p.y,
      rgba: cssColorToRGBA(p.color),
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
    throw e;
  }
}

/**
 * Render a single mesh gradient via Canvas 2D (pixel-by-pixel bilinear patches).
 */
function renderMeshCanvas2D(grad: GradientOutput, w: number, h: number, size: RasterSize): string | null {
  try {
    const { pw, ph } = size;
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
        rgba: cssColorToRGBA(p.color),
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
    throw e;
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
 *
 * Draws the same 1° wedges the CLI emits (`window.PathogenLang.renderConic`,
 * the shared port of the shader's rules), so this fallback, the CLI and the
 * VS Code preview agree exactly; only the WebGPU shader is smoother. The
 * blended inner fills use the same five-stop radial curve the CLI emits as
 * SVG — as an overlay for `'center'`/custom colors and as a destination-out
 * erase for `'transparent-blend'`.
 *
 * Exported so the last-resort decorator can share it. Throws on failure.
 */
export function renderConicCanvas2D(grad: GradientOutput, w: number, h: number, size: RasterSize): string | null {
  const { scale, pw, ph } = size;
  const lib = window.PathogenLang;
  const cx = grad.cx ?? w / 2;
  const cy = grad.cy ?? h / 2;
  const render = lib.renderConic({
    cx,
    cy,
    from: grad.from ?? 0,
    to: grad.to ?? (grad.from ?? 0) + 2 * Math.PI,
    direction: grad.direction ?? 'cw',
    spread: grad.spread ?? 'clamp',
    stops: grad.stopsWithOklch || grad.stops || [],
    viewWidth: w,
    viewHeight: h,
    innerRadius: grad.innerRadius ?? 0,
    innerFill: grad.innerFill,
  });

  // Always use DOM canvas for 2D fallback — OffscreenCanvas lacks toDataURL()
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context');

  ctx.scale(scale, scale);
  for (const wedge of render.wedges) {
    ctx.fillStyle = wedge.fill;
    ctx.fill(new Path2D(wedge.d));
  }

  if (render.innerOverlay) {
    const base = lib.cssToRGBA(render.innerOverlay.color);
    const ramp = ctx.createRadialGradient(cx, cy, 0, cx, cy, render.innerOverlay.radius);
    for (const stop of render.innerOverlay.stops) {
      ramp.addColorStop(stop.offset, lib.rgbaToCSS([base[0], base[1], base[2], base[3] * stop.opacity]));
    }
    ctx.fillStyle = ramp;
    ctx.beginPath();
    ctx.arc(cx, cy, render.innerOverlay.radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  if (render.innerMask) {
    // Erase toward the center: the mask keeps `luminance`, so erase 1 − luminance.
    const ramp = ctx.createRadialGradient(cx, cy, 0, cx, cy, render.innerMask.radius);
    for (const stop of render.innerMask.stops) {
      ramp.addColorStop(stop.offset, `rgba(0, 0, 0, ${Math.round((1 - stop.luminance) * 1000) / 1000})`);
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = ramp;
    ctx.beginPath();
    ctx.arc(cx, cy, render.innerMask.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas.toDataURL ? canvas.toDataURL('image/png') : null;
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
  size: RasterSize,
): Promise<string | null> {
  if ((grad.topoMethod || 'distance') === 'laplace') {
    return renderTopoLaplaceWebGPU(grad, w, h, size);
  }
  const pipelineResult = await getTopoPipeline() as RenderPipelineResult | null;
  if (!pipelineResult) throw new Error('Topo pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const { scale, pw, ph } = size;
  assertWithinDeviceLimit(device, pw, ph, 'topo');
  return withGpuErrorScopes(device, 'topo', () => {

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
    const easingVal = easingModeFor(grad.topoEasing);
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
      const rgba = cssColorToRGBA(stops[i].color);
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

    const dataUrl = canvas.toDataURL('image/png');

    // Cleanup GPU resources
    uniformBuffer.destroy();
    headerBuffer.destroy();
    segmentBuffer.destroy();
    stopBuffer.destroy();

    return dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Topo Laplace WebGPU — Jacobi solver via compute shaders
// ---------------------------------------------------------------------------

async function renderTopoLaplaceWebGPU(
  grad: GradientOutput,
  w: number,
  h: number,
  size: RasterSize,
): Promise<string | null> {
  const pipelineResult = await getTopoLaplacePipeline() as LaplacePipelineResult | null;
  if (!pipelineResult) throw new Error('Topo Laplace pipeline unavailable');
  const { device, renderPipeline, format } = pipelineResult;

  const { scale, pw, ph } = size;
  assertWithinDeviceLimit(device, pw, ph, 'topo-laplace');
  return withGpuErrorScopes(device, 'topo-laplace', () => {
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

    const easingVal = easingModeFor(grad.topoEasing);
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
      const rgba = cssColorToRGBA(stops[i].color);
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

    const dataUrl = canvas.toDataURL('image/png');

    // Cleanup
    renderUniformBuffer.destroy();
    stopBuffer.destroy();
    elevationTex.destroy();

    return dataUrl;
  });
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
function renderTopoCanvas2D(grad: GradientOutput, w: number, h: number, size: RasterSize): string | null {
  if ((grad.topoMethod || 'distance') === 'laplace') {
    return renderTopoLaplaceCanvas2D(grad, w, h, size);
  }
  try {
    const { pw, ph } = size;
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
      rgba: cssColorToRGBA(s.color),
    }));

    if (stops.length === 0) return null;

    const gw = grad.topoWidth || w;
    const gh = grad.topoHeight || h;
    const imageData = ctx.createImageData(pw, ph);
    const data = imageData.data;

    const easingFn = getEasingFn(grad.topoEasing);
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
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Topo Laplace Canvas 2D fallback — 4x downscale Jacobi + bilinear upsample
// ---------------------------------------------------------------------------

function renderTopoLaplaceCanvas2D(grad: GradientOutput, w: number, h: number, size: RasterSize): string | null {
  try {
    const { pw, ph } = size;
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
      rgba: cssColorToRGBA(s.color),
    }));

    if (stops.length === 0) return null;

    const gw = grad.topoWidth || w;
    const gh = grad.topoHeight || h;
    const easingFn = getEasingFn(grad.topoEasing);

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
    throw e;
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

/**
 * Easing curve for the Canvas fallbacks, read from the compiler's curve table
 * (window.PathogenLang.EASING_CURVES). Mirrors the generated WGSL applyEasing:
 * input clamped to [0, 1] with exact endpoints, output clamped back onto the
 * color ramp so overshooting curves (back, elastic) hold at the edge.
 */
function getEasingFn(name: string | undefined): EasingFn {
  const curve = window.PathogenLang.EASING_CURVES[name || 'linear'] ?? ((u: number) => u);
  return (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return Math.max(0, Math.min(1, curve(u)));
  };
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
/**
 * CSS color → [r, g, b, a] in [0, 1] as the canvas reports it: gamma-encoded
 * sRGB with straight alpha, NOT linear light. The shaders mix these values
 * as-is (the canvas formats are the non-sRGB variants), so this is the space
 * `src/conic-renderer.ts` mixes in too.
 */
function cssColorToRGBA(color: string): number[] {
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
  takeNotices,
  pushNotice,
};

export default gpuGradientService;
