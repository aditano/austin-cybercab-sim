#!/usr/bin/env python3
"""Build an original Cybercab glTF from an analytic subdivision cage.

Run:
  blender --background --python tools/cybercab/build.py -- [--cycles] [--no-render]

Nose is +Y, up is +Z, right is +X. The glTF exporter maps that to
Three.js Y-up with the nose on -Z. Proportions are in REFERENCE.md.
"""

import math
import os
import shutil
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GLB_PATH = os.path.join(ROOT, 'public', 'models', 'cybercab.glb')
RENDER_DIR = os.path.join(ROOT, 'tools', 'cybercab', 'renders')
PREVIEW_DIR = '/tmp/cybercab-build'

# Published width 1.754 m and height 1.408 m. Length, wheelbase, and track
# are the photo estimates in REFERENCE.md.
LENGTH = 4.40
NOSE_Y = 2.20
TAIL_Y = -2.20
HALF_W = 0.867
WHEEL_R = 0.33
ARCH_R = 0.338
TRACK = 0.78
FRONT_AXLE_Y = 1.48
REAR_AXLE_Y = FRONT_AXLE_Y - 2.86
WHEEL_Z = WHEEL_R
HINGE_X = 0.14
DOOR_OPEN = 1.95
STATION = 0.07

# y (nose is +), value. Monotone-cubic (PCHIP), so only real peaks get a flat tangent.
# Traced from the San Francisco side photo: roof peaks over the cabin, tail crown
# stays near 1.0 m, not a low wedge.
ROOF_PTS = [
    (2.22, 0.56),
    (1.92, 0.64),
    (1.55, 0.74),
    (1.15, 0.92),
    (0.72, 1.16),
    (0.28, 1.34),
    (-0.15, 1.40),
    (-0.55, 1.408),
    (-1.05, 1.30),
    (-1.50, 1.16),
    (-1.90, 1.06),
    (-2.18, 1.00),
]
BELLY_PTS = [
    (2.22, 0.26),
    (1.92, 0.175),
    (1.50, 0.150),
    (0.20, 0.146),
    (-1.50, 0.146),
    (-1.88, 0.18),
    (-2.10, 0.24),
    (-2.18, 0.30),
]
BELT_PTS = [
    (1.75, 0.70),
    (1.25, 0.84),
    (0.75, 0.96),
    (0.15, 1.02),
    (-0.50, 1.00),
    (-1.10, 0.94),
    (-1.65, 0.90),
    (-2.10, 0.86),
]
WIDTH_PTS = [
    (2.22, 0.46),
    (1.98, 0.74),
    (1.70, HALF_W),
    (-1.72, HALF_W),
    (-1.96, 0.80),
    (-2.18, 0.74),
]

# Side window, nose is +Y. A raked trapezoid: A-pillar, header, C-pillar, sill.
WINDOW_POLY = [
    (0.70, 0.96),
    (0.46, 1.14),
    (0.08, 1.26),
    (-0.30, 1.24),
    (-0.58, 1.10),
    (-0.66, 0.90),
    (-0.08, 0.82),
    (0.46, 0.84),
]
WIND_POLY = [
    (1.38, 0.78),
    (1.18, 1.08),
    (0.82, 1.32),
    (0.52, 1.40),
    (0.48, 1.16),
    (0.72, 0.80),
]

BODY, DOOR_METAL, DOOR_GLASS, WINDSHIELD = 0, 1, 2, 3


def argv_after_double_dash():
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    return []


ARGS = argv_after_double_dash()
DO_RENDER = '--no-render' not in ARGS
ENGINE = 'CYCLES' if '--cycles' in ARGS else 'BLENDER_WORKBENCH'


def smoothstep(edge0, edge1, x):
    span = edge1 - edge0
    t = 0.0 if abs(span) < 1e-8 else (x - edge0) / span
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def _pchip_slopes(pts):
    """Fritsch-Carlson slopes. Flat only at a real peak, so the roof does not ripple."""
    count = len(pts)
    ys = [point[0] for point in pts]
    values = [point[1] for point in pts]
    secant = []
    for i in range(count - 1):
        dy = ys[i + 1] - ys[i]
        secant.append(0.0 if abs(dy) < 1e-9 else (values[i + 1] - values[i]) / dy)
    slope = [0.0] * count
    slope[0] = secant[0]
    slope[-1] = secant[-1]
    for i in range(1, count - 1):
        if secant[i - 1] * secant[i] <= 0.0:
            slope[i] = 0.0
            continue
        h0 = ys[i] - ys[i - 1]
        h1 = ys[i + 1] - ys[i]
        # Weighted harmonic mean of the neighboring secants.
        w1 = 2.0 * h1 + h0
        w2 = h1 + 2.0 * h0
        slope[i] = (w1 + w2) / ((w1 / secant[i - 1]) + (w2 / secant[i]))
    for i in range(count - 1):
        if abs(secant[i]) < 1e-12:
            slope[i] = 0.0
            slope[i + 1] = 0.0
            continue
        a = slope[i] / secant[i]
        b = slope[i + 1] / secant[i]
        hyp = a * a + b * b
        if hyp > 9.0:
            scale = 3.0 / math.sqrt(hyp)
            slope[i] = a * scale * secant[i]
            slope[i + 1] = b * scale * secant[i]
    return slope


_SLOPE_CACHE = {}


def curve_at(pts, y):
    if y >= pts[0][0]:
        return pts[0][1]
    if y <= pts[-1][0]:
        return pts[-1][1]
    key = tuple(pts)
    slopes = _SLOPE_CACHE.get(key)
    if slopes is None:
        slopes = _pchip_slopes(pts)
        _SLOPE_CACHE[key] = slopes
    for i in range(len(pts) - 1):
        y0, v0 = pts[i]
        y1, v1 = pts[i + 1]
        if y1 <= y <= y0:
            span = y1 - y0
            t = 0.0 if abs(span) < 1e-8 else (y - y0) / span
            t2 = t * t
            t3 = t2 * t
            h00 = 2.0 * t3 - 3.0 * t2 + 1.0
            h10 = t3 - 2.0 * t2 + t
            h01 = -2.0 * t3 + 3.0 * t2
            h11 = t3 - t2
            return (
                h00 * v0
                + h10 * slopes[i] * span
                + h01 * v1
                + h11 * slopes[i + 1] * span
            )
    return pts[-1][1]


def roof_at(y):
    return curve_at(ROOF_PTS, y)


def belly_at(y):
    return curve_at(BELLY_PTS, y)


def belt_at(y):
    return min(curve_at(BELT_PTS, y), roof_at(y) - 0.04)


def hw_at(y):
    return curve_at(WIDTH_PTS, y)


def skirt_z(y):
    """Lower the fender beside each tire without driving the lip through the ground."""
    z = 0.155
    bottom = 0.06
    for axle in (FRONT_AXLE_Y, REAR_AXLE_Y):
        d = abs(y - axle)
        if d < 0.70:
            t = d / 0.70
            z = min(z, bottom + (t * t) * (0.155 - bottom))
    return z


