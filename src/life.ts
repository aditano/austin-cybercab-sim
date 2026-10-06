import * as THREE from 'three';
import { createPedestrian, createStreetCar, type StreetKind } from './vehicle';
import { ROAD_Y } from './geo';

export type LightPhase = 'green' | 'yellow' | 'red';

const CYCLE = 22;
const paints = [0xe8e4dc, 0x2f3840, 0x8a3b32, 0xc9c3b6, 0x4a5c62, 0xdfe3e0, 0x1e2428, 0x6b7180];
const kinds: StreetKind[] = ['sedan', 'suv', 'van', 'pickup'];
/** Offsets from the Cybercab travel lane (already ~4.7 m east of OSM centerline). */
const OFFSET = { sidewalk: 5.7, park: 3.8, follow: 0, pass: -3.4, oppPark: -8.4, oppWalk: -10.6, pole: 6.5 };

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

  const signals: { lamps: THREE.MeshStandardMaterial[]; distance: number }[] = [];
  const crossings = [0.18, 0.42, 0.68].map(f => f * routeLength);

  function sample(d: number) {
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < d) i++;
    const span = Math.max(1e-4, cumulative[i] - cumulative[i - 1]);
    const t = THREE.MathUtils.clamp((d - cumulative[i - 1]) / span, 0, 1);
    const position = route[i - 1].clone().lerp(route[i], t);
    const heading = Math.atan2(-(route[i].x - route[i - 1].x), -(route[i].z - route[i - 1].z));
    return { position, heading };
  }
  function acrossOf(heading: number) {
    return new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3030, metalness: 0.7, roughness: 0.32 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x16191a, roughness: 0.5 });
  for (let n = 0; n < crossings.length; n++) {
    const { position, heading } = sample(crossings[n]);
    const across = acrossOf(heading);
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      const lateral = side > 0 ? OFFSET.pole : OFFSET.oppWalk;
      group.position.copy(position).addScaledVector(across, lateral);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 5.8, 8), poleMat);
      pole.position.y = 2.9; pole.castShadow = true; group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), poleMat);
      arm.position.set(-side * 1.0, 5.5, 0); group.add(arm);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.85, 0.22), housing);
      box.position.set(-side * 2.1, 5.15, 0); group.add(box);
      const lamps: THREE.MeshStandardMaterial[] = [];
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0x111, emissiveIntensity: 0.2 });
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), mat);
        lens.position.set(-side * 2.1, 5.4 - i * 0.24, 0.12);
        group.add(lens);
        lamps.push(mat);
      }
      root.add(group);
      signals.push({ lamps, distance: crossings[n] });
    }
  }

  type Car = { mesh: THREE.Object3D; dist: number; lane: number; speed: number };
  const cars: Car[] = [];
  for (let i = 0; i < 6; i++) {
    const mesh = createStreetCar(kinds[i % kinds.length], paints[i % paints.length]);
    root.add(mesh);
    cars.push({ mesh, dist: 40 + (i / 6) * routeLength, lane: OFFSET.pass, speed: 6.5 + (i % 3) });
  }

  type Ped = { mesh: THREE.Object3D; dist: number; side: number; crossing: boolean; t: number; seed: number };
  const peds: Ped[] = [];
  for (let i = 0; i < 10; i++) {
    const mesh = createPedestrian(i + 3);
    root.add(mesh);
    peds.push({ mesh, dist: (i / 10) * routeLength, side: i % 2 === 0 ? 1 : -1, crossing: false, t: 0, seed: i });
  }

  for (let i = 0; i < 10; i++) {
    const mesh = createStreetCar(kinds[(i + 1) % kinds.length], paints[(i + 3) % paints.length]);
    const { position, heading } = sample((i + 0.8) / 12 * routeLength);
    const across = acrossOf(heading);
    const east = i % 2 === 0;
    mesh.position.copy(position).addScaledVector(across, east ? OFFSET.park : OFFSET.oppPark);
    mesh.position.y = ROAD_Y;
    mesh.rotation.y = heading + (east ? 0 : Math.PI);
    root.add(mesh);
  }

  const colors = [0x32d46a, 0xf0c43a, 0xff3b30];
  let time = 0;

  function cabBlocked(cabDist: number, cabSpeed: number): { stop: boolean; stopDist: number; phase: LightPhase } {
    let stopDist = 1e9;
    let nearest: LightPhase = 'green';
    for (const d of crossings) {
      const phase = lightAt(time, 0);
      const gap = d - cabDist;
      if (gap > 0 && gap < 28) {
        nearest = phase;
        if (phase === 'red') stopDist = Math.min(stopDist, gap);
        if (phase === 'yellow') {
          const stopping = (cabSpeed * cabSpeed) / (2 * 3.5);
          if (gap > stopping + 2) stopDist = Math.min(stopDist, gap);
        }
      }
    }
    for (const ped of peds) {
      if (ped.crossing && ped.dist > cabDist - 1 && ped.dist - cabDist < 10) stopDist = Math.min(stopDist, Math.max(2, ped.dist - cabDist));
    }
    for (const car of cars) {
      if (Math.abs(car.lane - OFFSET.follow) < 0.2 && car.dist > cabDist && car.dist - cabDist < 8) {
        stopDist = Math.min(stopDist, car.dist - cabDist - 5);
      }
    }
    return { stop: stopDist < 18, stopDist, phase: nearest };
  }

  return {
    update(dt: number, cabDist: number, cabSpeed = 8) {
      time += dt;
      for (const signal of signals) {
        const phase = lightAt(time, 0);
        const idx = phase === 'green' ? 2 : phase === 'yellow' ? 1 : 0;
        signal.lamps.forEach((mat, i) => {
          mat.emissive.setHex(i === idx ? colors[i] : 0x111111);
          mat.color.setHex(i === idx ? colors[i] : 0x111111);
          mat.emissiveIntensity = i === idx ? 2.6 : 0.12;
        });
      }
      for (const car of cars) {
        const phase = lightAt(time, 0);
        const near = crossings.find(d => car.dist < d && d - car.dist < 14);
        let speed = car.speed;
        if (near && (phase === 'red' || phase === 'yellow')) speed = 0;
        const ahead = cars.filter(o => o !== car && Math.abs(o.lane - car.lane) < 0.2 && o.dist > car.dist).sort((a, b) => a.dist - b.dist)[0];
        if (ahead && ahead.dist - car.dist < 10) speed = Math.min(speed, Math.max(0, ahead.dist - car.dist - 6));
        if (Math.abs(car.lane - OFFSET.follow) < 0.2 && cabDist > car.dist && cabDist - car.dist < 10) speed = Math.min(speed, Math.max(0, cabDist - car.dist - 6));
        car.dist += speed * dt;
        if (car.dist > routeLength + 30) car.dist = 8 + Math.random() * 12;
        const { position, heading } = sample(THREE.MathUtils.clamp(car.dist, 0.2, routeLength - 0.2));
        car.mesh.position.copy(position).addScaledVector(acrossOf(heading), car.lane);
        car.mesh.position.y = ROAD_Y;
        car.mesh.rotation.y = heading;
      }
      for (const ped of peds) {
        const nearCross = crossings.find(d => Math.abs(d - ped.dist) < 6);
        const phase = lightAt(time, 0);
        if (nearCross && phase === 'red' && !ped.crossing && Math.random() < dt * 0.12) {
          ped.crossing = true; ped.t = 0;
        }
        if (ped.crossing) {
          ped.t += dt * 1.35 / 16;
          if (ped.t > 1) { ped.crossing = false; ped.side *= -1; }
        } else {
          ped.dist += 1.15 * dt;
          if (ped.dist > routeLength - 8) ped.dist = 8;
        }
        const { position, heading } = sample(THREE.MathUtils.clamp(ped.dist, 0.2, routeLength - 0.2));
        const walkE = OFFSET.sidewalk;
        const walkW = OFFSET.oppWalk;
        const from = ped.side > 0 ? walkE : walkW;
        const to = ped.side > 0 ? walkW : walkE;
        const side = ped.crossing ? THREE.MathUtils.lerp(from, to, ped.t) : from;
        ped.mesh.position.copy(position).addScaledVector(acrossOf(heading), side);
        ped.mesh.position.y = ROAD_Y;
        ped.mesh.rotation.y = ped.crossing ? heading + Math.PI / 2 * Math.sign(from - to) : heading;
        const swing = Math.sin((time + ped.seed) * 6.5) * (ped.crossing ? 0.35 : 0.55);
        ped.mesh.getObjectByName('legL')?.rotation.set(swing, 0, 0);
        ped.mesh.getObjectByName('legR')?.rotation.set(-swing, 0, 0);
        ped.mesh.getObjectByName('armL')?.rotation.set(-swing * 0.7, 0, 0);
        ped.mesh.getObjectByName('armR')?.rotation.set(swing * 0.7, 0, 0);
      }
      return cabBlocked(cabDist, cabSpeed);
    },
  };
}
