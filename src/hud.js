// -----------------------------------------------------------------------------
// HUD: the instrument cluster an F1 driver expects — digital speed + gear dial
// with an rpm arc, shift-light strip, DRS/ABS/TC/PIT/LIGHTS status switches
// (clickable), fuel / ERS / tyre gauges, timing tower and a live mini-map.
// -----------------------------------------------------------------------------

export class HUD {
  constructor(root, track, onToggle) {
    this.root = root;
    this.track = track;
    this.onToggle = onToggle;
    root.classList.remove('hidden');
    root.innerHTML = this._template();

    // cache nodes
    this.$gear = root.querySelector('.gear');
    this.$kph = root.querySelector('.kph');
    this.$rpmArc = root.querySelector('.rpm-arc');
    this.$pos = root.querySelector('.pos b');
    this.$lap = root.querySelector('.lap-val');
    this.$cur = root.querySelector('.cur-val');
    this.$best = root.querySelector('.best-val');
    this.$last = root.querySelector('.last-val');
    this.$fuel = root.querySelector('.bar.fuel i');
    this.$fuelV = root.querySelector('.fuel-v');
    this.$ers = root.querySelector('.bar.ers i');
    this.$ersV = root.querySelector('.ers-v');
    this.$tyre = root.querySelector('.bar.tyre i');
    this.$tyreV = root.querySelector('.tyre-v');
    this.$toast = root.querySelector('.hud-toast');
    this.$revLeds = [...root.querySelectorAll('.rev-led')];
    this.$lights = {
      drs: root.querySelector('.slight.drs'),
      abs: root.querySelector('.slight.abs'),
      tc: root.querySelector('.slight.tc'),
      pit: root.querySelector('.slight.pit'),
      light: root.querySelector('.slight.light'),
      rev: root.querySelector('.slight.rev'),
    };
    this.$map = root.querySelector('.hud-map canvas');
    this.mapCtx = this.$map.getContext('2d');

    // make status switches interactive
    const wire = (el, name) => el?.addEventListener('click', () => this.onToggle?.(name));
    wire(this.$lights.drs, 'drsToggle');
    wire(this.$lights.abs, 'abs');
    wire(this.$lights.tc, 'tc');
    wire(this.$lights.pit, 'pit');
    wire(this.$lights.light, 'lights');

    this._toastTimer = 0;
    this._drawMapStatic();

    const arcLen = 2 * Math.PI * 66 * 0.75;
    this._arcLen = arcLen;
    this.$rpmArc.style.strokeDasharray = `${arcLen} ${arcLen}`;
  }

  _template() {
    const leds = Array.from({ length: 12 }, () => '<div class="rev-led"></div>').join('');
    const r = 66;
    return `
      <div class="rev-strip">${leds}</div>

      <div class="hud-timing">
        <div class="pos"><b>1</b><small>POSITION · LAP <span class="lap-val">1</span></small></div>
        <div class="times">
          <div><span>CURRENT</span><em class="cur-val">--:--.---</em></div>
          <div><span>LAST</span><em class="last-val">--:--.---</em></div>
          <div><span>BEST</span><em class="best-val">--:--.---</em></div>
        </div>
      </div>

      <div class="hud-map"><canvas width="260" height="260"></canvas></div>

      <div class="hud-toast"></div>

      <div class="hud-cluster">
        <div class="dash-side">
          <div class="status-lights">
            <div class="slight drs" title="DRS (Z)">DRS</div>
            <div class="slight abs" title="ABS (Y)">ABS</div>
            <div class="slight tc" title="Traction Control (T)">TC</div>
            <div class="slight pit" title="Pit Limiter (P)">PIT</div>
            <div class="slight light" title="Lights (L)">☀</div>
            <div class="slight rev" title="Shift up">▲</div>
          </div>
          <div class="gauge-strip">
            <div class="gauge-row"><span class="lab">FUEL</span><div class="bar fuel"><i style="width:100%"></i></div><b class="fuel-v">100</b></div>
            <div class="gauge-row"><span class="lab">ERS</span><div class="bar ers"><i style="width:100%"></i></div><b class="ers-v">100</b></div>
            <div class="gauge-row"><span class="lab">TYRE</span><div class="bar tyre"><i style="width:100%"></i></div><b class="tyre-v">100</b></div>
          </div>
        </div>

        <div class="dash">
          <svg viewBox="0 0 150 150">
            <circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)"
                    stroke-width="7" stroke-dasharray="${2 * Math.PI * r * 0.75} ${2 * Math.PI * r}"
                    transform="rotate(135 75 75)" stroke-linecap="round"/>
            <circle class="rpm-arc" cx="75" cy="75" r="${r}" fill="none" stroke="#e10600"
                    stroke-width="7" transform="rotate(135 75 75)" stroke-linecap="round"
                    stroke-dashoffset="0"/>
          </svg>
          <div class="readout">
            <div class="gear">N</div>
            <div class="rule"></div>
            <div class="kph">0</div>
            <div class="unit">KPH</div>
          </div>
        </div>
      </div>

      <div class="hud-hint"></div>
    `;
  }

