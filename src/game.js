// -----------------------------------------------------------------------------
// Game orchestration: scene + renderer, 3rd-person chase camera, the vehicle
// (physics + visual model), HUD, timing, engine audio, and the main loop.
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import { buildTrack, getTrack } from './tracks.js';
import { buildEnvironment } from './environment.js';
import { buildCar } from './car.js';
import { Vehicle } from './physics.js';
import { Controls } from './controls.js';
import { HUD } from './hud.js';
import { Timing } from './timing.js';
import { TEAMS, ASSISTS } from './config.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Cinematic tone mapping + correct colour space lift the low-poly look.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.clock = new THREE.Clock();

    this.state = 'idle'; // idle | running | paused
    this._camPos = new THREE.Vector3(0, 8, -14);
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ---- lifecycle ----
  start({ trackId, teamId, assist, setup }) {
    this.dispose(false);

    const def = getTrack(trackId);
    const team = TEAMS.find((t) => t.id === teamId) || TEAMS[0];
    const assistPreset = ASSISTS[assist] || ASSISTS.balanced;

    this.track = buildTrack(def);
    this.scene.add(this.track.group);
    this.env = buildEnvironment(this.scene, this.track);

    // car
    this.carModel = buildCar(team);
    this.scene.add(this.carModel.group);

    // physics
    this.vehicle = new Vehicle(setup, assistPreset);
    const s = this.track.start, d = this.track.startDir;
    const yaw = Math.atan2(d.x, d.y);
    this.vehicle.reset(s.x, s.y, yaw);

    // timing
    this.timing = new Timing(this.track);
    this.timing.onLap((lap, last, best) => {
      const msg = best === last ? `LAP ${lap} · ${fmt(last)} ⚡` : `LAP ${lap} · ${fmt(last)}`;
      this.hud.toast(msg, 1600);
      if (this.timing.finished) this._finish();
    });

    // controls
    this.controls = new Controls({
      onToggle: (n) => this._toggle(n),
      onPause: () => this.togglePause(),
      onReset: () => this._recover(),
      onLook: (v) => (this._lookBack = v),
    });

    // HUD
    this.hud = new HUD(document.getElementById('hud'), this.track, (n, d) => this._toggle(n, d));
    this._otLatch = false;
    this.hud.setHint(this.controls.shortHint());

    this._audioInit();
    this._lookBack = false;
    this._countdown = 3.999;
    this._resize();

    // place camera immediately behind car
    this._placeCameraInstant();

    this.state = 'running';
    this.hud.toast('GET READY', 900);
  }

  _finish() {
    this.state = 'finished';
    this.hud.toast('CHEQUERED FLAG 🏁', 4000);
    this._onFinish?.({
      best: this.timing.best,
      last: this.timing.last,
    });
  }
  onFinish(cb) { this._onFinish = cb; }

  togglePause() {
    if (this.state === 'running') {
      this.state = 'paused';
      this._onPause?.(true);
    } else if (this.state === 'paused') {
      this.state = 'running';
      this._onPause?.(false);
      this.clock.getDelta();
    }
  }
  onPause(cb) { this._onPause = cb; }

  _toggle(name, dir = 1) {
    const v = this.vehicle;
    if (!v) return;
    const wrap = (val, min, max, step) => {
      let n = val + dir * step;
      if (n > max) n = min;
      if (n < min) n = max;
      return n;
    };
    switch (name) {
      case 'drsToggle': v.drs = !v.drs; this.hud.toast(v.drs ? 'DRS OPEN' : 'DRS CLOSED', 700); break;
      case 'tc': v.tc = !v.tc; this.hud.toast(`TC ${v.tc ? 'ON' : 'OFF'}`, 700); break;
      case 'abs': v.abs = !v.abs; this.hud.toast(`ABS ${v.abs ? 'ON' : 'OFF'}`, 700); break;
      case 'lights': v.lights = !v.lights; break;
      case 'pit': v.pitLimiter = !v.pitLimiter; this.hud.toast(`PIT LIMITER ${v.pitLimiter ? 'ON' : 'OFF'}`, 800); break;
      case 'autoGear': v.autoGear = !v.autoGear; this.hud.toast(`GEARS ${v.autoGear ? 'AUTO' : 'MANUAL'}`, 800); break;
      // steering-wheel controls
      case 'ot': this._otLatch = !this._otLatch; this.hud.toast(this._otLatch ? 'OVERTAKE ON' : 'OVERTAKE OFF', 700); break;
      case 'neutral': v.neutral = !v.neutral; this.hud.toast(v.neutral ? 'NEUTRAL' : 'IN GEAR', 700); break;
      case 'eng': v.setup.ecuMap = wrap(v.setup.ecuMap, 1, 6, 1); this.hud.toast(`ENGINE MAP ${v.setup.ecuMap}`, 700); break;
      case 'bb': v.setup.brakeBias = wrap(v.setup.brakeBias, 50, 70, 1); this.hud.toast(`BRAKE BIAS ${v.setup.brakeBias}%F`, 700); break;
      case 'diff': v.setup.diff = wrap(v.setup.diff, 0, 100, 5); this.hud.toast(`DIFF ${v.setup.diff}%`, 700); break;
      case 'ers': v.ersMode = wrap(v.ersMode, 0, 3, 1); this.hud.toast(`ERS ${['OFF', 'BUILD', 'BALANCED', 'HOTLAP'][v.ersMode]}`, 800); break;
    }
  }

  _recover() {
    // snap car back onto the nearest point of the racing line, pointing forward
    const v = this.vehicle;
    const cl = this.track.centreline, tg = this.track.tangents;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < cl.length; i++) {
      const dx = cl[i].x - v.x, dz = cl[i].y - v.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
    const t = tg[bi];
    v.reset(cl[bi].x, cl[bi].y, Math.atan2(t.x, t.y));
    this.hud.toast('RECOVERED', 800);
  }

  // ---- main loop ----
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'running') this._step(dt);
    if (this.state === 'running' || this.state === 'paused' || this.state === 'finished') {
      if (this.state === 'finished') this._orbitCam(dt);
      this.renderer.render(this.scene, this.camera);
    }
  }

  _step(dt) {
    const v = this.vehicle;

    // start-lights countdown gates throttle
    let input = this.controls.input;
    this.controls.update(dt);

    if (this._countdown > 0) {
      const prev = Math.ceil(this._countdown);
      this._countdown -= dt;
      const now = Math.ceil(this._countdown);
      if (now !== prev && now > 0) this.hud.toast(String(now), 700);
      if (this._countdown <= 0) {
        this.hud.toast('GO!', 900);
        this.timing.begin();
      }
      // hold the car still during countdown (no throttle/brake so the brake
      // input can't be read as reverse before the lights go out)
      input = { ...input, throttle: 0, brake: 0, steer: 0 };
    }

    // manual ERS overtake: held button (Space) OR the latched OT switch
    v.ers = !!(input.ers || this._otLatch);

    v.update(dt, input);

    // surface detection
    const surf = this.timing.update(dt, v.x, v.z);
    v.onKerb = surf.onKerb;
    v.offTrack = surf.offTrack;

    this.controls.endFrame();

    this._syncCarModel(dt);
    this._updateCamera(dt);
    this._updateAudio(dt);
    this.hud.update(v, this.timing, dt);
  }

  _syncCarModel(dt) {
    const v = this.vehicle;
    const g = this.carModel.group;
    g.position.set(v.x, 0, v.z);
    g.rotation.y = v.yaw;

    // body roll & pitch for feel
    const roll = THREE.MathUtils.clamp(-v.vLat * 0.02, -0.12, 0.12);
    const pitch = THREE.MathUtils.clamp((v.vLong - this._prevVLong || 0) * -0.02, -0.06, 0.06);
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, roll, 0.2);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, pitch, 0.2);
    this._prevVLong = v.vLong;

    // wheels spin
    const spin = (v.vLong / 0.34) * dt;
    for (const k of ['fl', 'fr', 'rl', 'rr']) this.carModel.wheels[k].rotation.x += spin;
    // steer front wheels
    for (const k of ['fl', 'fr']) this.carModel.steerPivots[k].rotation.y = v.steerAngle || 0;

    // brake light
    const braking = this.controls.input.brake > 0.05;
    this.carModel.parts.brakeMat.emissive.setHex(braking ? 0xff1100 : 0x220000);
    this.carModel.parts.brakeMat.emissiveIntensity = braking ? 3 : 1;
    // headlights
    this.carModel.parts.headMat.emissive.setHex(v.lights ? 0xfff2cc : 0x000000);

    // DRS flap raise
    const target = v.drs ? 0.5 : 0;
    this.carModel.parts.drsFlap.rotation.x = THREE.MathUtils.lerp(this.carModel.parts.drsFlap.rotation.x, target, 0.2);
  }

  _camTarget(out) {
    const v = this.vehicle;
    const back = this._lookBack ? 1 : -1;
    const dist = 13 + Math.min(v.speed * 0.12, 6);
    const height = 5.2 + Math.min(v.speed * 0.02, 2);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    out.set(v.x + fx * dist * back, height, v.z + fz * dist * back);
    return out;
  }

  _placeCameraInstant() {
    const t = new THREE.Vector3();
    this._camTarget(t);
    this.camera.position.copy(t);
    const v = this.vehicle;
    this.camera.lookAt(v.x, 1.2, v.z);
  }

  _updateCamera(dt) {
    const v = this.vehicle;
    const target = new THREE.Vector3();
    this._camTarget(target);
    const follow = this._lookBack ? 0.5 : 1 - Math.pow(0.0001, dt);
    this.camera.position.lerp(target, this._lookBack ? 0.35 : 0.12);
    const look = new THREE.Vector3(
      v.x + Math.sin(v.yaw) * (this._lookBack ? -6 : 6),
      1.4,
      v.z + Math.cos(v.yaw) * (this._lookBack ? -6 : 6)
    );
    this.camera.lookAt(look);
    // subtle FOV with speed for sensation
    const targetFov = 60 + Math.min(v.kph * 0.04, 18);
    this.camera.fov += (targetFov - this.camera.fov) * 0.08;
    this.camera.updateProjectionMatrix();
  }

  _orbitCam(dt) {
    this._orbit = (this._orbit || 0) + dt * 0.3;
    const v = this.vehicle;
    this.camera.position.set(
      v.x + Math.sin(this._orbit) * 16,
      6,
      v.z + Math.cos(this._orbit) * 16
    );
    this.camera.lookAt(v.x, 1, v.z);
  }

  // ---- audio (WebAudio engine tone tied to rpm) ----
  _audioInit() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ac = new Ctx();
      this.audio = ac;
      const osc = ac.createOscillator();
      const osc2 = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      osc.frequency.value = 60;
      osc2.frequency.value = 90;
      gain.gain.value = 0.0;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      osc.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(ac.destination);
      osc.start(); osc2.start();
      this._eng = { ac, osc, osc2, gain, filter };
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { /* audio optional */ }
  }

  _updateAudio() {
    if (!this._eng) return;
    const v = this.vehicle;
    const rpmPct = v.rpmPct;
    const base = 55 + rpmPct * 320;
    this._eng.osc.frequency.value = base;
    this._eng.osc2.frequency.value = base * 1.5;
    this._eng.filter.frequency.value = 500 + rpmPct * 2600;
    const load = 0.02 + this.controls.input.throttle * 0.05 + rpmPct * 0.03;
    this._eng.gain.gain.value += (load - this._eng.gain.gain.value) * 0.1;
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(full = true) {
    if (this.track) { this.scene.remove(this.track.group); }
    if (this.carModel) { this.scene.remove(this.carModel.group); }
    if (this.env?.scenery) this.scene.remove(this.env.scenery);
    if (this.env?.ground) this.scene.remove(this.env.ground);
    // clear all lights/objects
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      this.scene.remove(this.scene.children[i]);
    }
    if (this.hud && full) this.hud.destroy();
    if (this._eng) { try { this._eng.gain.gain.value = 0; } catch (e) {} }
  }
}

function fmt(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}
