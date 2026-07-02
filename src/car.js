// -----------------------------------------------------------------------------
// Low-poly Formula 1 car model. Returns a THREE.Group plus handles to the parts
// the game animates (wheels, steering, brake light, DRS flap, rev exhaust).
// -----------------------------------------------------------------------------

import * as THREE from 'three';

export function buildCar(team) {
  const car = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: team.body, roughness: 0.45, metalness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color: team.accent, roughness: 0.4, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.7, metalness: 0.1 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: team.tyre, roughness: 0.9 });

  // Main monocoque / tub (tapered box built from a low-poly shape)
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 3.0), body);
  tub.position.set(0, 0.42, 0);
  tub.castShadow = true;
  car.add(tub);

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.5, 6), body);
  nose.rotation.z = Math.PI / 2;
  nose.rotation.y = Math.PI / 2;
  nose.position.set(0, 0.4, 2.05);
  nose.scale.set(1, 0.6, 1);
  nose.castShadow = true;
  car.add(nose);

  // Cockpit / halo
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  cockpit.position.set(0, 0.6, -0.1);
  car.add(cockpit);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 12, Math.PI), dark);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.72, 0.1);
  car.add(halo);

  // Airbox / engine cover
  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 1.4), accent);
  airbox.position.set(0, 0.66, -0.9);
  airbox.scale.set(1, 1, 1);
  airbox.geometry.translate(0, 0, 0);
  car.add(airbox);

  // Sidepods
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 1.6), body);
    pod.position.set(s * 0.7, 0.4, -0.2);
    pod.castShadow = true;
    car.add(pod);
  }

  // Front wing
  const fWing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.5), accent);
  fWing.position.set(0, 0.2, 2.65);
  car.add(fWing);
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.5), dark);
    ep.position.set(s * 0.92, 0.3, 2.65);
    car.add(ep);
  }

  // Rear wing + DRS flap (animated)
  const rWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.4), accent);
  rWingMain.position.set(0, 0.95, -1.9);
  car.add(rWingMain);
  const drsFlap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.35), dark);
  drsFlap.position.set(0, 1.08, -1.95);
  car.add(drsFlap);
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), dark);
    ep.position.set(s * 0.75, 0.85, -1.9);
    car.add(ep);
  }

  // Rear light + brake light (glows on brake)
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x220000, emissiveIntensity: 1 });
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.06), brakeMat);
  brake.position.set(0, 0.55, -2.05);
  car.add(brake);

  // Headlight strip (toggled by lights switch, mostly cosmetic in daylight)
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), headMat);
  head.position.set(0, 0.42, 2.75);
  car.add(head);

  // Floor plank
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 3.2), dark);
  floor.position.set(0, 0.2, -0.1);
  car.add(floor);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.38, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.7, roughness: 0.3 });
  function makeWheel() {
    const g = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    tyre.castShadow = true;
    g.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    return g;
  }
  const wheelPos = {
    fl: [0.78, 0.34, 1.5],
    fr: [-0.78, 0.34, 1.5],
    rl: [0.85, 0.34, -1.4],
    rr: [-0.85, 0.34, -1.4],
  };
  const wheels = {};
  const steerPivots = {};
  for (const [k, p] of Object.entries(wheelPos)) {
    const w = makeWheel();
    if (k.startsWith('r')) w.scale.set(1.15, 1.15, 1.15); // fatter rears
    if (k.startsWith('f')) {
      const pivot = new THREE.Group();
      pivot.position.set(p[0], p[1], p[2]);
      w.position.set(0, 0, 0);
      pivot.add(w);
      car.add(pivot);
      steerPivots[k] = pivot;
    } else {
      w.position.set(p[0], p[1], p[2]);
      car.add(w);
    }
    wheels[k] = w;
  }

  car.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return {
    group: car,
    wheels,
    steerPivots,
    parts: { brake, drsFlap, head, brakeMat, headMat },
  };
}
