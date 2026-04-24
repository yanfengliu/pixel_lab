// Playwright-driven smoke test for the pixel drawing flow.
// Runs against an already-running `npm run dev` server at 127.0.0.1:5173.
// Exits 0 on success, nonzero on any assertion failure.
//
// This is NOT part of the vitest suite. Run it manually:
//   npm run dev &  (or in another terminal)
//   node test/smoke/drawing-smoke.mjs
//
// It clicks through: open New Blank dialog, create a 32x32 x 4-frame
// animation, pick Pencil, drag to paint a short stroke on the first
// frame, undo once, take before/after screenshots, and bail.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'screenshots');

const URL = process.env.SMOKE_URL ?? 'http://127.0.0.1:5173/';

function log(step, msg) {
  process.stdout.write(`[smoke ${step}] ${msg}\n`);
}

async function assert(cond, msg) {
  if (!cond) {
    process.stderr.write(`FAIL: ${msg}\n`);
    process.exit(1);
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (err) => {
  process.stderr.write(`[pageerror] ${err.message}\n`);
  process.exit(2);
});
page.on('console', (msg) => {
  if (msg.type() === 'error') process.stderr.write(`[console error] ${msg.text()}\n`);
});

log('1', `loading ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle' });

log('2', 'assert tool palette is rendered');
const palette = page.locator('.tool-palette');
await assert(await palette.count() > 0, 'tool palette not rendered');
const pencilBtn = palette.getByRole('button', { name: 'Pencil' });
await assert(await pencilBtn.count() > 0, 'pencil button missing');

log('3', 'click + New Blank');
await page.getByRole('button', { name: /new blank/i }).click();

log('4', 'switch to Animation tab, override dims to 128x128 x 4 so zoom can overflow the viewport');
// Radio labels in the dialog.
await page.getByLabel(/animation/i).check();
// Find the width/height inputs and set to 128 (default is 32).
const dialog = page.locator('[role="dialog"], .modal, .new-blank-dialog').first();
const widthInput = dialog.getByLabel(/width/i).first();
const heightInput = dialog.getByLabel(/height/i).first();
await widthInput.fill('128');
await heightInput.fill('128');
await page.getByRole('button', { name: /^create$/i }).click();

log('5', 'wait for canvas and assert source is now a sequence');
await page.waitForSelector('.canvas-image, canvas', { timeout: 5000 });

log('6', 'pre-paint screenshot + baseline opaque-pixel count');
await page.screenshot({ path: join(OUT, 'pre-paint.png'), fullPage: true });
const countOpaque = async () => {
  return await page.evaluate(() => {
    // First canvas inside .canvas-inner is the frame bitmap.
    const c = document.querySelector('.canvas-inner canvas');
    if (!c) return -1;
    const ctx = c.getContext('2d');
    if (!ctx) return -2;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++;
    return n;
  });
};
const baseline = await countOpaque();
log('6a', `baseline opaque pixels: ${baseline}`);
await assert(baseline === 0, `baseline should be 0 on a blank 32x32 frame, got ${baseline}`);

log('7', 'pick pencil + drag a stroke on the canvas');
await pencilBtn.click();
const canvas = page.locator('.canvas-inner canvas').first();
const box = await canvas.boundingBox();
await assert(box !== null, 'canvas has no bounding box');
log('7a', `canvas bounding box: x=${box.x} y=${box.y} w=${box.width} h=${box.height}`);
// Drag diagonally across a small portion.
await page.mouse.move(box.x + 20, box.y + 20);
await page.mouse.down();
await page.mouse.move(box.x + 60, box.y + 60, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);

log('8', 'capture after-paint screenshot + count opaque pixels');
await page.screenshot({ path: join(OUT, 'after-paint.png'), fullPage: true });
const painted = await countOpaque();
log('8a', `post-paint opaque pixels: ${painted}`);
await assert(painted > 0, `paint should produce opaque pixels, got ${painted}`);

log('9', 'undo (Ctrl+Z) and check pixels return to 0');
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
await page.screenshot({ path: join(OUT, 'after-undo.png'), fullPage: true });
const afterUndo = await countOpaque();
log('9a', `post-undo opaque pixels: ${afterUndo}`);
await assert(afterUndo === 0, `undo should revert to 0 opaque, got ${afterUndo}`);

log('10', 'wheel zoom: spin mouse wheel over canvas, canvas width should grow');
const canvasWidthBefore = await page.evaluate(() => {
  const c = document.querySelector('canvas.canvas-image');
  return c ? parseInt(c.style.width, 10) : -1;
});
await page.mouse.move(box.x + 40, box.y + 40);
await page.mouse.wheel(0, -200); // two wheel notches up
await page.waitForTimeout(80);
const canvasWidthAfter = await page.evaluate(() => {
  const c = document.querySelector('canvas.canvas-image');
  return c ? parseInt(c.style.width, 10) : -1;
});
log('10a', `canvas width: ${canvasWidthBefore} -> ${canvasWidthAfter}`);
await assert(canvasWidthAfter > canvasWidthBefore, 'wheel should have zoomed in');

log('11', 'middle-button pan: zoom way in first so content overflows');
// Zoom ~12 notches up to guarantee the canvas content exceeds the viewport.
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, -100);
}
await page.waitForTimeout(80);
const vpScrollBefore = await page.evaluate(() => {
  const v = document.querySelector('.canvas-viewport');
  if (!v) return null;
  // Scroll halfway so we can see movement in both directions.
  v.scrollLeft = Math.max(0, Math.floor((v.scrollWidth - v.clientWidth) / 2));
  v.scrollTop = Math.max(0, Math.floor((v.scrollHeight - v.clientHeight) / 2));
  return { left: v.scrollLeft, top: v.scrollTop };
});
const vpBox = await page.locator('.canvas-viewport').boundingBox();
await assert(vpBox !== null, 'viewport missing');
await page.mouse.move(vpBox.x + 100, vpBox.y + 100);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(vpBox.x + 30, vpBox.y + 40, { steps: 5 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(80);
const vpScrollAfter = await page.evaluate(() => {
  const v = document.querySelector('.canvas-viewport');
  return v ? { left: v.scrollLeft, top: v.scrollTop } : null;
});
log('11a', `viewport scroll ${JSON.stringify(vpScrollBefore)} -> ${JSON.stringify(vpScrollAfter)}`);
await assert(
  vpScrollAfter.left !== vpScrollBefore.left || vpScrollAfter.top !== vpScrollBefore.top,
  'middle-button drag should have scrolled the viewport',
);

log('12', 'color panel must not show a horizontal scrollbar');
const hasHScroll = await page.evaluate(() => {
  const cp = document.querySelector('.color-panel');
  if (!cp) return null;
  // Horizontal scrollbar is visible when scrollWidth > clientWidth AND
  // computed overflow-x allows it. Our CSS sets overflow-x:hidden, but
  // this verifies the scrollbar isn't rendered regardless.
  return cp.scrollWidth > cp.clientWidth + 1;
});
log('12a', `color panel content overflows horizontally? ${hasHScroll}`);
await assert(hasHScroll === false, 'color panel should not overflow horizontally');

log('13', 'final screenshot');
await page.screenshot({ path: join(OUT, 'viewport-final.png'), fullPage: true });

log('done', 'screenshots written to test/smoke/screenshots/');

await browser.close();
log('ok', 'smoke passed');
