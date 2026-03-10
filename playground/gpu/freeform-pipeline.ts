// Freeform (IDW) gradient WebGPU render pipeline
// Caches per-device; recreates after device loss recovery.

import { FREEFORM_FRAGMENT_WGSL, FREEFORM_VERTEX_WGSL } from './freeform-shader.js';
import { getDevice } from './webgpu-device.js';

export interface FreeformPipelineResult {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  format: GPUTextureFormat;
}

let cachedFreeformPipeline: GPURenderPipeline | null = null;
let freeformPipelineDevice: GPUDevice | null = null;
let cachedFreeformFormat: GPUTextureFormat | null = null;

/**
 * Get or create the freeform gradient render pipeline.
 * Returns null if WebGPU is not available.
 * Caches per-device (recreates if device changes due to loss/recovery).
 */
export async function getFreeformPipeline(): Promise<FreeformPipelineResult | null> {
  const device = await getDevice();
  if (!device) return null;

  const format: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();

  // Recreate if device changed (e.g., after device loss recovery)
  if (cachedFreeformPipeline && freeformPipelineDevice === device && cachedFreeformFormat === format) {
    return { device, pipeline: cachedFreeformPipeline, format };
  }

  try {
    const vertexModule: GPUShaderModule = device.createShaderModule({ code: FREEFORM_VERTEX_WGSL });
    const fragmentModule: GPUShaderModule = device.createShaderModule({ code: FREEFORM_FRAGMENT_WGSL });

    cachedFreeformPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: vertexModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fs_main',
        targets: [
          {
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
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    freeformPipelineDevice = device;
    cachedFreeformFormat = format;
    return { device, pipeline: cachedFreeformPipeline, format };
  } catch (e) {
    console.warn('[WebGPU] Failed to create freeform pipeline:', (e as Error).message);
    cachedFreeformPipeline = null;
    freeformPipelineDevice = null;
    cachedFreeformFormat = null;
    return null;
  }
}
