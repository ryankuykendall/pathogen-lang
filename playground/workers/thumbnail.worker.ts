// Thumbnail Web Worker
// Receives an ImageBitmap (potentially supersampled) and produces PNG Blobs
// at multiple sizes via OffscreenCanvas with high-quality downscaling.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerSelf = self as any;

workerSelf.onmessage = async (e: MessageEvent) => {
  const { bitmap, sizes } = e.data as { bitmap: ImageBitmap; sizes: number[] };

  try {
    const results: Record<number, Blob> = {};

    // Step-down halving for high-quality downscaling: repeatedly halve until
    // we're within 2x of the target, then do one final draw to the exact size.
    // This avoids the quality loss of a single large-ratio drawImage.
    let src: ImageBitmap = bitmap;

    // Sort sizes descending so we progressively downscale
    const sorted = [...sizes].sort((a, b) => b - a);

    for (const size of sorted) {
      // Step-down halve from current source until within 2x of target
      while (src.width > size * 2) {
        const halfW = Math.max(size, Math.ceil(src.width / 2));
        const halfH = Math.max(size, Math.ceil(src.height / 2));
        const half = new OffscreenCanvas(halfW, halfH);
        const hCtx = half.getContext('2d')!;
        hCtx.imageSmoothingEnabled = true;
        hCtx.imageSmoothingQuality = 'high';
        hCtx.drawImage(src, 0, 0, halfW, halfH);
        if (src !== bitmap) (src as ImageBitmap).close?.();
        src = await createImageBitmap(half);
      }

      // Final draw to target size
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(src, 0, 0, size, size);
      results[size] = await canvas.convertToBlob({ type: 'image/png' });
    }

    if (src !== bitmap) (src as ImageBitmap).close?.();
    bitmap.close();
    workerSelf.postMessage({ success: true, results });
  } catch (err) {
    bitmap.close();
    workerSelf.postMessage({ success: false, error: (err as Error).message });
  }
};
