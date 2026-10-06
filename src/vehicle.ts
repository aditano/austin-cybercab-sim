import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MEGALAMP, VEHICLE_PLATE } from './geo';
import {
  blinkLit, holdTurn, shouldWake, steerTarget, vehicleSignals, wakeSegmentScale, wheelRoll,
  type TurnSignal, type VehicleSignals,
} from './logic';

export type LampMode = 'idle' | 'match';

const LAMP_OFF = 0.001;
const WAKE_END = 1.55;
const LAMP_TAGS = ['front-teal', 'front-turn', 'rear-brake', 'rear-turn', 'front', 'rear'] as const;
type LampTag = typeof LAMP_TAGS[number];
type LampKind = 'teal' | 'front-turn' | 'brake' | 'rear-turn' | 'front' | 'rear';

type LampSeg = {
  node: THREE.Object3D;
  kind: LampKind;
  side: 'L' | 'R';
  index: number;
};

type QuatSampler = { evaluate: (time: number) => ArrayLike<number> };
type SampledQuatTrack = THREE.QuaternionKeyframeTrack & { createInterpolant: () => QuatSampler };

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function asMesh(obj: THREE.Object3D | undefined, name: string): THREE.Mesh {
  if (!(obj instanceof THREE.Mesh)) throw new Error(`Cybercab is missing mesh ${name}`);
  return obj;
}

function isLampTag(value: string): value is LampTag {
  return (LAMP_TAGS as readonly string[]).includes(value);
}

function lampKind(tag: LampTag): LampKind {
  switch (tag) {
    case 'front-teal': return 'teal';
    case 'front-turn': return 'front-turn';
    case 'rear-brake': return 'brake';
    case 'rear-turn': return 'rear-turn';
    case 'front': return 'front';
    case 'rear': return 'rear';
    default: {
      const _never: never = tag;
      return _never;
    }
  }
}