def polygon_contains(y, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        yi, zi = poly[i]
        yj, zj = poly[j]
        if ((zi > z) != (zj > z)) and (y < (yj - yi) * (z - zi) / ((zj - zi) or 1e-9) + yi):
            inside = not inside
        j = i
    return inside


def srgb_to_linear(hex_color):
    value = hex_color[1:] if hex_color.startswith('#') else hex_color
    channels = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]

    def lin(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4

    return [lin(c) for c in channels]


SECTION_N = 18


def half_profile(y):
    """Slab-sided section with G1 joins: crowned roof, vertical door, tucked rocker.

    The nose blends toward a circle so the lamp face is round rather than boxed.
    """
    hw = hw_at(y)
    roof = roof_at(y)
    belt = min(belt_at(y), roof - 0.05)
    belly = belly_at(y)
    rocker = belly + 0.05
    count = SECTION_N
    pts = []
    for i in range(count):
        t = i / (count - 1)
        if t < 0.50:
            s = smoothstep(0.0, 1.0, t / 0.50)
            x = hw * math.sin(s * math.pi * 0.5) ** 0.80
            z = lerp(roof, belt, s)
        elif t < 0.80:
            s = smoothstep(0.0, 1.0, (t - 0.50) / 0.30)
            x = hw
            z = lerp(belt, rocker, s)
        else:
            s = smoothstep(0.0, 1.0, (t - 0.80) / 0.20)
            x = hw * math.cos(min(1.0, s) * math.pi * 0.5)
            z = lerp(rocker, belly, min(1.0, s))
        pts.append((max(0.0, x), z))
    # Round the lamp face. Keep the tail broad: a strong ellipse blend turns the kamm into a pod.
    nose = max(smoothstep(1.62, 2.18, y), 0.16 * smoothstep(-1.70, -2.16, y))
    if nose > 0.01:
        mid = (roof + belly) * 0.5
        rad_z = (roof - belly) * 0.5
        blended = []
        for i, (x, z) in enumerate(pts):
            ang = math.pi * i / (count - 1)
            blended.append((
                lerp(x, hw * math.sin(ang), nose),
                lerp(z, mid + rad_z * math.cos(ang), nose),
            ))
        pts = blended
    return pts


def roof_band(y_nose, y_tail, below, above, samples=6):
    """Polygon around the roof centerline, used to mark the windshield."""
    ys = [lerp(y_nose, y_tail, i / (samples - 1)) for i in range(samples)]
    upper = [(y, roof_at(y) + above) for y in ys]
    lower = [(y, roof_at(y) - below) for y in reversed(ys)]
    return upper + lower


def _catmull(points, samples):
    """Evenly sampled closed-enough polyline through control points."""
    if len(points) < 2:
        return list(points)
    padded = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = (Vector((p[0], p[1], 0.0)) for p in padded[i - 1:i + 3])
        for step in range(samples):
            t = step / samples
            t2 = t * t
            t3 = t2 * t
            point = 0.5 * (
                (2 * p1)
                + (-p0 + p2) * t
                + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
            )
            out.append((point.x, point.y))
    out.append(points[-1])
    return out


def make_door_poly():
    """Shut outline. Pillars are broken into short chords; the roof stays sparse.

    A fully sampled curve here used to bisect the roof into spikes.
    """
    return [
        (0.98, 0.34),
        (0.95, 0.56),
        (0.88, 0.82),
        (0.74, 1.06),
        (0.58, 1.20),
        (0.22, roof_at(0.22) + 0.012),
        (-0.16, roof_at(-0.16) + 0.012),
        (-0.50, roof_at(-0.50) + 0.012),
        (-0.68, 1.16),
        (-0.78, 0.90),
        (-0.86, 0.58),
        (-0.90, 0.34),
    ]


def stations():
    ys = []
    y = NOSE_Y
    while y > TAIL_Y + 0.03:
        ys.append(y)
        y -= STATION
    ys.append(TAIL_Y + 0.02)
    return ys


def crease_layer(bm):
    layer = bm.edges.layers.float.get('crease_edge')
    if layer is None:
        layer = bm.edges.layers.float.new('crease_edge')
    return layer


def new_mesh_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    interior = Vector((0.0, 0.0, 0.7))
    score = 0.0
    for face in bm.faces:
        score += face.normal.dot(face.calc_center_median() - interior)
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def build_shell():
    bm = bmesh.new()
    rings = []
    for y in stations():
        profile = half_profile(y)
        right = [bm.verts.new((x, y, z)) for x, z in profile]
        left_mid = [bm.verts.new((-vert.co.x, vert.co.y, vert.co.z)) for vert in right[1:-1]]
        ring = list(right)
        for vert in reversed(left_mid):
            ring.append(vert)
        rings.append(ring)

    def add_face(verts):
        if len(verts) < 3:
            return None
        try:
            return bm.faces.new(verts)
        except ValueError:
            return None

    for ring0, ring1 in zip(rings, rings[1:]):
        n = len(ring0)
        for i in range(n):
            j = (i + 1) % n
            add_face((ring0[i], ring0[j], ring1[j], ring1[i]))

    nose = rings[0]
    nose_y = max(vert.co.y for vert in nose)
    centroid = sum((vert.co.copy() for vert in nose), Vector()) / len(nose)
    inset = []
    for vert in nose:
        inset.append(bm.verts.new((
            vert.co.x * 0.55,
            nose_y + 0.012,
            centroid.z + (vert.co.z - centroid.z) * 0.55,
        )))
    for i in range(len(nose)):
        j = (i + 1) % len(nose)
        add_face((nose[i], nose[j], inset[j], inset[i]))
    cap = bm.verts.new(Vector((0.0, nose_y + 0.022, centroid.z)))
    for i in range(len(inset)):
        add_face((cap, inset[i], inset[(i + 1) % len(inset)]))

    tail = rings[-1]
    tail_y = min(vert.co.y for vert in tail) - 0.01
    for vert in tail:
        vert.co.y = tail_y
    try:
        bm.faces.new(list(reversed(tail)))
    except ValueError:
        tail_co = sum((vert.co.copy() for vert in tail), Vector()) / len(tail)
        center = bm.verts.new(tail_co)
        for i in range(len(tail)):
            add_face((center, tail[(i + 1) % len(tail)], tail[i]))

    layer = crease_layer(bm)
    for edge in bm.edges:
        ys = [vert.co.y for vert in edge.verts]
        if max(ys) < tail_y + 0.02:
            edge[layer] = 0.85
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
    return new_mesh_object('shell', bm)


def apply_modifier(obj, name):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.modifier_apply(modifier=name)
    obj.select_set(False)


def apply_subsurf(obj, levels):
    mod = obj.modifiers.new('Subsurf', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    mod.use_creases = True
    apply_modifier(obj, mod.name)


def _bm_from(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    return bm


def _bm_to(obj, bm):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00025)
    loose = [vert for vert in bm.verts if not vert.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.update()


def knife_segments(obj, segments, x_min, x_max, band=0.07):
    """Cut the surface along YZ segments extruded through X, limited to an X slab."""
    bm = _bm_from(obj)
    cuts = 0
    for (y0, z0), (y1, z1) in segments:
        dy, dz = y1 - y0, z1 - z0
        length = math.hypot(dy, dz)
        if length < 1e-6:
            continue
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        normal = Vector((0.0, -dz / length, dy / length))
        geom = []
        seen = set()
        for face in bm.faces:
            center = face.calc_center_median()
            if center.x < x_min or center.x > x_max:
                continue
            t = ((center.y - y0) * dy + (center.z - z0) * dz) / (length * length)
            if t < -0.25 or t > 1.25:
                continue
            py = y0 + max(0.0, min(1.0, t)) * dy
            pz = z0 + max(0.0, min(1.0, t)) * dz
            if math.hypot(center.y - py, center.z - pz) > band:
                continue
            for elem in (face, *face.verts, *face.edges):
                key = (elem.__class__.__name__, elem.index)
                if key not in seen:
                    seen.add(key)
                    geom.append(elem)
        if not geom:
            continue
        bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=Vector((0.0, y0, z0)),
            plane_no=normal,
            dist=1e-6,
        )
        cuts += 1
    print('knife segments', cuts, 'x', round(x_min, 2), round(x_max, 2))
    _bm_to(obj, bm)


def knife_x_plane(obj, x_plane, y0, y1, z_min):
    bm = _bm_from(obj)
    geom = []
    seen = set()
    for face in bm.faces:
        center = face.calc_center_median()
        if abs(center.x - x_plane) > 0.08:
            continue
        if center.y < y0 - 0.05 or center.y > y1 + 0.05 or center.z < z_min:
            continue
        for elem in (face, *face.verts, *face.edges):
            key = (elem.__class__.__name__, elem.index)
            if key not in seen:
                seen.add(key)
                geom.append(elem)
    if geom:
        bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=Vector((x_plane, 0.0, 1.0)),
            plane_no=Vector((1.0 if x_plane >= 0 else -1.0, 0.0, 0.0)),
            dist=1e-6,
        )
    print('knife hinge', round(x_plane, 3), 'faces', len(geom) // 3)
    _bm_to(obj, bm)


def poly_segments(poly, closed=True):
    pairs = []
    count = len(poly)
    last = count if closed else count - 1
    for i in range(last):
        pairs.append((poly[i], poly[(i + 1) % count]))
    return pairs


def extract_faces(obj, predicate, name):
    bm = _bm_from(obj)
    taken = [face for face in bm.faces if predicate(face)]
    print(name, 'extracted', len(taken))
    if len(taken) < 8:
        bm.free()
        raise RuntimeError(f'{name} matched {len(taken)} faces')
    piece = bmesh.new()
    mapping = {}
    for face in taken:
        verts = []
        for vert in face.verts:
            if vert not in mapping:
                mapping[vert] = piece.verts.new(vert.co.copy())
            verts.append(mapping[vert])
        try:
            new_face = piece.faces.new(verts)
            new_face.smooth = True
        except ValueError:
            pass
    bmesh.ops.delete(bm, geom=taken, context='FACES')
    _bm_to(obj, bm)
    return new_mesh_object(name, piece)


def inset_boundary(obj, amount, keep_x=None):
    """Pull boundary verts toward the patch centroid so a panel gap opens."""
    bm = _bm_from(obj)
    boundary = [vert for vert in bm.verts if vert.is_boundary]
    if not boundary:
        bm.free()
        return
    centroid = sum((vert.co for vert in boundary), Vector()) / len(boundary)
    for vert in boundary:
        if keep_x is not None and abs(abs(vert.co.x) - keep_x) < 0.025:
            continue
        # Stay on the surface: slide along YZ only, a few millimetres, so the gap
        # does not open onto the background.
        delta = Vector((0.0, centroid.y - vert.co.y, centroid.z - vert.co.z))
        if delta.length < 1e-6:
            continue
        vert.co += delta.normalized() * amount
    _bm_to(obj, bm)


def fair_boundaries(obj, cycles=4, skip_hinge=False):
    """Taubin smooth on boundary loops so a boolean or bisect edge is not a stair.

    Positive then negative steps keep the opening from collapsing.
    """
    bm = _bm_from(obj)
    for _ in range(cycles):
        for factor in (0.5, -0.52):
            boundary = {vert for vert in bm.verts if vert.is_boundary}
            moves = {}
            for vert in boundary:
                if skip_hinge and abs(abs(vert.co.x) - HINGE_X) < 0.03 and vert.co.z > 0.85:
                    continue
                nbrs = [edge.other_vert(vert) for edge in vert.link_edges if edge.other_vert(vert) in boundary]
                if len(nbrs) != 2:
                    continue
                mid = (nbrs[0].co + nbrs[1].co) * 0.5
                moves[vert] = vert.co.lerp(mid, factor)
            for vert, co in moves.items():
                vert.co = co
    _bm_to(obj, bm)


def kamm_tail(obj, plane_y=-2.14, blend=0.18):
    """Pull the last stretch of the fastback into a short, nearly vertical face."""
    bm = _bm_from(obj)
    moved = 0
    for vert in bm.verts:
        if vert.co.y < plane_y:
            vert.co.y = plane_y
            moved += 1
            continue
        dist = vert.co.y - plane_y
        if dist < blend:
            t = 1.0 - dist / blend
            vert.co.y -= dist * 0.72 * t * t
            moved += 1
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.003)
    print('kamm verts', moved)
    _bm_to(obj, bm)


def knife_z_plane(obj, z_plane, y_min, y_max):
    bm = _bm_from(obj)
    geom = []
    seen = set()
    for face in bm.faces:
        center = face.calc_center_median()
        if center.y < y_min or center.y > y_max or abs(center.z - z_plane) > 0.08:
            continue
        for elem in (face, *face.verts, *face.edges):
            key = (elem.__class__.__name__, elem.index)
            if key not in seen:
                seen.add(key)
                geom.append(elem)
    if geom:
        bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=Vector((0.0, 0.0, z_plane)),
            plane_no=Vector((0.0, 0.0, 1.0)),
            dist=1e-6,
        )
    print('knife z', z_plane, 'elems', len(geom))
    _bm_to(obj, bm)


