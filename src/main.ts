import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createWorld } from './world';
import { loadCybercab, type Cybercab } from './vehicle';
import { createCityLife } from './life';
import {
  APPROACH_RUNWAY, AUSTIN_ROBOTAXI_GEOFENCE, CAPITOL, CONGRESS_ROUTE, CURB_PULL, DROPOFF, GEOFENCE_NOTE, MEGALAMP,
  PICKUP, ROAD_Y, STOP_INSET, VEHICLE_LABEL, VEHICLE_PLATE, measurePath, pointInRing, project, samplePath,
} from './geo';
import './style.css';

type Phase = 'explore' | 'dispatch' | 'pickup' | 'boarded' | 'ride' | 'arrived' | 'exited' | 'complete';
type Cam = 'walk' | 'chase' | 'cabin';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="scene"></canvas><div class="vignette"></div>
<header><a class="brand" href="./"><span class="brand-icon">C</span> CYBERCAB <span class="brand-sub">AUSTIN EXPERIENCE</span></a><div class="live"><i></i> AUSTIN, TX <span>SERVICE AREA · ~288 MI²</span></div><button id="settings" class="round" aria-label="Toggle graphics quality">◈</button></header>
<aside class="chapter"><span class="eyebrow">CONGRESS AVENUE · AUSTIN</span><h1>Golden hour<br>on Congress.</h1><p>The Capitol closes the avenue.<br>Lady Bird Lake is behind you.<br>Match the Megalamp, then ride.</p><div class="chapter-line"></div><span class="small-label">01 / CONFIRM YOUR RIDE</span></aside>
<div class="location"><span class="location-dot">⌖</span><div><b id="location-name">Congress & 2nd</b><span id="location-detail">DOWNTOWN · CAPITOL NORTH · LAKE SOUTH</span></div></div>
<div class="hud"><div class="speedo"><b id="speed">00</b><small>MPH</small><span id="gear">P</span></div></div>
<aside id="phone" class="phone"><div class="phone-top"><b>6:42</b><div class="island"></div><span>▥ ▰</span></div><div class="phone-content"><div class="app-brand">ROBOTAXI <span>✦</span></div><div id="phone-body"></div></div><div class="home-bar"></div></aside>
<section id="cabin" class="cabin-panel" hidden></section>
<div id="toast" role="status"></div>
<footer><div class="controls"><span><kbd>DRAG</kbd> Look</span><span><kbd>W A S D</kbd> Walk</span><span><kbd>C</kbd> Camera</span><span><kbd>P</kbd> Phone</span><span><kbd>F</kbd> Fullscreen</span></div><div class="concept">INDEPENDENT CONCEPT SIMULATION <span>·</span> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a><a href="./docs.html" target="_blank">Sources & accuracy ↗</a></div></footer>
<div class="ride-progress"><div id="progress-fill"></div></div>`;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e4c3a2');
scene.fog = new THREE.FogExp2('#e7c8a8', 0.0002);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.15, 3200);

const sky = new Sky();
sky.scale.setScalar(45000);
const su = sky.material.uniforms;
su.turbidity.value = 3.4;
su.rayleigh.value = 1.8;
su.mieCoefficient.value = 0.006;
su.mieDirectionalG.value = 0.82;
const sunPosition = new THREE.Vector3(-0.95, 0.155, 0.42);
su.sunPosition.value.copy(sunPosition);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(sky as unknown as THREE.Scene, 0.03).texture;
scene.environmentIntensity = 0.95;

scene.add(new THREE.HemisphereLight('#ffd7b0', '#5c4638', 0.28));
const sun = new THREE.DirectionalLight('#ffb56a', 3.05);
sun.position.copy(sunPosition).normalize().multiplyScalar(280);
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

const world = createWorld(scene);
let cab: Cybercab;

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

const gl = renderer.getContext();
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') : '';
const softwareGl = /swiftshader|llvmpipe|softpipe|microsoft basic render/i.test(gpu);
if (softwareGl) {
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(1);
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssaoPass = softwareGl ? null : new SSAOPass(scene, camera, innerWidth, innerHeight, 8);
if (ssaoPass) {
  ssaoPass.kernelRadius = 0.85;
  ssaoPass.minDistance = 0.00001;
  ssaoPass.maxDistance = 0.0005;
  composer.addPass(ssaoPass);
}
if (ssaoPass) ssaoPass.enabled = false;
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), softwareGl ? 0.04 : 0.08, 0.32, 0.96);
composer.addPass(bloomPass);
const smaaPass = new SMAAPass();
smaaPass.enabled = !softwareGl;
composer.addPass(smaaPass);
composer.addPass(new OutputPass());

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
let hold = 0;
let blockedFor = 0;
let curbState = 0;
type Quality = 'balanced' | 'cinematic' | 'ultra' | 'performance';
let quality: Quality = softwareGl ? 'performance' : 'balanced';
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
const cabin = document.querySelector<HTMLElement>('#cabin')!;
let mapFeatures = '';
function mapPoint(v: THREE.Vector3, overview = false) {
  if (overview) return [140 + v.x * 0.0078, 122 + v.z * 0.0078];
  return [140 + (v.x - 165) * 0.29, 122 + (v.z + 300) * 0.29];
}

let uiReady = false;
fetch(`${import.meta.env.BASE_URL}data/austin.json`).then(r => r.json()).then(data => {
  const path = (coords: number[][]) => coords.map(([lon, lat], i) => {
    const [x, y] = mapPoint(project(lon, lat));
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  mapFeatures = data.buildings.map((b: { coordinates: number[][] }) => `<path d="${path(b.coordinates)}Z" fill="#d4ddd0"/>`).join('')
    + data.roads.map((r: { coordinates: number[][] }) => `<path d="${path(r.coordinates)}" fill="none" stroke="#f7f8f4" stroke-width="3"/>`).join('');
  if (uiReady) renderUI();
}).catch(() => toast('Map unavailable. Showing the bundled route.'));

function geofencePath() {
  return AUSTIN_ROBOTAXI_GEOFENCE.map(([lon, lat], i) => {
    const [x, y] = mapPoint(project(lon, lat), true);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + 'Z';
}

function mapMarkup(progress = 0) {
  const overview = mapOverview || phase === 'explore';
  const line = route.map((v, i) => {
    const [x, y] = mapPoint(v, overview);
    return `${i ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
  const along = pickupDist + progress * (dropoffDist - pickupDist);
  const [px, py] = mapPoint(sample(along).position, overview);
  const [ex, ey] = mapPoint(sample(dropoffDist).position, overview);
  return `<div class="map"><svg viewBox="0 0 280 245"><rect width="280" height="245" fill="#e6ebe3"/>
    <path d="${geofencePath()}" fill="#3d6b5228" stroke="#2f5a44" stroke-width="${overview ? 2 : 0.6}" stroke-dasharray="4 3"/>
    ${overview ? '' : mapFeatures}<path d="${line}" stroke="#283d2e" stroke-width="${overview ? 2 : 4}" fill="none" stroke-linecap="round"/>
    <circle cx="${ex}" cy="${ey}" r="7" fill="#283d2e" stroke="white" stroke-width="3"/>
    <circle cx="${px}" cy="${py}" r="8" fill="${MEGALAMP.hex}" stroke="white" stroke-width="3"/>
    <text x="18" y="22">${overview ? 'AUSTIN SERVICE AREA' : 'CONGRESS AVE'}</text></svg>
    <span class="map-pin">AUSTIN · N ↑</span>
    <button class="map-expand" aria-label="Toggle map zoom" id="center-map">${overview ? '⊕' : '⌖'}</button></div>`;
}

