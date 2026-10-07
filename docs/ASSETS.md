# Scene assets and licenses

The Cybercab glTF in `public/models/cybercab.glb` is original to this repo and is not listed here. Everything below is third-party, web-optimized (meshopt + WebP) into `public/models/`.

## Cars — Kenney Car Kit (CC0)

Source: [https://kenney.nl/assets/car-kit](https://kenney.nl/assets/car-kit)  
License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)  
Credit (optional): Kenney.nl

Bundled after meshopt compression: `sedan`, `sedan-sports`, `hatchback-sports`, `suv`, `suv-luxury`, `van`, `truck`, `taxi`, `police`.

These are the highest-quality **permissively licensed, no-login** modern vehicle meshes that stay small enough to instance as downtown traffic. Photogrammetry cars were skipped because they are too heavy for Low/Auto on phones.

## People — Mixamo rigs via three.js examples

| File | Source | Clips used | License |
| --- | --- | --- | --- |
| `people/soldier.glb` | [three.js r180 Soldier.glb](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Soldier.glb) (Mixamo “Vanguard”) | Idle, Walk, Run | Mixamo / Adobe. Usable in real-time apps per Mixamo terms. Credit: Mixamo. |
| `people/xbot.glb` | [three.js r180 Xbot.glb](https://github.com/mrdoob/three.js/blob/r180/examples/models/gltf/Xbot.glb) (Mixamo “X Bot”) | idle, walk, run | Mixamo / Adobe. Credit: Mixamo. |

Outfit variation is a runtime tint of cloned materials (several clothing colors per rig). Michelle’s three.js clip is a dance, not a walk, so it is not bundled. Ready Player Me’s sample has no walk clip.

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

Jacaranda, island, pine, and fir photogrammetry trees from Poly Haven are 60–949 MB at 1K and were not bundled. Near the ride, street trees use the existing Poly Haven bark and leaf textures on card canopies. Farther trees stay Kenney cones.

| File | Asset | URL |
| --- | --- | --- |
| `props/facade-apartments.glb` | Modular Urban Apartments Facade (1K, simplified) | https://polyhaven.com/a/modular_urban_apartments_facade |
| `props/fire-escape.glb` | Modular Fire Escape (simplified) | https://polyhaven.com/a/modular_fire_escape |
| `props/shrub.glb` | Shrub 01 (simplified) | https://polyhaven.com/a/shrub_01 |

These three are CC0 scans, mesh-simplified so a phone on Low can skip them. Low keeps Kenney props. There is no small CC0 photogrammetry car that fits instanced downtown traffic, so moving traffic stays the Kenney Car Kit with a clearcoat material. Sketchfab downloads require a login and were not used.

The phone wordmark is set in [Inter](https://fonts.google.com/specimen/Inter) (SIL Open Font License), a free stand-in. It is not Tesla’s Universal Sans, and no Tesla logo file is bundled.

## Textures and HDRI

Poly Haven CC0: Kloofendal 48d Partly Cloudy Pure Sky (1K, golden hour), Evening Road 01 Pure Sky (kept, unused by the loader), Asphalt 02, Concrete Floor Worn 001, Concrete Wall 008, Bark Brown 02, Tree Small 02 leaf atlas, Roof Tiles 14.

[https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)  
[https://polyhaven.com/a/roof_tiles_14](https://polyhaven.com/a/roof_tiles_14)

ambientCG CC0 facade photographs, color only, recompressed to 1K JPEG. Each building picks one. Roofs use the Poly Haven tile. Dark texels in the photo get a cheap interior shift so the windows are not flat stickers.

| File | Asset | URL |
| --- | --- | --- |
| `textures/facades/facade-a.jpg` | Facade001 | https://ambientcg.com/view?id=Facade001 |
| `textures/facades/facade-b.jpg` | Facade005 | https://ambientcg.com/view?id=Facade005 |
| `textures/facades/facade-c.jpg` | Facade007 | https://ambientcg.com/view?id=Facade007 |
| `textures/facades/facade-d.jpg` | Facade014 | https://ambientcg.com/view?id=Facade014 |

Kenney stop and warning signs are still in `public/models` but are not instanced. Their glTF positions are integer-quantized and became a giant octagon at street scale.

## Map

OpenStreetMap extract in `public/data/austin.json` remains ODbL. See README.
