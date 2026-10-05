# Austin geography and Robotaxi reference notes

Research checked 5 October 2026. This is an independent simulation, not a Tesla product, live booking client, or autonomous-driving validation tool.

## Verified service and rider workflow

Tesla's current [Cybercab FAQ](https://www.tesla.com/support/robotaxi/cybercab) confirms Cybercab rides in **limited areas of Austin**. It describes a gold two-seat vehicle with butterfly doors, no steering wheel, and a central interactive screen. Both Cybercab and Model Y belong to the service; real vehicle assignment depends on availability and group size. The simulator deliberately assigns Cybercab. This is not a claim that every Austin booking receives one.

The official [Robotaxi support page](https://www.tesla.com/support/robotaxi) describes entering a destination, checking an estimated fare and wait, confirming a request, matching the vehicle plate, entering and buckling up, and starting the trip. It says the app displays the available service area. **No authoritative downloadable service-area polygon was found.** The included downtown corridor is a real Austin location, not a certified current service geofence. Prices and wait times in this project are simulated, not live Tesla quotes. Do not restore the old $4.20 launch fare as a current pricing claim.

The [Cybercab ride guide](https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-B2926138-4595-4C53-8C85-54EEED4CB7AF.html) adds vehicle-specific details: the assigned pickup color appears on the front lightbar; hazard lights flash while parked; doors can open automatically at pickup; riders must be buckled with doors closed before starting. The screen shows trip progress and arrival time. At the destination the vehicle parks, riders open a door and exit, then complete the trip in the app. Actual support and stop functions are operational service features; their simulated equivalents do not contact Tesla or emergency services.

## Cabin and UI reference

The [official Cybercab overview](https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-669E83C2-E7DE-40F4-9DBD-C9A32E7F6DFF.html) documents two seats, no pedals or steering wheel, and screen controls for doors, seat position, support, temperature, and media volume. The screen has a top status strip and an app launcher during trips. An overhead stop button initiates an emergency pull-over request. This project recreates relevant functions and general visual arrangement with original artwork; it is **not a pixel-perfect extraction of proprietary production software**.

The [official dimensions page](https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-3229BCDF-16D8-447B-BCED-77E3E067AFBB.html) specifies 1,754 mm overall width and 1,408 mm height. The procedural vehicle is an approximation, not a manufacturer CAD model. Facades, materials, cabin geometry and lighting are artistic reconstructions.

## Map provenance and licensing

`public/data/austin.json` is an actual OpenStreetMap geographic extract, not a generated street grid. It contains **1,079 road ways, 1,011 closed building footprints, and 15 water polygons**, including the outer shoreline of Lady Bird Lake. Coordinates are WGS84 longitude/latitude. The scene origin is `[-97.745, 30.264]`.

Sources retrieved using the official OSM API:

- [Downtown/South Congress bounding-box extract](https://api.openstreetmap.org/api/0.6/map?bbox=-97.754,30.252,-97.738,30.272)
- [Lady Bird Lake relation 32671 with members](https://api.openstreetmap.org/api/0.6/relation/32671/full)
- [OpenStreetMap attribution and license](https://www.openstreetmap.org/copyright)

Bounding box: west -97.754, south 30.252, east -97.738, north 30.272. Ways crossing the boundary retain their full geometry. The lake relation extends beyond the box to close its shoreline; islands are omitted. Vehicle roads and pedestrian streets are retained; footways, paths and cycleways are not included in this compact road layer. Named streets and geometry come from OSM. Many building heights are not surveyed: the extract uses the `height` tag when available, otherwise `building:levels × 3.4 m`, otherwise a 10 m default. Each building includes `heightSource` so these cases are distinguishable. Facade detail, trees, street furniture, traffic, lane offsets and travel time are not survey data.

Map data © OpenStreetMap contributors, licensed under **ODbL 1.0**. This JSON is an adapted database and remains available under that license. Preserve its attribution and source metadata when redistributing. The application's original code license does not replace the map-data license.

## Reproduce the extract

Download the two API responses to `austin.osm` and `austin-lake.osm`, then run:

```sh
python3 docs/import_map.py austin.osm austin-lake.osm
```

The script writes `public/data/austin.json`; run it from the repository root. Inspect current map terms and API usage policy before repeated or bulk downloads. The file's `fetchedAt` value records this checked-in snapshot, not a promise of real-time updates.

## Accuracy boundary

The route follows Congress Avenue from 2nd Street to 7th Street, north of Lady Bird Lake; the wider scenery extract includes the lake and bridge. It does not reconstruct the full Austin metro, a production dispatch policy, a live Tesla route, or real vehicle perception/planning. Missing facade scans and proprietary assets mean the result is a stylized geographic reconstruction with cinematic rendering, not a photogrammetric digital twin or Unreal Engine benchmark. Cross-platform browser support should be tested separately from native executable support.
