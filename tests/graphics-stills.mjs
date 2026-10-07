/**
 * Force High and Ultra on SwiftShader and save street and cabin stills.
 *
 *   SIM_URL=http://127.0.0.1:4173 node tests/graphics-stills.mjs
 *
 * The page reads ?preset=high|ultra&force=1 and does not fall back to Low.
 * Stills land in output/graphics/ unless STILLS_DIR is set.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.SIM_URL || 'http://127.0.0.1:4173';
const outDir = process.env.STILLS_DIR || path.resolve('output/graphics');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function shoot(preset) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(() => { window.__cybercabPause = true; });
  page.setDefaultTimeout(180000);
  await page.goto(`${base}/?preset=${preset}&force=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && !document.getElementById('boot'), null, { timeout: 180000 });
  await page.evaluate(() => window.advanceTime(400));
  const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(state.quality, preset, `${preset} was clamped to ${state.quality}`);
  assert.equal(state.forcedPreset, preset);
  // A paused SwiftShader canvas is presented black to a page screenshot.
  // The drawing buffer itself is intact when preserveDrawingBuffer is set.
  async function saveCanvas(file, frame) {
    const uri = await page.evaluate((eye) => {
      if (eye) window.frameVehicle(eye.eye, eye.look);
      else window.advanceTime(0);
      return document.querySelector('#scene').toDataURL('image/png');
    }, frame);
    const body = uri.slice(uri.indexOf(',') + 1);
    fs.writeFileSync(file, Buffer.from(body, 'base64'));
  }
  const street = path.join(outDir, `${preset}-street.png`);
  await saveCanvas(street, { eye: [3.4, 1.55, 5.6], look: [0.1, 0.72, -0.4] });
  const cabin = path.join(outDir, `${preset}-cabin.png`);
  await saveCanvas(cabin, { eye: [0.05, 1.05, 0.12], look: [0.05, 1.02, -3.2] });
  const webgl = errors.filter((line) => /webgl|context|shader|ssr|csm/i.test(line));
  await context.close();
  return { preset, quality: state.quality, reflections: state.reflections, cascades: state.cascades, street, cabin, webgl };
}

const results = [];
for (const preset of ['high', 'ultra']) results.push(await shoot(preset));
await browser.close();
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
