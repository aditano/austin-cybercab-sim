import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createWorld, loadMapData } from './world';
import { loadCybercab, type Cybercab } from './vehicle';
import { createCityLife } from './life';
import { createStreetAssets } from './assets';
import { createLighting } from './lighting';
import {
  APPROACH_RUNWAY, AUSTIN_ROBOTAXI_GEOFENCE, CAPITOL, CONGRESS_ROUTE, CURB_PULL, DROPOFF, GEOFENCE_NOTE, MEGALAMP,
  PICKUP, ROAD_Y, STOP_INSET, VEHICLE_LABEL, VEHICLE_PLATE, measurePath, pointInRing, project, samplePath,
} from './geo';
import {
  CABIN_EYE, CABIN_LOOK, DESTINATIONS, GRAPHICS_KEY, QUALITY_LABEL, adaptQuality, arrivalCopy, blockedSpeed, doorTarget, keepDoorRequest, roadLevel, showContactDisc,
  emptyAdaptState, forcedQuality, graphicsFor, parseGraphicsStore, parseSnapshot, pixelRatioFor, resolvedQuality,
  stepDoor, togglePhone, type GraphicsToggles, type Quality, type QualityMode, type RideSnapshot,
} from './logic';
import './style.css';

type Phase = 'explore' | 'dispatch' | 'pickup' | 'boarded' | 'ride' | 'arrived' | 'exited' | 'complete';
type Cam = 'walk' | 'chase' | 'cabin';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="scene"></canvas><div class="vignette"></div>
<header><a class="brand" href="./"><span class="brand-icon">C</span> CYBERCAB <span class="brand-sub">AUSTIN EXPERIENCE</span></a><div class="live"><i></i> AUSTIN, TX <span>SERVICE AREA · ~288 MI²</span></div><button id="settings" class="round" aria-label="Open graphics settings" aria-expanded="false">◈</button></header>
<div id="gfx-menu" class="gfx-menu" hidden>
  <p class="gfx-kicker">Graphics</p>
  <div class="gfx-modes">${['auto', 'low', 'medium', 'high', 'ultra'].map((mode) => `<button type="button" data-mode="${mode}">${mode === 'auto' ? 'Auto' : mode[0].toUpperCase() + mode.slice(1)}</button>`).join('')}</div>
  <p class="gfx-current" id="gfx-current"></p>
  <label class="gfx-toggle"><input type="checkbox" data-toggle="shadows"> Shadows</label>
  <label class="gfx-toggle"><input type="checkbox" data-toggle="aa"> Anti-aliasing</label>
  <label class="gfx-toggle"><input type="checkbox" data-toggle="post"> Post-process</label>
  <p class="gfx-note">Auto picks a preset from this device, then eases up or down from measured frame time. Low uses lighter street models.</p>
</div>
<aside class="chapter"><span class="eyebrow">CONGRESS AVENUE · AUSTIN</span><h1>Golden hour<br>on Congress.</h1><p>The Capitol closes the avenue.<br>Lady Bird Lake is behind you.<br>Match the Megalamp, then ride.</p><div class="chapter-line"></div><span class="small-label">01 / CONFIRM YOUR RIDE</span></aside>
<div class="location"><span class="location-dot">⌖</span><div><b id="location-name">Congress & 2nd</b><span id="location-detail">DOWNTOWN · CAPITOL NORTH · LAKE SOUTH</span></div></div>
<div class="hud"><div class="speedo"><b id="speed">00</b><small>MPH</small><span id="gear">P</span></div></div>
<aside id="phone" class="phone"><div id="phone-map" class="phone-map"></div><div class="phone-top"><b class="js-clock">6:42</b><div class="island"></div><span>5G</span></div><div class="sheet"><div class="sheet-handle"></div><div class="app-bar"><span class="avatar" aria-hidden="true"></span><b>ROBOTAXI</b><button id="alerts" type="button" class="bell" aria-label="Alerts"></button></div><div id="phone-body"></div><div id="phone-actions"></div></div><div class="home-bar"></div></aside>
<section id="cabin" class="cabin-panel" hidden></section>
<div id="toast" role="status"></div>
<footer><div class="controls"><span><kbd>DRAG</kbd> Look</span><span><kbd>W A S D</kbd> Walk</span><span><kbd>C</kbd> Camera</span><span><kbd>P</kbd> Phone</span><span><kbd>F</kbd> Fullscreen</span></div><div class="concept">INDEPENDENT CONCEPT SIMULATION <span>·</span> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a><a href="./docs.html" target="_blank">Sources & accuracy ↗</a></div></footer>
<div class="ride-progress"><div id="progress-fill"></div></div>
<div id="stick" hidden aria-label="Walk joystick"><div id="nub"></div></div>
<button id="show-phone" type="button" hidden>Phone</button>
<div id="phase-status" class="sr-only" aria-live="polite"></div>`;

const coarsePointer = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (coarsePointer) document.body.dataset.pointer = 'coarse';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: ios ? 'default' : 'high-performance',
  // The paused harness reads the canvas after a still frame. Live playback leaves the buffer disposable.
  preserveDrawingBuffer: window.__cybercabPause === true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#efe0c8');
scene.fog = new THREE.FogExp2('#e4d2b8', 0.00135);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.15, 3200);

const sky = new Sky();
sky.scale.setScalar(45000);
const su = sky.material.uniforms;
su.turbidity.value = 4.6;
su.rayleigh.value = 2.1;
su.mieCoefficient.value = 0.008;
su.mieDirectionalG.value = 0.82;
const sunPosition = new THREE.Vector3(-0.62, 0.22, 0.48);
const sunOffset = sunPosition.clone().normalize().multiplyScalar(280);
su.sunPosition.value.copy(sunPosition);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const skyEnv = pmrem.fromScene(sky as unknown as THREE.Scene, 0.03).texture;
scene.environment = skyEnv;
scene.environmentIntensity = 0.95;

scene.add(new THREE.HemisphereLight('#ffe4c4', '#6a5848', 0.42));
const sun = new THREE.DirectionalLight('#ffd2a2', 2.55);
sun.position.copy(sunOffset);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -46;
sun.shadow.camera.right = 46;
sun.shadow.camera.top = 46;
sun.shadow.camera.bottom = -46;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.045;
sun.shadow.radius = 2.5;
scene.add(sun);
scene.add(sun.target);

const world = createWorld(scene, (text) => setBoot(text, text.startsWith('Building') ? 55 : 35));
let cab!: Cybercab;
let cabMounted = false;

const laneOffset = new THREE.Vector3(4.7, 0, 1.5);
const centerline = CONGRESS_ROUTE.map(([lon, lat]) => project(lon, lat).add(laneOffset));
const backDir = centerline[0].clone().sub(centerline[1]).normalize();
centerline.unshift(centerline[0].clone().addScaledVector(backDir, APPROACH_RUNWAY));
let route = centerline.map((p) => p.clone().setY(ROAD_Y));
let { cumulative, length: routeLength } = measurePath(route);
const sample = (d: number) => samplePath(route, cumulative, d);
function curbShift(d: number, meters = CURB_PULL) {
  const p = sample(d);
  return new THREE.Vector3(Math.cos(p.heading), 0, -Math.sin(p.heading)).multiplyScalar(meters);
}
const pickupDist = APPROACH_RUNWAY + STOP_INSET;
const dropoffDist = Math.max(pickupDist + 40, routeLength - STOP_INSET);
const stageDist = Math.max(8, pickupDist - 86);

const pickupPad = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 3.3, 48),
  new THREE.MeshStandardMaterial({ color: 0xe6c25a, emissive: 0xc9a24a, emissiveIntensity: 0.35, roughness: 0.55, side: THREE.DoubleSide }),
);
pickupPad.rotation.x = -Math.PI / 2;
pickupPad.position.copy(sample(pickupDist).position).add(curbShift(pickupDist, CURB_PULL)).setY(ROAD_Y + 0.025);
scene.add(pickupPad);
const padGlow = new THREE.Mesh(
  new THREE.CircleGeometry(2.3, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd56a, transparent: true, opacity: 0.12 }),
);
padGlow.rotation.x = -Math.PI / 2;
padGlow.position.copy(pickupPad.position);
scene.add(padGlow);

const life = createCityLife(scene, route, cumulative, routeLength);

async function restyleWorld() {
  const parked = world.dress(assets, quality);
  life.populate(assets, quality);
  lighting.hookObject(scene);
  const picks = [...life.objects(), ...parked];
  if (cabMounted) picks.unshift(cab.group);
  lighting.setSelects(picks);
}

const gl = renderer.getContext();
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') : '';
const softwareGl = /swiftshader|llvmpipe|softpipe|microsoft basic render/i.test(gpu);
const forcedPreset = forcedQuality(window.location.search);
const lockSoftware = softwareGl && !forcedPreset;
if (lockSoftware) {
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(1);
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssaoPass = lockSoftware ? null : new SSAOPass(scene, camera, innerWidth, innerHeight, 8);
if (ssaoPass) {
  ssaoPass.kernelRadius = 0.85;
  ssaoPass.minDistance = 0.00001;
  ssaoPass.maxDistance = 0.0005;
  composer.addPass(ssaoPass);
}
if (ssaoPass) ssaoPass.enabled = false;
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), lockSoftware ? 0.04 : 0.08, 0.32, 0.96);
composer.addPass(bloomPass);
const smaaPass = new SMAAPass();
smaaPass.enabled = !lockSoftware;
composer.addPass(smaaPass);
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: `uniform sampler2D tDiffuse;varying vec2 vUv;
    void main(){
      vec3 c=texture2D(tDiffuse,vUv).rgb;
      float l=dot(c,vec3(0.2126,0.7152,0.0722));
      c=mix(vec3(l),c,1.12);
      c.r+=0.012*(c.r-0.4);
      c.b+=0.012*(0.5-l);
      c=pow(max(c,0.0),vec3(0.98));
      gl_FragColor=vec4(c,1.0);
    }`,
});
gradePass.enabled = false;
composer.addPass(gradePass);
const bokehPass = new BokehPass(scene, camera, { focus: 8, aperture: 0.00015, maxblur: 0.006 });
bokehPass.enabled = false;
composer.addPass(bokehPass);
composer.addPass(new OutputPass());

const lighting = createLighting(renderer, scene, camera, sun, composer, sunOffset, sky);
const assets = createStreetAssets();

let phase: Phase = 'explore';
let belted = false;
let elapsed = 0;
let distance = stageDist;
let door = 0;
let temperature = 21;
let muted = false;
let phoneVisible = true;
let paused = false;
let speedMps = 0;
let cam: Cam = 'walk';
let mapOverview = true;
let doorRequested = false;
let clockMinutes = 18 * 60 + 42;
let clockShown = '6:42';
function clockLabel() {
  const wrapped = ((Math.floor(clockMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')}`;
}
let hold = 0;
let curbState = 0;
let appliedCurb = 0;
let prevAppliedCurb = 0;
let destinationId = 'congress';
const storedGraphics = (() => {
  try { return parseGraphicsStore(localStorage.getItem(GRAPHICS_KEY)); } catch { return null; }
})();
const hardware = {
  software: softwareGl,
  coarse: coarsePointer,
  gpu,
  deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  cores: navigator.hardwareConcurrency,
  width: innerWidth,
  height: innerHeight,
  dpr: devicePixelRatio,
};
let qualityMode: QualityMode = forcedPreset ?? storedGraphics?.mode ?? 'auto';
let graphicsOverrides: Partial<GraphicsToggles> | undefined = storedGraphics?.overrides;
let quality: Quality = forcedPreset ?? (lockSoftware ? 'low' : resolvedQuality(qualityMode, hardware));
let graphics = graphicsFor(quality, graphicsOverrides);
let adaptState = emptyAdaptState();
let stickX = 0;
let stickY = 0;
const RIDE_KEY = 'cybercab-ride';
const pickup = sample(pickupDist);

