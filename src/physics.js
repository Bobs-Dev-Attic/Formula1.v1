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
    this.ers = false;          // manual overtake (held button)
    this.ersMode = 2;          // 0 OFF · 1 BUILD · 2 BALANCED · 3 HOTLAP (auto deploy)
    this.tc = assist.tcDefault;
    this.abs = assist.absDefault;
    this.lights = false;
    this.pitLimiter = false;
    this.ignition = true;
    this.neutral = false;      // gearbox in neutral (coast)

    // consumables
    this.fuel = 100;       // %
    this.ersCharge = 100;  // %
    this.tyreWear = 100;   // % (100 = fresh)
    this.engineTemp = 90;  // °C

    this.reverse = false;

    this.inertia = CAR_SPEC.mass * 1.5;
    this.wheelbase = 3.0;
    // Mildly rear-biased weight (engine behind the driver). Static axle load is
    // proportional to the distance to the OPPOSITE axle, so a > b puts a bit
    // more load — and grip — on the rear for stability, but only mildly so the
    // front still has the authority to rotate the car (avoids heavy understeer).
    this.a = 1.56;         // CG -> front axle
    this.b = 1.44;         // CG -> rear axle
    this.rearGripBias = 1.07; // wider rear tyres carry a little more lateral load
  }

  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.velX = 0; this.velZ = 0; this.yawRate = 0;
    this.vLong = 0; this.vLat = 0; this.speed = 0;
    this.gear = 1; this.rpm = CAR_SPEC.idle;
    this.reverse = false;
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
    const maxForceR = grip * loadR * this.rearGripBias;

    // ---------------- Engine / traction ----------------
    let power = CAR_SPEC.maxEnginePower * this.ecuF * 746; // watts-ish
    // ERS deploys automatically per the selected mode, and fully when the
    // overtake button is held. Deployment fraction 0..1.
    const modeDeploy = [0, 0.45, 0.7, 1.0][this.ersMode] || 0;
    this.ersDeploy = this.ersCharge > 0 && input.throttle > 0.1
      ? Math.max(this.ers ? 1 : 0, modeDeploy) : 0;
    if (this.ersDeploy > 0) power *= 1 + (CAR_SPEC.ersBoost / 780) * this.ersDeploy;
    if (this.pitLimiter) power = Math.min(power, 60000);
    if (this.fuel <= 0 || !this.ignition || this.neutral) power = 0;

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
      // engine braking, only while actually rolling forward
      if (this.vLong > 0.3) driveForce = -900 * (this.gear <= 3 ? 1.4 : 1);
      else driveForce = 0;
    }

    // ---------------- Braking & reverse ----------------
    // The brake input brakes while moving forward; once the car is (almost)
    // stopped and the driver isn't on the throttle, it doubles as reverse.
    let brakeForce = 0;
    this.reverse = false;
    const reverseTop = 8; // m/s (~29 kph) reverse speed cap
    if (input.brake > 0) {
      if (this.vLong > 0.6) {
        let bf = input.brake * CAR_SPEC.brakeForce;
        // ABS caps braking to available grip to avoid lock-up
        if (this.abs) bf = Math.min(bf, (maxForceF + maxForceR) * 0.95);
        brakeForce = bf;
      } else if (input.throttle < 0.05 && power > 0) {
        this.reverse = true;
        if (this.vLong > -reverseTop) {
          driveForce = -input.brake * Math.min(power / Math.max(absLong, 3), maxForceR * 0.7);
        } else {
          driveForce = 0; // hold reverse speed cap
        }
      }
    }
    if (this.vLong < -0.3) this.reverse = true;

    // ---------------- Steering / slip angles ----------------
    // Lots of lock for slow corners/hairpins, bleeding down to a few degrees at
    // speed. Keeping high-speed steer angles small (near the tyre's efficient
    // slip range rather than way past it) makes the turn response monotonic —
    // more steering always turns tighter, never wider.
    const maxSteer = 0.60 * (1 - Math.min(0.76, this.speed / 58)); // ~34° parked → ~8° at 160kph
    // NB: the chase camera looks along +z, which mirrors world X on screen, so
    // a positive steer input must produce a turn toward the driver's right
    // (negative world-X / negative yaw). Hence the leading minus sign.
    let steer = -input.steer * maxSteer;
    // steer assist (arcade) counter-steers into a slide to stabilise the car
    if (this.assist.steerAssist > 0 && this.speed > 4) {
      steer += -this.vLat / Math.max(absLong, 6) * this.assist.steerAssist * 0.4;
    }

    let Fyf = 0, Fyr = 0, torque = 0;
    const speedForSlip = Math.max(absLong, 0.001);

    if (this.speed > 2.2) {
      const slipF = Math.atan2(this.vLat + this.a * this.yawRate, speedForSlip) - steer * Math.sign(this.vLong || 1);
      const slipR = Math.atan2(this.vLat - this.b * this.yawRate, speedForSlip);
      // Cornering stiffness sized so grip saturates at ~8° of slip. This makes
      // lateral force scale with the available grip/load instead of being a
      // fixed tiny scalar (the old cS=9.5 produced ~1 N and the car wouldn't
      // turn above walking pace).
      // Front grip peaks at a slightly larger slip angle than the rear, so the
      // rear still lets go last (stable) but the front bites hard enough to
      // rotate the car instead of washing out into understeer.
      const peakSlip = 0.16; // rad
      const Cf = maxForceF / peakSlip;
      const Cr = maxForceR / (peakSlip * 0.9);
      Fyf = clamp(-Cf * slipF, -maxForceF, maxForceF);
      Fyr = clamp(-Cr * slipR, -maxForceR, maxForceR);
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
      // Steering authority: the pure slip model settles into an understeer-
      // limited yaw balance well short of the grip limit, so the car feels like
      // it won't turn. Nudge yaw toward the steering target, but CAP that target
      // at the grip-limited yaw rate so it stays planted and can't spin.
      const maxLatA = (maxForceF + maxForceR) / CAR_SPEC.mass;
      const gripYawMax = maxLatA / Math.max(this.speed, 6);
      let targetYaw = (this.vLong / this.wheelbase) * Math.tan(steer);
      targetYaw = clamp(targetYaw, -gripYawMax, gripYawMax);
      this.yawRate += (targetYaw - this.yawRate) * 0.12;
    }
    // Light tyre-relaxation damping only. The real yaw damping comes from the
    // rear slip angle (slipR rises with yawRate -> restoring torque); a heavy
    // constant multiplier here would just strangle rotation and make steering
    // feel dead, so keep these close to 1.
    this.vLat *= 0.995;
    // Sideslip limiter: cap how far the velocity vector may lag the heading, so
    // the grip "catches" the slide. This keeps the car from drifting wildly,
    // makes cornering radius shrink monotonically with steering, and — being
    // grip-dependent — lets Sim slide more and Arcade stay planted.
    const maxSlipAng = 0.26 / this.assist.grip; // rad (~15° balanced, ~11° arcade, ~18° sim)
    const maxVLat = Math.tan(maxSlipAng) * Math.max(absLong, 4);
    this.vLat = clamp(this.vLat, -maxVLat, maxVLat);
    // A touch of extra yaw damping that grows with rear slip catches snap
    // oversteer without limiting normal cornering, plus a hard spin cap.
    const slipDamp = 1 - Math.min(0.05, this.slip * 0.08);
    this.yawRate *= slipDamp;
    const yawCap = 2.6;
    this.yawRate = clamp(this.yawRate, -yawCap, yawCap);

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
    this.fuel = Math.max(0, this.fuel - load01 * dt * 0.06 * (1 + this.ersDeploy * 0.3));
    if (this.ersDeploy > 0) this.ersCharge = Math.max(0, this.ersCharge - dt * 6 * this.ersDeploy);
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
