// -----------------------------------------------------------------------------
// Low-poly world: sky gradient, ground, lighting and scenery (city blocks or
// countryside) scattered around — but never on — the track centreline.
// -----------------------------------------------------------------------------

import * as THREE from 'three';

// Deterministic pseudo-random so scenery is stable between reloads.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEnvironment(scene, track) {
  const rnd = mulberry32(1337);

  // Sky
  scene.background = new THREE.Color(0x8fbce6);
  scene.fog = new THREE.Fog(0x9ec4e8, 260, 620);

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x3a4a3a, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
  sun.position.set(120, 200, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 260;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Ground
  const groundColor = track.def.scenery === 'city' ? 0x6d6f75 : 0x4f7a3a;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400, 1, 1),
    new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // helper: distance from a point to the nearest centreline sample
  const cl = track.centreline;
  function distToTrack(x, z) {
    let min = Infinity;
    for (let i = 0; i < cl.length; i += 2) {
      const dx = cl[i].x - x;
      const dz = cl[i].y - z;
      const d = dx * dx + dz * dz;
      if (d < min) min = d;
    }
    return Math.sqrt(min);
  }

  const scenery = new THREE.Group();
  scene.add(scenery);

  if (track.def.scenery === 'city') {
    buildCity(scenery, track, rnd, distToTrack);
  } else {
    buildCountry(scenery, track, rnd, distToTrack);
  }

  // Distant grandstands along part of the lap
  buildGrandstands(scenery, track, rnd);

  return { sun, scenery, ground };
}

function buildCity(group, track, rnd, distToTrack) {
  const cols = [0x9aa0a8, 0xb4bac2, 0x7f858e, 0xcfd4da, 0x646a73];
  const win = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.4, metalness: 0.3 });
  const bounds = 340;
  for (let i = 0; i < 260; i++) {
    const x = (rnd() * 2 - 1) * bounds;
    const z = (rnd() * 2 - 1) * bounds - 100;
    if (distToTrack(x, z) < track.half + 14) continue;
    const w = 8 + rnd() * 18;
    const d = 8 + rnd() * 18;
    const h = 12 + rnd() * 70;
    const mat = new THREE.MeshStandardMaterial({ color: cols[(rnd() * cols.length) | 0], roughness: 0.85 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    // window band
    if (rnd() > 0.4) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 0.5, d * 1.01), win);
      band.position.set(x, h * 0.6, z);
      group.add(band);
    }
  }
  // a few harbour boats near one edge
  const boatMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const x = -260 + rnd() * 60;
    const z = -60 - i * 26;
    const boat = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 26), boatMat);
    boat.position.set(x, 2, z);
    boat.castShadow = true;
    group.add(boat);
  }
}

function buildCountry(group, track, rnd, distToTrack) {
  // trees
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 });
  const leafMats = [0x2f6b2f, 0x357a35, 0x276627].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })
  );
  const bounds = 460;
  for (let i = 0; i < 420; i++) {
    const x = (rnd() * 2 - 1) * bounds;
    const z = (rnd() * 2 - 1) * bounds - 160;
    if (distToTrack(x, z) < track.half + 10) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.5, 5), trunkMat);
    trunk.position.y = 1.25;
    t.add(trunk);
    const s = 1.6 + rnd() * 2.4;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(s, s * 2.2, 6), leafMats[(rnd() * 3) | 0]);
    leaf.position.y = 2.5 + s;
    leaf.castShadow = true;
    t.add(leaf);
    t.position.set(x, 0, z);
    group.add(t);
  }
  // rolling hills (big low cones)
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x3f6b30, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const x = (rnd() * 2 - 1) * 700;
    const z = (rnd() * 2 - 1) * 700 - 200;
    if (distToTrack(x, z) < 120) continue;
    const r = 60 + rnd() * 120;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.4, 7), hillMat);
    hill.position.set(x, -2, z);
    group.add(hill);
  }
}

function buildGrandstands(group, track, rnd) {
  const cl = track.centreline;
  const tg = track.tangents;
  const standMat = new THREE.MeshStandardMaterial({ color: 0x394050, roughness: 0.9 });
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1 });
  const count = 5;
  for (let s = 0; s < count; s++) {
    const idx = ((cl.length / count) * s) | 0;
    const p = cl[idx];
    const t = tg[idx];
    const side = new THREE.Vector2(t.y, -t.x).normalize();
    const off = track.half + 12;
    const gx = p.x + side.x * off;
    const gz = p.y + side.y * off;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 6), standMat);
    stand.position.set(gx, 4, gz);
    stand.lookAt(p.x, 4, p.y);
    stand.castShadow = true;
    group.add(stand);
    const crowd = new THREE.Mesh(new THREE.BoxGeometry(25, 4, 4), crowdMat);
    crowd.position.set(gx, 6.5, gz);
    crowd.lookAt(p.x, 6.5, p.y);
    group.add(crowd);
  }
}
