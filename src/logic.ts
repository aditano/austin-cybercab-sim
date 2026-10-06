/** Pure ride rules. No Three.js, so node can test them without a GPU. */

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type QualityMode = 'auto' | Quality;
export type ReflectionMode = 'off' | 'ibl' | 'probe' | 'ssr';
export type LodBand = 'near' | 'mid' | 'far';
export type TextureQuality = 'low' | 'high';

export type GraphicsToggles = {
  pixelScale: number;
  shadows: boolean;
  shadowSize: number;
  cascades: number;
  reflections: ReflectionMode;
  lod: LodBand;
  aa: boolean;
  post: boolean;
  textures: TextureQuality;
};

export type HardwareProfile = {
  software: boolean;
  coarse: boolean;
  gpu?: string;
  deviceMemory?: number;
  cores?: number;
  width?: number;
  height?: number;
  dpr?: number;
};

export type StoredGraphics = {
  v: 1;
  mode: QualityMode;
  overrides?: Partial<GraphicsToggles>;
};

export type AdaptState = {
  slowWindows: number;
  fastWindows: number;
  cooldown: number;
};

export const GRAPHICS_KEY = 'cybercab-graphics';
export const QUALITY_ORDER: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

export const PRESET_GRAPHICS: Record<Quality, GraphicsToggles> = {
  low: { pixelScale: 1, shadows: false, shadowSize: 0, cascades: 0, reflections: 'ibl', lod: 'near', aa: false, post: false, textures: 'low' },
  medium: { pixelScale: 1.25, shadows: true, shadowSize: 1024, cascades: 2, reflections: 'ibl', lod: 'mid', aa: true, post: false, textures: 'high' },
  high: { pixelScale: 1.5, shadows: true, shadowSize: 2048, cascades: 3, reflections: 'probe', lod: 'far', aa: true, post: true, textures: 'high' },
  ultra: { pixelScale: 1.75, shadows: true, shadowSize: 2048, cascades: 4, reflections: 'ssr', lod: 'far', aa: true, post: true, textures: 'high' },
};

export const QUALITY_LABEL: Record<Quality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
};

export type RestorablePhase = 'dispatch' | 'pickup' | 'boarded' | 'ride' | 'arrived' | 'exited';

export type RideSnapshot = {
  v: 1;
  phase: RestorablePhase;
  distance: number;
  belted: boolean;
  paused: boolean;
  temperature: number;
  muted: boolean;
  destinationId: string;
  phoneVisible: boolean;
};

const RESTORABLE: readonly RestorablePhase[] = ['dispatch', 'pickup', 'boarded', 'ride', 'arrived', 'exited'];

/**
 * Full butterfly stroke, in seconds. The show car closes in about 1.5 s
 * (Tesla tutorial, source 0:42.6–0:44.1). The glTF `door_open` clip is the pose.
 */
export const DOOR_STROKE_S = 1.5;

/** Rear blink measured on the We, Robot show car: ~0.42 s on, ~0.25 s off. */
export const BLINK_ON_S = 0.42;
export const BLINK_OFF_S = 0.25;

/** Tire radius of the bundled glTF. Hubs sit at y = 0.372, so the tread meets y = 0. */
export const TIRE_RADIUS_M = 0.372;

export const DESTINATIONS: { id: string; name: string; lon: number; lat: number }[] = [
  { id: 'congress', name: 'Congress & 7th', lon: -97.7424606, lat: 30.2689964 },
  { id: 'airport', name: 'Austin-Bergstrom', lon: -97.67, lat: 30.197 },
  { id: 'roundrock', name: 'Round Rock', lon: -97.678, lat: 30.508 },
];

