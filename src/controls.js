// -----------------------------------------------------------------------------
// Input: unified keyboard + touch controls. Produces a smoothed `input` object
// consumed by the physics step, and fires callbacks for toggles/switches.
// Touch controls are only built + shown when a coarse (touch) pointer is found.
// -----------------------------------------------------------------------------

export const isTouch =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0);

export class Controls {
  constructor(handlers = {}) {
    this.handlers = handlers; // { onToggle(name), onPause(), onReset(), onLook(state) }

    this.input = {
      throttle: 0,
      brake: 0,
      steer: 0,        // -1..1 smoothed
      gearUp: false,
      gearDown: false,
      drs: false,      // held
      ers: false,      // held
      look: false,
    };

    // raw key state
    this._steerTarget = 0;
    this._throttleTarget = 0;
    this._brakeTarget = 0;
    this.keys = {};

    this._bindKeyboard();
    if (isTouch) this._buildTouch();
  }

  hintText() {
    return isTouch
      ? 'Touch pads: accelerate / brake / steer · paddle-shift · DRS · look-back. Tap the steering-wheel knobs & buttons for engine map, brake bias, diff, ERS, TC, ABS, lights, pit.'
      : 'W/↑ throttle · S/↓ brake · A/D steer · ⇧ shift-up · Ctrl shift-down · Space ERS · Z DRS · G auto-box · T TC · Y ABS · L lights · P pit · C look-back · R reset · Esc pause. Click the steering-wheel knobs & buttons too.';
  }

  // Concise version shown as a corner hint during the race.
  shortHint() {
    return isTouch
      ? 'Touch: gas · brake · steer · shift · DRS. Tap wheel knobs/buttons.'
      : 'W/S · A/D · ⇧/Ctrl shift · Space ERS · Z DRS · click wheel knobs/buttons';
  }

  _bindKeyboard() {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      switch (k) {
        case 'arrowup': case 'w': this._throttleTarget = 1; break;
        case 'arrowdown': case 's': this._brakeTarget = 1; break;
        case 'arrowleft': case 'a': this._steerTarget = -1; break;
        case 'arrowright': case 'd': this._steerTarget = 1; break;
        case 'shift': case 'e': this.input.gearUp = true; break;
        case 'control': case 'q': this.input.gearDown = true; break;
        case ' ': this.input.ers = true; e.preventDefault(); break;
        case 'z': this._emit('drsToggle'); break;
        case 'g': this._emit('autoGear'); break;
        case 't': this._emit('tc'); break;
        case 'y': this._emit('abs'); break;
        case 'l': this._emit('lights'); break;
        case 'p': this._emit('pit'); break;
        case 'c': this.input.look = true; this.handlers.onLook?.(true); break;
        case 'r': this.handlers.onReset?.(); break;
        case 'escape': case 'enter': this.handlers.onPause?.(); break;
      }
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = false;
      switch (k) {
        case 'arrowup': case 'w': if (this._throttleTarget === 1) this._throttleTarget = 0; break;
        case 'arrowdown': case 's': if (this._brakeTarget === 1) this._brakeTarget = 0; break;
        case 'arrowleft': case 'a': if (this._steerTarget < 0) this._steerTarget = this.keys['arrowright'] || this.keys['d'] ? 1 : 0; break;
        case 'arrowright': case 'd': if (this._steerTarget > 0) this._steerTarget = this.keys['arrowleft'] || this.keys['a'] ? -1 : 0; break;
        case ' ': this.input.ers = false; break;
        case 'c': this.input.look = false; this.handlers.onLook?.(false); break;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this._removeKb = () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }

  _emit(name) { this.handlers.onToggle?.(name); }

  _buildTouch() {
    const root = document.getElementById('touch');
    root.classList.remove('hidden');
    root.innerHTML = '';

    const mk = (cls, label, onDown, onUp) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${cls}`;
      b.textContent = label;
      const press = (e) => { e.preventDefault(); b.classList.add('pressed'); onDown?.(); };
      const release = (e) => { e.preventDefault(); b.classList.remove('pressed'); onUp?.(); };
      b.addEventListener('touchstart', press, { passive: false });
      b.addEventListener('touchend', release, { passive: false });
      b.addEventListener('touchcancel', release, { passive: false });
      root.appendChild(b);
      return b;
    };

    mk('t-accel', 'GAS', () => (this._throttleTarget = 1), () => (this._throttleTarget = 0));
    mk('t-brake', 'BRAKE', () => (this._brakeTarget = 1), () => (this._brakeTarget = 0));
    mk('t-left', '◄', () => (this._steerTarget = -1), () => { if (this._steerTarget < 0) this._steerTarget = 0; });
    mk('t-right', '►', () => (this._steerTarget = 1), () => { if (this._steerTarget > 0) this._steerTarget = 0; });
    mk('t-small t-gearup', '▲ UP', () => (this.input.gearUp = true));
    mk('t-small t-geardn', '▼ DN', () => (this.input.gearDown = true));
    mk('t-small t-drs', 'DRS', () => this._emit('drsToggle'));
    mk('t-small t-look', 'LOOK',
      () => { this.input.look = true; this.handlers.onLook?.(true); },
      () => { this.input.look = false; this.handlers.onLook?.(false); });

    const pause = document.createElement('button');
    pause.className = 't-pause';
    pause.textContent = '⏸';
    pause.addEventListener('touchstart', (e) => { e.preventDefault(); this.handlers.onPause?.(); }, { passive: false });
    root.appendChild(pause);
  }

  // called each frame before physics
  update(dt) {
    const smooth = (cur, target, rate) => {
      const d = target - cur;
      return cur + d * Math.min(1, rate * dt);
    };
    this.input.throttle = smooth(this.input.throttle, this._throttleTarget, 9);
    this.input.brake = smooth(this.input.brake, this._brakeTarget, 12);
    // steering returns to centre faster than it applies for controllable feel
    const steerRate = this._steerTarget === 0 ? 7 : 5;
    this.input.steer = smooth(this.input.steer, this._steerTarget, steerRate);
  }

  // clear one-shot edge flags after physics has read them
  endFrame() {
    this.input.gearUp = false;
    this.input.gearDown = false;
  }

  setTouchVisible(v) {
    const root = document.getElementById('touch');
    if (!isTouch) return;
    root.classList.toggle('hidden', !v);
  }
}
