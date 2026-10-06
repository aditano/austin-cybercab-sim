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

Jacaranda / island trees from Poly Haven are 60–200 MB at 1K and were not bundled. Street trees keep Kenney meshes plus the existing Poly Haven bark/leaf textures already in `public/textures/`.

## Textures and HDRI (already in the repo)

Poly Haven CC0: Evening Road 01 Pure Sky, Asphalt 02, Concrete Floor Worn 001, Concrete Wall 008, Bark Brown 02, Tree Small 02 leaf atlas. See the README.

## Map

OpenStreetMap extract in `public/data/austin.json` remains ODbL. See README.