export function pointInRing(lon: number, lat: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** The curb door opens once the cab has stopped, and stays open until the rider buckles. */
export function doorTarget(phase: string, _elapsed: number, belted: boolean, doorRequested: boolean, atCurb = false): number {
  if (phase === 'pickup' || (phase === 'boarded' && !belted) || (phase === 'dispatch' && atCurb)) return 1;
  if ((phase === 'arrived' || phase === 'exited') && doorRequested) return 1;
  return 0;
}

/** Linear stroke. Reduced motion snaps. Closing from open takes DOOR_STROKE_S. */
export function stepDoor(open: number, target: number, dt: number, snap: boolean): number {
  const clamped = Math.min(1, Math.max(0, open));
  const goal = Math.min(1, Math.max(0, target));
  if (snap) return goal;
  const step = Math.max(0, dt) / DOOR_STROKE_S;
  if (goal >= clamped) return Math.min(goal, clamped + step);
  return Math.max(goal, clamped - step);
}

export function blinkLit(time: number): boolean {
  const on = Math.round(BLINK_ON_S * 1000);
  const period = on + Math.round(BLINK_OFF_S * 1000);
  const ms = Math.round(time * 1000);
  const wrapped = ((ms % period) + period) % period;
  return wrapped < on;
}

/** Radians added to the local +X axle. Negative X rolls a nose-forward (-Z) car ahead. */
export function wheelRoll(speed: number, dt: number, radius = TIRE_RADIUS_M): number {
  if (speed === 0 || dt === 0) return 0;
  return -speed * dt / radius;
}

/** Positive steer is a left turn (positive yaw). Positive curbRate is a pull toward the right curb. */
export function steerTarget(yawRate: number, curbRate: number, speed: number): number {
  if (speed <= 0.45) return 0;
  const fromYaw = Math.min(0.42, Math.max(-0.42, yawRate * 0.16));
  const fromCurb = Math.min(0.28, Math.max(-0.28, -curbRate * 0.4));
  return Math.min(0.45, Math.max(-0.45, fromYaw + fromCurb));
}

/** Centre-out running-light scale. Segment 1 is the centre, 6 is the outer end. */
export function wakeSegmentScale(segment: number, time: number, delay = 0): number {
  const index = Math.min(6, Math.max(1, segment));
  const start = delay + (index - 1) * 0.12;
  const t = (time - start) / 0.2;
  if (t <= 0) return 0.001;
  if (t >= 1) return 1;
  const smooth = t * t * (3 - 2 * t);
  return 0.001 + 0.999 * smooth;
}

const TURN_HOLD_S = 2.4;

/** Keep a blinker lit through a short lane-change, then let it go. Hazards clear it. */
export function holdTurn(turn: TurnSignal, held: TurnSignal, remaining: number, dt: number, hazard: boolean): { turn: TurnSignal; held: TurnSignal; remaining: number } {
  if (hazard) return { turn: 'none', held: 'none', remaining: 0 };
  if (turn !== 'none') return { turn, held: turn, remaining: TURN_HOLD_S };
  const left = remaining - Math.max(0, dt);
  if (left > 0 && held !== 'none') return { turn: held, held, remaining: left };
  return { turn: 'none', held: 'none', remaining: 0 };
}

export function shouldWake(prev: string, next: string): boolean {
  if (!next || prev === next) return false;
  return next === 'dispatch' || next === 'pickup' || next === 'arrived';
}

export type TurnSignal = 'left' | 'right' | 'none';

export type VehicleCues = {
  phase: string;
  speed: number;
  accel: number;
  yawRate: number;
  curbRate: number;
};

export type VehicleSignals = {
  match: boolean;
  pickup: boolean;
  hazard: boolean;
  brake: boolean;
  turn: TurnSignal;
};

export function vehicleSignals(cues: VehicleCues): VehicleSignals {
  const hazard = cues.phase === 'pickup' || cues.phase === 'boarded' || cues.phase === 'arrived' || cues.phase === 'exited';
  const pickup = cues.phase === 'pickup' || cues.phase === 'boarded';
  const match = cues.phase === 'dispatch';
  const brake = cues.accel < -0.75 && cues.speed > 0.35;
  let turn: TurnSignal = 'none';
  if (!hazard && cues.speed > 0.45) {
    // A curb pull is the lane change. It wins over the avenue's small heading wobble.
    if (cues.curbRate > 0.04) turn = 'right';
    else if (cues.curbRate < -0.04) turn = 'left';
    else if (cues.yawRate > 0.05) turn = 'left';
    else if (cues.yawRate < -0.05) turn = 'right';
  }
  return { match, pickup, hazard, brake, turn };
}

export function isQuality(value: string): value is Quality {
  return (QUALITY_ORDER as readonly string[]).includes(value);
}

export function isQualityMode(value: string): value is QualityMode {
  return value === 'auto' || isQuality(value);
}

export function graphicsFor(quality: Quality, overrides?: Partial<GraphicsToggles> | null): GraphicsToggles {
  return { ...PRESET_GRAPHICS[quality], ...(overrides ?? {}) };
}

export function scoreHardware(profile: HardwareProfile): number {
  if (profile.software) return 0;
  let score = 40;
  const gpu = (profile.gpu || '').toLowerCase();
  if (/nvidia|geforce|rtx|radeon rx|arc a7|apple m[1-9]|metal/i.test(gpu)) score += 28;
  else if (/rtx 40|rtx 50|rx 7|rx 9|m[234] (pro|max|ultra)/i.test(gpu)) score += 36;
  else if (/iris|uhd|hd graphics|adreno|mali|xclipse|apple gpu|powervr/i.test(gpu)) score += 4;
  else if (/intel/i.test(gpu)) score += 6;
  const mem = profile.deviceMemory ?? 0;
  if (mem > 0 && mem <= 4) score -= 18;
  else if (mem >= 16) score += 16;
  else if (mem >= 8) score += 8;
  const cores = profile.cores ?? 0;
  if (cores > 0 && cores <= 4) score -= 8;
  else if (cores >= 12) score += 10;
  else if (cores >= 8) score += 5;
  if (profile.coarse) score -= 18;
  const pixels = (profile.width ?? 1280) * (profile.height ?? 720) * (profile.dpr ?? 1);
  if (pixels > 8_000_000) score -= 10;
  else if (pixels < 1_200_000) score -= 6;
  return Math.max(0, Math.min(100, score));
}

export function autoQualityPreset(profile: HardwareProfile): Quality {
  if (profile.software) return 'low';
  if (profile.coarse && (profile.deviceMemory ?? 8) <= 4) return 'low';
  const score = scoreHardware(profile);
  if (score < 28) return 'low';
  if (score < 52) return 'medium';
  if (score < 78) return 'high';
  return 'ultra';
}

export function defaultQuality(flags: HardwareProfile): Quality {
  return autoQualityPreset(flags);
}

export function pixelRatioFor(dpr: number, quality: Quality, flags: { software: boolean; coarse: boolean }, scale = PRESET_GRAPHICS[quality].pixelScale): number {
  if (flags.software || quality === 'low') return 1;
  const cap = flags.coarse
    ? quality === 'ultra' ? 1.25 : quality === 'high' ? 1.15 : 1.1
    : scale;
  return Math.min(Math.max(dpr, 1), cap);
}

export function shadowMapSize(quality: Quality, coarse: boolean): number {
  if (quality === 'low') return 0;
  if (coarse) return quality === 'medium' ? 512 : 1024;
  return PRESET_GRAPHICS[quality].shadowSize;
}

export function shadowCascades(quality: Quality): number {
  return PRESET_GRAPHICS[quality].cascades;
}

/** The glTF has no baked shadow. The contact disc stands in until a shadow map is on. */
export function showContactDisc(shadows: boolean): boolean {
  return !shadows;
}

export function resolvedQuality(mode: QualityMode, profile: HardwareProfile): Quality {
  return mode === 'auto' ? autoQualityPreset(profile) : mode;
}

export type StreetBudget = {
  movingCars: number;
  parked: number;
  peds: number;
  treeStride: number;
  scans: boolean;
  propFar: number;
};

export function streetBudget(quality: Quality): StreetBudget {
  switch (quality) {
    case 'low':
      return { movingCars: 4, parked: 6, peds: 5, treeStride: 72, scans: false, propFar: 70 };
    case 'medium':
      return { movingCars: 7, parked: 10, peds: 10, treeStride: 48, scans: false, propFar: 130 };
    case 'high':
      return { movingCars: 10, parked: 14, peds: 14, treeStride: 36, scans: true, propFar: 210 };
    case 'ultra':
      return { movingCars: 12, parked: 16, peds: 18, treeStride: 28, scans: true, propFar: 280 };
    default: {
      const _never: never = quality;
      return _never;
    }
  }
}

export function lodFar(lod: LodBand): number {
  switch (lod) {
    case 'near': return 70;
    case 'mid': return 130;
    case 'far': return 260;
    default: {
      const _never: never = lod;
      return _never;
    }
  }
}

export function emptyAdaptState(): AdaptState {
  return { slowWindows: 0, fastWindows: 0, cooldown: 0 };
}

export function adaptQuality(current: Quality, avgDt: number, state: AdaptState): { preset: Quality; state: AdaptState; changed: 'up' | 'down' | null } {
  const nextState: AdaptState = { ...state, cooldown: Math.max(0, state.cooldown - 1) };
  if (nextState.cooldown > 0) return { preset: current, state: nextState, changed: null };
  const index = QUALITY_ORDER.indexOf(current);
  const slow = avgDt > 0.022;
  const fast = avgDt < 0.0135;
  if (slow) {
    nextState.slowWindows += 1;
    nextState.fastWindows = 0;
    if (nextState.slowWindows >= 2 && index > 0) {
      return { preset: QUALITY_ORDER[index - 1], state: { slowWindows: 0, fastWindows: 0, cooldown: 4 }, changed: 'down' };
    }
  } else if (fast) {
    nextState.fastWindows += 1;
    nextState.slowWindows = 0;
    if (nextState.fastWindows >= 4 && index < QUALITY_ORDER.length - 1) {
      return { preset: QUALITY_ORDER[index + 1], state: { slowWindows: 0, fastWindows: 0, cooldown: 6 }, changed: 'up' };
    }
  } else {
    nextState.slowWindows = 0;
    nextState.fastWindows = 0;
  }
  return { preset: current, state: nextState, changed: null };
}

export function parseGraphicsStore(raw: string | null): StoredGraphics | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredGraphics>;
    if (data.v !== 1 || typeof data.mode !== 'string' || !isQualityMode(data.mode)) return null;
    const overrides = data.overrides && typeof data.overrides === 'object' ? sanitizeOverrides(data.overrides) : undefined;
    return { v: 1, mode: data.mode, overrides };
  } catch {
    return null;
  }
}

