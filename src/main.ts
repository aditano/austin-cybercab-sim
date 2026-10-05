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
  PICKUP, VEHICLE_LABEL, VEHICLE_PLATE, measurePath, pointInRing, project, samplePath,
} from './geo';
import './style.css';

type Phase = 'explore' | 'dispatch' | 'pickup' | 'boarded' | 'ride' | 'arrived' | 'complete';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c5d0d6');
scene.fog = new THREE.FogExp2('#b9c6cc', 0.00055);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 6000);

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
scene.environmentIntensity = 1.15;

scene.add(new THREE.HemisphereLight('#dce9f5', '#8d7a64', 0.85));
const sun = new THREE.DirectionalLight('#ffe6c4', 4.2);
sun.position.set(-180, 210, 140);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -140;
sun.shadow.camera.right = 140;
sun.shadow.camera.top = 140;
sun.shadow.camera.bottom = -140;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.DirectionalLight('#9bb8c9', 0.55);
fill.position.set(80, 40, -60);
scene.add(fill);

const world = createWorld(scene);
const cab = createCybercab();
scene.add(cab.group);

const laneOffset = new THREE.Vector3(4.7, 0, 1.5);
let route = CONGRESS_ROUTE.map(([lon, lat]) => project(lon, lat).add(laneOffset));
let { cumulative, length: routeLength } = measurePath(route);
const sample = (d: number) => samplePath(route, cumulative, d);

const pickupPad = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 3.3, 48),
  new THREE.MeshStandardMaterial({ color: 0xe6c25a, emissive: 0xc9a24a, emissiveIntensity: 0.35, roughness: 0.55, side: THREE.DoubleSide }),
);
pickupPad.rotation.x = -Math.PI / 2;
pickupPad.position.copy(sample(0).position).setY(0.14);
scene.add(pickupPad);
const padGlow = new THREE.Mesh(
  new THREE.CircleGeometry(2.3, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd56a, transparent: true, opacity: 0.12 }),
);
padGlow.rotation.x = -Math.PI / 2;
padGlow.position.copy(pickupPad.position);
scene.add(padGlow);

const life = createCityLife(scene, route, cumulative, routeLength);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssaoPass = new SSAOPass(scene, camera, innerWidth, innerHeight, 16);
ssaoPass.kernelRadius = 12;
ssaoPass.minDistance = 0.004;
ssaoPass.maxDistance = 0.12;
composer.addPass(ssaoPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.45, 0.88);
composer.addPass(bloomPass);
const smaaPass = new SMAAPass();
composer.addPass(smaaPass);
composer.addPass(new OutputPass());

let phase: Phase = 'explore';
let belted = false;
let elapsed = 0;
let distance = 0;
let door = 0;
let temperature = 21;
let muted = false;
let phoneVisible = true;
let paused = false;
let lowQuality = false;
let speedMps = 0;
let cam: Cam = 'walk';
const pickup = sample(0);
cab.group.position.copy(pickup.position);
cab.group.rotation.y = pickup.heading;

let walk = pickup.position.clone().add(new THREE.Vector3(7, 1.7, 7));
let yaw = 0.65;
let pitch = -0.04;
let last = performance.now();
const keys = new Set<string>();
const phone = document.querySelector<HTMLElement>('#phone')!;
const body = document.querySelector<HTMLElement>('#phone-body')!;
const cabin = document.querySelector<HTMLElement>('#cabin')!;
let mapFeatures = '';
const mapPoint = (v: THREE.Vector3) => [140 + (v.x - 165) * 0.29, 122 + (v.z + 300) * 0.29];

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
    const [x, y] = mapPoint(project(lon, lat));
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + 'Z';
}

