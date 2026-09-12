// WebGPU Device Singleton
// Lazy-initialized, with device-lost recovery

import { DEFAULT_GPU_MAX_DIM } from './raster-size.js';

/**
 * Largest texture edge we ask the adapter for. Adapters commonly allow 16384,
 * but a 16384-wide PNG readback is already tens of MB and seconds of
 * main-thread `toDataURL`, so we do not go past it even where the hardware
 * would.
 */
const REQUESTED_MAX_TEXTURE_DIM = 16384;

let gpuDevice: GPUDevice | null = null;
let gpuAdapter: GPUAdapter | null = null;
let availabilityResult: boolean | null = null;
let _devicePromise: Promise<GPUDevice | null> | null = null;

/**
 * Check if WebGPU is available in this browser.
 * Result is cached after first probe.
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (availabilityResult !== null) return availabilityResult;

  if (!navigator.gpu) {
    availabilityResult = false;
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    availabilityResult = adapter !== null;
    if (adapter) gpuAdapter = adapter;
    return availabilityResult;
  } catch {
    availabilityResult = false;
    return false;
  }
}

/**
 * Get the WebGPU device singleton.
 * Lazy-initializes on first call. Recovers from device loss.
 */
export async function getDevice(): Promise<GPUDevice | null> {
  if (gpuDevice) return gpuDevice;

  // Deduplicate concurrent calls — only the first creates the device,
  // all others await the same promise. Prevents "adapter is consumed" errors
  // when multiple pipelines call getDevice() in parallel via Promise.all().
  if (_devicePromise) return _devicePromise;

  _devicePromise = _createDevice();
  try {
    return await _devicePromise;
  } finally {
    _devicePromise = null;
  }
}

async function _createDevice(): Promise<GPUDevice | null> {
  if (!(await isWebGPUAvailable())) return null;

  try {
    if (!gpuAdapter) {
      gpuAdapter = await navigator.gpu.requestAdapter();
      if (!gpuAdapter) return null;
    }

    // Ask for the adapter's texture limit (capped, see above); the spec
    // default is only 8192, which reduces large viewBoxes to a quarter of the
    // resolution the hardware could give. Fall back to a plain request if the
    // adapter rejects the limits (it must not exceed what it advertises).
    const wanted = Math.min(gpuAdapter.limits.maxTextureDimension2D, REQUESTED_MAX_TEXTURE_DIM);
    try {
      gpuDevice = await gpuAdapter.requestDevice({ requiredLimits: { maxTextureDimension2D: wanted } });
    } catch (limitErr: unknown) {
      console.warn('[WebGPU] requestDevice with limits failed, retrying with defaults:', (limitErr as Error).message);
      gpuDevice = await gpuAdapter.requestDevice();
    }

    gpuDevice.lost.then((info: GPUDeviceLostInfo) => {
      console.warn('[WebGPU] Device lost:', info.message);
      gpuDevice = null;
      gpuAdapter = null;
      // Will re-initialize on next getDevice() call
    });
    // Anything that escapes a render's error scopes (compositor / swapchain
    // messages) still shows up here instead of vanishing into DevTools.
    gpuDevice.addEventListener('uncapturederror', (ev: Event) => {
      const err = (ev as GPUUncapturedErrorEvent).error;
      console.warn('[WebGPU] Uncaptured error:', err.message);
    });

    return gpuDevice;
  } catch (e: unknown) {
    console.warn('[WebGPU] Failed to get device:', (e as Error).message);
    gpuDevice = null;
    return null;
  }
}

/**
 * The largest texture edge the current device accepts, or WebGPU's default
 * until a device exists. Raster sizes are clamped against this.
 */
export function getMaxTextureDimension2D(): number {
  return gpuDevice?.limits.maxTextureDimension2D ?? DEFAULT_GPU_MAX_DIM;
}

/**
 * Destroy the device and release resources.
 * Used for cleanup on page unload or test teardown.
 */
export function destroyDevice(): void {
  if (gpuDevice) {
    gpuDevice.destroy();
    gpuDevice = null;
  }
  gpuAdapter = null;
  availabilityResult = null;
}