function sanitizeOverrides(raw: Partial<GraphicsToggles>): Partial<GraphicsToggles> | undefined {
  const next: Partial<GraphicsToggles> = {};
  if (typeof raw.pixelScale === 'number' && Number.isFinite(raw.pixelScale)) next.pixelScale = Math.min(2, Math.max(0.5, raw.pixelScale));
  if (typeof raw.shadows === 'boolean') next.shadows = raw.shadows;
  if (typeof raw.shadowSize === 'number' && [0, 512, 1024, 2048, 4096].includes(raw.shadowSize)) next.shadowSize = raw.shadowSize;
  if (typeof raw.cascades === 'number' && raw.cascades >= 0 && raw.cascades <= 4) next.cascades = Math.floor(raw.cascades);
  if (raw.reflections === 'off' || raw.reflections === 'ibl' || raw.reflections === 'probe' || raw.reflections === 'ssr') next.reflections = raw.reflections;
  if (raw.lod === 'near' || raw.lod === 'mid' || raw.lod === 'far') next.lod = raw.lod;
  if (typeof raw.aa === 'boolean') next.aa = raw.aa;
  if (typeof raw.post === 'boolean') next.post = raw.post;
  if (raw.textures === 'low' || raw.textures === 'high') next.textures = raw.textures;
  return Object.keys(next).length ? next : undefined;
}