let walk = pickup.position.clone().add(curbShift(pickupDist, 1.8));
walk.y = ROAD_Y + 1.62;
const capitolAim = project(CAPITOL.lon, CAPITOL.lat).sub(walk);
let lookYaw = Math.atan2(-capitolAim.x, -capitolAim.z);
let lookPitch = -0.11;
let orbitYaw = 0.58;
let orbitPitch = 0.12;
let last = performance.now();
const keys = new Set<string>();
const phone = document.querySelector<HTMLElement>('#phone')!;
const body = document.querySelector<HTMLElement>('#phone-body')!;
const phoneActions = document.querySelector<HTMLElement>('#phone-actions')!;
const phoneMap = document.querySelector<HTMLElement>('#phone-map')!;
const cabin = document.querySelector<HTMLElement>('#cabin')!;
let mapFeatures = '';
function mapPoint(v: THREE.Vector3, overview = false) {
  if (overview) return [140 + v.x * 0.0078, 122 + v.z * 0.0078];
  return [140 + (v.x - 165) * 0.29, 122 + (v.z + 300) * 0.29];
}

let uiReady = false;
void loadMapData().then(data => {
  const path = (coords: number[][]) => coords.map(([lon, lat], i) => {
    const [x, y] = mapPoint(project(lon, lat));
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  mapFeatures = data.buildings.map((b: { coordinates: number[][] }) => `<path d="${path(b.coordinates)}Z" fill="#2a3036"/>`).join('')
    + data.roads.map((r: { coordinates: number[][] }) => `<path d="${path(r.coordinates)}" fill="none" stroke="#4c5662" stroke-width="3.2"/>`).join('');
  if (uiReady) renderUI();
}).catch(() => toast('Map unavailable. Showing the bundled route.'));

function geofencePath() {
  return AUSTIN_ROBOTAXI_GEOFENCE.map(([lon, lat], i) => {
    const [x, y] = mapPoint(project(lon, lat), true);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + 'Z';
}

function mapIsOverview() {
  return phase !== 'explore' && mapOverview;
}

function mapMarkup(progress = 0) {
  const overview = mapIsOverview();
  const line = route.map((v, i) => {
    const [x, y] = mapPoint(v, overview);
    return `${i ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
  const along = pickupDist + progress * (dropoffDist - pickupDist);
  const [px, py] = mapPoint(sample(along).position, overview);
  const [sx, sy] = mapPoint(sample(pickupDist).position, overview);
  const [ex, ey] = mapPoint(sample(dropoffDist).position, overview);
  const showRoute = phase !== 'explore';
  return `<div class="map"><svg viewBox="0 0 280 245"><rect width="280" height="245" fill="#1a1d21"/>
    <path d="${geofencePath()}" fill="none" stroke="#3d4a46" stroke-width="${overview ? 1.2 : 0}" stroke-dasharray="3 3"/>
    ${overview ? '' : mapFeatures}<path d="${line}" stroke="${showRoute ? '#2ee6d6' : '#2ee6d600'}" stroke-width="${overview ? 2 : 4.5}" fill="none" stroke-linecap="round"/>
    <circle cx="${sx}" cy="${sy}" r="7" fill="#121416" stroke="#f4f4f4" stroke-width="3"/>
    <circle cx="${sx}" cy="${sy}" r="2.2" fill="#2ee6d6"/>
    <rect x="${(ex - 5).toFixed(1)}" y="${(ey - 5).toFixed(1)}" width="10" height="10" fill="#f4f4f4"/>
    <circle data-cab="1" cx="${px}" cy="${py}" r="6.5" fill="#121416" stroke="#f4f4f4" stroke-width="3"/>
    <circle data-cab-core="1" cx="${px}" cy="${py}" r="2" fill="#2ee6d6"/></svg>
    <button class="map-expand" type="button" aria-label="Toggle map zoom">${overview ? '⊕' : '⌖'}</button></div>`;
}

function setBoot(text: string, pct: number) {
  const status = document.querySelector('#boot-status');
  const fill = document.querySelector<HTMLElement>('#boot-fill');
  if (status) status.textContent = text;
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function hideBoot() {
  document.getElementById('boot')?.remove();
}

function readRide(): string | null {
  try { return sessionStorage.getItem(RIDE_KEY); } catch { return null; }
}

function saveRide() {
  try {
    if (phase === 'explore' || phase === 'complete') {
      sessionStorage.removeItem(RIDE_KEY);
      return;
    }
    const snap: RideSnapshot = {
      v: 1, phase, distance, belted, paused, temperature, muted, destinationId, phoneVisible,
    };
    sessionStorage.setItem(RIDE_KEY, JSON.stringify(snap));
  } catch { /* private mode */ }
}

function showGpuFailure(message: string) {
  let panel = document.getElementById('gpu-failure');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'gpu-failure';
    panel.innerHTML = '<p></p><button type="button">Reload</button>';
    panel.querySelector('button')?.addEventListener('click', () => location.reload());
    document.body.appendChild(panel);
  }
  const copy = panel.querySelector('p');
  if (copy) copy.textContent = message;
}

function setPhase(next: Phase) {
  const prev = phase;
  doorRequested = keepDoorRequest(next, doorRequested);
  if (next === 'ride' && prev === 'boarded') curbState = CURB_PULL;
  phase = next;
  elapsed = 0;
  if (next === 'arrived' || next === 'exited' || next === 'complete') phoneVisible = true;
  const status = document.querySelector('#phase-status');
  if (status) status.textContent = next;
  saveRide();
  renderUI();
}
function toast(text: string) {
  const el = document.querySelector('#toast')!;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function lampForPhase() {
  cab.setPhase(phase);
}

function renderUI() {
  lampForPhase();
  document.querySelector('#location-name')!.textContent = phase === 'complete' || phase === 'arrived' || phase === 'exited' ? DROPOFF.name : PICKUP.name;
  document.querySelector('#location-detail')!.textContent = phase === 'explore'
    ? 'DOWNTOWN · CAPITOL NORTH · LAKE SOUTH'
    : phase === 'dispatch' || phase === 'pickup' ? 'MATCH MEGALAMP AND PLATE'
    : 'CONGRESS AVENUE · SIMULATED RIDE';
  const chapter = document.querySelector<HTMLElement>('.chapter')!;
  chapter.style.display = phase === 'explore' ? 'block' : 'none';
  phone.hidden = !phoneVisible || phase === 'ride';
  phone.classList.toggle('matching', phase === 'dispatch');
  phone.classList.toggle('enter-glow', phase === 'pickup');
  phone.style.setProperty('--lamp', MEGALAMP.hex);
  cabin.hidden = phase !== 'ride' && phase !== 'boarded' && phase !== 'arrived';
  cabin.classList.toggle('riding', phase === 'ride');
  const map = mapMarkup((distance - pickupDist) / Math.max(1, dropoffDist - pickupDist));
  phoneMap.innerHTML = map;
  const dest = DESTINATIONS.find((item) => item.id === destinationId) ?? DESTINATIONS[0];
  const destInside = pointInRing(dest.lon, dest.lat, AUSTIN_ROBOTAXI_GEOFENCE);
  const inside = pointInRing(PICKUP.lon, PICKUP.lat, AUSTIN_ROBOTAXI_GEOFENCE) && destInside;
  const canStart = belted && door < 0.08;
  const walkBtn = '<button class="text-btn" id="walk-around" type="button">Walk the block</button>';
  let actions = '';
  const options = DESTINATIONS.map((item) => `<option value="${item.id}"${item.id === dest.id ? ' selected' : ''}>${item.name}</option>`).join('');
  const where = `<label class="where" for="destination"><span class="mag" aria-hidden="true"></span><span class="where-copy"><b>Where to?</b><select id="destination" aria-label="Destination">${options}</select></span></label>`;
  const places = `<div class="chips"><span class="chip-pill">Home</span><span class="chip-pill">Work</span><span class="chip-pill">${dest.name.split(',')[0]}</span></div>
    <button class="place-row" type="button"><i class="pin"></i><span><b>Congress Ave</b><small>Austin</small></span></button>
    <button class="place-row" type="button"><i class="pin"></i><span><b>The Capitol</b><small>Downtown</small></span></button>`;
  if (phase === 'explore') body.innerHTML = `<h2 class="sr-only">Where to?</h2>
    ${where}
    ${places}
    <div class="route-card"><div class="route-row"><i class="dot"></i><div><small>PICKUP</small><b>${PICKUP.name}</b></div><span class="chip in">In area</span></div>
    <div class="route-row"><i class="square"></i><div><small>DROP OFF</small><b>${dest.name}</b></div><span class="chip ${destInside ? 'in' : 'out'}">${destInside ? 'In area' : 'Outside'}</span></div></div>
    <div class="ride-options" role="group" aria-label="Vehicle">
      <button type="button" class="option on" id="opt-cab"><b>Cybercab</b><small>2 seats</small><span id="dispatch-eta">~3 min</span></button>
      <button type="button" class="option" id="opt-y"><b>Model Y</b><small>4 seats</small><span>Later</span></button>
    </div>
    <div class="fare"><span><b class="fare-name">Cybercab</b> <small>Simulated fare</small></span><b>$4.20</b></div>
    <p class="geo-note">${destInside ? GEOFENCE_NOTE : 'That place is outside the approximated service area, so Confirm stays off.'}</p>
    <p class="micro">Independent concept. No real booking, fare, or Tesla connection.</p>`;
  if (phase === 'explore') actions = `<button class="primary" id="request" ${inside ? '' : 'disabled'}>Confirm</button>${walkBtn}`;
  if (phase === 'dispatch') body.innerHTML = `<h2 class="sr-only">On the way</h2>
    <div class="vehicle-row"><div class="car-thumb" aria-hidden="true"></div>
    <div class="vehicle-meta"><div class="plate-badge"><span>TEXAS</span><b>${VEHICLE_PLATE}</b></div>
    <div class="color-line"><i style="background:${MEGALAMP.hex}"></i><b>${MEGALAMP.name}</b></div></div>
    <b class="eta" id="dispatch-eta">${arrivalCopy(Math.max(0, pickupDist - distance))}</b></div>
    <p class="phone-sub">Match the front light bar and the plate before you get in.</p>`;
  if (phase === 'dispatch') actions = `<button class="text-btn" id="cancel" type="button">Cancel</button>${walkBtn}`;
  if (phase === 'pickup') body.innerHTML = `<div class="enter-arrow" aria-hidden="true"></div>
    <p class="enter-kicker">Your Cybercab</p>
    <p class="enter-distance">12 m</p>
    <div class="plate-badge enter-plate"><span>TEXAS</span><b>${VEHICLE_PLATE}</b></div>
    <p class="phone-sub enter-copy">The front bar is ${MEGALAMP.name}. Match this screen, then open the doors.</p>`;
  if (phase === 'pickup') actions = `<div class="enter-row"><button class="text-btn" id="honk" type="button">Honk</button><button class="text-btn" id="flash" type="button">Flash</button></div><button class="primary" id="enter" type="button">Open doors</button><button class="text-btn" id="cancel" type="button">Cancel ride</button>${walkBtn}`;
  if (phase === 'boarded') body.innerHTML = `<h2>Buckle up</h2><p class="phone-sub">The door closes once everyone is buckled. Then tap Start Ride here or on the cabin screen.</p>`;
  if (phase === 'boarded') actions = `<button class="secondary" id="buckle-phone">${belted ? 'Seatbelt fastened' : 'Fasten seatbelt'}</button><button class="primary" id="start-phone" ${canStart ? '' : 'disabled'}>${belted && !canStart ? 'Closing door…' : 'Start Ride'}</button>`;
  if (phase === 'arrived') body.innerHTML = `<h2>You've arrived</h2><p class="phone-sub">${DROPOFF.name}. Parked with hazards on.</p>`;
  if (phase === 'arrived') actions = '<button class="primary" id="exit-phone">Open door</button>';
  if (phase === 'exited') body.innerHTML = `<h2>How was your ride?</h2>
    <div class="stars" role="group" aria-label="Rate this ride">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star" data-star="${n}" aria-label="${n} star">★</button>`).join('')}</div>
    <p class="phone-sub">Check for belongings. The doors close after you finish.</p>`;
  if (phase === 'exited') actions = `<button class="primary" id="finish">Done</button>${walkBtn}`;
  if (phase === 'complete') body.innerHTML = `<h2>Trip complete</h2><p class="phone-sub">Thanks for riding. This was a local simulation, not a Tesla trip.</p>
    <div class="stars" role="group" aria-label="Rate this ride">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star" data-star="${n}" aria-label="${n} star">★</button>`).join('')}</div>
    <div class="trip-summary"><span>Distance<b>${((dropoffDist - pickupDist) / 1000).toFixed(2)} km</b></span><span>Megalamp<b>${MEGALAMP.name}</b></span></div>`;
  if (phase === 'complete') actions = `<button class="primary" id="restart">Request</button>${walkBtn}`;
  phoneActions.innerHTML = actions;
  if (phase === 'boarded' || phase === 'ride' || phase === 'arrived') {
    const remainingM = Math.max(0, dropoffDist - distance);
    const eta = Math.max(1, Math.ceil(remainingM / 12));
    const boardedCopy = belted && !canStart
      ? 'Closing the door. Start Ride unlocks when it is shut.'
      : 'Buckle up. The door closes when everyone is buckled. Then Start Ride.';
    const rideStatus = phase === 'ride' && !paused ? 'EN ROUTE' : 'PARK';
    const kicker = phase === 'arrived' ? 'ARRIVED' : phase === 'boarded' ? 'BUCKLE UP' : 'DESTINATION';
    cabin.innerHTML = `<div class="cabin-header"><span class="cabin-status">${rideStatus}</span><span class="js-clock">6:42</span><span>${temperature}°</span><span>${belted ? 'BELT' : 'UNBUCKLED'}</span><span>CAM</span></div>
      <div class="cabin-grid"><div class="cabin-map">${map}</div>
      <div class="cabin-copy"><small>${kicker}</small>
      <h2>${DROPOFF.name}</h2>
      <p>${phase === 'boarded' ? boardedCopy : phase === 'arrived' ? 'In Park. Hazards on. Open the door, step out, then complete the trip in the app.' : `<span id="ride-eta">${eta} min · ${remainingM / 1000 > 0 ? (remainingM / 1000).toFixed(2) : '0.00'} km remaining</span>`}</p>
      <div class="cabin-actions">${phase === 'boarded' ? `<button class="secondary" id="buckle">${belted ? 'Seatbelt fastened' : 'Fasten seatbelt'}</button><button class="primary" id="start-ride" ${canStart ? '' : 'disabled'}>Start Ride</button>` : phase === 'arrived' ? '<button class="primary" id="exit-cabin">Open door</button>' : `<button class="secondary" id="pause">${paused ? 'Resume ride' : 'Pull over'}</button>`}</div>
      </div></div>
      <div class="cabin-bottom">
        <button id="temp-down" aria-label="Lower cabin temperature">−</button><b>${temperature}°</b><button id="temp-up" aria-label="Raise cabin temperature">+</button>
        <span>AUTO</span>
        <button id="music">${muted ? 'Sound off' : 'Media'}</button>
        <button id="support" class="ghost">Support</button>
      </div>`;
  }
  const fasten = () => { if (!belted) { belted = true; saveRide(); renderUI(); } };
  const tryStart = () => {
    if (phase !== 'boarded' || !belted || door > 0.08) return;
    startAudio();
    cam = 'chase';
    mapOverview = false;
    paused = false;
    setPhase('ride');
  };
  bind('request', () => {
    if (!inside) { toast('That destination is outside the service area.'); return; }
    distance = stageDist;
    speedMps = 0;
    hold = 0;
    placeCab(stageDist, 0);
    cam = 'chase';
    orbitYaw = 0.58;
    orbitPitch = 0.12;
    setPhase('dispatch');
    toast('On the way. Match Violet and plate ' + VEHICLE_PLATE + '. WASD walks.');
  });
  bind('cancel', () => {
    cam = 'walk';
    distance = stageDist;
    speedMps = 0;
    doorRequested = false;
    belted = false;
    paused = false;
    setPhase('explore');
  });
  bind('walk-around', () => {
    phoneVisible = false;
    if (phase !== 'ride' && phase !== 'boarded' && phase !== 'arrived') cam = 'walk';
    renderUI();
  });
  bind('honk', () => toast('Horn.'));
  bind('flash', () => toast('Lights flashing.'));
  bind('opt-y', () => toast('This simulation assigns the Cybercab.'));
  bind('enter', () => {
    lookYaw = cab.group.rotation.y;
    lookPitch = 0.08;
    cam = 'cabin';
    startAudio();
    doorRequested = true;
    setPhase('boarded');
  });
  bind('buckle', fasten);
  bind('buckle-phone', fasten);
  bind('start-ride', tryStart);
  bind('start-phone', tryStart);
  const leaveCabin = () => {
    doorRequested = true;
    walk = cab.group.position.clone().add(curbShift(dropoffDist, CURB_PULL + 2.4));
    walk.y = ROAD_Y + 1.62;
    lookYaw = cab.group.rotation.y + 0.9;
    lookPitch = -0.06;
    phoneVisible = true;
    cam = 'walk';
    setPhase('exited');
  };
  bind('exit-phone', leaveCabin);
  bind('exit-cabin', leaveCabin);
  bind('finish', () => { doorRequested = false; setPhase('complete'); });
  bind('restart', () => {
    distance = stageDist; speedMps = 0; paused = false; belted = false; cam = 'walk'; doorRequested = false; mapOverview = true;
    hold = 0; curbState = 0;
    walk = pickup.position.clone().add(curbShift(pickupDist, 1.8));
    walk.y = ROAD_Y + 1.62;
    const again = project(CAPITOL.lon, CAPITOL.lat).sub(walk);
    lookYaw = Math.atan2(-again.x, -again.z);
    lookPitch = -0.11;
    setPhase('explore');
  });
  bind('pause', () => { paused = !paused; saveRide(); renderUI(); });
  bind('temp-down', () => { temperature = Math.max(16, temperature - 1); saveRide(); renderUI(); });
  bind('temp-up', () => { temperature = Math.min(28, temperature + 1); saveRide(); renderUI(); });
  bind('music', () => {
    muted = !muted;
    if (!audio && !muted) startAudio();
    if (gain) gain.gain.value = muted ? 0 : 1;
    saveRide();
    renderUI();
  });
  document.querySelectorAll<HTMLButtonElement>('.map-expand').forEach((button) => {
    button.addEventListener('click', () => { mapOverview = !mapOverview; renderUI(); });
  });
  document.querySelector('#destination')?.addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (DESTINATIONS.some((item) => item.id === value)) destinationId = value;
    saveRide();
    renderUI();
  });
  bind('support', () => toast('Simulated support only. This does not contact Tesla or emergency services.'));
  bind('alerts', () => toast('No new alerts. This preview does not connect to Tesla.'));
  document.querySelectorAll<HTMLButtonElement>('.star').forEach((button) => {
    button.addEventListener('click', () => {
      const picked = Number(button.dataset.star);
      document.querySelectorAll<HTMLButtonElement>('.star').forEach((star) => {
        star.classList.toggle('on', Number(star.dataset.star) <= picked);
      });
    });
  });
  syncChrome();
}

function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener('click', fn);
}

function syncChrome() {
  const stick = document.getElementById('stick');
  const showPhone = document.getElementById('show-phone');
  const walking = cam === 'walk' && phase !== 'ride' && phase !== 'boarded' && phase !== 'arrived';
  if (stick) stick.hidden = !(coarsePointer && walking && !phoneVisible);
  if (showPhone) showPhone.hidden = !coarsePointer || phoneVisible || phase === 'ride' || phase === 'boarded' || phase === 'arrived';
  const status = document.querySelector('#phase-status');
  const heading = document.querySelector('#phone h2');
  if (status && heading) status.textContent = heading.textContent || phase;
}

function updateRideReadout() {
  const remainingM = Math.max(0, dropoffDist - distance);
  const eta = Math.max(1, Math.ceil(remainingM / 12));
  const etaEl = document.querySelector('#ride-eta');
  if (etaEl) etaEl.textContent = `${eta} min · ${(remainingM / 1000).toFixed(2)} km remaining`;
  const dispatchEta = document.querySelector('#dispatch-eta');
  if (dispatchEta && phase === 'dispatch') dispatchEta.textContent = arrivalCopy(Math.max(0, pickupDist - distance));
}

function updateMapDots() {
  const overview = mapIsOverview();
  const progress = THREE.MathUtils.clamp((distance - pickupDist) / Math.max(1, dropoffDist - pickupDist), 0, 1);
  const along = pickupDist + progress * (dropoffDist - pickupDist);
  const [px, py] = mapPoint(sample(along).position, overview);
  document.querySelectorAll('[data-cab],[data-cab-core]').forEach((node) => {
    node.setAttribute('cx', String(px));
    node.setAttribute('cy', String(py));
  });
}

let audio: AudioContext | undefined;
let gain: GainNode | undefined;
let roadGain: GainNode | undefined;
let doorGain: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let heardBlink = false;
let lastDoorSound = 0;
function startAudio() {
  if (audio) return;
  audio = new AudioContext();
  gain = audio.createGain();
  gain.gain.value = muted ? 0 : 1;
  gain.connect(audio.destination);
  noiseBuffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const road = audio.createBufferSource();
  road.buffer = noiseBuffer;
  road.loop = true;
  const roadFilter = audio.createBiquadFilter();
  roadFilter.type = 'lowpass';
  roadFilter.frequency.value = 240;
  roadGain = audio.createGain();
  roadGain.gain.value = 0;
  road.connect(roadFilter);
  roadFilter.connect(roadGain);
  roadGain.connect(gain);
  road.start();
  const hush = audio.createBufferSource();
  hush.buffer = noiseBuffer;
  hush.loop = true;
  const hushFilter = audio.createBiquadFilter();
  hushFilter.type = 'bandpass';
  hushFilter.frequency.value = 380;
  hushFilter.Q.value = 0.7;
  const hushGain = audio.createGain();
  hushGain.gain.value = 0.012;
  hush.connect(hushFilter);
  hushFilter.connect(hushGain);
  hushGain.connect(gain);
  hush.start();
  const doorSrc = audio.createBufferSource();
  doorSrc.buffer = noiseBuffer;
  doorSrc.loop = true;
  const doorFilter = audio.createBiquadFilter();
  doorFilter.type = 'lowpass';
  doorFilter.frequency.value = 900;
  doorGain = audio.createGain();
  doorGain.gain.value = 0;
  doorSrc.connect(doorFilter);
  doorFilter.connect(doorGain);
  doorGain.connect(gain);
  doorSrc.start();
}
function blip() {
  if (!audio || !gain || !noiseBuffer || muted) return;
  const src = audio.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1600;
  const click = audio.createGain();
  const now = audio.currentTime;
  click.gain.setValueAtTime(0.2, now);
  click.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  src.connect(filter);
  filter.connect(click);
  click.connect(gain);
  src.start(now);
  src.stop(now + 0.05);
}
function pumpAudio() {
  if (!gain) return;
  gain.gain.value = muted ? 0 : 1;
  if (roadGain) roadGain.gain.value = muted ? 0 : roadLevel(speedMps);
  if (doorGain) doorGain.gain.value = muted ? 0 : Math.min(0.05, Math.abs(door - lastDoorSound) * 1.4);
  lastDoorSound = door;
  if (!cabMounted) return;
  const lights = cab.lightState();
  const signaling = lights.hazard || lights.turn !== 'none';
  if (signaling && lights.blink !== heardBlink) blip();
  heardBlink = lights.blink;
}

let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', e => {
  if ((e.target as Node) !== canvas) return;
  dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = (e.clientX - lx) * 0.0035;
  const dy = (e.clientY - ly) * 0.003;
  if (cam === 'chase') {
    orbitYaw = THREE.MathUtils.clamp(orbitYaw - dx, -0.1, 0.72);
    orbitPitch = THREE.MathUtils.clamp(orbitPitch - dy, -0.02, 0.42);
  } else {
    lookYaw -= dx;
    lookPitch = THREE.MathUtils.clamp(lookPitch - dy, -0.65, 0.5);
  }
  lx = e.clientX; ly = e.clientY;
});
async function toggleFullscreen() {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (root.requestFullscreen) await root.requestFullscreen();
    else root.webkitRequestFullscreen?.();
  } catch {
    toast('Fullscreen is unavailable in this browser.');
  }
}

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === 'p') {
    const next = togglePhone(phase, phoneVisible);
    if (next.ignored) toast('The phone comes back when you arrive.');
    else { phoneVisible = next.visible; renderUI(); }
  }
  if (key === 'c') {
    cam = cam === 'chase' ? (phase === 'boarded' || phase === 'ride' || phase === 'arrived' ? 'cabin' : 'walk') : 'chase';
    syncChrome();
    toast(cam === 'chase' ? 'Chase camera' : cam === 'cabin' ? 'Cabin camera' : 'Walk camera');
  }
  if (key === 'f') void toggleFullscreen();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
function persistGraphics() {
  try { localStorage.setItem(GRAPHICS_KEY, JSON.stringify({ v: 1, mode: qualityMode, overrides: graphicsOverrides })); } catch { /* private mode */ }
}

function gfxLabel() {
  const preset = QUALITY_LABEL[quality];
  return qualityMode === 'auto' ? `Auto · ${preset}` : preset;
}

function syncGfxMenu() {
  const menu = document.getElementById('gfx-menu');
  if (!menu) return;
  menu.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.classList.toggle('on', button.dataset.mode === qualityMode);
  });
  const current = document.getElementById('gfx-current');
  if (current) current.textContent = lockSoftware ? 'Software graphics stay on Low.' : `Preset in use: ${gfxLabel()}`;
  const shadows = menu.querySelector<HTMLInputElement>('[data-toggle="shadows"]');
  const aa = menu.querySelector<HTMLInputElement>('[data-toggle="aa"]');
  const post = menu.querySelector<HTMLInputElement>('[data-toggle="post"]');
  if (shadows) shadows.checked = graphics.shadows;
  if (aa) aa.checked = graphics.aa;
  if (post) post.checked = graphics.post;
}

function applyQuality(next: Quality, announce = true, fromUser = false) {
  if (lockSoftware && next !== 'low') {
    if (announce) toast('Software graphics stay on Low.');
    next = 'low';
  }
  quality = next;
  graphics = graphicsFor(quality, graphicsOverrides);
  const ratio = pixelRatioFor(devicePixelRatio, quality, { software: softwareGl, coarse: coarsePointer }, graphics.pixelScale);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(ratio);
  composer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = graphics.shadows && graphics.shadowSize > 0;
  lighting.apply(graphics, quality, lockSoftware);
  lighting.hookObject(scene);
  if (ssaoPass) {
    ssaoPass.enabled = graphics.post && quality !== 'low' && !coarsePointer && !lockSoftware;
    ssaoPass.enabled = graphics.post && quality !== 'low' && !coarsePointer && !lockSoftware;
    ssaoPass.kernelRadius = quality === 'ultra' ? 18 : quality === 'high' ? 12 : 6;
    ssaoPass.minDistance = 0.002;
    ssaoPass.maxDistance = quality === 'ultra' ? 0.28 : quality === 'high' ? 0.16 : 0.08;
  }
  bloomPass.enabled = graphics.post && !lockSoftware && !coarsePointer;
  bloomPass.threshold = quality === 'ultra' ? 0.74 : 0.82;
  bloomPass.strength = !graphics.post || coarsePointer ? 0 : quality === 'ultra' ? 0.16 : quality === 'high' ? 0.1 : 0.045;
  bloomPass.radius = quality === 'ultra' ? 0.38 : 0.28;
  smaaPass.enabled = graphics.aa && !coarsePointer && !lockSoftware;
  gradePass.enabled = graphics.post && !lockSoftware;
  scene.environmentIntensity = quality === 'ultra' ? 1.25 : quality === 'low' ? 0.9 : 1.15;
  if (cabMounted) cab.setContactDisc(showContactDisc(graphics.shadows));
  document.querySelector('#settings')?.setAttribute('aria-label', `${gfxLabel()} graphics. Activate to open settings.`);
  syncGfxMenu();
  if (announce) toast(`${gfxLabel()} graphics`);
}
applyQuality(quality, false);
const gfxMenu = document.getElementById('gfx-menu');
bind('settings', () => {
  if (!gfxMenu) return;
  const open = gfxMenu.hasAttribute('hidden');
  gfxMenu.toggleAttribute('hidden', !open);
  document.getElementById('settings')?.setAttribute('aria-expanded', String(open));
  syncGfxMenu();
});
gfxMenu?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    if (mode !== 'auto' && mode !== 'low' && mode !== 'medium' && mode !== 'high' && mode !== 'ultra') return;
    qualityMode = mode;
    adaptState = emptyAdaptState();
    applyQuality(lockSoftware ? 'low' : resolvedQuality(qualityMode, hardware), true, true);
    persistGraphics();
    void restyleWorld();
  });
});
gfxMenu?.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((input) => {
  input.addEventListener('change', () => {
    const key = input.dataset.toggle;
    if (key !== 'shadows' && key !== 'aa' && key !== 'post') return;
    graphicsOverrides = { ...graphicsOverrides, [key]: input.checked };
    applyQuality(quality, false, true);
    persistGraphics();
  });
});
bind('show-phone', () => { phoneVisible = true; renderUI(); });
document.querySelector('#boot-retry')?.addEventListener('click', () => location.reload());
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showGpuFailure('Graphics reset. Reload the page to continue.');
});

const chaseOffset = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const desiredCam = new THREE.Vector3();
const localCam = new THREE.Vector3();
const invQuat = new THREE.Quaternion();
const walkMove = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);
const cabinEye = new THREE.Vector3();
const cabinLook = new THREE.Vector3();
const routeSide = new THREE.Vector3();
const routeTangent = new THREE.Vector3();

function constrainWalk() {
  let best = 8;
  let bestD = Infinity;
  const end = Math.max(12, routeLength - 8);
  for (let d = 8; d <= end; d += 8) {
    const p = sample(d).position;
    const dx = walk.x - p.x;
    const dz = walk.z - p.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestD) { bestD = dist; best = d; }
  }
  const here = sample(best);
  const ahead = sample(Math.min(routeLength - 0.4, best + 6));
  routeTangent.copy(ahead.position).sub(here.position);
  routeTangent.y = 0;
  if (routeTangent.lengthSq() < 1e-6) return;
  routeTangent.normalize();
  routeSide.set(Math.cos(here.heading), 0, -Math.sin(here.heading));
  const dx = walk.x - here.position.x;
  const dz = walk.z - here.position.z;
  let lateral = dx * routeSide.x + dz * routeSide.z;
  const along = THREE.MathUtils.clamp(dx * routeTangent.x + dz * routeTangent.z, -6, 6);
  lateral = THREE.MathUtils.clamp(lateral, -12, 8);
  walk.x = here.position.x + routeTangent.x * along + routeSide.x * lateral;
  walk.z = here.position.z + routeTangent.z * along + routeSide.z * lateral;
  walk.y = ROAD_Y + 1.62;
}

function applyWalk(dt: number) {
  const ix = (Number(keys.has('d')) - Number(keys.has('a'))) + stickX;
  const iz = (Number(keys.has('s')) - Number(keys.has('w'))) + stickY;
  walkMove.set(ix, 0, iz);
  if (walkMove.lengthSq() > 1) walkMove.setLength(1);
  if (walkMove.lengthSq() < 0.0004) return;
  walkMove.applyAxisAngle(upAxis, lookYaw).multiplyScalar(dt * 4.4);
  walk.add(walkMove);
  constrainWalk();
}

let holdCam = false;

function updateCamera(dt: number) {
  if (holdCam) return;
  if (cam !== 'cabin' && (camera.fov !== 52 || camera.near !== 0.15)) {
    camera.fov = 52;
    camera.near = 0.15;
    camera.updateProjectionMatrix();
  }
  const view = cam;
  switch (view) {
    case 'cabin': {
      if (camera.fov !== 68 || camera.near !== 0.05) {
        camera.fov = 68;
        camera.near = 0.05;
        camera.updateProjectionMatrix();
      }
      cabinEye.set(CABIN_EYE.x, CABIN_EYE.y, CABIN_EYE.z).applyMatrix4(cab.group.matrixWorld);
      cabinLook.set(CABIN_LOOK.x, CABIN_LOOK.y, CABIN_LOOK.z).applyMatrix4(cab.group.matrixWorld);
      camera.position.copy(cabinEye);
      camera.up.set(0, 1, 0);
      camera.lookAt(cabinLook);
      const yawOff = (lookYaw - cab.group.rotation.y) * 0.35;
      const pitchOff = lookPitch - 0.08;
      camera.rotateY(yawOff);
      camera.rotateX(pitchOff);
      break;
    }
    case 'chase': {
      const face = phase === 'dispatch' || phase === 'pickup';
      if (face) chaseOffset.set(4.6, 2.05, -3.4);
      else chaseOffset.set(Math.sin(orbitYaw) * 1.6 + 0.4, 1.85 + orbitPitch * 0.8, 6.2);
      chaseOffset.y = Math.max(1.7, chaseOffset.y);
      desiredCam.copy(chaseOffset).applyQuaternion(cab.group.quaternion).add(cab.group.position);
      const snap = reduceMotion || camera.position.distanceTo(desiredCam) > 3.2 || camera.position.distanceTo(cab.group.position) < cab.cameraClearance;
      camera.position.lerp(desiredCam, snap ? 1 : 1 - Math.exp(-dt * 3.4));
      invQuat.copy(cab.group.quaternion).invert();
      localCam.copy(camera.position).sub(cab.group.position).applyQuaternion(invQuat);
      if (localCam.length() < cab.cameraClearance) {
        localCam.setLength(cab.cameraClearance);
        localCam.applyQuaternion(cab.group.quaternion);
        camera.position.copy(cab.group.position).add(localCam);
      }
      lookTarget.set(face ? 0.2 : 0, face ? 0.82 : 0.62, face ? -0.1 : -7.2).applyQuaternion(cab.group.quaternion).add(cab.group.position);
      camera.lookAt(lookTarget);
      break;
    }
    case 'walk': {
      applyWalk(dt);
      camera.position.lerp(walk, reduceMotion ? 1 : 1 - Math.exp(-dt * 6));
      camera.rotation.order = 'YXZ';
      camera.rotation.set(lookPitch, lookYaw, 0);
      break;
    }
    default: {
      const _never: never = view;
      return _never;
    }
  }
}

function placeCab(d: number, curb = 0) {
  const p = sample(THREE.MathUtils.clamp(d, 0.4, routeLength - 0.4));
  cab.group.position.copy(p.position);
  if (curb) cab.group.position.add(curbShift(d, curb));
  cab.group.position.y = ROAD_Y;
  cab.group.rotation.y = p.heading;
  appliedCurb = curb;
}
function update(dt: number) {
  elapsed += dt;
  world.update(dt);
  const walking = keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') || stickX * stickX + stickY * stickY > 0.04;
  if (walking && cam === 'chase' && phase !== 'ride' && phase !== 'boarded' && phase !== 'arrived') {
    walk.copy(camera.position);
    walk.y = ROAD_Y + 1.62;
    cam = 'walk';
  }
  const traffic = life.update(dt, distance, speedMps);
  if (phase === 'explore') {
    placeCab(stageDist, 0);
    speedMps = 0;
    hold = 0;
  } else if (phase === 'dispatch') {
    const remaining = pickupDist - distance;
    const want = remaining > 18 ? 12.6 : Math.max(0, (remaining / 18) * 12.6);
    const rate = want + 0.2 >= speedMps ? 4.5 : 8;
    speedMps += THREE.MathUtils.clamp(want - speedMps, -rate * dt, rate * dt);
    if (want < 0.08 && speedMps < 0.2) speedMps = 0;
    distance = Math.min(pickupDist, distance + speedMps * dt);
    const pull = THREE.MathUtils.smoothstep(pickupDist - 22, pickupDist - 1.4, distance) * CURB_PULL;
    placeCab(distance, pull);
    if (distance >= pickupDist - 0.25 && speedMps < 0.35) {
      distance = pickupDist;
      speedMps = 0;
      placeCab(pickupDist, CURB_PULL);
      hold += dt;
      if (hold > 0.4) setPhase('pickup');
    } else hold = 0;
  } else if (phase === 'pickup' || phase === 'boarded') {
    placeCab(pickupDist, CURB_PULL);
    speedMps = 0;
  } else if (phase === 'ride') {
    const remaining = dropoffDist - distance;
    const cruise = Math.min(13.4, 5 + elapsed * 2.6);
    let want = paused ? 0 : remaining > 20 ? cruise : Math.max(0, (remaining / 20) * cruise);
    if (!paused && remaining > 18) want = blockedSpeed(want, traffic.stop, traffic.stopDist);
    const rate = want + 0.15 >= speedMps ? 2.6 : 7;
    speedMps += THREE.MathUtils.clamp(want - speedMps, -rate * dt, rate * dt);
    if (want < 0.08 && speedMps < 0.16) speedMps = 0;
    const curbTarget = paused
      ? CURB_PULL
      : THREE.MathUtils.smoothstep(dropoffDist - 18, dropoffDist - 1.6, distance) * CURB_PULL;
    curbState = THREE.MathUtils.damp(curbState, curbTarget, 2.4, dt);
    if (door < 0.04) distance = Math.min(dropoffDist, distance + speedMps * dt);
    placeCab(distance, curbState);
    if (distance >= dropoffDist - 0.2 && speedMps < 0.55) {
      distance = dropoffDist;
      speedMps = 0;
      placeCab(dropoffDist, CURB_PULL);
      phoneVisible = true;
      cam = 'chase';
      setPhase('arrived');
    }
  } else {
    placeCab(dropoffDist, CURB_PULL);
    speedMps = 0;
  }
  const wantDoor = doorTarget(phase, elapsed, belted, doorRequested, phase === 'dispatch' && hold > 0);
  door = stepDoor(door, wantDoor, dt, reduceMotion);
  const curbRate = (appliedCurb - prevAppliedCurb) / Math.max(dt, 1e-4);
  prevAppliedCurb = appliedCurb;
  cab.setPhase(phase);
  cab.setDoor(door, 1);
  cab.setCabinView(cam === 'cabin');
  cab.update(dt, speedMps, camera.position.distanceTo(cab.group.position), curbRate);
  cab.group.updateMatrixWorld();
  updateCamera(dt);
  pumpAudio();
  clockMinutes += dt * 0.35;
  const clockNow = clockLabel();
  if (clockNow !== clockShown) {
    clockShown = clockNow;
    document.querySelectorAll('.js-clock').forEach((node) => { node.textContent = clockNow; });
  }
  sun.position.copy(cab.group.position).add(sunOffset);
  sun.target.position.copy(cab.group.position);
  lighting.update(cab.group.position);
  const span = Math.max(1, dropoffDist - pickupDist);
  document.querySelector<HTMLElement>('#progress-fill')!.style.width = `${THREE.MathUtils.clamp((distance - pickupDist) / span, 0, 1) * 100}%`;
  document.querySelector('#speed')!.textContent = String(Math.round(speedMps * 2.237)).padStart(2, '0');
  document.querySelector('#gear')!.textContent = phase === 'ride' && !paused && speedMps > 0.2 ? 'D' : 'P';
}

let readoutTimer = 0;
let saveTimer = 0;
let frame = 0;
const frameTimes: number[] = [];
function noteFrame(dt: number) {
  if (softwareGl || qualityMode !== 'auto' || document.hidden) return;
  frameTimes.push(dt);
  if (frameTimes.length < 45) return;
  const avg = frameTimes.reduce((sum, sample) => sum + sample, 0) / frameTimes.length;
  frameTimes.length = 0;
  const adapted = adaptQuality(quality, avg, adaptState);
  adaptState = adapted.state;
  if (!adapted.changed) return;
  applyQuality(adapted.preset, false);
  toast(adapted.changed === 'down' ? 'Graphics eased down to hold the frame rate.' : 'Graphics stepped up.');
  void restyleWorld();
}
function renderFrame() {
  const cinematic = cabMounted && cam === 'chase' && (quality === 'high' || quality === 'ultra') && !lockSoftware && graphics.post;
  bokehPass.enabled = cinematic;
  if (cinematic) {
    const dof = bokehPass.uniforms as Record<string, { value: number }>;
    dof.focus.value = Math.max(4, camera.position.distanceTo(cab.group.position));
    dof.aperture.value = 0.00016;
    dof.maxblur.value = 0.007;
  }
  const ssrOn = !!lighting.ssr?.enabled;
  const ssaoOn = !!ssaoPass?.enabled;
  if (!graphics.post && !graphics.aa && !ssrOn && !ssaoOn && !bokehPass.enabled) renderer.render(scene, camera);
  else composer.render();
}
function animate(now: number) {
  requestAnimationFrame(animate);
  if (document.hidden || window.__cybercabPause) { last = now; return; }
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  update(dt);
  noteFrame(dt);
  readoutTimer += dt;
  saveTimer += dt;
  if (readoutTimer > 0.25) {
    readoutTimer = 0;
    updateMapDots();
    updateRideReadout();
  }
  if (saveTimer > 2) {
    saveTimer = 0;
    saveRide();
  }
  frame += 1;
  renderer.shadowMap.needsUpdate = frame % 2 === 0;
  renderFrame();
}
camera.position.copy(walk);
camera.rotation.order = 'YXZ';
camera.rotation.set(lookPitch, lookYaw, 0);

function restoreRide() {
  const saved = parseSnapshot(readRide());
  if (!saved) return;
  phase = saved.phase;
  distance = THREE.MathUtils.clamp(saved.distance, 0.4, routeLength - 0.4);
  belted = saved.belted;
  paused = saved.paused;
  temperature = saved.temperature;
  muted = saved.muted;
  destinationId = saved.destinationId;
  phoneVisible = saved.phase === 'arrived' || saved.phase === 'exited' ? true : saved.phoneVisible;
  elapsed = 0;
  speedMps = 0;
  if (saved.phase === 'pickup' || saved.phase === 'boarded') distance = pickupDist;
  if (saved.phase === 'arrived' || saved.phase === 'exited') distance = dropoffDist;
  if (saved.phase === 'boarded') cam = 'cabin';
  else if (saved.phase === 'exited') {
    cam = 'walk';
    doorRequested = true;
    walk = sample(dropoffDist).position.clone().add(curbShift(dropoffDist, CURB_PULL + 2.4));
    walk.y = ROAD_Y + 1.62;
  } else cam = 'chase';
  const atCurb = saved.phase === 'pickup' || saved.phase === 'boarded' || saved.phase === 'arrived' || saved.phase === 'exited';
  if (atCurb) curbState = CURB_PULL;
  placeCab(distance, atCurb ? CURB_PULL : 0);
}

function mountCab(loaded: Cybercab) {
  cab = loaded;
  cabMounted = true;
  scene.add(cab.group);
  cab.setContactDisc(showContactDisc(graphics.shadows));
  cab.group.position.copy(sample(stageDist).position);
  cab.group.position.y = ROAD_Y;
  cab.group.rotation.y = sample(stageDist).heading;
  restoreRide();
  uiReady = true;
  renderUI();
  requestAnimationFrame(animate);
  Object.assign(window, {
    render_game_to_text: () => {
      const doorBox = cab.doorMetrics();
      invQuat.copy(cab.group.quaternion).invert();
      localCam.copy(camera.position).sub(cab.group.position).applyQuaternion(invQuat);
      return JSON.stringify({
      phase, belted, distance, totalDistance: dropoffDist - pickupDist, paused, temperature, door,
      megalamp: MEGALAMP.name, plate: VEHICLE_PLATE, camera: cam, phoneVisible, destinationId,
      geofence: pointInRing(PICKUP.lon, PICKUP.lat, AUSTIN_ROBOTAXI_GEOFENCE),
      position: camera.position.toArray(),
      coordinates: 'meters; origin -97.745,30.264; X east, Y up, Z south',
      vehicle: cab.group.position.toArray(),
      cameraGap: Number(camera.position.distanceTo(cab.group.position).toFixed(2)),
      cameraLocal: localCam.toArray().map((n) => Number(n.toFixed(3))),
      doorLift: Number(doorBox.lift.toFixed(3)),
      doorTop: Number(doorBox.top.toFixed(3)),
      doorSpan: Number(doorBox.span.toFixed(3)),
      lights: cab.lightState(),
      wheelSpin: Number(cab.wheelSpin().toFixed(4)),
      wheelSteer: Number(cab.wheelSteer().toFixed(4)),
      speedMph: Math.round(speedMps * 2.23694),
      quality, qualityMode, reflections: graphics.reflections, cascades: graphics.cascades,
      forcedPreset: forcedPreset ?? null,
    });
    },
    advanceTime: (ms: number) => {
      for (let t = 0; t < ms; t += 16.667) update(Math.min(16.667, ms - t) / 1000);
      renderUI();
      renderFrame();
    },
    frameVehicle: (eye: number[], look: number[]) => {
      holdCam = true;
      camera.position.copy(new THREE.Vector3(eye[0], eye[1], eye[2]).applyMatrix4(cab.group.matrixWorld));
      camera.lookAt(new THREE.Vector3(look[0], look[1], look[2]).applyMatrix4(cab.group.matrixWorld));
      renderFrame();
    },
    releaseCamera: () => { holdCam = false; },
  });
}

const stickEl = document.getElementById('stick');
const nub = document.getElementById('nub');
let stickPointer = -1;
function setStick(clientX: number, clientY: number) {
  if (!stickEl) return;
  const rect = stickEl.getBoundingClientRect();
  let dx = (clientX - (rect.left + rect.width / 2)) / (rect.width * 0.35);
  let dy = (clientY - (rect.top + rect.height / 2)) / (rect.height * 0.35);
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  stickX = dx;
  stickY = dy;
  if (nub) nub.style.transform = `translate(${dx * 28}px, ${dy * 28}px)`;
}
function clearStick() {
  stickPointer = -1;
  stickX = 0;
  stickY = 0;
  if (nub) nub.style.transform = '';
}
stickEl?.addEventListener('pointerdown', (event) => {
  stickPointer = event.pointerId;
  stickEl.setPointerCapture(event.pointerId);
  setStick(event.clientX, event.clientY);
  event.preventDefault();
});
stickEl?.addEventListener('pointermove', (event) => {
  if (event.pointerId !== stickPointer) return;
  setStick(event.clientX, event.clientY);
});
const endStick = (event: PointerEvent) => {
  if (event.pointerId !== stickPointer) return;
  clearStick();
};
stickEl?.addEventListener('pointerup', endStick);
stickEl?.addEventListener('pointercancel', endStick);

void Promise.all([
  loadCybercab(),
  new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}textures/kloofendal_48d_partly_cloudy_puresky_1k.hdr`).then((hdri) => {
    hdri.mapping = THREE.EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(hdri).texture;
    hdri.dispose();
    const previous = scene.environment;
    scene.environment = env;
    if (previous && previous !== env) previous.dispose();
    pmrem.dispose();
  }).catch(() => undefined),
  world.ready,
  assets.ready,
]).then(async ([loaded]) => {
  setBoot('Dressing the avenue', 88);
  await restyleWorld();
  setBoot('Placing the Cybercab', 92);
  mountCab(loaded);
  await restyleWorld();
  renderFrame();
  hideBoot();
}).catch((error) => {
  console.error(error);
  setBoot('The Cybercab model did not load.', 100);
  document.getElementById('boot-retry')?.removeAttribute('hidden');
  toast('The Cybercab model did not load.');
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

