import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MEGALAMP, VEHICLE_PLATE } from './geo';

export type LampMode = 'idle' | 'match';

const OUTER_R = 0.34;
const TRACK_X = 0.9;
const AXLES = [-1.18, 1.12];

/** Blunt coupe section. v=0 is the nose (−Z), v=1 is the kamm tail. */
function shellPoint(v: number, theta: number) {
  const z0 = -2.06 + v * 4.32;
  const crown = Math.sin(Math.PI * Math.pow(v, 0.7));
  const roofY = 0.82 + crown * 0.58 - Math.pow(v, 2.4) * 0.28;
  const bellyY = 0.2 + Math.sin(Math.PI * v) * 0.045;
  let halfW = 0.877 * (0.8 + 0.2 * Math.sin(Math.PI * Math.pow(v, 0.42)));
  if (v > 0.86) halfW *= 1 - (v - 0.86) * 1.35;
  halfW = Math.max(0.46, halfW);
  const sx = Math.sin(theta);
  const cy = Math.cos(theta);
  const x = halfW * Math.sign(sx || 1) * Math.pow(Math.abs(sx), 0.72);
  const yMid = (roofY + bellyY) * 0.5;
  const yHalf = Math.max(0.05, (roofY - bellyY) * 0.5);
  const y = yMid + yHalf * Math.sign(cy || 1) * Math.pow(Math.abs(cy), 0.8);
  const edge = Math.min(1, Math.hypot(x / halfW, (y - yMid) / yHalf));
  let z = z0;
  z -= (Math.max(0, 0.18 - v) / 0.18) * (1 - edge) * 0.02;
  z += (Math.max(0, v - 0.88) / 0.12) * (1 - edge) * 0.08;
  return new THREE.Vector3(x, y, z);
}

type ShellPart = 'gold' | 'roof' | 'wind' | 'doorL' | 'doorR';

/** Parameter-aligned regions so the glass, roof, and door edges follow the surface. */
function classifyShell(v: number, theta: number): ShellPart {
  const side = Math.sin(theta);
  const up = Math.cos(theta);
  const lateral = Math.abs(side) > 0.58 && up < 0.45 && up > -0.08;
  if (lateral && v > 0.36 && v < 0.58) return side > 0 ? 'doorR' : 'doorL';
  if (v < 0.42 && up > 0.02 && Math.abs(side) < 0.78) return 'wind';
  if (up > 0.22 && v > 0.2) return 'roof';
  return 'gold';
}

