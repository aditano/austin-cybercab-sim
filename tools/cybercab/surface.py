"""Parametric Cybercab body surface (pure Python, no bpy).

Axes (Blender): +X right, +Y nose, +Z up, origin on the ground at mid length.
Every station is a half cross-section described by 8 control points
(bottom centre -> top centre) joined by a centripetal Catmull-Rom spline.
Profile values are monotone-cubic (PCHIP) functions of y traced from the
reference photos (see ../../cybercab-ref/index.md and scripts/sfcam.py).
"""
import math

# ---------------------------------------------------------------- dimensions
LENGTH = 4.35          # encyCARpedia 4,350 mm (third party), consistent with SF photo fit
WIDTH = 1.754          # Tesla rider guide (published)
HEIGHT = 1.408         # Tesla rider guide (published)
CLEARANCE = 0.144      # Tesla rider guide (published)
WHEELBASE = 2.635      # encyCARpedia 2,635 mm (third party), matches SF photo fit (2.636)
Y_NOSE = 2.19
Y_TAIL = -2.16
Y_FA = 1.36            # front axle
Y_RA = Y_FA - WHEELBASE
TIRE_R = 0.372
WHEEL_X = 0.728        # wheel centre plane (track ~1.48 m, estimate)
ARCH_R = 0.425
HW = WIDTH / 2.0

# nose / tail plan rounding
Y_NS = 1.56            # nose rounding starts here
Y_TS = -2.04           # tail rounding starts late: the haunch stays full width, then a short corner
P_NOSE = 2.05
P_TAIL = 7.0           # plan-view corner tighter than the old round superellipse (was 4)


def pchip(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(pts)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0] + m[0] * (x - xs[0]) * 0.0
        if x >= xs[-1]:
            return ys[-1]
        lo, hi = 0, n - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if xs[mid] <= x:
                lo = mid
            else:
                hi = mid
        t = (x - xs[lo]) / h[lo]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h[lo] * m[lo]
                + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h[hi - 1] * m[hi])
    return f


# ---------------------------------------------------------------- profiles
# Centre-line top (roof, deck, windshield, hood). Traced from the SF profile,
# scaled so the roof peak is the published 1.408 m.
_TOP = [(-2.16, 0.905), (-2.00, 0.962), (-1.774, 1.025), (-1.547, 1.112), (-1.32, 1.200),
        (-1.092, 1.271), (-0.864, 1.326), (-0.635, 1.369), (-0.407, 1.397), (-0.178, 1.419),
        (0.05, 1.426), (0.172, 1.415), (0.402, 1.378), (0.634, 1.291), (0.867, 1.149),
        (0.983, 1.059), (1.10, 0.985), (1.238, 0.945), (1.331, 0.928), (1.561, 0.878),
        (1.792, 0.815), (2.024, 0.745), (2.14, 0.712), (2.19, 0.684)]
_k = HEIGHT / 1.426
z_top = pchip([(y, z * _k) for y, z in _TOP])

z_bot = pchip([(-2.16, 0.27), (-2.0, 0.225), (-1.80, 0.19), (-1.55, 0.165), (-1.1, 0.155),
               (1.1, 0.155), (1.55, 0.165), (1.80, 0.195), (2.00, 0.24), (2.12, 0.285), (2.19, 0.33)])

hw_max = pchip([(-2.16, 0.858), (-1.60, 0.874), (-1.25, HW), (-0.6, 0.872), (0.4, 0.868),
                (1.0, 0.870), (1.40, 0.872), (1.80, 0.866), (2.19, 0.86)])
z_wide = pchip([(-2.16, 0.64), (-1.3, 0.62), (0.0, 0.58), (1.36, 0.56), (2.19, 0.55)])

# rocker top / black cladding boundary (side plane from SF photo; ends from rear/front views)
z_rock = pchip([(-2.16, 0.530), (-1.95, 0.525), (-1.70, 0.49), (-1.30, 0.415), (-0.844, 0.362),
                (-0.281, 0.346), (0.241, 0.330), (0.891, 0.320), (1.36, 0.33), (1.75, 0.345),
                (2.0, 0.35), (2.19, 0.355)])

