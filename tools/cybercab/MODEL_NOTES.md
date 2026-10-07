# Cybercab Blender model

Built by `tools/cybercab/build.py` (Blender 5.2.2). Running `blender -b --factory-startup --python tools/cybercab/build.py -- --out DIR` writes `DIR/cybercab.blend` and `DIR/cybercab.glb`.
The body surface is parametric (`tools/cybercab/surface.py`: PCHIP profiles plus centripetal Catmull-Rom sections). It is solidified to 8 mm and cut with MANIFOLD booleans.

## glb conventions (three.js)
- Y-up, meters, real-world scale. Nose points to -Z, right side is +X, ground at y = 0. Body is 1.77 x 1.408 x 4.35 m.
- Root node is `Cybercab`. Transforms are applied on meshes; only pivot and light-segment nodes carry transforms.
- Doors: `door-hinge-r` at (0.80, 0.78, -0.97) and `door-hinge-l` at (-0.80, 0.78, -0.97). Children are `door-r|l`, `door-glass-r|l`, `door-frit-r|l`.
  Open pose (Blender Euler XYZ): X = -74 deg (rear of the door rises), then Z = +/-95 deg (door swings out).
- Wheels: `wheel-spin-fr|fl|rr|rl` sit at each hub centre (y = 0.372, the tire radius) and spin about local X. Front wheels sit under `wheel-steer-fr|fl` (steer about Y).
- Materials are plain PBR (no textures). Glass uses alpha blend (thin glass), not KHR transmission.

## Lights (all under node `lights`)
Every segment is its own mesh node, with its origin at the segment centroid. There are 6 segments per side: 1 is at the centre and 6 is the outer end (wrapping the corner). R = car's right (+X), L = left.
- `lamp-front-R1..R6`, `lamp-front-L1..L6`: white running bar, material `lamp-front`. On at rest.
- `lamp-rear-R1..R6`, `lamp-rear-L1..L6`: red tail bar, material `lamp-rear`. On at rest.
- Overlays sit a hair proud of the base bar and are **off at rest (node scale 0.001)**. Animations scale them to 1:
  - `lamp-rear-brake-R1..L6`: brighter red, material `lamp-brake`.
  - `lamp-front-turn-R4..R6 / L4..L6`: white, material `lamp-turn-front`. The sim tints these to the current front-bar color.
  - `lamp-rear-turn-R4..R6 / L4..L6`: red, material `lamp-turn-rear`.
  - `lamp-front-teal-R1..L6`: teal pickup state, material `lamp-front-teal`.
- In the sim you can ignore the clips and just set `node.scale` (or `visible`) per segment. Or clone the segment materials and drive `emissiveIntensity`.
- Light behaviour notes and sources: `tools/cybercab/lights.md`.

## Animations (24 fps, exported from NLA tracks)
| name | frames | targets |
|---|---|---|
| `door_open` | 1-40 (1.67 s) | `door-hinge-r/l` rotation |
| `wheel_spin` | 1-25, linear, loopable | `wheel-spin-*` rotation |
| `lights_wake` | 1-40 | base bar segments, centre-out sweep (front then rear), then one brake pulse |
| `turn_left` / `turn_right` | 1-49, step | outer 3 turn-overlay segments, 0.42 s on / 0.25 s off, 3 cycles |
| `hazard` | 1-49, step | both sides |
| `brake` | 1-37, step | rear brake overlay on, hold, off |
| `pickup` | 1-72 | front teal overlay on, hold, off |

## Renders
- Comparison rounds: `tools/cybercab/round.sh N` writes to the authoring tree `rounds/rN` (fitted cameras from `tools/cybercab/cams.json`).
- Finals: `tools/cybercab/finals.sh`. Light-state stills: `tools/cybercab/lights_renders.sh`. Those shell scripts expect the external Blender tree and the reference photos, which are not in this repo.
- `render.py --lamps brake,turn_l,turn_r,teal,off` toggles overlay nodes the same way the glb does.