  setHint(text) {
    const el = this.root.querySelector('.hud-hint');
    if (el) el.textContent = text;
  }

  toast(msg, ms = 1100) {
    this.$toast.textContent = msg;
    this.$toast.classList.add('show');
    this._toastTimer = ms;
  }

  update(v, timing, dt) {
    // gear + speed
    this.$gear.textContent = v.reverse ? 'R' : (v.speed < 0.5 && v.gear === 1 ? 'N' : v.gear);
    this.$kph.textContent = Math.round(v.kph);

    // rpm arc
    const pct = Math.max(0, Math.min(1, v.rpmPct));
    this.$rpmArc.style.strokeDashoffset = `${this._arcLen * (1 - pct)}`;
    this.$rpmArc.style.stroke = pct > 0.92 ? '#ff2d1a' : pct > 0.75 ? '#ffb300' : '#e10600';

    // shift lights
    for (let i = 0; i < this.$revLeds.length; i++) {
      const on = pct > 0.55 + (i / this.$revLeds.length) * 0.44;
      const col = i < 5 ? '#24e07a' : i < 9 ? '#ffb300' : '#ff2d1a';
      this.$revLeds[i].style.background = on ? col : '#1c2130';
    }
    this._set(this.$lights.rev, pct > 0.93);

    // status switches
    this._set(this.$lights.drs, v.drs);
    this._set(this.$lights.abs, v.abs);
    this._set(this.$lights.tc, v.tc);
    this._set(this.$lights.pit, v.pitLimiter);
    this._set(this.$lights.light, v.lights);

    // gauges
    this.$fuel.style.width = `${v.fuel}%`;
    this.$fuelV.textContent = Math.round(v.fuel);
    this.$ers.style.width = `${v.ersCharge}%`;
    this.$ersV.textContent = Math.round(v.ersCharge);
    this.$tyre.style.width = `${v.tyreWear}%`;
    this.$tyreV.textContent = Math.round(v.tyreWear);
    this.$tyre.parentElement.style.filter = v.tyreWear < 25 ? 'saturate(0.4)' : 'none';

    // timing
    this.$pos.textContent = timing.position;
    this.$lap.textContent = `${Math.min(timing.lap, this.track.def.laps)}/${this.track.def.laps}`;
    this.$cur.textContent = fmt(timing.current);
    this.$last.textContent = timing.last != null ? fmt(timing.last) : '--:--.---';
    this.$best.textContent = timing.best != null ? fmt(timing.best) : '--:--.---';

    // toast fade
    if (this._toastTimer > 0) {
      this._toastTimer -= dt * 1000;
      if (this._toastTimer <= 0) this.$toast.classList.remove('show');
    }

    this._drawMapCar(v);
  }

  _set(el, on) { if (el) el.classList.toggle('on', !!on); }

  _drawMapStatic() {
    const cl = this.track.centreline;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of cl) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    const pad = 24;
    const w = this.$map.width, h = this.$map.height;
    const sx = (w - pad * 2) / (maxX - minX);
    const sz = (h - pad * 2) / (maxZ - minZ);
    const s = Math.min(sx, sz);
    this._map = { minX, minZ, s, pad, w, h,
      ox: (w - (maxX - minX) * s) / 2, oz: (h - (maxZ - minZ) * s) / 2 };
  }

  _proj(x, z) {
    const m = this._map;
    return [m.ox + (x - m.minX) * m.s, m.oz + (z - m.minZ) * m.s];
  }

  _drawMapCar(v) {
    const ctx = this.mapCtx;
    const cl = this.track.centreline;
    ctx.clearRect(0, 0, this.$map.width, this.$map.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < cl.length; i++) {
      const [px, py] = this._proj(cl[i].x, cl[i].y);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    // start line dot
    const [sx, sy] = this._proj(this.track.start.x, this.track.start.y);
    ctx.fillStyle = '#00d2ff';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
    // car
    const [cx, cy] = this._proj(v.x, v.z);
    ctx.fillStyle = '#e10600';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  destroy() {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }
}

function fmt(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}
