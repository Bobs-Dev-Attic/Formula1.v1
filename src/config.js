// -----------------------------------------------------------------------------
// Central configuration: liveries, driving-assist presets, and the default,
// fully-adjustable car setup an F1 engineer would tweak in the garage.
// -----------------------------------------------------------------------------

// Single source of truth for the build version shown on screen.
// Bump this on every update so it's clear what to expect.
export const VERSION = 'v1.5.0';

export const TEAMS = [
  { id: 'scarlet',  name: 'Scarlet Corse',   body: 0xd4160b, accent: 0xf4d03f, tyre: 0x111214 },
  { id: 'silver',   name: 'Silver Arrow',    body: 0xd7dbe0, accent: 0xe10600, tyre: 0x111214 },
  { id: 'midnight', name: 'Midnight RB',     body: 0x0a1e5a, accent: 0xf5c518, tyre: 0x111214 },
  { id: 'papaya',   name: 'Papaya Works',    body: 0xff7a00, accent: 0x1a1a2e, tyre: 0x111214 },
  { id: 'aqua',     name: 'Aqua Petronas',   body: 0x00b3a4, accent: 0xd4e600, tyre: 0x111214 },
  { id: 'royal',    name: 'Royal Enstone',   body: 0x1f6feb, accent: 0xff5ea8, tyre: 0x111214 },
];

// Assist presets scale the underlying physics grip / aids. Sim grip raised so
// the car is planted (a real F1 car has enormous mechanical + aero grip); the
// looseness of Sim now comes from having no TC/ABS/steer aids rather than from
// being low-grip and slippery.
export const ASSISTS = {
  arcade:   { grip: 1.45, tcDefault: true,  absDefault: true,  steerAssist: 0.55, label: 'Arcade' },
  balanced: { grip: 1.15, tcDefault: true,  absDefault: true,  steerAssist: 0.3,  label: 'Balanced' },
  sim:      { grip: 1.02, tcDefault: false, absDefault: false, steerAssist: 0.0,  label: 'Simulation' },
};

// The garage setup sheet. Each entry drives real handling parameters.
export const SETUP_SCHEMA = [
  { key: 'frontWing',   label: 'Front Wing',      min: 1,  max: 11, step: 1,  def: 6,  lo: 'Low drag', hi: 'High downforce' },
  { key: 'rearWing',    label: 'Rear Wing',       min: 1,  max: 11, step: 1,  def: 7,  lo: 'Low drag', hi: 'High downforce' },
  { key: 'brakeBias',   label: 'Brake Bias (F%)', min: 50, max: 70, step: 1,  def: 58, lo: 'Rear',     hi: 'Front' },
  { key: 'diff',        label: 'Differential',    min: 0,  max: 100, step: 5, def: 55, lo: 'Open',     hi: 'Locked' },
  { key: 'tyrePressure',label: 'Tyre Pressure',   min: 19, max: 26, step: 0.5, def: 22, lo: 'Soft',    hi: 'Hard' },
  { key: 'suspension',  label: 'Suspension',      min: 1,  max: 10, step: 1,  def: 5,  lo: 'Soft',     hi: 'Stiff' },
  { key: 'gearRatio',   label: 'Final Drive',     min: 1,  max: 10, step: 1,  def: 6,  lo: 'Accel',    hi: 'Top speed' },
  { key: 'ecuMap',      label: 'Engine Map',      min: 1,  max: 6,  step: 1,  def: 4,  lo: 'Economy',  hi: 'Qualifying' },
];

export function defaultSetup() {
  const s = {};
  for (const item of SETUP_SCHEMA) s[item.key] = item.def;
  return s;
}

// Physical constants shared by the vehicle model.
export const CAR_SPEC = {
  mass: 798,             // kg (car + driver, F1 minimum-ish)
  maxEnginePower: 780,   // hp-ish scalar used by the engine curve
  gears: [3.4, 2.35, 1.86, 1.55, 1.32, 1.14, 1.0, 0.9], // 8-speed
  finalDriveBase: 3.6,
  redline: 15000,        // rpm
  idle: 4000,
  wheelRadius: 0.33,     // m
  dragCoeff: 0.9,        // base; scaled by wings
  // Aero downforce grows with speed^2, so grip climbs the faster you go — high-
  // speed corners can be taken far harder than slow ones. Raised so the aero
  // grip clearly dominates weight at racing speed (as in a real F1 car).
  downforceCoeff: 4.7,   // base; scaled by wings
  rollingResistance: 0.014,
  brakeForce: 21000,     // N max
  drsDragCut: 0.28,      // fraction of drag removed when DRS open
  ersBoost: 90,          // extra power units when ERS deployed
};
