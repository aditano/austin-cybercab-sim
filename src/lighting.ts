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
  sky: THREE.Object3D,
): Lighting {
  const hooked = new Set<THREE.Material>();
  const originals = new WeakMap<THREE.Material, THREE.Material['onBeforeCompile']>();
  let csm: CSM | null = null;
  let ssr: SSRPass | null = null;
  let probe: THREE.CubeCamera | null = null;
  let probeTarget: THREE.WebGLCubeRenderTarget | null = null;
  let probeTick = 0;
  let selects: THREE.Mesh[] = [];
  let pmremGenerator: THREE.PMREMGenerator | null = null;
  let pmremTarget: THREE.WebGLRenderTarget | null = null;
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

  function paintMeshes(meshes: THREE.Mesh[]): THREE.Mesh[] {
    return meshes.filter((mesh) => {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return mats.some((mat) => mat instanceof THREE.MeshStandardMaterial && !mat.transparent && mat.metalness >= 0.5 && mat.roughness <= 0.45);
    });
  }

  function ensureProbe(size: number) {
    if (probeTarget && probeTarget.width === size) return;
    probeTarget?.dispose();
    probeTarget = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.LinearSRGBColorSpace,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    probe = new THREE.CubeCamera(1.6, 480, probeTarget);
  }

  function applyEnv(map: THREE.Texture | null) {
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
      // SSR copies its list at creation. The cab is mounted after the first apply,
      // so a forced Ultra preset would otherwise reflect an empty selection.
      if (ssr) ssr.selects = paintMeshes(selects);
    },
    apply(graphics, quality, software) {
      const useCsm = graphics.shadows && graphics.cascades > 0 && !software;
      sun.castShadow = graphics.shadows && !useCsm;
      sun.intensity = useCsm ? 0 : 3.05;
      if (graphics.shadows && graphics.shadowSize > 0) sun.shadow.mapSize.set(graphics.shadowSize, graphics.shadowSize);
      sun.shadow.radius = quality === 'ultra' ? 2.5 : quality === 'high' ? 2 : 1.5;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = quality === 'ultra' ? 0.02 : 0.028;
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
            shadowBias: -0.00025,
          });
          csm.fade = true;
          for (const light of csm.lights) {
            light.color.set('#f4f2ec');
            // A large normal bias lifts the shadow off the tires (peter-panning).
            // Keep it small and let a modest map bias hide acne on the hood.
            light.shadow.normalBias = quality === 'ultra' ? 0.008 : 0.012;
            light.shadow.bias = -0.00022;
            light.shadow.radius = quality === 'ultra' ? 2 : 1.5;
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
        pmremTarget?.dispose();
        pmremTarget = null;
      }

      const wantSsr = graphics.reflections === 'ssr' && !software && quality === 'ultra';
      if (wantSsr && !ssr) {
        ssr = new SSRPass({
          renderer, scene, camera, width: innerWidth, height: innerHeight,
          selects: paintMeshes(selects),
          groundReflector: null,
        });
        // 0.12 m only caught surfaces touching the paint, which read as speckles.
        ssr.thickness = 0.22;
        ssr.maxDistance = 14;
        ssr.opacity = 0.38;
        ssr.blur = true;
        composer.insertPass(ssr, 1);
      }
      if (ssr) {
        ssr.enabled = wantSsr;
        ssr.selects = paintMeshes(selects);
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
        if (probeTick === 1 || probeTick % 24 === 0) {
          probe.position.copy(target);
          probe.position.y += 3.8;
          const cabRoot = scene.getObjectByName('Cybercab');
          const cabWas = cabRoot?.visible ?? true;
          const skyScale = sky.scale.x;
          if (cabRoot) cabRoot.visible = false;
          // The sky dome is tens of kilometres across. Scale it inside the cube far plane
          // so the reflection is the sky, not a flat fill with a hard horizon seam.
          sky.scale.setScalar(320);
          try {
            probe.update(renderer, scene);
            // A half-float cube map comes back invalid on SwiftShader and the bloom
            // pass then clears the frame. Capture 8-bit and bake the PMREM here,
            // before the beauty pass, so the conversion does not steal the framebuffer.
            pmremGenerator ??= new THREE.PMREMGenerator(renderer);
            pmremTarget = pmremGenerator.fromCubemap(probeTarget.texture as THREE.CubeTexture, pmremTarget);
            applyEnv(pmremTarget.texture);
          } finally {
            sky.scale.setScalar(skyScale);
            if (cabRoot) cabRoot.visible = cabWas;
            renderer.setRenderTarget(null);
            const canvas = renderer.domElement;
            renderer.setViewport(0, 0, canvas.width, canvas.height);
            renderer.setScissor(0, 0, canvas.width, canvas.height);
            renderer.setScissorTest(false);
          }
        }
      }
    },
  };
}
