/** Pure ride rules. No Three.js, so node can test them without a GPU. */

export type Quality = 'balanced' | 'cinematic' | 'ultra' | 'performance';

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

/** Local Y swing authored by tools/cybercab/build.py `key_open`. Right opens positive, left negative. */
export const DOOR_SWING = 1.95;

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

export function doorAngle(side: 'r' | 'l', open: number): number {
  const amount = Math.min(1, Math.max(0, open));
  return (side === 'r' ? 1 : -1) * amount * DOOR_SWING;
}

export function defaultQuality(flags: { software: boolean; coarse: boolean }): Quality {
  if (flags.software || flags.coarse) return 'performance';
  return 'balanced';
}

export function pixelRatioFor(dpr: number, quality: Quality, flags: { software: boolean; coarse: boolean }): number {
  if (flags.software || quality === 'performance') return 1;
  const cap = flags.coarse
    ? quality === 'ultra' ? 1.25 : quality === 'cinematic' ? 1.15 : 1.1
    : quality === 'ultra' ? 1.75 : quality === 'cinematic' ? 1.5 : 1.25;
  return Math.min(Math.max(dpr, 1), cap);
}

export function shadowMapSize(quality: Quality, coarse: boolean): number {
  if (quality === 'performance') return 0;
  if (coarse || quality === 'balanced') return 1024;
  return 2048;
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
