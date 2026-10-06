import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MEGALAMP, VEHICLE_PLATE } from './geo';

export type LampMode = 'idle' | 'match';

const OUTER_R = 0.332;
const TRACK_X = 0.86;
const AXLE_Z = 1.46;

function paintMaterial(color: number, roughness = 0.32) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.7, roughness, clearcoat: 0.4, clearcoatRoughness: 0.3,
    envMapIntensity: 0.62, sheen: 0.45, sheenColor: new THREE.Color('#ffd7a0'),
    emissive: new THREE.Color(color).multiplyScalar(0.15), emissiveIntensity: 0.45,
  });
}

/** Low tub: the greenhouse, not this shell, is the cabin. */
function cybercabBodyGeometry() {
  const geo = new RoundedBoxGeometry(1.66, 0.36, 3.35, 3, 0.14);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const beyond = THREE.MathUtils.smoothstep(1.2, 2.08, Math.abs(v.z));
    const nose = v.z < 0 ? beyond : 0;
    const tail = v.z > 0 ? beyond : 0;
    v.x *= 1 - nose * 0.18 - tail * 0.16;
    v.y *= 1 - nose * 0.08 - tail * 0.06;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Enclosed two-seat Cybercab: champagne metal tub, dark glass greenhouse,
 * butterfly curb door, full-width Megalamp. Artistic proportions from the
 * published 1,754 mm width and 1,408 mm height — not manufacturer CAD.
 *
 * The greenhouse is a full upper shell. Side clips open only the door bays;
 * sphere-patch doors sit in those bays when shut and swing up from the roof rail.
 */
export function createCybercab() {
  const group = new THREE.Group();
  group.name = 'Cybercab';

  const gold = paintMaterial(0xd7a85a, 0.34);
  const goldTrim = paintMaterial(0xb08a45, 0.32);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x1a242c, metalness: 0.55, roughness: 0.06, transparent: true, opacity: 0.46,
    envMapIntensity: 1.35, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide,
    depthWrite: false,
  });
  const doorGlass = glass.clone();
  doorGlass.opacity = 0.9;
  doorGlass.color.setHex(0x101418);
  doorGlass.polygonOffset = true;
  doorGlass.polygonOffsetFactor = -1;
  doorGlass.polygonOffsetUnits = -1;
  doorGlass.clippingPlanes = [];
  const black = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.55, metalness: 0.25 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.94 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0xc4b08a, metalness: 0.82, roughness: 0.28, envMapIntensity: 0.8 });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 0.86 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xd7f0ff, emissiveIntensity: 1.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff2a22, emissive: 0xff1a12, emissiveIntensity: 1.4 });
  const megalampMat = new THREE.MeshStandardMaterial({
    color: MEGALAMP.color, emissive: MEGALAMP.color, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.15,
  });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xff8a00, emissiveIntensity: 0.15 });

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  const body = mesh(cybercabBodyGeometry(), gold);
  body.position.y = 0.48;
  body.name = 'body';

  const skirt = mesh(new RoundedBoxGeometry(1.42, 0.07, 2.1, 2, 0.03), black);
  skirt.position.set(0, 0.22, -0.1);
  skirt.castShadow = false;

  const cabinGlass = glass.clone();
  cabinGlass.opacity = 0.82;
  cabinGlass.color.setHex(0x141a1e);
  cabinGlass.roughness = 0.18;
  cabinGlass.metalness = 0.25;
  cabinGlass.envMapIntensity = 0.45;
  cabinGlass.clearcoat = 0.15;
  const cabin = mesh(new RoundedBoxGeometry(1.42, 0.66, 2.15, 3, 0.14), cabinGlass);
  cabin.position.set(0, 1.02, -0.28);
  cabin.castShadow = false;
  cabin.name = 'canopy';
  const capMat = gold.clone();
  capMat.roughness = 0.62;
  capMat.metalness = 0.45;
  capMat.clearcoat = 0.15;
  capMat.emissiveIntensity = 0.04;
  const capSkin = mesh(new RoundedBoxGeometry(1.28, 0.1, 1.85, 2, 0.05), capMat);
  capSkin.position.set(0, 1.32, -0.28);

  const doors: { pivot: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.72, 1.32, -0.28);
    group.add(pivot);
    const panel = mesh(new RoundedBoxGeometry(0.05, 0.58, 1.7, 2, 0.03), doorGlass, pivot);
    panel.position.set(side * 0.02, -0.26, 0);
    panel.castShadow = false;
    panel.name = side > 0 ? 'doorR' : 'doorL';
    const skin = mesh(new RoundedBoxGeometry(0.07, 0.07, 1.55, 2, 0.02), goldTrim, pivot);
    skin.position.set(side * 0.03, -0.5, 0);
    skin.castShadow = false;
    doors.push({ pivot, side });
  }

  const floor = mesh(new THREE.BoxGeometry(1.35, 0.06, 1.7), black);
  floor.position.set(0, 0.5, 0.05);
  floor.castShadow = false;
  const dash = mesh(new RoundedBoxGeometry(1.28, 0.1, 0.36, 2, 0.03), black);
  dash.position.set(0, 0.78, -0.72);
  const screen = mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ color: 0x101614 }));
  screen.position.set(0, 0.78, -0.95);
  screen.rotation.x = -0.55;
  screen.castShadow = false;
  const screenGlow = mesh(new THREE.PlaneGeometry(0.32, 0.012), new THREE.MeshBasicMaterial({ color: MEGALAMP.color }));
  screenGlow.position.set(0, 0.74, -0.9);
  screenGlow.rotation.x = -0.18;
  screenGlow.castShadow = false;

  for (const x of [-0.36, 0.36]) {
    const cushion = mesh(new RoundedBoxGeometry(0.52, 0.12, 0.5, 2, 0.04), upholstery);
    cushion.position.set(x, 0.62, 0.28);
    const back = mesh(new RoundedBoxGeometry(0.5, 0.46, 0.1, 2, 0.04), upholstery);
    back.position.set(x, 0.86, 0.5);
    back.rotation.x = -0.18;
    const head = mesh(new RoundedBoxGeometry(0.28, 0.16, 0.08, 2, 0.03), upholstery);
    head.position.set(x, 1.08, 0.46);
  }

  const megalamp = mesh(new RoundedBoxGeometry(1.36, 0.055, 0.045, 2, 0.015), megalampMat);
  megalamp.position.set(0, 0.7, -1.62);
  megalamp.name = 'megalamp';
  const frontWhite = mesh(new THREE.BoxGeometry(0.9, 0.012, 0.02), white);
  frontWhite.position.set(0, 0.66, -1.8);
  const rearLamp = mesh(new RoundedBoxGeometry(1.28, 0.04, 0.035, 2, 0.01), red);
  rearLamp.position.set(0, 0.62, 1.9);
  const hazards: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.7, -1.7], [0.7, -1.7], [-0.66, 1.82], [0.66, 1.82]]) {
    const h = mesh(new THREE.BoxGeometry(0.1, 0.045, 0.03), amber);
    h.position.set(x, z < 0 ? 0.46 : 0.56, z);
    hazards.push(h);
  }

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
  const plate = mesh(new THREE.PlaneGeometry(0.36, 0.16), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.55 }));
  plate.position.set(0, 0.46, 1.92);

  const lampLight = new THREE.PointLight(MEGALAMP.color, 0, 5, 2);
  lampLight.position.set(0, 0.7, -2.45);
  group.add(lampLight);

  const wheels: THREE.Group[] = [];
  for (const x of [-TRACK_X, TRACK_X]) {
    for (const z of [-AXLE_Z, AXLE_Z]) {
      const w = new THREE.Group();
      w.position.set(x, OUTER_R, z);
      group.add(w);
      wheels.push(w);
      const tire = mesh(new THREE.TorusGeometry(OUTER_R - 0.09, 0.09, 12, 28), rubber, w);
      tire.rotation.y = Math.PI / 2;
      const disc = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 24), discMat, w);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = Math.sign(x) * 0.04;
      const capRing = mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 20), goldTrim, w);
      capRing.rotation.y = Math.PI / 2;
      capRing.position.x = Math.sign(x) * 0.07;
      const arch = mesh(new THREE.TorusGeometry(0.4, 0.055, 8, 20, Math.PI), black);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(x, OUTER_R + 0.02, z);
    }
  }

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
  let openSide = 1;

  function applyLamp(dt: number) {
    lampTime += dt;
    const blink = Math.sin(lampTime * 10) > 0;
    switch (lampMode) {
      case 'idle':
        megalampMat.emissiveIntensity = 0.35;
        megalampMat.emissive.setHex(0xf4f7ff);
        megalampMat.color.setHex(0xf4f7ff);
        red.emissiveIntensity = 0.9;
        lampLight.intensity = 0.15;
        lampLight.color.setHex(0xf4f7ff);
        break;
      case 'match':
        megalampMat.color.setHex(MEGALAMP.color);
        megalampMat.emissive.setHex(MEGALAMP.color);
        megalampMat.emissiveIntensity = 2.1 + Math.sin(lampTime * 2.2) * 0.25;
        red.emissiveIntensity = 1.5;
        lampLight.intensity = 0.55;
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
      openSide = side;
      for (const door of doors) {
        const amount = door.side === openSide ? openAmount : 0;
        door.pivot.rotation.z = door.side * amount * 1.25;
      }
    },
    setLamp(mode: LampMode) { lampMode = mode; },
    setHazards(on: boolean) { hazardsOn = on; },
    update(dt: number, speed: number) {
      applyLamp(dt);
      for (const w of wheels) w.rotation.x -= speed * dt / OUTER_R;
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