def cut_arches(obj):
    """Circular fender openings. The lip is a knife line, not a snapped zigzag."""
    steps = 36
    for axle in (FRONT_AXLE_Y, REAR_AXLE_Y):
        arc = []
        for i in range(steps + 1):
            ang = math.radians(18) + math.radians(144) * i / steps
            arc.append((axle + ARCH_R * math.cos(ang), WHEEL_Z + ARCH_R * math.sin(ang)))
        knife_segments(obj, poly_segments(arc, closed=False), 0.48, 1.15, band=0.06)
        knife_segments(obj, poly_segments(arc, closed=False), -1.15, -0.48, band=0.06)
    bm = _bm_from(obj)
    doomed = []
    for face in bm.faces:
        center = face.calc_center_median()
        if abs(center.x) < 0.52 or center.z < 0.09:
            continue
        for axle in (FRONT_AXLE_Y, REAR_AXLE_Y):
            if (center.y - axle) ** 2 + (center.z - WHEEL_Z) ** 2 < (ARCH_R - 0.008) ** 2:
                doomed.append(face)
                break
    print('arch faces', len(doomed))
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
    for vert in bm.verts:
        if not vert.is_valid or not vert.is_boundary or abs(vert.co.x) < 0.50 or vert.co.z < 0.10:
            continue
        for axle in (FRONT_AXLE_Y, REAR_AXLE_Y):
            dy = vert.co.y - axle
            dz = vert.co.z - WHEEL_Z
            dist = math.hypot(dy, dz)
            if dist < 1e-5 or abs(dist - ARCH_R) > 0.03:
                continue
            vert.co.y = axle + dy / dist * ARCH_R
            vert.co.z = WHEEL_Z + dz / dist * ARCH_R
            break
    _bm_to(obj, bm)


def cut_window(obj, poly):
    """Open the side glass. Roof faces stay; only the side-facing pane is removed."""
    knife_segments(obj, poly_segments(poly), -1.2, 1.2, band=0.045)
    bm = _bm_from(obj)
    doomed = []
    for face in bm.faces:
        center = face.calc_center_median()
        normal = face.normal
        if abs(normal.x) < 0.32:
            continue
        if center.z > roof_at(center.y) - 0.04:
            continue
        if polygon_contains(center.y, center.z, poly):
            doomed.append(face)
    print('window faces', len(doomed))
    if len(doomed) < 4:
        _bm_to(obj, bm)
        raise RuntimeError('side window missed the door skin')
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    snapped = 0
    for vert in bm.verts:
        if not vert.is_valid or not vert.is_boundary:
            continue
        if vert.co.z > roof_at(vert.co.y) - 0.02:
            continue
        hit = nearest_on_polys(vert.co.y, vert.co.z, (poly,))
        if hit is not None and hit[0] < 0.04:
            vert.co.y = hit[1]
            vert.co.z = hit[2]
            snapped += 1
    print('window lip', snapped)
    _bm_to(obj, bm)


def carve_straight_breaks(obj):
    """Only infinite cuts that are already straight in the car: roof hinge and rocker."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for x_plane in (HINGE_X, -HINGE_X):
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(
            bm,
            geom=geom,
            plane_co=Vector((x_plane, 0.0, 0.9)),
            plane_no=Vector((1.0 if x_plane > 0 else -1.0, 0.0, 0.0)),
            dist=1e-5,
        )
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(
        bm,
        geom=geom,
        plane_co=Vector((0.0, 0.0, 0.32)),
        plane_no=Vector((0.0, 0.0, 1.0)),
        dist=1e-5,
    )
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00035)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def nearest_on_polys(y, z, polys):
    best = None
    for poly in polys:
        for i in range(len(poly)):
            y0, z0 = poly[i]
            y1, z1 = poly[(i + 1) % len(poly)]
            dy, dz = y1 - y0, z1 - z0
            length2 = dy * dy + dz * dz
            if length2 < 1e-8:
                continue
            t = max(0.0, min(1.0, ((y - y0) * dy + (z - z0) * dz) / length2))
            py = y0 + t * dy
            pz = z0 + t * dz
            dist = math.hypot(y - py, z - pz)
            if best is None or dist < best[0]:
                best = (dist, py, pz)
    return best


def snap_seams(obj):
    """Pull material-boundary verts onto the door and glass outlines."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    moved = 0
    for vert in bm.verts:
        materials = {face.material_index for face in vert.link_faces}
        if len(materials) < 2:
            continue
        hit = nearest_on_polys(vert.co.y, vert.co.z, (DOOR_POLY, WINDOW_POLY, WIND_POLY))
        if hit is not None and hit[0] < 0.028:
            vert.co.y = hit[1]
            vert.co.z = hit[2]
            moved += 1
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    print('seam verts snapped', moved)


def classify(obj):
    counts = {BODY: 0, DOOR_METAL: 0, DOOR_GLASS: 0, WINDSHIELD: 0}
    for poly in obj.data.polygons:
        center = poly.center
        normal = poly.normal
        y, z, x = center.y, center.z, center.x
        kind = BODY
        on_windshield = abs(x) < 0.66 and normal.y > 0.22 and polygon_contains(y, z, WIND_POLY)
        on_roof = abs(x) >= HINGE_X and z > roof_at(y) - 0.06 and -0.42 < y < 0.48
        on_door = abs(x) >= HINGE_X - 0.012 and z > 0.36 and (polygon_contains(y, z, DOOR_POLY) or on_roof)
        if on_windshield:
            kind = WINDSHIELD
        elif on_door:
            side_glass = abs(x) > 0.50 and abs(normal.x) > 0.42 and polygon_contains(y, z, WINDOW_POLY)
            kind = DOOR_GLASS if side_glass else DOOR_METAL
        poly.material_index = kind
        counts[kind] += 1
    print('regions', counts)
    return counts


