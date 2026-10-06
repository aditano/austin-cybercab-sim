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

- Drag on the 3D view to look around.
- Use **W A S D** to walk in the opening scene.
- Press **P** to show or hide the request phone, and **F** to toggle fullscreen.
- Use the top-right graphics button to cycle balanced, cinematic, and performance settings. Balanced is the default.
- On the phone, confirm a ride, match the violet Megalamp and plate, and choose **Enter** when the cab has stopped. WASD returns you to walking while it approaches.
- In the cabin, choose **Fasten seatbelt**, then **Start Ride** after the doors close. During the ride, adjust the cabin temperature, toggle the generated ambient tone, or pause and resume the trip.
- At the destination, exit and choose **Take another ride** to repeat the experience.

The request, pickup, ride timing, estimated time, fare-like UI, cabin functions, and trip completion are all simulated locally. They do not contact Tesla or emergency services. The phone map renders the bundled OSM geography and route. The interface is an original approximation, not a Tesla app screenshot.

## Scope and accuracy

The scene uses Three.js geometry, materials, lighting, fog, and post-processing to create a cinematic, procedural impression of downtown. It is not photogrammetry, a surveyed digital twin, or an Unreal Engine scene. Building shapes and heights are incomplete approximations, while facade detail, trees, street furniture, traffic, lane offsets, and travel time are not survey data. The vehicle and cabin are procedural artistic reconstructions, not manufacturer CAD or an exact copy of production software.

The bundled OpenStreetMap extract covers a compact downtown area around Congress Avenue, from the South Congress riverfront through northern downtown, and includes nearby streets, building footprints, and Lady Bird Lake shoreline. The simulated trip runs from Congress & 2nd to Congress & 7th and stays north of the lake; it does not cross the lake or model an Austin-wide route. OSM data is an input to the scene, not a live map feed or a Tesla service-area boundary. See [docs/RESEARCH.md](docs/RESEARCH.md) for source, extraction, and height-estimation details.

## Map attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The adapted map database in `public/data/austin.json` remains under ODbL. Preserve its attribution and source metadata when redistributing it; the application's code license does not replace the map-data license.

## Project commands

- `npm run dev` — start the Vite development server.
- `npm run build` — type-check with TypeScript and create the production bundle in `dist/`.
- `npm run preview` — serve the production bundle locally.
- `npm test` — run the repository's Node test suite.
- A push to `main` publishes the production build to GitHub Pages.

## Validation

`npm test` checks geographic coordinates and verifies that route vertices belong to the OSM Congress Avenue data. For the interactive journey, start the app and run `node tests/ride-flow.mjs` (install Chromium with `npx playwright install chromium` first if necessary). Set `SIM_URL` to test a production preview instead. Screenshots are written to ignored `output/validation/`.

The browser test covers request cancellation, pickup, boarding, seatbelt gating, climate, media, pause/resume, arrival, exit, replay, phone visibility, and a small-screen render. CI builds and runs geographic checks on macOS, Linux, and Windows. Passing a build is not platform-specific GPU validation.
