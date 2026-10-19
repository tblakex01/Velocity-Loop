# Velocity Loop

Source: https://developers.openai.com/showcase/velocity-loop?site_locale=en

## Authorized scope

Continue from prompt 2 through prompt 13: create an on-track concept, a running course menu, five playable continuous stunt tracks, three assists, nitrous, input-recorded personal-best ghosts, medals, keyboard/touch/gamepad controls, sound and camera modes. Refine contact, banking, jumping and frame-rate-independent replay. Build a warm miniature workshop with generated nine-region materials; add Workshop Series, Grand Tour, skill rewards and the four named cars. Add sign-in, recovery and persistent rankings checked by replaying submitted inputs. Finish race flow, record migration, graphics recovery and phone controls.

## Canonical boundaries

- `src/game`: pure numerical track generation, definitions and 120 Hz deterministic simulation shared with the server. Rendering never owns race rules.
- `src/render`: Three.js workshop, track mesh, shared detailed car models, cameras and adaptive quality.
- `src`: React menu/HUD, controls, audio, local persistence and API calls.
- `server`: first-party Node HTTP server, SQLite WAL persistence, password/session authentication, recovery codes and bounded asynchronous replay verification.
- `tests`: fixed-step replay, every car/course/assist, persistence eligibility and API security/verification contracts.

## Visual direction

Warm atelier lighting; oak, brass, plaster and terracotta; orange molded tracks; cobalt hero car. An editorial motorsport menu has an open 3D preview, five readable course rows and a clear Race action. During racing, a compact HUD leaves the route visible. Mobile retains car, track, rankings, Settings and Race with large touch targets.

## Verification gates

Build/type checks, deterministic races across configurations, server authentication and false-time rejection, actual desktop and phone browser interaction, representative screenshots, clean console and responsive control flow. Local verified shared competition is delivered with documented HTTPS deployment requirements. No publishing or Git push is included.
