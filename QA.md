# QA sweep — Austin Cybercab Experience

Audit of `main` at `3ab2c36` (the build GitHub Pages was serving on 6 Oct 2026). Findings below were recorded before the fixes in this branch. Resolution is in the table at the end and is updated as fixes land.

The live site `https://aditano.github.io/austin-cybercab-sim/` served the same hashed bundle this checkout builds (`index-DVLnbiTE.js`, `three-dmqnbsh1.js`, `index-Cyh_0qxo.css`). `cybercab.glb` is `model/gltf-binary` and `austin.json` returns 200. Pages cache-control on those files is `max-age=600`.

## How this was checked

- `npm test` (geography) and `npm run build` (`tsc` + Vite) both passed on this checkout.
- Headless Chromium (Playwright, SwiftShader). The render loop was paused for stills because one 1440×900 frame cost about **894 ms** here. That number is a software rasterizer, not a laptop or phone GPU.
- Viewports: 1440×900, 390×844, 320×568, 844×390, plus a 390×844 touch page at deviceScaleFactor 3.
- Console listeners, layout rectangles, the `render_game_to_text` / `advanceTime` hooks, and a full request → pickup → board path.
- A several-minute idle-plus-heap pass was abandoned: with the render loop left running, the SwiftShader GPU process sat at ~100% CPU and stopped making progress. Heap growth is rechecked with rendering paused.
- Teleoperator (`https://teleoperator.mindblown.ai/`) was opened in headless Chromium. Network metadata (URL, type, size) was recorded. Their models, textures, and sources were not saved into this repo.

## Ranked findings

### High

1. **Butterfly door opens into a broken sheet.** At pickup the curb door becomes a flat white plane and a jagged black mesh above the cabin, instead of swinging up on the roof hinge. `loadCybercab` guesses a hinge axis by probing. The builder (`tools/cybercab/build.py`, `key_open`) rotates that hinge on local Y by ±1.95 rad. The probe does not follow that.
2. **Cabin camera is inside the roof.** After Enter, the view is a dark plane with a sliver of seat at the bottom. The eye sits too high in the shell (`(0, 0.92, 0.12)`), so the rider cannot see Congress through the windshield.
3. **Phone covers the speedometer** at 1440×900. Measured overlap about **4,900 px²**. The dial reads as a stray “0” and “MPH” behind the phone. `.hud` is `pointer-events: none`, so Confirm still clicks, but the speed readout is not usable whenever the phone is up.
4. **Confirm is off-screen on a small phone and in landscape.** `#request` bottom was 647 px in a 568 px-tall viewport, and 591 px in an 844×390 landscape viewport. Cause: `@media (min-height: 801px)` and `@media (max-height: 800px)` override the narrow-screen phone scale, and the 700 px phone is only scaled, never fit to the viewport. A 320 px-wide phone cannot start a ride without guessing that the clipped phone scrolls.
5. **A phone cannot walk, and the UI blocks looking around.** Drag-to-look works on the canvas, but there is no touch locomotion (`joystick` absent; iPhone-sized page at DPR 3). At 390×844 the later media query scales the phone to 0.94 (height 658 px), so the scene is a strip. At 320 px the phone also covers the control hints. Boarded state shows the phone **and** the cabin panel at once, so both overlap and the street disappears.
6. **“Enter a destination” cannot be done, and an outside destination cannot be rejected.** There is no input. Pickup and dropoff are hard-coded inside the ring, so Confirm is never disabled. The outside-area chip is dead.
7. **No cancel once the cab has arrived** at the curb. Dispatch can be cancelled. The pickup screen only offers Enter.
8. **No loading state while the city and the cab load.** `#app` is an empty canvas until `mountCab`. Time to the test hook was about **6 s** with rendering paused and **12–19 s** with the loop running. `createWorld` then blocks the main thread merging the downtown mesh. Nothing tells the visitor that. SwiftShader frame time after that was **~894 ms** at the performance preset the software renderer is forced onto.

### Medium

