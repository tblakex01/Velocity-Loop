# Verification — 2026-10-08

## Final commands

- `npm run build`: TypeScript and production Vite build passed.
- `npm test`: **192 tests passed across 8 files**.
- `npx prettier --check src server tests docs index.html package.json tsconfig.json vite.config.ts`: passed.
- `git diff --check`: passed.

The suite covers all 60 car/course/assist configurations, fixed-step input replay, legacy track revision compatibility, every authored car’s real geometry and wheel openings, tire/chassis/raised-rail clearance, all camera modes against rendered track triangles, responsive car framing, first-arrival ghost gaps, record eligibility, accounts/recovery/sessions, verified rankings, upload bounds and a 1,500-player indexed ranking dataset. Native SQLite emits its experimental API notice on the installed Node runtime.

## Browser playthrough

A complete corrected Grand Tour was played in the in-app browser using Atelier GT, Full assist, automatic accelerator and a short initial nitro hold. Actual recorded finish times:

| Course           | Time      | Medal     |
| ---------------- | --------- | --------- |
| Ignition         | 00:33.333 | Gold      |
| Copper Circuit   | 00:29.892 | Gold      |
| Double Helix     | 00:40.917 | Gold      |
| Neon Ribbon      | 00:50.975 | Gold      |
| Skyline          | 00:31.283 | Gold      |
| Grand Tour total | 03:06.400 | Completed |

Actual browser runs were submitted and reproduced by the server; shared standings returned the matching times. The redesigned GT subsequently completed Double Helix at 00:40.917, again verified by the server. Pause held the clock at 00:06.350, and resuming continued from that clock. Keyboard nitro and chase/hood/orbit switching were exercised.

Four earlier earned records and their original inputs remained visible in Settings after the geometry revision and database migration. The account session survived the service restart. The disposable QA driver was signed out and automatic acceleration was switched off for handoff.

## Visual and phone checks

- All four bodies and their matching rendered portraits were inspected. Portraits have four distinct pixel hashes; a multisample framebuffer readback issue found during QA was corrected.
- The final blue GT has a sculpted body, rear engine louvers, angular tail lights, a rear diffuser and a centered cyan jet. Comet is an open mint targa, Apex a violet aero prototype, and Titan a red retro coupe.
- The race view has an unobstructed close camera, a large timer, recorded ghost gap, glossy orange track, cyan guide rails and a circular nitro gauge.
- At **390×844**, all car/track/assist choices, Standings, Settings and Race are visible; Race ends at y=815 and horizontal document width is 390.
- At **360×740**, Race ends at y=711 and horizontal document width is 360. The final phone race shows the complete car, timer, nitro gauge, steering, brake, accelerator and nitro controls.
- The browser accelerator hold and keyboard inputs were exercised. Independent multitouch pointer release and standard gamepad input were verified through input regression tests. Physical gamepad hardware and simultaneous touchscreen injection were not exercised; the in-app browser does not support the requested CDP touch injection method.
- No new browser warnings or errors appeared after the final preview reload.

## Screenshots

Screenshots are local QA artifacts in `output/` (ignored by Git): `delivered-garage.jpg`, `final-gt-nitro-chase.jpg`, `final-mobile-garage.jpg`, `final-mobile-chase.jpg`, the four `garage-*-final.jpg` images, `grand-tour-complete.jpg`, `standings.jpg`, and `preserved-records.jpg`.

## Sources consulted

- [Velocity Loop showcase and build prompts](https://developers.openai.com/showcase/velocity-loop?site_locale=en).
- [Original live garage](https://velocity-loop.openai.chatgpt.site/) and the user’s attached racing reference.
- [React root API](https://react.dev/reference/react-dom/client/createRoot).
- [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html), [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html), [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html), [OutputPass](https://threejs.org/docs/pages/OutputPass.html).
- [Vite build options](https://vite.dev/config/build-options), [Rolldown code splitting](https://rolldown.rs/reference/OutputOptions.codeSplitting).
