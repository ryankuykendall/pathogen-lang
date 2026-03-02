// WebGPU Device Singleton
// Lazy-initialized, with device-lost recovery

let gpuDevice = null;
let gpuAdapter = null;
let availabilityResult = null;

/**
 * Check if WebGPU is available in this browser.
 * Result is cached after first probe.
 * @returns {Promise<boolean>}
 */
export async function isWebGPUAvailable() {
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
 * @returns {Promise<GPUDevice|null>}
 */
export async function getDevice() {
  if (gpuDevice) return gpuDevice;

  if (!await isWebGPUAvailable()) return null;

  try {
    if (!gpuAdapter) {
      gpuAdapter = await navigator.gpu.requestAdapter();
      if (!gpuAdapter) return null;
    }

    gpuDevice = await gpuAdapter.requestDevice();

    gpuDevice.lost.then((info) => {
      console.warn('[WebGPU] Device lost:', info.message);
      gpuDevice = null;
      gpuAdapter = null;
      // Will re-initialize on next getDevice() call
    });

    return gpuDevice;
  } catch (e) {
    console.warn('[WebGPU] Failed to get device:', e.message);
    gpuDevice = null;
    return null;
  }
}

/**
 * Destroy the device and release resources.
 * Used for cleanup on page unload or test teardown.
 */
export function destroyDevice() {
  if (gpuDevice) {
    gpuDevice.destroy();
    gpuDevice = null;
  }
  gpuAdapter = null;
  availabilityResult = null;
}