def split_by_material(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    groups = {}
    for face in bm.faces:
        groups.setdefault(face.material_index, []).append(face)
    names = {
        BODY: 'body',
        DOOR_METAL: 'door-shell',
        DOOR_GLASS: 'door-glass-shell',
        WINDSHIELD: 'windshield',
    }
    out = {}
    for index, faces in groups.items():
        piece = bmesh.new()
        mapping = {}
        for face in faces:
            verts = []
            for vert in face.verts:
                if vert not in mapping:
                    mapping[vert] = piece.verts.new(vert.co)
                verts.append(mapping[vert])
            try:
                new_face = piece.faces.new(verts)
                new_face.material_index = 0
                new_face.smooth = True
            except ValueError:
                pass
        if not piece.faces:
            piece.free()
            continue
        out[index] = new_mesh_object(names.get(index, f'part-{index}'), piece)
    bpy.data.objects.remove(obj, do_unlink=True)
    return out


def solidify(obj, thickness, inner_mat, rim_mat):
    while len(obj.data.materials) < 3:
        obj.data.materials.append(None)
    obj.data.materials[1] = inner_mat
    obj.data.materials[2] = rim_mat
    mod = obj.modifiers.new('Shell', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = -1
    mod.use_rim = True
    mod.material_offset = 1
    mod.material_offset_rim = 2
    apply_modifier(obj, mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True


def paint_window_backing(obj, mat):
    """Dark skin behind the side glass so the pane does not show gold."""
    slot = len(obj.data.materials)
    obj.data.materials.append(mat)
    painted = 0
    for poly in obj.data.polygons:
        if poly.material_index != 0:
            continue
        center = Vector(poly.center)
        normal = Vector(poly.normal)
        if abs(normal.x) < 0.28:
            continue
        if polygon_contains(center.y, center.z, WINDOW_POLY):
            poly.material_index = slot
            painted += 1
    print('window backing', painted)


def paint_cladding(obj, trim_mat):
    slot = len(obj.data.materials)
    obj.data.materials.append(trim_mat)
    for poly in obj.data.polygons:
        if poly.material_index != 0:
            continue
        center = Vector(poly.center)
        normal = Vector(poly.normal)
        near_arch = min(abs(center.y - axle) for axle in (FRONT_AXLE_Y, REAR_AXLE_Y)) < 0.52
        rocker = (normal.x * center.x) > 0.35 and 0.10 < center.z < 0.36 and not near_arch and abs(center.x) > 0.55
        if rocker:
            poly.material_index = slot


def split_doors(shell_obj):
    bm = bmesh.new()
    bm.from_mesh(shell_obj.data)
    positive = []
    negative = []
    for face in bm.faces:
        (positive if face.calc_center_median().x >= 0 else negative).append(face)

    def extract(faces, name):
        piece = bmesh.new()
        mapping = {}
        for face in faces:
            verts = []
            for vert in face.verts:
                if vert not in mapping:
                    mapping[vert] = piece.verts.new(vert.co)
                verts.append(mapping[vert])
            try:
                new_face = piece.faces.new(verts)
                new_face.smooth = True
            except ValueError:
                pass
        return new_mesh_object(name, piece) if piece.faces else None

    right = extract(positive, shell_obj.name + '-r')
    left = extract(negative, shell_obj.name + '-l')
    bpy.data.objects.remove(shell_obj, do_unlink=True)
    return right, left


def look_at(obj, target):
    direction = target - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = direction.normalized().to_track_quat('-Z', 'Y')


def parent_keep(child, parent):
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def parent_at(child, parent):
    child.parent = parent


def empty(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = 0.12
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        parent_keep(obj, parent)
    return obj


def hinge_for(door_obj, name):
    verts = [door_obj.matrix_world @ vert.co for vert in door_obj.data.vertices]
    rail = [vert for vert in verts if abs(abs(vert.x) - HINGE_X) < 0.06 and vert.z > 1.0]
    if len(rail) < 6:
        top_z = max(vert.z for vert in verts)
        band = [vert for vert in verts if vert.z > top_z - 0.08]
        band.sort(key=lambda vert: abs(vert.x))
        rail = band[:max(8, len(band) // 3)] or band
    front = max(rail, key=lambda vert: vert.y)
    back = min(rail, key=lambda vert: vert.y)
    origin = (front + back) * 0.5
    axis = back - front
    if axis.length < 1e-4:
        axis = Vector((0.0, -1.0, 0.0))
    axis.normalize()
    orient = empty(name + '-orient', origin)
    orient.rotation_mode = 'QUATERNION'
    orient.rotation_quaternion = axis.to_track_quat('Y', 'Z')
    spin = empty(name, Vector((0.0, 0.0, 0.0)))
    spin.parent = orient
    spin.location = (0.0, 0.0, 0.0)
    spin.rotation_mode = 'XYZ'
    return orient, spin


def key_open(spin, angle):
    spin.rotation_mode = 'XYZ'
    spin.animation_data_create()
    action = bpy.data.actions.new(spin.name + '-action')
    spin.animation_data.action = action
    curve = action.fcurves.new('rotation_euler', index=1)
    curve.keyframe_points.insert(1.0, 0.0)
    curve.keyframe_points.insert(24.0, angle)
    for point in curve.keyframe_points:
        point.interpolation = 'LINEAR'


def assign(obj, mat, slot=0):
    while len(obj.data.materials) <= slot:
        obj.data.materials.append(None)
    obj.data.materials[slot] = mat


def make_material(name, color, metallic, roughness, coat=0.0, coat_rough=0.1, transmission=0.0, emission=None, emission_strength=0.0, ior=1.5, sheen=0.0, double_sided=False, viewport=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not double_sided
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    linear = srgb_to_linear(color) + [1.0]
    bsdf.inputs['Base Color'].default_value = linear
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_rough
    bsdf.inputs['Coat IOR'].default_value = 1.5
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['IOR'].default_value = ior
    bsdf.inputs['Sheen Weight'].default_value = sheen
    if emission:
        bsdf.inputs['Emission Color'].default_value = srgb_to_linear(emission) + [1.0]
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    mat.diffuse_color = (srgb_to_linear(viewport) + [1.0]) if viewport else linear
    return mat


def box(name, location, size, mat, bevel=0.012, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.affect = 'EDGES'
        apply_modifier(obj, mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    assign(obj, mat)
    if parent is not None:
        parent_keep(obj, parent)
    return obj


def cylinder_between(name, a, b, radius, mat, parent=None):
    start = Vector(a)
    end = Vector(b)
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=max(delta.length, 0.001), vertices=12, location=(start + end) * 0.5,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.normalized().to_track_quat('Z', 'Y')
    for poly in obj.data.polygons:
        poly.use_smooth = True
    assign(obj, mat)
    if parent is not None:
        parent_keep(obj, parent)
    return obj


def ribbon(name, points, half_height, mat):
    bm = bmesh.new()
    upper = []
    lower = []
    for point in points:
        upper.append(bm.verts.new((point.x, point.y, point.z + half_height)))
        lower.append(bm.verts.new((point.x, point.y, point.z - half_height)))
    for i in range(len(points) - 1):
        try:
            bm.faces.new((upper[i], upper[i + 1], lower[i + 1], lower[i]))
        except ValueError:
            pass
    obj = new_mesh_object(name, bm)
    assign(obj, mat)
    return obj


def surface_extreme(verts, x, z, pick_max_y, x_tol=0.08, z_tol=0.07):
    best = None
    for vert in verts:
        if abs(vert.x - x) <= x_tol and abs(vert.z - z) <= z_tol:
            if best is None or (vert.y > best if pick_max_y else vert.y < best):
                best = vert.y
    return best


def world_verts(obj):
    return [obj.matrix_world @ vert.co for vert in obj.data.vertices]


def add_wheel(side, axle_y, parts, parent_root):
    loc = Vector((side * TRACK, axle_y, WHEEL_Z))
    if axle_y > 0:
        which = 'fr' if side > 0 else 'fl'
        steer = empty(f'wheel-steer-{which}', loc, parent_root)
        spin = empty(f'wheel-spin-{which}', Vector((0.0, 0.0, 0.0)))
        spin.parent = steer
        spin.location = (0.0, 0.0, 0.0)
    else:
        which = 'rr' if side > 0 else 'rl'
        spin = empty(f'wheel-spin-{which}', loc, parent_root)
    outside = side * 0.055

    bpy.ops.mesh.primitive_torus_add(
        major_radius=WHEEL_R - 0.055, minor_radius=0.055,
        major_segments=48, minor_segments=12, location=(0.0, 0.0, 0.0),
    )
    tire = bpy.context.active_object
    tire.name = f'tire-{which}'
    tire.rotation_euler = (0.0, math.radians(90), 0.0)
    bpy.ops.object.transform_apply(rotation=True)
    assign(tire, parts['rubber'])
    parent_at(tire, spin)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=WHEEL_R - 0.09, minor_radius=0.010, major_segments=40, minor_segments=8,
        location=(side * 0.028, 0.0, 0.0), rotation=(0.0, math.radians(90), 0.0),
    )
    sidewall = bpy.context.active_object
    sidewall.name = f'sidewall-{which}'
    bpy.ops.object.transform_apply(rotation=True)
    assign(sidewall, parts['rubber'])
    parent_at(sidewall, spin)

    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.308, depth=0.016, vertices=64,
        location=(outside, 0.0, 0.0), rotation=(0.0, math.radians(90), 0.0),
    )
    cover = bpy.context.active_object
    cover.name = f'aero-{which}'
    bpy.ops.object.transform_apply(rotation=True)
    assign(cover, parts['aero'])
    parent_at(cover, spin)

    for radius in (0.22, 0.12, 0.045):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=radius, minor_radius=0.0035, major_segments=40, minor_segments=6,
            location=(outside + side * 0.010, 0.0, 0.0), rotation=(0.0, math.radians(90), 0.0),
        )
        groove = bpy.context.active_object
        groove.name = f'groove-{which}'
        bpy.ops.object.transform_apply(rotation=True)
        assign(groove, parts['groove'])
        parent_at(groove, spin)

    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.028, depth=0.012, vertices=16,
        location=(outside + side * 0.014, 0.0, 0.0), rotation=(0.0, math.radians(90), 0.0),
    )
    cap = bpy.context.active_object
    cap.name = f'cap-{which}'
    bpy.ops.object.transform_apply(rotation=True)
    assign(cap, parts['trim'])
    parent_at(cap, spin)

    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.15, depth=0.014, vertices=24,
        location=(-side * 0.02, 0.0, 0.0), rotation=(0.0, math.radians(90), 0.0),
    )
    disc = bpy.context.active_object
    disc.name = f'disc-{which}'
    bpy.ops.object.transform_apply(rotation=True)
    assign(disc, parts['disc'])
    parent_at(disc, spin)

    caliper = box(
        f'caliper-{which}', (-side * 0.02, 0.0, 0.10),
        (0.04, 0.07, 0.08), parts['caliper'], bevel=0.004,
    )
    parent_at(caliper, spin)


def _mesh_from_bm(name, bm, outward):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    average = sum((face.normal for face in bm.faces), Vector())
    if average.dot(outward) < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    for face in bm.faces:
        face.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def _drape_rows(name, samples, mat, parent, offset):
    """Stitch sampled surface rows into a patch sitting just off the body."""
    bm = bmesh.new()
    grid = []
    for row_pts in samples:
        row = []
        for point in row_pts:
            row.append(bm.verts.new(point + offset))
        grid.append(row)
    for i in range(len(grid) - 1):
        width = min(len(grid[i]), len(grid[i + 1]))
        for j in range(width - 1):
            try:
                bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
            except ValueError:
                pass
    if not bm.faces:
        bm.free()
        return None
    obj = _mesh_from_bm(name, bm, offset.normalized() if offset.length else Vector((0.0, 1.0, 0.0)))
    assign(obj, mat)
    parent_keep(obj, parent)
    return obj


def add_chin(body, mat, parent):
    """Smooth black nose valance. Face painting followed the quads and looked torn."""
    verts = world_verts(body)
    rows = []
    for z in (0.17, 0.23, 0.30):
        row = []
        for i in range(23):
            x = -0.74 + 1.48 * i / 22
            y = surface_extreme(verts, x, z, True, 0.14, 0.07)
            if y is None:
                continue
            row.append(Vector((x, y, z)))
        if len(row) > 4:
            rows.append(row)
    if len(rows) >= 2:
        _drape_rows('chin', rows, mat, parent, Vector((0.0, 0.006, 0.0)))


def add_rear_bumper(body, mat, parent):
    verts = world_verts(body)
    tail_y = min(vert.y for vert in verts)
    rows = []
    for z in (0.16, 0.26, 0.36, 0.46):
        row = []
        for i in range(21):
            x = -0.70 + 1.40 * i / 20
            y = surface_extreme(verts, x, z, False, 0.10, 0.06)
            if y is None or y > tail_y + 0.08:
                continue
            row.append(Vector((x, y, z)))
        if len(row) > 4:
            rows.append(row)
    if len(rows) >= 2:
        _drape_rows('rear-bumper', rows, mat, parent, Vector((0.0, -0.006, 0.0)))


def _wrapped_bar(verts, z, across, wrap):
    """Full-width lamp that turns the corner instead of stopping square."""
    points = []
    for i in range(5):
        t = i / 4
        x = -across - 0.06 * (1.0 - t)
        y = surface_extreme(verts, x, z, False, 0.16, 0.12)
        if y is None:
            continue
        points.append(Vector((x, y + wrap * (1.0 - t) - 0.004, z)))
    for i in range(25):
        x = -across + 2 * across * i / 24
        y = surface_extreme(verts, x, z, False, 0.12, 0.10)
        if y is None:
            continue
        points.append(Vector((x, y - 0.006, z)))
    for i in range(5):
        t = i / 4
        x = across + 0.06 * t
        y = surface_extreme(verts, x, z, False, 0.16, 0.12)
        if y is None:
            continue
        points.append(Vector((x, y + wrap * t - 0.004, z)))
    return points


def add_lights(body, parts, root):
    verts = world_verts(body)
    front = []
    for i in range(45):
        x = -0.86 + (1.72 * i / 44)
        z = 0.46 + 0.11 * (abs(x) / 0.86) ** 1.65
        y = surface_extreme(verts, x, z, True, 0.12, 0.09)
        if y is None:
            y = surface_extreme(verts, x, z, True, 0.20, 0.16)
        if y is None:
            continue
        # Ease the ends back onto the fender so the bar wraps the corner.
        y -= 0.05 * (abs(x) / 0.86) ** 2
        front.append(Vector((x, y + 0.007, z)))
    if len(front) > 4:
        recess = ribbon('megalamp-recess', [Vector((p.x, p.y - 0.006, p.z)) for p in front], 0.022, parts['trim'])
        lamp = ribbon('megalamp', front, 0.011, parts['front_lamp'])
        parent_keep(lamp, root)
        parent_keep(recess, root)

    tail_y = min(vert.y for vert in verts)
    tail_face = [vert for vert in verts if vert.y < tail_y + 0.08]
    z_top = max((vert.z for vert in tail_face), default=0.90)
    z_bot = min((vert.z for vert in tail_face), default=0.30)
    bar_z = z_bot + (z_top - z_bot) * 0.74
    rear = _wrapped_bar(verts, bar_z, 0.62, 0.14)
    if len(rear) > 4:
        recess = ribbon('rear-lamp-recess', [Vector((p.x, p.y + 0.004, p.z)) for p in rear], 0.026, parts['trim'])
        lamp = ribbon('rear-lightbar', rear, 0.013, parts['rear_lamp'])
        parent_keep(recess, root)
        parent_keep(lamp, root)
    low_z = z_bot + (z_top - z_bot) * 0.18
    low = _wrapped_bar(verts, low_z, 0.52, 0.08)
    if len(low) > 4:
        bumper_lamp = ribbon('rear-bumper-lamp', low, 0.008, parts['rear_lamp'])
        parent_keep(bumper_lamp, root)

    for side, name in ((-1, 'rl'), (1, 'rr')):
        x = side * 0.62
        z = 0.36
        y = surface_extreme(verts, x, z, False, 0.16, 0.10)
        if y is None:
            y = TAIL_Y
        box(f'hazard-{name}', (x, y - 0.004, z), (0.10, 0.008, 0.012), parts['amber'], bevel=0.002, parent=root)
    for side, name in ((-1, 'fl'), (1, 'fr')):
        x = side * 0.72
        z = 0.42
        y = surface_extreme(verts, x, z, True, 0.16, 0.10)
        if y is None:
            y = 1.6
        box(f'hazard-{name}', (x, y + 0.006, z), (0.09, 0.008, 0.010), parts['amber'], bevel=0.002, parent=root)


def add_cameras(body, parts, root):
    verts = world_verts(body)
    for side, name in ((-1, 'l'), (1, 'r')):
        x = side * 0.72
        z = 0.98
        y = surface_extreme(verts, x, z, True, 0.14, 0.12)
        if y is None:
            y = 0.9
        pod = box(f'camera-{name}', (x, y + 0.012, z), (0.045, 0.06, 0.032), parts['trim'], bevel=0.008, parent=root)
        box(f'camera-lens-{name}', (x, y + 0.04, z), (0.02, 0.012, 0.016), parts['glass_dark'], bevel=0.002, parent=pod)
    y = surface_extreme(verts, 0.0, 0.98, False, 0.12, 0.08)
    if y is None:
        y = TAIL_Y
    box('camera-rear', (0.0, y - 0.008, 0.98), (0.04, 0.03, 0.028), parts['trim'], bevel=0.005, parent=root)


def add_interior(parts, root):
    group = empty('interior', Vector((0.0, 0.0, 0.0)), root)
    box('floor', (0.0, -0.05, 0.28), (1.20, 1.55, 0.04), parts['carpet'], bevel=0.0, parent=group)
    box('dash', (0.0, 0.72, 0.70), (1.25, 0.28, 0.10), parts['dash'], bevel=0.02, parent=group)
    box('dash-pad', (0.0, 0.62, 0.78), (1.15, 0.16, 0.05), parts['dash'], bevel=0.012, parent=group)
    box('dash-accent', (0.0, 0.78, 0.74), (0.92, 0.012, 0.012), parts['accent'], bevel=0.0, parent=group)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.0, 0.62, 0.86), rotation=(math.radians(68), 0.0, 0.0))
    screen = bpy.context.active_object
    screen.name = 'front-screen'
    screen.scale = (0.42, 0.24, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    assign(screen, parts['screen'])
    parent_keep(screen, group)
    box('screen-bezel', (0.0, 0.60, 0.86), (0.46, 0.012, 0.28), parts['trim'], bevel=0.004, rotation=(math.radians(22), 0.0, 0.0), parent=group)
    box('console', (0.0, 0.05, 0.42), (0.28, 0.55, 0.16), parts['dash'], bevel=0.014, parent=group)
    box('console-top', (0.0, 0.08, 0.51), (0.24, 0.42, 0.02), parts['trim'], bevel=0.006, parent=group)
    for cup_y in (0.20, -0.02):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.040, depth=0.02, vertices=16, location=(0.0, cup_y, 0.53))
        cup = bpy.context.active_object
        cup.name = 'cup'
        assign(cup, parts['trim'])
        parent_keep(cup, group)

    for side in (-1, 1):
        sculpt_seat(group, side, parts)

    bm = bmesh.new()
    grid = []
    ys = (-0.35, -0.10, 0.15, 0.40, 0.65)
    xs = (-0.42, -0.20, 0.0, 0.20, 0.42)
    for y in ys:
        row = []
        roof = roof_at(y) - 0.06
        for x in xs:
            sag = 0.02 * (x / 0.42) ** 2
            row.append(bm.verts.new((x, y, roof - sag)))
        grid.append(row)
    for i in range(len(grid) - 1):
        for j in range(len(grid[0]) - 1):
            try:
                bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
            except ValueError:
                pass
    liner = new_mesh_object('headliner', bm)
    assign(liner, parts['headliner'])
    parent_keep(liner, group)
    return group


def _shrink_poly(poly, amount):
    cy = sum(point[0] for point in poly) / len(poly)
    cz = sum(point[1] for point in poly) / len(poly)
    shrunk = []
    for y, z in poly:
        dy, dz = y - cy, z - cz
        dist = math.hypot(dy, dz) or 1.0
        shrunk.append((y - dy / dist * amount, z - dz / dist * amount))
    return shrunk


def _poly_panel(name, poly, x, mat):
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z)) for y, z in poly]
    try:
        face = bm.faces.new(verts)
        face.smooth = True
    except ValueError:
        bm.free()
        raise
    return new_mesh_object(name, bm)


