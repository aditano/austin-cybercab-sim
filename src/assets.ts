import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Quality } from './logic';

export type StreetKind = 'sedan' | 'sedan-sports' | 'suv' | 'suv-luxury' | 'van' | 'pickup' | 'taxi' | 'police' | 'hatch';
export type PropKind = 'lamp' | 'hydrant' | 'bench' | 'trash' | 'planter' | 'tree' | 'cone' | 'dumpster' | 'stop' | 'street-sign' | 'warn' | 'signal' | 'pole';
export type HeroKind = 'facade' | 'escape' | 'shrub';

type PropId =
  | 'lamp-hi' | 'lamp-lo' | 'hydrant' | 'bench' | 'trash' | 'planter-hi' | 'planter-lo'
  | 'tree-lg' | 'tree-sm' | 'cone' | 'dumpster' | 'stop' | 'street-sign' | 'warn' | 'signal' | 'pole';

type Template = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  height: number;
  length: number;
  minY: number;
  meshCount: number;
};

const CAR_FILES: Record<StreetKind, string> = {
  sedan: 'cars/traffic-sedan.glb',
  'sedan-sports': 'cars/traffic-hatch.glb',
  hatch: 'cars/traffic-hatch.glb',
  suv: 'cars/traffic-suv.glb',
  'suv-luxury': 'cars/traffic-suv.glb',
  van: 'cars/traffic-suv.glb',
  pickup: 'cars/traffic-suv.glb',
  taxi: 'cars/traffic-sedan.glb',
  police: 'cars/traffic-suv.glb',
};

const PROP_FILES: Record<PropId, string> = {
  'lamp-hi': 'props/lamp.glb',
  'lamp-lo': 'props/light-curved.glb',
  hydrant: 'props/hydrant.glb',
  bench: 'props/bench.glb',
  trash: 'props/trash.glb',
  'planter-hi': 'props/planter.glb',
  'planter-lo': 'props/planter-kenney.glb',
  'tree-lg': 'props/tree-large.glb',
  'tree-sm': 'props/tree-small.glb',
  cone: 'props/construction-cone.glb',
  dumpster: 'props/dumpster.glb',
  stop: 'props/road-sign-stop.glb',
  'street-sign': 'props/road-sign-street.glb',
  warn: 'props/road-sign-warning.glb',
  signal: 'props/traffic-light.glb',
  pole: 'props/electricity-pole.glb',
};

const HERO_FILES: Record<HeroKind, string> = {
  facade: 'props/facade-apartments.glb',
  escape: 'props/fire-escape.glb',
  shrub: 'props/shrub.glb',
};

// Soldier and X Bot stay on disk for the license record. They are not spawned:
// one is a soldier, the other a robot. Walk clips are retargeted onto clothed rigs.
const CLIP_SOURCE = 'people/soldier.glb';
const PEOPLE = [
  { id: 'michelle', file: 'people/michelle.glb', strip: '' },
  { id: 'civilian', file: 'people/civilian.glb', strip: 'mixamorig:' },
] as const;

const TARGET_CAR_LENGTH: Record<StreetKind, number> = {
  sedan: 4.45, 'sedan-sports': 4.35, hatch: 4.2, suv: 4.7, 'suv-luxury': 4.85,
  van: 5.05, pickup: 5.2, taxi: 4.5, police: 4.6,
};

const TARGET_PROP_HEIGHT: Partial<Record<PropId, number>> = {
  'lamp-hi': 6.4, 'lamp-lo': 8.2, hydrant: 0.78, bench: 0.92, trash: 1.05,
  'planter-hi': 0.62, 'planter-lo': 0.7, 'tree-lg': 9.4, 'tree-sm': 6.2,
  cone: 0.72, dumpster: 1.35, stop: 3.1, 'street-sign': 3.2, warn: 3.1, signal: 5.4, pole: 9.5,
};

const SHIRTS = [0xbf5700, 0x1f2a44, 0xf4f1ea, 0x2c3338, 0x3d4c3a, 0x6e2430, 0xd7d2c8, 0x243026];

function url(file: string) {
  return `${import.meta.env.BASE_URL}models/${file}`;
}

function measure(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return { box, size, height: size.y, length: Math.max(size.x, size.z), minY: box.min.y };
}

function sitOnGround(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;
}

function prepare(root: THREE.Object3D, shadows: boolean) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = shadows;
    obj.receiveShadow = shadows;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.85);
      }
    }
  });
}

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((obj) => {
    if (!found && obj instanceof THREE.Mesh) found = obj;
  });
  return found;
}

