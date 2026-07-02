# Formula 1 · V1

A configurable, 3rd-person **3D Formula 1 racing game** built with **Three.js** and
deployable on **Vercel**. Landscape-oriented, low-poly, with a realistic-ish
handling model and a full cockpit instrument cluster.

## Features

### Driving & physics
- **Slip-angle "bicycle" vehicle model** — proper front/rear slip angles, weight
  transfer to grip, aero **downforce** (grows with speed²) and **drag**.
- **8-speed gearbox** with auto or manual paddle shifting and an rpm/redline model.
- **Traction Control (TC)** and **ABS** driver aids that actually change how the
  car puts power down and brakes.
- **DRS** (drag-reduction flap, animated on the car) and **ERS** deploy/harvest.
- **Consumables**: fuel burn, ERS charge (regenerates under braking) and
  progressive **tyre wear** that reduces grip.
- Surface awareness: **kerbs** and **off-track** both reduce grip.
- Three **assist presets**: Arcade (grippy), Balanced, Simulation (loose).

### Garage & setup (fully configurable)
Tune the car like an engineer — every slider maps to real handling:
front/rear wing, brake bias, differential lock, tyre pressure, suspension
stiffness, final-drive ratio and engine map. Saved to `localStorage`.

### Cockpit HUD (what an F1 driver expects)
- Digital **speed + gear dial** with a sweeping **rpm arc** and 12-LED **shift lights**.
- Clickable status **switches/indicators**: DRS · ABS · TC · Pit-limiter · Lights.
- **Fuel / ERS / tyre** gauges.
- **Timing tower** (position, lap, current/last/best) and a live **mini-map**.
- Start-light **countdown** and lap/finish toasts.

### Controls
- **Keyboard**: W/↑ throttle · S/↓ brake · A/D steer · Shift/Ctrl paddle-shift ·
  Space ERS · Z DRS · G auto/manual box · T TC · Y ABS · L lights · P pit ·
  C look-behind · R recover · Esc pause.
- **Mobile**: on-screen touch pads (gas/brake/steer/paddles/DRS/look) are built
  **automatically when a touch device is detected**, plus a portrait "rotate to
  landscape" guard. Dashboard switches are tappable too.

### Graphics
- Low-poly F1 car, striped kerbs, painted lines, start/finish grid, grandstands,
  and a low-poly **city** (harbour street circuit) or **countryside** (parkland
  circuit) built procedurally around each track.

## Can real tracks be used?

**Yes — technically the game is built for it.** A track is nothing more than a
closed list of centreline waypoints plus a width (see `src/tracks.js`). That is
exactly the shape of data you can get for real circuits:

- **OpenStreetMap** ways tagged `highway=raceway` (public, ODbL-licensed).
- **Public GPS / telemetry traces** of a real lap.
- Survey / satellite coordinates.

`src/tracks.js` ships a `latLonToMetres()` helper: feed it `[lat, lon]` points
from any of the above and drop the result into a track's `waypoints`, and the
builder turns it into a fully drivable circuit — road, kerbs, walls, timing and
mini-map included.

**The important caveat is legal, not technical.** Official F1 circuit *names,
logos, trademarks and exact branded layouts* are protected intellectual
property. Shipping a real, branded track ("Monaco", "Silverstone", team liveries,
sponsor boards) commercially needs a licence from the rights holders — which is
why the bundled tracks are *inspired by* famous circuits and deliberately
stylised, and the liveries use fictional team names. For personal, educational
or properly-licensed use, real-geometry tracks slot straight in.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
npm run preview  # preview the build
```

## Deploy to Vercel

The repo includes `vercel.json` (framework: Vite, output: `dist`). Either:

```bash
npx vercel        # or connect the repo in the Vercel dashboard
```

Vercel auto-detects the Vite build; no extra configuration needed.

## Project structure

```
index.html            landscape shell, loader, menu, garage, HUD, touch containers
src/
  main.js             bootstrap: menu, garage setup sheet, pause/finish flow
  game.js             scene, chase camera, audio, main loop, wiring
  physics.js          the vehicle model (slip, aero, gearbox, aids, consumables)
  car.js              low-poly F1 car model + animated parts
  tracks.js           track definitions + builder (+ real-track import helper)
  environment.js      sky, lighting, procedural city / countryside scenery
  controls.js         keyboard + auto-detected touch controls
  hud.js              instrument cluster, timing tower, mini-map
  timing.js           lap timing, progress, on-track/kerb/off detection
  config.js           teams, assist presets, garage setup schema, car spec
  styles.css          HUD, dashboard and touch-control styling
```