def subdivide_panel(obj, cuts):
    bm = _bm_from(obj)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts)
    _bm_to(obj, bm)


def project_onto(obj, target):
    """Move verts along X onto a surface so a flat pane takes the body's curve."""
    mod = obj.modifiers.new('Wrap', 'SHRINKWRAP')
    mod.target = target
    mod.wrap_method = 'PROJECT'
    mod.use_project_x = True
    mod.use_project_y = False
    mod.use_project_z = False
    mod.use_negative_direction = True
    mod.use_positive_direction = True
    apply_modifier(obj, mod.name)


def window_outline(samples=4):
    return _catmull(list(WINDOW_POLY) + [WINDOW_POLY[0]], samples)[:-1]


def sculpt_seat(group, side, parts):
    """One leather bucket: a crowned cushion, a curved back, and a separate headrest."""
    x_center = side * 0.36

    def grid_mesh(name, nu, nv, point_at, outward):
        bm = bmesh.new()
        grid = []
        for i in range(nu):
            row = []
            for j in range(nv):
                row.append(bm.verts.new(point_at(i / (nu - 1), j / (nv - 1))))
            grid.append(row)
        for i in range(nu - 1):
            for j in range(nv - 1):
                try:
                    bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
                except ValueError:
                    pass
        obj = _mesh_from_bm(name, bm, outward)
        assign(obj, parts['leather'])
        parent_keep(obj, group)
        return obj

    def cushion_point(u, v):
        edge = abs(v - 0.5) * 2.0
        y = -0.26 + u * 0.50
        x = x_center + (v - 0.5) * 0.48
        z = 0.40 + 0.05 * math.sin(u * math.pi) * (1.0 - 0.4 * edge) + 0.04 * edge ** 2
        return (x, y, z)

    def back_point(u, v):
        edge = abs(v - 0.5) * 2.0
        y = -0.20 - u * 0.18 + 0.03 * math.sin(u * math.pi) * (1.0 - edge)
        x = x_center + (v - 0.5) * (0.46 - 0.08 * u)
        z = 0.50 + u * 0.50 + 0.025 * edge ** 2
        return (x, y, z)

    thicken(grid_mesh(f'cushion-{side}', 10, 7, cushion_point, Vector((0.0, 0.0, 1.0))), 0.055)
    thicken(grid_mesh(f'back-{side}', 8, 7, back_point, Vector((0.0, 1.0, 0.25))), 0.045)
    for i, u in enumerate((0.28, 0.48, 0.68)):
        y, z = -0.20 - u * 0.18, 0.50 + u * 0.50
        box(f'stitch-{side}-{i}', (x_center, y + 0.02, z), (0.30, 0.008, 0.006), parts['stitch'], bevel=0.0, parent=group)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.09, location=(x_center, -0.36, 1.00))
    head = bpy.context.active_object
    head.name = f'headrest-{side}'
    head.scale = (1.15, 0.55, 0.72)
    bpy.ops.object.transform_apply(scale=True)
    for poly in head.data.polygons:
        poly.use_smooth = True
    assign(head, parts['leather'])
    parent_keep(head, group)
    shoulder = Vector((x_center + side * 0.06, -0.36, 0.98))
    buckle_at = Vector((side * 0.08, 0.06, 0.50))
    lap = Vector((x_center, 0.10, 0.48))
    cylinder_between(f'belt-shoulder-{side}', shoulder, buckle_at, 0.008, parts['belt'], group)
    cylinder_between(f'belt-lap-{side}', lap, buckle_at, 0.008, parts['belt'], group)
    box(f'buckle-{side}', buckle_at, (0.045, 0.03, 0.02), parts['buckle'], bevel=0.003, parent=group)


