// Topological gradient WebGPU render pipeline
// Caches per-device; recreates after device loss recovery.

import { TOPO_FRAGMENT_WGSL, TOPO_VERTEX_WGSL } from './topo-shader.js';
import { getDevice } from './webgpu-device.js';

let cachedTopoPipeline = null;
let topoPipelineDevice = null;
let cachedTopoFormat = null;

/**
 * Get or create the topological gradient render pipeline.
 * Returns null if WebGPU is not available.
 * Caches per-device (recreates if device changes due to loss/recovery).
 * @returns {Promise<{device: GPUDevice, pipeline: GPURenderPipeline, format: string}|null>}
 */
export async function getTopoPipeline() {
  const device = await getDevice();
  if (!device) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();

  // Recreate if device changed (e.g., after device loss recovery)
  if (cachedTopoPipeline && topoPipelineDevice === device && cachedTopoFormat === format) {
    return { device, pipeline: cachedTopoPipeline, format };
  }

  try {
    const vertexModule = device.createShaderModule({ code: TOPO_VERTEX_WGSL });
    const fragmentModule = device.createShaderModule({ code: TOPO_FRAGMENT_WGSL });

    cachedTopoPipeline = device.createRenderPipeline({
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

    topoPipelineDevice = device;
    cachedTopoFormat = format;
    return { device, pipeline: cachedTopoPipeline, format };
  } catch (e) {
    console.warn('[WebGPU] Failed to create topo pipeline:', e.message);
    cachedTopoPipeline = null;
    topoPipelineDevice = null;
    cachedTopoFormat = null;
    return null;
  }
}
