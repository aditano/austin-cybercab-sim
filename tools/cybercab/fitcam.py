"""Fit a pinhole camera (focal + pose) to hand-picked 2D/3D correspondences with OpenCV.
Run with /home/box/venvs/cv/bin/python. Prints Blender camera parameters."""
import json, sys, math
import numpy as np, cv2

def fit(name, size, pts, frange=(0.4, 6.0)):
    W, H = size
    obj = np.array([p[1] for p in pts], dtype=np.float64)
    img = np.array([p[0] for p in pts], dtype=np.float64)
    best = None
    for f in np.linspace(frange[0] * W, frange[1] * W, 400):
        K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
        ok, rv, tv = cv2.solvePnP(obj, img, K, None, flags=cv2.SOLVEPNP_SQPNP)
        if not ok:
            continue
        ok, rv, tv = cv2.solvePnP(obj, img, K, None, rv, tv, True, flags=cv2.SOLVEPNP_ITERATIVE)
        proj, _ = cv2.projectPoints(obj, rv, tv, K, None)
        err = np.sqrt(np.mean(np.sum((proj.reshape(-1, 2) - img) ** 2, axis=1)))
        R, _ = cv2.Rodrigues(rv)
        C = (-R.T @ tv).ravel()
        depth = (R @ obj.T + tv).T[:, 2]
        if C[2] < 0.2 or (depth <= 0).any():
            continue
        if best is None or err < best[0]:
            best = (err, f, R, C, proj.reshape(-1, 2))
    err, f, R, C, proj = best
    # OpenCV camera: x right, y down, z forward. Blender camera: x right, y up, -z forward.
    Rb = R.T @ np.diag([1, -1, -1])      # camera-to-world rotation for Blender
    lens = 36.0 * f / W
    from_ = Rb
    # Euler XYZ from rotation matrix
    sy = math.sqrt(from_[0, 0] ** 2 + from_[1, 0] ** 2)
    ex = math.atan2(from_[2, 1], from_[2, 2])
    ey = math.atan2(-from_[2, 0], sy)
    ez = math.atan2(from_[1, 0], from_[0, 0])
    res = dict(mat=[[float(v) for v in row] for row in Rb], name=name, loc=[float(c) for c in C], rot=[ex, ey, ez], lens=float(lens), res=[W, H], rms_px=float(err))
    print(json.dumps(res))
    for (p, o), q in zip(pts, proj):
        print('   ', o, 'img', p, 'proj', [round(float(v), 1) for v in q])
    return res

CAMS = {}
CAMS['i280'] = fit('i280', (1920, 1080), [
    ((864, 716), (-0.86, 1.36, 0.372)),
    ((1614, 651), (-0.86, -1.275, 0.372)),
    ((1366, 690), (-0.86, -0.312, 0.345)),
    ((1383, 304), (-0.53, -0.516, 1.336)),
    ((1084, 455), (-0.80, 0.80, 0.94)),
    ((982, 580), (-0.86, 1.075, 0.705)),
    ((1515, 349), (-0.66, -1.095, 1.162)),
    ((1757, 448), (-0.80, -2.14, 0.86)),
    ((1762, 690), (-0.80, -2.10, 0.26)),
    ((1609, 783), (-0.742, -1.275, 0.0)),
    ((703, 597), (-0.84, 1.82, 0.696)),
    ((965, 470), (-0.66, 0.835, 0.935)),
])
CAMS['jul25'] = fit('jul25', (1920, 1440), [
    ((1011, 1110), (0.86, -1.275, 0.372)),
    ((1449, 790), (0.86, 1.36, 0.372)),
    ((1246, 946), (0.86, -0.312, 0.345)),
    ((1170, 500), (0.53, -0.516, 1.336)),
    ((976, 591), (0.66, -1.095, 1.162)),
    ((582, 920), (0.78, -2.11, 0.86)),
    ((1061, 861), (0.87, -1.275, 0.797)),
])
if __name__ == '__main__':
    json.dump(CAMS, open('/workspace/cybercab-blender/scripts/cams.json', 'w'), indent=1)
