# Orbit Express - client

A space-courier game for the browser: pick up packages, ride the rocket to Halo Station,
fly shuttles to the planets and moons, deliver for Money, unlock further destinations and
better suits. React 19 + React Three Fiber, Zustand, Vite. Multiplayer through the game
server in `../server` (Colyseus); plays offline when no server is reachable.

## Run

```sh
npm ci
npm run dev        # http://localhost:5173  (?offline to skip the server, ?perf for r3f-perf, ?debug for window.__pp)
npm run build      # production build into dist/
npm run lint
```

With the server running (`cd ../server && npm ci && npm run dev`), `npm run dev` finds it
on port 2567 and plays online.

## Where things are

| Path | What |
|------|------|
| `../shared/balance.js` | Every number: destinations, rewards, unlock costs, suits, trip times, the rocket schedule, Gems products |
| `../shared/world.js` | Each place's layout: spawn, walls, floors, zones (Cargo Pad, bays, beacon, pod...) |
| `../shared/logic.js`, `../shared/session.js` | The rules (run by the server, and locally offline) |
| `src/game/places/` | The scenes: `EarthBase` (in the start-up bundle), `Station`, `Surface` (every destination), `Flight` (trips) - each away scene is its own lazy chunk |
| `src/game/Player.jsx` | The character controller (per-place gravity, suit speed, jetpack) |
| `src/game/suitGear.js` | The space suit drawn over every avatar |
| `src/game/ticker.js` | 10 Hz zone detection: walking onto pads and bays |
| `src/store/quality.js` | LOW / MEDIUM / HIGH presets (auto-detected, dropped automatically under 45 FPS) |
| `src/ui/hud/HUD.jsx`, `src/ui/panels/` | HUD, Star Map, Suits, Store, Leaderboards, Settings |

All art is procedural (merged boxes and primitives through one shared toy material,
planet textures painted on canvases at <= 512 px); there are no model or texture files.