function setPhase(next: Phase) {
  phase = next;
  elapsed = 0;
  renderUI();
}
function toast(text: string) {
  const el = document.querySelector('#toast')!;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function lampForPhase() {
  const match = phase === 'dispatch' || phase === 'pickup' || (phase === 'boarded' && !belted);
  cab.setLamp(match ? 'match' : 'idle');
  cab.setHazards(phase === 'pickup' || phase === 'arrived' || phase === 'exited');
}

function matchCard() {
  return `<div class="lightbar" style="--lamp:${MEGALAMP.hex}"><span>Front light bar · ${MEGALAMP.name}</span></div>
    <div class="id-row"><div class="plate-badge"><span>TEXAS</span><b>${VEHICLE_PLATE}</b></div>
    <div class="mega-card"><i style="background:${MEGALAMP.hex}"></i><div><small>MATCH COLOR</small><b>${MEGALAMP.name}</b></div></div></div>`;
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
  phone.classList.toggle('matching', phase === 'dispatch' || phase === 'pickup');
  cabin.hidden = phase !== 'ride' && phase !== 'boarded' && phase !== 'arrived';
  const map = mapMarkup((distance - pickupDist) / Math.max(1, dropoffDist - pickupDist));
  const inside = pointInRing(PICKUP.lon, PICKUP.lat, AUSTIN_ROBOTAXI_GEOFENCE) && pointInRing(DROPOFF.lon, DROPOFF.lat, AUSTIN_ROBOTAXI_GEOFENCE);
  const canStart = belted && door < 0.08;
  if (phase === 'explore') body.innerHTML = `<h2>Where to?</h2><p class="phone-sub">Enter a destination inside the service area. This trip stays on Congress.</p>${map}
    <div class="route-card"><div class="route-row"><i class="dot"></i><div><small>PICKUP</small><b>${PICKUP.name}</b></div><span class="chip in">In area</span></div>
    <div class="route-row"><i class="square"></i><div><small>DESTINATION</small><b>${DROPOFF.name}</b></div><span class="chip ${inside ? 'in' : 'out'}">${inside ? 'In area' : 'Outside'}</span></div></div>
    <div class="fare"><span>Cybercab <small>2 seats · No wheel · Simulated fare</small></span><b>~3 min<small>Est. wait under 1 min</small></b></div>
    <p class="geo-note">${GEOFENCE_NOTE}</p>
    <button class="primary" id="request" ${inside ? '' : 'disabled'}>Confirm <span>↗</span></button>
    <p class="micro">Independent concept. No real booking, fare, or Tesla connection. Hours simulated 6:00–23:00.</p>`;
  if (phase === 'dispatch') body.innerHTML = `<h2>On the way.</h2><p class="phone-sub">Match the front light bar and the plate before you get in.</p>${map}
    <p class="vehicle-kicker">${VEHICLE_LABEL}</p>${matchCard()}
    <button class="secondary" id="cancel">Cancel request</button>`;
  if (phase === 'pickup') body.innerHTML = `<h2>Your Cybercab has arrived.</h2><p class="phone-sub">At the curb. Hazards are on. Match the front light bar, then the plate.</p>${map}
    <p class="arrive-distance">At the east curb</p>${matchCard()}
    <button class="primary" id="enter">Enter <span>→</span></button>`;
  if (phase === 'boarded') body.innerHTML = `<h2>Buckle up.</h2><p class="phone-sub">The door closes once everyone is buckled. Then tap Start Ride here or on the cabin screen.</p>
    <button class="secondary" id="buckle-phone">${belted ? 'Seatbelt fastened' : 'Fasten seatbelt'}</button>
    <button class="primary" id="start-phone" ${canStart ? '' : 'disabled'}>${belted && !canStart ? 'Closing door…' : 'Start Ride'}</button>`;
  if (phase === 'arrived') body.innerHTML = `<h2>You have arrived.</h2><p class="phone-sub">${DROPOFF.name}. Parked with hazards on. Open a door when you are ready to step out.</p>${map}
    <button class="primary" id="exit-phone">Open door</button>`;
  if (phase === 'exited') body.innerHTML = `<h2>Complete your trip.</h2><p class="phone-sub">Once you are clear of the vehicle, finish in the app. Check for belongings. The doors close after that.</p>${map}
    <button class="primary" id="finish">Complete trip</button>`;
  if (phase === 'complete') body.innerHTML = `<div class="complete-icon">✓</div><h2>Trip complete.</h2><p class="phone-sub">Thanks for riding. This was a local simulation, not a Tesla trip.</p>${map}
    <div class="trip-summary"><span>Distance<b>${((dropoffDist - pickupDist) / 1000).toFixed(2)} km</b></span><span>Megalamp<b>${MEGALAMP.name}</b></span></div>
    <button class="primary" id="restart">Take another ride <span>↗</span></button>`;
  if (phase === 'boarded' || phase === 'ride' || phase === 'arrived') {
    const remainingM = Math.max(0, dropoffDist - distance);
    const eta = Math.max(1, Math.ceil(remainingM / 12));
    const boardedCopy = belted && !canStart
      ? 'Closing the door. Start Ride unlocks when it is shut.'
      : 'Buckle up. The door closes when everyone is buckled. Then Start Ride.';
    const rideStatus = phase === 'ride' && !paused ? 'EN ROUTE' : 'PARK';
    const kicker = phase === 'arrived' ? 'ARRIVED' : phase === 'boarded' ? 'BUCKLE UP' : 'DESTINATION';
    cabin.innerHTML = `<div class="cabin-header"><span class="cabin-status">${rideStatus}</span><span>6:42</span><span>${temperature}°</span><span>${belted ? 'BELT' : 'UNBUCKLED'}</span><span>CAM</span></div>
      <div class="cabin-grid"><div class="cabin-map">${map}</div>
      <div class="cabin-copy"><small>${kicker}</small>
      <h2>${DROPOFF.name}</h2>
      <p>${phase === 'boarded' ? boardedCopy : phase === 'arrived' ? 'In Park. Hazards on. Open the door, step out, then complete the trip in the app.' : `${eta} min · ${remainingM / 1000 > 0 ? (remainingM / 1000).toFixed(2) : '0.00'} km remaining`}</p>
      <div class="cabin-actions">${phase === 'boarded' ? `<button class="secondary" id="buckle">${belted ? 'Seatbelt fastened' : 'Fasten seatbelt'}</button><button class="primary" id="start-ride" ${canStart ? '' : 'disabled'}>Start Ride</button>` : phase === 'arrived' ? '<button class="primary" id="exit-cabin">Open door</button>' : `<button class="secondary" id="pause">${paused ? 'Resume ride' : 'Pull over'}</button>`}</div>
      </div></div>
      <div class="cabin-bottom">
        <button id="temp-down" aria-label="Lower cabin temperature">−</button><b>${temperature}°</b><button id="temp-up" aria-label="Raise cabin temperature">+</button>
        <span>AUTO</span>
        <button id="music">${muted ? 'Sound off' : 'Media'}</button>
        <button id="support" class="ghost">Support</button>
      </div>`;
  }
  const fasten = () => { if (!belted) { belted = true; renderUI(); } };
  const tryStart = () => {
    if (phase !== 'boarded' || !belted || door > 0.08) return;
    startAudio();
    cam = 'chase';
    mapOverview = false;
    paused = false;
    blockedFor = 0;
    setPhase('ride');
  };
  bind('request', () => {
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
  bind('cancel', () => { cam = 'walk'; distance = stageDist; setPhase('explore'); });
  bind('enter', () => {
    lookYaw = cab.group.rotation.y;
    lookPitch = 0.08;
    cam = 'cabin';
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
    hold = 0; blockedFor = 0; curbState = 0;
    walk = pickup.position.clone().add(curbShift(pickupDist, 1.8));
    walk.y = ROAD_Y + 1.62;
    const again = project(CAPITOL.lon, CAPITOL.lat).sub(walk);
    lookYaw = Math.atan2(-again.x, -again.z);
    lookPitch = -0.11;
    setPhase('explore');
  });
  bind('pause', () => { paused = !paused; renderUI(); });
  bind('temp-down', () => { temperature = Math.max(16, temperature - 1); renderUI(); });
  bind('temp-up', () => { temperature = Math.min(28, temperature + 1); renderUI(); });
  bind('music', () => { muted = !muted; if (gain) gain.gain.value = muted ? 0 : 0.018; renderUI(); });
  bind('center-map', () => { mapOverview = !mapOverview; renderUI(); });
  bind('support', () => toast('Simulated support only. This does not contact Tesla or emergency services.'));
}

function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener('click', fn);
}

let audio: AudioContext | undefined;
let gain: GainNode | undefined;
function startAudio() {
  if (audio) return;
  audio = new AudioContext();
  gain = audio.createGain();
  gain.gain.value = 0.018;
  gain.connect(audio.destination);
  [110, 164.81, 220].forEach(f => {
    const o = audio!.createOscillator();
    o.frequency.value = f;
    o.connect(gain!);
    o.start();
  });
}

let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; });
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
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'p') { phoneVisible = !phoneVisible; renderUI(); }
  if (e.key.toLowerCase() === 'c') {
    cam = cam === 'chase' ? (phase === 'boarded' || phase === 'ride' || phase === 'arrived' ? 'cabin' : 'walk') : 'chase';
    toast(cam === 'chase' ? 'Chase camera' : cam === 'cabin' ? 'Cabin camera' : 'Walk camera');
  }
  if (e.key.toLowerCase() === 'f') {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
function applyQuality(next: Quality, announce = true) {
  const heavy = next === 'cinematic' || next === 'ultra';
  quality = softwareGl && heavy ? 'performance' : next;
  const perf = quality === 'performance';
  const ultra = quality === 'ultra';
  const cine = quality === 'cinematic' || ultra;
  const ratio = perf ? 1 : Math.min(devicePixelRatio, ultra ? 1.75 : cine ? 1.5 : 1.25);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(ratio);
  composer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !perf;
  sun.castShadow = !perf;
  sun.shadow.mapSize.set(ultra ? 4096 : cine ? 2048 : 1024, ultra ? 4096 : cine ? 2048 : 1024);
  sun.shadow.radius = ultra ? 8 : cine ? 4 : 2.5;
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (ssaoPass) ssaoPass.enabled = cine;
  bloomPass.threshold = 0.96;
  bloomPass.strength = perf ? 0.04 : ultra ? 0.16 : cine ? 0.12 : 0.08;
  bloomPass.radius = ultra ? 0.42 : 0.32;
  smaaPass.enabled = !perf;
  scene.environmentIntensity = ultra ? 1.25 : perf ? 0.9 : 1.15;
  const label = ultra ? 'Ultra graphics' : cine ? 'Cinematic graphics' : perf ? 'Performance graphics' : 'Balanced graphics';
  if (announce) toast(label);
}
bind('settings', () => {
  const order: Quality[] = ['balanced', 'cinematic', 'ultra', 'performance'];
  applyQuality(order[(order.indexOf(quality) + 1) % order.length]);
});

const chaseOffset = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const desiredCam = new THREE.Vector3();
const localCam = new THREE.Vector3();
const invQuat = new THREE.Quaternion();

let holdCam = false;

function updateCamera(dt: number) {
  if (holdCam) return;
  const view = cam;
  switch (view) {
    case 'cabin': {
      // Centered in the seat, ahead of the headrest, aimed through the screen at the road.
      const eye = new THREE.Vector3(0.0, 0.92, 0.12);
      const look = new THREE.Vector3(0.0, 0.86, -2.0);
      eye.applyMatrix4(cab.group.matrixWorld);
      look.applyMatrix4(cab.group.matrixWorld);
      camera.position.copy(eye);
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      const yawOff = (lookYaw - cab.group.rotation.y) * 0.35;
      const pitchOff = lookPitch - 0.08;
      camera.rotateY(yawOff);
      camera.rotateX(pitchOff);
      break;
    }
    case 'chase': {
      const face = phase === 'dispatch' || phase === 'pickup';
      if (face) chaseOffset.set(4.6, 2.05, -3.4);
      else chaseOffset.set(Math.sin(orbitYaw) * 3.1 + 2.4, 2.7 + orbitPitch * 1.2, 7.5);
      chaseOffset.y = Math.max(1.7, chaseOffset.y);
      desiredCam.copy(chaseOffset).applyQuaternion(cab.group.quaternion).add(cab.group.position);
      const snap = camera.position.distanceTo(desiredCam) > 3.2 || camera.position.distanceTo(cab.group.position) < cab.cameraClearance;
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
      const movement = new THREE.Vector3(Number(keys.has('d')) - Number(keys.has('a')), 0, Number(keys.has('s')) - Number(keys.has('w')));
      if (movement.lengthSq() > 0) {
        movement.applyAxisAngle(new THREE.Vector3(0, 1, 0), lookYaw).multiplyScalar(dt * 4.4);
        walk.add(movement);
        walk.y = ROAD_Y + 1.62;
      }
      camera.position.lerp(walk, 1 - Math.exp(-dt * 6));
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
}
function update(dt: number) {
  elapsed += dt;
  world.update(dt);
  const walking = keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d');
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
    if (!paused && remaining > 18 && traffic.stop && blockedFor < 5) {
      const vStop = Math.sqrt(Math.max(0, 2 * 3.4 * Math.max(0, traffic.stopDist - 3.5)));
      want = Math.min(want, vStop);
      if (want < 0.45) blockedFor += dt;
    } else if (!traffic.stop) blockedFor = Math.max(0, blockedFor - dt);
    if (!paused && blockedFor >= 5 && remaining > 18) want = Math.max(want, 3.4);
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
  const wantDoor = (phase === 'pickup' && elapsed > 0.35) || (phase === 'boarded' && !belted) || ((phase === 'arrived' || phase === 'exited') && doorRequested) ? 1 : 0;
  door = THREE.MathUtils.damp(door, wantDoor, 3.2, dt);
  cab.setDoor(door, 1);
  cab.update(dt, speedMps, camera.position.distanceTo(cab.group.position));
  cab.group.updateMatrixWorld();
  updateCamera(dt);
  sun.position.copy(cab.group.position).add(sunPosition.clone().normalize().multiplyScalar(280));
  sun.target.position.copy(cab.group.position);
  const span = Math.max(1, dropoffDist - pickupDist);
  document.querySelector<HTMLElement>('#progress-fill')!.style.width = `${THREE.MathUtils.clamp((distance - pickupDist) / span, 0, 1) * 100}%`;
  document.querySelector('#speed')!.textContent = String(Math.round(speedMps * 2.237)).padStart(2, '0');
  document.querySelector('#gear')!.textContent = phase === 'ride' && !paused && speedMps > 0.2 ? 'D' : 'P';
}

let uiTimer = 0;
let frame = 0;
function animate(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  update(dt);
  uiTimer += dt;
  if (phase === 'ride' && uiTimer > 2) { renderUI(); uiTimer = 0; }
  frame += 1;
  renderer.shadowMap.needsUpdate = frame % 2 === 0;
  composer.render();
  requestAnimationFrame(animate);
}
camera.position.copy(walk);
camera.rotation.order = 'YXZ';
camera.rotation.set(lookPitch, lookYaw, 0);

function mountCab(loaded: Cybercab) {
  cab = loaded;
  scene.add(cab.group);
  cab.group.position.copy(sample(stageDist).position);
  cab.group.position.y = ROAD_Y;
  cab.group.rotation.y = sample(stageDist).heading;
  uiReady = true;
  renderUI();
  requestAnimationFrame(animate);
  Object.assign(window, {
    render_game_to_text: () => JSON.stringify({
      phase, belted, distance, totalDistance: dropoffDist - pickupDist, paused, temperature, door,
      megalamp: MEGALAMP.name, plate: VEHICLE_PLATE, camera: cam,
      geofence: pointInRing(PICKUP.lon, PICKUP.lat, AUSTIN_ROBOTAXI_GEOFENCE),
      position: camera.position.toArray(),
      coordinates: 'meters; origin -97.745,30.264; X east, Y up, Z south',
      vehicle: cab.group.position.toArray(),
      cameraGap: Number(camera.position.distanceTo(cab.group.position).toFixed(2)),
      speedMph: Math.round(speedMps * 2.23694),
    }),
    advanceTime: (ms: number) => {
      for (let t = 0; t < ms; t += 16.667) update(Math.min(16.667, ms - t) / 1000);
      renderUI();
      composer.render();
    },
    frameVehicle: (eye: number[], look: number[]) => {
      holdCam = true;
      camera.position.copy(new THREE.Vector3(eye[0], eye[1], eye[2]).applyMatrix4(cab.group.matrixWorld));
      camera.lookAt(new THREE.Vector3(look[0], look[1], look[2]).applyMatrix4(cab.group.matrixWorld));
      composer.render();
    },
    releaseCamera: () => { holdCam = false; },
  });
}

void Promise.all([
  loadCybercab(),
  new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}textures/evening_road_01_puresky_1k.hdr`).then((hdri) => {
    hdri.mapping = THREE.EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(hdri).texture;
    hdri.dispose();
    scene.environment = env;
  }),
]).then(([loaded]) => mountCab(loaded)).catch((error) => {
  console.error(error);
  toast('The Cybercab model did not load.');
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

