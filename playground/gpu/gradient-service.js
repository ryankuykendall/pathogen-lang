// Gradient Rendering Service
// Orchestrates WebGPU rendering with Canvas 2D fallback and LRU caching.

import { isWebGPUAvailable, getDevice, destroyDevice } from './webgpu-device.js';
import { getConicPipeline } from './conic-pipeline.js';
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
  let canvas, context;
  try {
    canvas = new OffscreenCanvas(pw, ph);
    context = canvas.getContext('webgpu');
  } catch {
    // OffscreenCanvas + webgpu context unsupported — use DOM canvas
    canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    context = canvas.getContext('webgpu');
  }
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
// Canvas 2D fallback
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
    let canvas;
    try {
      canvas = new OffscreenCanvas(w * scale, h * scale);
    } catch {
      canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
    }

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
 * Convert a canvas (regular or OffscreenCanvas) to a data URL.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @returns {Promise<string>}
 */
async function canvasToDataURL(canvas) {
  if (canvas.toDataURL) {
    return canvas.toDataURL('image/png');
  }

  // OffscreenCanvas → Blob → data URL via FileReader
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/** Singleton service instance for convenient import. */
export const gpuGradientService = {
  init,
  isGPUActive,
  renderConicGradients,
  clearCache,
};

export default gpuGradientService;