def thicken(obj, thickness):
    mod = obj.modifiers.new('Pad', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = -1
    mod.use_rim = True
    apply_modifier(obj, mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def plant_on_shoulder(obj, sign):
    """Keep glass off the roof crown. Verts that land inboard become the grey ears in front view."""
    for vert in obj.data.vertices:
        if abs(vert.co.x) < 0.50:
            vert.co.x = sign * 0.58
            vert.co.z = min(vert.co.z, 1.08)


def side_glass(side, glass_mat, door_obj):
    """Smooth pane draped on the door, just proud of the skin."""
    suffix = 'r' if side > 0 else 'l'
    sign = 1 if side > 0 else -1
    glass = _poly_panel(
        f'door-glass-{suffix}',
        _shrink_poly(window_outline(), 0.012),
        sign * 1.20,
        glass_mat,
    )
    subdivide_panel(glass, 2)
    project_onto(glass, door_obj)
    plant_on_shoulder(glass, sign)
    missed = 0
    for vert in glass.data.vertices:
        if abs(vert.co.x) > 0.95:
            missed += 1
            vert.co.x = sign * 0.82
        vert.co.x += sign * 0.006
    print('glass missed', suffix, missed)
    return glass


def add_window_frame(side, door_obj, mat):
    """Black border over the cut so a faceted boolean edge does not read as the frame."""
    sign = 1 if side > 0 else -1
    suffix = 'r' if side > 0 else 'l'
    outer = window_outline(5)
    inner = _shrink_poly(outer, 0.030)
    bm = bmesh.new()
    outer_verts = [bm.verts.new((sign * 1.12, y, z)) for y, z in outer]
    inner_verts = [bm.verts.new((sign * 1.12, y, z)) for y, z in inner]
    count = len(outer_verts)
    for i in range(count):
        j = (i + 1) % count
        try:
            bm.faces.new((outer_verts[i], outer_verts[j], inner_verts[j], inner_verts[i]))
        except ValueError:
            pass
    frame = new_mesh_object(f'door-frame-{suffix}', bm)
    assign(frame, mat)
    subdivide_panel(frame, 1)
    project_onto(frame, door_obj)
    plant_on_shoulder(frame, sign)
    missed = 0
    for vert in frame.data.vertices:
        if abs(vert.co.x) > 0.95:
            missed += 1
            vert.co.x = sign * 0.82
        vert.co.x += sign * 0.008
    print('frame missed', suffix, missed)
    return frame


def cut_window_bool(door, side):
    """One boolean, so the opening is a smooth loop instead of a quad stair."""
    sign = 1 if side > 0 else -1
    x0, x1 = (0.02, 1.35) if sign > 0 else (-1.35, -0.02)
    before = len(door.data.polygons)
    boolean_op(door, make_prism(f'win-cut-{side}', window_outline(), x0, x1), 'DIFFERENCE')
    after = len(door.data.polygons)
    print('window boolean', side, before, '->', after)
    if after < before * 0.35 or after > before * 3:
        raise RuntimeError(f'window boolean distorted the door ({before} -> {after})')


def add_header_bezel(windshield, mat):
    """Smooth strip over the windshield header. A full boundary ribbon followed the quad stair."""
    bm = _bm_from(windshield)
    boundary = [vert.co.copy() for vert in bm.verts if vert.is_boundary and vert.co.z > 0.95]
    bm.free()
    bins = {}
    for co in boundary:
        key = round(co.x * 25) / 25
        bins.setdefault(key, []).append(co)
    if len(bins) < 6:
        print('header bezel skipped', len(bins))
        return None
    header = [max(bins[key], key=lambda co: co.z) for key in sorted(bins)]
    for _ in range(4):
        smoothed = [header[0]]
        for i in range(1, len(header) - 1):
            smoothed.append((header[i - 1] + header[i] * 2.0 + header[i + 1]) * 0.25)
        smoothed.append(header[-1])
        header = smoothed
    normal = Vector((0.0, 0.42, 0.91)).normalized()
    mesh_bm = bmesh.new()
    rail0 = []
    rail1 = []
    count = len(header)
    for i, point in enumerate(header):
        tangent = header[min(count - 1, i + 1)] - header[max(0, i - 1)]
        if tangent.length < 1e-6:
            tangent = Vector((1.0, 0.0, 0.0))
        side = tangent.cross(normal)
        if side.length < 1e-6:
            side = Vector((1.0, 0.0, 0.0))
        side.normalize()
        rail0.append(mesh_bm.verts.new(point + side * 0.028 + normal * 0.006))
        rail1.append(mesh_bm.verts.new(point - side * 0.028 + normal * 0.006))
    for i in range(count - 1):
        try:
            mesh_bm.faces.new((rail0[i], rail0[i + 1], rail1[i + 1], rail1[i]))
        except ValueError:
            pass
    bezel = new_mesh_object('windshield-bezel', mesh_bm)
    assign(bezel, mat)
    return bezel


def add_plate(parts, root, tail_y):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.0, tail_y - 0.006, 0.42), rotation=(math.radians(90), 0.0, 0.0))
    plate = bpy.context.active_object
    plate.name = 'plate'
    plate.scale = (0.26, 0.13, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    assign(plate, parts['plate'])
    parent_keep(plate, root)


def bounds(obj):
    verts = world_verts(obj)
    xs = [vert.x for vert in verts]
    ys = [vert.y for vert in verts]
    zs = [vert.z for vert in verts]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def configure_render(engine):
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    if engine == 'CYCLES':
        scene.cycles.samples = 64
        scene.cycles.use_denoising = True
        try:
            scene.cycles.denoiser = 'OPENIMAGEDENOISE'
        except (TypeError, AttributeError):
            pass
        scene.cycles.device = 'CPU'
        scene.view_settings.view_transform = 'AgX'
        world = bpy.data.worlds.new('studio')
        scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes['Background']
        bg.inputs['Color'].default_value = (0.55, 0.57, 0.6, 1)
        bg.inputs['Strength'].default_value = 0.35
        bpy.ops.object.light_add(type='AREA', location=(4.2, 3.5, 3.2))
        key = bpy.context.active_object
        key.data.energy = 1800
        key.data.size = 2.4
        key.data.color = (1.0, 0.93, 0.84)
        look_at(key, Vector((0.0, 0.2, 0.6)))
        bpy.ops.object.light_add(type='AREA', location=(-3.5, -2.5, 2.2))
        fill = bpy.context.active_object
        fill.data.energy = 500
        fill.data.size = 3.0
        fill.data.color = (0.75, 0.82, 0.9)
        look_at(fill, Vector((0.0, 0.0, 0.6)))
        bpy.ops.object.light_add(type='AREA', location=(0.4, -4.5, 2.4))
        rim = bpy.context.active_object
        rim.data.energy = 900
        rim.data.size = 1.6
        look_at(rim, Vector((0.0, 0.0, 0.7)))
    else:
        shading = scene.display.shading
        shading.light = 'STUDIO'
        shading.studio_light = 'studio.sl'
        shading.color_type = 'MATERIAL'
        shading.show_shadows = False
        world = bpy.data.worlds.new('gray')
        scene.world = world
        world.color = (0.62, 0.64, 0.66)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0.0, 0.0, 0.0))
    ground = bpy.context.active_object
    ground.name = 'ground'
    assign(ground, make_material('ground', '#8d9094', 0.0, 0.85))
    return ground


