// Freeform (IDW) gradient WebGPU render pipeline
// Caches per-device; recreates after device loss recovery.

import { getDevice } from './webgpu-device.js';
import { FREEFORM_VERTEX_WGSL, FREEFORM_FRAGMENT_WGSL } from './freeform-shader.js';

let cachedFreeformPipeline = null;
let freeformPipelineDevice = null;
let cachedFreeformFormat = null;

/**
 * Get or create the freeform gradient render pipeline.
 * Returns null if WebGPU is not available.
 * Caches per-device (recreates if device changes due to loss/recovery).
 * @returns {Promise<{device: GPUDevice, pipeline: GPURenderPipeline, format: string}|null>}
 */
export async function getFreeformPipeline() {
  const device = await getDevice();
  if (!device) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();

  // Recreate if device changed (e.g., after device loss recovery)
  if (cachedFreeformPipeline && freeformPipelineDevice === device && cachedFreeformFormat === format) {
    return { device, pipeline: cachedFreeformPipeline, format };
  }

  try {
    const vertexModule = device.createShaderModule({ code: FREEFORM_VERTEX_WGSL });
    const fragmentModule = device.createShaderModule({ code: FREEFORM_FRAGMENT_WGSL });

    cachedFreeformPipeline = device.createRenderPipeline({
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

    freeformPipelineDevice = device;
    cachedFreeformFormat = format;
    return { device, pipeline: cachedFreeformPipeline, format };
  } catch (e) {
    console.warn('[WebGPU] Failed to create freeform pipeline:', e.message);
    cachedFreeformPipeline = null;
    freeformPipelineDevice = null;
    cachedFreeformFormat = null;
    return null;
  }
}
