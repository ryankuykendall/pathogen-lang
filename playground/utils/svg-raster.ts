/**
 * Rasterize a serialized SVG document to a PNG blob at an exact pixel size,
 * over a white backdrop. Shared by the thumbnail service's detail-page hero
 * and the snapshot card thumbnails.
 *
 * The SVG is loaded through an <img> from a blob URL, so it is decoded as an
 * image: scripts never run and external resources are not fetched.
 */
export async function rasterizeSvgString(svgString: string, outW: number, outH: number): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load SVG image'));
      image.src = url;
    });
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(outW, outH);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      return await canvas.convertToBlob({ type: 'image/png' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Aspect-fit (w, h) into a box whose longest edge is `maxDim`, never upscaling. */
export function aspectFit(w: number, h: number, maxDim: number): { width: number; height: number } {
  const safeW = w > 0 ? w : 200;
  const safeH = h > 0 ? h : 200;
  const scale = Math.min(1, maxDim / Math.max(safeW, safeH));
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}
