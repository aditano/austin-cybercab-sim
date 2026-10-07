import * as THREE from 'three';
import { createPedestrian, createStreetCar } from './vehicle';
import { kindFromIndex, type SpawnedPerson, type StreetAssets } from './assets';
import { ROAD_Y } from './geo';
import { easeVehicleSpeed, npcHeading, signalOffset, stepPedestrian, stepTrafficDist, streetBudget, type Quality } from './logic';

export type LightPhase = 'green' | 'yellow' | 'red';

const CYCLE = 22;
const paints = [0xe8e4dc, 0x2f3840, 0x8a3b32, 0xc9c3b6, 0x4a5c62, 0xdfe3e0, 0x1e2428, 0x6b7180, 0xbf5700, 0x243026];
/** Offsets from the Cybercab travel lane (already ~4.7 m east of OSM centerline). */
const OFFSET = { sidewalk: 5.7, park: 3.8, follow: 0, oncoming: -6.1, oppPark: -8.4, oppWalk: -10.6, pole: 6.5 };

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
  const crossings = [0.18, 0.42, 0.68].map((f) => f * routeLength);

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

  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.62, metalness: 0.02 });
  for (let n = 0; n < crossings.length; n++) {
    const mid = (OFFSET.sidewalk + OFFSET.oppWalk) / 2;
    const span = Math.abs(OFFSET.sidewalk - OFFSET.oppWalk) - 1.4;
    for (let i = -3; i <= 3; i++) {
      const { position, heading } = sample(crossings[n] + i * 0.72);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(span, 0.02, 0.4), stripeMat);
      stripe.position.copy(position).addScaledVector(acrossOf(heading), mid);
      stripe.position.y = ROAD_Y + 0.035;
      stripe.rotation.y = heading;
      stripe.receiveShadow = true;
      stripe.castShadow = false;
      root.add(stripe);
    }
  }

  type Car = { mesh: THREE.Object3D; dist: number; lane: number; speed: number; pace: number; against: boolean };
  type Ped = { mesh: THREE.Object3D; dist: number; side: number; crossing: boolean; t: number; seed: number; person: SpawnedPerson | null };
  const cars: Car[] = [];
  const peds: Ped[] = [];
  const parked: THREE.Object3D[] = [];

  const colors = [0x32d46a, 0xf0c43a, 0xff3b30];
  let time = 0;
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clearGroup(items: THREE.Object3D[]) {
    for (const mesh of items) root.remove(mesh);
    items.length = 0;
  }

  function populate(assets: StreetAssets | null, quality: Quality) {
    for (const car of cars) root.remove(car.mesh);
    cars.length = 0;
    for (const ped of peds) root.remove(ped.mesh);
    peds.length = 0;
    clearGroup(parked);
    const budget = streetBudget(quality);
    for (let i = 0; i < budget.movingCars; i++) {
      const mesh = assets
        ? assets.spawnCar(kindFromIndex(i), paints[i % paints.length])
        : createStreetCar(['sedan', 'suv', 'van', 'pickup'][i % 4] as 'sedan', paints[i % paints.length]);
      root.add(mesh);
      const against = i % 2 === 1;
      const pace = 6.2 + (i % 3) * 1.1;
      cars.push({
        mesh,
        dist: against
          ? routeLength - 18 - (i / Math.max(1, budget.movingCars)) * routeLength * 0.7
          : 36 + (i / Math.max(1, budget.movingCars)) * routeLength * 0.8,
        lane: against ? OFFSET.oncoming : OFFSET.follow,
        speed: pace,
        pace,
        against,
      });
    }
    for (let i = 0; i < budget.peds; i++) {
      const person = assets ? assets.spawnPerson(i + 3, quality) : null;
      const mesh = person?.group ?? createPedestrian(i + 3);
      root.add(mesh);
      peds.push({
        mesh, dist: (i / Math.max(1, budget.peds)) * routeLength,
        side: i % 2 === 0 ? 1 : -1, crossing: false, t: 0, seed: i, person,
      });
    }
    for (let i = 0; i < Math.min(10, budget.parked); i++) {
      const mesh = assets
        ? assets.spawnCar(kindFromIndex(i + 4), paints[(i + 3) % paints.length])
        : createStreetCar(['sedan', 'suv', 'van', 'pickup'][i % 4] as 'sedan', paints[(i + 3) % paints.length]);
      const { position, heading } = sample((i + 0.8) / 12 * routeLength);
      const across = acrossOf(heading);
      const east = i % 2 === 0;
      mesh.position.copy(position).addScaledVector(across, east ? OFFSET.park : OFFSET.oppPark);
      mesh.position.y = ROAD_Y;
      mesh.rotation.y = heading + (east ? 0 : Math.PI);
      root.add(mesh);
      parked.push(mesh);
    }
  }

  function cabBlocked(cabDist: number, cabSpeed: number): { stop: boolean; stopDist: number; phase: LightPhase } {
    let stopDist = 1e9;
    let nearest: LightPhase = 'green';
    crossings.forEach((d, index) => {
      const phase = lightAt(time, signalOffset(index));
      const gap = d - cabDist;
      if (gap > 0 && gap < 28) {
        nearest = phase;
        if (phase === 'red') stopDist = Math.min(stopDist, gap);
        if (phase === 'yellow') {
          const stopping = (cabSpeed * cabSpeed) / (2 * 3.5);
          if (gap > stopping + 2) stopDist = Math.min(stopDist, gap);
        }
      }
    });
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
    populate,
    objects(): THREE.Object3D[] {
      return [...cars.map((c) => c.mesh), ...parked];
    },
    update(dt: number, cabDist: number, cabSpeed = 8) {
      time += dt;
      for (const signal of signals) {
        const phase = lightAt(time, signalOffset(crossings.indexOf(signal.distance)));
        const idx = phase === 'green' ? 2 : phase === 'yellow' ? 1 : 0;
        signal.lamps.forEach((mat, i) => {
          mat.emissive.setHex(i === idx ? colors[i] : 0x111111);
          mat.color.setHex(i === idx ? colors[i] : 0x111111);
          mat.emissiveIntensity = i === idx ? 2.6 : 0.12;
        });
      }
      for (const car of cars) {
        let nearIndex = -1;
        let nearGap = 14;
        crossings.forEach((d, index) => {
          const gap = car.against ? car.dist - d : d - car.dist;
          if (gap > 0 && gap < nearGap) { nearGap = gap; nearIndex = index; }
        });
        const phase = nearIndex >= 0 ? lightAt(time, signalOffset(nearIndex)) : 'green';
        let target = car.pace;
        if (nearIndex >= 0 && (phase === 'red' || phase === 'yellow')) target = 0;
        const sameWay = cars.filter((other) => other !== car && other.against === car.against && Math.abs(other.lane - car.lane) < 0.2);
        const ahead = sameWay
          .filter((other) => car.against ? other.dist < car.dist : other.dist > car.dist)
          .sort((a, b) => car.against ? b.dist - a.dist : a.dist - b.dist)[0];
        if (ahead) {
          const gap = car.against ? car.dist - ahead.dist : ahead.dist - car.dist;
          if (gap < 10) target = Math.min(target, Math.max(0, gap - 6));
        }
        if (!car.against && Math.abs(car.lane - OFFSET.follow) < 0.2 && cabDist > car.dist && cabDist - car.dist < 10) {
          target = Math.min(target, Math.max(0, cabDist - car.dist - 6));
        }
        car.speed = easeVehicleSpeed(car.speed, target, dt);
        car.dist = stepTrafficDist({
          dist: car.dist, speed: car.speed, dt, against: car.against, routeLength, cabDist,
        });
        const { position, heading } = sample(THREE.MathUtils.clamp(car.dist, 0.2, routeLength - 0.2));
        car.mesh.position.copy(position).addScaledVector(acrossOf(heading), car.lane);
        car.mesh.position.y = ROAD_Y;
        car.mesh.rotation.y = npcHeading(heading, car.against);
        const wheels = car.mesh.userData.wheels as THREE.Object3D[] | undefined;
        if (wheels) for (const wheel of wheels) wheel.rotation.x -= car.speed * dt / 0.33;
      }
      for (const ped of peds) {
        const nearCross = crossings.find((d) => Math.abs(d - ped.dist) < 6);
        const phase = lightAt(time, 0);
        const south = ped.side < 0;
        const stepped = stepPedestrian(ped, {
          dt,
          cabDist,
          red: phase === 'red',
          nearCross: !!nearCross,
          wantStart: !!(nearCross && phase === 'red' && !ped.crossing && Math.random() < dt * 0.12),
          routeLength,
          direction: south ? -1 : 1,
        });
        ped.crossing = stepped.crossing;
        ped.t = stepped.t;
        ped.dist = stepped.dist;
        if (stepped.sideFlip) ped.side *= -1;
        const { position, heading } = sample(THREE.MathUtils.clamp(ped.dist, 0.2, routeLength - 0.2));
        const walkE = OFFSET.sidewalk;
        const walkW = OFFSET.oppWalk;
        const from = ped.side > 0 ? walkE : walkW;
        const to = ped.side > 0 ? walkW : walkE;
        const side = ped.crossing ? THREE.MathUtils.lerp(from, to, ped.t) : from;
        ped.mesh.position.copy(position).addScaledVector(acrossOf(heading), side);
        ped.mesh.position.y = ROAD_Y;
        ped.mesh.rotation.y = ped.crossing ? heading + Math.PI / 2 * Math.sign(from - to) : heading + (south && !ped.crossing ? Math.PI : 0);
        if (ped.person) {
          const moving = !reduceMotion;
          ped.person.walk.setEffectiveWeight(moving ? 1 : 0);
          ped.person.idle.setEffectiveWeight(moving ? 0 : 1);
          ped.person.mixer.update(dt);
        } else {
          const swing = reduceMotion ? 0 : Math.sin((time + ped.seed) * 6.5) * (ped.crossing ? 0.35 : 0.55);
          ped.mesh.getObjectByName('legL')?.rotation.set(swing, 0, 0);
          ped.mesh.getObjectByName('legR')?.rotation.set(-swing, 0, 0);
          ped.mesh.getObjectByName('armL')?.rotation.set(-swing * 0.7, 0, 0);
          ped.mesh.getObjectByName('armR')?.rotation.set(swing * 0.7, 0, 0);
        }
      }
      return cabBlocked(cabDist, cabSpeed);
    },
  };
}
