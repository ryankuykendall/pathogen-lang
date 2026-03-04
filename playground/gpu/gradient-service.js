// Gradient Rendering Service
// Orchestrates WebGPU rendering with Canvas 2D fallback and LRU caching.

import { isWebGPUAvailable, getDevice, destroyDevice } from './webgpu-device.js';
import { getConicPipeline } from './conic-pipeline.js';
import { getFreeformPipeline } from './freeform-pipeline.js';
import { getMeshPipeline } from './mesh-pipeline.js';
import { getTopoPipeline } from './topo-pipeline.js';
import { FREEFORM_PARAMS_SIZE, COLOR_POINT_STRIDE } from './freeform-shader.js';
import { MESH_PARAMS_SIZE, MESH_VERTEX_STRIDE } from './mesh-shader.js';
import { TOPO_PARAMS_SIZE, CONTOUR_HEADER_STRIDE, SEGMENT_STRIDE, TOPO_COLOR_STOP_STRIDE } from './topo-shader.js';
import { flattenToSegments } from './svg-path-parser.js';
import { TextureCache, hashGradient } from './texture-cache.js';

const cache = new TextureCache(32);

let _gpuAvailable = null;
let _initialized = false;

/**
 * Initialize the gradient service. Probes WebGPU availability.
 * Safe to call multiple times (no-op after first).
 */
export async function init() {
  if (_initialized) return;
  _initialized = true;
  _gpuAvailable = await isWebGPUAvailable();
  if (_gpuAvailable) {
    console.log('[GradientService] WebGPU available — conic gradients will render via GPU');
  } else {
    console.log('[GradientService] WebGPU not available — falling back to Canvas 2D');
  }
}

/** @returns {boolean} Whether WebGPU rendering is active. */
export function isGPUActive() {
  return _gpuAvailable === true;
}

/**
 * Render all conic gradients from a compilation result.
 * Returns a Map of gradient ID → data URL for SVG DOM injection.
 *
 * @param {object[]} gradients - GradientOutput array from compilation
 * @param {number} width - Canvas width in CSS pixels
 * @param {number} height - Canvas height in CSS pixels
 * @param {number} [scale=2] - Resolution multiplier (2 = retina)
 * @returns {Promise<Map<string, string>>} Map of gradient ID → data URL
 */
