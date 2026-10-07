# Scene assets and licenses

The Cybercab glTF in `public/models/cybercab.glb` is original to this repo and is not listed here. Everything below is third-party, web-optimized (meshopt + WebP) into `public/models/`.

## Cars — Kenney Car Kit (CC0)

Source: [https://kenney.nl/assets/car-kit](https://kenney.nl/assets/car-kit)  
License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)  
Credit (optional): Kenney.nl

Bundled after meshopt compression: `sedan`, `sedan-sports`, `hatchback-sports`, `suv`, `suv-luxury`, `van`, `truck`, `taxi`, `police`.

These Kenney files stay in the repo. Visible traffic uses the original glTF bodies in `traffic-sedan.glb`, `traffic-suv.glb`, and `traffic-hatch.glb` (`tools/traffic_cars.py`). Each body is a chamfered loft with wheel-arch stations, mirrors, glass, tire and rim meshes, and a `KHR_materials_clearcoat` paint. The runtime recolors the body and keeps that clearcoat against the HDRI. No third-party car scan was small enough to ship. Sketchfab downloads from this environment need a login, and the Khronos sample set has no street sedan.

## People — Mixamo rigs via three.js examples

| File | Source | Clips used | License |
| --- | --- | --- | --- |
| `people/soldier.glb` | [three.js r180 Soldier.glb](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Soldier.glb) (Mixamo “Vanguard”) | Idle, Walk, Run are the clip source only. The soldier mesh is not placed. | Mixamo / Adobe. Usable in real-time apps per Mixamo terms. Credit: Mixamo. |
| `people/xbot.glb` | [three.js r180 Xbot.glb](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Xbot.glb) (Mixamo “X Bot”) | Not placed. | Mixamo / Adobe. Credit: Mixamo. |
| `people/michelle.glb` | [three.js r180 Michelle.glb](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Michelle.glb) (Mixamo) | Walk and Idle retargeted from Soldier onto the same `mixamorig:` skeleton. Her own clip is a dance and is not used. | Mixamo / Adobe. Credit: Mixamo. |
| `people/civilian.glb` | [three.js r180 readyplayer.me.glb](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/readyplayer.me.glb) | Same Walk and Idle, with the `mixamorig:` prefix stripped to match this sample’s bone names. The file has no clip of its own. | Sample avatar shipped with the three.js examples. Credit: Ready Player Me. |

Sidewalk pedestrians are Michelle and the Ready Player Me sample, in ordinary clothes, with a shirt tint. The soldier and the robot stay in the repo so the license record still has them, and they are not spawned.

## Street props — Kenney City Kit (CC0)

Sources:

