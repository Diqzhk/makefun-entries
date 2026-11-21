// world.js — the city of Solmara: seven districts on a road grid, the beach and
// the sea to the east, the Old Market plaza, palms, lamps and colliders.
// Everything visual is built once into shared geometries/materials so the whole
// city costs only a handful of draw calls beyond the buildings themselves.
import * as THREE from 'three';

export const ROAD_CENTERS = [-280, -224, -168, -112, -56, 0, 56, 112, 168, 224, 280];
export const WORLD_EDGE = 336;      // playable ground ends here; the sea begins
export const BEACH_X = 300;         // sand starts east of the strand road

export const DISTRICTS = [
  { name: 'Palms District', x0: -340, x1: -120, z0: -340, z1: -120, tint: '#e8b4d8' },
  { name: 'Old Market',     x0: -340, x1: -120, z0: -120, z1: 120,  tint: '#f2c14e' },
  { name: 'Harbor Side',    x0: -340, x1: -120, z0: 120,  z1: 340,  tint: '#9fb6c9' },
  { name: 'City Centre',    x0: -120, x1: 120,  z0: -120, z1: 120,  tint: '#ffd97a' },
  { name: 'Old Town',       x0: -120, x1: 120,  z0: 120,  z1: 340,  tint: '#e0a37e' },
  { name: 'Marina Strand',  x0: 120,  x1: 340,  z0: -340, z1: 120,  tint: '#7fe0d4' },
  { name: 'South Beach',    x0: 120,  x1: 340,  z0: 120,  z1: 340,  tint: '#ffe3a3' },
];