export async function renderConicGradients(gradients, width, height, scale = 2) {
  const result = new Map();
  const conics = gradients.filter(g => g.type === 'conic');
  if (conics.length === 0) return result;

  for (const grad of conics) {
    const key = hashGradient(grad, width * scale, height * scale);
    const cached = cache.get(key);
    if (cached) {
      result.set(grad.id, cached);
      continue;
    }

    let dataUrl = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderConicWebGPU(grad, width, height, scale);
      } catch (e) {
        console.warn('[GradientService] WebGPU render failed, falling back to Canvas 2D:', e.message);
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
 * Returns a Map of gradient ID → data URL for SVG DOM injection.
 *
 * @param {object[]} gradients - GradientOutput array from compilation
 * @param {number} width - Canvas width in CSS pixels
 * @param {number} height - Canvas height in CSS pixels
 * @param {number} [scale=2] - Resolution multiplier (2 = retina)
 * @returns {Promise<Map<string, string>>} Map of gradient ID → data URL
 */
export async function renderFreeformGradients(gradients, width, height, scale = 2) {
  const result = new Map();
  const freeforms = gradients.filter(g => g.type === 'freeform');
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

    let dataUrl = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderFreeformWebGPU(grad, gw, gh, scale);
      } catch (e) {
        console.warn('[GradientService] Freeform WebGPU render failed, falling back to Canvas 2D:', e.message);
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
 * Returns a Map of gradient ID → data URL for SVG DOM injection.
 *
 * @param {object[]} gradients - GradientOutput array from compilation
 * @param {number} width - Canvas width in CSS pixels
 * @param {number} height - Canvas height in CSS pixels
 * @param {number} [scale=2] - Resolution multiplier (2 = retina)
 * @returns {Promise<Map<string, string>>} Map of gradient ID → data URL
 */
export async function renderMeshGradients(gradients, width, height, scale = 2) {
  const result = new Map();
  const meshes = gradients.filter(g => g.type === 'mesh');
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

    let dataUrl = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderMeshWebGPU(grad, gw, gh, scale);
      } catch (e) {
        console.warn('[GradientService] Mesh WebGPU render failed, falling back to Canvas 2D:', e.message);
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
 * Returns a Map of gradient ID → data URL for SVG DOM injection.
 *
 * @param {object[]} gradients - GradientOutput array from compilation
 * @param {number} width - Canvas width in CSS pixels
 * @param {number} height - Canvas height in CSS pixels
 * @param {number} [scale=2] - Resolution multiplier (2 = retina)
 * @returns {Promise<Map<string, string>>} Map of gradient ID → data URL
 */
export async function renderTopoGradients(gradients, width, height, scale = 2) {
  const result = new Map();
  const topos = gradients.filter(g => g.type === 'topo');
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

    let dataUrl = null;
    if (_gpuAvailable) {
      try {
        dataUrl = await renderTopoWebGPU(grad, gw, gh, scale);
      } catch (e) {
        console.warn('[GradientService] Topo WebGPU render failed, falling back to Canvas 2D:', e.message);
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
export function clearCache() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single conic gradient via WebGPU.
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {Promise<string>} data URL
 */
async function renderConicWebGPU(grad, w, h, scale) {
  const pipelineResult = await getConicPipeline();
  if (!pipelineResult) throw new Error('Pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  // Always use DOM canvas — OffscreenCanvas lacks toDataURL(), and blob URLs
  // from createObjectURL don't render in SVG <image> elements in Shadow DOM.
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Uniform buffer (ConicParams, 64 bytes) ---
  const fromAngle = grad.from ?? 0;
  const toAngle = grad.to ?? (fromAngle + 2 * Math.PI);
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

  f32[0] = (grad.cx ?? (w / 2)) / w;  // center.x in UV space [0,1]
  f32[1] = (grad.cy ?? (h / 2)) / h;  // center.y in UV space [0,1]
  f32[2] = fromAngle;
  f32[3] = toAngle;
  f32[4] = innerRadius;
  f32[5] = direction;
  f32[6] = spreadVal;
  u32[7] = innerFillMode;              // inner_fill_mode
  f32[8] = pw;                         // resolution.x
  f32[9] = ph;                         // resolution.y
  const stops = grad.stopsWithOklch || grad.stops || [];
  u32[10] = stops.length;              // stop_count
  // u32[11] = _pad
  f32[12] = innerFillRGBA[0];          // inner_fill_color.r
  f32[13] = innerFillRGBA[1];          // inner_fill_color.g
  f32[14] = innerFillRGBA[2];          // inner_fill_color.b
  f32[15] = innerFillRGBA[3];          // inner_fill_color.a

  const uniformBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  // --- Stops storage buffer ---
  // Each ColorStop: 5 × f32 (offset, r, g, b, a) = 20 bytes, stride 20 (alignment 4)
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
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
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
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {Promise<string>} data URL
 */
async function renderFreeformWebGPU(grad, w, h, scale) {
  const pipelineResult = await getFreeformPipeline();
  if (!pipelineResult) throw new Error('Freeform pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  // Always use DOM canvas — blob URLs don't render in SVG <image> in Shadow DOM
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Uniform buffer (FreeformParams, 32 bytes) ---
  const points = grad.freeformPoints || [];
  const interpVal = (grad.interpolation === 'oklch') ? 1 : 0;

  const uniformData = new ArrayBuffer(FREEFORM_PARAMS_SIZE);
  const f32 = new Float32Array(uniformData);
  const u32 = new Uint32Array(uniformData);

  f32[0] = pw;                          // resolution.x
  f32[1] = ph;                          // resolution.y
  f32[2] = grad.freeformWidth || w;     // grad_size.x
  f32[3] = grad.freeformHeight || h;    // grad_size.y
  f32[4] = grad.falloff ?? 2.0;         // falloff
  u32[5] = points.length;               // point_count
  u32[6] = interpVal;                   // interpolation
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
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
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
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {Promise<string>} data URL
 */
async function renderMeshWebGPU(grad, w, h, scale) {
  const pipelineResult = await getMeshPipeline();
  if (!pipelineResult) throw new Error('Mesh pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  // Always use DOM canvas — blob URLs don't render in SVG <image> in Shadow DOM
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Uniform buffer (MeshParams, 32 bytes) ---
  const grid = grad.meshGrid || [];
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const interpVal = (grad.interpolation === 'oklch') ? 1 : 0;

  const uniformData = new ArrayBuffer(MESH_PARAMS_SIZE);
  const f32 = new Float32Array(uniformData);
  const u32 = new Uint32Array(uniformData);

  f32[0] = pw;                         // resolution.x
  f32[1] = ph;                         // resolution.y
  f32[2] = grad.meshWidth || w;        // grad_size.x
  f32[3] = grad.meshHeight || h;       // grad_size.y
  u32[4] = rows;                       // rows
  u32[5] = cols;                       // cols
  u32[6] = interpVal;                  // interpolation
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
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
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
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {string|null} data URL
 */
function renderFreeformCanvas2D(grad, w, h, scale) {
  try {
    const pw = w * scale;
    const ph = h * scale;
    // Always use DOM canvas for 2D fallback — OffscreenCanvas lacks toDataURL()
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const points = (grad.freeformPoints || []).map(p => ({
      x: p.x, y: p.y, rgba: cssColorToLinearRGBA(p.color),
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

        let totalR = 0, totalG = 0, totalB = 0, totalA = 0, totalWeight = 0;
        for (const pt of points) {
          const dx = gx - pt.x;
          const dy = gy - pt.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const weight = 1 / Math.pow(Math.max(d, 0.001), falloff);
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
  } catch (e) {
    console.warn('[GradientService] Freeform Canvas 2D fallback failed:', e.message);
    return null;
  }
}

/**
 * Render a single mesh gradient via Canvas 2D (pixel-by-pixel bilinear patches).
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {string|null} data URL
 */
function renderMeshCanvas2D(grad, w, h, scale) {
  try {
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
    const parsedGrid = grid.map(row => row.map(p => ({
      x: p.x, y: p.y, rgba: cssColorToLinearRGBA(p.color),
    })));

    const gw = grad.meshWidth || w;
    const gh = grad.meshHeight || h;
    const imageData = ctx.createImageData(pw, ph);
    const data = imageData.data;

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const gx = (px / pw) * gw;
        const gy = (py / ph) * gh;

        let found = false;
        let rOut = 0, gOut = 0, bOut = 0, aOut = 0;

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
  } catch (e) {
    console.warn('[GradientService] Mesh Canvas 2D fallback failed:', e.message);
    return null;
  }
}

/** CPU inverse bilinear mapping. Returns [u, v] or null. */
function inverseBilinearCPU(px, py, p00, p10, p01, p11) {
  const ex = p10.x - p00.x, ey = p10.y - p00.y;
  const fx = p01.x - p00.x, fy = p01.y - p00.y;
  const gx = p00.x - p10.x + p11.x - p01.x;
  const gy = p00.y - p10.y + p11.y - p01.y;
  const hx = px - p00.x, hy = py - p00.y;

  const k2 = gx * fy - gy * fx;
  const k1 = ex * fy - ey * fx + hx * gy - hy * gx;
  const k0 = hx * ey - hy * ex;

  if (Math.abs(k2) < 0.0001) {
    // Linear case
    const v = -k0 / k1;
    const ud = ex + gx * v;
    let u;
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
  let u;
  if (Math.abs(ud) > 0.0001) {
    u = (hx - fx * v) / ud;
  } else {
    u = (hy - fy * v) / (ey + gy * v);
  }
  return [u, v];
}

/** Linear interpolation. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep: S-curve with zero derivative at 0 and 1. */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Conic Canvas 2D fallback
// ---------------------------------------------------------------------------

/**
 * Render a single conic gradient via Canvas 2D.
 * Same algorithm as svg-preview-pane.js inline rendering.
 * Note: innerRadius is NOT supported in Canvas 2D (silently ignored).
 *
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {string|null} data URL
 */
function renderConicCanvas2D(grad, w, h, scale) {
  try {
    // Always use DOM canvas for 2D fallback — OffscreenCanvas lacks toDataURL()
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fromAngle = grad.from ?? 0;
    const toAngle = grad.to ?? (fromAngle + 2 * Math.PI);
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
  } catch (e) {
    console.warn('[GradientService] Canvas 2D fallback failed:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Topo WebGPU render path
// ---------------------------------------------------------------------------

/**
 * Render a single topo gradient via WebGPU.
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {Promise<string>} data URL
 */
async function renderTopoWebGPU(grad, w, h, scale) {
  const pipelineResult = await getTopoPipeline();
  if (!pipelineResult) throw new Error('Topo pipeline unavailable');
  const { device, pipeline, format } = pipelineResult;

  const pw = w * scale;
  const ph = h * scale;

  // --- Canvas & texture ---
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not get webgpu context');

  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Flatten contour paths to line segments ---
  // Sort contours by elevation (lowest first) for smooth blending algorithm
  const contours = [...(grad.topoContours || [])].sort((a, b) => a.elevation - b.elevation);
  const stops = grad.stopsWithOklch || [];
  const allSegments = []; // Float32Array segments per contour
  const contourHeaders = []; // { elevation, segmentStart, segmentCount }
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
  const easingMap = { 'linear': 0, 'smoothstep': 1, 'ease-in': 2, 'ease-out': 3, 'ease-in-out': 4 };
  const easingVal = easingMap[grad.topoEasing] ?? 0;
  const interpVal = (grad.interpolation === 'oklch') ? 1 : 0;

  // --- Uniform buffer (TopoParams, 32 bytes) ---
  const uniformData = new ArrayBuffer(TOPO_PARAMS_SIZE);
  const f32 = new Float32Array(uniformData);
  const u32 = new Uint32Array(uniformData);

  f32[0] = pw;                           // resolution.x
  f32[1] = ph;                           // resolution.y
  f32[2] = grad.topoWidth || w;          // grad_size.x
  f32[3] = grad.topoHeight || h;         // grad_size.y
  u32[4] = contours.length;              // contour_count
  u32[5] = stops.length;                 // stop_count
  u32[6] = easingVal;                    // easing
  u32[7] = interpVal;                    // interpolation

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
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
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
// Topo Canvas 2D fallback
// ---------------------------------------------------------------------------

/**
 * Render a single topo gradient via Canvas 2D (pixel-by-pixel SDF).
 * @param {object} grad - GradientOutput
 * @param {number} w - CSS pixel width
 * @param {number} h - CSS pixel height
 * @param {number} scale - Resolution multiplier
 * @returns {string|null} data URL
 */
function renderTopoCanvas2D(grad, w, h, scale) {
  try {
    const pw = w * scale;
    const ph = h * scale;
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Sort contours by elevation (lowest first) for smooth blending algorithm
    const contours = [...(grad.topoContours || [])]
      .sort((a, b) => a.elevation - b.elevation)
      .map(c => ({
        elevation: c.elevation,
        path2d: new Path2D(c.path),
        segments: flattenToSegments(c.path, 8),
      }));

    const stops = (grad.stopsWithOklch || []).map(s => ({
      offset: s.offset,
      rgba: cssColorToLinearRGBA(s.color),
    }));

    if (stops.length === 0) return null;

    const gw = grad.topoWidth || w;
    const gh = grad.topoHeight || h;
    const imageData = ctx.createImageData(pw, ph);
    const data = imageData.data;

    const easingFn = getEasingFn(grad.topoEasing || 'linear');
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
  } catch (e) {
    console.warn('[GradientService] Topo Canvas 2D fallback failed:', e.message);
    return null;
  }
}

/** Minimum distance from point to any segment in a Float32Array [x1,y1,x2,y2,...] */
function minDistToSegments(px, py, segments) {
  let minDist = Infinity;
  for (let i = 0; i < segments.length; i += 4) {
    const ax = segments[i], ay = segments[i + 1];
    const bx = segments[i + 2], by = segments[i + 3];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0.0001) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }
    const projX = ax + t * dx, projY = ay + t * dy;
    const dist = Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/** Get easing function by name */
function getEasingFn(name) {
  switch (name) {
    case 'smoothstep': return t => t * t * (3 - 2 * t);
    case 'ease-in': return t => t * t;
    case 'ease-out': return t => 1 - (1 - t) * (1 - t);
    case 'ease-in-out': return t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    default: return t => t; // linear
  }
}

/** Sample a color ramp at a given elevation */
function sampleRamp(stops, elevation) {
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

/** Shared 1x1 canvas for CSS color → RGBA conversion. */
let _colorCanvas = null;
let _colorCtx = null;

/**
 * Parse any CSS color string to linear RGBA [0,1] values.
 * Uses the browser's CSS color parser via Canvas 2D fillStyle.
 * @param {string} color - CSS color (hex, rgb, oklch, named, etc.)
 * @returns {number[]} [r, g, b, a] in [0,1]
 */
function cssColorToLinearRGBA(color) {
  if (!_colorCanvas) {
    _colorCanvas = document.createElement('canvas');
    _colorCanvas.width = 1;
    _colorCanvas.height = 1;
    _colorCtx = _colorCanvas.getContext('2d', { willReadFrequently: true });
  }

  _colorCtx.clearRect(0, 0, 1, 1);
  _colorCtx.fillStyle = color;
  _colorCtx.fillRect(0, 0, 1, 1);
  const data = _colorCtx.getImageData(0, 0, 1, 1).data;

  return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
}

/**
 * Convert a canvas to a data URL (PNG).
 * All WebGPU render paths use DOM canvas, so toDataURL() is always available.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<string>}
 */
async function canvasToDataURL(canvas) {
  return canvas.toDataURL('image/png');
}

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
