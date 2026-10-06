import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MEGALAMP, VEHICLE_PLATE } from './geo';

export type LampMode = 'idle' | 'match';

const WHEEL_R = 0.33;

export type Cybercab = {
  group: THREE.Group;
  megalamp: THREE.Object3D;
  cameraClearance: number;
  setDoor(open: number, side?: number): void;
  setLamp(mode: LampMode): void;
  setHazards(on: boolean): void;
  update(dt: number, speed: number): void;
};

function standardMaterial(material: THREE.Material): THREE.MeshStandardMaterial | null {
  return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial ? material as THREE.MeshStandardMaterial : null;
}

function champagnePaint() {
  return new THREE.MeshPhysicalMaterial({
    name: 'exterior_paint',
    color: '#c2a36b',
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    envMapIntensity: 0.95,
    sheen: 0.16,
    sheenRoughness: 0.38,
    sheenColor: new THREE.Color('#e7d3a4'),
    reflectivity: 0.68,
    ior: 1.5,
    specularIntensity: 1,
  });
}

function tintedGlass() {
  return new THREE.MeshPhysicalMaterial({
    name: 'glass',
    color: '#6e92a4',
    metalness: 0.04,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.45,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
    reflectivity: 0.9,
    ior: 1.5,
    specularIntensity: 1,
  });
}

let sharedPaint: THREE.MeshPhysicalMaterial | null = null;
let sharedGlass: THREE.MeshPhysicalMaterial | null = null;

function tuneBodyMaterial(material: THREE.Material) {
  const mat = standardMaterial(material);
  if (!mat) return material;
  mat.envMapIntensity = Math.max(mat.envMapIntensity, 1);
  if (mat.name === 'exterior_paint') return sharedPaint ??= champagnePaint();
  if (mat.name === 'glass') return sharedGlass ??= tintedGlass();
  if (mat.name === 'interior_leather') {
    mat.color.set('#d9cbb6');
    mat.roughness = 0.58;
    mat.metalness = 0;
    mat.envMapIntensity = 0.32;
    const leather = mat as THREE.MeshPhysicalMaterial;
    leather.sheen = 0.42;
    leather.sheenRoughness = 0.36;
    leather.sheenColor.set('#d9cbb6');
  } else if (mat.name === 'tire_rubber' || mat.name === 'panel_seal') {
    mat.roughness = 0.94;
    mat.metalness = 0;
    mat.envMapIntensity = 0.25;
  } else if (mat.name === 'wheel_finish') {
    mat.color.set('#2c3136');
    mat.metalness = 0.72;
    mat.roughness = 0.32;
    mat.envMapIntensity = 0.7;
  } else if (mat.name === 'machined_alloy') {
    mat.color.set('#c5ccd2');
    mat.metalness = 1;
    mat.roughness = 0.22;
    mat.envMapIntensity = 1.15;
  } else if (mat.name === 'lamp_lens') {
    const lens = mat as THREE.MeshPhysicalMaterial;
    lens.roughness = 0.06;
    lens.transmission = 0;
    lens.opacity = 0.55;
    lens.envMapIntensity = 1.3;
    lens.transparent = true;
    lens.depthWrite = false;
  }
  return material;
}

/**
 * Meshopt-compressed Cybercab glTF: champagne clearcoat, canopy glass,
 * butterfly doors, aero covers, and a full-width front light bar.
 * The model is an original sculpt, not a downloaded scan.
 */
export function loadCybercab(): Promise<Cybercab> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(`${import.meta.env.BASE_URL}models/cybercab.glb`).then((gltf) => assembleCybercab(gltf.scene));
}

