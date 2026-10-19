# Track contact and loop clearance

The user observed vehicles passing through the track during the first live playtest. Investigation found three independent causes:

1. The original loop formula advanced six units along its own plane. Its lower incoming and outgoing branches intersected exactly, about 0.4–0.5 units above the workshop bench, on all five courses.
2. Car placement used a fixed 0.03-unit center offset. Tire tread geometry and the curved road under the full wheelbase caused up to about 0.05 units of penetration in numeric sweeps.
3. The chase camera used a tangent shortcut behind the car. This could put it outside a loop’s road surface. Smoothing could also put the camera’s view ray through jump crests.

## Canonical corrections

- Revision 2 gives each loop a smooth lateral advance wider than the molded road and lips, holds the exit lane until clear of the loop, and smoothly reconnects it. The track remains continuous with orthonormal local frames.
- Renderer geometry constants are shared between the tire/chassis model, track surface, and contact calculation. Placement fits the actual tire footprint and chassis points against the sampled road, including body roll, suspension movement, and airborne height.
- The chase camera follows sampled points along the course rather than an extrapolated tangent. Camera obstruction checks use the same rendered road geometry.

## Records remain preserved

Race configuration records the geometry revision. Missing revision on original v1 recordings means revision 1. The numerical simulation is shared; the versioned track generator reproduces old geometry for verification. Current games and ghosts use revision 2. Earlier earned times and inputs remain accessible in Settings and record exports, while rankings partition revisions and preserve original database rows during migration.

## Regression checks

- All five loop crossings and nonadjacent road/lip clearances.
- Four car models across the five courses, banks, loops, ramps, and flight.
- Boosted camera positions, smoothing, and sightlines against road geometry.
- Legacy replay reproduction and refusal to reinterpret it on corrected geometry.
- Ranking migration preserves account sessions, personal bests, and compressed replay bytes.
