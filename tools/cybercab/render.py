"""Render views of cybercab.blend.
  blender -b cybercab.blend --python render.py -- --views side_sf,fq,rq --engine cycles --samples 48 --out DIR [--open 1.0]
"""
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import camfit
from mathutils import Vector

A = sys.argv[sys.argv.index('--') + 1:]
def arg(k, d):
    return A[A.index(k) + 1] if k in A else d
VIEWS = arg('--views', 'side_sf').split(',')
ENGINE = arg('--engine', 'cycles')
SAMPLES = int(arg('--samples', '48'))
OUT = arg('--out', '/tmp/cc')
OPEN = float(arg('--open', '0'))      # 0..1 door open fraction
HDRI = arg('--hdri', '/workspace/cybercab-blender/hdri/german_town_street.hdr')
RES = float(arg('--res', '1.0'))
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene

# door pose: drive the NLA-less pose directly
import build_params as BP
for s in ('r', 'l'):
    sw = bpy.data.objects.get('door-hinge-%s' % s)
    if sw:
        if sw.animation_data:
            sw.animation_data.use_nla = False
        sd = 1 if s == 'r' else -1
        du = math.radians(float(arg('--door_up', math.degrees(BP.DOOR_UP))))
        do = math.radians(float(arg('--door_out', math.degrees(BP.DOOR_OUT))))
        sw.rotation_euler = (-du * OPEN, 0.0, sd * do * OPEN)
# light states: --lamps brake,turn_l,turn_r,teal,off  (overlay nodes toggled by scale, as in the glb)
LAMPS = [x for x in arg('--lamps', '').split(',') if x]
SUFFIX = arg('--suffix', '')
EXPO = float(arg('--exposure', '0'))
def _lamp_on(name):
    if 'brake' in LAMPS and name.startswith('lamp-rear-brake-'):
        return True
    if 'teal' in LAMPS and name.startswith('lamp-front-teal-'):
        return True
    for key, side in (('turn_l', 'L'), ('turn_r', 'R')):
        if key in LAMPS and '-turn-' + side in name:
            return True
    return None
for o in bpy.data.objects:
    if o.name.startswith('lamp-') and o.type == 'MESH' and o.name != 'lamp-front-channel':
        if o.animation_data:
            o.animation_data.use_nla = False
        on = _lamp_on(o.name)
        if on:
            o.scale = (1, 1, 1)
        if 'off' in LAMPS and o.name[len('lamp-'):].split('-')[1][:1] in 'LR' and on is None:
            o.scale = (0.001, 0.001, 0.001)
for o in bpy.data.objects:
    if o.name.startswith('wheel-spin') and o.animation_data:
        o.animation_data.use_nla = False
        o.rotation_euler[0] = 0

# world
w = bpy.data.worlds.new('world'); sc.world = w
w.use_nodes = True
nt = w.node_tree
bg = nt.nodes['Background']
env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(HDRI)
mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
mp.inputs['Rotation'].default_value[2] = math.radians(float(arg('--hdri_rot', '110')))
nt.links.new(env.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = float(arg('--hdri_str', '1.0'))

# ground
if arg('--ground', '1') == '1':
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    g = bpy.context.active_object
    gm = bpy.data.materials.new('ground'); gm.use_nodes = True
    b = gm.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.075, 0.075, 0.078, 1)
    b.inputs['Roughness'].default_value = 0.8
    gnt = gm.node_tree
    nz = gnt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 900.0; nz.inputs['Detail'].default_value = 8
    ramp = gnt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.028, 0.028, 0.03, 1); ramp.color_ramp.elements[1].color = (0.075, 0.074, 0.072, 1)
    gnt.links.new(nz.outputs['Fac'], ramp.inputs['Fac']); gnt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    g.data.materials.append(gm)
    if arg('--catcher', '1') == '1':
        g.is_shadow_catcher = True

# sun to match HDRI
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = float(arg('--sun', '3.0'))
sun.data.angle = math.radians(2)
sun.rotation_euler = (math.radians(50), 0, math.radians(float(arg('--sun_az', '200'))))
sc.collection.objects.link(sun)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam); sc.camera = cam
cam.data.sensor_width = 36

def look(loc, target, lens):
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens

