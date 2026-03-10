// Topological gradient Laplace-solver WebGPU pipeline
// Three cached pipelines: init (compute), Jacobi iteration (compute), render (fragment).
// Caches per-device; recreates after device loss recovery.

import { TOPO_LAPLACE_INIT_WGSL, TOPO_LAPLACE_JACOBI_WGSL, TOPO_LAPLACE_RENDER_WGSL } from './topo-laplace-shader.js';
import { TOPO_VERTEX_WGSL } from './topo-shader.js';
import { getDevice } from './webgpu-device.js';

interface CachedLaplacePipelines {
  initPipeline: GPUComputePipeline;
  jacobiPipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
}

export interface TopoLaplacePipelineResult extends CachedLaplacePipelines {
  device: GPUDevice;
  format: GPUTextureFormat;
}

let cached: CachedLaplacePipelines | null = null;
let cachedDevice: GPUDevice | null = null;
let cachedFormat: GPUTextureFormat | null = null;

/**
 * Get or create the Laplace-solver topological gradient pipelines.
 * Returns null if WebGPU is not available.
 * Caches per-device (recreates if device changes due to loss/recovery).
 */
export async function getTopoLaplacePipeline(): Promise<TopoLaplacePipelineResult | null> {
  const device = await getDevice();
  if (!device) return null;

  const format: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();

  // Recreate if device changed (e.g., after device loss recovery)
  if (cached && cachedDevice === device && cachedFormat === format) {
    return { device, ...cached, format };
  }

  try {
    const initModule: GPUShaderModule = device.createShaderModule({ code: TOPO_LAPLACE_INIT_WGSL });
    const jacobiModule: GPUShaderModule = device.createShaderModule({ code: TOPO_LAPLACE_JACOBI_WGSL });
    const vertexModule: GPUShaderModule = device.createShaderModule({ code: TOPO_VERTEX_WGSL });
    const renderModule: GPUShaderModule = device.createShaderModule({ code: TOPO_LAPLACE_RENDER_WGSL });

    const initPipeline: GPUComputePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: initModule, entryPoint: 'main' },
    });

    const jacobiPipeline: GPUComputePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: jacobiModule, entryPoint: 'main' },
    });

    const renderPipeline: GPURenderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: vertexModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: renderModule,
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

    cached = { initPipeline, jacobiPipeline, renderPipeline };
    cachedDevice = device;
    cachedFormat = format;
    return { device, initPipeline, jacobiPipeline, renderPipeline, format };
  } catch (e) {
    console.warn('[WebGPU] Failed to create topo-laplace pipeline:', (e as Error).message);
    cached = null;
    cachedDevice = null;
    cachedFormat = null;
    return null;
  }
}
