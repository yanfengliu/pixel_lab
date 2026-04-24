import type { RawImage } from '../core/image';

/**
 * Render a RawImage into an existing HTMLCanvasElement. Uses `putImageData`
 * which is pixel-perfect; combined with the CSS `image-rendering: pixelated`
 * on canvas, zoomed displays stay sharp.
 *
 * In environments without a working 2D context (notably jsdom without the
 * optional `canvas` package, which every `test/ui/*` jsdom suite hits),
 * the call is a no-op. React tests exercise the mount path for free —
 * they don't need pixel-accurate canvas output.
 */
export function drawImageToCanvas(
  canvas: HTMLCanvasElement,
  img: RawImage,
): void {
  canvas.width = img.width;
  canvas.height = img.height;
  let ctx: CanvasRenderingContext2D | null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    // jsdom throws "Not implemented" when the canvas package is absent.
    return;
  }
  if (!ctx) return;
  const imageData = ctx.createImageData(img.width, img.height);
  imageData.data.set(img.data);
  ctx.putImageData(imageData, 0, 0);
}
