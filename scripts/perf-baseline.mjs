/**
 * Headless perf sample for the Cybercab sim.
 * Measures (1) CPU sim step cost via advanceTime and (2) a short live rAF window.
 * Usage: node scripts/perf-baseline.mjs [url] [label]
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/?preset=medium&force=1';
const label = process.argv[3] ?? 'baseline';
const outDir = '/opt/cursor/artifacts';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(90_000);
await page.addInitScript(() => {
  sessionStorage.removeItem('cybercab-ride');
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
await page.waitForTimeout(500);

const metrics = await page.evaluate(async () => {
  const summarize = (list, unit = 'ms') => {
    if (!list.length) return { n: 0, avg: 0, p50: 0, p95: 0 };
    const sorted = [...list].sort((a, b) => a - b);
    const avg = list.reduce((s, v) => s + v, 0) / list.length;
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      n: list.length,
      [`avg${unit}`]: +avg.toFixed(2),
      [`p50${unit}`]: +pct(0.5).toFixed(2),
      [`p95${unit}`]: +pct(0.95).toFixed(2),
    };
  };

  // CPU-only: step the sim without waiting on GPU present.
  const stepCosts = [];
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    window.advanceTime(50);
    stepCosts.push(performance.now() - t0);
  }

  // Live frames for up to 4s or 45 samples, whichever first.
  const frameDts = await new Promise((resolve) => {
    const samples = [];
    let last = performance.now();
    const start = last;
    let warmed = 0;
    const tick = (now) => {
      const dt = now - last;
      last = now;
      warmed += 1;
      if (warmed > 5) samples.push(dt);
      if (samples.length >= 45 || now - start > 4000) resolve(samples);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const state = JSON.parse(window.render_game_to_text());
  return {
    cpuStep50ms: summarize(stepCosts, 'Ms'),
    liveFrame: {
      ...summarize(frameDts, 'Ms'),
      fpsAvg: frameDts.length
        ? +(1000 / (frameDts.reduce((s, v) => s + v, 0) / frameDts.length)).toFixed(1)
        : 0,
    },
    phase: state.phase,
    distance: state.distance,
  };
});

const path = `${outDir}/perf-${label}.json`;
writeFileSync(path, JSON.stringify({ url, label, metrics, at: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ url, label, metrics }, null, 2));
await browser.close();
