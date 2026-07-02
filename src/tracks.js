// -----------------------------------------------------------------------------
// Track definitions.
//
// A track is just a closed list of 2D centreline waypoints (in metres) plus a
// width. That is exactly the shape of data you can export from real circuits:
//   - OpenStreetMap ways tagged `highway=raceway` (public, ODbL licensed)
//   - Public GPS traces / telemetry of a real lap
//   - Government / satellite survey coordinates
// Convert lat/lon to local metres (equirectangular projection around the centre)
// and drop them into `waypoints`, and the builder below turns them into a
// drivable circuit. The layouts here are *inspired by* famous circuits but are
// deliberately stylised — official names, logos and exact geometry are
// trademarked, so shipping a real branded track needs the rights holder's
// licence. The technical path, however, is fully supported.
// -----------------------------------------------------------------------------

import * as THREE from 'three';

// helper: convert an array of [lat, lon] into local metres around the centroid.
// Exposed so real GPS/OSM data can be dropped straight in.
export function latLonToMetres(points) {
  const lat0 = points.reduce((a, p) => a + p[0], 0) / points.length;
  const lon0 = points.reduce((a, p) => a + p[1], 0) / points.length;
  const R = 6378137;
  const cos0 = Math.cos((lat0 * Math.PI) / 180);
  return points.map(([lat, lon]) => [
    ((lon - lon0) * Math.PI / 180) * R * cos0,
    -((lat - lat0) * Math.PI / 180) * R,
  ]);
}

export const TRACKS = [
  {
    id: 'harbour',
    name: 'Harbour Street Circuit',
    inspiredBy: 'Monaco-style street layout',
    width: 12,
    walls: true,
    scenery: 'city',
    laps: 5,
    waypoints: [
      [0, 0], [60, -4], [120, -18], [168, -52], [190, -104], [176, -158],
      [130, -190], [70, -196], [10, -182], [-44, -150], [-70, -100],
      [-58, -46], [-96, -20], [-150, -30], [-196, -66], [-210, -122],
      [-186, -176], [-130, -200], [-64, -206], [-8, -190], [-40, -120],
      [-60, -60], [-30, -20],
    ],
  },
  {
    id: 'grandpark',
    name: 'Grand Park GP',
    inspiredBy: 'Silverstone-style fast circuit',
    width: 15,
    walls: false,
    scenery: 'country',
    laps: 4,
    waypoints: [
      [0, 0], [90, 10], [180, 0], [250, -40], [270, -120], [230, -190],
      [150, -220], [70, -210], [20, -260], [40, -340], [120, -380],
      [210, -376], [280, -330], [300, -250], [340, -200], [420, -210],
      [470, -270], [460, -350], [400, -400], [300, -420], [180, -420],
      [60, -410], [-30, -360], [-70, -270], [-60, -170], [-100, -100],
      [-90, -20], [-40, 20],
    ],
  },
  {
    id: 'oval',
    name: 'Test Oval',
    inspiredBy: 'Setup & handling proving ground',
    width: 18,
    walls: false,
    scenery: 'country',
    laps: 6,
    waypoints: (() => {
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        pts.push([Math.cos(a) * 220, Math.sin(a) * 130]);
      }
      return pts;
    })(),
  },
];

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}

