# Cybercab reference notes

Photo-fit model for the Austin sim. It is an artistic reconstruction, not manufacturer CAD and not a Tesla product. No badges, wordmarks, or logos are modeled.

The body is a parametric surface (`surface.py`: PCHIP profiles and centripetal Catmull-Rom sections), solidified and boolean-cut in Blender 5.2. Node names, the door clip, and the light segments are in [MODEL_NOTES.md](MODEL_NOTES.md). The photo index is [index.md](index.md). Observed light behavior is in [lights.md](lights.md).

Reference photos (28 stills and 8 clips) are not committed. The index lists the public sources, including Steve Jurvetson’s We, Robot set (Wikimedia, CC BY 2.0), the Santana Row showroom views (CC BY-SA 4.0), and the June 2026 San Francisco street profile (CC BY 4.0).

## Published dimensions

From Tesla’s Cybercab rider guide “Dimensions and Specifications” (checked October 2026):

| Measure | Value |
| --- | --- |
| Overall width | 1,754 mm (69 in) |
| Overall height | 1,408 mm (55.4 in) |
| Ground clearance | 144 mm (5.7 in) |
| Step-in height | 414 mm (16.3 in); the FAQ also lists 16.5 in |
| Rear trunk | 572 L (20.2 cu ft) |

Length and wheelbase are not in that table.

## Dimensions in the glTF

Y-up, meters, nose toward −Z, ground at local y = 0. The mesh bounds are about 1.77 m wide, 1.408 m tall, and 4.35 m long. The body clears the ground by about 155 mm. Hubs sit at y = 0.372, which is the tire radius, so the tread meets y = 0. The sim places the cab group at `ROAD_Y` (0.16) and does not scale the model.

| Measure | Model value |
| --- | --- |
| Length | 4.35 m |
| Width | 1.77 m |
| Height | 1.408 m |
| Wheelbase | 2.635 m (front axle z = −1.36, rear z = 1.275) |
| Track | 1.456 m (hubs at x = ±0.728) |
| Tire radius | 0.372 m |

## What the sim drives

- `door-hinge-r` and `door-hinge-l` sample the `door_open` quaternion clip. Only the curb side (+X) opens. The stroke is 1.5 s.
- `wheel-spin-fr|fl|rr|rl` roll about local X with speed. `wheel-steer-fr|fl` steer about Y. Positive steer is a left turn.
- The `lights` node holds six segments per side. Front white and rear red stay on. Brake, turn, and teal segments start at scale 0.001. The sim scales those nodes from ride state instead of playing the finite light clips.
- Rear turn segments are the outer three. The sim hides the tail under them and tints the overlay amber so the blink reads in daylight.
- The Texas plate and the soft contact shadow are added in `src/vehicle.ts`. The glTF has no plate mesh.

## Rebuild

Authoring uses Blender 5.2. The scripts default to an external tree (`/workspace/cybercab-blender`) and a local photo folder (`/workspace/cybercab-ref`). Those paths are not the sim runtime.

```sh
blender -b --factory-startup --python tools/cybercab/build.py -- --out /tmp/cybercab-out
```

That writes `cybercab.blend` and `cybercab.glb`. `round.sh`, `finals.sh`, and `lights_renders.sh` are comparison-render helpers for that authoring tree.

Compress the glTF without joining or simplifying. `gltf-transform optimize` collapses the wheel and door nodes.

```sh
npx @gltf-transform/cli meshopt public/models/cybercab.glb public/models/cybercab.glb --level high --quantize-position 16 --quantize-normal 12
```

Quantization inserts unnamed child meshes and a dequantization scale. Keep the named hinge, steer, spin, and lamp parents. Scale and rotate those parents, not the unnamed children.