VIEWS_DEF = {
    'side_sf': None,
    'fq': ((5.2, 5.4, 1.25), (0.0, 0.25, 0.62), 50),        # front 3/4 (right side)
    'fq_l': ((-4.6, 5.6, 1.1), (0.0, 0.2, 0.62), 50),       # front 3/4 left, like I-280 photo
    'rq': ((4.6, -5.6, 1.5), (0.0, -0.3, 0.65), 50),        # rear 3/4 right
    'rq_l': ((-1.75, -4.05, 1.30), (0.35, -0.2, 0.62), 23),    # rear 3/4 left, like July 2025 photo
    'front': ((0.0, 6.5, 1.0), (0.0, 0.0, 0.68), 60),
    'front_low': ((0.0, 3.55, 0.80), (0.0, 0.0, 0.62), 24),  # like the We, Robot front photo
    'rear': ((0.0, -6.5, 1.3), (0.0, 0.0, 0.70), 60),
    'rear_high': ((0.0, -3.9, 2.25), (0.0, 0.1, 0.55), 24),  # like the We, Robot rear photo
    'side_l': ((-11.5, 0.15, 0.95), (0.0, 0.15, 0.62), 80),   # like the Santana Row side view
    'top_fl': ((-2.6, 4.6, 5.6), (0.05, 0.1, 0.55), 30),     # like the Paris overhead (Tesla_Cybercab_003)
    'top': ((0.0, 0.0, 12.0), (0.0, 0.001, 0.0), 50),
    'top34': ((3.0, 4.6, 5.0), (0.0, 0.0, 0.6), 35),        # like the Paris overhead
    'side': ((12.0, 0.0, 0.75), (0.0, 0.0, 0.7), 85),
    'doors': ((3.9, 3.6, 1.6), (0.0, 0.0, 0.9), 32),
    'interior': ((1.65, 0.55, 1.05), (-0.2, -0.25, 0.75), 20),
    'interior2': ((0.0, 2.2, 1.35), (0.0, -0.2, 0.85), 30),
    'wheel': ((2.4, 1.36, 0.45), (0.74, 1.36, 0.38), 50),
    'nose_cu': ((0.9, 3.4, 0.75), (0.0, 2.1, 0.58), 50),
    'win_cu': ((3.2, 0.4, 1.3), (0.7, 0.0, 1.1), 40),
}
sc.render.engine = 'CYCLES' if ENGINE == 'cycles' else 'BLENDER_WORKBENCH'
if ENGINE == 'cycles':
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = arg('--denoise', '1') == '1'
    sc.cycles.max_bounces = 8
    sc.cycles.transmission_bounces = 8
    sc.cycles.glossy_bounces = 4
    sc.cycles.caustics_reflective = False
    sc.cycles.sample_clamp_indirect = 4.0
    sc.cycles.blur_glossy = 1.0
    sc.cycles.caustics_refractive = False
    sc.render.threads_mode = 'AUTO'
    sc.cycles.use_adaptive_sampling = True
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
else:
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_cavity = True
for v in VIEWS:
    if v.startswith('fit_'):
        import json
        cj = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cams.json')))[v[4:]]
        from mathutils import Matrix
        m3 = Matrix(cj['mat'])
        cam.matrix_world = Matrix.Translation(cj['loc']) @ m3.to_4x4()
        cam.data.lens = cj['lens']
        rx, ry = cj['res']
        sc_ = 1200.0 / rx
        rx, ry = int(rx * sc_), int(ry * sc_)
    elif v == 'side_sf':
        cam.location = camfit.SF['loc']; cam.rotation_euler = camfit.SF['rot']; cam.data.lens = camfit.SF['lens']
        rx, ry = camfit.SF['res']
    else:
        loc, tgt, lens = VIEWS_DEF[v]
        look(loc, tgt, lens)
        rx, ry = (1200, 900) if v in ('rq_l', 'front_low', 'rear_high', 'top34', 'top_fl') else (1200, 800)
    sc.render.resolution_x, sc.render.resolution_y = int(rx * RES), int(ry * RES)
    sc.view_settings.exposure = EXPO
    sc.render.filepath = os.path.join(OUT, v + ('_open' if OPEN > 0 else '') + SUFFIX + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath, flush=True)
