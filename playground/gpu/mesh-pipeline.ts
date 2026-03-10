// Mesh gradient WebGPU render pipeline
// Caches per-device; recreates after device loss recovery.

import { MESH_FRAGMENT_WGSL, MESH_VERTEX_WGSL } from './mesh-shader.js';
import { getDevice } from './webgpu-device.js';

export interface MeshPipelineResult {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  format: GPUTextureFormat;
}

let cachedMeshPipeline: GPURenderPipeline | null = null;
let meshPipelineDevice: GPUDevice | null = null;
let cachedMeshFormat: GPUTextureFormat | null = null;

/**
 * Get or create the mesh gradient render pipeline.
 * Returns null if WebGPU is not available.
 * Caches per-device (recreates if device changes due to loss/recovery).
 */
export async function getMeshPipeline(): Promise<MeshPipelineResult | null> {
  const device = await getDevice();
  if (!device) return null;

  const format: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();

  // Recreate if device changed (e.g., after device loss recovery)
  if (cachedMeshPipeline && meshPipelineDevice === device && cachedMeshFormat === format) {
    return { device, pipeline: cachedMeshPipeline, format };
  }

  try {
    const vertexModule: GPUShaderModule = device.createShaderModule({ code: MESH_VERTEX_WGSL });
    const fragmentModule: GPUShaderModule = device.createShaderModule({ code: MESH_FRAGMENT_WGSL });

    cachedMeshPipeline = device.createRenderPipeline({
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

    meshPipelineDevice = device;
    cachedMeshFormat = format;
    return { device, pipeline: cachedMeshPipeline, format };
  } catch (e) {
    console.warn('[WebGPU] Failed to create mesh pipeline:', (e as Error).message);
    cachedMeshPipeline = null;
    meshPipelineDevice = null;
    cachedMeshFormat = null;
    return null;
  }
}