# shoulder / belt (window sill along the doors, fender shoulder in front, haunch at the rear)
z_sh = pchip([(-2.16, 0.81), (-1.85, 0.875), (-1.30, 0.975), (-0.80, 0.990), (-0.50, 0.990),
              (0.00, 0.975), (0.40, 0.960), (0.835, 0.925), (1.00, 0.885), (1.36, 0.815),
              (1.82, 0.712), (2.03, 0.695), (2.19, 0.655)])
hw_sh = pchip([(-2.16, 0.838), (-1.85, 0.850), (-1.30, 0.858), (-0.80, 0.820), (-0.30, 0.800),
               (0.30, 0.800), (0.835, 0.805), (1.00, 0.815), (1.36, 0.825), (1.82, 0.835),
               (2.19, 0.84)])

# rail: roof edge, rear deck crease, A-pillar, then the fender crest beside the hood
hw_rail = pchip([(-2.16, 0.795), (-1.85, 0.765), (-1.30, 0.665), (-0.90, 0.590), (-0.50, 0.550),
                 (0.00, 0.535), (0.41, 0.550), (0.55, 0.590), (0.70, 0.645), (0.835, 0.700),
                 (0.95, 0.690), (1.36, 0.655), (1.80, 0.620), (2.19, 0.600)])
z_rail = pchip([(-2.16, 0.852), (-1.80, 0.975), (-1.30, 1.150), (-0.864, 1.255), (-0.40, 1.315),
                (0.00, 1.340), (0.30, 1.330), (0.412, 1.315), (0.55, 1.205), (0.70, 1.060),
                (0.835, 0.930), (0.95, 0.935), (1.10, 0.940), (1.36, 0.935), (1.80, 0.840),
                (2.05, 0.760), (2.19, 0.676)])


def end_factor(y):
    """Plan-view rounding of nose and tail: (width factor)."""
    if y > Y_NS:
        t = min(1.0, (y - Y_NS) / (Y_NOSE - Y_NS))
        return max(0.0, 1.0 - t ** P_NOSE) ** (1.0 / P_NOSE)
    if y < Y_TS:
        t = min(1.0, (Y_TS - y) / (Y_TS - Y_TAIL))
        return max(0.0, 1.0 - t ** P_TAIL) ** (1.0 / P_TAIL)
    return 1.0


def rear_shape(y):
    """0 through the doors, 1 at the tail. The haunch crease fades in behind the cabin."""
    if y >= -0.95:
        return 0.0
    if y <= -2.05:
        return 1.0
    u = (-0.95 - y) / (2.05 - 0.95)
    return u * u * (3.0 - 2.0 * u)


def section_ctrl(y):
    """8 control points (x, z) from bottom centre to top centre, before end rounding."""
    zt, zb = z_top(y), z_bot(y)
    hw = hw_max(y)
    zr = z_rail(y)
    hr = hw_rail(y)
    zs = min(z_sh(y), zr - 0.012)
    hs = hw_sh(y)
    zk = z_rock(y)
    zw = min(z_wide(y), zs - 0.06)
    zw = max(zw, zk + 0.08)
    tuck = rear_shape(y)
    # Shoulder becomes the outer corner. The panel under it falls inward
    # toward the bumper instead of ballooning past the belt line.
    hs = hs + ((hw - 0.004) - hs) * tuck
    hr = hr + (min(hs - 0.016, hr + 0.04) - hr) * tuck
    # The panel under the belt pulls in so the haunch reads as a flat face
    # with a ridge, rather than a barrel between the rocker and the deck.
    hw_low = hw - 0.11 * tuck
    crown = 0.22 * (1.0 - 0.82 * tuck)
    mid_z = zt - (zt - zr) * crown if zr < zt else zt + (zr - zt) * 0.15
    p = [
        (0.0, zb),
        (hw_low - 0.085, zb),
        (hw_low - 0.012, zk),
        (hw_low, zw),
        (hs, zs),
        (hr, zr),
        (hr * 0.46, mid_z),
        (0.0, zt),
    ]
    return p


# Points per span between consecutive control points (rows land exactly on control points)
SPAN = [4, 4, 6, 7, 11, 8, 6]
ROW_ROCK = sum(SPAN[:2])     # row index of the rocker boundary
ROW_SH = sum(SPAN[:4])
ROW_RAIL = sum(SPAN[:5])
NV = sum(SPAN) + 1