export const PLACES = [
  { id: 'hideout', name: 'Hideout',     x: -224, z: -224 },
  { id: 'hotel',   name: 'Palms Hotel', x: -56,  z: -168 },
  { id: 'market',  name: 'Old Market',  x: -224, z: 0 },
  { id: 'chop',    name: 'Chop Shop',   x: -56,  z: 224 },
  { id: 'hospital', name: 'Hospital',   x: 56,   z: 56 },
  { id: 'spd',     name: 'SPD',         x: -56,  z: -56 },
  { id: 'marina',  name: 'Marina',      x: 280,  z: 56 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  return DISTRICTS[3];
}

// Roads are the 16 m bands centred on each multiple of 56.
export function onRoad(x, z) {
  const near = (v) => Math.abs(((v + 28) % 56 + 56) % 56 - 28) <= 9;
  return near(x) || near(z);
}

// ---------- tiny geometry helpers (merge with vertex colours) ----------
function paint(geo, color, jitter, rng) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = 1 + (rng() - 0.5) * jitter;
    arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function mergeParts(parts) {
  // parts: [{geo, matrix}] — returns one non-indexed BufferGeometry
  let total = 0;
  const prepared = parts.map(({ geo, matrix }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    total += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of prepared) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const M4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().makeRotationY(ry);
  m.scale(new THREE.Vector3(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
};

// ---------- facade textures ----------
function facadeTextures(base, litRatio, rng) {
  const w = 128, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const e = document.createElement('canvas'); e.width = w; e.height = h;
  const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  const cols = 6, rows = 14, cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const lit = rng() < litRatio;
    const warm = ['#ffd9a0', '#ffc478', '#fff0c8'][Math.floor(rng() * 3)];
    g.fillStyle = lit ? warm : '#232c38';
    g.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 8);
    if (lit) { ge.fillStyle = warm; ge.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 8); }
  }
  const map = new THREE.CanvasTexture(c);
  const emissiveMap = new THREE.CanvasTexture(e);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

function signTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, 1004, 108);
  g.fillStyle = fg; g.font = '900 74px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture() {
  const S = 1024, half = 340;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const px = (x) => (x + half) / (2 * half) * S;
  const pz = (z) => (z + half) / (2 * half) * S;
  const pw = (w) => w / (2 * half) * S;
  g.fillStyle = '#5a6068'; g.fillRect(0, 0, S, S);           // sidewalk / block base
  // district washes
  for (const d of DISTRICTS) {
    g.fillStyle = d.tint + '22';
    g.fillRect(px(d.x0), pz(d.z0), pw(d.x1 - d.x0), pw(d.z1 - d.z0));
  }
  // roads
  g.fillStyle = '#2e3238';
  for (const c0 of ROAD_CENTERS) {
    g.fillRect(px(c0 - 8), 0, pw(16), S);
    g.fillRect(0, pz(c0 - 8), S, pw(16));
  }
  // centre dashes
  g.fillStyle = '#c8b06a';
  for (const c0 of ROAD_CENTERS) {
    for (let v = -336; v < 336; v += 14) {
      g.fillRect(px(c0) - 1, pz(v), 2, pw(6));
      g.fillRect(px(v), pz(c0) - 1, pw(6), 2);
    }
  }
  // market plaza floor
  g.fillStyle = '#6b4a35';
  g.fillRect(px(-262), pz(-38), pw(76), pw(76));
  g.fillStyle = '#7d5a40';
  g.fillRect(px(-256), pz(-32), pw(64), pw(64));
  // beach sand
  g.fillStyle = '#dcbd85';
  g.fillRect(px(BEACH_X), 0, pw(40), S);
  g.fillStyle = '#e8d09c';
  g.fillRect(px(BEACH_X + 26), 0, pw(14), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- the build ----------
export function buildWorld(scene, rng) {
  const group = new THREE.Group();
  const colliders = [];
  const addCollider = (cx, cz, hw, hd) =>
    colliders.push({ x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd });

  // ground + sea
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(680, 680),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const seaMat = new THREE.MeshPhongMaterial({
    color: 0x175d7d, emissive: 0x0a2e44, shininess: 90, transparent: true, opacity: 0.94,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(560, 720), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(BEACH_X + 40 + 280, -0.35, 0);
  group.add(sea);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 680),
    new THREE.MeshBasicMaterial({ color: 0xbfe8ef, transparent: true, opacity: 0.5 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(BEACH_X + 38, 0.02, 0);
  group.add(foam);

  // ---- buildings ----
  const variants = [
    facadeTextures('#8d99a8', 0.5, rng), facadeTextures('#c9a189', 0.42, rng),
    facadeTextures('#7e93ad', 0.6, rng), facadeTextures('#b5b0a4', 0.38, rng),
    facadeTextures('#96a8b8', 0.55, rng),
  ];
  const glassTex = facadeTextures('#5d7d99', 0.75, rng);
  const mats = variants.map((v) => new THREE.MeshLambertMaterial({
    map: v.map, emissive: 0xffc98a, emissiveMap: v.emissiveMap, emissiveIntensity: 0.85,
  }));
  const glassMat = new THREE.MeshPhongMaterial({
    map: glassTex.map, emissive: 0xffc98a, emissiveMap: glassTex.emissiveMap,
    emissiveIntensity: 1.0, shininess: 80, color: 0xbdd3e2,
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });
  const awnMats = [0xc94f6d, 0x2e8f86, 0xe0a458, 0x5d7dc9].map(
    (col) => new THREE.MeshLambertMaterial({ color: col }));

  const marketC = { x: -224, z: 0 };
  for (let i = -6; i < 6; i++) for (let j = -6; j < 6; j++) {
    const bx = 56 * i + 28, bz = 56 * j + 28; // block centre
    if (bx > 250) continue;                    // beach columns stay empty
    const d = districtAt(bx, bz);
    const nearMarket = Math.hypot(bx - marketC.x, bz - marketC.z) < 78;
    if (nearMarket) continue;                  // plaza instead
    const spots = [];
    if (d.name === 'City Centre') spots.push([0, 0, 30, 30]);
    else if (d.name === 'Harbor Side') spots.push([0, 0, 32, 24]);
    else { spots.push([-9, -9, 15, 15], [9, -9, 15, 15], [-9, 9, 15, 15], [9, 9, 15, 15]); }
    for (const [ox, oz, w, dep] of spots) {
      if (rng() < 0.12) continue;
      let h;
      if (d.name === 'City Centre') h = 42 + rng() * 42;
      else if (d.name === 'Marina Strand' || d.name === 'South Beach') h = 18 + rng() * 26;
      else if (d.name === 'Palms District') h = 13 + rng() * 22;
      else if (d.name === 'Harbor Side') h = 9 + rng() * 8;
      else h = 7 + rng() * 11;
      const glass = d.name === 'City Centre' && rng() < 0.4;
      const mat = glass ? glassMat : mats[Math.floor(rng() * mats.length)];
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dep), mat);
      b.position.set(bx + ox, h / 2, bz + oz);
      group.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.1, dep + 1), roofMat);
      roof.position.set(bx + ox, h + 0.4, bz + oz);
      group.add(roof);
      if (rng() < 0.65) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 2.4), acMat);
        ac.position.set(bx + ox + (rng() - 0.5) * (w - 6), h + 1.6, bz + oz + (rng() - 0.5) * (dep - 6));
        group.add(ac);
      }
      if (h < 20 && rng() < 0.55) { // shop awning
        const aw = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.7, 0.25, 3.4),
          awnMats[Math.floor(rng() * awnMats.length)],
        );
        aw.position.set(bx + ox, 3.1, bz + oz + dep / 2 + 1.4);
        aw.rotation.x = 0.32;
        group.add(aw);
      }
      addCollider(bx + ox, bz + oz, w / 2, dep / 2);
    }
  }

  // ---- palms (one merged mesh) ----
  const palmParts = [];
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 3.6, 5);
  trunkGeo.translate(0, 1.8, 0);
  paint(trunkGeo, '#7a5a38', 0.15, rng);
  const frondBase = [];
  for (let f = 0; f < 9; f++) {
    const fg = new THREE.PlaneGeometry(3.5, 0.62, 4, 1);
    const p = fg.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const u = (p.getX(v) + 1.75) / 3.5;
      p.setY(v, p.getY(v) * (1 - u * 0.4));
      p.setZ(v, -u * u * 1.05);
    }
    fg.computeVertexNormals();
    const droop = 0.35 + (f % 3) * 0.22;
    const roll = (f % 2 === 0 ? 1 : -1) * 0.28;
    const m = new THREE.Matrix4().makeRotationY((f / 9) * Math.PI * 2);
    m.multiply(new THREE.Matrix4().makeRotationZ(roll));
    m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + droop));
    m.multiply(new THREE.Matrix4().makeTranslation(1.35, 0, 0));
    fg.applyMatrix4(m);
    fg.translate(0, 3.62, 0);
    // colour gradient along the frond
    const n = fg.attributes.position.count;
    const carr = new Float32Array(n * 3);
    const cA = new THREE.Color('#35873a'), cB = new THREE.Color('#74bd55');
    for (let v = 0; v < n; v++) {
      const u = Math.min(1, Math.max(0, (fg.attributes.position.getX(v) + 0.4) / 3.4));
      const cc = cA.clone().lerp(cB, u);
      carr[v * 3] = cc.r; carr[v * 3 + 1] = cc.g; carr[v * 3 + 2] = cc.b;
    }
    fg.setAttribute('color', new THREE.BufferAttribute(carr, 3));
    frondBase.push(fg);
  }
  const palmSpots = [];
  for (let z = -322; z <= 322; z += 13 + rng() * 6) palmSpots.push([294 + rng() * 4, z]);
  for (let z = -322; z <= 322; z += 26 + rng() * 10) palmSpots.push([-294 + rng() * 3, z]);
  for (let k = 0; k < 46; k++) {
    const x = -300 + rng() * 590, z = -320 + rng() * 640;
    if (onRoad(x, z) || Math.hypot(x - marketC.x, z - marketC.z) < 44) continue;
    palmSpots.push([x, z]);
  }
  for (const [x, z] of palmSpots) {
    const s = 0.85 + rng() * 0.5;
    palmParts.push({ geo: trunkGeo.clone(), matrix: M4(x, 0, z, rng() * 6.28, s, s * (0.9 + rng() * 0.3), s) });
    for (const fg of frondBase) palmParts.push({ geo: fg.clone(), matrix: M4(x, 0, z, rng() * 0.4, s, s, s) });
    addCollider(x, z, 0.35, 0.35);
  }
  const palmMesh = new THREE.Mesh(
    mergeParts(palmParts),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  group.add(palmMesh);

  // ---- beach umbrellas along the sand ----
  const umbParts = [];
  const umbCols = ['#e0653f', '#57b6ff', '#ffc94d', '#ff5d8f', '#7dd069'];
  for (let i = 0; i < 16; i++) {
    const ux = 310 + rng() * 16, uz = -312 + i * 40 + rng() * 14;
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5);
    pole.translate(0, 1.15, 0);
    paint(pole, '#e8e2d4', 0.05, rng);
    const canopy = new THREE.ConeGeometry(1.9, 0.8, 8);
    canopy.translate(0, 2.5, 0);
    paint(canopy, umbCols[i % umbCols.length], 0.12, rng);
    umbParts.push({ geo: pole, matrix: M4(ux, 0, uz, 0) });
    umbParts.push({ geo: canopy, matrix: M4(ux, 0, uz, rng() * 3) });
    const towel = new THREE.BoxGeometry(1.1, 0.06, 2.2);
    paint(towel, umbCols[(i + 2) % umbCols.length], 0.1, rng);
    umbParts.push({ geo: towel, matrix: M4(ux - 2.2, 0.04, uz + 0.6, rng() * 0.8 - 0.4) });
  }
  group.add(new THREE.Mesh(
    mergeParts(umbParts),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  ));

  // ---- street lamps (merged) ----
  const poleParts = [], headParts = [];
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.4, 5);
  poleGeo.translate(0, 2.7, 0);
  paint(poleGeo, '#2c3138', 0.1, rng);
  const headGeo = new THREE.SphereGeometry(0.32, 6, 5);
  paint(headGeo, '#ffd9a0', 0.05, rng);
  for (const c0 of ROAD_CENTERS) for (let v = -322; v <= 322; v += 28) {
    if (Math.abs(v - c0) < 10) continue;
    poleParts.push({ geo: poleGeo.clone(), matrix: M4(c0 + 9.5, 0, v, 0) });
    headParts.push({ geo: headGeo.clone(), matrix: M4(c0 + 9.5, 5.5, v, 0) });
    poleParts.push({ geo: poleGeo.clone(), matrix: M4(v, 0, c0 - 9.5, 0) });
    headParts.push({ geo: headGeo.clone(), matrix: M4(v, 5.5, c0 - 9.5, 0) });
  }
  group.add(new THREE.Mesh(mergeParts(poleParts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const lampHeads = new THREE.Mesh(
    mergeParts(headParts),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  group.add(lampHeads);

  // ---- Old Market plaza ----
  const plaza = new THREE.Group();
  const stallCols = [0xc94f6d, 0x2e8f86, 0xe0a458, 0x5d7dc9, 0x8f5dc9];
  const counterMat = new THREE.MeshLambertMaterial({ color: 0x7a5a40 });
  for (let s = 0; s < 10; s++) {
    const ang = (s / 10) * Math.PI * 2;
    const sx = marketC.x + Math.cos(ang) * 26, sz = marketC.z + Math.sin(ang) * 26;
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 2), counterMat);
    counter.position.y = 0.55;
    stall.add(counter);
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.18, 3),
      new THREE.MeshLambertMaterial({ color: stallCols[s % stallCols.length] }),
    );
    canopy.position.y = 2.6;
    canopy.rotation.z = 0.06;
    stall.add(canopy);
    for (const [px2, pz2] of [[-2.4, -1.2], [2.4, -1.2], [-2.4, 1.2], [2.4, 1.2]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 4), counterMat);
      post.position.set(px2, 1.3, pz2);
      stall.add(post);
    }
    const goods = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.5, 1.4),
      new THREE.MeshLambertMaterial({ color: [0xd94f30, 0x7fc94f, 0xf2d13c][s % 3] }),
    );
    goods.position.y = 1.35;
    stall.add(goods);
    stall.position.set(sx, 0, sz);
    stall.rotation.y = -ang + Math.PI / 2;
    plaza.add(stall);
    addCollider(sx, sz, 2.6, 2.6);
  }
  // the big sign, spanning the plaza's east entrance — textured faces look
  // east/west, the rest of the board is plain painted timber
  const signTex = signTexture('SOLMARA OLD MARKET', '#5e1f2a', '#ffc94d');
  const signFace = new THREE.MeshBasicMaterial({ map: signTex });
  const signSide = new THREE.MeshBasicMaterial({ color: 0x5e1f2a });
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 4.6, 34),
    [signFace, signFace, signSide, signSide, signSide, signSide],
  );
  sign.position.set(marketC.x + 33, 6.4, marketC.z);
  plaza.add(sign);
  for (const dz of [-16, 16]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 8.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x54443a }));
    pole.position.set(marketC.x + 33, 4.3, marketC.z + dz);
    plaza.add(pole);
    addCollider(marketC.x + 33, marketC.z + dz, 0.4, 0.4);
  }
  // string lights + lanterns over the plaza
  const bulbPts = [];
  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * Math.PI * 2;
    const x1 = marketC.x + Math.cos(a) * 30, z1 = marketC.z + Math.sin(a) * 30;
    for (let t = 0; t <= 10; t++) {
      const u = t / 10;
      const x = x1 + (marketC.x - x1) * u;
      const z = z1 + (marketC.z - z1) * u;
      const y = 4.6 - Math.sin(u * Math.PI) * 0.7;
      bulbPts.push(x, y, z);
    }
  }
  const bulbGeo = new THREE.BufferGeometry();
  bulbGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bulbPts), 3));
  const bulbs = new THREE.Points(bulbGeo, new THREE.PointsMaterial({
    color: 0xffca7a, size: 0.55, sizeAttenuation: true,
  }));
  plaza.add(bulbs);
  // the market's own warm light, so the plaza glows after dark
  const glow1 = new THREE.PointLight(0xffb36b, 300, 78, 1.8);
  glow1.position.set(marketC.x, 7.5, marketC.z);
  plaza.add(glow1);
  const glow2 = new THREE.PointLight(0xff9d5c, 170, 58, 1.8);
  glow2.position.set(marketC.x + 24, 6, marketC.z + 14);
  plaza.add(glow2);
  group.add(plaza);

  // glowing pickup marker ring (missions move it around)
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 11, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc94d, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  marker.position.set(-224, 5.5, -224);
  group.add(marker);

  scene.add(group);

  return {
    group, colliders, marker,
    update(dt, t) {
      seaMat.emissiveIntensity = 0.7 + Math.sin(t * 0.7) * 0.15;
      foam.position.x = BEACH_X + 38 + Math.sin(t * 0.5) * 1.6;
      marker.material.opacity = 0.15 + Math.sin(t * 2.4) * 0.06;
      marker.rotation.y += dt * 0.4;
    },
  };
}

// Push a point (with radius r) out of every building AABB; returns true on hit.
export function resolveCollisions(colliders, pos, r) {
  let hit = false;
  for (const c of colliders) {
    if (pos.x > c.x0 - r && pos.x < c.x1 + r && pos.z > c.z0 - r && pos.z < c.z1 + r) {
      const dxl = pos.x - (c.x0 - r), dxr = (c.x1 + r) - pos.x;
      const dzl = pos.z - (c.z0 - r), dzr = (c.z1 + r) - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.x0 - r;
      else if (m === dxr) pos.x = c.x1 + r;
      else if (m === dzl) pos.z = c.z0 - r;
      else pos.z = c.z1 + r;
      hit = true;
    }
  }
  if (pos.x > WORLD_EDGE - 2) pos.x = WORLD_EDGE - 2;
  if (pos.x < -338) pos.x = -338;
  if (pos.z > 334) pos.z = 334;
  if (pos.z < -334) pos.z = -334;
  return hit;
}