- Roads: [https://kenney.nl/assets/city-kit-roads](https://kenney.nl/assets/city-kit-roads)
- Suburban (trees, planter): [https://kenney.nl/assets/city-kit-suburban](https://kenney.nl/assets/city-kit-suburban)

License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Credit (optional): Kenney.nl

Files: `light-curved`, `light-square`, `dumpster`, `construction-cone`, `road-sign-stop`, `road-sign-street`, `road-sign-warning`, `traffic-light`, `traffic-light-hanging`, `electricity-pole`, `tree-large`, `tree-small`, `planter-kenney`.

Used on Low/Medium and as far LOD. High/Ultra swap nearby hydrants, benches, lamps, planters, and trash for Poly Haven scans.

## Street props — Poly Haven (CC0)

License: [CC0](https://polyhaven.com/license). No login.

| File | Asset | URL |
| --- | --- | --- |
| `props/hydrant.glb` | Fire Hydrant | https://polyhaven.com/a/fire_hydrant |
| `props/lamp.glb` | Street Lamp 01 | https://polyhaven.com/a/street_lamp_01 |
| `props/bench.glb` | Painted Wooden Bench | https://polyhaven.com/a/painted_wooden_bench |
| `props/trash.glb` | Metal Trash Can | https://polyhaven.com/a/metal_trash_can |
| `props/planter.glb` | Planter Box 01 | https://polyhaven.com/a/planter_box_01 |

Poly Haven photogrammetry trees were measured again and still do not fit this page: island tree bins are 41–80 MB, fir and pine trees are 22–949 MB at 1K. Shrub scans are smaller and are not live oaks. Street trees use the Poly Haven bark and the Tree Small 02 leaf atlas on alpha-tested cards, tinted toward rgb(60, 85, 45). Kenney cone trees are not placed.

| File | Asset | URL |
| --- | --- | --- |
| `props/facade-apartments.glb` | Modular Urban Apartments Facade (1K, simplified) | https://polyhaven.com/a/modular_urban_apartments_facade |
| `props/fire-escape.glb` | Modular Fire Escape (simplified) | https://polyhaven.com/a/modular_fire_escape |
| `props/shrub.glb` | Shrub 01 (simplified) | https://polyhaven.com/a/shrub_01 |

These three are CC0 scans, mesh-simplified so a phone on Low can skip them. Low keeps Kenney props. There is no small CC0 photogrammetry car that fits instanced downtown traffic, so moving traffic uses the original loft bodies from `tools/traffic_cars.py`. Sketchfab downloads require a login and were not used.

The phone wordmark is set in [Inter](https://fonts.google.com/specimen/Inter) (SIL Open Font License), a free stand-in. It is not Tesla’s Universal Sans, and no Tesla logo file is bundled.

## Textures and HDRI

Poly Haven CC0: Kloofendal Overcast Pure Sky (1K, the visible background), Kloofendal 48d Partly Cloudy Pure Sky (1K, kept, not the background), Evening Road 01 Pure Sky (kept, unused by the loader), Asphalt 02, Concrete Floor Worn 001, Concrete Wall 008, Bark Brown 02, Tree Small 02 leaf atlas, Roof Tiles 14.

Visible sky: [https://polyhaven.com/a/kloofendal_overcast_puresky](https://polyhaven.com/a/kloofendal_overcast_puresky) (`textures/kloofendal_overcast_puresky_1k.hdr`). The earlier partly-cloudy file is still in `textures/` and is not the background. The procedural sky shader is in the scene only so the reflection probe can scale it, and it is hidden so the HDRI clouds are the background.  
[https://polyhaven.com/a/roof_tiles_14](https://polyhaven.com/a/roof_tiles_14)

ambientCG CC0, 2K JPEG, color plus normal and roughness. Masonry walls sample these with mipmaps and anisotropic filtering. Windows are cut in the shader so a photo of a whole facade is not tiled. The older Facade001/005/007/014 color JPEGs remain on disk and are not applied.

| File | Asset | URL |
| --- | --- | --- |
| `textures/facades/stone-color.jpg`, `stone-normal.jpg`, `stone-rough.jpg` | Bricks100 | https://ambientcg.com/view?id=Bricks100 |
| `textures/facades/brick-color.jpg`, `brick-normal.jpg`, `brick-rough.jpg` | Bricks051 | https://ambientcg.com/view?id=Bricks051 |
| `textures/facades/plaster-color.jpg`, `plaster-normal.jpg`, `plaster-rough.jpg` | Plaster007 | https://ambientcg.com/view?id=Plaster007 |
| `textures/facades/facade-a.jpg` | Facade001 (unused) | https://ambientcg.com/view?id=Facade001 |
| `textures/facades/facade-b.jpg` | Facade005 (unused) | https://ambientcg.com/view?id=Facade005 |
| `textures/facades/facade-c.jpg` | Facade007 (unused) | https://ambientcg.com/view?id=Facade007 |
| `textures/facades/facade-d.jpg` | Facade014 (unused) | https://ambientcg.com/view?id=Facade014 |

Street trees are a trunk and limbs plus a crown of alpha-tested leaf cards (`liveOakGeometry` in `src/world.ts`). The cards use `textures/leaves_diff.jpg` and `textures/leaves_alpha.png` (Poly Haven Tree Small 02, CC0), tinted so the lit crown is near the photograph's green. Solid icosahedron clumps are not placed. Crowns within 11 m of the walk camera are not placed. The Poly Haven apartment facade, fire escape, and shrub scans are not placed on the sidewalk.

The round 4 road wear was unlit black boxes. An ambientCG Asphalt Damage 001 decal (CC0) was tried and still read as a dark rectangle on the asphalt, so it is not shipped. The road is the asphalt texture and the worn lane paint, without overlay boxes.

Kenney props that are instanced (the curved lamp on Medium, planters) have their node scale baked into the geometry first. Without that, the east-sidewalk lamp was a stretched column.

Kenney stop and warning signs are still in `public/models` but are not instanced. Their glTF positions are integer-quantized and became a giant octagon at street scale.

## Map

OpenStreetMap extract in `public/data/austin.json` remains ODbL. See README.
