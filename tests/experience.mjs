import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const base = process.env.SIM_URL || 'http://localhost:5173';

function harness(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const advance = (ms) => page.evaluate((value) => window.advanceTime(value), ms);
  const click = (id) => page.locator(id).click({ force: true });
  return { errors, state, advance, click };
}

async function openPage(context) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__cybercabPause = true;
  });
  page.setDefaultTimeout(120000);
  const started = Date.now();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  let last = '';
  while (Date.now() - started < 90000) {
    last = await page.evaluate(() => JSON.stringify({
      hook: typeof window.advanceTime,
      boot: document.getElementById('boot-status')?.textContent ?? null,
      retry: document.getElementById('boot-retry')?.hasAttribute('hidden') ?? null,
    }));
    const snap = JSON.parse(last);
    if (snap.hook === 'function' && snap.boot === null) return page;
    await page.waitForTimeout(1000);
  }
  throw new Error(`sim did not become ready: ${last}`);
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await openPage(desktop);
const { errors, state, advance, click } = harness(page);

const overlap = await page.evaluate(() => {
  const phone = document.querySelector('#phone').getBoundingClientRect();
  const hud = document.querySelector('.hud').getBoundingClientRect();
  const width = Math.max(0, Math.min(phone.right, hud.right) - Math.max(phone.left, hud.left));
  const height = Math.max(0, Math.min(phone.bottom, hud.bottom) - Math.max(phone.top, hud.top));
  return width * height;
});
assert.ok(overlap < 50, `phone overlaps the speedometer by ${overlap} px²`);

await page.selectOption('#destination', 'roundrock');
assert.equal(await page.locator('#request').isDisabled(), true);
await page.selectOption('#destination', 'congress');
assert.equal(await page.locator('#request').isDisabled(), false);

const closed = await state();
await click('#request');
assert.equal((await state()).phase, 'dispatch');
await click('#cancel');
assert.equal((await state()).phase, 'explore');
await click('#request');
await advance(14000);
const picked = await state();
assert.equal(picked.phase, 'pickup');
assert.ok(picked.door > 0.45, `door did not open (${picked.door})`);
assert.ok(picked.doorSpan > 1.2 && picked.doorSpan < 2.8, `open door span exploded (${picked.doorSpan})`);
assert.ok(picked.doorTop > closed.doorTop + 0.04, `door did not rise (${closed.doorTop} -> ${picked.doorTop})`);
await click('#cancel');
assert.equal((await state()).phase, 'explore');

await click('#request');
await advance(14000);
await click('#enter');
await advance(400);
const seated = await state();
assert.equal(seated.phase, 'boarded');
assert.equal(seated.camera, 'cabin');
assert.ok(seated.cameraLocal[1] > 0.95 && seated.cameraLocal[1] < 1.2, `cabin eye height ${seated.cameraLocal[1]}`);
assert.ok(Math.abs(seated.cameraLocal[0]) < 0.45, `cabin eye x ${seated.cameraLocal[0]}`);
assert.ok(seated.cameraLocal[2] > -0.05 && seated.cameraLocal[2] < 0.25, `cabin eye z ${seated.cameraLocal[2]}`);
await click('#start-ride');
assert.equal((await state()).phase, 'boarded', 'start stays gated until the belt is on');
await click('#buckle');
await advance(1600);
await click('#start-ride');
assert.equal((await state()).phase, 'ride');
await page.keyboard.press('p');
assert.equal((await state()).phoneVisible, true);
await page.evaluate(() => sessionStorage.removeItem('cybercab-ride'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.advanceTime === 'function' && !document.getElementById('boot'), null, { timeout: 90000 });

async function confirmInView(width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.advanceTime(16));
  await page.locator('#request').scrollIntoViewIfNeeded();
  const box = await page.locator('#request').boundingBox();
  assert.ok(box, `request missing at ${width}x${height}`);
  assert.ok(box.y >= 0 && box.y + box.height <= height + 1, `request off-screen at ${width}x${height} (${box.y}, ${box.height})`);
}
await confirmInView(320, 568);
await confirmInView(844, 390);

await page.evaluate(() => sessionStorage.setItem('cybercab-ride', JSON.stringify({
  v: 1, phase: 'dispatch', distance: 40, belted: false, paused: false, temperature: 21,
  muted: false, destinationId: 'congress', phoneVisible: true,
})));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.advanceTime === 'function');
assert.equal((await state()).phase, 'dispatch');
await click('#cancel');

assert.deepEqual(errors, []);
await desktop.close();

const touch = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  deviceScaleFactor: 1,
});
const phonePage = await openPage(touch);
const touchUi = harness(phonePage);
await touchUi.click('#walk-around');
await touchUi.advance(32);
assert.equal(await phonePage.locator('#stick').isVisible(), true);
const before = await touchUi.state();
const stick = await phonePage.locator('#stick').boundingBox();
await phonePage.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
await phonePage.mouse.down();
await phonePage.mouse.move(stick.x + stick.width / 2, stick.y + 16);
await touchUi.advance(500);
await phonePage.mouse.up();
const after = await touchUi.state();
const moved = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
assert.ok(moved > 0.4, `thumbstick walk was dead (${moved.toFixed(2)} m)`);
assert.deepEqual(touchUi.errors, []);
await touch.close();

const calm = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  reducedMotion: 'reduce',
});
const calmPage = await openPage(calm);
const calmUi = harness(calmPage);
await calmUi.click('#request');
await calmUi.advance(14000);
const snapped = await calmUi.state();
assert.equal(snapped.phase, 'pickup');
assert.ok(snapped.door > 0.95, `reduced motion left the door mid-swing (${snapped.door})`);
assert.deepEqual(calmUi.errors, []);
await calm.close();

console.log('PASS: layout, destination, cancel-at-curb, belt, door, cabin eye, small screens, restore, thumbstick, reduced motion.');
await Promise.race([
  browser.close(),
  new Promise((resolve) => setTimeout(resolve, 4000)),
]);
process.exit(0);
