import bpy, bmesh, sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import importlib, surface as S
importlib.reload(S)
from mathutils import Vector

def body_mesh(name='body'):
    rows = S.grid()
    nu, nv = len(rows), len(rows[0])
    bm = bmesh.new()
    vid = {}
    def V(i, j, side):
        x, y, z = rows[i][j]
        on_c = (j == 0 or j == nv - 1 or abs(x) < 1e-7)
        key = (i, j, 0 if on_c else side)
        if key not in vid:
            vid[key] = bm.verts.new((x * side if not on_c else 0.0, y, z))
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
                    bm.faces.new(uq)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ob = body_mesh()
    me = ob.data
    print('verts', len(me.vertices), 'faces', len(me.polygons))
    bm = bmesh.new(); bm.from_mesh(me)
    nm = [e for e in bm.edges if not e.is_manifold]
    print('non-manifold edges', len(nm))
    bbox = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    print('bbox x', min(v.x for v in bbox), max(v.x for v in bbox), 'y', min(v.y for v in bbox), max(v.y for v in bbox), 'z', min(v.z for v in bbox), max(v.z for v in bbox))
