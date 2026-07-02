// -----------------------------------------------------------------------------
// Low-poly (but detailed) Formula 1 car. Returns a THREE.Group plus handles to
// the animated parts (wheels, steering, brake light, DRS flap, headlight).
// Styled after a modern F1 car: stepped nose, multi-element wings, halo, shark
// fin, mirrors, driver helmet and a livery number roundel.
// -----------------------------------------------------------------------------

import * as THREE from 'three';

export function buildCar(team) {
  const car = new THREE.Group();

  const body = new THREE.MeshStandardMaterial({ color: team.body, roughness: 0.4, metalness: 0.15 });
  const bodyDark = new THREE.MeshStandardMaterial({ color: mix(team.body, 0x000000, 0.35), roughness: 0.5, metalness: 0.15 });
  const accent = new THREE.MeshStandardMaterial({ color: team.accent, roughness: 0.35, metalness: 0.2 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x14151b, roughness: 0.55, metalness: 0.35 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x0d0e13, roughness: 0.8 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.92 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.25 });

  // ---------------- Floor / plank ----------------
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 4.6), carbon);
  floor.position.set(0, 0.16, -0.1);
  car.add(floor);

  // ---------------- Monocoque / tub (tapered) ----------------
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.4, 2.7), body);
  tub.position.set(0, 0.44, -0.1);
  car.add(tub);
  // taper the tub toward the nose using a wedge
  const tubFront = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 1.3, 4), body);
  tubFront.rotation.z = Math.PI / 2; tubFront.rotation.y = Math.PI / 4;
  tubFront.scale.set(0.9, 1, 0.62);
  tubFront.position.set(0, 0.44, 1.3);
  car.add(tubFront);

  // ---------------- Nose cone (stepped) ----------------
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.1, 1.7, 6), body);
  nose.rotation.x = Math.PI / 2;
  nose.scale.set(1, 1, 0.55);
  nose.position.set(0, 0.34, 2.35);
  car.add(nose);
  const noseTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), accent);
  noseTip.rotation.x = Math.PI / 2;
  noseTip.position.set(0, 0.32, 3.25);
  car.add(noseTip);

  // ---------------- Front wing (multi-element) ----------------
  const fw = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const el = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.34 - i * 0.06), i === 0 ? carbon : accent);
    el.position.set(0, 0.14 + i * 0.05, 3.05 - i * 0.16);
    el.rotation.x = -0.12 - i * 0.05;
    fw.add(el);
  }
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.7), body);
    ep.position.set(s * 0.98, 0.28, 2.98);
    fw.add(ep);
    // small canard
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.28), accent);
    can.position.set(s * 0.7, 0.34, 2.7);
    can.rotation.z = s * 0.2;
    fw.add(can);
  }
  car.add(fw);

  // ---------------- Sidepods + inlets ----------------
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 1.5), body);
    pod.position.set(s * 0.66, 0.42, -0.25);
    pod.geometry.translate(0, 0, 0);
    car.add(pod);
    // taper rear of pod
    const podTaper = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.05, 1.0, 5), bodyDark);
    podTaper.rotation.x = Math.PI / 2; podTaper.scale.set(1, 1, 0.9);
    podTaper.position.set(s * 0.6, 0.4, -1.4);
    car.add(podTaper);
    // inlet
    const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.1), matte);
    inlet.position.set(s * 0.72, 0.46, 0.52);
    car.add(inlet);
    // bargeboard
    const bb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.7), carbon);
    bb.position.set(s * 0.86, 0.32, 1.15);
    bb.rotation.y = s * 0.15;
    car.add(bb);
  }

  // ---------------- Cockpit + halo ----------------
  const cockpitRim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 16), carbon);
  cockpitRim.rotation.x = Math.PI / 2;
  cockpitRim.scale.set(1, 1.25, 1);
  cockpitRim.position.set(0, 0.62, 0.55);
  car.add(cockpitRim);

  // driver helmet
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), accent);
  helmet.scale.set(1, 1.05, 1.12);
  helmet.position.set(0, 0.68, 0.5);
  car.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.12), matte);
  visor.position.set(0, 0.7, 0.62);
  car.add(visor);

  // halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 18, Math.PI), matte);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.78, 0.5);
  car.add(halo);
  const haloStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), matte);
  haloStrut.position.set(0, 0.7, 0.86);
  haloStrut.rotation.x = 0.3;
  car.add(haloStrut);

  // mirrors
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), carbon);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(s * 0.42, 0.62, 0.62);
    car.add(arm);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.05), chrome);
    mir.position.set(s * 0.56, 0.62, 0.62);
    car.add(mir);
  }

  // ---------------- Airbox + shark fin + engine cover ----------------
  const airbox = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 5), bodyDark);
  airbox.position.set(0, 0.78, 0.05);
  car.add(airbox);
  const airInlet = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12), matte);
  airInlet.rotation.x = Math.PI / 2;
  airInlet.position.set(0, 0.84, 0.28);
  car.add(airInlet);
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.08, 2.0, 5), body);
  cover.rotation.x = Math.PI / 2;
  cover.scale.set(1, 1, 0.8);
  cover.position.set(0, 0.6, -1.0);
  car.add(cover);
  // shark fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 1.4), accent);
  fin.position.set(0, 0.72, -1.2);
  car.add(fin);

  // ---------------- Rear wing + DRS ----------------
  const rWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.42), carbon);
  rWingMain.position.set(0, 1.0, -2.15);
  rWingMain.rotation.x = 0.18;
  car.add(rWingMain);
  const drsFlap = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.3), accent);
  drsFlap.position.set(0, 1.12, -2.28);
  drsFlap.rotation.x = 0.35;
  car.add(drsFlap);
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.6), body);
    ep.position.set(s * 0.68, 0.9, -2.2);
    car.add(ep);
  }
  const swan = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.1), carbon);
  swan.position.set(0, 0.82, -2.0);
  car.add(swan);
  // beam wing + diffuser
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.3), carbon);
  beam.position.set(0, 0.5, -2.2);
  car.add(beam);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.4), matte);
  diffuser.position.set(0, 0.22, -2.15);
  car.add(diffuser);

  // rear light / brake light
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x220000, emissiveIntensity: 1 });
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.05), brakeMat);
  brake.position.set(0, 0.4, -2.32);
  car.add(brake);

  // headlight strip
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), headMat);
  head.position.set(0, 0.34, 3.4);
  car.add(head);

  // ---------------- Number roundel on the nose ----------------
  const num = makeNumberDecal('2', team);
  num.position.set(0, 0.5, 1.9);
  num.rotation.x = -0.2;
  car.add(num);

  // ---------------- Wheels (with rims + brake discs) ----------------
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.4, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.75, roughness: 0.3 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, metalness: 0.6, roughness: 0.5 });
  function makeWheel() {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    g.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.42, 10), rimMat);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), discMat);
    disc.rotation.z = Math.PI / 2;
    g.add(disc);
    // sidewall marking ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.015, 4, 18), accent);
    ring.position.x = 0.2;
    g.add(ring);
    return g;
  }
  const wheelPos = {
    fl: [0.8, 0.34, 1.55], fr: [-0.8, 0.34, 1.55],
    rl: [0.86, 0.34, -1.5], rr: [-0.86, 0.34, -1.5],
  };
  const wheels = {};
  const steerPivots = {};
  for (const [k, p] of Object.entries(wheelPos)) {
    const w = makeWheel();
    if (k.startsWith('r')) w.scale.set(1.18, 1.18, 1.28); // fatter/wider rears
    if (k.startsWith('f')) {
      const pivot = new THREE.Group();
      pivot.position.set(p[0], p[1], p[2]);
      pivot.add(w);
      car.add(pivot);
      steerPivots[k] = pivot;
    } else {
      w.position.set(p[0], p[1], p[2]);
      car.add(w);
    }
    wheels[k] = w;
    // suspension arms to the tub
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, Math.abs(p[0]) - 0.1, 5), carbon);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(p[0] * 0.5, p[1], p[2]);
    car.add(arm);
  }

  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

  return { group: car, wheels, steerPivots, parts: { brake, drsFlap, head, brakeMat, headMat } };
}

// A canvas-textured plane with the car number in a white roundel.
function makeNumberDecal(numStr, team) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#' + team.accent.toString(16).padStart(6, '0');
  ctx.font = 'bold 78px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(numStr, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
  return m;
}

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
