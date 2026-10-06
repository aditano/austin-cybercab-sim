import * as THREE from 'three';

/** Scene origin: downtown Congress Avenue. */
export const ORIGIN: [number, number] = [-97.745, 30.264];

export const project = (lon: number, lat: number) =>
  new THREE.Vector3((lon + 97.745) * 96100, 0, -(lat - 30.264) * 111320);

export const unproject = (v: THREE.Vector3): [number, number] =>
  [v.x / 96100 - 97.745, 30.264 - v.z / 111320];

/**
 * Approximate Austin Robotaxi service area, ~288 sq mi as reported 31 Aug 2026.
 * Not an official Tesla polygon — community-traced envelope covering downtown,
 * the Domain, Pflugerville/US-183, Manor/SH-130 edge, AUS airport, South Austin,
 * Del Valle, West Lake Hills. Round Rock and Steiner Ranch sit outside.
 */
export const AUSTIN_ROBOTAXI_GEOFENCE: [number, number][] = [
  [-97.845, 30.395], [-97.790, 30.420], [-97.720, 30.437], [-97.650, 30.452],
  [-97.600, 30.447], [-97.570, 30.412], [-97.555, 30.360], [-97.560, 30.295],
  [-97.585, 30.240], [-97.612, 30.190], [-97.670, 30.165], [-97.740, 30.160],
  [-97.800, 30.172], [-97.838, 30.215], [-97.855, 30.290], [-97.855, 30.350],
  [-97.845, 30.395],
];

export const GEOFENCE_NOTE = 'Approx. 288 sq mi Austin service area (reported 31 Aug 2026). Not an official Tesla polygon.';

export function pointInRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Congress Avenue OSM vertices from 2nd Street to 7th Street (northbound). */
export const CONGRESS_ROUTE: [number, number][] = [
  [-97.7442121, 30.2643199], [-97.7441843, 30.2643968], [-97.7438918, 30.2651707],
  [-97.7438737, 30.265219], [-97.7438534, 30.2652726], [-97.7438378, 30.265315],
  [-97.7438209, 30.26536], [-97.7437609, 30.2655204], [-97.7435465, 30.2660935],
  [-97.7435056, 30.266203], [-97.7434763, 30.2662811], [-97.743409, 30.2664611],
  [-97.7431938, 30.2670367], [-97.7431556, 30.2671385], [-97.7431271, 30.267215],
  [-97.7430377, 30.2674537], [-97.7429788, 30.2676111], [-97.7428453, 30.267968],
  [-97.7428064, 30.268072], [-97.7427783, 30.2681477], [-97.7424976, 30.2688977],
  [-97.7424606, 30.2689964],
];

export const ROAD_Y = 0.16;
/** Stop short of the intersection so pickup/drop-off sit at the curb. */
export const STOP_INSET = 22;
/**
 * Meters of Congress added south of 2nd Street so the cab can approach
 * along the avenue instead of appearing already at the curb.
 */
export const APPROACH_RUNWAY = 96;
/** Pull from the travel-lane center toward the east curb at a stop. */
export const CURB_PULL = 1.2;
export const PICKUP = { name: 'Congress & 2nd', lon: -97.7442121, lat: 30.2643199 };
export const DROPOFF = { name: 'Congress & 7th', lon: -97.7424606, lat: 30.2689964 };
/**
 * Texas State Capitol. The dome sits just north of the bundled OSM extract,
 * so the scene places an artistic granite model on the Congress axis.
 */
export const CAPITOL = { name: 'Texas State Capitol', lon: -97.740371, lat: 30.274665 };

/** Assigned Megalamp match color shown in the Robotaxi app (official pickup cue). */
export const MEGALAMP = {
  name: 'Violet',
  hex: '#c24bff',
  color: 0xc24bff,
};

export const VEHICLE_PLATE = '8CYB42';
export const VEHICLE_LABEL = 'Gold Cybercab · TX 8CYB42';

export function measurePath(points: THREE.Vector3[]) {
  const cumulative = [0];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += points[i].distanceTo(points[i - 1]);
    cumulative.push(length);
  }
  return { cumulative, length };
}

export function samplePath(points: THREE.Vector3[], cumulative: number[], distance: number) {
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < distance) i++;
  const span = Math.max(1e-4, cumulative[i] - cumulative[i - 1]);
  const t = THREE.MathUtils.clamp((distance - cumulative[i - 1]) / span, 0, 1);
  const position = points[i - 1].clone().lerp(points[i], t);
  const heading = Math.atan2(-(points[i].x - points[i - 1].x), -(points[i].z - points[i - 1].z));
  return { position, heading };
}
