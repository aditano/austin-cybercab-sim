# Austin geography and Robotaxi reference notes

Research checked 5 October 2026. This is an independent simulation, not a Tesla product, live booking client, or autonomous-driving validation tool.

## Verified service and rider workflow

Tesla's [Cybercab FAQ](https://www.tesla.com/support/robotaxi/cybercab) and [Robotaxi support](https://www.tesla.com/support/robotaxi) describe rides in limited areas of Austin. The rider flow is:

1. Open the Robotaxi app and enter a destination **within the displayed service area**.
2. Review estimated fare and wait, then confirm.
3. Match the assigned vehicle (plate) and, for Cybercab, the **front lightbar / Megalamp color** shown in the app.
4. At pickup the rear lightbar is red and hazards flash while parked. This sim keeps the violet match color on the front bar from the approach through boarding, the same color the app shows. A door can open when the requester's phone is detected.
5. Buckle up; the door closes after buckling. With doors/trunk closed, tap **Start Ride** on the touchscreen or in the app.
6. During the trip the cabin screen shows progress, climate, and media. Support / pull-over are available.
7. At drop-off the vehicle parks and flashes hazards; open a door, exit, complete the trip in the app.

Both Cybercab and Model Y belong to the service; this simulator always assigns Cybercab. Prices, wait times, and hours here are simulated. Reported operating hours as of early October 2026 extend to about 11 p.m. in Austin; the UI notes a simulated 6:00–23:00 window.

## Megalamp (pickup identification)

On 1 October 2026 Tesla's Robotaxi account named the Cybercab RGB front lightbar the **Megalamp**. The rider guide says that during pickup the rear lightbar is red and the front lightbar changes to the color shown in the app, and that the lightbars flash hazards when the car is parked for pickup or drop-off. This project uses one violet match color (`#c24bff`) in the phone UI and on the front bar from the approach through boarding. Aqua and teal seen on other cars are other assigned colors, not a second curb-only state. Turn signals blink the outer ends of each bar in that bar's own color (rear red, front white or the match color). Brake lights brighten the full rear bar while slowing. Sources and the guesses that stayed are in `tools/cybercab/lights.md`.

## Austin geofence (approximate)

No official downloadable Tesla polygon was found. Third-party reporting on **31 August 2026** put the unsupervised Austin service area near **~288 square miles**, extended north toward Pflugerville / US 183 (Domain / Mesa Park). The envelope in `src/geo.ts` covers roughly downtown, the Domain, Pflugerville approach, Manor/SH-130 edge, AUS airport, South Austin / Del Valle, and West Lake Hills. Round Rock and Steiner Ranch are treated as outside. The phone map draws this ring with a clear “not an official Tesla polygon” note. The simulated ride stays on the downtown Congress corridor, which sits inside that envelope.

## Cabin and UI reference

The [Cybercab overview](https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-669E83C2-E7DE-40F4-9DBD-C9A32E7F6DFF.html) documents two seats, no pedals or steering wheel, door open/close on the touchscreen, seat controls, support, climate, volume, a top status bar, and an app launcher during trips. An overhead stop button requests an emergency pull-over. This project recreates relevant functions with original artwork — **not a pixel-perfect copy of production software**.

Published dimensions: about 1,754 mm width, 1,408 mm height, and 144 mm ground clearance. The bundled vehicle is a photo-fit model from `tools/cybercab/build.py` (about 4.35 m long, 2.635 m wheelbase), not manufacturer CAD. A CC BY Sketchfab scan is not bundled.

## Visual target

A publicly posted high-fidelity teleoperation / city-drive clip (chase camera, reflective paint, dense parked traffic, HUD speedometer) informed lighting, materials, chase camera, and traffic density. This remains a browser Three.js reconstruction with PBR materials, environment reflections, optional SSAO, bloom, and SMAA — not Unreal Engine or photogrammetry.

The default graphics mode is Auto. It scores the GPU, memory, and pointer type, then adapts from measured frame time with hysteresis. Manual Low / Medium / High / Ultra persist in localStorage. Software GL stays on Low. Simulation steps catch up to about a quarter-second per frame so a slow paint does not freeze the cab a block away.

Lighting uses a Poly Haven golden-hour HDRI for image-based lighting and reflections, ACES filmic tone mapping, and sRGB output. A directional sun still casts a soft shadow. A contact shadow sits under the tires. Bloom stays gated to emissive lamps.

The vehicle is a meshopt glTF coupe: champagne clearcoat paint, tinted glass, rubber tires, aero wheel covers, butterfly doors, a full-width front light bar, and a full-width red rear light bar. It sits with its tires on the road. Wheels roll with speed and the fronts steer. The curb door opens as the rider arrives and closes in about 1.5 s after buckling. During the approach and at the curb the camera sits ahead and to the curb side. Once the ride starts it follows from behind and above, looking up Congress. The cabin eye sits between the seats and looks through the windshield.

Downtown reads as Austin rather than a generic glass grid. Roads and sidewalks use CC0 asphalt and concrete maps. Building walls use a concrete facade map, and curtain-wall glass picks up the HDRI. OSM footprints still supply Frost Bank Tower, The Independent, and The Austonian; the sim adds a recognizable crown, cantilevered floors, and a spire on those footprints. The Texas State Capitol dome is just north of the bundled extract, so an artistic rose-granite capitol is placed on the published coordinate, on axis with Congress. The mesh is enlarged past the real ~95 m height so the dome stays readable through golden-hour haze at the end of the avenue. Street trees use a CC0 leaf atlas on cards, set back from the curb so they leave that sightline open. Lady Bird Lake stays the OSM shoreline. The opening view looks slightly up, north up Congress.

The cab approaches along Congress from the south of 2nd, pulls to the east curb, stops, and only then opens the curb door. City driving is about 25–30 mph, with a short pause for red lights, instead of creeping until the pickup times out. WASD returns to the walk camera during the approach.

## Map provenance and licensing

`public/data/austin.json` is an OpenStreetMap geographic extract (1,079 road ways, 1,011 building footprints, 15 water polygons including Lady Bird Lake shoreline). Origin `[-97.745, 30.264]`. Bounding box west −97.754, south 30.252, east −97.738, north 30.272. Map data © OpenStreetMap contributors, **ODbL 1.0**.

Reproduce with `python3 docs/import_map.py austin.osm austin-lake.osm` after downloading the OSM API extracts listed in prior notes.

## Accuracy boundary

The ride follows Congress Avenue from 2nd to 7th Street. Traffic lights, NPC cars, pedestrians, parking, and stop behavior are simulated for immersion, not validated AV policy. The geofence is approximate community-reported coverage, not Tesla source data.
