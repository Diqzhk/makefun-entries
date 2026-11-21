// vehicles.js — Solmara's cars and one motorcycle: five named models built from
// boxes and cylinders, glow sprites for the lights, arcade traffic that runs
// the road grid, and impact damage.
import * as THREE from 'three';
import { ROAD_CENTERS, resolveCollisions } from './world.js';

export const MODELS = {
  spyder:      { name: 'Vela GT Spyder', color: 0xc22430, len: 4.4, wid: 1.9, top: 34, convertible: true },
  coupe:       { name: 'Solano Coupe',   color: 0x2e6fd8, len: 4.2, wid: 1.8, top: 31 },
  sedan:       { name: 'Brisa Sedan',    color: 0xb9bec6, len: 4.5, wid: 1.85, top: 28 },
  interceptor: { name: 'PD Interceptor', color: 0xf0f2f4, len: 4.6, wid: 1.9, top: 36, police: true },
  bike:        { name: 'Kite 250R',      color: 0x27ae60, len: 2.1, wid: 0.7, top: 33, bike: true },
};

let glowTex = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function glowSprite(color, sx, sy) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(), color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.set(sx, sy, 1);
  return s;
}

function wheel(r, w) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, w, 10),
    new THREE.MeshLambertMaterial({ color: 0x14161a }),
  );
  m.rotation.z = Math.PI / 2;
  return m;
}

export function buildVehicleMesh(key) {
  const spec = MODELS[key];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: spec.color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2129 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fc4dd, shininess: 90 });
  if (spec.bike) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 1.9), paint);
    body.position.y = 0.62;
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.7),
      new THREE.MeshLambertMaterial({ color: spec.color }));
    tank.position.set(0, 0.85, -0.1);
    const wf = wheel(0.33, 0.09); wf.position.set(0, 0.33, 0.85);
    const wb = wheel(0.33, 0.09); wb.position.set(0, 0.33, -0.85);
    const light = glowSprite(0xfff2c0, 0.8, 0.8); light.position.set(0, 0.7, 1.05);
    g.add(body, tank, wf, wb, light);
    return g;
  }
  const L = spec.len, W = spec.wid;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.55, L), paint);
  body.position.y = 0.55;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.3, 0.7), paint);
  nose.position.set(0, 0.42, L / 2 - 0.2);
  g.add(nose);
  if (spec.convertible) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.3, 1.6), dark);
    seat.position.set(0, 0.85, -0.3);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.5, 0.08), glass);
    shield.position.set(0, 1.0, 0.62);
    shield.rotation.x = -0.25;
    const roll = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.16, 0.3), paint);
    roll.position.set(0, 1.0, -1.15);
    g.add(seat, shield, roll);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.5, L * 0.45), glass);
    cabin.position.set(0, 1.05, -0.15);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.09, L * 0.4), paint);
    roof.position.set(0, 1.33, -0.15);
    g.add(cabin, roof);
  }
  if (spec.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.2, L * 0.96), dark);
    stripe.position.y = 0.62;
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.34), dark);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.x = 0.3;
    bar.add(base, red, blue);
    bar.position.set(0, 1.48, -0.15);
    g.add(stripe, bar);
    g.userData.lightBar = bar;
  }
  // sport trim: rear spoiler on the fun ones
  if (key === 'spyder' || key === 'coupe') {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.07, 0.34), dark);
    sp.position.set(0, 1.02, -L / 2 + 0.25);
    g.add(sp);
  }
  const wr = spec.len > 4.3 ? 0.37 : 0.34;
  for (const [wx, wz] of [[-W / 2, L / 2 - 0.8], [W / 2, L / 2 - 0.8], [-W / 2, -L / 2 + 0.8], [W / 2, -L / 2 + 0.8]]) {
    const w = wheel(wr, 0.24);
    w.position.set(wx, wr, wz);
    g.add(w);
  }
  const hl = glowSprite(0xffeeb8, 1.5, 0.8); hl.position.set(0, 0.6, L / 2 + 0.25);
  const tl = glowSprite(0xff3524, 1.4, 0.6); tl.position.set(0, 0.66, -L / 2 - 0.22);
  g.add(hl, tl);
  return g;
}

let vehicleSeq = 0;
export function createVehicle(scene, key, x, z, heading) {
  const mesh = buildVehicleMesh(key);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const v = {
    id: vehicleSeq++,
    key, spec: MODELS[key], name: MODELS[key].name,
    mesh, pos: mesh.position, heading, speed: 0,
    damage: 0, driver: null, ai: null, dead: false,
    radius: MODELS[key].bike ? 0.9 : 2.1,
    applyImpact(amount) {
      this.damage = Math.min(100, this.damage + amount);
    },
    syncMesh() {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.heading;
    },
  };
  return v;
}

