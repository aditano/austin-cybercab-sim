# Austin geography and Robotaxi reference notes

Research checked 5 October 2026. This is an independent simulation, not a Tesla product, live booking client, or autonomous-driving validation tool.

## Verified service and rider workflow

Tesla's [Cybercab FAQ](https://www.tesla.com/support/robotaxi/cybercab) and [Robotaxi support](https://www.tesla.com/support/robotaxi) describe rides in limited areas of Austin. The rider flow is:

1. Open the Robotaxi app and enter a destination **within the displayed service area**.
2. Review estimated fare and wait, then confirm.
3. Match the assigned vehicle (plate) and, for Cybercab, the **front lightbar / Megalamp color** shown in the app.
4. At pickup the rear lightbar is red, the front lightbar shows the match color, and hazards flash while parked. A door can open when the requester's phone is detected.
5. Buckle up; the door closes after buckling. With doors/trunk closed, tap **Start Ride** on the touchscreen or in the app.
6. During the trip the cabin screen shows progress, climate, and media. Support / pull-over are available.
7. At drop-off the vehicle parks and flashes hazards; open a door, exit, complete the trip in the app.

Both Cybercab and Model Y belong to the service; this simulator always assigns Cybercab. Prices, wait times, and hours here are simulated. Reported operating hours as of early October 2026 extend to about 11 p.m. in Austin; the UI notes a simulated 6:00–23:00 window.

## Megalamp (pickup identification)

On 1 October 2026 Tesla's Robotaxi account named the Cybercab RGB front lightbar the **Megalamp**. The rider guide already described front lightbar color changes during pickup. The app shows the assigned color; the vehicle glows the same color so riders can find the correct car when several gold Cybercabs are at the curb. This project uses a violet match color (`#c24bff`) on the vehicle and in the phone UI, with hazard flashing at park/drop-off.

## Austin geofence (approximate)

No official downloadable Tesla polygon was found. Third-party reporting on **31 August 2026** put the unsupervised Austin service area near **~288 square miles**, extended north toward Pflugerville / US 183 (Domain / Mesa Park). The envelope in `src/geo.ts` covers roughly downtown, the Domain, Pflugerville approach, Manor/SH-130 edge, AUS airport, South Austin / Del Valle, and West Lake Hills. Round Rock and Steiner Ranch are treated as outside. The phone map draws this ring with a clear “not an official Tesla polygon” note. The simulated ride stays on the downtown Congress corridor, which sits inside that envelope.

## Cabin and UI reference

The [Cybercab overview](https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-669E83C2-E7DE-40F4-9DBD-C9A32E7F6DFF.html) documents two seats, no pedals or steering wheel, door open/close on the touchscreen, seat controls, support, climate, volume, a top status bar, and an app launcher during trips. An overhead stop button requests an emergency pull-over. This project recreates relevant functions with original artwork — **not a pixel-perfect copy of production software**.

Published dimensions: about 1,754 mm width and 1,408 mm height. The procedural vehicle is an artistic approximation, not manufacturer CAD.

## Visual target

A publicly posted high-fidelity teleoperation / city-drive clip (chase camera, reflective paint, dense parked traffic, HUD speedometer) informed lighting, materials, chase camera, and traffic density. This remains a browser Three.js reconstruction with PBR materials, environment reflections, SSAO, bloom, and SMAA — not Unreal Engine or photogrammetry.

## Map provenance and licensing

`public/data/austin.json` is an OpenStreetMap geographic extract (1,079 road ways, 1,011 building footprints, 15 water polygons including Lady Bird Lake shoreline). Origin `[-97.745, 30.264]`. Bounding box west −97.754, south 30.252, east −97.738, north 30.272. Map data © OpenStreetMap contributors, **ODbL 1.0**.

Reproduce with `python3 docs/import_map.py austin.osm austin-lake.osm` after downloading the OSM API extracts listed in prior notes.

## Accuracy boundary

The ride follows Congress Avenue from 2nd to 7th Street. Traffic lights, NPC cars, pedestrians, parking, and stop behavior are simulated for immersion, not validated AV policy. The geofence is approximate community-reported coverage, not Tesla source data.