function meshesUnder(node: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  node.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function cloneStandard(mesh: THREE.Mesh, name: string): THREE.MeshStandardMaterial {
  const source = materialsOf(mesh)[0];
  if (!(source instanceof THREE.MeshStandardMaterial)) throw new Error(`Cybercab material on ${name} is not standard`);
  return source.clone();
}

function sideAsked(turn: TurnSignal, side: 'L' | 'R'): boolean {
  switch (turn) {
    case 'left': return side === 'L';
    case 'right': return side === 'R';
    case 'none': return false;
    default: {
      const _never: never = turn;
      return _never;
    }
  }
}

/**
 * Photo-fit Cybercab from tools/cybercab/build.py. Doors sample the `door_open`
 * clip. Wheels roll on local X under the front steer pivots. Light segments
 * under `lights` are scaled on and off; see tools/cybercab/MODEL_NOTES.md.
 */
export async function loadCybercab() {
  const group = new THREE.Group();
  group.name = 'Cybercab';

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/cybercab.glb`);
  const model = gltf.scene;
  group.add(model);
  group.updateMatrixWorld(true);

  const named = new Map<string, THREE.Object3D>();
  model.traverse((obj) => {
    if (obj.name) named.set(obj.name, obj);
  });

  const lamps: LampSeg[] = [];
  for (const [name, node] of named) {
    const match = /^lamp-(front-teal|front-turn|rear-brake|rear-turn|front|rear)-([LR])([1-6])$/.exec(name);
    if (!match || !isLampTag(match[1])) continue;
    const side = match[2] === 'R' ? 'R' : 'L';
    lamps.push({ node, kind: lampKind(match[1]), side, index: Number(match[3]) });
  }
  if (lamps.length < 48) throw new Error(`Cybercab light segments missing (${lamps.length})`);

  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const glass = /glass/i.test(obj.name) && !/frit/i.test(obj.name);
    const lamp = /^lamp-/.test(obj.name);
    obj.castShadow = !glass && !lamp && obj.name !== 'interior';
    obj.receiveShadow = !glass && !lamp;
    if (glass) obj.renderOrder = 2;
    for (const mat of materialsOf(obj)) {
      if (!(mat instanceof THREE.MeshPhysicalMaterial)) continue;
      if (glass || mat.transparent) {
        if (glass) {
          mat.transparent = true;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
          mat.envMapIntensity = 1.15;
          mat.roughness = Math.min(mat.roughness, 0.08);
        }
      } else if (mat.metalness > 0.5 && mat.clearcoat > 0.2) {
        mat.envMapIntensity = 1.75;
      }
    }
  });
  for (const seg of lamps) {
    for (const mesh of meshesUnder(seg.node)) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  }

  const frontMesh = meshesUnder(lamps.find((seg) => seg.kind === 'front')?.node ?? group)[0];
  if (!frontMesh) throw new Error('Cybercab is missing the front light bar');
  const frontMat = cloneStandard(frontMesh, 'lamp-front');
  const frontEmissive = frontMat.emissiveIntensity;
  for (const seg of lamps) {
    if (seg.kind !== 'front') continue;
    for (const mesh of meshesUnder(seg.node)) mesh.material = frontMat;
  }

  const tealMesh = meshesUnder(lamps.find((seg) => seg.kind === 'teal')?.node ?? group)[0];
  if (!tealMesh) throw new Error('Cybercab is missing the teal pickup bar');
  const tealMat = cloneStandard(tealMesh, 'lamp-front-teal');
  const tealColor = tealMat.emissive.clone();
  tealMat.emissiveIntensity = 2.2;
  tealMat.toneMapped = false;
  for (const seg of lamps) {
    if (seg.kind !== 'teal') continue;
    for (const mesh of meshesUnder(seg.node)) mesh.material = tealMat;
  }

  const frontTurnMesh = meshesUnder(lamps.find((seg) => seg.kind === 'front-turn')?.node ?? group)[0];
  const rearTurnMesh = meshesUnder(lamps.find((seg) => seg.kind === 'rear-turn')?.node ?? group)[0];
  const brakeMesh = meshesUnder(lamps.find((seg) => seg.kind === 'brake')?.node ?? group)[0];
  if (!frontTurnMesh || !rearTurnMesh || !brakeMesh) throw new Error('Cybercab is missing turn or brake segments');
  const frontTurnMat = cloneStandard(frontTurnMesh, 'lamp-turn-amber');
  frontTurnMat.emissiveIntensity = 8;
  frontTurnMat.toneMapped = false;
  const rearTurnMat = cloneStandard(rearTurnMesh, 'lamp-turn-rear');
  // The real outer blink is red and disappears on a lit tail in daylight.
  // Hide the tail underneath and flash these ends amber so the signal reads.
  rearTurnMat.color.setHex(0xff7a12);
  rearTurnMat.emissive.setHex(0xff8a1e);
  rearTurnMat.emissiveIntensity = 7;
  rearTurnMat.toneMapped = false;
  const brakeMat = cloneStandard(brakeMesh, 'lamp-brake');
  brakeMat.emissiveIntensity = 6;
  brakeMat.toneMapped = false;
  for (const mat of [tealMat, frontTurnMat, rearTurnMat, brakeMat]) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
  }
  // Overlays are authored a fraction of a millimetre proud. Quantization flattens
  // that, so they z-fight the bar. Push them out along the nose axis.
  for (const seg of lamps) {
    if (seg.kind === 'brake') seg.node.position.z += 0.01;
    else if (seg.kind === 'rear-turn') seg.node.position.z += 0.016;
    else if (seg.kind === 'teal') seg.node.position.z -= 0.01;
    else if (seg.kind === 'front-turn') seg.node.position.z -= 0.016;
  }
  for (const seg of lamps) {
    const mat = seg.kind === 'front-turn' ? frontTurnMat : seg.kind === 'rear-turn' ? rearTurnMat : seg.kind === 'brake' ? brakeMat : null;
    if (!mat) continue;
    for (const mesh of meshesUnder(seg.node)) mesh.material = mat;
  }
  const rearMesh = meshesUnder(lamps.find((seg) => seg.kind === 'rear')?.node ?? group)[0];
  if (!rearMesh) throw new Error('Cybercab is missing the rear light bar');
  const rearMat = cloneStandard(rearMesh, 'lamp-rear');
  const rearColor = rearMat.color.clone();
  const rearEmissive = rearMat.emissive.clone();
  const rearRest = 3.4;
  rearMat.emissiveIntensity = rearRest;
  for (const seg of lamps) {
    if (seg.kind !== 'rear') continue;
    for (const mesh of meshesUnder(seg.node)) mesh.material = rearMat;
  }

  const megalamp = asMesh(named.get('lamp-front-channel'), 'lamp-front-channel');
  const frontBox = new THREE.Box3();
  for (const seg of lamps) if (seg.kind === 'front') frontBox.expandByObject(seg.node);
  const lampPos = frontBox.getCenter(new THREE.Vector3());
  lampPos.z = frontBox.min.z;
  group.worldToLocal(lampPos);
  const glowColor = new THREE.Color(0xffffff);
  const lampLight = new THREE.PointLight(0xffffff, 0.08, 3.2, 2);
  lampLight.position.copy(lampPos);
  lampLight.position.z -= 0.35;
  group.add(lampLight);

  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 256;
  plateCanvas.height = 128;
  const pctx = plateCanvas.getContext('2d')!;
  pctx.fillStyle = '#f3f0e4';
  pctx.fillRect(0, 0, 256, 128);
  pctx.fillStyle = '#163e86';
  pctx.fillRect(0, 0, 256, 28);
  pctx.fillStyle = '#ffffff';
  pctx.font = '700 16px sans-serif';
  pctx.textAlign = 'center';
  pctx.fillText('TEXAS', 128, 20);
  pctx.fillStyle = '#1a1a1a';
  pctx.font = '700 52px sans-serif';
  pctx.fillText(VEHICLE_PLATE, 128, 92);
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.55, metalness: 0.04 }),
  );
  plate.name = 'plate';
  plate.position.set(0, 0.5, 2.175);
  plate.castShadow = false;
  plate.receiveShadow = true;
  group.add(plate);
  const plateLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.012, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xfff6e8, emissiveIntensity: 3.2, roughness: 0.35 }),
  );
  plateLamp.name = 'plate-lamp';
  plateLamp.position.set(0, 0.6, 2.168);
  plateLamp.castShadow = false;
  group.add(plateLamp);

  const doorClip = gltf.animations.find((clip) => clip.name === 'door_open');
  if (!doorClip) throw new Error('Cybercab is missing door_open');
  const doors = (['door-hinge-r', 'door-hinge-l'] as const).map((nodeName) => {
    const spin = named.get(nodeName);
    if (!spin) throw new Error(`Cybercab is missing ${nodeName}`);
    const track = doorClip.tracks.find((item) => item.name === `${nodeName}.quaternion`);
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) throw new Error(`Cybercab is missing ${nodeName} in door_open`);
    return { spin, sample: (track as SampledQuatTrack).createInterpolant(), duration: track.times[track.times.length - 1], side: nodeName.endsWith('-r') ? 1 : -1 };
  });

  const spins = (['fr', 'fl', 'rr', 'rl'] as const).map((which) => {
    const spin = named.get(`wheel-spin-${which}`);
    if (!spin) throw new Error(`Cybercab is missing wheel-spin-${which}`);
    return spin;
  });
  const steers = (['fr', 'fl'] as const).map((which) => {
    const steer = named.get(`wheel-steer-${which}`);
    if (!steer) throw new Error(`Cybercab is missing wheel-steer-${which}`);
    return steer;
  });

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.02;
  contact.scale.set(0.9, 2.05, 1);
  contact.castShadow = false;
  group.add(contact);

  let lampMode: LampMode = 'idle';
  let hazardsOn = false;
  let lampTime = 0;
  let wakeElapsed = -1;
  let phaseName = '';
  let openAmount = 0;
  let prevYaw = group.rotation.y;
  let prevSpeed = 0;
  let steerAngle = 0;
  let brakeHold = 0;
  let turnHeld: TurnSignal = 'none';
  let turnHeldFor = 0;
  let lastSignals: VehicleSignals = { match: false, pickup: false, hazard: false, brake: false, turn: 'none' };
  let lastBlink = false;
  let tealLevel = 0;
  let brakeLevel = 0;
  let turnLevel = 0;

  function runningScale(kind: 'front' | 'rear', index: number): number {
    if (wakeElapsed < 0) return 1;
    return wakeSegmentScale(index, wakeElapsed, kind === 'rear' ? 0.125 : 0);
  }

  function applyLights(signals: VehicleSignals, brake: boolean) {
    const match = signals.match || lampMode === 'match';
    const hazard = signals.hazard || hazardsOn;
    const reveal = wakeElapsed >= 0 && wakeElapsed < 0.85 && !signals.pickup ? THREE.MathUtils.clamp(wakeElapsed / 0.7, 0, 1) : 1;
    if (match && !signals.pickup) {
      frontMat.color.setHex(MEGALAMP.color);
      frontMat.emissive.setHex(MEGALAMP.color);
      frontMat.emissiveIntensity = 3.6;
      frontMat.toneMapped = false;
      glowColor.setHex(MEGALAMP.color);
    } else {
      frontMat.color.setHex(0xffffff);
      frontMat.emissive.setHex(0xffffff);
      frontMat.emissiveIntensity = frontEmissive;
      frontMat.toneMapped = true;
      glowColor.setHex(0xffffff);
    }
    if (signals.pickup) glowColor.copy(tealColor);
    lampLight.color.copy(glowColor);
    if (brake) {
      rearMat.color.setRGB(1, 0.015, 0.008);
      rearMat.emissive.setRGB(1, 0.012, 0.006);
      rearMat.emissiveIntensity = 9;
      rearMat.toneMapped = false;
    } else {
      rearMat.color.copy(rearColor);
      rearMat.emissive.copy(rearEmissive);
      rearMat.emissiveIntensity = rearRest;
      rearMat.toneMapped = true;
    }
    lampLight.intensity = (signals.pickup ? 0.04 : match ? 0.08 : 0.04) * reveal;
    tealLevel = 0;
    brakeLevel = 0;
    turnLevel = 0;
    for (const seg of lamps) {
      const flash = lastBlink && (hazard || sideAsked(signals.turn, seg.side));
      switch (seg.kind) {
        case 'front':
        case 'rear': {
          let scale = seg.kind === 'front' && signals.pickup ? LAMP_OFF : runningScale(seg.kind, seg.index);
          if (flash && seg.kind === 'rear' && seg.index >= 4) scale = Math.min(scale, 0.15);
          else if (flash && seg.kind === 'rear') scale = Math.min(scale, 0.16);
          if (seg.kind === 'rear' && brake && !(flash && seg.index >= 4)) seg.node.scale.set(1, 2.2, 1);
          else seg.node.scale.setScalar(scale);
          break;
        }
        case 'teal': {
          const on = signals.pickup && !(flash && seg.index >= 4);
          seg.node.scale.setScalar(on ? 1 : LAMP_OFF);
          if (on) tealLevel = 1;
          break;
        }
        case 'front-turn':
        case 'rear-turn': {
          const on = flash && seg.index >= 4;
          seg.node.scale.setScalar(on ? 1 : LAMP_OFF);
          if (on) turnLevel = 1;
          break;
        }
        case 'brake': {
          const on = brake && !(flash && seg.index >= 4);
          seg.node.scale.setScalar(on ? 1 : LAMP_OFF);
          if (on) brakeLevel = 1;
          break;
        }
        default: {
          const _never: never = seg.kind;
          throw new Error(`unhandled lamp ${_never}`);
        }
      }
    }
  }

  const cab = {
    group,
    megalamp,
    /** Minimum camera distance from the cab origin, outside the body. */
    cameraClearance: 5.6,
    setDoor(open: number, side = 1) {
      openAmount = THREE.MathUtils.clamp(open, 0, 1);
      for (const door of doors) {
        const time = door.side === side ? openAmount * door.duration : 0;
        door.spin.quaternion.fromArray(door.sample.evaluate(time)).normalize();
      }
    },
    doorMetrics() {
      const mesh = named.get('door-r');
      if (!mesh) return { lift: 0, top: 0, span: 0 };
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      return {
        lift: center.y - group.position.y,
        top: box.max.y - group.position.y,
        span: Math.max(size.x, size.y, size.z),
      };
    },
    setLamp(mode: LampMode) { lampMode = mode; },
    /** Glass is alpha-blended and double-sided, so the cabin looks through it. */
    setCabinView(_inside: boolean) {
      for (const name of ['windshield', 'door-glass-l', 'door-glass-r', 'quarter-glass']) {
        const part = named.get(name);
        if (part) part.visible = true;
      }
    },
    setHazards(on: boolean) { hazardsOn = on; },
    setPhase(next: string) {
      if (shouldWake(phaseName, next)) wakeElapsed = 0;
      phaseName = next;
    },
    lightState() {
      return {
        ...lastSignals,
        blink: lastBlink,
        wake: wakeElapsed >= 0,
        teal: tealLevel,
        brakeLamp: brakeLevel > 0,
        turnLamp: turnLevel > 0,
      };
    },
    wheelSpin() { return spins[0].rotation.x; },
    wheelSteer() { return steers[0].rotation.y; },
    update(dt: number, speed: number, _viewDistance = 8, curbRate = 0) {
      const yaw = group.rotation.y;
      const dyaw = Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw));
      prevYaw = yaw;
      const yawRate = Math.abs(dyaw) > 0.35 ? 0 : dyaw / Math.max(dt, 1e-3);
      const accel = (speed - prevSpeed) / Math.max(dt, 1e-3);
      prevSpeed = speed;
      const raw = vehicleSignals({ phase: phaseName, speed, accel, yawRate, curbRate });
      const held = holdTurn(raw.turn, turnHeld, turnHeldFor, dt, raw.hazard);
      turnHeld = held.held;
      turnHeldFor = held.remaining;
      const signals = { ...raw, turn: held.turn };
      if (signals.brake) brakeHold = 0.4;
      else brakeHold = Math.max(0, brakeHold - dt);
      const wakeBrake = wakeElapsed >= 1 && wakeElapsed <= 1.35;
      lampTime += dt;
      lastBlink = blinkLit(lampTime);
      lastSignals = signals;
      applyLights(signals, signals.brake || brakeHold > 0 || wakeBrake);
      if (wakeElapsed >= 0) {
        wakeElapsed += dt;
        if (wakeElapsed > WAKE_END) wakeElapsed = -1;
      }
      const roll = wheelRoll(speed, dt);
      for (const spin of spins) spin.rotation.x += roll;
      const target = steerTarget(yawRate, curbRate, speed);
      steerAngle = THREE.MathUtils.damp(steerAngle, target, 6, dt);
      for (const steer of steers) steer.rotation.y = steerAngle;
    },
  };
  void openAmount;
  return cab;
}

export type Cybercab = Awaited<ReturnType<typeof loadCybercab>>;

export type StreetKind = 'sedan' | 'suv' | 'van' | 'pickup';

export function createStreetCar(kind: StreetKind, paint: number) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: paint, metalness: 0.72, roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.9,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2428, metalness: 0.45, roughness: 0.08, transparent: true, opacity: 0.72, envMapIntensity: 1.1,
  });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x161718, roughness: 0.92 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xf3ecda, emissive: 0xe6d7b0, emissiveIntensity: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8c1c16, emissive: 0x6a1210, emissiveIntensity: 0.35 });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    o.receiveShadow = true;
    group.add(o);
    return o;
  };
  const specs = {
    sedan: { w: 1.78, h: 0.48, l: 4.4, cabinL: 2.05, cabinH: 0.52, cabinZ: -0.05 },
    suv: { w: 1.88, h: 0.62, l: 4.6, cabinL: 2.35, cabinH: 0.7, cabinZ: 0.05 },
    van: { w: 1.96, h: 0.78, l: 5.05, cabinL: 3.15, cabinH: 0.95, cabinZ: 0.15 },
    pickup: { w: 1.92, h: 0.58, l: 5.15, cabinL: 1.7, cabinH: 0.62, cabinZ: -0.7 },
  }[kind];
  const box = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  add(box, bodyMat, 0, specs.h * 0.55 + 0.28, 0, specs.w, specs.h, specs.l);
  add(box, bodyMat, 0, specs.h * 0.38 + 0.3, -specs.l * 0.28, specs.w * 0.92, specs.h * 0.55, specs.l * 0.42);
  add(box, glassMat, 0, specs.h + 0.28 + specs.cabinH * 0.35, specs.cabinZ, specs.w * 0.84, specs.cabinH, specs.cabinL);
  add(box, bodyMat, 0, specs.h + 0.28 + specs.cabinH * 0.82, specs.cabinZ, specs.w * 0.78, 0.08, specs.cabinL * 0.92);
  if (kind === 'pickup') add(box, bodyMat, 0, specs.h * 0.7 + 0.2, 1.35, specs.w * 0.94, 0.28, 1.7);
  add(box, lampMat, 0, specs.h * 0.45 + 0.28, -specs.l * 0.48, specs.w * 0.72, 0.08, 0.05);
  add(box, tailMat, 0, specs.h * 0.55 + 0.28, specs.l * 0.48, specs.w * 0.7, 0.07, 0.04);
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.2, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-specs.w * 0.42, specs.w * 0.42]) {
    for (const z of [-specs.l * 0.32, specs.l * 0.32]) {
      const w = new THREE.Mesh(wheelGeo, rubberMat);
      w.position.set(x, 0.33, z);
      w.castShadow = true;
      group.add(w);
    }
  }
  return group;
}

export function createPedestrian(seed: number) {
  const group = new THREE.Group();
  const skinTones = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac, 0x6b4423];
  const shirts = [0xbf5700, 0x243026, 0x1f2a44, 0xf4f1ea, 0x6e2430, 0x3d4c3a, 0x222222, 0xd7d2c8];
  const pants = [0x2a3038, 0x3e4a62, 0x1c1c1c, 0x4a3b32, 0x243028];
  const skin = new THREE.MeshStandardMaterial({ color: skinTones[seed % skinTones.length], roughness: 0.72 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirts[seed % shirts.length], roughness: 0.84 });
  const leg = new THREE.MeshStandardMaterial({ color: pants[(seed * 3) % pants.length], roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

  const torso = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.48, 0.2, 2, 0.06), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
  head.position.y = 1.56;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({
    color: [0x1a120e, 0x3a2a22, 0x111111, 0xc4b59a, 0x4a3428][seed % 5], roughness: 0.8,
  }));
  hair.position.y = 1.6;
  group.add(hair);

  const limb = (name: string, x: number, y: number, length: number, mat: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, 0);
    const part = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, Math.max(0.05, length - 0.09), 3, 6), mat);
    part.position.y = -length / 2;
    part.castShadow = true;
    pivot.add(part);
    if (name.startsWith('leg')) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.16), shoe);
      foot.position.set(0, -length, 0.03);
      pivot.add(foot);
    }
    group.add(pivot);
    return pivot;
  };
  limb('armL', -0.24, 1.34, 0.48, shirt);
  limb('armR', 0.24, 1.34, 0.48, shirt);
  limb('legL', -0.09, 0.9, 0.78, leg);
  limb('legR', 0.09, 0.9, 0.78, leg);
  group.scale.setScalar(0.94 + (seed % 4) * 0.03);
  return group;
}
