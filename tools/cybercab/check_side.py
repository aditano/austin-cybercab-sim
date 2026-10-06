import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import surface as S, camfit
from quick_body import body_mesh
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
ob = body_mesh()
for y in (S.Y_FA, S.Y_RA):
    for sd in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(radius=S.TIRE_R, depth=0.225, location=(sd * S.WHEEL_X, y, S.TIRE_R), rotation=(0, math.pi / 2, 0), vertices=64)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam); sc.camera = cam
cam.location = camfit.SF['loc']; cam.rotation_euler = camfit.SF['rot']; cam.data.lens = camfit.SF['lens']; cam.data.sensor_width = 36
sc.render.resolution_x, sc.render.resolution_y = camfit.SF['res']
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'; sc.display.shading.single_color = (1, 0, 0)
sc.display.shading.show_object_outline = False
sc.render.film_transparent = True
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
