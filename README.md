# Velocity Loop

A complete miniature time-trial racer built from prompts 2–13 of the [OpenAI Velocity Loop showcase](https://developers.openai.com/showcase/velocity-loop?site_locale=en).

## Run locally

Requires Node.js 24.12 or newer.

```sh
npm ci
npm run server
```

In a second terminal:

```sh
npm run dev
```

Open **http://127.0.0.1:4173**. The Vite development server proxies `/api` to the account and ranking service on port 4174. To run the built game locally, use `npm run build` and open **http://127.0.0.1:4174** while the service is running.

## Play

- Pick one of four cars, a course, and Full, Balanced, or Off assist. Full assist handles steering and loop stability; you still accelerate, brake, and boost.
- **WASD / arrows:** accelerator, brake, and steering. **Space / Shift:** nitrous. **C:** chase, hood, or orbit camera. **P / Escape:** pause. **R:** retry.
- **Gamepad:** left stick steer, RT accelerator, LT brake, A nitrous, Y camera, Start pause, X retry. Standard browser gamepad mapping.
- **Touch:** hold the steering, accelerator, and nitrous buttons together. Multitouch is tracked by pointer ID.
- **Settings:** automatic accelerator, sound, adaptive graphics, ghosts, and record import/export.
- **Workshop Series:** Ignition, Copper Circuit, Double Helix. **Grand Tour:** all five courses. Next continues the championship; Retry restarts the current race.

Records are separate for each car, course, assist, and track revision. The timer is based on 120 Hz simulation ticks; countdown and pauses do not count. Personal-best ghosts replay actual inputs through the same simulation. Nitro recharges through clean racing, controlled drifting, precision braking, and clean recoveries.

## Accounts and shared competition

The included service is a real shared service for every browser connected to it. Accounts and rankings persist in SQLite (`data/velocity.sqlite`). Account creation returns a recovery code **once**. Save it privately; recovery replaces the code and revokes existing sessions.

Race results are submitted explicitly from the finish screen. Workers reproduce the complete race from recorded inputs using the browser’s canonical simulation. Invalid inputs, unfinished races, altered clocks, wrong lap counts, unknown versions, and post-finish inputs are rejected. Rankings compare the best verified run per driver within the selected course/car/assist category.

Local records and large ghosts use IndexedDB. Imported times remain local; they cannot become a ranked time without valid server replay verification. Older ghosts are retained as archived data even when their version cannot be played, and legacy localStorage originals remain untouched. Settings lists preserved records from earlier tracks and exports their original inputs. Revision 2 fixes the loop intersections; revision 1 remains reproducible by the server for old recordings, with separate ranking categories. Database migration copies old ranking rows and replay bytes without dropping the original table, accounts, or sessions.

## Production deployment

```sh
npm ci
npm run build
APP_ORIGIN=https://racing.example.com HOST=127.0.0.1 PORT=4174 npm start
```

Put the Node service behind an HTTPS reverse proxy on the exact `APP_ORIGIN`. Serve the game and `/api` from the same origin. Production uses Secure, HttpOnly, SameSite=Strict session cookies and enforces allowed origins on mutations. Keep `data/` on a durable volume and back up the SQLite database using SQLite’s online backup interface. SQLite WAL and indexed best-time lookups support thousands of registered players on a single application instance; replay workers have bounded queues and backpressure. Horizontal multi-instance deployments require a deliberately shared database/session deployment; this build does not claim one.

Only set `TRUSTED_PROXY_ADDRESSES=127.0.0.1,::1` when those exact peers are trusted proxies that append or overwrite `X-Forwarded-For`. Untrusted forwarded headers are ignored. The service binds to loopback by default. Usernames and IP-based login throttles protect authentication; queues reject overload with retryable responses. No external email provider, cloud account, purchase, or deployment is required for local play.

## Verify

```sh
npm run check
npm test
npm run build
```

The tests include every car/course/assist combination, loop recovery, determinism across different frame batching, ghost validation, record migration/eligibility, authentication/recovery, persistent rankings, server time verification, request limits, and worker backpressure. See [the build plan](docs/build-plan.md) and [verification notes](docs/verification.md).

## Assets and provenance

The workshop, track, and four detailed cars are modeled directly in Three.js and share one car factory between garage and gameplay. Workshop scenery and engine sounds are original. No third-party branded car models or unlicensed scenery are used. Barlow Condensed and Inter fonts are bundled from Fontsource with their upstream SIL Open Font License files in the installed packages.

The four cars have distinct coachwork, cabins, lights, vents and wheel designs. Garage portraits are rendered from those exact models using the game’s WebGL renderer. Chase framing and tire support use canonical model bounds; the road includes visual shoulders to keep steering wheels clear of raised lips. The timed ghost gap is calculated from recorded first-arrival frames, including waits and recoveries. Nitro charge, speed and race clocks display actual simulation state.

The menu and on-track concepts were created with the built-in imagegen tool and saved under `docs/concepts/`. `public/assets/workshop-atlas.png` is a generated nine-region texture atlas applied to modeled geometry; it is not a backdrop. See [asset prompts](docs/asset-prompts.md).
