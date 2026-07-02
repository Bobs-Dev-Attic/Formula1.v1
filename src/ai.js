// -----------------------------------------------------------------------------
// AI field: opponent cars that follow the track centreline (racing line) at a
// per-car pace, easing off through corners. Lightweight — they run on the
// sampled centreline rather than full physics — but they lap, spread out, and
// determine the player's race position.
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import { buildCar } from './car.js';

export class Field {
  constructor(scene, track, teams, count) {
    this.track = track;
    this.n = track.centreline.length;
    this.spacing = track.length / this.n;
    this.cars = [];

    // precompute a corner-sharpness value per sample (angle over a short window)
    const tg = track.tangents;
    this.curv = new Array(this.n);
    const w = 4;
    for (let i = 0; i < this.n; i++) {
      const a = tg[(i - w + this.n) % this.n];
      const b = tg[(i + w) % this.n];
      const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
      this.curv[i] = Math.acos(dot); // 0 (straight) .. ~pi (hairpin)
    }

    for (let i = 0; i < count; i++) {
      const team = teams[i % teams.length];
      const model = buildCar(team, i + 3); // car numbers 3,4,5…
      scene.add(model.group);
      // grid: two columns staggered behind the start line
      const row = Math.floor(i / 2);
      const col = i % 2;
      this.cars.push({
        model,
        dist: -8 - row * 9 - col * 2,                 // metres behind the line
        lane: (col === 0 ? 1 : -1) * track.half * 0.4, // stagger left/right
        speed: 0,
        basePace: 66 - i * 1.6 + (Math.random() * 3 - 1.5), // m/s, decreasing grid pace
        wheelSpin: 0,
      });
      this._place(this.cars[i]);
    }
  }

  // world position + heading for a distance along the lap
  _sample(dist) {
    let f = (dist / this.spacing) % this.n;
    if (f < 0) f += this.n;
    const i0 = Math.floor(f);
    const i1 = (i0 + 1) % this.n;
    const frac = f - i0;
    const cl = this.track.centreline, tg = this.track.tangents;
    const x = cl[i0].x + (cl[i1].x - cl[i0].x) * frac;
    const z = cl[i0].y + (cl[i1].y - cl[i0].y) * frac;
    const t = tg[i0];
    return { x, z, tx: t.x, tz: t.y, idx: i0 };
  }

  _place(car) {
    const s = this._sample(car.dist);
    // perpendicular lane offset (right-hand normal of the tangent)
    const nx = s.tz, nz = -s.tx;
    car.model.group.position.set(s.x + nx * car.lane, 0, s.z + nz * car.lane);
    car.model.group.rotation.y = Math.atan2(s.tx, s.tz);
    car._idx = s.idx;
  }

  update(dt, started) {
    for (const car of this.cars) {
      if (started) {
        const curv = this.curv[car._idx] || 0;
        // slow for corners: sharper corner -> lower target speed
        const target = Math.max(24, car.basePace * (1 - Math.min(0.62, curv * 0.85)));
        car.speed += (target - car.speed) * Math.min(1, dt * 1.8);
        car.dist += car.speed * dt;
      }
      this._place(car);
      // spin wheels for life
      const spin = (car.speed / 0.34) * dt;
      for (const k of ['fl', 'fr', 'rl', 'rr']) car.model.wheels[k].rotation.x += spin;
    }
  }

  // race position: how many cars are ahead of the player's absolute distance
  playerPosition(playerDist) {
    let ahead = 0;
    for (const c of this.cars) if (c.dist > playerDist) ahead++;
    return ahead + 1;
  }

  blips() {
    return this.cars.map((c) => ({ x: c.model.group.position.x, z: c.model.group.position.z }));
  }
}
