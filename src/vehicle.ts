import * as THREE from 'three';
import { MEGALAMP } from './geo';

export type LampMode = 'idle' | 'match' | 'hazard';

/** Procedural two-seat Cybercab with RGB Megalamp, butterfly doors, and cabin screen. */
export function createCybercab() {
  const group = new THREE.Group();
  group.name = 'Cybercab';

  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xc4b089, metalness: 0.92, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08,
    envMapIntensity: 1.35, sheen: 0.25, sheenColor: new THREE.Color('#e8d7b0'), side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c1820, metalness: 0.15, roughness: 0.04, transmission: 0.55, thickness: 0.35,
    ior: 1.45, transparent: true, opacity: 0.78, envMapIntensity: 1.6, side: THREE.DoubleSide,
  });
  const cabinGlass = glass.clone();
  cabinGlass.transmission = 0.72; cabinGlass.opacity = 0.42; cabinGlass.depthWrite = false;
  const black = new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.7 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.92 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xb8bdba, metalness: 0.95, roughness: 0.16, envMapIntensity: 1.2 });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0xc2bcae, roughness: 0.88 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xd7f0ff, emissiveIntensity: 2.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff2a22, emissive: 0xff1a12, emissiveIntensity: 2.2 });
  const megalampMat = new THREE.MeshStandardMaterial({
    color: MEGALAMP.color, emissive: MEGALAMP.color, emissiveIntensity: 0.35, roughness: 0.18, metalness: 0.2,
  });
  const badgeMat = new THREE.MeshStandardMaterial({ color: 0x1a1d1c, roughness: 0.4 });

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  function loft(sections: number[][], mat: THREE.Material, parent: THREE.Object3D = group) {
    const verts: number[] = [];
    const indices: number[] = [];
    sections.forEach(([z, width, bottom, shoulder, crown]) => {
      [[-width * 0.84, bottom], [-width, shoulder], [-width * 0.77, crown],
        [width * 0.77, crown], [width, shoulder], [width * 0.84, bottom]].forEach(([x, y]) => verts.push(x, y, z));
    });
    for (let s = 0; s < sections.length - 1; s++) {
      for (let j = 0; j < 6; j++) {
        const a = s * 6 + j, b = s * 6 + (j + 1) % 6, c = b + 6, d = a + 6;
        indices.push(a, b, d, b, c, d);
      }
    }
    indices.push(0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4);
    const n = (sections.length - 1) * 6;
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3, n, n + 3, n + 4, n, n + 4, n + 5);
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return mesh(g, mat, parent);
  }

  loft([
    [-2.28, 0.68, 0.36, 0.52, 0.58], [-2.05, 0.86, 0.3, 0.66, 0.74],
    [-1.55, 0.91, 0.29, 0.78, 0.84], [-0.9, 0.925, 0.29, 0.84, 0.88],
    [0, 0.93, 0.29, 0.845, 0.9], [0.85, 0.925, 0.29, 0.84, 0.89],
    [1.55, 0.9, 0.31, 0.81, 0.86], [2.2, 0.74, 0.4, 0.67, 0.74],
  ], gold);
  loft([[-2.12, 0.76, 0.26, 0.32, 0.36], [-1.1, 0.88, 0.2, 0.28, 0.31], [1.55, 0.86, 0.2, 0.29, 0.32], [2.14, 0.72, 0.32, 0.38, 0.41]], black);

  function panel(points: number[], mat: THREE.Material, parent: THREE.Object3D = group) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return mesh(g, mat, parent);
  }
  panel([-0.74, 0.84, -1.2, 0.74, 0.84, -1.2, 0.64, 1.48, -0.22, -0.64, 1.48, -0.22], cabinGlass);
  panel([-0.64, 1.48, -0.22, 0.64, 1.48, -0.22, 0.63, 1.47, 0.68, -0.63, 1.47, 0.68], glass);
  panel([-0.63, 1.47, 0.68, 0.63, 1.47, 0.68, 0.78, 0.87, 1.78, -0.78, 0.87, 1.78], glass);

  function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D = group) {
    const v = b.clone().sub(a);
    const o = mesh(new THREE.CylinderGeometry(r, r, v.length(), 10), mat, parent);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    return o;
  }
  for (const s of [-1, 1]) {
    bar(new THREE.Vector3(s * 0.76, 0.85, -1.18), new THREE.Vector3(s * 0.66, 1.48, -0.22), 0.032, gold);
    bar(new THREE.Vector3(s * 0.66, 1.48, -0.22), new THREE.Vector3(s * 0.65, 1.47, 0.68), 0.033, gold);
    bar(new THREE.Vector3(s * 0.65, 1.47, 0.68), new THREE.Vector3(s * 0.81, 0.88, 1.72), 0.034, gold);
  }

  const megalamp = mesh(new THREE.BoxGeometry(1.52, 0.028, 0.036), megalampMat);
  megalamp.position.set(0, 0.648, -2.18);
  const frontWhite = mesh(new THREE.BoxGeometry(1.46, 0.018, 0.02), white);
  frontWhite.position.set(0, 0.618, -2.185);
  const rearLamp = mesh(new THREE.BoxGeometry(1.48, 0.026, 0.034), red);
  rearLamp.position.set(0, 0.73, 2.18);
  for (const x of [-0.62, 0.62]) {
    const lamp = mesh(new THREE.BoxGeometry(0.16, 0.05, 0.028), white);
    lamp.position.set(x, 0.46, -2.2);
  }
  const badge = mesh(new THREE.BoxGeometry(0.34, 0.04, 0.01), badgeMat);
  badge.position.set(0, 0.52, -2.21);

  const wheels: THREE.Group[] = [];
  for (const x of [-0.88, 0.88]) for (const z of [-1.35, 1.37]) {
    const w = new THREE.Group();
    w.position.set(x, 0.355, z);
    group.add(w);
    wheels.push(w);
    const t = mesh(new THREE.TorusGeometry(0.268, 0.09, 14, 36), rubber, w);
    t.rotation.y = Math.PI / 2;
    const rim = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 28), black, w);
    rim.rotation.z = Math.PI / 2;
    const side = Math.sign(x);
    const cap = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 20), alloy, w);
    cap.rotation.z = Math.PI / 2;
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const spoke = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.06), alloy, w);
      spoke.position.set(side * 0.1, Math.cos(angle) * 0.14, Math.sin(angle) * 0.14);
      spoke.rotation.x = angle;
    }
    const ring = mesh(new THREE.TorusGeometry(0.24, 0.012, 8, 36), alloy, w);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = side * 0.108;
    const arch = mesh(new THREE.TorusGeometry(0.37, 0.024, 8, 28, Math.PI), black);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(x, 0.355, z);
  }

  const doors: { pivot: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.8, 0.84, -0.8);
    group.add(pivot);
    panel([side * 0.08, -0.35, 0, side * 0.11, -0.34, 1.69, side * 0.1, 0.01, 1.68, side * 0.08, 0, 0], gold, pivot);
    panel([side * 0.08, 0.01, 0, side * 0.1, 0.01, 1.68, side * -0.15, 0.58, 1.39, side * -0.16, 0.6, 0.56], cabinGlass, pivot);
    const arm = mesh(new THREE.BoxGeometry(0.075, 0.07, 0.62), black, pivot);
    arm.position.set(side * -0.06, -0.04, 0.85);
    bar(new THREE.Vector3(side * 0.08, 0, 0), new THREE.Vector3(side * 0.1, 0, 1.68), 0.012, black, pivot);
    doors.push({ pivot, side });
  }

  const floor = mesh(new THREE.BoxGeometry(1.55, 0.07, 2.18), black);
  floor.position.set(0, 0.49, 0.1);
  function cushion(w: number, h: number, d: number, parent: THREE.Object3D) {
    const shape = new THREE.Shape();
    const r = 0.06, x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.025, bevelThickness: 0.025, curveSegments: 8 });
    geom.translate(0, 0, -d / 2);
    return mesh(geom, upholstery, parent);
  }
  for (const x of [-0.4, 0.4]) {
    const seat = new THREE.Group();
    seat.position.set(x, 0.62, 0.64);
    group.add(seat);
    const base = cushion(0.57, 0.14, 0.58, seat); base.position.z = -0.1;
    const back = cushion(0.56, 0.55, 0.12, seat); back.position.set(0, 0.31, 0.2); back.rotation.x = -0.13;
    const head = cushion(0.32, 0.2, 0.115, seat); head.position.set(0, 0.65, 0.23);
    for (const side of [-1, 1]) {
      const bolster = cushion(0.07, 0.44, 0.11, seat);
      bolster.position.set(side * 0.235, 0.28, 0.13);
    }
    const belt = mesh(new THREE.BoxGeometry(0.034, 0.58, 0.012), black, seat);
    belt.position.set(-0.16, 0.3, 0.118); belt.rotation.z = -0.3;
  }
  const dash = mesh(new THREE.BoxGeometry(1.43, 0.075, 0.27), black);
  dash.position.set(0, 0.86, -0.81); dash.rotation.x = -0.06;
  const screenFrame = mesh(new THREE.BoxGeometry(0.62, 0.36, 0.025), black);
  screenFrame.position.set(0, 1.02, -0.7); screenFrame.rotation.x = -0.1;
  const screen = mesh(new THREE.PlaneGeometry(0.57, 0.32), new THREE.MeshBasicMaterial({ color: 0x0e1614 }));
  screen.position.set(0, 1.02, -0.684); screen.rotation.x = -0.1;
  const ambient = new THREE.MeshStandardMaterial({ color: 0xd6bd87, emissive: 0xd6bd87, emissiveIntensity: 1.15 });
  const strip = mesh(new THREE.BoxGeometry(1.35, 0.006, 0.008), ambient);
  strip.position.set(0, 0.895, -0.66);

  let lampMode: LampMode = 'idle';
  let lampTime = 0;
  function applyLamp(dt: number) {
    lampTime += dt;
    const blink = Math.sin(lampTime * 10) > 0;
    switch (lampMode) {
      case 'idle':
        megalampMat.emissiveIntensity = 0.28;
        megalampMat.emissive.setHex(0xf2f6ff);
        megalampMat.color.setHex(0xf2f6ff);
        red.emissiveIntensity = 1.4;
        break;
      case 'match':
        megalampMat.color.setHex(MEGALAMP.color);
        megalampMat.emissive.setHex(MEGALAMP.color);
        megalampMat.emissiveIntensity = 4.8 + Math.sin(lampTime * 3) * 0.6;
        red.emissiveIntensity = 3.2;
        break;
      case 'hazard':
        megalampMat.color.setHex(MEGALAMP.color);
        megalampMat.emissive.setHex(MEGALAMP.color);
        megalampMat.emissiveIntensity = blink ? 5.4 : 0.15;
        red.emissiveIntensity = blink ? 4.2 : 0.2;
        break;
      default: {
        const _never: never = lampMode;
        return _never;
      }
    }
  }

  return {
    group,
    megalamp,
    setDoor(openAmount: number) {
      const a = THREE.MathUtils.clamp(openAmount, 0, 1);
      for (const { pivot, side } of doors) {
        pivot.rotation.z = -side * a * 1.18;
        pivot.rotation.x = -a * 0.22;
      }
    },
    setLamp(mode: LampMode) { lampMode = mode; },
    update(dt: number, speed: number) {
      applyLamp(dt);
      for (const w of wheels) w.rotation.x -= speed * dt / 0.35;
    },
  };
}

