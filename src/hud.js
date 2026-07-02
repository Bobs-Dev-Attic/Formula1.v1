// -----------------------------------------------------------------------------
// HUD styled as a modern F1 steering wheel (see reference photos): a central
// colour LCD (fuel · gear · speed · rpm · ERS/SOC · delta · lap), a shift-light
// LED strip, interactive rotary knobs (ENGINE MAP · BRAKE BIAS · DIFF · ERS)
// and function buttons (DRS · OT · PIT · N · TC · ABS · LIGHTS). Plus a timing
// tower and a live mini-map.
//
// onAction(name, dir) is fired by every clickable control; the game applies it.
// -----------------------------------------------------------------------------

const ERS_MODES = ['OFF', 'BUILD', 'BAL', 'HOT'];

export class HUD {
  constructor(root, track, onAction) {
    this.root = root;
    this.track = track;
    this.onAction = onAction;
    root.classList.remove('hidden');
    root.innerHTML = this._template();

    // timing tower
    this.$pos = root.querySelector('.pos b');
    this.$lapTower = root.querySelector('.lap-val');
    this.$cur = root.querySelector('.cur-val');
    this.$best = root.querySelector('.best-val');
    this.$last = root.querySelector('.last-val');

    // LCD
    this.$gear = root.querySelector('.lcd-gear');
    this.$kph = root.querySelector('.lcd-kph');
    this.$rpm = root.querySelector('.lcd-rpm');
    this.$rpmBar = root.querySelector('.lcd-rpmbar i');
    this.$fuel = root.querySelector('.lcd-fuel i');
    this.$fuelV = root.querySelector('.fuel-v');
    this.$soc = root.querySelector('.lcd-soc i');
    this.$socV = root.querySelector('.soc-v');
    this.$delta = root.querySelector('.lcd-delta');
    this.$lapTime = root.querySelector('.lcd-laptime');
    this.$tyreV = root.querySelector('.tyre-v');

    // LEDs
    this.$leds = [...root.querySelectorAll('.wled')];

    // knobs
    this.$knobs = {
      eng: root.querySelector('.knob.eng'),
      bb: root.querySelector('.knob.bb'),
      diff: root.querySelector('.knob.diff'),
      ers: root.querySelector('.knob.ers'),
    };

    // buttons / indicators
    this.$btn = {
      drs: root.querySelector('.wbtn.drs'),
      ot: root.querySelector('.wbtn.ot'),
      pit: root.querySelector('.wbtn.pit'),
      n: root.querySelector('.wbtn.n'),
      tc: root.querySelector('.wbtn.tc'),
      abs: root.querySelector('.wbtn.abs'),
      lights: root.querySelector('.wbtn.lights'),
    };

    // wire interactions
    const clickAct = (el, name) => el?.addEventListener('click', (e) => this.onAction?.(name, e.shiftKey ? -1 : 1));
    clickAct(this.$knobs.eng, 'eng');
    clickAct(this.$knobs.bb, 'bb');
    clickAct(this.$knobs.diff, 'diff');
    clickAct(this.$knobs.ers, 'ers');
    clickAct(this.$btn.drs, 'drsToggle');
    clickAct(this.$btn.ot, 'ot');
    clickAct(this.$btn.pit, 'pit');
    clickAct(this.$btn.n, 'neutral');
    clickAct(this.$btn.tc, 'tc');
    clickAct(this.$btn.abs, 'abs');
    clickAct(this.$btn.lights, 'lights');

    this.$toast = root.querySelector('.hud-toast');
    this._toastTimer = 0;
    this.$map = root.querySelector('.hud-map canvas');
    this.mapCtx = this.$map.getContext('2d');
    this._drawMapStatic();
  }