function assembleCybercab(model: THREE.Group): Cybercab {
  const group = new THREE.Group();
  group.name = 'Cybercab';
  model.name = 'cybercab-mesh';
  group.add(model);

  const doorFL = model.getObjectByName('door_fl');
  const doorFR = model.getObjectByName('door_fr');
  const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((name) => model.getObjectByName(name));
  if (!doorFL || !doorFR || wheels.some((wheel) => !wheel)) throw new Error('Cybercab glTF is missing doors or wheels');

  let signature: THREE.MeshStandardMaterial | null = null;
  let tail: THREE.MeshStandardMaterial | null = null;
  let head: THREE.MeshStandardMaterial | null = null;
  let megalamp: THREE.Object3D = group;
  model.traverse((obj) => {
    if (obj.name === 'yoke' || obj.name === 'wheel_sport' || /^wheel_(fl|fr|rl|rr)__machined_alloy$/.test(obj.name)) obj.visible = false;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.name.includes('glass') ? false : true;
    mesh.receiveShadow = true;
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const tuned = sourceMaterials.map((material) => tuneBodyMaterial(material));
    mesh.material = Array.isArray(mesh.material) ? tuned : tuned[0];
    for (const material of tuned) {
      const mat = standardMaterial(material);
      if (!mat) continue;
      if (mat.name === 'signature_led') {
        signature = mat;
        megalamp = mesh;
        mesh.name = 'megalamp';
      } else if (mat.name === 'taillight_led') tail = mat;
      else if (mat.name === 'headlight_led') head = mat;
    }
  });

  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 256;
  plateCanvas.height = 128;
  const plateCtx = plateCanvas.getContext('2d')!;
  plateCtx.fillStyle = '#f3f0e4';
  plateCtx.fillRect(0, 0, 256, 128);
  plateCtx.fillStyle = '#163e86';
  plateCtx.fillRect(0, 0, 256, 28);
  plateCtx.fillStyle = '#ffffff';
  plateCtx.font = '700 16px sans-serif';
  plateCtx.textAlign = 'center';
  plateCtx.fillText('TEXAS', 128, 20);
  plateCtx.fillStyle = '#1a1a1a';
  plateCtx.font = '700 52px sans-serif';
  plateCtx.fillText(VEHICLE_PLATE, 128, 92);
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.18),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.45, metalness: 0.05 }),
  );
  plate.position.set(0, 0.5, 2.07);
  plate.castShadow = false;
  group.add(plate);

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xf4f7ff, transparent: true, opacity: 0.18, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.07), glowMat);
  glow.position.set(0, 0.582, -2.075);
  glow.castShadow = false;
  group.add(glow);

  const lampLight = new THREE.PointLight(MEGALAMP.color, 0.2, 8, 2);
  lampLight.position.set(0, 0.72, -2.4);
  group.add(lampLight);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const shadowCtx = shadowCanvas.getContext('2d')!;
  const gradient = shadowCtx.createRadialGradient(128, 128, 18, 128, 128, 124);
  gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowCtx.fillStyle = gradient;
  shadowCtx.fillRect(0, 0, 256, 256);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 4.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;
  contact.castShadow = false;
  contact.receiveShadow = false;
  group.add(contact);

  let lampMode: LampMode = 'idle';
  let hazardsOn = false;
  let lampTime = 0;

  function applyLamp(dt: number) {
    lampTime += dt;
    const blink = Math.sin(lampTime * 10) > 0;
    if (signature) {
      switch (lampMode) {
        case 'idle':
          signature.color.set('#f7fbff');
          signature.emissive.set('#f4f7ff');
          signature.emissiveIntensity = 3.2;
          glowMat.color.set('#f4f7ff');
          glowMat.opacity = 0.16;
          lampLight.color.set('#f4f7ff');
          lampLight.intensity = 0.35;
          break;
        case 'match':
          signature.color.set(MEGALAMP.color);
          signature.emissive.set(MEGALAMP.color);
          signature.emissiveIntensity = 5.4;
          glowMat.color.set(MEGALAMP.color);
          glowMat.opacity = 0.55;
          lampLight.color.set(MEGALAMP.color);
          lampLight.intensity = 0.7;
          break;
        default: {
          const neverMode: never = lampMode;
          return neverMode;
        }
      }
    }
    if (tail) tail.emissiveIntensity = hazardsOn ? (blink ? 8 : 0.25) : 3.1;
    if (head) head.emissiveIntensity = hazardsOn ? (blink ? 5.5 : 0.35) : 3.4;
  }

  const bodyRails = ['body__panel_seal', 'body__satin_trim']
    .map((name) => model.getObjectByName(name))
    .filter((node): node is THREE.Object3D => Boolean(node));

  return {
    group,
    megalamp,
    cameraClearance: 5.6,
    setDoor(open: number, side = 1) {
      const amount = THREE.MathUtils.clamp(open, 0, 1);
      const swing = (door: THREE.Object3D, doorSide: number) => {
        const openAmount = doorSide === side ? amount : 0;
        // Hinge is on the roof centerline. Yaw clears the opening; roll lifts the wing.
        door.rotation.order = 'XYZ';
        door.rotation.x = 0;
        door.rotation.y = doorSide * openAmount * 0.28;
        door.rotation.z = doorSide * openAmount * 1.12;
      };
      swing(doorFR, 1);
      swing(doorFL, -1);
      // Those rails are merged into the body, so they would cut across the open cabin.
      for (const rail of bodyRails) rail.visible = amount < 0.08;
    },
    setLamp(mode: LampMode) { lampMode = mode; },
    setHazards(on: boolean) { hazardsOn = on; },
    update(dt: number, speed: number) {
      applyLamp(dt);
      for (const wheel of wheels) {
        if (wheel) wheel.rotation.x -= speed * dt / WHEEL_R;
      }
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