function mapMarkup(progress = 0) {
  const line = route.map((v, i) => {
    const [x, y] = mapPoint(v);
    return `${i ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
  const [px, py] = mapPoint(sample(progress * routeLength).position);
  const [ex, ey] = mapPoint(route[route.length - 1]);
  return `<div class="map"><svg viewBox="0 0 280 245"><rect width="280" height="245" fill="#e6ebe3"/>
    <path d="${geofencePath()}" fill="#3d6b5222" stroke="#2f5a44" stroke-width="1.2" stroke-dasharray="4 3"/>
    ${mapFeatures}<path d="${line}" stroke="#283d2e" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="${ex}" cy="${ey}" r="7" fill="#283d2e" stroke="white" stroke-width="3"/>
    <circle cx="${px}" cy="${py}" r="8" fill="${MEGALAMP.hex}" stroke="white" stroke-width="3"/>
    <text x="18" y="22">SERVICE AREA</text><text x="25" y="232">CONGRESS AVENUE</text></svg>
    <span class="map-pin">AUSTIN · N ↑</span>
    <button class="map-expand" aria-label="Center map" id="center-map">⌖</button></div>`;
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
  if (phase === 'pickup' || phase === 'dispatch') cab.setLamp('match');
  else if (phase === 'arrived' || phase === 'complete') cab.setLamp('hazard');
  else if (phase === 'boarded') cab.setLamp(belted ? 'idle' : 'match');
  else cab.setLamp('idle');
}

function renderUI() {
  lampForPhase();
  document.querySelector('#location-name')!.textContent = phase === 'complete' || phase === 'arrived' ? DROPOFF.name : PICKUP.name;
  const chapter = document.querySelector<HTMLElement>('.chapter')!;
  chapter.style.display = phase === 'explore' ? 'block' : 'none';
  phone.hidden = !phoneVisible || phase === 'ride' || phase === 'boarded';
  cabin.hidden = phase !== 'ride' && phase !== 'boarded' && phase !== 'arrived';
  const map = mapMarkup(distance / routeLength);
  const inside = pointInRing(PICKUP.lon, PICKUP.lat, AUSTIN_ROBOTAXI_GEOFENCE) && pointInRing(DROPOFF.lon, DROPOFF.lat, AUSTIN_ROBOTAXI_GEOFENCE);
  if (phase === 'explore') body.innerHTML = `<h2>Where to?</h2><p class="phone-sub">Destination must be inside the displayed service area.</p>${map}
    <div class="route-card"><div class="route-row"><i class="dot"></i><div><small>PICKUP</small><b>${PICKUP.name}</b></div><span class="chip in">In area</span></div>
    <div class="route-row"><i class="square"></i><div><small>DESTINATION</small><b>${DROPOFF.name}</b></div><span class="chip ${inside ? 'in' : 'out'}">${inside ? 'In area' : 'Outside'}</span></div></div>
    <div class="fare"><span>Cybercab <small>2 seats · Simulated fare</small></span><b>~3 min<small>Est. wait 2 min</small></b></div>
    <p class="geo-note">${GEOFENCE_NOTE}</p>
    <button class="primary" id="request">Confirm ride <span>↗</span></button>
    <p class="micro">Independent recreation. No real booking, fare, or Tesla connection. Hours simulated 6:00–23:00.</p>`;
  if (phase === 'dispatch') body.innerHTML = `<h2>Your ride is on its way.</h2><p class="phone-sub">Meet Cybercab at the curb. Match the Megalamp.</p>${map}
    <div class="vehicle-card"><span class="car-line megalamp-swatch" style="color:${MEGALAMP.hex}">▰</span><b>${VEHICLE_LABEL}</b><small>MEGALAMP · ${MEGALAMP.name.toUpperCase()}</small></div>
    <div class="pickup-info"><span class="lamp-chip" style="background:${MEGALAMP.hex}"></span><div><b>Look for ${MEGALAMP.name}</b><small>Front lightbar matches this color · Plate ${VEHICLE_PLATE}</small></div></div>
    <button class="secondary" id="cancel">Cancel request</button>`;
  if (phase === 'pickup') body.innerHTML = `<h2>Your Cybercab is here.</h2><p class="phone-sub">Confirm the plate and Megalamp color. Hazard lights flash while parked. A door opens for the ride requester.</p>${map}
    <div class="vehicle-card"><span class="car-line megalamp-swatch" style="color:${MEGALAMP.hex}">▰</span><b>Welcome aboard.</b><small>${VEHICLE_LABEL} · MEGALAMP ${MEGALAMP.name.toUpperCase()}</small></div>
    <button class="primary" id="enter">Enter Cybercab <span>→</span></button>
    <p class="micro">Doors open automatically when your phone is detected. Simulated here.</p>`;
  if (phase === 'arrived') body.innerHTML = `<h2>You have arrived.</h2><p class="phone-sub">${DROPOFF.name} · Parked with hazards</p>${map}
    <div class="vehicle-card"><b>Gather your belongings.</b><small>OPEN A DOOR, THEN COMPLETE THE TRIP</small></div>
    <button class="primary" id="exit">Exit Cybercab <span>→</span></button>`;
  if (phase === 'complete') body.innerHTML = `<div class="complete-icon">✓</div><h2>Trip complete.</h2><p class="phone-sub">Doors close after you finish in the app.</p>${map}
    <div class="trip-summary"><span>Distance<b>${(routeLength / 1000).toFixed(2)} km</b></span><span>Megalamp<b>${MEGALAMP.name}</b></span></div>
    <button class="primary" id="restart">Take another ride <span>↗</span></button>`;
  if (phase === 'boarded' || phase === 'ride' || phase === 'arrived') {
    const eta = Math.max(1, Math.ceil((routeLength - distance) / 11));
    cabin.innerHTML = `<div class="cabin-header"><span>CYBERCAB</span><span>6:42 PM <i>☀</i> 28° · 🔒 · CAM</span></div>
      <div class="cabin-grid"><div class="cabin-map">${map}</div>
      <div class="cabin-copy"><small>${phase === 'arrived' ? 'YOU HAVE ARRIVED' : 'YOUR DESTINATION'}</small>
      <h2>${DROPOFF.name}</h2>
      <p>${phase === 'boarded' ? 'Buckle up. The door closes after your seat belt is fastened. Then Start Ride on this screen or in the app.' : phase === 'arrived' ? 'Vehicle is in Park. Touch Open, then complete the trip in the Robotaxi app.' : `${eta} min · ${Math.max(0, (routeLength - distance) / 1000).toFixed(2)} km remaining`}</p>
      ${phase === 'boarded' ? `<button class="secondary" id="buckle">${belted ? '✓ Seatbelt fastened' : 'Fasten seatbelt'}</button><button class="primary" id="start-ride" ${belted ? '' : 'disabled'}>Start Ride →</button>` : phase === 'arrived' ? '<button class="primary" id="exit">Open door & exit →</button>' : `<button class="secondary" id="pause">${paused ? 'Resume ride' : 'Pull over / pause'}</button>`}
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
    const behind = route[0].clone().sub(route[1]).normalize().multiplyScalar(48);
    cab.group.position.copy(sample(0).position).add(behind);
    setPhase('dispatch');
    cam = 'chase';
  });
  bind('cancel', () => { cam = 'walk'; setPhase('explore'); });
  bind('enter', () => { yaw = 0.65; pitch = 0; cam = 'cabin'; setPhase('boarded'); });
  bind('buckle', () => { belted = !belted; renderUI(); });
  bind('start-ride', () => {
    if (!belted) return;
    startAudio();
    cam = 'chase';
    setPhase('ride');
  });
  bind('exit', () => {
    walk = cab.group.position.clone().add(new THREE.Vector3(10, 1.7, 8));
    yaw = 0.7; pitch = -0.04; phoneVisible = true; cam = 'walk'; setPhase('complete');
  });
  bind('restart', () => {
    distance = 0; speedMps = 0; paused = false; belted = false; cam = 'walk';
    walk = pickup.position.clone().add(new THREE.Vector3(7, 1.7, 7));
    yaw = 0.65; pitch = -0.04; setPhase('explore');
  });
  bind('pause', () => { paused = !paused; renderUI(); });
  bind('temp-down', () => { temperature = Math.max(16, temperature - 1); renderUI(); });
  bind('temp-up', () => { temperature = Math.min(28, temperature + 1); renderUI(); });
  bind('music', () => { muted = !muted; if (gain) gain.gain.value = muted ? 0 : 0.018; renderUI(); });
  bind('center-map', () => toast('Map centered. Downtown corridor is inside the ~288 mi² service area.'));
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
  renderer.setPixelRatio(lowQuality ? 1 : Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = !lowQuality;
  ssaoPass.enabled = !lowQuality;
  bloomPass.strength = lowQuality ? 0.06 : 0.18;
  smaaPass.enabled = !lowQuality;
  sun.shadow.mapSize.set(lowQuality ? 1024 : 4096, lowQuality ? 1024 : 4096);
  toast(lowQuality ? 'Performance graphics enabled' : 'Cinematic graphics enabled');
});

