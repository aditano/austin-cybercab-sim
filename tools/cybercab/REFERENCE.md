# Cybercab reference notes

Original model notes for `build.py`. This is an artistic reconstruction for an independent simulator, not manufacturer CAD and not a Tesla product. No badges, wordmarks, or logos are modeled.

Reference photos were studied locally and are not committed. Primary views: Steve Jurvetson’s We, Robot set (Wikimedia, CC BY 2.0: front, rear, interior), the Santana Row showroom side and open-door views (CC BY-SA 4.0), the June 2026 San Francisco street profile (CC BY 4.0), and the July 2025 open-door rear three-quarter.

## Published dimensions

From Tesla’s Cybercab rider guide “Dimensions and Specifications” (checked October 2026):

| Measure | Value |
| --- | --- |
| Overall width | 1,754 mm (69 in) |
| Overall height | 1,408 mm (55.4 in) |
| Ground clearance | 144 mm (5.7 in) |
| Step-in height | 414 mm (16.3 in); the FAQ also lists 16.5 in |
| Rear trunk | 572 L (20.2 cu ft) |

Length, wheelbase, and track are not in that table.

## Estimated dimensions used by the model

Length is the Tailosive EV tape figure of about 175 in (4.45 m) against a Model 3, cross-checked on the San Francisco side photo. On that photo the body is roughly 3.1 times as long as it is tall, which at 1,408 mm is about 4.35 m. The model uses a **4.38 m** overall length (nose to the kamm face).

Wheel centers on the same photo sit about 4.4 tire-diameters apart. With a tire outside diameter of 0.66 m (a large aero-covered wheel under a 1.41 m roof), the wheelbase is **2.86 m**. Front overhang to the axle is about 0.72 m; rear overhang about 0.82 m. Track is **1.52 m** so the 0.66 m tires sit just inside the 1.754 m body.

| Measure | Model value | Status |
| --- | --- | --- |
| Length | 4.38 m | estimate |
| Width | 1.754 m | published |
| Height | 1.408 m | published |
| Ground clearance | 0.15 m | published, rounded |
| Wheelbase | 2.86 m | estimate |
| Front axle from nose | 0.72 m | estimate |
| Track | 1.52 m | estimate |
| Tire outside diameter | 0.66 m | estimate |
| Step-in / rocker top | ~0.40 m | near the published 414 mm |

Axes in the Blender file: +Y nose, +Z up, +X right. The glTF exporter maps that to glTF/Three.js +X right, +Y up, −Z nose, which matches the sim.

## Form

Two-seat closed coupe. The silhouette is a low fastback, not an open roadster and not a glass bubble.

- Nose: wide, smooth, and rounded in plan and elevation. A thin full-width lamp sits in a shallow channel and wraps slightly into the fenders. The lower chin is satin black.
- Hood: short and low, flowing into a steep windshield.
- Roof: body-colored. It peaks just aft of the windshield header (about 42% back from the nose) and falls in one curve to a short tail. No rear window.
- Greenhouse: dark windshield plus one dark side window per door. The roof panel above the glass is paint, so the cabin reads as a hardtop.
- Tail: broad kamm face, nearly vertical. Full-width red lamp high on the face, with small lower corner lamps. Black rear bumper and a centered plate.
- Side: smooth shoulder, black rocker, large circular wheel openings. Butterfly doors are hinged on a straight axis along the roof rail (not the centerline). The shut line starts behind the front arch and ends ahead of the rear arch, from just above the rocker to the roof rail.
- Wheels: gold aero discs with two circular grooves and a small cap, narrow black tire, brake disc and caliper tucked behind the cover. No side mirrors. Small camera pods on the front fenders and one at the tail.

Door swing in the show photos is well past horizontal. The hinge opens 1.95 rad (about 112°) from the closed side panel. The side glass is one smooth opening per door; the windshield header is covered by a thin black bezel so the glass edge stays smooth.

## Materials

Chosen for glTF PBR (`KHR_materials_clearcoat`, `KHR_materials_transmission`, `KHR_materials_ior`, `KHR_materials_emissive_strength`), which Three.js r180 reads into `MeshPhysicalMaterial`.

| Surface | Intent | Principled settings |
| --- | --- | --- |
| Champagne paint | Warm satin metallic with a clear layer, close to the show cars’ molded gold | Base `#C9A66B`, metallic 0.72, roughness 0.34, coat weight 1, coat roughness 0.07, coat IOR 1.5 |
| Windshield | Tinted so the street is still visible from the seat | Transmission 1, IOR 1.52, roughness 0.04, base `#8AA0A8` |
| Side glass | Darker than the windshield | Transmission 1, IOR 1.52, roughness 0.06, base `#3E4C52` |
| Rocker, chin, bumper, arch lips | Satin black | Metallic 0.08, roughness 0.46, `#141618` |
| Aero covers | Same champagne family, slightly flatter | Metallic 0.55, roughness 0.38, coat 0.4 |
| Tires | Rubber | Roughness 0.92, `#121314` |
| Front lamp | Emissive white, recolored by the sim for the Megalamp match | Emission strength 14 |
| Rear lamp | Emissive red | `#FF2A22`, strength 10 |
| Seats | Dark leather | `#2A2E33`, roughness 0.48, sheen 0.28 |
| Headliner | Light cloth | `#E4E0D6` |
| Dash | Light, with a thin warm accent | `#D9D4C8`, accent `#8C6844` |
| Carpet | Black | `#1A1C1E` |

The real body color is often described as molded-in rather than a deep wet clear. The clearcoat is kept low-roughness so studio and street reflections read as paint, while base roughness stays high enough that the car does not look chrome.

## Interior

Two forward-facing seats, no wheel and no pedals. Center console with two cup holders, a landscape center display, a low dash with a thin warm accent, carpeted floor, light headliner, door cards with armrests, and three-point belts. The curb-side door is the sim’s +X door.

## Rebuild

```sh
blender --background --python tools/cybercab/build.py -- --cycles
```

The script writes `public/models/cybercab.glb` and PNG stills under `tools/cybercab/renders/`. `--cycles` is the beauty pass; the default engine is Workbench for shape checks. Draco is not linked in Ubuntu’s Blender 4.0.2 package. When `gltfpack` is on `PATH` the script meshopt-compresses the GLB; otherwise run `npx @gltf-transform/cli meshopt public/models/cybercab.glb public/models/cybercab.glb`. Do not run `gltf-transform optimize` — joining and simplifying collapses the wheel and door nodes.