def shoot(name, location, target, ortho=None, lens=50):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    look_at(cam, target)
    cam_data.clip_start = 0.05
    cam_data.clip_end = 80
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho
    else:
        cam_data.lens = lens
    scene.camera = cam
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    os.makedirs(RENDER_DIR, exist_ok=True)
    scene.render.filepath = os.path.join(PREVIEW_DIR, name + '.png')
    bpy.ops.render.render(write_still=True)
    shutil.copyfile(scene.render.filepath, os.path.join(RENDER_DIR, name + '.png'))
    print('rendered', scene.render.filepath)


def render_views(hinges):
    ground = configure_render(ENGINE)
    target = Vector((0.0, 0.05, 0.62))
    shoot('side', Vector((7.4, 0.05, 0.72)), target, ortho=5.2)
    shoot('front-3q', Vector((3.6, 5.6, 1.05)), Vector((0.0, 0.15, 0.6)))
    shoot('rear-3q', Vector((-3.6, -5.4, 1.05)), Vector((0.0, -0.2, 0.6)))
    shoot('front', Vector((0.02, 8.0, 0.72)), Vector((0.0, 0.0, 0.58)), ortho=2.6)
    stashed = []
    for spin, angle in hinges:
        stashed.append((spin, spin.animation_data.action))
        spin.animation_data.action = None
        spin.rotation_euler.y = angle
    bpy.context.view_layer.update()
    shoot('doors-open', Vector((4.2, 2.2, 1.05)), Vector((0.15, 0.1, 0.7)), lens=42)
    shoot('interior', Vector((1.35, 0.05, 0.95)), Vector((-0.05, -0.02, 0.62)), lens=32)
    for spin, action in stashed:
        spin.rotation_euler.y = 0.0
        spin.animation_data.action = action
    bpy.data.objects.remove(ground, do_unlink=True)


def build_lod(body):
    lod = body.copy()
    lod.data = body.data.copy()
    lod.name = 'body-lod1'
    bpy.context.scene.collection.objects.link(lod)
    mod = lod.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = 0.18
    bpy.context.view_layer.objects.active = lod
    lod.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    lod.select_set(False)
    return lod


def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')

    def walk(obj):
        obj.select_set(True)
        for child in obj.children:
            walk(child)

    walk(root)
    bpy.context.view_layer.objects.active = root


def export_glb(root):
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 24
    scene.frame_set(1)
    select_tree(root)
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_frame_range=True,
        export_cameras=False,
        export_lights=False,
        export_materials='EXPORT',
    )
    size = os.path.getsize(GLB_PATH)
    print('exported', GLB_PATH, size)
    pack = os.path.join('/tmp', 'cybercab-meshopt.glb')
    gltfpack = os.environ.get('GLTFPACK', 'gltfpack')
    if os.system(f'{gltfpack} -i "{GLB_PATH}" -o "{pack}" -cc -kn -km >/tmp/gltfpack.log 2>&1') == 0:
        os.replace(pack, GLB_PATH)
        print('meshopt', os.path.getsize(GLB_PATH))
    else:
        print('gltfpack skipped; see /tmp/gltfpack.log')


def make_prism(name, poly, x0, x1):
    """Closed prism extruded in X. Normals point out of the prism, not the car."""
    bm = bmesh.new()
    ring0 = [bm.verts.new((x0, y, z)) for y, z in poly]
    ring1 = [bm.verts.new((x1, y, z)) for y, z in poly]
    bm.faces.new(ring0)
    bm.faces.new(list(reversed(ring1)))
    for i in range(len(poly)):
        j = (i + 1) % len(poly)
        bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    centroid = sum((vert.co for vert in bm.verts), Vector()) / len(bm.verts)
    score = 0.0
    for face in bm.faces:
        score += face.normal.dot(face.calc_center_median() - centroid)
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def boolean_op(target, cutter, operation):
    before = len(target.data.polygons)
    mod = target.modifiers.new('Bool', 'BOOLEAN')
    mod.operation = operation
    mod.object = cutter
    mod.solver = 'EXACT'
    print('boolean', operation, target.name, 'faces', before, 'cutter', len(cutter.data.polygons), flush=True)
    apply_modifier(target, mod.name)
    print('boolean done', target.name, 'faces', len(target.data.polygons), flush=True)
    bpy.data.objects.remove(cutter, do_unlink=True)