// -----------------------------------------------------------------------------
// Builder: turns a track definition into meshes + a sampled centreline used for
// timing, the mini-map, AI and off-track detection.
// -----------------------------------------------------------------------------
export function buildTrack(def) {
  const group = new THREE.Group();

  const curvePts = def.waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(curvePts, true, 'centripetal', 0.5);

  const divisions = Math.max(240, def.waypoints.length * 12);
  const samples = curve.getSpacedPoints(divisions);
  const tangents = [];
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length;
    tangents.push(curve.getTangentAt(t).normalize());
  }

  const half = def.width / 2;
  const up = new THREE.Vector3(0, 1, 0);

  // --- Road ribbon ---
  const roadPos = [];
  const roadUv = [];
  const roadIdx = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const side = new THREE.Vector3().crossVectors(tangents[i], up).normalize();
    const l = new THREE.Vector3().copy(p).addScaledVector(side, -half);
    const r = new THREE.Vector3().copy(p).addScaledVector(side, half);
    roadPos.push(l.x, 0.02, l.z, r.x, 0.02, r.z);
    const v = i * 0.25;
    roadUv.push(0, v, 1, v);
  }
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const a = (i * 2) % (n * 2);
    const b = (i * 2 + 1) % (n * 2);
    const c = (((i + 1) % n) * 2) % (n * 2);
    const d = (((i + 1) % n) * 2 + 1) % (n * 2);
    roadIdx.push(a, c, b, b, c, d);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
  roadGeo.setIndex(roadIdx);
  roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.95, metalness: 0.0 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // --- Kerbs (red/white striped edges) ---
  const kerbMatA = new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.8 });
  const kerbMatB = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
  const kerbW = 1.2;
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < n; i += 3) {
      const p = samples[i];
      const side = new THREE.Vector3().crossVectors(tangents[i], up).normalize();
      const edge = new THREE.Vector3().copy(p).addScaledVector(side, s * (half + kerbW / 2));
      const g = new THREE.BoxGeometry(kerbW, 0.08, 3.4);
      const m = new THREE.Mesh(g, i % 6 === 0 ? kerbMatA : kerbMatB);
      m.position.set(edge.x, 0.04, edge.z);
      m.lookAt(edge.x + tangents[i].x, 0.04, edge.z + tangents[i].z);
      group.add(m);
    }
  }

  // --- Painted edge lines ---
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  for (let s = -1; s <= 1; s += 2) {
    const linePos = [];
    const lineIdx = [];
    for (let i = 0; i < n; i++) {
      const p = samples[i];
      const side = new THREE.Vector3().crossVectors(tangents[i], up).normalize();
      const inner = new THREE.Vector3().copy(p).addScaledVector(side, s * (half - 0.25));
      const outer = new THREE.Vector3().copy(p).addScaledVector(side, s * (half - 0.05));
      linePos.push(inner.x, 0.03, inner.z, outer.x, 0.03, outer.z);
    }
    for (let i = 0; i < n; i++) {
      const a = (i * 2) % (n * 2);
      const b = (i * 2 + 1) % (n * 2);
      const c = (((i + 1) % n) * 2) % (n * 2);
      const d = (((i + 1) % n) * 2 + 1) % (n * 2);
      lineIdx.push(a, c, b, b, c, d);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    lg.setIndex(lineIdx);
    lg.computeVertexNormals();
    group.add(new THREE.Mesh(lg, lineMat));
  }

  // --- Walls (street circuits) ---
  if (def.walls) {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfd3da, roughness: 0.9 });
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < n; i += 2) {
        const p = samples[i];
        const side = new THREE.Vector3().crossVectors(tangents[i], up).normalize();
        const edge = new THREE.Vector3().copy(p).addScaledVector(side, s * (half + kerbW + 0.5));
        const g = new THREE.BoxGeometry(0.4, 1.1, 2.6);
        const m = new THREE.Mesh(g, wallMat);
        m.position.set(edge.x, 0.55, edge.z);
        m.lookAt(edge.x + tangents[i].x, 0.55, edge.z + tangents[i].z);
        m.castShadow = true;
        group.add(m);
      }
    }
  }

  // --- Start / finish line ---
  const startP = samples[0];
  const startSide = new THREE.Vector3().crossVectors(tangents[0], up).normalize();
  const sfGeo = new THREE.PlaneGeometry(def.width, 2);
  const sfCanvas = makeStartLineTexture();
  const sfMat = new THREE.MeshBasicMaterial({ map: sfCanvas, transparent: true });
  const sf = new THREE.Mesh(sfGeo, sfMat);
  sf.rotation.x = -Math.PI / 2;
  sf.position.set(startP.x, 0.05, startP.z);
  sf.lookAt(startP.x + tangents[0].x, 0.05, startP.z + tangents[0].z);
  sf.rotateX(-Math.PI / 2);
  group.add(sf);

  // centreline data for timing / minimap / off-track
  const centreline = samples.map((p) => new THREE.Vector2(p.x, p.z));
  const startDir = new THREE.Vector2(tangents[0].x, tangents[0].z);

  return {
    group,
    centreline,
    tangents: tangents.map((t) => new THREE.Vector2(t.x, t.z)),
    width: def.width,
    half,
    start: new THREE.Vector2(startP.x, startP.z),
    startDir,
    startSide: new THREE.Vector2(startSide.x, startSide.z),
    length: curve.getLength(),
    def,
  };
}

function makeStartLineTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  const cols = 16;
  const rows = 4;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#ffffff' : '#101010';
      ctx.fillRect((x * c.width) / cols, (y * c.height) / rows, c.width / cols, c.height / rows);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
