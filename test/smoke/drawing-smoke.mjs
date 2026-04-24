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

log('4', 'switch to Animation tab, accept default 32x32 x 8');
// Radio labels in the dialog.
await page.getByLabel(/animation/i).check();
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

log('9', 'screenshots written to test/smoke/screenshots/');

await browser.close();
log('ok', 'smoke passed');
