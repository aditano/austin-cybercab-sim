"""Build the Cybercab model in Blender 5.2 from the parametric surface in surface.py.

  blender -b --factory-startup --python build.py -- [--out DIR]

Writes DIR/cybercab.blend and DIR/cybercab.glb (default DIR=/workspace/cybercab-blender).
Axes: +X right, +Y nose, +Z up, metres, origin on the ground at mid length.
glTF export converts to +Y up with the nose on -Z (three.js convention used by the sim).
"""
import bpy, bmesh, sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface as S
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[ARGS.index('--out') + 1] if '--out' in ARGS else '/workspace/cybercab-blender'
T0 = time.time()
DEBUG = '--debug' in ARGS
SOLVER = ARGS[ARGS.index('--solver') + 1] if '--solver' in ARGS else 'MANIFOLD'


def log(*a):
    print('[%6.1fs]' % (time.time() - T0), *a, flush=True)


# ------------------------------------------------------------------ materials
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1.0]


def mat(name, color, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.05, trans=0.0, ior=1.5,
        emit=None, emit_str=0.0, alpha=1.0, sheen=0.0, spec=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = srgb(color)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    b.inputs['IOR'].default_value = ior
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Transmission Weight'].default_value = trans
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Specular IOR Level'].default_value = spec
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = emit_str
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    m.diffuse_color = srgb(color)
    m.diffuse_color[3] = 1.0
    return m


def materials():
    M = {}
    M['paint'] = mat('paint-champagne', '#BFA36E', metal=0.75, rough=0.30, coat=0.65, coat_rough=0.10)
    M['trim'] = mat('trim-satin-black', '#1B1C1E', metal=0.0, rough=0.5)
    M['gloss_black'] = mat('trim-gloss-black', '#08090A', metal=0.0, rough=0.12, coat=0.8, coat_rough=0.03)
    M['inner'] = mat('cabin-shell', '#1A1B1D', rough=0.75)
    M['jamb'] = mat('door-jamb', '#0E0F10', rough=0.6)
    M['glass'] = mat('glass-tinted', '#070808', rough=0.04, alpha=0.42, ior=1.5, spec=0.5)
    M['glass_wind'] = mat('glass-windshield', '#0D0F0F', rough=0.04, alpha=0.33, ior=1.5, spec=0.5)
    M['frit'] = mat('glass-frit', '#050505', rough=0.15, coat=0.6, coat_rough=0.02)
    M['rubber'] = mat('tire-rubber', '#141414', rough=0.82, spec=0.3)
    M['rubber_side'] = mat('tire-sidewall', '#101010', rough=0.62, spec=0.3)
    M['aero'] = mat('aero-cover', '#A98A57', metal=0.65, rough=0.36, coat=0.35, coat_rough=0.12)
    M['aero_inner'] = mat('aero-cover-inner', '#9C7F50', metal=0.68, rough=0.30, coat=0.45, coat_rough=0.08)
    M['hub'] = mat('hub-cap', '#8E7E62', metal=0.9, rough=0.22)
    M['liner'] = mat('wheel-liner', '#0B0B0C', rough=0.9)
    M['lamp_w'] = mat('lamp-front', '#FFFFFF', rough=0.2, emit='#FFFFFF', emit_str=18.0)
    M['lamp_r'] = mat('lamp-rear', '#FF1A10', rough=0.25, emit='#FF1A10', emit_str=28.0)
    M['lamp_r_off'] = mat('lamp-rear-lens', '#5A0A08', rough=0.15, coat=0.6, emit='#FF1A10', emit_str=1.5)
    M['amber'] = mat('lamp-amber', '#FF8A10', rough=0.25, emit='#FF8000', emit_str=2.0)
    M['leather'] = mat('seat-leather', '#202124', rough=0.42, coat=0.15, coat_rough=0.3, sheen=0.3)
    M['leather_light'] = mat('seat-insert', '#2C2D30', rough=0.5, sheen=0.4)
    M['carpet'] = mat('carpet', '#151617', rough=0.95, spec=0.2)
    M['dash'] = mat('dash-soft', '#2A2B2D', rough=0.6)
    M['dash_light'] = mat('dash-trim-light', '#8F897E', rough=0.55)
    M['accent'] = mat('trim-accent', '#8C7A5C', metal=0.8, rough=0.3)
    M['screen'] = mat('screen', '#05070A', rough=0.08, coat=1.0, coat_rough=0.02, emit='#1E2C44', emit_str=1.2)
    M['screen_ui'] = mat('screen-ui', '#0A0F18', rough=0.1, emit='#6FA8FF', emit_str=2.5)
    M['headliner'] = mat('headliner', '#3A3A3C', rough=0.9)
    M['camera'] = mat('camera-lens', '#020203', rough=0.05, coat=1.0)
    M['plate'] = mat('plate-blank', '#E9E6DC', rough=0.5)
    return M


# ------------------------------------------------------------------ mesh utils
def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def mesh_from_bm(name, bm, mats=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    for m in (mats or []):
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def nonmanifold(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    n = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return n


def boolean(ob, cutter, op, solver=None):
    solver = solver or SOLVER
    m = ob.modifiers.new('bool', 'BOOLEAN')
    m.operation = op
    m.object = cutter
    m.solver = solver
    if solver == 'EXACT':
        m.material_mode = 'TRANSFER'
    apply_mods(ob)
    if DEBUG:
        log('  bool', op, ob.name, cutter.name, 'faces', len(ob.data.polygons), 'nonmanifold', nonmanifold(ob), 'cutter nm', nonmanifold(cutter))


def dup(ob, name):
    o = ob.copy()
    o.data = ob.data.copy()
    o.name = name
    return link(o)


def delete(ob):
    bpy.data.objects.remove(ob, do_unlink=True)


def set_all_mat(ob, m):
    ob.data.materials.clear()
    ob.data.materials.append(m)
    for p in ob.data.polygons:
        p.material_index = 0


def prism_x(name, poly_yz, x0, x1, m=None):
    """Prism from a (y, z) outline extruded along X between x0 and x1."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in poly_yz]
    b = [bm.verts.new((x1, y, z)) for y, z in poly_yz]
    n = len(poly_yz)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_from_bm(name, bm, [m] if m else None, smooth=False)
    ob.hide_render = True
    return ob


def prism_z(name, poly_xy, z0, z1, m=None):
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z0)) for x, y in poly_xy]
    b = [bm.verts.new((x, y, z1)) for x, y in poly_xy]
    n = len(poly_xy)
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_from_bm(name, bm, [m] if m else None, smooth=False)
    ob.hide_render = True
    return ob


def join(obs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    obs[0].name = name
    return obs[0]


def mirror_poly_x(poly):
    return [(-x, y) for x, y in poly][::-1]


def offset_poly(poly, d):
    """Offset a closed 2-D polygon outward by d (negative = inward). Polygon CCW or CW handled."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e1 = (p1 - p0).normalized()
        e2 = (p2 - p1).normalized()
        n1 = Vector((e1.y, -e1.x)) * sgn
        n2 = Vector((e2.y, -e2.x)) * sgn
        nb = (n1 + n2)
        if nb.length < 1e-6:
            nb = n1
        nb.normalize()
        cosh = max(0.35, nb.dot(n1))
        q = p1 + nb * (d / cosh)
        out.append((q.x, q.y))
    return out


def separate_by_side(ob, name_r, name_l):
    """Split a mesh into its +X and -X loose parts."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    left = [f for f in bm.faces if f.calc_center_median().x < 0]
    bml = bm.copy()
    bmesh.ops.delete(bm, geom=left, context='FACES')
    right_l = [f for f in bml.faces if f.calc_center_median().x >= 0]
    bmesh.ops.delete(bml, geom=right_l, context='FACES')
    r = dup(ob, name_r)
    bm.to_mesh(r.data)
    l = dup(ob, name_l)
    bml.to_mesh(l.data)
    bm.free()
    bml.free()
    delete(ob)
    return r, l


# ------------------------------------------------------------------ body
def body_surface(M):
    rows = S.grid()
    nu, nv = len(rows), len(rows[0])
    bm = bmesh.new()
    vid = {}

    def V(i, j, side):
        x, y, z = rows[i][j]
        on_c = (j == 0 or j == nv - 1 or abs(x) < 1e-7)
        key = (i, j, 0 if on_c else side)
        if key not in vid:
            vid[key] = bm.verts.new((0.0 if on_c else x * side, y, z))
        return vid[key]
    for side in (1, -1):
        for i in range(nu - 1):
            for j in range(nv - 1):
                q = [V(i, j, side), V(i + 1, j, side), V(i + 1, j + 1, side), V(i, j + 1, side)]
                uq = []
                for v in q:
                    if v not in uq:
                        uq.append(v)
                if len(uq) < 3:
                    continue
                if side < 0:
                    uq.reverse()
                try:
                    f = bm.faces.new(uq)
                except ValueError:
                    continue
                f.material_index = 1 if j < S.ROW_ROCK else 0
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_from_bm('body', bm, [M['paint'], M['trim'], M['inner'], M['inner']])
    return ob, rows


def solidify(ob, t, offset_mat=2):
    m = ob.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = t
    m.offset = -1.0
    m.use_even_offset = True
    m.use_quality_normals = True
    m.thickness_clamp = 1.0
    m.use_thickness_angle_clamp = True
    m.material_offset = offset_mat
    m.material_offset_rim = offset_mat
    apply_mods(ob)


# ------------------------------------------------------------------ outlines (side view y, z)
A_PILLAR = ((0.835, 0.930), (0.412, 1.338))   # photo traced A-pillar line (side plane)
DOOR_REAR = ((-0.516, 1.336), (-0.312, 0.340))
HINGE_X = 0.47            # door top edge on the roof (cut line)
DOOR_PIVOT = (0.80, 0.97, 0.78)   # right-door hinge point (mirror for left)
DOOR_UP = math.radians(74)        # rotation about the hinge X axis (rear of door rises)
DOOR_OUT = math.radians(95)       # then about Z (door swings outward)


def a_pillar_z(y, drop=0.0):
    (y0, z0), (y1, z1) = A_PILLAR
    return z0 + (y - y0) * (z1 - z0) / (y1 - y0) - drop


def door_outline():
    pts = [(-0.516, 1.80)]
    # rear edge
    (ya, za), (yb, zb) = DOOR_REAR
    pts += [(ya, za), (yb, zb + 0.0)]
    # bottom along rocker line (just above the black cladding boundary)
    y_arch = S.Y_FA - math.sqrt(0.44 ** 2 - (S.z_rock(0.92) + 0.004 - S.TIRE_R) ** 2)
    n = 20
    for i in range(1, n + 1):
        y = yb + (y_arch - yb) * i / n
        pts.append((y, S.z_rock(y) + 0.004))
    # around the front arch (r = 0.44) up to the junction with the front cut
    a0 = math.atan2(pts[-1][1] - S.TIRE_R, pts[-1][0] - S.Y_FA)
    if a0 < 0:
        a0 += 2 * math.pi      # go over the top of the arch (through 180 deg), not around the front
    yj = 1.075
    a1 = math.atan2(math.sqrt(0.44 ** 2 - (yj - S.Y_FA) ** 2), yj - S.Y_FA)
    for i in range(1, 13):
        a = a0 + (a1 - a0) * i / 12
        pts.append((S.Y_FA + 0.44 * math.cos(a), S.TIRE_R + 0.44 * math.sin(a)))
    # diagonal front cut to the A-pillar base, then along the A-pillar (1.5 cm below it)
    pts.append((0.861, a_pillar_z(0.861, 0.0) - 0.004))
    for i in range(1, 9):
        y = 0.861 + (0.432 - 0.861) * i / 8
        pts.append((y, a_pillar_z(y, 0.015)))
    pts.append((0.432, 1.80))
    return pts


def side_glass_outline():
    """Door glass + quarter glass as one outline (the door cut splits them)."""
    pts = []
    # bottom: quarter-window sill then door sill
    pts += [(-1.095, 1.168), (-0.80, 1.100), (-0.56, 1.040), (-0.535, 1.010), (-0.50, 0.995)]
    for i in range(1, 9):
        y = -0.50 + (0.80 + 0.50) * i / 8
        pts.append((y, 0.995 + (0.937 - 0.995) * (y + 0.50) / 1.30))
    # front: below the A-pillar
    for i in range(0, 9):
        y = 0.80 + (0.405 - 0.80) * i / 8
        pts.append((y, a_pillar_z(y, 0.042)))
    # top: under the roof rail
    for i in range(1, 13):
        y = 0.40 + (-1.07 - 0.40) * i / 12
        zr = S.z_rail(y) - 0.032
        pts.append((y, zr))
    return pts


def windshield_outline(inset=0.0):
    yb = 0.835
    xb = S.hw_rail(yb) - 0.045
    n = 12
    right = []
    for i in range(n + 1):                      # cowl: centre -> right corner
        x = xb * i / n
        right.append((x, 1.17 - (x / xb) ** 2 * (1.17 - yb)))
    for i in range(1, 10):                      # A-pillar: base -> header corner
        y = yb + (0.445 - yb) * i / 10
        right.append((S.hw_rail(y) - 0.045, y))
    right.append((S.hw_rail(0.445) - 0.045, 0.445))
    right.append((0.467, 0.445))
    for i in range(1, n):                       # header: corner -> centre
        x = 0.467 * (1 - i / n)
        right.append((x, 0.17 + (x / 0.467) ** 2 * (0.445 - 0.17)))
    right.append((0.0, 0.17))
    left = [(-x, y) for x, y in right[1:-1]][::-1]
    full = right + left
    if inset:
        full = offset_poly(full, -inset)
    return full


# ------------------------------------------------------------------ ribbons on the body surface
def row_point(rows, i, r):
    j = int(math.floor(r))
    t = r - j
    a, b = Vector(rows[i][j]), Vector(rows[i][min(j + 1, len(rows[i]) - 1)])
    return a.lerp(b, t)


def row_at_z(rows, i, z, j0, j1):
    """Fractional row where station i crosses height z, searching rows j0..j1."""
    for j in range(j0, j1):
        z0, z1 = rows[i][j][2], rows[i][j + 1][2]
        if (z0 - z) * (z1 - z) <= 0 and z0 != z1:
            return j + (z - z0) / (z1 - z0)
    return None


def surf_normal(rows, i, r):
    i0, i1 = max(0, i - 1), min(len(rows) - 1, i + 1)
    du = row_point(rows, i1, r) - row_point(rows, i0, r)
    dv = row_point(rows, i, min(r + 0.5, len(rows[0]) - 1.001)) - row_point(rows, i, max(r - 0.5, 0))
    n = du.cross(dv)
    if n.length < 1e-9:
        return Vector((0, 1, 0)), dv.normalized()
    return n.normalized(), dv.normalized()


def ribbon(name, rows, stations, r_lo, r_hi, offset, m, mirror=True, depth=0.0):
    """Strip between fractional rows r_lo(i)..r_hi(i) over station indices, offset along the normal."""
    bm = bmesh.new()
    for side in ((1, -1) if mirror else (1,)):
        prev = None
        for i in stations:
            lo, hi = r_lo(i), r_hi(i)
            if lo is None or hi is None:
                prev = None
                continue
            pa, pb = row_point(rows, i, lo), row_point(rows, i, hi)
            n, _ = surf_normal(rows, i, (lo + hi) / 2)
            if n.dot(Vector((pa.x, pa.y * 0.3, 0)) if abs(pa.x) > 1e-4 else Vector((0, 1 if pa.y > 0 else -1, 0))) < 0:
                n = -n
            pa = pa + n * offset
            pb = pb + n * offset
            if side < 0:
                pa = Vector((-pa.x, pa.y, pa.z))
                pb = Vector((-pb.x, pb.y, pb.z))
            va, vb = bm.verts.new(pa), bm.verts.new(pb)
            if prev:
                f = [prev[0], va, vb, prev[1]]
                if side < 0:
                    f.reverse()
                bm.faces.new(f)
            prev = (va, vb)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    ob = mesh_from_bm(name, bm, [m])
    if depth:
        mm = ob.modifiers.new('s', 'SOLIDIFY')
        mm.thickness = depth
        mm.offset = 1.0
        apply_mods(ob)
    return ob


# ------------------------------------------------------------------ wheels
def revolve(name, prof, segs, mats_idx, M_list):
    """Revolve (radius, x) profile around the X axis. mats_idx: material index per profile segment."""
    bm = bmesh.new()
    ring = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        ring.append([bm.verts.new((x, r * math.cos(a), r * math.sin(a))) for r, x in prof])
    for k in range(segs):
        r0, r1 = ring[k], ring[(k + 1) % segs]
        for s in range(len(prof) - 1):
            f = bm.faces.new((r0[s], r0[s + 1], r1[s + 1], r1[s]))
            f.material_index = mats_idx[s]
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bm(name, bm, M_list)


def wheel(name, side, M):
    """Wheel mesh with origin at its centre. Outboard face toward +X*side."""
    R = S.TIRE_R
    W = 0.225
    # profile from inboard (x<0) to outboard (x>0), radius r
    tire = [
        (0.24, -W / 2 + 0.01), (0.27, -W / 2 - 0.002), (0.31, -W / 2 - 0.010), (R - 0.03, -W / 2 - 0.004),
        (R - 0.008, -W / 2 + 0.025), (R, -W / 2 + 0.055), (R, 0.0), (R, W / 2 - 0.055),
        (R - 0.008, W / 2 - 0.025), (R - 0.03, W / 2 + 0.004), (R - 0.05, W / 2 + 0.012),
        (0.300, W / 2 + 0.012), (0.290, W / 2 + 0.006),
    ]
    tm = [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1]
    t = revolve(name + '-tire', tire, 72, tm, [M['rubber'], M['rubber_side']])
    xo = W / 2 + 0.006
    # domed aero cover: small hub, convex inner disc, stepped outer ring, recessed edge
    cover = [
        (0.0, xo + 0.040), (0.020, xo + 0.040), (0.028, xo + 0.034), (0.040, xo + 0.031),
        (0.12, xo + 0.026), (0.19, xo + 0.016), (0.228, xo + 0.008), (0.234, xo + 0.002),
        (0.240, xo - 0.001), (0.262, xo - 0.003), (0.274, xo - 0.008), (0.278, xo - 0.016),
        (0.276, xo - 0.040), (0.22, xo - 0.05), (0.0, xo - 0.05),
    ]
    cm = [2, 2, 2, 0, 0, 0, 0, 1, 1, 1, 1, 3, 3, 3]
    c = revolve(name + '-cover', cover, 72, cm, [M['aero_inner'], M['aero'], M['hub'], M['liner']])
    w = join([t, c], name)
    if side < 0:
        for v in w.data.vertices:
            v.co.x = -v.co.x
        w.data.flip_normals()
    for p in w.data.polygons:
        p.use_smooth = True
    return w


def empty(name, loc, parent=None, kind='PLAIN_AXES', size=0.2):
    e = link(bpy.data.objects.new(name, None))
    e.empty_display_type = kind
    e.empty_display_size = size
    e.location = loc
    if parent:
        e.parent = parent
    return e


def parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw


def set_origin(ob, point):
    """Move object origin to world point without moving geometry."""
    mw = ob.matrix_world
    local = mw.inverted() @ Vector(point)
    ob.data.transform(Matrix.Translation(-local))
    ob.matrix_world = mw @ Matrix.Translation(local)


# ------------------------------------------------------------------ interior
def rounded_box(name, center, size, m, bevel=0.03, segs=3, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = mesh_from_bm(name, bm, [m])
    b = ob.modifiers.new('bev', 'BEVEL')
    b.width = bevel
    b.segments = segs
    b.limit_method = 'NONE'
    ob.location = center
    ob.rotation_euler = rot
    apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def seat(name, x, M):
    parts = []
    # cushion
    parts.append(rounded_box(name + '-cushion', (x, -0.30, 0.47), (0.50, 0.52, 0.13), M['leather'], 0.05, 4))
    # bolsters
    for s in (-1, 1):
        parts.append(rounded_box(name + '-bolster', (x + s * 0.235, -0.31, 0.52), (0.07, 0.50, 0.12), M['leather'], 0.03, 3))
    # back (reclined ~22 deg), with integrated head part
    back = rounded_box(name + '-back', (x, -0.62, 0.86), (0.50, 0.14, 0.70), M['leather'], 0.06, 4, rot=(math.radians(-20), 0, 0))
    parts.append(back)
    for s in (-1, 1):
        parts.append(rounded_box(name + '-wing', (x + s * 0.235, -0.60, 0.80), (0.07, 0.16, 0.56), M['leather'], 0.03, 3, rot=(math.radians(-20), 0, 0)))
    insert = rounded_box(name + '-insert', (x, -0.545, 0.84), (0.34, 0.03, 0.52), M['leather_light'], 0.012, 2, rot=(math.radians(-20), 0, 0))
    parts.append(insert)
    parts.append(rounded_box(name + '-base', (x, -0.30, 0.36), (0.42, 0.44, 0.10), M['trim'], 0.02, 2))
    return join(parts, name)


def interior(M):
    obs = []
    obs.append(rounded_box('floor', (0, -0.05, 0.27), (1.50, 1.90, 0.04), M['carpet'], 0.01, 1))
    obs.append(seat('seat-r', 0.33, M))
    obs.append(seat('seat-l', -0.33, M))
    obs.append(rounded_box('console', (0, -0.30, 0.50), (0.13, 0.62, 0.16), M['dash'], 0.03, 3))
    obs.append(rounded_box('rear-bulkhead', (0, -0.98, 0.70), (1.45, 0.06, 0.80), M['inner'], 0.02, 2))
    # dash: low wide shelf with light lower trim and a thin accent
    obs.append(rounded_box('dash', (0, 0.70, 0.80), (1.40, 0.42, 0.10), M['dash'], 0.04, 3))
    obs.append(rounded_box('dash-lower', (0, 0.62, 0.68), (1.38, 0.30, 0.14), M['dash_light'], 0.04, 3))
    obs.append(rounded_box('dash-accent', (0, 0.475, 0.735), (1.36, 0.012, 0.012), M['accent'], 0.004, 1))
    # big centre screen, landscape, tilted back
    obs.append(rounded_box('screen-bezel', (0, 0.60, 1.00), (0.52, 0.025, 0.31), M['trim'], 0.012, 2, rot=(math.radians(-18), 0, 0)))
    obs.append(rounded_box('screen', (0, 0.587, 1.002), (0.49, 0.004, 0.28), M['screen'], 0.003, 1, rot=(math.radians(-18), 0, 0)))
    obs.append(rounded_box('screen-stand', (0, 0.66, 0.88), (0.10, 0.06, 0.14), M['trim'], 0.01, 2))
    return join(obs, 'interior')


# ------------------------------------------------------------------ animation
def keyframes(ob, path, channels, interp='BEZIER', name='Anim'):
    """channels: {index: [(frame, value), ...]} keyed into one action, pushed to an NLA track `name`."""
    frames = sorted({f for pts in channels.values() for f, _ in pts})
    for idx, pts in channels.items():
        for f, v in pts:
            getattr(ob, path)[idx] = v
            ob.keyframe_insert(path, index=idx, frame=f)
    ad = ob.animation_data
    act = ad.action
    try:
        from bpy_extras.anim_utils import action_get_channelbag_for_slot
        fcs = action_get_channelbag_for_slot(act, ad.action_slot).fcurves
    except Exception:
        fcs = act.fcurves
    for fc in fcs:
        for k in fc.keyframe_points:
            k.interpolation = interp
            if interp == 'BEZIER':
                k.easing = 'EASE_IN_OUT'
    act.name = name + '-' + ob.name
    track = ad.nla_tracks.new()
    track.name = name
    st = track.strips.new(name, int(frames[0]), act)
    st.name = name
    ad.action = None
    for idx, pts in channels.items():
        getattr(ob, path)[idx] = pts[0][1]


# ------------------------------------------------------------------ main
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    M = materials()

    body, rows = body_surface(M)
    log('surface', len(body.data.polygons))
    solidify(body, 0.008)
    log('solid', len(body.data.polygons))

    jamb = M['jamb']
    # wheel arches (both sides, joined cutter)
    cyls = []
    for y in (S.Y_FA, S.Y_RA):
        for sd in (1, -1):
            bpy.ops.mesh.primitive_cylinder_add(radius=S.ARCH_R, depth=0.9, vertices=96,
                                                location=(sd * 0.85, y, S.TIRE_R), rotation=(0, math.pi / 2, 0))
            cyls.append(bpy.context.active_object)
    arch = join(cyls, 'cut-arches')
    arch.data.materials.append(M['liner'])
    arch.hide_render = True
    boolean(body, arch, 'DIFFERENCE')
    log('arches')

    # windshield
    ws_out = prism_z('cut-ws-out', windshield_outline(), 0.86, 1.9, jamb)
    ws_in = prism_z('cut-ws-in', windshield_outline(0.028), 0.80, 1.95, jamb)
    ws = dup(body, 'windshield')
    boolean(ws, ws_out, 'INTERSECT')
    boolean(body, ws_out, 'DIFFERENCE')
    ws_frit = dup(ws, 'windshield-frit')
    boolean(ws, ws_in, 'INTERSECT')
    boolean(ws_frit, ws_in, 'DIFFERENCE')
    set_all_mat(ws, M['glass_wind'])
    set_all_mat(ws_frit, M['frit'])
    log('windshield', len(ws.data.polygons))

    # doors (both sides in one cutter each)
    dpoly = door_outline()
    d_small = join([prism_x('cut-door-s-r', offset_poly(dpoly, -0.002), HINGE_X + 0.002, 1.3, jamb),
                    prism_x('cut-door-s-l', offset_poly(dpoly, -0.002), -1.3, -HINGE_X - 0.002, jamb)], 'cut-door-s')
    d_big = join([prism_x('cut-door-b-r', offset_poly(dpoly, 0.002), HINGE_X - 0.002, 1.3, jamb),
                  prism_x('cut-door-b-l', offset_poly(dpoly, 0.002), -1.3, -HINGE_X + 0.002, jamb)], 'cut-door-b')
    doors = dup(body, 'doors')
    boolean(doors, d_small, 'INTERSECT')
    boolean(body, d_big, 'DIFFERENCE')
    log('doors', len(doors.data.polygons))

    # side glass: door part and quarter part
    gpoly = side_glass_outline()
    g_out = join([prism_x('cut-g-r', gpoly, 0.44, 1.3, jamb), prism_x('cut-g-l', gpoly, -1.3, -0.44, jamb)], 'cut-g')
    g_in = join([prism_x('cut-gi-r', offset_poly(gpoly, -0.022), 0.40, 1.3, jamb),
                 prism_x('cut-gi-l', offset_poly(gpoly, -0.022), -1.3, -0.40, jamb)], 'cut-gi')
    pieces = {}
    for src, key in ((doors, 'door'), (body, 'quarter')):
        g = dup(src, key + '-glass')
        boolean(g, g_out, 'INTERSECT')
        boolean(src, g_out, 'DIFFERENCE')
        fr = dup(g, key + '-frit')
        boolean(g, g_in, 'INTERSECT')
        boolean(fr, g_in, 'DIFFERENCE')
        set_all_mat(g, M['glass'])
        set_all_mat(fr, M['frit'])
        pieces[key] = (g, fr)
    log('side glass')

    for o in (arch, ws_out, ws_in, d_small, d_big, g_out, g_in):
        delete(o)

    # split door pieces into right / left
    door_r, door_l = separate_by_side(doors, 'door-r', 'door-l')
    dg_r, dg_l = separate_by_side(pieces['door'][0], 'door-glass-r', 'door-glass-l')
    df_r, df_l = separate_by_side(pieces['door'][1], 'door-frit-r', 'door-frit-l')
    qg, qf = pieces['quarter']
    qg.name, qf.name = 'quarter-glass', 'quarter-frit'

    # glass as a single outer skin (thin alpha glass): drop inner-shell faces of the solidified slab
    for g in (ws, qg, dg_r, dg_l):
        bm = bmesh.new(); bm.from_mesh(g.data)
        kill = []
        for f in bm.faces:
            c = f.calc_center_median()
            out = Vector((c.x, 0.0, c.z - 0.70))
            if out.length > 1e-6 and f.normal.dot(out.normalized()) < -0.02:
                kill.append(f)
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(g.data); bm.free()
        log('glass skin', g.name, len(g.data.polygons))

    # ---------------- lights
    nst = len(rows)
    ys = [rows[i][0][1] for i in range(nst)]
    front_st = [i for i in range(nst) if rows[i][S.NV - 1][1] > 1.74]
    rear_st = [i for i in range(nst) if ys[i] < -1.97]

    def rz(i, z, j0, j1):
        return row_at_z(rows, i, z, j0, j1)
    # front: thin white bar on the hood's leading edge with a black channel below (heights by |x|)
    def zlb(i):
        x = abs(rows[i][S.ROW_SH][0])
        return 0.660 + 0.11 * min(1.0, x / 0.86) ** 2.8
    def fz(dz):
        return lambda i: rz(i, zlb(i) + dz, S.ROW_ROCK, S.NV - 1)
    bar = ribbon('lamp-front', rows, front_st, fz(-0.0045), fz(0.0045), 0.0028, M['lamp_w'])
    chan = ribbon('lamp-front-channel', rows, front_st, fz(-0.020), fz(0.006), 0.0014, M['gloss_black'])
    # rear: black band under the deck lip with a red bar
    zr0 = min(S.z_rail(ys[i]) for i in rear_st)
    rb_lo = lambda i: rz(i, zr0 - 0.068, S.ROW_ROCK, S.ROW_RAIL)
    rb_hi = lambda i: rz(i, S.z_rail(ys[i]) - 0.006, S.ROW_ROCK, S.ROW_RAIL + 1)
    rband = ribbon('tail-band', rows, rear_st, rb_lo, rb_hi, 0.0012, M['gloss_black'])
    rl_lo = lambda i: rz(i, zr0 - 0.054, S.ROW_ROCK, S.ROW_RAIL)
    rl_hi = lambda i: rz(i, zr0 - 0.030, S.ROW_ROCK, S.ROW_RAIL)
    rlamp = ribbon('lamp-rear', rows, rear_st, rl_lo, rl_hi, 0.0028, M['lamp_r'])
    # lower rear corner lamps
    low_st = [i for i in range(nst) if -2.16 < ys[i] < -1.84 and rows[i][S.ROW_ROCK + 1][0] > 0.42]
    ll = ribbon('lamp-rear-low', rows, low_st, lambda i: S.ROW_ROCK + 0.25, lambda i: S.ROW_ROCK + 0.55, 0.002, M['lamp_r'])
    log('lights')

    # ---------------- wheels
    root = empty('Cybercab', (0, 0, 0), kind='ARROWS', size=0.5)
    wheels = {}
    for y, ax in ((S.Y_FA, 'f'), (S.Y_RA, 'r')):
        for sd, s in ((1, 'r'), (-1, 'l')):
            key = ax + s
            w = wheel('wheel-spin-' + key, sd, M)
            loc = (sd * S.WHEEL_X, y, S.TIRE_R)
            if ax == 'f':
                steer = empty('wheel-steer-' + key, loc, root)
                w.parent = steer
                w.location = (0, 0, 0)
            else:
                w.parent = root
                w.location = loc
            wheels[key] = w
    # wheel-well liners (upper arcs only)
    liners = []
    for y in (S.Y_FA, S.Y_RA):
        for sd in (1, -1):
            bm = bmesh.new()
            segs = 48
            a0, a1 = math.radians(-12), math.radians(192)
            r = S.ARCH_R - 0.004
            xs = (sd * 0.45, sd * 0.875)
            ring = []
            for k in range(segs + 1):
                a = a0 + (a1 - a0) * k / segs
                ring.append([bm.verts.new((x, y + r * math.cos(a), S.TIRE_R + r * math.sin(a))) for x in xs])
            for k in range(segs):
                bm.faces.new((ring[k][0], ring[k + 1][0], ring[k + 1][1], ring[k][1]))
            cap = [ring[k][0] for k in range(segs + 1)]
            bm.faces.new(cap)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            for f in bm.faces:
                f.normal_flip()
            liners.append(mesh_from_bm('liner', bm, [M['liner']]))
    liner = join(liners, 'wheel-liners')
    log('wheels')

    # ---------------- interior
    cab = interior(M)

    # ---------------- doors: dihedral (butterfly) hinges at the front of each door, low on the fender line
    hinges = {}
    for d, g, fr, sd, s in ((door_r, dg_r, df_r, 1, 'r'), (door_l, dg_l, df_l, -1, 'l')):
        piv = Vector((sd * DOOR_PIVOT[0], DOOR_PIVOT[1], DOOR_PIVOT[2]))
        h = empty('door-hinge-' + s, piv, root, kind='ARROWS', size=0.25)
        h.rotation_mode = 'XYZ'
        bpy.context.view_layer.update()
        for o in (d, g, fr):
            set_origin(o, piv)
            parent_keep(o, h)
        hinges[s] = (h, sd)
        log('hinge', s, tuple(round(c, 3) for c in piv))

    # parent body parts to root
    for o in (body, ws, ws_frit, qg, qf, bar, chan, rband, rlamp, ll, liner, cab):
        parent_keep(o, root)

    # ---------------- animation: door open (frames 1-40), wheel spin (1-25 one turn)
    sc.frame_start, sc.frame_end = 1, 40
    for s, (h, sd) in hinges.items():
        keyframes(h, 'rotation_euler', {0: [(1, 0.0), (40, -DOOR_UP)], 2: [(1, 0.0), (40, sd * DOOR_OUT)]}, 'BEZIER', 'DoorsOpen')
    for key, w in wheels.items():
        w.rotation_mode = 'XYZ'
        keyframes(w, 'rotation_euler', {0: [(1, 0.0), (25, -2 * math.pi)]}, 'LINEAR', 'WheelSpin')

    # stats
    tris = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type == 'MESH' and not o.hide_render:
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            o.evaluated_get(dg).to_mesh_clear()
    log('triangles', tris)

    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'cybercab.blend'))
    log('saved blend')
    if '--no-export' not in ARGS:
        export(root)


def export(root):
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)
    sel(root)
    path = os.path.join(OUT, 'cybercab.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_cameras=False, export_lights=False,
        export_materials='EXPORT', export_image_format='AUTO')
    log('glb', path, os.path.getsize(path))


if __name__ == '__main__':
    main()