9. **The cab drives through pedestrians and red lights after 5 s.** `blockedFor >= 5` raises the target speed to at least 3.4 m/s while `traffic.stop` is still true. Pedestrians start crossing on the cab’s red and take longer than the red phase to finish, so the timeout puts the cab through them.
10. **Refreshing mid-ride drops the trip** with no restore. Reload returns to explore. Not a crash; the ride is simply gone.
11. **Pressing P during the ride hides the phone for arrival.** The ride forces the phone off but still toggles `phoneVisible`. At arrival the phone stays hidden. The cabin can still open the door; it is easy to miss.
12. **`renderUI()` rebuilds the cabin DOM, including the map SVG, every 2 s of the ride.** That drops focus and allocates a large HTML string on a timer. The mutation counter was not finished under SwiftShader; the timer is in `animate`.
13. **`austin.json` is fetched twice** (phone map and world), about 670 KB each.
14. **Duplicate `id="center-map"`** when the arrival phone and the cabin are both mounted. Only the first control receives the click handler.
15. **No `prefers-reduced-motion` path.** Stylesheets do not mention it. Door, water, camera, and pedestrian motion always animate. Fullscreen uses an uncaught `requestFullscreen()` promise (no WebKit fallback).
16. **Phone text contrast fails WCAG AA** for the small copy on `#f6f7f2`: `.phone-sub` 3.56:1, `.geo-note` 3.46:1, `.micro` 2.91:1 at 7 px. Scene HUD text sits on whatever the street is; several labels measured under 2:1 against the page background color.
17. **Weak-GPU and phone pixel ratio.** iPhone DPR 3 is capped at 1.25 on balanced and 1.75 on ultra, with a 4096 shadow map on ultra. Software renderers correctly drop to performance and DPR 1. A real phone is not detected, so it can be switched onto ultra. There is no WebGL context-loss handler and no safe-area padding. `powerPreference: 'high-performance'` is a known iOS context-loss trigger.
18. **Fare line is cramped** in the phone (“Cybercab” collides with the estimate). Secondary, but it showed up in the desktop still.

### Low / checked and not a defect

19. **Seatbelt gate works.** Start Ride stays disabled, and a forced click does not leave `boarded`, until the belt is on and the door has closed.
20. **Rapid Confirm clicks** stay in `dispatch` (the button is replaced on the first click).
21. **Dispatch cancel, re-request, and pickup** reach `pickup` with the cab at `y = 0.16`, chase gap 6.08 m, Megalamp Violet, door amount 0.89. Wheel centers in the glTF sit at local `y = 0.33` with radius 0.33, so the tire contact matches `ROAD_Y`. The car was not floating or sunk in the stills. Wheels were not visually broken.
22. **Console** stayed empty of `error` / `warning` / `pageerror` during load and one rendered frame with the loop paused. This is not a multi-minute idle sample.
23. **Pages base path** `./` resolves under `/austin-cybercab-sim/`. No 404 on the glb or the map JSON.
24. **Keyboard:** C / P / WASD behave in dispatch (P hides the phone, C switches camera, WASD walks). F did not throw in this Chromium. Cabin view from C is the buried camera in finding 2.

## Teleoperator comparison

