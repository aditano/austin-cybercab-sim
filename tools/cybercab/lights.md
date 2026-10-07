# Cybercab light and motion behaviour (from video)

Clips were downloaded with yt-dlp (720p), trimmed with ffmpeg, and kept under 15 MB each (largest is 3.1 MB).
Frames were pulled at 4 fps into `frames/<clip>/f_###.jpg`, with contact sheets in `frames/sheet_*.jpg`.
The most useful zoomed sheets (8 to 12 fps crops) are in `frames/key/`.
Timestamps below are given as **source time** (position in the original YouTube video), with the clip-relative time in brackets.

## Clips

| File | Source | Channel, date | Source span |
|---|---|---|---|
| `tesla_official_future_is_autonomous_0000-0015.mp4` | https://www.youtube.com/watch?v=Qfj4urMF8CU | Tesla, 2024-10-29 | 0:00 to 0:15 |
| `tesla_official_future_is_autonomous_0027-0036.mp4` | https://www.youtube.com/watch?v=Qfj4urMF8CU | Tesla, 2024-10-29 | 0:27 to 0:36 |
| `we_robot_recap_0000-0008.mp4` | https://www.youtube.com/watch?v=ZTrebszENNw | Tesla (We, Robot recap), 2024-10-30 | 0:00 to 0:08 |
| `we_robot_recap_0039-0048.mp4` | https://www.youtube.com/watch?v=ZTrebszENNw | Tesla (We, Robot recap), 2024-10-30 | 0:39 to 0:48 |
| `tesla_future_has_arrived_0008-0014.mp4` | https://www.youtube.com/watch?v=grdt05okn3Q | Tesla, 2026-09-04 | 0:08 to 0:14 |
| `tesla_future_has_arrived_0027-0044.mp4` | https://www.youtube.com/watch?v=grdt05okn3Q | Tesla, 2026-09-04 | 0:27 to 0:44 |
| `tesla_robotaxi_tutorial_0034-0049.mp4` | https://www.youtube.com/watch?v=O4A6JKqT1t8 | Tesla Tutorials, 2026-09-03 | 0:34 to 0:49 |
| `austin_congress_ave_turn_0000-0009.mp4` | https://www.youtube.com/watch?v=zQ0bCKHXxMk | CyberCab TV (street sighting, Austin), 2026-09-23 | 0:00 to 0:09 |

## Observations

### Front light bar
- **Steady DRL / running light:** one continuous, very thin cool-white line across the full nose, on the hood's leading edge, with a dark channel below it. The ends sweep upward into the fenders.
  Official 0:05.2 to 0:06.3 [0:05.2 to 0:06.3] close-up (`frames/key/front_bar_lit_official_0005.jpg`). Night head-on: Future Has Arrived 0:10 to 0:11 [0:02.0 to 0:02.8]. Daylight: Tutorial 0:35.0 to 0:35.6 [0:01.0 to 0:01.6] (`frames/key/front_drl_day_tutorial_0035.jpg`).
- **Teal / turquoise state at pickup:** the whole front bar glows teal-green while the car is stopped and a rider walks past the nose to board.
  Future Has Arrived 0:29.1 to 0:30.0 [0:02.1 to 0:03.0] (`frames/key/front_bar_teal_pickup_future_arrived_0029.jpg`). It is steady (no sweep) for the ~1 s visible. This matches the turquoise "automated driving" marker colour, but its exact meaning is not stated in the video.
- **Wake / start-up sweep:** not seen. Every cut in these clips lands after the bars are already lit (Official 0:05.2: the frame before is a door close-up, the next frame already shows the bar fully lit).

### Rear light bar
- **Tail light:** one continuous thin red line across the full tail. It sits under a gloss-black band below the deck lip and wraps around the rear corners onto the flanks. It is steady while driving and turning.
  Official 0:02.5 to 0:03.5 [0:02.5 to 0:03.5] (`frames/key/rear_bar_lit_official_0002.jpg`). Austin street 0:05.0 to 0:07.5 [same], car turning onto Congress Ave (`frames/key/rear_bar_steady_turning_austin_0005.jpg`).
- **No second, lower red strip:** the lower rear is plain black bumper, with only the plate light (white) visible. See We, Robot recap 0:41.5 to 0:43.0.
- **Turn / hazard signal (rear):** on the parked show car, the main bar is off and only the **outer ends** of the rear bar blink **red**, both sides together (hazard).
  We, Robot recap, source 0:41.5 to 0:43.0 [clip 0:02.5 to 0:04.0] (`frames/key/rear_outer_blink_we_robot_0041.jpg`). Measured: on at +0.50 s, off at +0.92 s, on again at +1.17 s. That is on ~0.42 s, off ~0.25 s, period ~0.67 s (about 90 flashes/min). The lit length is roughly the outer 35 to 40% of each half of the bar.
