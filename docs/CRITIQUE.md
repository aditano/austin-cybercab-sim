# Critique before the street pass

Judged at commit `772c9be` (main after PR #13), 7 Oct 2026. Stills are the sim as it runs, not a retouched composite.

## How it was looked at

Cameras are the real walk, chase, and cabin modes (`C`, then hail and Get in). Presets were forced with `?preset=&force=1` so SwiftShader did not clamp the label to Low. Viewport 1440×900.

| Still | What it is |
| --- | --- |
| `before/low-walk.jpg`, `low-chase.jpg`, `low-cabin.jpg` | Low. 1 s of sim took 186 ms wall. Boot 4.4 s. |
| `before/medium-*.jpg` | Medium. 1 s of sim took 293 ms. Boot 7.0 s. |
| `before/high-*.jpg` | High. 1 s of sim took 2.9 s. Boot 6.3 s. Reflections probe, 3 cascades. |
| `before/ultra-walk.jpg`, `ultra-chase.jpg` | Ultra walk and chase. The boarded cabin frame was still inside the SwiftShader SSR pass when the capture was stopped, so there is no ultra cabin still. |
| `before/01-explore.png` through `10-mobile.png` | Same build, every ride screen: explore, dispatch, pickup, cabin, ride chase, ride cabin, car front, arrived, exited, mobile. |

Street reference: Michael Barera, *Austin August 2019 01* and *11 (Congress Avenue)*, CC BY-SA 4.0, Wikimedia Commons. Those frames show limestone and brick blocks, individual punched windows, live oaks, marked asphalt, and cars with real proportions under a humid sky.

App reference, not committed (Tesla’s screens are not GPL): Not a Tesla App, 3 Sep 2026, Cybercab app frames; the Reddit post “This is what Tesla’s Robotaxi app looks like when your Cybercab arrives”; Google Play listing `com.tesla.riders`. Pixel samples of those files are near-black (`#111111`–`#171717`) with a teal accent around `rgb(0, 191, 183)`. The arrival write-up describes a full-screen glow that matches the front light bar, a direction arrow, a distance, and honk / flash / open-door actions. The earlier PR compared an App Store marketing splash. That comparison is discarded.

On the before stills, SSAO and bloom stayed off even with a forced preset, because those two passes checked the software-GL string. Cascaded shadows and Ultra SSR did run. The edits point SSAO and bloom at the same force bypass. Geometry, materials, scale, and the phone never depended on that.

This is not GTA 6, and these stills do not look like the Congress Avenue photographs.

## City and street

| ID | Flaw | Evidence | Status |
| --- | --- | --- | --- |
| C1 | Towers are one tan concrete texture with a grid of instanced window boxes. Roofs are the same texture. Nothing reads as brick, limestone, glass curtain wall, or a parapet. | Walk stills at every preset. `building()` in `src/world.ts`. | partial — ambientCG facade photos, a tile roof, and a warm interior on dark texels. Footprints are still extrusions. |
| C2 | A Kenney stop sign fills the top right. Its glTF positions are integer-quantized (`Y` about −32767..32767). Scaled toward a 3.1 m sign, the octagon becomes a billboard. Warning signs use the same kit. | Every walk and chase still. `road-sign-stop.glb`. | fixed — stop and warning signs are not instanced. Remaining orange in the stills is the sky, spread across the frame, not a sign blob. |
| C3 | The foreground parked car is a Kenney body: blocky, dark, no real glass or panel gaps. It sits in the hero view on Congress. | Chase and walk stills. `life.ts` parks along the route; `world.ts` parks more. | fixed in the hero block — Kenney cars within 58 m of the south hub are not parked. A chase sample no longer has a black block in the foreground. |
| C4 | Trees in the hero view are cones or a few leaf cards. The Austin photos are live-oak canopies over the sidewalk. | Walk stills vs Barera 2019. | partial — more leaf-card trees near the hubs. They are not live oaks. |
| C5 | Asphalt is a dry, flat map. No wear, no lane-line sheen, no wet reflection. Curbs and crosswalks are thin strips. | All street stills. Asphalt roughness is 1. | partial — asphalt roughness 0.34, metalness 0.28, clearcoat. Not a worn street. |
| C6 | Street furniture is sparse and often the wrong scale (signals are one amber disc on a bar; street-name blades are canvas planes). No benches-in-shade, news racks, or curb ramps that read in the hero frame. | Chase stills. | partial — the crossing head has three lenses, and a few manhole lids sit near the hubs. |
| C7 | The capitol, Frost Bank crown, Independent slabs, and Austonian tip are primitive meshes on top of the footprint extrusion. They do not match the photographed buildings. | Visible as simplified masses, not as landmarks. | not fixed — the capitol and the towers are still primitives. A real mesh needs a paid scan. |
| C8 | People are Mixamo characters, few of them, and they do not read as a sidewalk crowd. | Life spawner. Not the hero problem, but the street is empty next to the Austin photos. | not fixed — no free crowd that reads as people on Congress. |
| C9 | Moving traffic is the same Kenney kit as the parked car, with a clearcoat tuned in code. At chase distance the silhouettes are still toys. | Chase stills. | not fixed for moving traffic — no small CC0 photogrammetry car. The hero parked car is the one that was removed. |
| C10 | No ground decals: cracks, manholes, tar snakes, crosswalk wear, or oil stains. | Street stills. | partial — manhole lids only. No cracks, tar, or crosswalk wear. |

## Lighting, sky, and post

| ID | Flaw | Evidence | Status |
| --- | --- | --- | --- |
| L1 | Sky is a flat gradient. The evening HDRI is loaded as an environment, then a procedural sky and a near-zero fog (`FogExp2` density `0.0002`) paint over it. No golden-hour sun disc, no volumetric haze, no cloud shadow. | Upper half of every still vs the humid Austin sky. | partial — Kloofendal golden-hour HDRI, a lower sun, turbidity 6.2, fog density 0.0034. The sky is still a shader. |
| L2 | Sun is one warm directional. On these stills contact shadows are faint. Cascades exist in code for Medium and up, but materials are so flat the light has nothing to catch. | Medium/High/Ultra vs Low. | partial — sun is warmer. Cascades are unchanged. Flat materials still take light poorly. |
| L3 | SSAO is disabled whenever the GL renderer string is software, including a forced High/Ultra capture. On a real GPU the radii are 0.08–0.12 m, which will not occlude a street the way a film still does. | `applyQuality` in `src/main.ts`. | partial — SSAO now follows the forced-preset bypass, and the radius is 0.18–0.28 m. It is still a small-scale pass. |
| L4 | Bloom is the same software-GL gate, and the threshold is 0.96, so almost nothing blooms. Headlights and the light bar should halo. | `bloomPass.threshold`. | partial — bloom threshold 0.72, and it follows the same bypass. The light bar can halo. It is not a film bloom. |
| L5 | Screen-space reflections run only on Ultra, and only on shiny car paint. The first Ultra chase frame took long enough on SwiftShader that the cabin frame never returned. Asphalt is excluded by the metalness filter. | `lighting.ts` `wantSsr` and `paintMeshes`. Ultra capture. | not fixed for High — SSR stays Ultra-only. A SwiftShader Ultra cabin frame never returned. Wet asphalt uses the HDRI instead. |
| L6 | Anti-aliasing is SMAA when it is on. There is no temporal pass. Three r180 has no stock TAA pass. Edges still shimmer in motion; a still hides that. | `SMAAPass` only. | not fixed — three r180 has SMAA and no stock TAA pass. SMAA stays. |
| L7 | No depth of field on the chase camera. The whole street is equally sharp, which is part of why it reads as a game. | Chase stills. | fixed on High and Ultra chase — a bokeh pass focuses on the cab. Medium stills are sharp on purpose, so the capture machine stays usable. |
| L8 | Color is ACES at exposure 1.02 and a warm clear. No grade: crushed blacks, teal shadows, and a golden highlight rolloff are missing. Presets do not change the grade. | Side-by-side Low/Medium/High/Ultra walk frames. | partial — a grade pass warms highlights and cools shadows. Not a filmed LUT. |
| L9 | Glass is a tinted physical material without an interior. Windows are either boxes or empty reflections. | Building and cabin stills. | partial — dark texels in the facade photo pick up a room color and a view shift. Not a real interior. |

## Cameras

| ID | Flaw | Evidence | Status |
| --- | --- | --- | --- |
| K1 | Walk (eye about 1.62 m) is the right height, and it is the view that shows the octagon and the tan towers. It feels like a game camera because of C1–C3 and L1, not because the eye is in the wrong place. | `*-walk.jpg`. | partial — the eye height is unchanged. The octagon and the hero Kenney car are gone from that view. |
| K2 | Chase sits about 6.6 m off the cab. The gap is legal for the tests, and the cab reads, but the parked Kenney car and the octagon compete with it. No focus falloff. | `cameraGap` 6.62 on every preset. | partial — the 6.6 m gap is unchanged. Depth of field is on for High and Ultra chase. |
| K3 | Cabin eye is inside the body (local y about 1.02). A brightness slice of the cabin stills is bright through the upper half and dark across the dash, so the street is visible. The dash itself is a dark wedge with no readable screen, and the world outside is the same game street. | `*-cabin.jpg` row samples. Cabin luma test only checks that the view is not black. | partial — the street still shows through the glass. The dash is still the glTF, not a photographed cabin UI. |
| K4 | There is no separate cinematic camera. Chase is the only “film” view, and it has no depth of field. | `Cam` is walk, chase, or cabin. | partial — chase is the cinematic camera, and High/Ultra chase now has depth of field. |

## Robotaxi phone

The real frames we could open are dark, with teal route ink. Our phone is a beige map (`#efeae2`), white roads, a white sheet, and black type in Inter. Layout names overlap (Where to?, a sheet, a plate) and the spacing, weight, and color do not.

| ID | Screen | Flaw | Status |
| --- | --- | --- | --- |
| A1 | Home / map | Map is a light paper texture. Buildings `#e4dfd6`, roads white, route `#171717`. The reference frames sample as near-black with teal. | fixed — map land is #1a1d21, roads #4c5662, route #2ee6d6. The explore phone samples as about rgb(42,42,46). |
| A2 | Where to? | Search row, chips, and two place rows exist, but they sit on a white sheet with gray pills. Real type is white on a dark sheet, and the field is a dark rounded search, not a light gray one. | fixed — the sheet, search field, and chips are dark, type is light, Inter stays. |
| A3 | Ride options / ETA | One fare line (“Cybercab · 1 rider · ~3 min”) plus Confirm. The Sep 2026 app offers Cybercab (2 seats) and Model Y (4 seats), with an ETA and a fare, before confirm. No rider count. | partial — Cybercab (2 seats) and Model Y (4 seats) sit on the sheet with an ETA. Model Y only explains that this ride is the Cybercab. The fare is still a stand-in. |
| A4 | On the way | Dispatch is a CSS car silhouette, a Texas plate, a violet swatch, and “Cancel”. It is not a dark map with the car on it. | partial — dispatch is the plate and the violet swatch on the dark map, not a separate photographed card. |
| A5 | Car arriving | Pickup says “Your Cybercab is here” and “Get in”. The real arrival screen is a full-bleed glow in the light-bar color, a large arrow, a distance, the plate, and honk / flash / open. Our violet is a 12 px dot. | fixed — pickup fills the phone with the Megalamp. A sample at the arrow reads rgb(194,75,255). Arrow, “12 m”, plate, Honk, Flash, and Open doors are on that screen. |
| A6 | In-ride | The phone is removed for the whole ride (`phase === 'ride'`). Controls move to a separate cabin panel (temperature, Media, Support, Pull over). There is no in-ride map card on the phone. | not fixed as a phone screen — the phone stays down for the ride. `togglePhone` ignores `ride` because the experience test requires P to leave `phoneVisible` true. The cabin panel is the in-ride card. |
| A7 | Arrival | “You’ve arrived” plus “Open door”, on the same white sheet. No dark arrival card, no distance-to-curb, no reminder of the plate. | partial — the arrived sheet uses the dark theme. It is not a photographed arrival layout. |
| A8 | Rating | Five round star buttons, then Done, then a second star row on Trip complete. Usable, and not the dark full-screen rating the reference frames use. | partial — stars sit on the dark sheet. Not a full-screen rating layout from a rider photo. |
| A9 | Chrome | “Walk the block”, the geofence paragraph, and “Independent concept…” are sim copy on the sheet. They push Confirm down. The wordmark is Inter, not Tesla’s face; that part stays, on purpose. | partial — the geofence line and “Independent concept” stay. They are required. Inter stays the stand-in for Universal Sans. |
| A10 | Mobile | At 390×844 the sheet still uses the light theme. The small-height rule hides the map, which fights the full-bleed map. | partial — the full-bleed map is no longer hidden at 320×568. The sheet is dark. Confirm stayed on screen in the experience test. |
| A11 | Boarded | “Buckle up” / “Fasten seatbelt” / “Start Ride” is the right gate (tests require it) and it does not match a photographed screen. Keep the gate; restyle it. | partial — the belt gate is unchanged and the sheet is dark. |

## Ride flow, animation, performance

| ID | Flaw | Evidence | Status |
| --- | --- | --- | --- |
| R1 | Hail, cancel, pickup, door, belt, start, roll, pause, arrive, exit, and restart do run. Teal stays off and the front bar is the violet Megalamp. Those are not regressions to undo. | `tests/ride-flow.mjs`, `tests/experience.mjs`. | kept — experience and ride-flow passed after the edits. Teal stays 0. The bar stays the violet Megalamp. |
| R2 | `P` during the ride does not bring the phone back (`togglePhone` ignores `ride`). The in-ride app is unreachable. | `src/logic.ts`. | not fixed — see A6. Changing it would fail the experience test. |
| R3 | Traffic eases and oncoming lanes face the right way. Signals are a single glowing disc, not a three-light head, and they do not read at street distance. | `streetIntersection` and `life.ts`. | partial — three lenses on the crossing head. They are not a timed red/yellow/green cycle. |
| R4 | Doors, wheels, and the light bar animate. Pedestrians cycle Mixamo clips. Foliage does not move. The hero problem is the mesh, not the clip. | Cabin and chase stills. | not fixed — foliage does not move. The hero problem was the mesh. |
| R5 | High, one rendered second of sim: 2.9 s wall on SwiftShader. Ultra SSR did not finish a cabin frame in the capture window. Forcing Ultra on a software GPU is not a shippable preset. | Capture report. | not fixed — Ultra SSR on SwiftShader still does not finish a cabin frame in a normal capture. |
| R6 | Low is the only preset that stays interactive here (186 ms for 1 s of sim, and that cost is mostly one frame plus 60 updates). Medium was 293 ms. The city cost is the window-box instances and the hero facade mesh, not the phone. | Capture report. `building()` instancing. | partial — the window-box instances are gone. Medium still rendered a frame in under a second. Ultra was not re-timed. |

## Needs a paid asset or a key

Not bought, and not called.

| ID | What | Why it is out of reach | Status |
| --- | --- | --- | --- |
| P1 | Google Photorealistic 3D Tiles / Map Tiles | API key and billing. This is the thing that would replace the extruded downtown. | not fixed — not purchased. |
| P2 | A commercial Austin photogrammetry mesh (Aerometrex-class city tiles) | Paid, and far too heavy for this page. | not fixed — not purchased. |
| P3 | Megascans / Quixel or a paid facade and vehicle pack | Paid. CC0 facade photos can only approximate. | not fixed — not purchased. CC0 facade photos are the stand-in. |
| P4 | A licensed Tesla Universal Sans file, the Tesla logo, and official app screenshots in the repo | Those are Tesla’s. Inter stays the stand-in. Reference frames stay outside the GPL tree. | not fixed — Tesla’s face and logo stay out of the GPL tree. |
| P5 | A real Cybercab interior UI and a photogrammetry cabin | No free scan of the production interior at a usable size. | not fixed — no free production-interior scan. |

## What “fixed” is allowed to mean

A fix has to be free, GPL-compatible, and small enough to ship. It has to keep the Blender Cybercab, the violet Megalamp, teal at 0, the belt-before-start gate, and the cabin eye limits. Each row above is marked fixed, partial, kept, or not fixed.

## After the edits

Medium, forced, SwiftShader, 1440×900. Experience and ride-flow both passed.

The walk frame no longer has a compact orange sign. Orange pixels that remain are spread across the sky. The explore phone samples as about `rgb(42, 42, 46)`. The pickup phone samples as `rgb(194, 75, 255)` at the arrow, which is the violet Megalamp fill. A chase crop of the lower frame is road and the cab, not a parked black block.

It is still not the Barera photograph and not GTA 6. The towers are textured extrusions. The moving cars are still the Kenney kit. The sky is still a shader plus an HDRI. Ultra screen-space reflections were left on Ultra only.
