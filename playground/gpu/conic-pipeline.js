// Conic gradient WebGPU render pipeline
// Caches per-device; recreates after device loss recovery.

import { getDevice } from './webgpu-device.js';
import { CONIC_VERTEX_WGSL, CONIC_FRAGMENT_WGSL } from './conic-shader.js';

let cachedPipeline = null;
let pipelineDevice = null;
let cachedFormat = null;

/**
 * Get or create the conic gradient render pipeline.
 * Returns null if WebGPU is not available.
 * Caches per-device (recreates if device changes due to loss/recovery).
 * @returns {Promise<{device: GPUDevice, pipeline: GPURenderPipeline, format: string}|null>}
 */
export async function getConicPipeline() {
  const device = await getDevice();
  if (!device) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();

  // Recreate if device changed (e.g., after device loss recovery)
  if (cachedPipeline && pipelineDevice === device && cachedFormat === format) {
    return { device, pipeline: cachedPipeline, format };
  }

  try {
    const vertexModule = device.createShaderModule({ code: CONIC_VERTEX_WGSL });
    const fragmentModule = device.createShaderModule({ code: CONIC_FRAGMENT_WGSL });

    cachedPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: vertexModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    pipelineDevice = device;
    cachedFormat = format;
    return { device, pipeline: cachedPipeline, format };
  } catch (e) {
    console.warn('[WebGPU] Failed to create conic pipeline:', e.message);
    cachedPipeline = null;
    pipelineDevice = null;
    cachedFormat = null;
    return null;
  }
}
