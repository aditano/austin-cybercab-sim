import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { createWorld } from './world';
import { createCybercab } from './vehicle';
import { createCityLife } from './life';
import {
  AUSTIN_ROBOTAXI_GEOFENCE, CONGRESS_ROUTE, DROPOFF, GEOFENCE_NOTE, MEGALAMP,
  PICKUP, ROAD_Y, STOP_INSET, VEHICLE_LABEL, VEHICLE_PLATE, measurePath, pointInRing, project, samplePath,
} from './geo';
import './style.css';

type Phase = 'explore' | 'dispatch' | 'pickup' | 'boarded' | 'ride' | 'arrived' | 'exited' | 'complete';
type Cam = 'walk' | 'chase' | 'cabin';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<canvas id="scene"></canvas><div class="vignette"></div>
<header><a class="brand" href="./"><span class="brand-icon">C</span> CYBERCAB <span class="brand-sub">AUSTIN EXPERIENCE</span></a><div class="live"><i></i> AUSTIN, TX <span>SERVICE AREA · ~288 MI²</span></div><button id="settings" class="round" aria-label="Toggle graphics quality">◈</button></header>
<aside class="chapter"><span class="eyebrow">THE CITY IS YOURS</span><h1>A different<br>way to move.</h1><p>Golden hour. Downtown Austin.<br>Match the Megalamp. Ride autonomously.</p><div class="chapter-line"></div><span class="small-label">01 / REQUEST YOUR RIDE</span></aside>
<div class="location"><span class="location-dot">⌖</span><div><b id="location-name">Congress Avenue</b><span id="location-detail">DOWNTOWN · INSIDE SERVICE AREA</span></div></div>
<div class="hud"><div class="speedo"><b id="speed">00</b><small>MPH</small><span id="gear">P</span></div></div>
<aside id="phone" class="phone"><div class="phone-top"><b>6:42</b><div class="island"></div><span>▥ ▰</span></div><div class="phone-content"><div class="app-brand">ROBOTAXI <span>✦</span></div><div id="phone-body"></div></div><div class="home-bar"></div></aside>
<section id="cabin" class="cabin-panel" hidden></section>
<div id="toast" role="status"></div>
<footer><div class="controls"><span><kbd>DRAG</kbd> Look</span><span><kbd>W A S D</kbd> Walk</span><span><kbd>C</kbd> Camera</span><span><kbd>P</kbd> Phone</span><span><kbd>F</kbd> Fullscreen</span></div><div class="concept">INDEPENDENT CONCEPT SIMULATION <span>·</span> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a><a href="./docs.html" target="_blank">Sources & accuracy ↗</a></div></footer>
<div class="ride-progress"><div id="progress-fill"></div></div>`;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c5d0d6');
scene.fog = new THREE.FogExp2('#b9c6cc', 0.00055);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 2500);

const sky = new Sky();
sky.scale.setScalar(45000);
const su = sky.material.uniforms;
su.turbidity.value = 2.4;
su.rayleigh.value = 1.05;
su.mieCoefficient.value = 0.005;
su.mieDirectionalG.value = 0.82;
const sunPosition = new THREE.Vector3(-0.72, 0.38, 0.28);
su.sunPosition.value.copy(sunPosition);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(sky as unknown as THREE.Scene, 0.03).texture;
scene.environmentIntensity = 0.72;

scene.add(new THREE.HemisphereLight('#dce9f5', '#8d7a64', 0.32));
const sun = new THREE.DirectionalLight('#ffe6c4', 3.6);
sun.position.copy(sunPosition).normalize().multiplyScalar(280);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -140;
sun.shadow.camera.right = 140;
sun.shadow.camera.top = 140;
sun.shadow.camera.bottom = -140;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);

const world = createWorld(scene);
const cab = createCybercab();
scene.add(cab.group);

const laneOffset = new THREE.Vector3(4.7, ROAD_Y, 1.5);
let route = CONGRESS_ROUTE.map(([lon, lat]) => project(lon, lat).add(laneOffset));
let { cumulative, length: routeLength } = measurePath(route);
const sample = (d: number) => samplePath(route, cumulative, d);
function curbShift(d: number, meters = 2.05) {
  const p = sample(d);
  const across = new THREE.Vector3(Math.cos(p.heading), 0, -Math.sin(p.heading));
  return across.multiplyScalar(meters);
}
const pickupDist = STOP_INSET;
const dropoffDist = Math.max(pickupDist + 40, routeLength - STOP_INSET);

const pickupPad = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 3.3, 48),
  new THREE.MeshStandardMaterial({ color: 0xe6c25a, emissive: 0xc9a24a, emissiveIntensity: 0.35, roughness: 0.55, side: THREE.DoubleSide }),
);
pickupPad.rotation.x = -Math.PI / 2;
pickupPad.position.copy(sample(pickupDist).position).add(curbShift(pickupDist, 2.1)).setY(ROAD_Y + 0.02);
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
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), softwareGl ? 0.08 : 0.16, 0.4, 0.9);
composer.addPass(bloomPass);
const smaaPass = new SMAAPass();
smaaPass.enabled = !softwareGl;
composer.addPass(smaaPass);
composer.addPass(new OutputPass());

let phase: Phase = 'explore';
let belted = false;
let elapsed = 0;
let distance = 22;
let door = 0;
let temperature = 21;
let muted = false;
let phoneVisible = true;
let paused = false;
let lowQuality = false;
let speedMps = 0;
let cam: Cam = 'walk';
let mapOverview = true;
let doorRequested = false;
const pickup = sample(pickupDist);
cab.group.position.copy(pickup.position).add(curbShift(pickupDist));
cab.group.rotation.y = pickup.heading;

let walk = pickup.position.clone().add(curbShift(pickupDist, 6.5)).add(new THREE.Vector3(0, 1.54, 0));
let yaw = 0.65;
let pitch = -0.04;
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

fetch(`${import.meta.env.BASE_URL}data/austin.json`).then(r => r.json()).then(data => {
  const path = (coords: number[][]) => coords.map(([lon, lat], i) => {
    const [x, y] = mapPoint(project(lon, lat));
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  mapFeatures = data.buildings.map((b: { coordinates: number[][] }) => `<path d="${path(b.coordinates)}Z" fill="#d4ddd0"/>`).join('')
    + data.roads.map((r: { coordinates: number[][] }) => `<path d="${path(r.coordinates)}" fill="none" stroke="#f7f8f4" stroke-width="3"/>`).join('');
  renderUI();
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
  cab.setLamp(match ? 'match' : phase === 'ride' ? 'idle' : 'match');
  if (phase === 'explore') cab.setLamp('idle');
  cab.setHazards(phase === 'pickup' || phase === 'arrived' || phase === 'exited');
}

function renderUI() {
  lampForPhase();
  document.querySelector('#location-name')!.textContent = phase === 'complete' || phase === 'arrived' || phase === 'exited' ? DROPOFF.name : PICKUP.name;
  const chapter = document.querySelector<HTMLElement>('.chapter')!;
  chapter.style.display = phase === 'explore' ? 'block' : 'none';
  phone.hidden = !phoneVisible || phase === 'ride';
  cabin.hidden = phase !== 'ride' && phase !== 'boarded' && phase !== 'arrived';
  const map = mapMarkup((distance - pickupDist) / Math.max(1, dropoffDist - pickupDist));
  const inside = pointInRing(PICKUP.lon, PICKUP.lat, AUSTIN_ROBOTAXI_GEOFENCE) && pointInRing(DROPOFF.lon, DROPOFF.lat, AUSTIN_ROBOTAXI_GEOFENCE);
  if (phase === 'explore') body.innerHTML = `<h2>Where to?</h2><p class="phone-sub">Choose a destination within the Austin service area.</p>${map}
    <div class="route-card"><div class="route-row"><i class="dot"></i><div><small>PICKUP</small><b>${PICKUP.name}</b></div><span class="chip in">In area</span></div>
    <div class="route-row"><i class="square"></i><div><small>DESTINATION</small><b>${DROPOFF.name}</b></div><span class="chip ${inside ? 'in' : 'out'}">${inside ? 'In area' : 'Outside'}</span></div></div>
    <div class="fare"><span>Cybercab <small>2 seats · Simulated fare</small></span><b>~3 min<small>Est. wait 2 min</small></b></div>
    <p class="geo-note">${GEOFENCE_NOTE}</p>
    <button class="primary" id="request" ${inside ? '' : 'disabled'}>Confirm ride <span>↗</span></button>
    <p class="micro">Independent recreation. No real booking, fare, or Tesla connection. Hours simulated 6:00–23:00.</p>`;
  if (phase === 'dispatch') body.innerHTML = `<h2>Your Cybercab is on the way.</h2><p class="phone-sub">Match both the Megalamp color and the plate before boarding.</p>${map}
    <div class="vehicle-card"><span class="car-line megalamp-swatch" style="color:${MEGALAMP.hex}">▰</span><b>${VEHICLE_LABEL}</b><small>MEGALAMP · ${MEGALAMP.name.toUpperCase()} · PLATE ${VEHICLE_PLATE}</small></div>
    <div class="pickup-info"><span class="lamp-chip" style="background:${MEGALAMP.hex}"></span><div><b>Look for ${MEGALAMP.name}</b><small>Front Megalamp matches this color · TX ${VEHICLE_PLATE}</small></div></div>
    <button class="secondary" id="cancel">Cancel request</button>`;
  if (phase === 'pickup') body.innerHTML = `<h2>Your Cybercab has arrived.</h2><p class="phone-sub">Hazards flash while parked. Confirm the ${MEGALAMP.name} Megalamp and plate ${VEHICLE_PLATE}. Your door opens when your phone is detected.</p>${map}
    <div class="vehicle-card"><span class="car-line megalamp-swatch" style="color:${MEGALAMP.hex}">▰</span><b>Welcome aboard.</b><small>${VEHICLE_LABEL}</small></div>
    <button class="primary" id="enter">Enter Cybercab <span>→</span></button>`;
  if (phase === 'boarded') body.innerHTML = `<h2>Buckle up to continue.</h2><p class="phone-sub">Your door closes automatically when everyone is buckled. Then tap Start Ride here or on the cabin screen.</p>
    <button class="secondary" id="buckle-phone">${belted ? '✓ Seatbelt fastened' : 'Fasten seatbelt'}</button>
    <button class="primary" id="start-phone" ${belted && door < 0.08 ? '' : 'disabled'}>${belted && door >= 0.08 ? 'Closing door…' : 'Start Ride'}</button>`;
  if (phase === 'arrived') body.innerHTML = `<h2>You’ve arrived.</h2><p class="phone-sub">${DROPOFF.name}. Your Cybercab is in Park with hazard lights on.</p>${map}
    <button class="primary" id="exit-phone">Open door</button>`;
  if (phase === 'exited') body.innerHTML = `<h2>Ready to finish?</h2><p class="phone-sub">Once you’re safely out, complete the trip in the app. The doors close after that.</p>${map}
    <button class="primary" id="finish">Complete trip</button>`;
  if (phase === 'complete') body.innerHTML = `<div class="complete-icon">✓</div><h2>Trip complete.</h2><p class="phone-sub">Thanks for riding. Check that you have all your belongings.</p>${map}
    <div class="trip-summary"><span>Distance<b>${((dropoffDist - pickupDist) / 1000).toFixed(2)} km</b></span><span>Megalamp<b>${MEGALAMP.name}</b></span></div>
    <button class="primary" id="restart">Take another ride <span>↗</span></button>`;
  if (phase === 'boarded' || phase === 'ride' || phase === 'arrived') {
    const eta = Math.max(1, Math.ceil((routeLength - distance) / 11));
    cabin.innerHTML = `<div class="cabin-header"><span>CYBERCAB</span><span>6:42 PM <i>☀</i> 28° · 🔒 · CAM</span></div>
      <div class="cabin-grid"><div class="cabin-map">${map}</div>
      <div class="cabin-copy"><small>${phase === 'arrived' ? 'YOU HAVE ARRIVED' : 'YOUR DESTINATION'}</small>
      <h2>${DROPOFF.name}</h2>
      <p>${phase === 'boarded' ? (belted && door >= 0.08 ? 'Closing door…' : 'Buckle up. Your door closes when everyone is buckled. Then Start Ride.') : phase === 'arrived' ? 'Vehicle is in Park. Touch Open, then complete the trip in the Robotaxi app.' : `${eta} min · ${Math.max(0, (dropoffDist - distance) / 1000).toFixed(2)} km remaining`}</p>
      ${phase === 'boarded' ? `<button class="secondary" id="buckle">${belted ? '✓ Seatbelt fastened' : 'Fasten seatbelt'}</button><button class="primary" id="start-ride" ${belted && door < 0.08 ? '' : 'disabled'}>Start Ride →</button>` : phase === 'arrived' ? '<button class="primary" id="exit-cabin">Open door & exit →</button>' : `<button class="secondary" id="pause">${paused ? 'Resume ride' : 'Pull over / pause'}</button>`}
      </div></div>
      <div class="cabin-bottom">
        <button id="temp-down" aria-label="Lower cabin temperature">−</button><b>${temperature}°</b><button id="temp-up" aria-label="Raise cabin temperature">+</button>
        <span>AUTO</span>
        <button id="music">${muted ? '♫ Sound off' : '♫ Media'}</button>
        <button id="support" class="ghost">Support</button>
        <span class="cabin-status">${phase === 'ride' ? '● AUTONOMOUS' : '● PARK'}</span>
      </div>`;
  }
  bind('request', () => {
    const behind = sample(Math.max(2, pickupDist - 48)).position;
    cab.group.position.copy(behind);
    distance = Math.max(2, pickupDist - 48);
    setPhase('dispatch');
    cam = 'chase';
  });
  bind('cancel', () => { cam = 'walk'; setPhase('explore'); });
  bind('enter', () => { yaw = 0.65; pitch = 0; cam = 'cabin'; doorRequested = true; setPhase('boarded'); });
  bind('buckle', () => { belted = !belted; renderUI(); });
  bind('buckle-phone', () => { belted = !belted; renderUI(); });
  bind('start-ride', () => {
    if (!belted || door > 0.08) return;
    startAudio();
    cam = 'chase';
    mapOverview = false;
    setPhase('ride');
  });
  bind('start-phone', () => document.getElementById('start-ride')?.click());
  const leaveCabin = () => {
    doorRequested = true;
    walk = cab.group.position.clone().add(curbShift(distance || dropoffDist, 6.4)).setY(ROAD_Y + 1.54);
    yaw = 0.7; pitch = -0.04; phoneVisible = true; cam = 'walk'; setPhase('exited');
  };
  bind('exit-phone', leaveCabin);
  bind('exit-cabin', leaveCabin);
  bind('finish', () => { doorRequested = false; setPhase('complete'); });
  bind('restart', () => {
    distance = pickupDist; speedMps = 0; paused = false; belted = false; cam = 'walk'; doorRequested = false; mapOverview = true;
    walk = pickup.position.clone().add(curbShift(pickupDist, 6.5)).setY(ROAD_Y + 1.54);
    yaw = 0.65; pitch = -0.04; setPhase('explore');
  });
  bind('pause', () => { paused = !paused; renderUI(); });
  bind('temp-down', () => { temperature = Math.max(16, temperature - 1); renderUI(); });
  bind('temp-up', () => { temperature = Math.min(28, temperature + 1); renderUI(); });
  bind('music', () => { muted = !muted; if (gain) gain.gain.value = muted ? 0 : 0.018; renderUI(); });
  bind('center-map', () => { mapOverview = !mapOverview; renderUI(); });
  bind('support', () => toast('Simulated support only — this does not contact Tesla or emergency services.'));
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
  yaw -= (e.clientX - lx) * 0.003;
  pitch = THREE.MathUtils.clamp(pitch - (e.clientY - ly) * 0.003, -1, 1);
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
bind('settings', () => {
  lowQuality = !lowQuality;
  const ratio = lowQuality || softwareGl ? 1 : Math.min(devicePixelRatio, 1.75);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(ratio);
  composer.setSize(innerWidth, innerHeight);
  sun.castShadow = !(lowQuality || softwareGl);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (ssaoPass) ssaoPass.enabled = !lowQuality && !softwareGl;
  bloomPass.strength = lowQuality || softwareGl ? 0.06 : 0.16;
  smaaPass.enabled = !(lowQuality || softwareGl);
  toast(lowQuality ? 'Performance graphics enabled' : 'Cinematic graphics enabled');
});

const chaseOffset = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCamera(dt: number) {
  const view = cam;
  switch (view) {
    case 'cabin': {
      const local = new THREE.Vector3(0.32, 1.18, 0.38);
      local.applyMatrix4(cab.group.matrixWorld);
      camera.position.copy(local);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, cab.group.rotation.y + (yaw - 0.65) * 0.5, 0);
      break;
    }
    case 'chase': {
      chaseOffset.set(Math.sin(yaw - 0.65) * 1.4, 2.15 + pitch * -0.8, 7.4);
      chaseOffset.applyQuaternion(cab.group.quaternion);
      camera.position.lerp(cab.group.position.clone().add(chaseOffset), 1 - Math.exp(-dt * 4));
      lookTarget.copy(cab.group.position).add(new THREE.Vector3(0, 1.05, 0));
      camera.lookAt(lookTarget);
      break;
    }
    case 'walk': {
      const movement = new THREE.Vector3(Number(keys.has('d')) - Number(keys.has('a')), 0, Number(keys.has('s')) - Number(keys.has('w')));
      movement.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(dt * 5);
      walk.add(movement);
      camera.position.lerp(walk, 1 - Math.exp(-dt * 5));
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
      break;
    }
    default: {
      const _never: never = view;
      return _never;
    }
  }
}

let cruise = 0;
function placeCab(d: number, curb = 0) {
  const p = sample(d);
  cab.group.position.copy(p.position);
  if (curb) cab.group.position.add(curbShift(d, curb));
  cab.group.rotation.y = p.heading;
}
function update(dt: number) {
  elapsed += dt;
  world.update(dt);
  const traffic = life.update(dt, distance, cruise);
  if (phase === 'dispatch') {
    const target = sample(pickupDist).position.clone().add(curbShift(pickupDist));
    const to = target.clone().sub(cab.group.position);
    const dist = to.length();
    if (dist > 0.45) {
      to.normalize();
      speedMps = Math.min(10, dist * 0.4);
      cab.group.position.addScaledVector(to, speedMps * dt);
      cab.group.rotation.y = Math.atan2(-to.x, -to.z);
      distance = pickupDist - dist;
    } else {
      placeCab(pickupDist, 2.05);
      speedMps = 0;
      distance = pickupDist;
      if (elapsed > 1.8) setPhase('pickup');
    }
  }
  if (phase === 'explore') placeCab(pickupDist, 2.05);
  if (phase !== 'ride' && phase !== 'dispatch') { speedMps = 0; }
  if (phase === 'ride') {
    const remaining = dropoffDist - distance;
    let want = paused ? 0 : Math.min(11.5, elapsed * 1.8, remaining * 0.5 + 1.1);
    if (!paused && traffic.stop) {
      const vStop = Math.sqrt(Math.max(0, 2 * 2.5 * Math.max(0, traffic.stopDist - 2)));
      want = Math.min(want, vStop);
    }
    const accel = paused || want < cruise ? 6 : 2.0;
    cruise += THREE.MathUtils.clamp(want - cruise, -accel * dt, accel * dt);
    if (want < 0.05 && cruise < 0.12) cruise = 0;
    speedMps = cruise;
    if (door < 0.02) distance = Math.min(dropoffDist, distance + speedMps * dt);
    const curb = THREE.MathUtils.smoothstep(distance, dropoffDist - 16, dropoffDist - 2) * 2.05;
    placeCab(distance, curb);
    if (distance >= dropoffDist - 0.08) { phoneVisible = true; cam = 'chase'; cruise = 0; speedMps = 0; setPhase('arrived'); }
  }
  const nearCab = camera.position.distanceTo(cab.group.position) < 5.2;
  const wantDoor = (phase === 'pickup' && (elapsed > 1.1 || nearCab)) || (phase === 'boarded' && !belted) || ((phase === 'arrived' || phase === 'exited') && doorRequested) ? 1 : 0;
  door = THREE.MathUtils.damp(door, wantDoor, 3.2, dt);
  cab.setDoor(door, 1);
  cab.update(dt, speedMps);
  cab.group.updateMatrixWorld();
  updateCamera(dt);
  sun.position.copy(cab.group.position).add(sunPosition.clone().normalize().multiplyScalar(280));
  sun.target.position.copy(cab.group.position);
  renderer.shadowMap.needsUpdate = true;
  const span = Math.max(1, dropoffDist - pickupDist);
  document.querySelector<HTMLElement>('#progress-fill')!.style.width = `${THREE.MathUtils.clamp((distance - pickupDist) / span, 0, 1) * 100}%`;
  document.querySelector('#speed')!.textContent = String(Math.round(speedMps * 2.237)).padStart(2, '0');
  document.querySelector('#gear')!.textContent = phase === 'ride' && !paused && speedMps > 0.2 ? 'D' : 'P';
}

let uiTimer = 0;
function animate(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  uiTimer += dt;
    if (phase === 'ride' && uiTimer > 2) { renderUI(); uiTimer = 0; }
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  requestAnimationFrame(animate);
}
renderUI();
camera.position.copy(walk);
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

Object.assign(window, {
  render_game_to_text: () => JSON.stringify({
    phase, belted, distance, totalDistance: dropoffDist - pickupDist, paused, temperature, door,
    megalamp: MEGALAMP.name, plate: VEHICLE_PLATE, camera: cam,
    geofence: pointInRing(PICKUP.lon, PICKUP.lat, AUSTIN_ROBOTAXI_GEOFENCE),
    position: camera.position.toArray(),
    coordinates: 'meters; origin -97.745,30.264; X east, Y up, Z south',
    vehicle: cab.group.position.toArray(),
  }),
  advanceTime: (ms: number) => {
    for (let t = 0; t < ms; t += 16.667) update(Math.min(16.667, ms - t) / 1000);
    renderUI();
    composer.render();
  },
});
