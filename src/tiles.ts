import * as THREE from 'three';
import { TilesRenderer, WGS84_ELLIPSOID } from '3d-tiles-renderer/three';
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { ORIGIN } from './geo';

const ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

export type AustinTiles = {
  group: THREE.Group;
  active: boolean;
  /** True after models load and a ground sample near Congress succeeds. */
  ready: boolean;
  error: string | null;
  attributions: string[];
  update(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void;
  groundY(x: number, z: number, fallback?: number): number;
  setEnabled(on: boolean): void;
  dispose(): void;
};

/** Read the Vite-injected Map Tiles key. Empty when unset. */
export function googleMapsApiKey(): string {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
}

/**
 * ECEF → local scene frame matching `project()` in geo.ts:
 * X east, Y up, Z south (−north).
 */
export function ecefToSceneMatrix(lonDeg: number, latDeg: number, height = 0): THREE.Matrix4 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const enuToEcef = new THREE.Matrix4();
  WGS84_ELLIPSOID.getEastNorthUpFrame(lat, lon, height, enuToEcef);
  const ecefToEnu = enuToEcef.clone().invert();
  const enuToScene = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, -1, 0, 0,
    0, 0, 0, 1,
  );
  return enuToScene.multiply(ecefToEnu);
}

/**
 * Photorealistic Google 3D Tiles for downtown Austin, placed in the local scene.
 * Returns null when no API key is configured.
 */
export async function createAustinTiles(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  opts: { onStatus?: (text: string) => void; onAttribution?: (lines: string[]) => void } = {},
): Promise<AustinTiles | null> {
  const apiToken = googleMapsApiKey();
  if (!apiToken) return null;

  opts.onStatus?.('Loading Austin 3D map');
  const wrapper = new THREE.Group();
  wrapper.name = 'google-3d-tiles';
  scene.add(wrapper);

  const tiles = new TilesRenderer(ROOT_URL);
  tiles.errorTarget = 12;
  tiles.registerPlugin(new GoogleCloudAuthPlugin({
    apiToken,
    autoRefreshToken: true,
    useRecommendedSettings: true,
  }));

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));

  // ReorientationPlugin centers lat/lon at the origin with Y-up.
  // Its local frame is X-west / Z-north; yaw π matches geo.project (X-east / Z-south).
  tiles.registerPlugin(new ReorientationPlugin({
    lat: THREE.MathUtils.degToRad(ORIGIN[1]),
    lon: THREE.MathUtils.degToRad(ORIGIN[0]),
    height: 0,
    recenter: true,
    azimuth: Math.PI,
  }));

  wrapper.add(tiles.group);

  let error: string | null = null;
  let enabled = true;
  let ready = false;
  let modelCount = 0;
  let attributions: string[] = ['Imagery © Google'];

  tiles.addEventListener('load-error', (event) => {
    const detail = (event as { error?: unknown }).error;
    error = detail instanceof Error ? detail.message : 'Map Tiles failed to load';
    console.warn('[tiles]', error, detail);
  });
  tiles.addEventListener('load-model', () => {
    modelCount += 1;
    opts.onStatus?.('Streaming Congress Avenue');
  });

  const down = new THREE.Vector3(0, -1, 0);
  const castOrigin = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;

  function collectAttribution() {
    const credits = new Set<string>(['Imagery © Google']);
    try {
      for (const item of tiles.getAttributions()) {
        if (item?.value) credits.add(String(item.value));
      }
    } catch { /* noop */ }
    attributions = [...credits];
    opts.onAttribution?.(attributions);
  }

  function sampleGround(x: number, z: number): number | null {
    castOrigin.set(x, 400, z);
    raycaster.set(castOrigin, down);
    const hits = raycaster.intersectObject(tiles.group, true);
    if (!hits.length) return null;
    const y = hits[0].point.y;
    if (y < -80 || y > 120) return null;
    return y;
  }

  // Tile content only downloads while update() runs with a camera.
  const bootCam = camera.clone();
  bootCam.position.set(70, 40, -20);
  bootCam.lookAt(70, 0, -20);
  await new Promise<void>((resolve) => {
    const started = performance.now();
    const tick = () => {
      tiles.setCamera(bootCam);
      tiles.setResolutionFromRenderer(bootCam, renderer);
      tiles.update();
      collectAttribution();
      if (modelCount > 0 && performance.now() - started > 1200) {
        resolve();
        return;
      }
      if (performance.now() - started > 9000) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tiles.addEventListener('load-root-tileset', () => opts.onStatus?.('Streaming Congress Avenue'));
    requestAnimationFrame(tick);
  });

  return {
    group: wrapper,
    get active() { return enabled && !error; },
    get ready() { return ready && enabled && !error; },
    get error() { return error; },
    get attributions() { return attributions; },
    update(camera, renderer) {
      if (!enabled) return;
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, renderer);
      tiles.update();
      collectAttribution();
      if (!ready && modelCount > 0) {
        // Probe near the Congress hubs used by the ride.
        const samples = [
          sampleGround(80, -40),
          sampleGround(60, 20),
          sampleGround(0, 0),
        ];
        if (samples.some((y) => y != null)) ready = true;
      }
    },
    groundY(x, z, fallback = 0.16) {
      if (!enabled || error) return fallback;
      return sampleGround(x, z) ?? fallback;
    },
    setEnabled(on) {
      enabled = on;
      wrapper.visible = on;
    },
    dispose() {
      enabled = false;
      try { tiles.dispose(); } catch { /* noop */ }
      draco.dispose();
      scene.remove(wrapper);
    },
  };
}
