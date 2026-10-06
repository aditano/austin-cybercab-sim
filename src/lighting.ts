import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { GraphicsToggles, Quality } from './logic';

type Lighting = {
  apply(graphics: GraphicsToggles, quality: Quality, software: boolean): void;
  update(target: THREE.Vector3): void;
  hookObject(root: THREE.Object3D): void;
  setSelects(objects: THREE.Object3D[]): void;
  ssr: SSRPass | null;
};

export function createLighting(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sun: THREE.DirectionalLight,
  composer: EffectComposer,
  sunOffset: THREE.Vector3,
): Lighting {
  const hooked = new Set<THREE.Material>();
  const originals = new WeakMap<THREE.Material, THREE.Material['onBeforeCompile']>();
  let csm: CSM | null = null;
  let ssr: SSRPass | null = null;
  let probe: THREE.CubeCamera | null = null;
  let probeTarget: THREE.WebGLCubeRenderTarget | null = null;
  let probeTick = 0;
  let selects: THREE.Mesh[] = [];
  const lightDir = new THREE.Vector3();

  function remember(material: THREE.Material) {
    if (!originals.has(material)) originals.set(material, material.onBeforeCompile);
  }

  function hookMaterial(material: THREE.Material) {
    remember(material);
    if (!csm) return;
    if (hooked.has(material)) return;
    const worldCompile = originals.get(material);
    csm.setupMaterial(material);
    const csmCompile = material.onBeforeCompile;
    material.onBeforeCompile = function compile(shader, rendererArg) {
      worldCompile?.call(this, shader, rendererArg);
      csmCompile?.call(this, shader, rendererArg);
    };
    const prevKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `${prevKey()}|csm${csm?.cascades ?? 0}`;
    material.needsUpdate = true;
    hooked.add(material);
  }

  function hookObject(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => hookMaterial(mat));
    });
  }

  function clearCsm() {
    if (!csm) return;
    for (const material of hooked) {
      const worldCompile = originals.get(material);
      const defs = (material as THREE.Material & { defines?: Record<string, unknown> }).defines;
      if (defs) {
        delete defs.USE_CSM;
        delete defs.CSM_CASCADES;
        delete defs.CSM_FADE;
      }
      material.onBeforeCompile = worldCompile ?? material.onBeforeCompile;
      material.needsUpdate = true;
    }
    hooked.clear();
    csm.remove();
    csm.dispose();
    csm = null;
  }

  function ensureProbe(size: number) {
    if (probeTarget && probeTarget.width === size) return;
    probeTarget?.dispose();
    probeTarget = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    probe = new THREE.CubeCamera(0.8, 420, probeTarget);
  }

  function applyEnv(map: THREE.CubeTexture | null) {
    for (const obj of selects) {
      obj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.envMap === map) continue;
            mat.envMap = map;
            mat.needsUpdate = true;
          }
        }
      });
    }
  }

  return {
    get ssr() { return ssr; },
    hookObject,
    setSelects(objects) {
      const meshes: THREE.Mesh[] = [];
      for (const obj of objects) {
        obj.traverse((child) => { if (child instanceof THREE.Mesh) meshes.push(child); });
      }
      selects = meshes;
    },
    apply(graphics, quality, software) {
      const useCsm = graphics.shadows && graphics.cascades > 0 && !software;
      sun.castShadow = graphics.shadows && !useCsm;
      sun.intensity = useCsm ? 0 : 3.05;
      if (graphics.shadows && graphics.shadowSize > 0) sun.shadow.mapSize.set(graphics.shadowSize, graphics.shadowSize);
      sun.shadow.radius = quality === 'ultra' ? 8 : quality === 'high' ? 4 : 2.5;
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }

      if (useCsm) {
        if (!csm || csm.cascades !== graphics.cascades || csm.shadowMapSize !== graphics.shadowSize) {
          clearCsm();
          csm = new CSM({
            camera,
            parent: scene,
            cascades: graphics.cascades,
            maxFar: quality === 'ultra' ? 220 : quality === 'high' ? 160 : 110,
            mode: 'practical',
            shadowMapSize: graphics.shadowSize,
            lightIntensity: 3.05,
            lightDirection: sunOffset.clone().normalize().negate(),
            shadowBias: -0.00012,
          });
          csm.fade = true;
          for (const light of csm.lights) {
            light.color.set('#ffb56a');
            light.shadow.normalBias = 0.04;
            light.shadow.radius = sun.shadow.radius;
          }
        }
        hookObject(scene);
      } else {
        clearCsm();
      }

      const wantProbe = graphics.reflections === 'probe' || graphics.reflections === 'ssr';
      if (wantProbe && !software) ensureProbe(quality === 'ultra' ? 128 : 64);
      else {
        applyEnv(null);
        probe = null;
        probeTarget?.dispose();
        probeTarget = null;
      }

      const wantSsr = graphics.reflections === 'ssr' && !software && quality === 'ultra';
      if (wantSsr && !ssr) {
        ssr = new SSRPass({
          renderer, scene, camera, width: innerWidth, height: innerHeight,
          selects: selects.length ? selects : null,
          groundReflector: null,
        });
        ssr.thickness = 0.018;
        ssr.maxDistance = 0.12;
        ssr.opacity = 0.55;
        composer.insertPass(ssr, 1);
      }
      if (ssr) {
        ssr.enabled = wantSsr;
        ssr.selects = selects.length ? selects : null;
      }
    },
    update(target) {
      lightDir.copy(sunOffset).normalize().negate();
      if (csm) {
        csm.lightDirection.copy(lightDir);
        csm.update();
      }
      if (probe && probeTarget) {
        probeTick += 1;
        if (probeTick % 12 === 0) {
          probe.position.copy(target);
          probe.position.y += 1.4;
          const previous = scene.background;
          scene.background = new THREE.Color('#e4c3a2');
          probe.update(renderer, scene);
          scene.background = previous;
          applyEnv(probeTarget.texture);
        }
      }
    },
  };
}