def delete_cutter_faces(obj, poly, x0, x1):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = []
    for face in bm.faces:
        xs = [vert.co.x for vert in face.verts]
        span = max(xs) - min(xs)
        mean_x = sum(xs) / len(xs)
        if span < 0.008 and (abs(mean_x - x0) < 0.03 or abs(mean_x - x1) < 0.03):
            doomed.append(face)
            continue
        if all(nearest_on_polys(vert.co.y, vert.co.z, (poly,))[0] < 0.012 for vert in face.verts):
            doomed.append(face)
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
    loose = [vert for vert in bm.verts if not vert.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    print(obj.name, 'cutter faces removed', len(doomed), 'left', len(obj.data.polygons))


def cut_closed(shell, poly, x0, x1, name):
    """Remove a prism from a closed mesh and return the intersected chunk, still capped."""
    piece = shell.copy()
    piece.data = shell.data.copy()
    piece.name = name
    bpy.context.scene.collection.objects.link(piece)
    boolean_op(piece, make_prism(name + '-in', poly, x0, x1), 'INTERSECT')
    boolean_op(shell, make_prism(name + '-out', poly, x0, x1), 'DIFFERENCE')
    return piece


def classify_windshield(obj):
    count = 0
    for poly in obj.data.polygons:
        center = poly.center
        normal = poly.normal
        if abs(center.x) < 0.66 and normal.y > 0.22 and polygon_contains(center.y, center.z, WIND_POLY):
            poly.material_index = WINDSHIELD
            count += 1
        else:
            poly.material_index = BODY
    print('windshield faces', count)
    return count


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def main():
    reset_scene()
    parts = {
        'gold': make_material('paint-champagne', '#C9A66B', 0.72, 0.34, coat=1.0, coat_rough=0.07),
        'aero': make_material('paint-aero', '#C9A66B', 0.55, 0.40, coat=0.35, coat_rough=0.18),
        'trim': make_material('trim-black', '#141618', 0.08, 0.46),
        'inner': make_material('cabin-shell', '#1A1C1E', 0.0, 0.72),
        'rubber': make_material('rubber', '#121314', 0.0, 0.92),
        'groove': make_material('aero-groove', '#8A7E64', 0.35, 0.48),
        'disc': make_material('brake-disc', '#6E7378', 0.85, 0.35),
        'caliper': make_material('brake-caliper', '#3E3A36', 0.45, 0.42),
        'wind': make_material('windshield', '#16303A', 0.0, 0.04, transmission=0.82, ior=1.52, double_sided=True, viewport='#102028'),
        'glass_dark': make_material('side-glass', '#0E1A20', 0.0, 0.05, transmission=0.62, ior=1.52, double_sided=True, viewport='#0C1418'),
        'front_lamp': make_material('lamp-front', '#F4F7FF', 0.0, 0.18, emission='#F7F9FF', emission_strength=16),
        'rear_lamp': make_material('lamp-rear', '#FF2A22', 0.0, 0.22, emission='#FF1A12', emission_strength=12),
        'amber': make_material('lamp-amber', '#FF9A1F', 0.0, 0.3, emission='#FF8A00', emission_strength=4),
        'leather': make_material('leather', '#2A2E33', 0.0, 0.48, sheen=0.28),
        'stitch': make_material('stitch', '#6A6258', 0.0, 0.6),
        'carpet': make_material('carpet', '#1A1C1E', 0.0, 0.94),
        'dash': make_material('dash', '#D9D4C8', 0.02, 0.5),
        'accent': make_material('dash-accent', '#8C6844', 0.35, 0.4),
        'headliner': make_material('headliner', '#E4E0D6', 0.0, 0.84),
        'belt': make_material('belt', '#1A1A1A', 0.0, 0.55),
        'buckle': make_material('buckle', '#8E1E1E', 0.3, 0.4),
        'screen': make_material('screen', '#101418', 0.0, 0.22, emission='#243044', emission_strength=0.8),
        'plate': make_material('plate', '#F4F1E6', 0.0, 0.45),
    }

    shell = build_shell()
    apply_subsurf(shell, 2)
    kamm_tail(shell)
    door_poly = make_door_poly()
    wind_poly = roof_band(1.58, 0.22, below=0.30, above=0.02)

    knife_segments(shell, poly_segments(wind_poly), -0.78, 0.78, band=0.09)

    def wind_pred(face):
        center = face.calc_center_median()
        normal = face.normal
        return abs(center.x) < 0.70 and normal.y > 0.28 and polygon_contains(center.y, center.z, wind_poly)

    windshield = extract_faces(shell, wind_pred, 'windshield')
    inset_boundary(windshield, 0.003, keep_x=None)

    y_door = [point[0] for point in door_poly]
    for side in (1, -1):
        x0, x1 = (HINGE_X - 0.04, 1.15) if side > 0 else (-1.15, -HINGE_X + 0.04)
        knife_segments(shell, poly_segments(door_poly), x0, x1, band=0.04)
        knife_x_plane(shell, side * HINGE_X, min(y_door), max(y_door), 0.95)

    def door_pred(side):
        def pred(face):
            center = face.calc_center_median()
            if side > 0 and center.x < HINGE_X - 0.004:
                return False
            if side < 0 and center.x > -(HINGE_X - 0.004):
                return False
            return polygon_contains(center.y, center.z, door_poly)
        return pred

    door_metal_r = extract_faces(shell, door_pred(1), 'door-r-skin')
    door_metal_l = extract_faces(shell, door_pred(-1), 'door-l-skin')
    fair_boundaries(shell, cycles=3)
    for metal in (door_metal_r, door_metal_l):
        inset_boundary(metal, 0.003, keep_x=HINGE_X)
        fair_boundaries(metal, cycles=3, skip_hinge=True)

    cut_arches(shell)
    knife_z_plane(shell, 0.34, -1.55, 2.2)
    knife_z_plane(shell, 0.46, -2.3, -1.75)
    body = shell
    body.name = 'body'
    assign(body, parts['gold'], 0)
    solidify(body, 0.010, parts['inner'], parts['trim'])
    paint_cladding(body, parts['trim'])
    assign(windshield, parts['wind'], 0)
    header_bezel = add_header_bezel(windshield, parts['trim'])

    hinges = []
    for side, metal in (
        (1, door_metal_r),
        (-1, door_metal_l),
    ):
        assign(metal, parts['gold'], 0)
        glass = side_glass(side, parts['glass_dark'], metal)
        frame = add_window_frame(side, metal, parts['trim'])
        cut_window_bool(metal, side)
        fair_boundaries(metal, cycles=5, skip_hinge=True)
        solidify(metal, 0.008, parts['inner'], parts['trim'])
        suffix = 'r' if side > 0 else 'l'
        world_pts = [metal.matrix_world @ vert.co for vert in metal.data.vertices]
        xs = [point.x for point in world_pts]
        ys = [point.y for point in world_pts]
        inner_x = (min(xs) + 0.045) if side > 0 else (max(xs) - 0.045)
        mid_y = sum(ys) / len(ys)
        orient, spin = hinge_for(metal, f'door-hinge-{suffix}')
        parent_keep(metal, spin)
        parent_keep(glass, spin)
        parent_keep(frame, spin)
        metal.name = f'door-{suffix}'
        arm = box(
            f'armrest-{suffix}',
            (inner_x, mid_y - 0.02, 0.62),
            (0.045, 0.36, 0.04),
            parts['trim'],
            bevel=0.008,
        )
        parent_keep(arm, spin)
        card = box(
            f'door-card-{suffix}',
            (inner_x, mid_y - 0.04, 0.52),
            (0.03, 0.62, 0.28),
            parts['inner'],
            bevel=0.01,
        )
        parent_keep(card, spin)
        angle = DOOR_OPEN if side > 0 else -DOOR_OPEN
        key_open(spin, angle)
        hinges.append((spin, angle))

    root = empty('Cybercab', Vector((0.0, 0.0, 0.0)))
    lod0 = empty('lod0', Vector((0.0, 0.0, 0.0)), root)
    parent_keep(body, lod0)
    parent_keep(windshield, lod0)
    if header_bezel is not None:
        parent_keep(header_bezel, lod0)
    add_interior(parts, lod0)
    for orient_name in ('door-hinge-r-orient', 'door-hinge-l-orient'):
        parent_keep(bpy.data.objects[orient_name], lod0)
    for side in (-1, 1):
        for axle in (FRONT_AXLE_Y, REAR_AXLE_Y):
            add_wheel(side, axle, parts, root)
    add_lights(body, parts, lod0)
    add_chin(body, parts['trim'], lod0)
    add_rear_bumper(body, parts['trim'], lod0)
    add_cameras(body, parts, lod0)
    minx, maxx, miny, maxy, minz, maxz = bounds(body)
    add_plate(parts, lod0, miny)
    print(
        f'BODY bbox x {minx:.3f}..{maxx:.3f} ({maxx - minx:.3f}) '
        f'y {miny:.3f}..{maxy:.3f} ({maxy - miny:.3f}) z {minz:.3f}..{maxz:.3f}'
    )
    print('wheelbase', round(FRONT_AXLE_Y - REAR_AXLE_Y, 3))

    if DO_RENDER:
        render_views(hinges)

    lod = build_lod(body)
    parent_keep(lod, root)
    export_glb(root)
    bpy.ops.wm.save_as_mainfile(filepath='/tmp/cybercab.blend')


if __name__ == '__main__':
    main()
