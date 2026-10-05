import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync(new URL('../public/data/austin.json', import.meta.url)));
const geo = fs.readFileSync(new URL('../src/geo.ts', import.meta.url), 'utf8');

test('bundled geographic snapshot preserves real features and valid coordinates', () => {
  assert.ok(data.roads.length > 1000);
  assert.ok(data.buildings.length > 1000);
  assert.ok(data.water.length > 0);
  for (const type of ['roads', 'buildings', 'water']) for (const feature of data[type]) {
    assert.ok(feature.coordinates.length >= 2);
    for (const [lon, lat] of feature.coordinates) {
      assert.ok(Number.isFinite(lon) && lon > -99 && lon < -96);
      assert.ok(Number.isFinite(lat) && lat > 29 && lat < 32);
    }
  }
});

test('ride corridor uses surveyed Congress Avenue vertices', () => {
  const match = geo.match(/export const CONGRESS_ROUTE: \[number, number\]\[\] = (\[[\s\S]*?\]);/);
  assert.ok(match);
  const route = Function(`return ${match[1]}`)();
  const points = new Set(data.roads.filter(r => r.name === 'Congress Avenue').flatMap(r => r.coordinates.map(p => JSON.stringify(p))));
  assert.ok(route.length > 10);
  for (const point of route) assert.ok(points.has(JSON.stringify(point)));
  for (let i = 1; i < route.length; i++) assert.ok(route[i][1] >= route[i - 1][1]);
});

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

test('downtown pickup and dropoff sit inside the reported Austin Robotaxi geofence', () => {
  const match = geo.match(/export const AUSTIN_ROBOTAXI_GEOFENCE: \[number, number\]\[\] = (\[[\s\S]*?\]);/);
  assert.ok(match);
  const ring = Function(`return ${match[1]}`)();
  assert.equal(ring[0][0], ring[ring.length - 1][0]);
  assert.ok(pointInRing(-97.7442121, 30.2643199, ring));
  assert.ok(pointInRing(-97.7424606, 30.2689964, ring));
  assert.ok(pointInRing(-97.67, 30.197, ring), 'AUS airport envelope');
  assert.equal(pointInRing(-97.678, 30.508, ring), false, 'Round Rock stays outside');
});

test('Megalamp match color is documented for pickup identification', () => {
  assert.match(geo, /Violet/);
  assert.match(geo, /#c24bff/);
  const vehicle = fs.readFileSync(new URL('../src/vehicle.ts', import.meta.url), 'utf8');
  assert.match(vehicle, /LampMode/);
  assert.match(vehicle, /hazard/);
  assert.match(vehicle, /megalamp/);
});
