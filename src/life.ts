import * as THREE from 'three';
import { createPedestrian, createStreetCar, type StreetKind } from './vehicle';

export type LightPhase = 'green' | 'yellow' | 'red';

const CYCLE = 22;
const paints = [0xe8e4dc, 0x2f3840, 0x8a3b32, 0xc9c3b6, 0x4a5c62, 0xdfe3e0, 0x1e2428, 0x6b7180];
const kinds: StreetKind[] = ['sedan', 'suv', 'van', 'pickup'];

export function lightAt(time: number, offset = 0): LightPhase {
  const t = ((time + offset) % CYCLE + CYCLE) % CYCLE;
  if (t < 12) return 'green';
  if (t < 15) return 'yellow';
  return 'red';
}

export function createCityLife(scene: THREE.Scene, route: THREE.Vector3[], cumulative: number[], routeLength: number) {
  const root = new THREE.Group();
  root.name = 'city-life';
  scene.add(root);

  const signals: { group: THREE.Group; lamps: THREE.MeshStandardMaterial[]; offset: number; distance: number }[] = [];
  const crossings = [0.08, 0.38, 0.72].map((f) => f * routeLength);

  function sample(d: number) {
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < d) i++;
    const span = Math.max(1e-4, cumulative[i] - cumulative[i - 1]);
    const t = THREE.MathUtils.clamp((d - cumulative[i - 1]) / span, 0, 1);
    const position = route[i - 1].clone().lerp(route[i], t);
    const heading = Math.atan2(-(route[i].x - route[i - 1].x), -(route[i].z - route[i - 1].z));
    return { position, heading };
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3030, metalness: 0.7, roughness: 0.32 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x16191a, roughness: 0.5 });
  for (let n = 0; n < crossings.length; n++) {
    const { position, heading } = sample(crossings[n]);
    const across = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const along = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      const base = position.clone().addScaledVector(across, side * 8.5).addScaledVector(along, side * 6);
      group.position.copy(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 5.8, 8), poleMat);
      pole.position.y = 2.9; pole.castShadow = true; group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), poleMat);
      arm.position.set(-side * 1.2, 5.5, 0); group.add(arm);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.85, 0.22), housing);
      box.position.set(-side * 2.4, 5.15, 0); group.add(box);
      const lamps: THREE.MeshStandardMaterial[] = [];
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0x111, emissiveIntensity: 0.2 });
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), mat);
        lens.position.set(-side * 2.4, 5.4 - i * 0.24, 0.12);
        group.add(lens);
        lamps.push(mat);
      }
      root.add(group);
      signals.push({ group, lamps, offset: n * 7, distance: crossings[n] });
    }
  }

  type Car = { mesh: THREE.Object3D; dist: number; lane: number; speed: number; wait: number };
  const cars: Car[] = [];
  for (let i = 0; i < 10; i++) {
    const mesh = createStreetCar(kinds[i % kinds.length], paints[i % paints.length]);
    root.add(mesh);
    cars.push({ mesh, dist: (i / 10) * routeLength, lane: i % 2 === 0 ? 1 : -1, speed: 7 + (i % 4), wait: 0 });
  }

  type Ped = { mesh: THREE.Object3D; dist: number; side: number; crossing: boolean; t: number; seed: number };
  const peds: Ped[] = [];
  for (let i = 0; i < 16; i++) {
    const mesh = createPedestrian(i + 3);
    root.add(mesh);
    peds.push({ mesh, dist: (i / 16) * routeLength, side: i % 2 === 0 ? 1 : -1, crossing: false, t: 0, seed: i });
  }

  const parked: THREE.Object3D[] = [];
  for (let i = 0; i < 14; i++) {
    const mesh = createStreetCar(kinds[(i + 1) % kinds.length], paints[(i + 3) % paints.length]);
    const { position, heading } = sample((i + 0.6) / 15 * routeLength);
    const across = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    mesh.position.copy(position).addScaledVector(across, (i % 2 === 0 ? 1 : -1) * 7.6);
    mesh.rotation.y = heading + (i % 2 === 0 ? 0 : Math.PI);
    root.add(mesh);
    parked.push(mesh);
  }

  const colors = [0x32d46a, 0xf0c43a, 0xff3b30];
  let time = 0;

  function cabBlocked(cabDist: number): { stop: boolean; phase: LightPhase } {
    let stop = false;
    let nearest: LightPhase = 'green';
    for (const d of crossings) {
      const phase = lightAt(time, 0);
      if (cabDist < d && d - cabDist < 18 && (phase === 'red' || phase === 'yellow' && d - cabDist < 10)) {
        stop = true;
        nearest = phase;
      }
    }
    for (const ped of peds) {
      if (ped.crossing && Math.abs(ped.dist - cabDist) < 8) stop = true;
    }
    for (const car of cars) {
      if (car.lane === 1 && car.dist > cabDist && car.dist - cabDist < 9) stop = true;
    }
    return { stop, phase: nearest };
  }

  return {
    update(dt: number, cabDist: number) {
      time += dt;
      for (const signal of signals) {
        const phase = lightAt(time, 0);
        const idx = phase === 'green' ? 2 : phase === 'yellow' ? 1 : 0;
        signal.lamps.forEach((mat, i) => {
          mat.emissive.setHex(i === idx ? colors[i] : 0x111111);
          mat.color.setHex(i === idx ? colors[i] : 0x111111);
          mat.emissiveIntensity = i === idx ? 3.4 : 0.12;
        });
      }
      for (const car of cars) {
        const phase = lightAt(time, 0);
        const near = crossings.find((d) => car.dist < d && d - car.dist < 16);
        if (near && (phase === 'red' || phase === 'yellow')) car.wait = 0.4;
        if (car.wait > 0) { car.wait -= dt; }
        else car.dist += car.speed * dt;
        if (car.dist > routeLength + 20) car.dist = -15;
        const { position, heading } = sample(THREE.MathUtils.clamp(car.dist, 0, routeLength - 0.1));
        const across = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
        car.mesh.position.copy(position).addScaledVector(across, car.lane * 2.15);
        car.mesh.position.y = 0;
        car.mesh.rotation.y = heading;
      }
      for (const ped of peds) {
        const nearCross = crossings.find((d) => Math.abs(d - ped.dist) < 6);
        const phase = lightAt(time, 0);
        if (nearCross && phase === 'red' && !ped.crossing && Math.random() < dt * 0.15) {
          ped.crossing = true; ped.t = 0;
        }
        if (ped.crossing) {
          ped.t += dt * 1.4;
          if (ped.t > 1) { ped.crossing = false; ped.side *= -1; }
        } else {
          ped.dist += 1.15 * dt;
          if (ped.dist > routeLength) ped.dist = 2;
        }
        const { position, heading } = sample(THREE.MathUtils.clamp(ped.dist, 0, routeLength - 0.1));
        const across = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
        const side = ped.crossing ? THREE.MathUtils.lerp(ped.side * 6.2, -ped.side * 6.2, ped.t) : ped.side * 6.2;
        ped.mesh.position.copy(position).addScaledVector(across, side);
        ped.mesh.position.y = 0;
        ped.mesh.rotation.y = ped.crossing ? heading + Math.PI / 2 * Math.sign(ped.side) : heading + (ped.seed % 2) * Math.PI;
        ped.mesh.position.y += Math.abs(Math.sin((time + ped.seed) * 6)) * 0.03;
      }
      return cabBlocked(cabDist);
    },
  };
}
