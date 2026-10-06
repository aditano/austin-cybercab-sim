import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MEGALAMP, VEHICLE_PLATE } from './geo';

export type LampMode = 'idle' | 'match';

const WHEEL_R = 0.33;
const DOOR_OPEN = 1.65;

type Axis = 'x' | 'y' | 'z';

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function asMesh(obj: THREE.Object3D | undefined, name: string): THREE.Mesh {
  if (!(obj instanceof THREE.Mesh)) throw new Error(`Cybercab is missing mesh ${name}`);
  return obj;
}

function axisMostAligned(obj: THREE.Object3D, worldDir: THREE.Vector3): Axis {
  obj.updateWorldMatrix(true, true);
  const local = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const names: Axis[] = ['x', 'y', 'z'];
  let best = 0;
  let bestDot = -1;
  for (let i = 0; i < local.length; i++) {
    const dot = Math.abs(local[i].clone().transformDirection(obj.matrixWorld).dot(worldDir));
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return names[best];
}

/** Which local axis swings the door upward. The glTF axis conversion is not assumed. */
function doorHinge(spin: THREE.Object3D): { axis: Axis; sign: number } {
  const probe = spin.children.find((child) => child.name.startsWith('door-') && !child.name.includes('frame') && !child.name.includes('glass')) ?? spin;
  spin.updateWorldMatrix(true, true);
  const before = new THREE.Box3().setFromObject(probe).getCenter(new THREE.Vector3()).y;
  const axes: Axis[] = ['x', 'y', 'z'];
  let best: { axis: Axis; sign: number; lift: number } = { axis: 'y', sign: 1, lift: -1 };
  for (const axis of axes) {
    for (const sign of [1, -1]) {
      spin.rotation.set(0, 0, 0);
      spin.rotation[axis] = sign * 0.4;
      spin.updateWorldMatrix(true, true);
      const lift = new THREE.Box3().setFromObject(probe).getCenter(new THREE.Vector3()).y - before;
      if (lift > best.lift) best = { axis, sign, lift };
    }
  }
  spin.rotation.set(0, 0, 0);
  spin.updateWorldMatrix(true, true);
  return { axis: best.axis, sign: best.sign };
}

/**
 * Original subdivision-surface Cybercab. The mesh, materials, and hinge pivots
 * come from tools/cybercab/build.py. Lamp color, the plate, and the door swing
 * stay under the ride-flow API.
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

  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const glass = /glass|windshield/i.test(obj.name);
    obj.castShadow = !glass;
    obj.receiveShadow = !glass;
    for (const mat of materialsOf(obj)) {
      if (mat instanceof THREE.MeshPhysicalMaterial && mat.metalness > 0.4 && mat.transmission === 0) {
        mat.envMapIntensity = 0.65;
      }
    }
  });

  const megalamp = asMesh(named.get('megalamp'), 'megalamp');
  const megalampMat = (materialsOf(megalamp)[0] as THREE.MeshStandardMaterial).clone();
  megalamp.material = megalampMat;

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xf4f7ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.14), glowMat);
  glow.name = 'megalamp-glow';
  glow.castShadow = false;
  glow.rotation.y = Math.PI;
  const lampPos = new THREE.Vector3();
  megalamp.getWorldPosition(lampPos);
  group.worldToLocal(lampPos);
  glow.position.copy(lampPos);
  glow.position.z -= 0.03;
  group.add(glow);

  const lampLight = new THREE.PointLight(0xf4f7ff, 0.25, 9, 2);
  lampLight.position.copy(lampPos);
  lampLight.position.z -= 0.45;
  group.add(lampLight);

  const hazardMeshes = ['hazard-fl', 'hazard-fr', 'hazard-rl', 'hazard-rr'].map((name) => asMesh(named.get(name), name));
  const amber = (materialsOf(hazardMeshes[0])[0] as THREE.MeshStandardMaterial).clone();
  for (const hazard of hazardMeshes) hazard.material = amber;

  const rearBar = asMesh(named.get('rear-lightbar'), 'rear-lightbar');
  const red = (materialsOf(rearBar)[0] as THREE.MeshStandardMaterial).clone();
  rearBar.material = red;
  const rearLow = named.get('rear-bumper-lamp');
  if (rearLow instanceof THREE.Mesh) rearLow.material = red;

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024;
  screenCanvas.height = 480;
  const sctx = screenCanvas.getContext('2d')!;
  sctx.fillStyle = '#101418';
  sctx.fillRect(0, 0, 1024, 480);
  sctx.fillStyle = '#8ea0a6';
  sctx.font = '600 22px sans-serif';
  sctx.fillText('DESTINATION', 56, 78);
  sctx.fillStyle = '#f4f1ea';
  sctx.font = '600 54px sans-serif';
  sctx.fillText('Congress & 7th', 56, 156);
  sctx.fillStyle = '#c24bff';
  sctx.fillRect(56, 210, 280, 8);
  sctx.fillStyle = '#9aa8a4';
  sctx.font = '28px sans-serif';
  sctx.fillText('Buckle up, then Start Ride', 56, 280);
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = asMesh(named.get('front-screen'), 'front-screen');
  screen.material = new THREE.MeshBasicMaterial({ map: screenTex });
  screen.castShadow = false;

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
  const plate = asMesh(named.get('plate'), 'plate');
  const plateMat = (materialsOf(plate)[0] as THREE.MeshStandardMaterial).clone();
  plateMat.map = plateTex;
  plateMat.color.setHex(0xffffff);
  plateMat.roughness = 0.55;
  plate.material = plateMat;

  const lod0 = named.get('lod0') ?? null;
  const lod1 = named.get('body-lod1') ?? null;
  if (lod1) lod1.visible = false;

  const doorSpins = (['r', 'l'] as const).map((suffix) => {
    const spin = named.get(`door-hinge-${suffix}`);
    if (!spin) throw new Error(`Cybercab is missing door-hinge-${suffix}`);
    return { spin, side: suffix === 'r' ? 1 : -1, ...doorHinge(spin) };
  });

  const spins = (['fl', 'fr', 'rl', 'rr'] as const).map((which) => {
    const spin = named.get(`wheel-spin-${which}`);
    if (!spin) throw new Error(`Cybercab is missing wheel-spin-${which}`);
    return { spin, axis: axisMostAligned(spin, new THREE.Vector3(1, 0, 0)) };
  });
  const steers = (['fl', 'fr'] as const).map((which) => {
    const steer = named.get(`wheel-steer-${which}`);
    if (!steer) throw new Error(`Cybercab is missing wheel-steer-${which}`);
    return { steer, axis: axisMostAligned(steer, new THREE.Vector3(0, 1, 0)) };
  });

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.015;
  contact.scale.set(1.05, 1.85, 1);
  contact.castShadow = false;
  group.add(contact);

  let lampMode: LampMode = 'idle';
  let hazardsOn = false;
  let lampTime = 0;
  let openAmount = 0;
  let prevYaw = group.rotation.y;
  let steerAngle = 0;

  function applyLamp(dt: number) {
    lampTime += dt;
    const blink = Math.sin(lampTime * 10) > 0;
    switch (lampMode) {
      case 'idle':
        megalampMat.emissiveIntensity = 0.45;
        megalampMat.emissive.setHex(0xf4f7ff);
        megalampMat.color.setHex(0xf4f7ff);
        glowMat.color.setHex(0xf4f7ff);
        glowMat.opacity = 0.18;
        red.emissiveIntensity = 0.9;
        lampLight.intensity = 0.25;
        lampLight.color.setHex(0xf4f7ff);
        break;
      case 'match':
        megalampMat.color.setHex(MEGALAMP.color);
        megalampMat.emissive.setHex(MEGALAMP.color);
        megalampMat.emissiveIntensity = 2.4 + Math.sin(lampTime * 2.2) * 0.2;
        glowMat.color.setHex(MEGALAMP.color);
        glowMat.opacity = 0.55;
        red.emissiveIntensity = 1.5;
        lampLight.intensity = 0.4;
        lampLight.color.setHex(MEGALAMP.color);
        break;
      default: {
        const _never: never = lampMode;
        return _never;
      }
    }
    amber.emissiveIntensity = hazardsOn && blink ? 3 : 0.08;
    if (hazardsOn) red.emissiveIntensity = blink ? 3.1 : 0.2;
  }

  return {
    group,
    megalamp,
    /** Minimum camera distance from the cab origin, outside the body. */
    cameraClearance: 5.6,
    setDoor(open: number, side = 1) {
      openAmount = THREE.MathUtils.clamp(open, 0, 1);
      for (const door of doorSpins) {
        const swing = door.side === side ? openAmount : 0;
        door.spin.rotation[door.axis] = door.sign * swing * DOOR_OPEN;
      }
    },
    setLamp(mode: LampMode) { lampMode = mode; },
    setHazards(on: boolean) { hazardsOn = on; },
    update(dt: number, speed: number, viewDistance = 8) {
      applyLamp(dt);
      for (const wheel of spins) wheel.spin.rotation[wheel.axis] -= speed * dt / WHEEL_R;
      const yaw = group.rotation.y;
      const dyaw = Math.atan2(Math.sin(yaw - prevYaw), Math.cos(yaw - prevYaw));
      prevYaw = yaw;
      const target = THREE.MathUtils.clamp(-dyaw / Math.max(dt, 1e-3) * 0.12, -0.4, 0.4);
      steerAngle = THREE.MathUtils.damp(steerAngle, speed > 0.4 ? target : 0, 6, dt);
      for (const steer of steers) steer.steer.rotation[steer.axis] = steerAngle;
      const far = viewDistance > 22 && openAmount < 0.05;
      if (lod0) lod0.visible = !far;
      if (lod1) lod1.visible = far;
    },
  };
}

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