Public page: [https://teleoperator.mindblown.ai/](https://teleoperator.mindblown.ai/). Meta description: remote-pilot robotaxis across San Francisco (Waymo, Cybercab, and other cars), real-time WebGPU. Headless SwiftShader did **not** finish their shader compile (`GPUPipelineError: A valid external Instance reference no longer exists` on an `mbAlbedo` pipeline). The stills are their loading plate (“BUILDING SAN FRANCISCO”, then “COMPILING SHADERS”), not a live drive. Asset URLs and response headers were inspected; files were not kept.

What they do better:

- **First paint is a designed loading screen**, with a status line and a progress mark, while the city and shaders come in. The plate is a preloaded WebP (`teleop_title.webp`, `fetchpriority=high`). Our first paint is an empty canvas for several seconds.
- **The city is streamed as packed binaries** (`sky.bin.gz`, `roads.bin.gz`, `terrain.bin.gz`, `buildings.bin.gz`, `props.bin.gz`; together ~30 MB) plus **WebP atlases** (~40 MB in this session: facade sets, asphalt, foliage, pedestrians) and **gzip glTF vehicles** (`waymo.glb.gz`, `bus.glb.gz`, `cablecar.glb.gz`, …). District folders (`lm/lombard_gg`, `lm/waterfront`, `lm/skyline`) keep texture sets local. Our downtown is one 670 KB JSON plus ~9 MB of JPEG/PNG/HDR, built on the main thread in one shot.
- **WebGPU**, with an explicit shader-compile step. We are Three.js WebGL 2. A port does not fit this codebase, and it did not run in this headless GPU.
- **Controls sit on the edge** (sound, share) and the loading copy states WASD, curb stops, Tab map, Esc menu. Our phone and speedometer occupy the same corner.

Adopted here (techniques only, none of their files):

- An HTML loading shell that is visible before the module finishes, with status text through map, city build, and vehicle.
- One shared map fetch, and a turn of the event loop before the blocking city merge so that shell can paint.
- Frame-time step-down, phone DPR and shadow caps, and no render while the tab is hidden.
- Edge layout: speedometer off the phone, one panel on small screens, a thumbstick so a phone can walk and look.

Not adopted, and why:

- WebGPU and their custom city binaries. This scene is a few downtown blocks of OSM already in memory; a streaming format would be a rewrite.
- Their facade atlases, glTF cars, and WebP library. Those are their assets. Recompressing our CC0 maps to lossy WebP (especially normal maps) is a separate visual pass and was left out so this branch does not churn materials.
- Photoreal car work. Out of scope; the owner kept the current model. Only the hinge and the cabin eye point change, because those are animation and camera bugs.

## Test baseline before fixes

| Check | Result |
| --- | --- |
| `npm test` | 4/4 passed |
| `npm run build` | passed; Three chunk 568 KB min / 145 KB gzip |
| SwiftShader frame (1440×900, performance, loop paused except one `advanceTime`) | ~894 ms. Not a real GPU figure |
| `node tests/ride-flow.mjs` | rerun after the fixes; it was not completed in the audit because the unpaused SwiftShader loop stalled the machine |

## Resolution

| # | Status |
| --- | --- |
| 1 | Fixed. The curb door uses the builder’s local-Y swing (±1.95 rad). Open-door span stays near 2.1 m and the top of the door rises. |
| 2 | Fixed. The cabin eye sits in front of the seat backs. Windshield and door glass are hidden only in that view, because transmission reads as a black shell from the inside. Chase and pickup still show the glass. |
| 3 | Fixed. The speedometer sits on the left. Overlap with the phone at 1440×900 is under 50 px². |
| 4 | Fixed. On a short or narrow viewport the phone fits the screen and Confirm is the first control. Checked at 320×568 and 844×390. |
| 5 | Fixed. Coarse pointers get a thumbstick after Walk the block, and an on-screen Phone button. Under 800 px the phone hides while the cabin panel is up. |
| 6 | Fixed. A destination select disables Confirm for Round Rock (outside the ring) and allows Congress and the airport. |
| 7 | Fixed. Cancel ride is on the arrival screen and returns to explore. |
| 8 | Fixed. An HTML loading shell paints before the module, and the city build yields once so that shell can update. |
| 9 | Fixed. A stop only lowers the target speed. Pedestrians do not start a crossing into the cab and abort if it closes in. |
| 10 | Fixed. The in-progress trip is stored in `sessionStorage` and restored in the same tab. |
| 11 | Fixed. P during the ride does not hide the arrival phone. |
| 12 | Fixed. The ride timer updates the ETA and the map dot instead of rebuilding the cabin DOM. |
| 13 | Fixed. `austin.json` is fetched once and shared. |
| 14 | Fixed. Map zoom buttons share a class. The duplicate id is gone. |
| 15 | Fixed. Reduced motion snaps the door and the camera and skips water and pedestrian swing. Fullscreen failures toast instead of rejecting. |
| 16 | Fixed. Phone secondary copy is `#3e4a44` on `#f6f7f2`. HUD labels have a text shadow. |
| 17 | Fixed. Touch and software GL start on performance. Pixel ratio and shadow maps are capped (ultra shadows 2048 desktop / 1024 coarse). iOS asks for the default power preference. A lost WebGL context shows a reload panel. |
| 18 | Fixed. The fare name does not wrap into the estimate. |
| 19–24 | Still hold. Ride-flow and the new experience checks passed after the fixes. |

Left on purpose:

- WebGPU and a streamed city. The downtown extract already fits in memory.
- Recompressing CC0 maps to lossy WebP. Normal maps were left as shipped.
- A photoreal car pass. The owner kept the current model.
- Walking is limited to a band beside the cab lane so the camera does not enter buildings.
- SwiftShader frame time is not a laptop or phone figure. The audit’s cold 1440×900 frame was about 894 ms. A later `advanceTime(32)` after load returned in about 40 ms of wall time on the same software renderer. Neither number is a discrete-GPU frame time.
- GitHub Pages still caches unhashed public files for `max-age=600`. Hashed bundles change name when the build changes.
- Heap across a multi-minute idle loop was not sampled with the renderer running. With the loop paused, a full ride and a second load produced no page errors and no console errors.