export type StreetKind = 'sedan' | 'suv' | 'van' | 'pickup';

export function createStreetCar(kind: StreetKind, paint: number) {
  const group = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({
    color: paint, metalness: 0.78, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.15,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2c33, metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.55, envMapIntensity: 1.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.9 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xf0ead8, emissive: 0xddd4b6, emissiveIntensity: 0.45 });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; group.add(o); return o;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const specs = {
    sedan: { w: 1.78, h: 0.52, l: 4.35, cabin: 2.2, roof: 0.55 },
    suv: { w: 1.9, h: 0.7, l: 4.55, cabin: 2.45, roof: 0.72 },
    van: { w: 1.95, h: 0.85, l: 5.1, cabin: 3.2, roof: 0.95 },
    pickup: { w: 1.92, h: 0.68, l: 5.2, cabin: 1.85, roof: 0.7 },
  }[kind];
  add(box, body, 0, 0.52, 0, specs.w, specs.h, specs.l);
  add(box, glass, 0, 0.52 + specs.h * 0.55 + specs.roof * 0.35, kind === 'pickup' ? -0.45 : 0.05, specs.w * 0.86, specs.roof, specs.cabin);
  add(box, body, 0, 0.52 + specs.h * 0.55 + specs.roof * 0.85, kind === 'pickup' ? -0.45 : 0.05, specs.w * 0.9, 0.1, specs.cabin * 0.96);
  if (kind === 'pickup') add(box, body, 0, 0.62, 1.45, specs.w * 0.92, 0.22, 1.7);
  add(box, lamp, 0, 0.52, -specs.l * 0.5 + 0.04, specs.w * 0.72, 0.08, 0.06);
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-specs.w * 0.42, specs.w * 0.42]) for (const z of [-specs.l * 0.32, specs.l * 0.32]) {
    const w = new THREE.Mesh(wheelGeo, rubber);
    w.position.set(x, 0.33, z); w.castShadow = true; group.add(w);
  }
  return group;
}

export function createPedestrian(seed: number) {
  const group = new THREE.Group();
  const tone = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.08, 0.35, 0.35 + (seed % 5) * 0.06), roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((seed * 0.17) % 1, 0.35, 0.38), roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 4, 8), cloth);
  torso.position.y = 1.05; torso.castShadow = true; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), tone);
  head.position.y = 1.48; head.castShadow = true; group.add(head);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.46, 4, 8), cloth);
  legs.position.y = 0.42; group.add(legs);
  return group;
}