// Traffic: each car owns a lane on one axis and cruises; at crossings it may
// turn onto the cross street. Cars slow for the vehicle ahead of them.
export function makeTrafficCar(scene, rng) {
  const keys = ['sedan', 'coupe', 'sedan', 'coupe', 'bike'];
  const key = keys[Math.floor(rng() * keys.length)];
  const axis = rng() < 0.5 ? 'x' : 'z';
  const line = ROAD_CENTERS[Math.floor(rng() * ROAD_CENTERS.length)];
  const dir = rng() < 0.5 ? 1 : -1;
  const along = -320 + rng() * 640;
  const laneOff = dir > 0 ? 3.6 : -3.6;
  const x = axis === 'z' ? line + laneOff : along;
  const z = axis === 'z' ? along : line + laneOff;
  const heading = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const v = createVehicle(scene, key, x, z, heading);
  v.ai = { axis, line, dir, cruise: 8.5 + rng() * 4.5, turnCooldown: 0 };
  v.speed = v.ai.cruise;
  return v;
}

export function updateTrafficCar(v, dt, all, colliders, rng) {
  const ai = v.ai;
  if (!ai) return;
  // find the car ahead in the same lane
  let ahead = Infinity;
  for (const o of all) {
    if (o === v || o.dead) continue;
    const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
    const fwd = ai.axis === 'z' ? dz * ai.dir : dx * ai.dir;
    const lat = ai.axis === 'z' ? Math.abs(dx) : Math.abs(dz);
    if (fwd > 0 && fwd < ahead && lat < 2.4) ahead = fwd;
  }
  const target = ahead < 9 ? Math.max(0, (ahead - 5) * 1.2) : ai.cruise;
  v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), dt * 6);
  const step = v.speed * ai.dir * dt;
  if (ai.axis === 'z') v.pos.z += step; else v.pos.x += step;
  ai.turnCooldown -= dt;
  // maybe turn at a crossing: the cross street's centre becomes the new line
  const along = ai.axis === 'z' ? v.pos.z : v.pos.x;
  for (const c of ROAD_CENTERS) {
    if (Math.abs(along - c) < 1.6 && ai.turnCooldown <= 0 && rng() < 0.35) {
      ai.axis = ai.axis === 'z' ? 'x' : 'z';
      ai.line = c;
      ai.dir = rng() < 0.5 ? 1 : -1;
      ai.turnCooldown = 4;
      const laneOff = ai.dir > 0 ? 3.6 : -3.6;
      if (ai.axis === 'z') v.pos.x = c + laneOff;
      else v.pos.z = c + laneOff;
      break;
    }
  }
  // wrap at the world edge
  if (v.pos.x > 330) v.pos.x = -330;
  if (v.pos.x < -330) v.pos.x = 330;
  if (v.pos.z > 330) v.pos.z = -330;
  if (v.pos.z < -330) v.pos.z = 330;
  v.heading = ai.axis === 'z' ? (ai.dir > 0 ? 0 : Math.PI) : (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  resolveCollisions(colliders, v.pos, v.radius * 0.6);
  v.syncMesh();
}

// Arcade driving for whoever sits in the driver's seat (player or police AI
// sets speed/heading directly; this helper is the player's).
export function driveStep(v, dt, throttle, steer, brake) {
  const spec = v.spec;
  const accel = throttle > 0 ? 13 : 0;
  const maxF = spec.top * (1 - v.damage / 260);
  if (throttle > 0) v.speed = Math.min(maxF, v.speed + accel * dt);
  else if (brake) v.speed = Math.max(-8, v.speed - 18 * dt);
  else {
    // engine braking / rolling drag
    v.speed -= v.speed * 0.55 * dt;
    if (Math.abs(v.speed) < 0.05) v.speed = 0;
  }
  if (v.speed !== 0) {
    const turnRate = steer * 1.65 * Math.min(1, Math.abs(v.speed) / 7) * (v.speed < 0 ? -1 : 1);
    v.heading += turnRate * dt * (spec.bike ? 1.35 : 1);
  }
  v.pos.x += Math.sin(v.heading) * v.speed * dt;
  v.pos.z += Math.cos(v.heading) * v.speed * dt;
}
