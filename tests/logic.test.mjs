import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DESTINATIONS, blockedSpeed, defaultQuality, doorTarget, parseSnapshot, pixelRatioFor,
  pointInRing, shadowMapSize, stepDoor, stepPedestrian, togglePhone,
} from '../src/logic.ts';

const geo = fs.readFileSync(new URL('../src/geo.ts', import.meta.url), 'utf8');
const ring = Function(`return ${geo.match(/export const AUSTIN_ROBOTAXI_GEOFENCE: \[number, number\]\[\] = (\[[\s\S]*?\]);/)[1]}`)();

test('door stroke matches the show-car close and the glTF hinge', () => {
  assert.equal(stepDoor(1, 0, 1.5, false), 0);
  const almost = stepDoor(1, 0, 1.4, false);
  assert.ok(almost > 0.05 && almost < 0.08, `1.4 s should still be shut enough to start (${almost})`);
  assert.equal(stepDoor(0, 1, 0.75, false), 0.5);
  assert.equal(stepDoor(0.2, 1, 1, true), 1);
  assert.equal(doorTarget('pickup', 0, false, false), 1);
  assert.equal(doorTarget('dispatch', 0.1, false, false, false), 0);
  assert.equal(doorTarget('dispatch', 0.1, false, false, true), 1);
  assert.equal(doorTarget('boarded', 1, false, false), 1);
  assert.equal(doorTarget('boarded', 1, true, false), 0);
  assert.equal(doorTarget('arrived', 1, true, false), 0);
  assert.equal(doorTarget('arrived', 1, true, true), 1);
  assert.equal(doorTarget('ride', 2, true, false), 0);
  const vehicle = fs.readFileSync(new URL('../src/vehicle.ts', import.meta.url), 'utf8');
  assert.match(vehicle, /door_open/);
  assert.match(vehicle, /door-hinge-r/);
  assert.doesNotMatch(vehicle, /doorAngle/);
  assert.doesNotMatch(vehicle, /function doorHinge/);
});

test('a blocker never raises the cab speed', () => {
  assert.equal(blockedSpeed(12, false, 2), 12);
  assert.ok(blockedSpeed(12, true, 4) < 12);
  assert.ok(blockedSpeed(3, true, 1) <= 3);
  const main = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /blockedFor\s*>=\s*5/);
  assert.match(main, /blockedSpeed/);
});

test('pedestrians do not start a crossing into the cab', () => {
  const started = stepPedestrian(
    { crossing: false, t: 0, dist: 100 },
    { dt: 0.5, cabDist: 60, red: true, nearCross: true, wantStart: true, routeLength: 400 },
  );
  assert.equal(started.crossing, true);
  const intoCab = stepPedestrian(
    { crossing: false, t: 0, dist: 100 },
    { dt: 0.5, cabDist: 100, red: true, nearCross: true, wantStart: true, routeLength: 400 },
  );
  assert.equal(intoCab.crossing, false);
  const abort = stepPedestrian(
    { crossing: true, t: 0.2, dist: 100 },
    { dt: 0.1, cabDist: 104, red: true, nearCross: true, wantStart: false, routeLength: 400 },
  );
  assert.equal(abort.crossing, false);
  assert.equal(abort.t, 0);
});

test('pixel ratio, shadows, Auto, and graphics persistence', () => {
  assert.equal(defaultQuality({ software: true, coarse: false }), 'low');
  assert.equal(defaultQuality({ software: false, coarse: true }), 'low');
  assert.equal(defaultQuality({ software: false, coarse: false }), 'medium');
  assert.equal(pixelRatioFor(3, 'ultra', { software: true, coarse: false }), 1);
  assert.equal(pixelRatioFor(3, 'low', { software: false, coarse: false }), 1);
  assert.equal(pixelRatioFor(3, 'medium', { software: false, coarse: false }), 1.25);
  assert.equal(pixelRatioFor(3, 'ultra', { software: false, coarse: true }), 1.25);
  assert.equal(pixelRatioFor(3, 'ultra', { software: false, coarse: false }), 1.75);
  assert.equal(pixelRatioFor(1, 'ultra', { software: false, coarse: false }), 1);
  assert.equal(shadowMapSize('low', false), 0);
  assert.equal(shadowMapSize('ultra', true), 1024);
  assert.equal(shadowMapSize('ultra', false), 2048);
});

test('sample destinations honor the service-area ring', () => {
  const byId = Object.fromEntries(DESTINATIONS.map((item) => [item.id, item]));
  assert.equal(pointInRing(byId.congress.lon, byId.congress.lat, ring), true);
  assert.equal(pointInRing(byId.airport.lon, byId.airport.lat, ring), true);
  assert.equal(pointInRing(byId.roundrock.lon, byId.roundrock.lat, ring), false);
});

test('phone toggle is ignored during the ride and snapshots reject junk', () => {
  assert.deepEqual(togglePhone('ride', true), { visible: true, ignored: true });
  assert.deepEqual(togglePhone('explore', true), { visible: false, ignored: false });
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot('nope'), null);
  assert.equal(parseSnapshot(JSON.stringify({ v: 1, phase: 'explore', distance: 10 })), null);
  const saved = parseSnapshot(JSON.stringify({
    v: 1, phase: 'dispatch', distance: 40, belted: false, paused: false, temperature: 30,
    muted: true, destinationId: 'roundrock', phoneVisible: false,
  }));
  assert.equal(saved.phase, 'dispatch');
  assert.equal(saved.temperature, 28);
  assert.equal(saved.destinationId, 'roundrock');
  assert.equal(saved.phoneVisible, false);
});