def _cr(p0, p1, p2, p3, t, alpha=0.5):
    def tj(ti, a, b):
        return ti + max(1e-9, math.dist(a, b)) ** alpha
    t0 = 0.0
    t1 = tj(t0, p0, p1)
    t2 = tj(t1, p1, p2)
    t3 = tj(t2, p2, p3)
    tt = t1 + (t2 - t1) * t

    def lerp(a, b, ta, tb):
        if tb - ta < 1e-12:
            return a
        w = (tt - ta) / (tb - ta)
        return (a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w)
    a1 = lerp(p0, p1, t0, t1)
    a2 = lerp(p1, p2, t1, t2)
    a3 = lerp(p2, p3, t2, t3)
    b1 = lerp(a1, a2, t0, t2)
    b2 = lerp(a2, a3, t1, t3)
    return lerp(b1, b2, t1, t2)


# crease sharpness (0 smooth .. 1 hard corner) at control points 3 (low haunch), 4 (shoulder), 5 (rail)
crease5 = pchip([(-2.16, 1.0), (-1.0, 1.0), (-0.55, 0.0), (0.30, 0.0), (0.50, 0.45), (0.835, 0.55),
                 (1.0, 0.85), (2.19, 0.85)])
crease4 = pchip([(-2.16, 1.0), (-1.90, 1.0), (-1.55, 1.0), (-1.20, 0.92), (-0.85, 0.35),
                 (-0.20, 0.0), (1.50, 0.0), (1.85, 0.55), (2.19, 0.55)])
crease3 = pchip([(-2.16, 1.0), (-1.75, 0.9), (-1.25, 0.55), (-0.70, 0.0), (2.19, 0.0)])


def _lerp2(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def section_points(y):
    c = section_ctrl(y)
    ext = [(-c[1][0], c[1][1])] + c + [(-c[6][0], c[6][1])]
    cr = {3: crease3(y), 4: crease4(y), 5: crease5(y)}
    out = []
    for i in range(7):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        # p1 = c[i], p2 = c[i+1]
        if (i + 1) in cr and cr[i + 1] > 0:       # crease at the span's end point
            k = cr[i + 1]
            p3 = _lerp2(p3, (2 * p2[0] - p1[0], 2 * p2[1] - p1[1]), k)
        if i in cr and cr[i] > 0:                 # crease at the span's start point
            k = cr[i]
            p0 = _lerp2(p0, (2 * p1[0] - p2[0], 2 * p1[1] - p2[1]), k)
        n = SPAN[i]
        for k in range(n):
            x, z = _cr(p0, p1, p2, p3, k / n)
            if i < 2:
                z = max(z, c[0][1])
            out.append((x, z))
    out.append(c[7])
    return out


def nose_tip_shift(z):
    """Front face leans: chin recedes, light-bar edge sits slightly behind the bumper."""
    lo = max(0.0, min(1.0, (0.42 - z) / 0.10))
    hi = max(0.0, min(1.0, (z - 0.60) / 0.08))
    return -0.035 * lo * lo - 0.015 * hi


def stations(n_mid=96, n_nose=26, n_tail=20):
    ys = []
    for i in range(n_tail):
        th = (math.pi / 2) * (1 - i / n_tail)
        t = max(0.0, math.sin(th)) ** (2.0 / P_TAIL)
        ys.append(('tail', Y_TS - (Y_TS - Y_TAIL) * t, max(0.0, math.cos(th)) ** (2.0 / P_TAIL), t))
    for i in range(n_mid + 1):
        y = Y_TS + (Y_NS - Y_TS) * i / n_mid
        ys.append(('mid', y, 1.0, 0.0))
    for i in range(1, n_nose + 1):
        th = (math.pi / 2) * i / n_nose
        t = max(0.0, math.sin(th)) ** (2.0 / P_NOSE)
        ys.append(('nose', Y_NS + (Y_NOSE - Y_NS) * t, max(0.0, math.cos(th)) ** (2.0 / P_NOSE), t))
    return ys


def grid():
    """Rows of right-half points [[(x,y,z) ...NV] per station] from tail to nose."""
    rows = []
    for kind, y, f, t in stations():
        pts = section_points(y)
        row = []
        for x, z in pts:
            yy = y
            if kind == 'nose':
                yy = y + nose_tip_shift(z) * t ** 3
            row.append((x * f, yy, z))
        rows.append(row)
    return rows
