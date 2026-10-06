import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GRAPHICS_KEY, PRESET_GRAPHICS, QUALITY_ORDER, adaptQuality, autoQualityPreset, emptyAdaptState,
  graphicsFor, parseGraphicsStore, resolvedQuality, streetBudget,
} from '../src/logic.ts';

test('Auto picks a hardware-aware preset and never starts software GL above Low', () => {
  assert.equal(autoQualityPreset({ software: true, coarse: false }), 'low');
  assert.equal(autoQualityPreset({ software: false, coarse: true, deviceMemory: 4 }), 'low');
  assert.equal(autoQualityPreset({ software: false, coarse: false, gpu: 'NVIDIA GeForce RTX 4070', deviceMemory: 16, cores: 12 }), 'ultra');
  assert.equal(autoQualityPreset({ software: false, coarse: false, gpu: 'Intel Iris', deviceMemory: 8, cores: 4 }), 'medium');
  assert.equal(resolvedQuality('high', { software: false, coarse: false }), 'high');
  assert.equal(resolvedQuality('auto', { software: true, coarse: false }), 'low');
});

test('adaptQuality steps down on slow frames and up on sustained fast frames', () => {
  let state = emptyAdaptState();
  let current = /** @type {const} */ ('high');
  let changed = /** @type {'up'|'down'|null} */ (null);
  for (let i = 0; i < 2; i++) {
    const next = adaptQuality(current, 0.03, state);
    current = next.preset;
    state = next.state;
    changed = next.changed;
  }
  assert.equal(current, 'medium');
  assert.equal(changed, 'down');
  current = 'medium';
  state = emptyAdaptState();
  for (let i = 0; i < 4; i++) {
    const next = adaptQuality(current, 0.01, state);
    current = next.preset;
    state = next.state;
    changed = next.changed;
  }
  assert.equal(current, 'high');
  assert.equal(changed, 'up');
  const cooled = adaptQuality('high', 0.03, { slowWindows: 0, fastWindows: 0, cooldown: 2 });
  assert.equal(cooled.preset, 'high');
  assert.equal(cooled.changed, null);
});

test('graphics store and preset toggles stay valid', () => {
  assert.equal(parseGraphicsStore(null), null);
  assert.equal(parseGraphicsStore('nope'), null);
  const saved = parseGraphicsStore(JSON.stringify({
    v: 1, mode: 'auto', overrides: { shadows: false, aa: false, post: true, reflections: 'probe' },
  }));
  assert.equal(saved.mode, 'auto');
  assert.equal(saved.overrides.shadows, false);
  assert.equal(saved.overrides.reflections, 'probe');
  const merged = graphicsFor('low', { shadows: true });
  assert.equal(merged.shadows, true);
  assert.equal(PRESET_GRAPHICS.low.shadows, false);
  assert.deepEqual(QUALITY_ORDER, ['low', 'medium', 'high', 'ultra']);
  assert.equal(GRAPHICS_KEY, 'cybercab-graphics');
});

test('low street budget is lighter than ultra', () => {
  const low = streetBudget('low');
  const ultra = streetBudget('ultra');
  assert.ok(low.movingCars < ultra.movingCars);
  assert.ok(low.peds < ultra.peds);
  assert.equal(low.scans, false);
  assert.equal(ultra.scans, true);
});

test('bundled street models and licenses are recorded', () => {
  const md = fs.readFileSync(new URL('../docs/ASSETS.md', import.meta.url), 'utf8');
  assert.match(md, /kenney.nl\/assets\/car-kit/i);
  assert.match(md, /CC0/);
  assert.match(md, /Mixamo/);
  assert.match(md, /polyhaven.com\/a\/fire_hydrant/);
  for (const file of [
    'public/models/cars/sedan.glb',
    'public/models/cars/suv.glb',
    'public/models/people/soldier.glb',
    'public/models/people/xbot.glb',
    'public/models/props/tree-large.glb',
    'public/models/props/lamp.glb',
    'public/models/props/bench.glb',
  ]) {
    assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), file);
  }
  const vehicle = fs.readFileSync(new URL('../src/vehicle.ts', import.meta.url), 'utf8');
  assert.match(vehicle, /models\/cybercab\.glb/);
  assert.doesNotMatch(vehicle, /createStreetAssets/);
});