  _template() {
    const leds = Array.from({ length: 15 }, (_, i) => `<div class="wled" data-i="${i}"></div>`).join('');
    const knob = (cls, label) => `
      <div class="knob-wrap">
        <div class="knob ${cls}" title="click to change · shift+click to go down">
          <span class="knob-dot"></span>
          <b class="knob-val">–</b>
        </div>
        <small>${label}</small>
      </div>`;
    return `
      <!-- Timing tower -->
      <div class="hud-timing">
        <div class="pos"><b>1</b><small>POS · LAP <span class="lap-val">1/1</span></small></div>
        <div class="times">
          <div><span>CUR</span><em class="cur-val">--:--.---</em></div>
          <div><span>LAST</span><em class="last-val">--:--.---</em></div>
          <div><span>BEST</span><em class="best-val">--:--.---</em></div>
        </div>
      </div>

      <div class="hud-map"><canvas width="260" height="260"></canvas></div>
      <div class="hud-toast"></div>

      <!-- Steering wheel -->
      <div class="wheel">
        <div class="wheel-grip left"></div>
        <div class="wheel-grip right"></div>
        <div class="wheel-face">
          <div class="wheel-leds">${leds}</div>

          <div class="lcd">
            <div class="lcd-rpmbar"><i></i></div>
            <div class="lcd-main">
              <div class="lcd-col left">
                <div class="lcd-fuel bar"><i></i></div>
                <span class="lcd-label">FUEL <b class="fuel-v">100</b></span>
                <span class="lcd-rpm">0</span><span class="lcd-label">RPM</span>
              </div>
              <div class="lcd-col center">
                <span class="lcd-kph">0</span><span class="lcd-label">KPH</span>
                <span class="lcd-gear">N</span>
              </div>
              <div class="lcd-col right">
                <span class="lcd-delta">+0.00</span><span class="lcd-label">DELTA</span>
                <span class="lcd-laptime">0:00.0</span><span class="lcd-label">LAP · TYRE <b class="tyre-v">100</b></span>
              </div>
            </div>
            <div class="lcd-soc bar"><i></i></div>
            <span class="lcd-soclabel">ERS <b class="soc-v">100</b>%</span>
          </div>

          <div class="wheel-knobs">
            ${knob('eng', 'ENGINE')}
            ${knob('bb', 'BRK BIAS')}
            ${knob('diff', 'DIFF')}
            ${knob('ers', 'ERS')}
          </div>

          <div class="wheel-buttons">
            <button class="wbtn n">N</button>
            <button class="wbtn drs">DRS</button>
            <button class="wbtn ot">OT</button>
            <button class="wbtn pit">PIT</button>
            <button class="wbtn tc">TC</button>
            <button class="wbtn abs">ABS</button>
            <button class="wbtn lights">☀</button>
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
    const pct = Math.max(0, Math.min(1, v.rpmPct));

    // LCD numerics
    this.$gear.textContent = v.reverse ? 'R' : (v.speed < 0.5 && v.gear === 1 ? 'N' : v.gear);
    this.$gear.style.color = pct > 0.93 ? '#ff3b30' : '#eafff0';
    this.$kph.textContent = Math.round(v.kph);
    this.$rpm.textContent = Math.round(v.rpm);
    this.$rpmBar.style.width = `${pct * 100}%`;
    this.$rpmBar.style.background = pct > 0.92 ? '#ff3b30' : pct > 0.75 ? '#ffb300' : '#31d15b';

    this.$fuel.style.width = `${v.fuel}%`;
    this.$fuelV.textContent = Math.round(v.fuel);
    this.$soc.style.width = `${v.ersCharge}%`;
    this.$socV.textContent = Math.round(v.ersCharge);
    this.$tyreV.textContent = Math.round(v.tyreWear);

    // shift-light LEDs
    for (let i = 0; i < this.$leds.length; i++) {
      const on = pct > 0.5 + (i / this.$leds.length) * 0.48;
      const col = i < 5 ? '#31d15b' : i < 10 ? '#ff3b30' : '#3b6bff';
      this.$leds[i].style.background = on ? col : '#20242e';
      this.$leds[i].style.boxShadow = on ? `0 0 6px ${col}` : 'none';
    }

    // knobs
    this._setKnob('eng', v.setup.ecuMap, 1, 6, v.setup.ecuMap);
    this._setKnob('bb', v.setup.brakeBias, 50, 70, v.setup.brakeBias);
    this._setKnob('diff', v.setup.diff, 0, 100, v.setup.diff);
    this._setKnob('ers', v.ersMode, 0, 3, ERS_MODES[v.ersMode]);

    // buttons
    this._on(this.$btn.drs, v.drs);
    this._on(this.$btn.ot, v.ers);
    this._on(this.$btn.pit, v.pitLimiter);
    this._on(this.$btn.n, v.neutral);
    this._on(this.$btn.tc, v.tc);
    this._on(this.$btn.abs, v.abs);
    this._on(this.$btn.lights, v.lights);

    // timing tower
    this.$pos.textContent = timing.position;
    this.$lapTower.textContent = `${Math.min(timing.lap, this.track.def.laps)}/${this.track.def.laps}`;
    this.$cur.textContent = fmt(timing.current);
    this.$last.textContent = timing.last != null ? fmt(timing.last) : '--:--.---';
    this.$best.textContent = timing.best != null ? fmt(timing.best) : '--:--.---';
    this.$lapTime.textContent = fmtShort(timing.current);

    // live delta vs best pace (current time minus where best lap was at this progress)
    if (timing.best != null && timing.lap > 1) {
      const expected = timing.best * timing.progress;
      const d = (timing.current - expected) / 1000;
      this.$delta.textContent = (d >= 0 ? '+' : '') + d.toFixed(2);
      this.$delta.style.color = d <= 0 ? '#31d15b' : '#ff6a5a';
    } else {
      this.$delta.textContent = '--';
      this.$delta.style.color = '#9aa2b1';
    }

    if (this._toastTimer > 0) {
      this._toastTimer -= dt * 1000;
      if (this._toastTimer <= 0) this.$toast.classList.remove('show');
    }
    this._drawMapCar(v);
  }

  _setKnob(name, value, min, max, display) {
    const k = this.$knobs[name];
    if (!k) return;
    const frac = (value - min) / (max - min || 1);
    const ang = -135 + frac * 270; // sweep -135°..+135°
    k.querySelector('.knob-dot').style.transform = `rotate(${ang}deg)`;
    k.querySelector('.knob-val').textContent = display;
  }

  _on(el, state) { if (el) el.classList.toggle('on', !!state); }

  _drawMapStatic() {
    const cl = this.track.centreline;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of cl) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    const w = this.$map.width, h = this.$map.height;
    const s = Math.min((w - 48) / (maxX - minX), (h - 48) / (maxZ - minZ));
    this._map = { minX, minZ, s,
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
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < cl.length; i++) {
      const [px, py] = this._proj(cl[i].x, cl[i].y);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    const [sx, sy] = this._proj(this.track.start.x, this.track.start.y);
    ctx.fillStyle = '#00d2ff';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
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
function fmtShort(ms) {
  if (ms == null || !isFinite(ms)) return '0:00.0';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}
