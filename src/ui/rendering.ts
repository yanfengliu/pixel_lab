import type { RawImage } from '../core/image';

/**
 * Render a RawImage into an existing HTMLCanvasElement. Uses `putImageData`
 * which is pixel-perfect; combined with the CSS `image-rendering: pixelated`
 * on canvas, zoomed displays stay sharp.
 */
export function drawImageToCanvas(
  canvas: HTMLCanvasElement,
  img: RawImage,
): void {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('drawImageToCanvas: failed to get 2d context');
  const imageData = ctx.createImageData(img.width, img.height);
  imageData.data.set(img.data);
  ctx.putImageData(imageData, 0, 0);
}
