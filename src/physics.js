// -----------------------------------------------------------------------------
// Vehicle physics: a slip-angle "bicycle" model with aero downforce, an 8-speed
// gearbox, traction-limited drive, braking with bias, and driver aids (TC/ABS).
// Tunable entirely through the garage setup sheet + assist preset.
// -----------------------------------------------------------------------------

import { CAR_SPEC } from './config.js';

const G = 9.81;

export class Vehicle {
  constructor(setup, assist) {
    this.setup = setup;
    this.assist = assist;

    // kinematic state (world space, XZ plane)
    this.x = 0;
    this.z = 0;
    this.yaw = 0;          // radians; forward = (sin,cos)
    this.velX = 0;
    this.velZ = 0;
    this.yawRate = 0;

    // frame-local readouts
    this.vLong = 0;        // m/s forward
    this.vLat = 0;         // m/s sideways
    this.speed = 0;        // m/s magnitude
    this.slip = 0;         // rear slip (for skid/traction fx)
    this.wheelSpin = 0;    // 0..1, drives TC light + tyre wear
    this.onKerb = false;
    this.offTrack = false;

    // drivetrain
    this.gear = 1;
    this.rpm = CAR_SPEC.idle;
    this.autoGear = true;

    // systems
    this.drs = false;
    this.ers = false;
    this.tc = assist.tcDefault;
    this.abs = assist.absDefault;
    this.lights = false;
    this.pitLimiter = false;
    this.ignition = true;

    // consumables
    this.fuel = 100;       // %
    this.ersCharge = 100;  // %
    this.tyreWear = 100;   // % (100 = fresh)
    this.engineTemp = 90;  // °C

    this.inertia = CAR_SPEC.mass * 1.6;
    this.wheelbase = 3.0;
    this.a = 1.35;         // CG -> front axle
    this.b = 1.65;         // CG -> rear axle
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.velX = 0; this.velZ = 0; this.yawRate = 0;
    this.vLong = 0; this.vLat = 0; this.speed = 0;
    this.gear = 1; this.rpm = CAR_SPEC.idle;
  }

  // --- derived setup factors ---
  get frontWingF() { return 0.4 + (this.setup.frontWing / 11) * 1.1; }
  get rearWingF() { return 0.4 + (this.setup.rearWing / 11) * 1.3; }
  get dragF() { return CAR_SPEC.dragCoeff * (0.7 + (this.setup.frontWing + this.setup.rearWing) / 22 * 0.9); }
  get gripBase() {
    // grip from assist preset, tyre pressure (sweet spot ~22), suspension, wear
    const pressurePenalty = 1 - Math.abs(this.setup.tyrePressure - 22) * 0.02;
    const suspF = 0.92 + (this.setup.suspension / 10) * 0.16;
    const wearF = 0.75 + (this.tyreWear / 100) * 0.25;
    return 1.45 * this.assist.grip * pressurePenalty * suspF * wearF;
  }
  get finalDrive() { return CAR_SPEC.finalDriveBase * (0.85 + (this.setup.gearRatio / 10) * 0.5); }
  get ecuF() { return 0.7 + (this.setup.ecuMap / 6) * 0.55; }

  gearRatioFor(g) { return CAR_SPEC.gears[Math.min(g, CAR_SPEC.gears.length) - 1]; }