/** Cap speed for a blocker. Never raises the requested speed. */
export function blockedSpeed(want: number, stop: boolean, stopDist: number): number {
  if (!stop) return want;
  const stopping = Math.sqrt(Math.max(0, 2 * 3.4 * Math.max(0, stopDist - 3.5)));
  return Math.min(want, stopping);
}

export type PedState = { crossing: boolean; t: number; dist: number };

export function stepPedestrian(
  state: PedState,
  input: { dt: number; cabDist: number; red: boolean; nearCross: boolean; wantStart: boolean; routeLength: number },
): PedState & { sideFlip: boolean } {
  let crossing = state.crossing;
  let t = state.t;
  let dist = state.dist;
  let sideFlip = false;
  const gap = Math.abs(dist - input.cabDist);
  if (input.nearCross && input.red && !crossing && input.wantStart && gap > 22) {
    crossing = true;
    t = 0;
  }
  if (crossing) {
    // Step back to the sidewalk instead of standing in the cab's lane.
    if (gap < 10 && t < 0.45) {
      crossing = false;
      t = 0;
    } else {
      const rate = gap < 8 ? 3.4 : 1.35;
      t += input.dt * rate / 16;
      if (t > 1) {
        crossing = false;
        t = 0;
        sideFlip = true;
      }
    }
  } else {
    dist += 1.15 * input.dt;
    if (dist > input.routeLength - 8) dist = 8;
  }
  return { crossing, t, dist, sideFlip };
}

export function togglePhone(phase: string, visible: boolean): { visible: boolean; ignored: boolean } {
  if (phase === 'ride') return { visible, ignored: true };
  return { visible: !visible, ignored: false };
}

function isPhase(value: string): value is RestorablePhase {
  return (RESTORABLE as readonly string[]).includes(value);
}

export function parseSnapshot(raw: string | null): RideSnapshot | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<RideSnapshot>;
    if (data.v !== 1 || typeof data.phase !== 'string' || !isPhase(data.phase)) return null;
    if (typeof data.distance !== 'number' || !Number.isFinite(data.distance)) return null;
    const known = DESTINATIONS.find((item) => item.id === data.destinationId);
    const destinationId = known ? known.id : 'congress';
    const temperature = typeof data.temperature === 'number' ? Math.min(28, Math.max(16, data.temperature)) : 21;
    return {
      v: 1,
      phase: data.phase,
      distance: data.distance,
      belted: !!data.belted,
      paused: !!data.paused,
      temperature,
      muted: !!data.muted,
      destinationId,
      phoneVisible: data.phoneVisible !== false,
    };
  } catch {
    return null;
  }
}

export function snapshotKey(phase: string): boolean {
  return isPhase(phase);
}
