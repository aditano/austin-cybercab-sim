import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  blinkLit, shouldWake, steerTarget, vehicleSignals, wakeSegmentScale, wheelRoll,
} from '../src/logic.ts';

test('wheels roll forward on local X and fronts steer with the yaw', () => {
  assert.equal(wheelRoll(0.372, 1), -1);
  assert.equal(wheelRoll(0, 1), 0);
  assert.ok(steerTarget(0.2, 0, 8) > 0, 'positive yaw steers left');
  assert.ok(steerTarget(0, 0.2, 8) < 0, 'a pull toward the right curb steers right');
  assert.equal(steerTarget(0.4, 0, 0.2), 0);
});

test('light policy follows summon, pickup, brake, and turn cues', () => {
  assert.equal(blinkLit(0), true);
  assert.equal(blinkLit(0.42), false);
  assert.equal(blinkLit(0.67), true);
  assert.equal(wakeSegmentScale(1, 0), 0.001);
  assert.equal(wakeSegmentScale(1, 0.25), 1);
  assert.equal(wakeSegmentScale(6, 0.25), 0.001);
  assert.equal(shouldWake('explore', 'dispatch'), true);
  assert.equal(shouldWake('dispatch', 'pickup'), true);
  assert.equal(shouldWake('ride', 'arrived'), true);
  assert.equal(shouldWake('dispatch', 'dispatch'), false);
  assert.equal(shouldWake('dispatch', 'ride'), false);
  const pickup = vehicleSignals({ phase: 'pickup', speed: 0, accel: 0, yawRate: 0, curbRate: 0 });
  assert.equal(pickup.hazard, true);
  assert.equal(pickup.pickup, true);
  assert.equal(pickup.match, false);
  const boarded = vehicleSignals({ phase: 'boarded', speed: 0, accel: 0, yawRate: 0, curbRate: 0 });
  assert.equal(boarded.pickup, true);
  assert.equal(boarded.hazard, true);
  const approach = vehicleSignals({ phase: 'dispatch', speed: 8, accel: 0, yawRate: 0, curbRate: 0.2 });
  assert.equal(approach.match, true);
  assert.equal(approach.turn, 'right');
  assert.equal(approach.hazard, false);
  const braking = vehicleSignals({ phase: 'ride', speed: 6, accel: -2, yawRate: 0, curbRate: 0 });
  assert.equal(braking.brake, true);
  assert.equal(braking.turn, 'none');
  const left = vehicleSignals({ phase: 'ride', speed: 8, accel: 0, yawRate: 0.2, curbRate: 0 });
  assert.equal(left.turn, 'left');
  assert.equal(left.brake, false);
  const coast = vehicleSignals({ phase: 'ride', speed: 8, accel: -0.2, yawRate: 0, curbRate: 0 });
  assert.equal(coast.brake, false);
  const vehicle = fs.readFileSync(new URL('../src/vehicle.ts', import.meta.url), 'utf8');
  for (const token of ['vehicleSignals', 'wheelRoll', 'blinkLit', 'wakeSegmentScale', 'LampMode', 'hazard', 'megalamp']) {
    assert.match(vehicle, new RegExp(token));
  }
});

test('bundled Cybercab glTF keeps door, wheel, and light nodes', () => {
  const buf = fs.readFileSync(new URL('../public/models/cybercab.glb', import.meta.url));
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const names = new Set(json.nodes.map((node) => node.name).filter(Boolean));
  for (const name of [
    'door-hinge-r', 'door-hinge-l', 'door-r',
    'wheel-spin-fr', 'wheel-spin-fl', 'wheel-spin-rr', 'wheel-spin-rl',
    'wheel-steer-fr', 'wheel-steer-fl',
    'lamp-front-R1', 'lamp-front-L6', 'lamp-rear-R6', 'lamp-rear-L1',
    'lamp-front-teal-R1', 'lamp-front-turn-R4', 'lamp-rear-turn-L6', 'lamp-rear-brake-R1',
  ]) {
    assert.ok(names.has(name), name);
  }
  const anims = new Set(json.animations.map((clip) => clip.name));
  for (const name of ['door_open', 'wheel_spin', 'lights_wake', 'turn_left', 'turn_right', 'brake', 'pickup', 'hazard']) {
    assert.ok(anims.has(name), name);
  }
  const teal = json.nodes.find((node) => node.name === 'lamp-front-teal-R1');
  assert.ok(Math.abs(teal.scale[0] - 0.001) < 1e-4, 'teal overlay starts hidden');
  const steer = json.nodes.find((node) => node.name === 'wheel-steer-fr');
  assert.ok(Math.abs(steer.translation[1] - 0.372) < 1e-3, 'front hub sits on the tire radius');
  assert.ok(json.extensionsUsed.includes('EXT_meshopt_compression'));
});