  update(dt, input) {
    // clamp dt for stability
    dt = Math.min(dt, 1 / 30);

    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    // project world velocity into car frame
    this.vLong = this.velX * forwardX + this.velZ * forwardZ;
    this.vLat = this.velX * rightX + this.velZ * rightZ;
    this.speed = Math.hypot(this.velX, this.velZ);

    const absLong = Math.abs(this.vLong);

    // ---------------- Gearbox ----------------
    // rpm from wheel speed
    const ratio = this.gearRatioFor(this.gear) * this.finalDrive;
    let rpm = (absLong / CAR_SPEC.wheelRadius) * ratio * (60 / (2 * Math.PI));
    rpm = Math.max(CAR_SPEC.idle * (input.throttle > 0.1 ? 1 + input.throttle * 0.4 : 1), rpm);
    this.rpm = Math.min(rpm, CAR_SPEC.redline);

    if (this.autoGear) {
      if (this.rpm > CAR_SPEC.redline * 0.95 && this.gear < CAR_SPEC.gears.length && input.throttle > 0.3)
        this.gear++;
      else if (this.rpm < CAR_SPEC.redline * 0.45 && this.gear > 1)
        this.gear--;
    } else {
      if (input.gearUp) this.gear = Math.min(this.gear + 1, CAR_SPEC.gears.length);
      if (input.gearDown) this.gear = Math.max(this.gear - 1, 1);
    }

    // ---------------- Aero ----------------
    const q = this.speed * this.speed;
    let drag = this.dragF * q;
    if (this.drs && this.speed > 20) drag *= (1 - CAR_SPEC.drsDragCut);
    const downforce = CAR_SPEC.downforceCoeff * (this.frontWingF + this.rearWingF) * q;
    const load = CAR_SPEC.mass * G + downforce; // total normal load (N)
    const loadF = load * (this.b / this.wheelbase);
    const loadR = load * (this.a / this.wheelbase);

    const grip = this.gripBase;
    const maxForceF = grip * loadF;
    const maxForceR = grip * loadR;

    // ---------------- Engine / traction ----------------
    let power = CAR_SPEC.maxEnginePower * this.ecuF * 746; // watts-ish
    if (this.ers && this.ersCharge > 0) power *= 1 + CAR_SPEC.ersBoost / 780;
    if (this.pitLimiter) power = Math.min(power, 60000);
    if (this.fuel <= 0 || !this.ignition) power = 0;

    let driveForce = 0;
    if (input.throttle > 0) {
      const maxTractive = power / Math.max(absLong, 3);
      driveForce = input.throttle * maxTractive;
      // traction control limits wheelspin
      const tractionCap = maxForceR * (this.tc ? 0.98 : 1.15);
      if (driveForce > tractionCap) {
        this.wheelSpin = Math.min(1, (driveForce - tractionCap) / (maxForceR + 1));
        driveForce = this.tc ? tractionCap : tractionCap * 0.85; // slip loses some force
      } else {
        this.wheelSpin *= 0.85;
      }
    } else {
      this.wheelSpin *= 0.85;
      // engine braking
      driveForce = -Math.sign(this.vLong) * 900 * (this.gear <= 3 ? 1.4 : 1);
    }

    // ---------------- Braking ----------------
    let brakeForce = 0;
    if (input.brake > 0) {
      let bf = input.brake * CAR_SPEC.brakeForce;
      // ABS caps braking to available grip to avoid lock-up
      if (this.abs) bf = Math.min(bf, (maxForceF + maxForceR) * 0.95);
      brakeForce = bf;
    }

    // ---------------- Steering / slip angles ----------------
    const maxSteer = 0.55 * (1 - Math.min(0.6, this.speed / 90)); // less lock at speed
    let steer = input.steer * maxSteer;
    // steer assist (arcade) nudges toward velocity direction
    if (this.assist.steerAssist > 0 && this.speed > 4) {
      steer += -this.vLat / Math.max(absLong, 6) * this.assist.steerAssist * 0.4;
    }

    let Fyf = 0, Fyr = 0, torque = 0;
    const speedForSlip = Math.max(absLong, 0.001);

    if (this.speed > 2.2) {
      const slipF = Math.atan2(this.vLat + this.a * this.yawRate, speedForSlip) - steer * Math.sign(this.vLong || 1);
      const slipR = Math.atan2(this.vLat - this.b * this.yawRate, speedForSlip);
      const cS = 9.5; // cornering stiffness scalar
      Fyf = clamp(-cS * slipF, -maxForceF, maxForceF);
      Fyr = clamp(-cS * slipR, -maxForceR, maxForceR);
      this.slip = Math.abs(slipR);
      torque = this.a * Fyf * Math.cos(steer) - this.b * Fyr;
    } else {
      // low-speed kinematic steering to avoid numeric jitter
      this.yawRate = (this.vLong / this.wheelbase) * Math.tan(steer);
      this.slip = 0;
    }

    // differential: locked diff resists yaw a touch
    const diffDamp = 1 + (this.setup.diff / 100) * 0.5;

    // ---------------- Integrate ----------------
    const rolling = CAR_SPEC.rollingResistance * load * Math.sign(this.vLong);
    let Flong = driveForce - drag * Math.sign(this.vLong) - rolling
      - brakeForce * Math.sign(this.vLong) + Fyf * Math.sin(steer) * -0.2;
    let Flat = Fyf * Math.cos(steer) + Fyr;

    // surface penalty when off track
    if (this.offTrack) { Flong *= 0.7; Flat *= 0.55; }
    if (this.onKerb) { Flat *= 0.85; }

    const aLong = Flong / CAR_SPEC.mass;
    const aLat = Flat / CAR_SPEC.mass;

    // include centripetal coupling
    this.vLong += (aLong + this.yawRate * this.vLat) * dt;
    this.vLat += (aLat - this.yawRate * this.vLong) * dt;

    if (this.speed > 2.2) {
      this.yawRate += (torque / (this.inertia * diffDamp)) * dt;
    }
    // damp lateral velocity slightly (tyre relaxation)
    this.vLat *= 0.98;
    this.yawRate *= 0.985;

    // stop creep
    if (Math.abs(this.vLong) < 0.05 && input.throttle < 0.02) this.vLong = 0;

    // back to world frame
    this.velX = this.vLong * forwardX + this.vLat * rightX;
    this.velZ = this.vLong * forwardZ + this.vLat * rightZ;

    this.yaw += this.yawRate * dt;
    this.x += this.velX * dt;
    this.z += this.velZ * dt;

    this.steerAngle = steer;

    // ---------------- Consumables ----------------
    const load01 = input.throttle * (this.ecuF);
    this.fuel = Math.max(0, this.fuel - load01 * dt * 0.06 * (this.ers ? 1.3 : 1));
    if (this.ers && input.throttle > 0.1) this.ersCharge = Math.max(0, this.ersCharge - dt * 6);
    else this.ersCharge = Math.min(100, this.ersCharge + dt * (input.brake > 0 ? 5 : 1.2)); // regen
    const wearRate = (this.slip * 0.5 + this.wheelSpin * 0.6 + Math.abs(this.vLat) * 0.02) * dt * 0.4;
    this.tyreWear = Math.max(0, this.tyreWear - wearRate);
    const targetTemp = 85 + input.throttle * 25 + this.speed * 0.05;
    this.engineTemp += (targetTemp - this.engineTemp) * dt * 0.5;
  }

  get kph() { return Math.abs(this.vLong) * 3.6; }
  get rpmPct() { return this.rpm / CAR_SPEC.redline; }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
