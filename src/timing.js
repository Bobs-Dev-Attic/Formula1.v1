// -----------------------------------------------------------------------------
// Lap timing, progress tracking, and surface (on-track / kerb / off) detection.
// -----------------------------------------------------------------------------

export class Timing {
  constructor(track) {
    this.track = track;
    this.lap = 0;              // completed-lap counter shown as current lap
    this.current = 0;          // ms into current lap
    this.last = null;
    this.best = null;
    this.position = 1;         // single-player: always P1 (AI hook-ready)
    this.progress = 0;         // 0..1 around the lap
    this._lastIdx = 0;
    this._started = false;
    this._finished = false;
    this.finished = false;
  }

  // returns { onKerb, offTrack, dist } and advances timing
  update(dt, x, z) {
    const cl = this.track.centreline;

    // nearest centreline index (coarse then fine)
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < cl.length; i += 2) {
      const dx = cl[i].x - x, dz = cl[i].y - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    for (let i = Math.max(0, bestI - 2); i <= bestI + 2; i++) {
      const j = (i + cl.length) % cl.length;
      const dx = cl[j].x - x, dz = cl[j].y - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bestI = j; }
    }
    const dist = Math.sqrt(bestD);
    this.progress = bestI / cl.length;

    // surface state
    const half = this.track.half;
    const onKerb = dist > half - 0.4 && dist < half + 1.8;
    const offTrack = dist > half + 1.8;

    // lap detection: forward crossing of start/finish
    if (this._started) {
      const wasEnd = this._lastIdx > cl.length * 0.8;
      const isStart = bestI < cl.length * 0.2;
      const wentForward = !(bestI < cl.length * 0.5 && this._lastIdx < cl.length * 0.5 && bestI < this._lastIdx - cl.length * 0.3);
      if (wasEnd && isStart && wentForward && !this._finished) {
        this._completeLap();
      }
    }

    if (this._started) this.current += dt * 1000;
    this._lastIdx = bestI;

    return { onKerb, offTrack, dist };
  }

  begin() {
    this._started = true;
    this.lap = 1;
    this.current = 0;
    this._lastIdx = 0;
  }

  _completeLap() {
    this.last = this.current;
    if (this.best == null || this.current < this.best) this.best = this.current;
    this._onLapCallback?.(this.lap, this.last, this.best);
    this.lap += 1;
    this.current = 0;
    if (this.lap > this.track.def.laps) {
      this.finished = true;
      this._finished = true;
    }
  }

  onLap(cb) { this._onLapCallback = cb; }
}