const chaseOffset = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCamera(dt: number) {
  const view = cam;
  switch (view) {
    case 'cabin': {
      const local = new THREE.Vector3(0.35, 1.18, 0.35);
      local.applyMatrix4(cab.group.matrixWorld);
      camera.position.lerp(local, 1 - Math.exp(-dt * 5));
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
function update(dt: number) {
  elapsed += dt;
  world.update(dt);
  const traffic = life.update(dt, distance);
  if (phase === 'dispatch') {
    const target = sample(0).position;
    const to = target.clone().sub(cab.group.position);
    const dist = to.length();
    if (dist > 0.4) {
      to.normalize();
      speedMps = Math.min(11, dist * 0.45);
      cab.group.position.addScaledVector(to, speedMps * dt);
      cab.group.rotation.y = Math.atan2(-to.x, -to.z);
    } else {
      cab.group.position.copy(target);
      cab.group.rotation.y = sample(0).heading;
      cab.setLamp('hazard');
      if (elapsed > 2.4) setPhase('pickup');
    }
  }
  if (phase === 'explore') {
    cab.group.position.copy(sample(0).position);
    cab.group.rotation.y = sample(0).heading;
  }
  if (phase !== 'ride' && phase !== 'dispatch') { speedMps = 0; cruise = 0; }
  if (phase === 'ride' && !paused && door < 0.02) {
    const want = traffic.stop ? 0 : Math.min(12.5, elapsed * 2.2, (routeLength - distance) * 0.55 + 1.2);
    cruise = THREE.MathUtils.damp(cruise, want, 2.4, dt);
    if (traffic.stop && cruise < 0.35) cruise = 0;
    speedMps = cruise;
    distance = Math.min(routeLength, distance + speedMps * dt);
    const p = sample(distance);
    cab.group.position.copy(p.position);
    cab.group.rotation.y = p.heading;
    if (distance >= routeLength - 0.05) { phoneVisible = false; cam = 'chase'; setPhase('arrived'); }
  }
  const wantDoor = (phase === 'pickup' || phase === 'complete' || phase === 'arrived' || (phase === 'boarded' && !belted)) ? 1 : 0;
  door = THREE.MathUtils.damp(door, wantDoor, 3, dt);
  cab.setDoor(door);
  cab.update(dt, speedMps);
  cab.group.updateMatrixWorld();
  updateCamera(dt);
  sun.position.copy(cab.group.position).add(new THREE.Vector3(-180, 210, 140));
  sun.target.position.copy(cab.group.position);
  document.querySelector<HTMLElement>('#progress-fill')!.style.width = `${distance / routeLength * 100}%`;
  const mph = Math.round(speedMps * 2.237);
  document.querySelector('#speed')!.textContent = String(mph).padStart(2, '0');
  document.querySelector('#gear')!.textContent = phase === 'ride' && !paused ? 'D' : 'P';
}

let uiTimer = 0;
function animate(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  uiTimer += dt;
  if (phase === 'ride' && uiTimer > 2) { renderUI(); uiTimer = 0; }
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
  ssaoPass.setSize(innerWidth, innerHeight);
});

Object.assign(window, {
  render_game_to_text: () => JSON.stringify({
    phase, belted, distance, totalDistance: routeLength, paused, temperature, door,
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