function shellGeometry(part: ShellPart, hinge: THREE.Vector3) {
  const NU = 48;
  const NV = 64;
  const grid: THREE.Vector3[][] = [];
  for (let iv = 0; iv <= NV; iv++) {
    const row: THREE.Vector3[] = [];
    const v = iv / NV;
    for (let iu = 0; iu <= NU; iu++) row.push(shellPoint(v, (iu / NU) * Math.PI * 2));
    grid.push(row);
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const weld = new Map<string, number>();
  const door = part === 'doorL' || part === 'doorR';
  const vid = (v: THREE.Vector3) => {
    const x = door ? v.x - hinge.x : v.x;
    const y = door ? v.y - hinge.y : v.y;
    const z = door ? v.z - hinge.z : v.z;
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    const found = weld.get(key);
    if (found !== undefined) return found;
    const id = positions.length / 3;
    positions.push(x, y, z);
    weld.set(key, id);
    return id;
  };
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    indices.push(vid(a), vid(b), vid(c));
  };
  for (let iv = 0; iv < NV; iv++) {
    for (let iu = 0; iu < NU; iu++) {
      const a = grid[iv][iu];
      const b = grid[iv][iu + 1];
      const c = grid[iv + 1][iu + 1];
      const d = grid[iv + 1][iu];
      const center = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
      const v = (iv + 0.5) / NV;
      const theta = ((iu + 0.5) / NU) * Math.PI * 2;
      if (classifyShell(v, theta) !== part) continue;
      const outward = center.clone().sub(new THREE.Vector3(0, 0.62, 0));
      const normal = b.clone().sub(a).cross(d.clone().sub(a));
      if (normal.dot(outward) >= 0) {
        pushTri(a, b, d);
        pushTri(b, c, d);
      } else {
        pushTri(a, d, b);
        pushTri(b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Two-seat coupe teardrop: champagne body, dark glass roof, clear windshield,
 * butterfly curb door, full-width front Megalamp and rear light bar.
 * Artistic proportions from the published 1,754 mm width and 1,408 mm height.
 */
export function createCybercab() {
  const group = new THREE.Group();
  group.name = 'Cybercab';

  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xc4a06a, metalness: 0.42, roughness: 0.48, clearcoat: 0.18, clearcoatRoughness: 0.55,
    envMapIntensity: 0.32, sheen: 0.08, sheenColor: new THREE.Color('#e7d3b0'),
    emissive: new THREE.Color('#3a2c16'), emissiveIntensity: 0.04, side: THREE.DoubleSide,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x141a1e, metalness: 0.06, roughness: 0.52, envMapIntensity: 0.16, side: THREE.DoubleSide,
  });
  const windMat = new THREE.MeshPhysicalMaterial({
    color: 0xc5d2d6, metalness: 0.02, roughness: 0.08, transparent: true, opacity: 0.22,
    envMapIntensity: 0.28, side: THREE.DoubleSide, depthWrite: false,
  });
  const doorGlass = new THREE.MeshPhysicalMaterial({
    color: 0x1a2428, metalness: 0.12, roughness: 0.2, transparent: true, opacity: 0.78,
    envMapIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false,
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.55, metalness: 0.25 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.94 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0xc4a06a, metalness: 0.55, roughness: 0.38, envMapIntensity: 0.35 });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0xe7e1d4, roughness: 0.86 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xd7f0ff, emissiveIntensity: 1.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff2a22, emissive: 0xff1a12, emissiveIntensity: 1.4 });
  const megalampMat = new THREE.MeshStandardMaterial({
    color: MEGALAMP.color, emissive: MEGALAMP.color, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.05,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xf4f7ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xff8a00, emissiveIntensity: 0.15 });

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  const hinge = shellPoint(0.45, 0);
  hinge.x = 0;
  hinge.y -= 0.03;

  const body = mesh(shellGeometry('gold', hinge), gold);
  body.name = 'body';
  const roof = mesh(shellGeometry('roof', hinge), roofMat);
  roof.castShadow = false;
  roof.name = 'roof';
  const windshield = mesh(shellGeometry('wind', hinge), windMat);
  windshield.castShadow = false;
  windshield.name = 'windshield';

  const doors: { pivot: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    const sideHinge = hinge.clone();
    sideHinge.x = side * 0.22;
    pivot.position.copy(sideHinge);
    group.add(pivot);
    const panel = mesh(shellGeometry(side > 0 ? 'doorR' : 'doorL', sideHinge), doorGlass, pivot);
    panel.castShadow = false;
    panel.name = side > 0 ? 'doorR' : 'doorL';
    const rail = mesh(new RoundedBoxGeometry(0.07, 0.07, 1.15, 2, 0.02), gold, pivot);
    rail.position.set(side * 0.55, -0.42, 0.02);
    doors.push({ pivot, side });
  }

  const floor = mesh(new THREE.BoxGeometry(1.2, 0.05, 1.55), black);
  floor.position.set(0, 0.42, 0.12);
  floor.castShadow = false;
  const dash = mesh(new RoundedBoxGeometry(1.22, 0.08, 0.22, 2, 0.02), black);
  dash.position.set(0, 0.58, -0.78);
  dash.castShadow = false;
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
  const screen = mesh(new THREE.PlaneGeometry(1.16, 0.52), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 0.64, -0.95);
  screen.castShadow = false;
  screen.name = 'front-screen';

  for (const x of [-0.34, 0.34]) {
    const cushion = mesh(new RoundedBoxGeometry(0.5, 0.1, 0.48, 2, 0.04), upholstery);
    cushion.position.set(x, 0.52, 0.28);
    const back = mesh(new RoundedBoxGeometry(0.48, 0.42, 0.08, 2, 0.04), upholstery);
    back.position.set(x, 0.74, 0.5);
    back.rotation.x = -0.22;
  }

  const megalamp = mesh(new RoundedBoxGeometry(1.38, 0.08, 0.05, 2, 0.02), megalampMat);
  megalamp.position.set(0, 0.64, -2.1);
  megalamp.name = 'megalamp';
  const megalampGlow = mesh(new THREE.PlaneGeometry(1.5, 0.2), glowMat);
  megalampGlow.position.set(0, 0.64, -2.14);
  megalampGlow.castShadow = false;
  megalampGlow.renderOrder = 2;
  const frontWhiteL = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.04), white);
  frontWhiteL.position.set(-0.52, 0.52, -2.1);
  const frontWhiteR = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.04), white);
  frontWhiteR.position.set(0.52, 0.52, -2.1);
  const rearLamp = mesh(new RoundedBoxGeometry(1.16, 0.07, 0.05, 2, 0.015), red);
  rearLamp.position.set(0, 0.58, 2.32);
  rearLamp.name = 'rear-lightbar';
  const hazards: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.62, -2.1], [0.62, -2.1], [-0.52, 2.3], [0.52, 2.3]] as [number, number][]) {
    const h = mesh(new THREE.BoxGeometry(0.12, 0.045, 0.03), amber);
    h.position.set(x, z < 0 ? 0.36 : 0.5, z);
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
  plate.position.set(0, 0.4, 2.34);

  const lampLight = new THREE.PointLight(MEGALAMP.color, 0, 9, 2);
  lampLight.position.set(0, 0.85, -3.1);
  group.add(lampLight);

  const wheels: THREE.Group[] = [];
  for (const x of [-TRACK_X, TRACK_X]) {
    for (const z of AXLES) {
      const w = new THREE.Group();
      w.position.set(x, OUTER_R, z);
      group.add(w);
      wheels.push(w);
      const tire = mesh(new THREE.TorusGeometry(0.23, 0.11, 14, 28), rubber, w);
      tire.rotation.y = Math.PI / 2;
      const disc = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24), discMat, w);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = Math.sign(x) * 0.07;
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
      openSide = side;
      for (const door of doors) {
        const amount = door.side === openSide ? openAmount : 0;
        door.pivot.rotation.order = 'YXZ';
        door.pivot.rotation.y = -door.side * amount * 0.45;
        door.pivot.rotation.z = door.side * amount * 1.15;
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
