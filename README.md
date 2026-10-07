# Austin Cybercab Experience

An independent, browser-based Three.js concept simulator set in downtown Austin. Explore a procedural city scene, request a simulated Cybercab, board it, and ride a short stretch of Congress Avenue from 2nd Street to 7th Street.

This is an interactive visual concept, not a Tesla product, a live Robotaxi client, a real booking, or an autonomous-driving system. It makes no live claims about Tesla fares, wait times, availability, service boundaries, or assigned vehicles. See [Sources & accuracy](public/docs.html) for the source notes and fuller limitations.

## Live site

The published build is at [https://aditano.github.io/austin-cybercab-sim/](https://aditano.github.io/austin-cybercab-sim/).

A push to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which builds the app and deploys it to GitHub Pages.

## Run locally

Requirements: Node.js 22 or later with npm, and a modern desktop browser with WebGL 2 support.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). To make and preview a production build:

```sh
npm run build
npm run preview
```

The app runs in the browser on Windows, macOS, and Linux when the browser and graphics hardware support WebGL 2. This repository does not provide native desktop binaries. Google Fonts are requested online for DM Sans and Manrope; system sans-serif fallbacks keep the interface usable if those fonts cannot be reached. Map data is bundled, so it does not require a map API at runtime.

## Controls and ride flow

- A loading screen stays up while the map, city, and vehicle come in.
- Drag on the 3D view to look around. On a phone, **Walk the block** reveals a thumbstick; drag the scene to look.
- Use **W A S D** to walk along the avenue. Walking stays in a band beside the cab lane so the camera does not enter buildings.
- Press **P** to show or hide the request phone, or use the on-screen **Phone** button. **F** toggles fullscreen. **P** is ignored while the cab is moving; the phone returns at arrival.
- Use the top-right graphics button to open Low, Medium, High, Ultra, or Auto. Auto is the default: it picks a preset from this device, then eases up or down from measured frame time. Touch screens and software renderers stay on Low. Low uses lighter street models (Kenney props, fewer cars and people). High and Ultra swap nearby furniture for Poly Haven scans, cascade shadows, and reflection probes; Ultra can add screen-space reflections. Your choice is saved in this browser.
- On the phone, pick a destination. Places outside the approximated service area disable Confirm. Confirm a ride, match the violet Megalamp and plate, and choose **Open doors** when the cab has stopped. **Cancel ride** is available at the curb as well as during dispatch.
- In the cabin, choose **Fasten seatbelt**, then **Start Ride** after the doors close. During the ride, adjust the cabin temperature, toggle the generated ambient tone, or pause and resume the trip. Refreshing keeps the in-progress trip in this tab.
- At the destination, exit and choose **Take another ride** to repeat the experience.

The request, pickup, ride timing, estimated time, fare-like UI, cabin functions, and trip completion are all simulated locally. They do not contact Tesla or emergency services. The phone map renders the bundled OSM geography and route. The interface is an original approximation, not a Tesla app screenshot.

## Scope and accuracy

The scene uses Three.js with a meshopt-compressed Cybercab glTF, licensed Kenney / Mixamo / Poly Haven street assets, Poly Haven CC0 textures, image-based lighting, cascade shadows, and post-processing. It is not photogrammetry, a surveyed digital twin, or an Unreal Engine scene. Building shapes and heights are incomplete approximations. The Cybercab is a photo-fit Blender model built by `tools/cybercab/build.py`, with PBR paint, glass, and tires. Doors, wheels, and the light bar follow the ride. It is not manufacturer CAD. Traffic cars, people, and street furniture are third-party CC0/CC-BY models documented in [docs/ASSETS.md](docs/ASSETS.md). The cabin and phone use original artwork.

The bundled OpenStreetMap extract covers a compact downtown area around Congress Avenue, from the South Congress riverfront through northern downtown, and includes nearby streets, building footprints, and Lady Bird Lake shoreline. The simulated trip runs from Congress & 2nd to Congress & 7th and stays north of the lake; it does not cross the lake or model an Austin-wide route. OSM data is an input to the scene, not a live map feed or a Tesla service-area boundary. See [docs/RESEARCH.md](docs/RESEARCH.md) for source, extraction, and height-estimation details.

## Asset credits

The Cybercab glTF in `public/models/cybercab.glb` is built by `tools/cybercab/build.py` (Blender 5.2) from the parametric body in `tools/cybercab/surface.py`, then meshopt-compressed. Node names, the `door_open` clip, and the light segments are documented in [tools/cybercab/MODEL_NOTES.md](tools/cybercab/MODEL_NOTES.md). It is not manufacturer CAD and not a factory scan. A CC BY 4.0 Sketchfab scan by [Grass Grass Grass (@zwir3kk)](https://sketchfab.com/3d-models/tesla-cybercab-3d-model-45c25fd8442b45129e47be2e66449ca3) exists, but the download API requires a Sketchfab login, so that file is not bundled.

## Street models

See [docs/ASSETS.md](docs/ASSETS.md) for source URLs and licenses for traffic cars (Kenney Car Kit, CC0), walking people (Mixamo rigs via three.js examples), and street props (Kenney City Kit + Poly Haven CC0). The Cybercab glTF is original to this repo and is not replaced by those kits.

Environment images are [CC0](https://polyhaven.com/license) from [Poly Haven](https://polyhaven.com/):

- [Evening Road 01 (Pure Sky)](https://polyhaven.com/a/evening_road_01_puresky) HDRI by Sergej Majboroda and Jarod Guest
- [Asphalt 02](https://polyhaven.com/a/asphalt_02) by Rob Tuytel
- [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001) by Dimitrios Savva and Rico Cilliers
- [Concrete Wall 008](https://polyhaven.com/a/concrete_wall_008) by Charlotte Baglioni and Dario Barresi
- [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) by Rob Tuytel
- [Tree Small 02](https://polyhaven.com/a/tree_small_02) leaf atlas by Rico Cilliers

## Map attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The adapted map database in `public/data/austin.json` remains under ODbL. Preserve its attribution and source metadata when redistributing it; the application's code license does not replace the map-data license.

## License

Copyright 2026 Anthony DiTano.

This project is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. The license identifier is `GPL-3.0-or-later`. The full text is in [LICENSE](LICENSE).

Third-party assets documented in [docs/ASSETS.md](docs/ASSETS.md) keep their own licenses. That file covers the Kenney, Mixamo, and Poly Haven models. The OpenStreetMap extract described above stays under the Open Database License.

## Project commands

- `npm run dev` — start the Vite development server.
- `npm run build` — type-check with TypeScript and create the production bundle in `dist/`.
- `npm run preview` — serve the production bundle locally.
- `npm test` — run the repository's Node test suite.
- A push to `main` publishes the production build to GitHub Pages.

## Validation

`npm test` checks geographic coordinates and verifies that route vertices belong to the OSM Congress Avenue data. For the interactive journey, start the app and run `node tests/ride-flow.mjs` (install Chromium with `npx playwright install chromium` first if necessary). Set `SIM_URL` to test a production preview instead. Screenshots are written to ignored `output/validation/`.

The browser test covers request cancellation, pickup, boarding, seatbelt gating, climate, media, pause/resume, arrival, exit, replay, phone visibility, and a small-screen render. CI builds and runs geographic checks on macOS, Linux, and Windows. Passing a build is not platform-specific GPU validation.