function resolveProp(kind: PropKind, quality: Quality): PropId | null {
  const hi = quality === 'high' || quality === 'ultra';
  switch (kind) {
    case 'lamp': return hi ? 'lamp-hi' : 'lamp-lo';
    case 'hydrant': return quality === 'low' ? null : 'hydrant';
    case 'bench': return quality === 'low' ? null : 'bench';
    case 'trash': return quality === 'low' ? null : 'trash';
    case 'planter': return hi ? 'planter-hi' : 'planter-lo';
    case 'tree': return quality === 'low' ? 'tree-sm' : 'tree-lg';
    case 'cone': return quality === 'low' ? null : 'cone';
    case 'dumpster': return 'dumpster';
    case 'stop': return 'stop';
    case 'street-sign': return 'street-sign';
    case 'warn': return 'warn';
    case 'signal': return 'signal';
    case 'pole': return 'pole';
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export type SpawnedPerson = {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  walk: THREE.AnimationAction;
  idle: THREE.AnimationAction;
};

export type StreetAssets = {
  spawnCar(kind: StreetKind, paint: number): THREE.Group;
  spawnProp(kind: PropKind, quality: Quality): THREE.Object3D | null;
  spawnHero(kind: HeroKind, scale?: number): THREE.Object3D | null;
  ensureHeroes(): Promise<void>;
  instanceProp(kind: PropKind, quality: Quality, count: number): THREE.InstancedMesh[];
  propScale(kind: PropKind, quality: Quality): { scale: number; lift: number } | null;
  spawnPerson(seed: number, quality: Quality): SpawnedPerson | null;
  materials(): THREE.Material[];
  ready: Promise<void>;
};

export function createStreetAssets(): StreetAssets {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const cars = new Map<StreetKind, Template>();
  const props = new Map<PropId, Template>();
  const heroes = new Map<HeroKind, Template>();
  let heroPromise: Promise<void> | null = null;
  const people: { id: string; template: Template; clips: THREE.AnimationClip[] }[] = [];
  const collected: THREE.Material[] = [];

  async function loadOne(file: string): Promise<Template> {
    const gltf = await loader.loadAsync(url(file));
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const { height, length, minY } = measure(scene);
    let meshCount = 0;
    scene.traverse((obj) => { if (obj instanceof THREE.Mesh) meshCount += 1; });
    return { scene, animations: gltf.animations ?? [], height, length, minY, meshCount };
  }

  const ready = (async () => {
    const carLoads = (Object.keys(CAR_FILES) as StreetKind[]).map(async (kind) => {
      cars.set(kind, await loadOne(CAR_FILES[kind]));
    });
    const propLoads = (Object.keys(PROP_FILES) as PropId[]).map(async (id) => {
      props.set(id, await loadOne(PROP_FILES[id]));
    });
    const clipSource = await loadOne(CLIP_SOURCE);
    const peopleLoads = PEOPLE.map(async (spec) => {
      const template = await loadOne(spec.file);
      const clips = clipSource.animations
        .filter((clip) => clip.name === 'Walk' || clip.name === 'Idle')
        .map((clip) => retargetClip(clip, spec.strip));
      people.push({ id: spec.id, template, clips });
    });
    await Promise.all([...carLoads, ...propLoads, ...peopleLoads]);
    people.sort((a, b) => a.id.localeCompare(b.id));
  })();

  function retargetClip(clip: THREE.AnimationClip, strip: string) {
    if (!strip) return clip;
    const tracks = clip.tracks.map((track) => {
      const dot = track.name.lastIndexOf('.');
      const copy = track.clone();
      const node = track.name.slice(0, dot);
      const prop = track.name.slice(dot + 1);
      const renamed = node.startsWith(strip) ? node.slice(strip.length) : node;
      copy.name = `${renamed}.${prop}`;
      return copy;
    });
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  function cloneTemplate(template: Template, shadows: boolean) {
    const clone = SkeletonUtils.clone(template.scene) as THREE.Group;
    prepare(clone, shadows);
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => collected.push(mat));
      }
    });
    return clone;
  }

  function templateFor(kind: PropKind, quality: Quality) {
    const id = resolveProp(kind, quality);
    if (!id) return null;
    const template = props.get(id);
    if (!template) return null;
    return { id, template };
  }

  return {
    ready,
    materials: () => collected,
    spawnCar(kind, paint) {
      const template = cars.get(kind) ?? cars.get('sedan');
      const group = new THREE.Group();
      if (!template) return group;
      const model = cloneTemplate(template, true);
      const scale = TARGET_CAR_LENGTH[kind] / Math.max(template.length, 0.01);
      model.scale.setScalar(scale);
      sitOnGround(model);
      model.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (!/^body$/i.test(obj.name)) return;
        const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (src instanceof THREE.MeshStandardMaterial || src instanceof THREE.MeshPhysicalMaterial) {
          const mat = new THREE.MeshPhysicalMaterial({
            map: src.map,
            normalMap: src.normalMap,
            roughnessMap: src.roughnessMap,
            color: paint,
            metalness: 0.62,
            roughness: 0.28,
            clearcoat: 0.9,
            clearcoatRoughness: 0.14,
            envMapIntensity: 1.85,
          });
          obj.material = mat;
          collected.push(mat);
        }
      });
      group.add(model);
      group.userData.wheels = [] as THREE.Object3D[];
      model.traverse((obj) => {
        if (/wheel/i.test(obj.name)) group.userData.wheels.push(obj);
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          if (/headlamp/i.test(obj.name)) mat.emissiveIntensity = 2.4;
          if (/taillight/i.test(obj.name)) mat.emissiveIntensity = 2.8;
        }
      });
      return group;
    },
    ensureHeroes() {
      if (!heroPromise) {
        heroPromise = Promise.all((Object.keys(HERO_FILES) as HeroKind[]).map(async (id) => {
          heroes.set(id, await loadOne(HERO_FILES[id]));
        })).then(() => undefined);
      }
      return heroPromise;
    },
    spawnHero(kind, scale = 1) {
      const template = heroes.get(kind);
      if (!template) return null;
      const model = cloneTemplate(template, true);
      model.scale.setScalar(scale);
      sitOnGround(model);
      model.userData.hero = kind;
      return model;
    },
    spawnProp(kind, quality) {
      const resolved = templateFor(kind, quality);
      if (!resolved) return null;
      const model = cloneTemplate(resolved.template, quality !== 'low');
      const target = TARGET_PROP_HEIGHT[resolved.id] ?? resolved.template.height;
      model.scale.setScalar(target / Math.max(resolved.template.height, 0.01));
      sitOnGround(model);
      model.userData.prop = resolved.id;
      return model;
    },
    instanceProp(kind, quality, count) {
      const resolved = templateFor(kind, quality);
      if (!resolved || count < 1) return [];
      const root = resolved.template.scene;
      root.updateMatrixWorld(true);
      // Kenney city-kit glTFs store POSITION as int16 and a node scale near 0.05–0.38.
      // Instancing the raw accessor made the east-sidewalk lamp a ~24 m lavender column.
      const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const geo = obj.geometry.clone();
        geo.applyMatrix4(obj.matrixWorld);
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        const list = groups.get(mat) ?? [];
        list.push(geo);
        groups.set(mat, list);
      });
      const meshes: THREE.InstancedMesh[] = [];
      for (const [mat, geos] of groups) {
        const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos);
        if (!geometry) continue;
        if (geos.length > 1) geos.forEach((geo) => geo.dispose());
        const inst = new THREE.InstancedMesh(geometry, mat, count);
        inst.castShadow = quality !== 'low';
        inst.receiveShadow = quality !== 'low';
        inst.frustumCulled = false;
        collected.push(mat);
        meshes.push(inst);
      }
      return meshes;
    },
    propScale(kind, quality) {
      const resolved = templateFor(kind, quality);
      if (!resolved) return null;
      const target = TARGET_PROP_HEIGHT[resolved.id] ?? resolved.template.height;
      const scale = target / Math.max(resolved.template.height, 0.01);
      return { scale, lift: -resolved.template.minY * scale };
    },
    spawnPerson(seed, quality) {
      if (!people.length) return null;
      const spec = people[seed % (quality === 'low' ? 1 : people.length)];
      const model = cloneTemplate(spec.template, quality !== 'low');
      const fitted = 1.72 / Math.max(spec.template.height, 0.01);
      model.scale.setScalar(fitted * (0.94 + (seed % 5) * 0.03));
      sitOnGround(model);
      const tint = new THREE.Color(SHIRTS[seed % SHIRTS.length]);
      model.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (!(src instanceof THREE.MeshStandardMaterial) && !(src instanceof THREE.MeshPhysicalMaterial)) return;
        if (/visor|eye|joint|skin|hair|teeth|cornea/i.test(src.name) || /visor|eye|hair/i.test(obj.name)) return;
        const mat = src.clone();
        if (seed % 2 === 0) mat.color.lerp(tint, 0.45);
        else mat.color.multiply(tint);
        obj.material = mat;
        collected.push(mat);
      });
      const group = new THREE.Group();
      group.add(model);
      const mixer = new THREE.AnimationMixer(model);
      const walkClip = THREE.AnimationClip.findByName(spec.clips, 'Walk') ?? spec.clips[0];
      const idleClip = THREE.AnimationClip.findByName(spec.clips, 'Idle') ?? walkClip;
      const walk = mixer.clipAction(walkClip);
      const idle = mixer.clipAction(idleClip);
      walk.enabled = true;
      idle.enabled = true;
      walk.play();
      idle.play();
      idle.setEffectiveWeight(0);
      return { group, mixer, walk, idle };
    },
  };
}

export function kindFromIndex(index: number): StreetKind {
  const kinds: StreetKind[] = ['sedan', 'suv', 'hatch', 'van', 'pickup', 'taxi', 'sedan-sports', 'suv-luxury', 'police'];
  return kinds[index % kinds.length];
}