- **Brake:** no clear brake event in the clips. The Austin clip shows a steady red bar through a slow turn with no visible intensity step.
- **Turn while driving:** the Austin right turn shows no visible change in the bar. The signal may not have been active, or the camera may have missed it at that distance.

### Doors and wheels
- **Doors:** single large butterfly door per side. It is hinged at the front top (A-pillar / roof front) and rises up and slightly outward until almost vertical. It opens automatically as the rider approaches ("The door opens for you as you approach", Tutorial 0:35).
  The closing stroke from fully open to shut takes ~1.5 s: Tutorial source 0:42.6 to 0:44.1 [clip 0:08.6 to 0:10.1] (`frames/key/door_close_tutorial_0041.jpg`). No special light state was seen when the doors open.
- **Wheels:** smooth painted aero covers with no spokes. They read as flat discs in motion (Austin clip). There are no wheel lights.

## How this maps onto the model / glb

Checked again on 7 October 2026 against the rider guide and Austin sightings. See the decision notes below.

| Animation | Based on | Notes |
|---|---|---|
| `lights_wake` | still inferred | Centre-out sweep over ~0.9 s (front, then rear 3 frames later) plus one brake-overlay pulse. No wake sequence was found in the rider guide or the 2026 Austin writeups. Kept. |
| `turn_left`, `turn_right` | rear timing observed; front color corrected | Outer 3 of 6 segments per side blink: 10 frames on, 6 off at 24 fps (0.42 s / 0.25 s), 3 cycles. Rear overlay stays red. Front overlay is the front bar's own color (white, or the Megalamp color), not amber. |
| `hazard` | observed | Both sides of the above together, when parked for pickup or drop-off. |
| `brake` | still inferred | Full-width brighter red overlay on the rear bar. The guide names brake lights, but no still or clip showed a separate pattern. Kept. |
| `pickup` | corrected | The glTF clip still shows one aqua overlay, which is one real Megalamp color. The sim paints the app-assigned color on the base front bar instead of forcing teal. |
| `door_open` | observed motion | 40 frames (1.67 s), close to the ~1.5 s stroke measured. |
| `wheel_spin` | n/a | One turn per 25 frames, loopable. |

## Decision notes (7 October 2026)

### Front bar color is the app color, including at the curb

Tesla's Cybercab rider guide, "Ride with Cybercab", says: during pickup the rear lightbar illuminates red and the front lightbar changes colors, and the rider should consult the Robotaxi app for the color assigned to that ride. When the car parks, the hazard lights flash. The same page says drop-off parks and flashes hazards.

https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-B2926138-4595-4C53-8C85-54EEED4CB7AF.html

The overview names headlights, brake lights, and the signature front and rear lightbars as separate things, and says the lightbars illuminate and change color during pickup and flash hazards when parked for pickup and drop-off.

https://www.tesla.com/robotaxi/riderguides/cybercab/en_us/GUID-669E83C2-E7DE-40F4-9DBD-C9A32E7F6DFF.html

Austin footage before the September 2026 launch showed the front bar in more than one steady color while cars were doing pickups, including orange, purple, and aqua, and white in ordinary driving. That matches one assigned color per ride, not a dedicated amber turn lamp and not a curb-only teal state.

https://www.teslaoracle.com/2026/08/27/cybercabs-spotted-colored-front-light-bars-video-know-why-tesla-integrated-this-feature/

The aqua bar in Future Has Arrived (0:29) is one of those colors. This sim's app color is violet (`#c24bff`), so the car keeps violet from dispatch through boarding. The teal overlay nodes and the `pickup` clip stay in the glTF as that aqua example. The sim does not turn them on for this ride.

### Front amber turn signal: not supported

No clip in the set shows an amber front segment. Orange and amber whole-bar glows in the Austin sightings above are Megalamp colors. The measured blink is the We, Robot rear hazard: outer ends, red, about 0.42 s on and 0.25 s off. The sim now blinks the outer three segments of each bar in that bar's own color. The running bar under those segments dims while the overlay is on, which is how a lit bar can still flash.

### Brake: kept

The overview lists brake lights separately from the signature bars, so a brake state exists. None of the reviewed clips, and none of the stills checked with this pass (Jurvetson rear, July 2025 rear three-quarter, San Francisco side, Tesla_Cybercab_002), showed a second lamp or a clear intensity step. A social post mentioned a high strip above the rear bar; that was not visible on those stills, so it was not added. The sim still brightens the full-width rear bar while slowing hard.

### Wake sweep: kept

The rider guide does not describe a startup animation. The clips still cut in with the bars already lit. The centre-out `lights_wake` sweep, with one brake pulse at the end, stays as an inference.
