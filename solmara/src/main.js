// main.js — SOLMARA HEAT: boot, the loop, the sun, the camera, the input, and
// every system wired into one game. Reno's city runs from here.
import * as THREE from 'three';
import { buildWorld, districtAt, resolveCollisions, PLACES } from './world.js';
import { createPlayer } from './player.js';
import { createVehicle, makeTrafficCar, updateTrafficCar, driveStep } from './vehicles.js';
import { createPolice } from './police.js';
import { createPedestrians } from './pedestrians.js';
import { createMissions, MISSIONS } from './missions.js';
import { createAudio } from './audio.js';
import { createWeapons } from './weapons.js';
import { createCrew } from './crew.js';
import { createDialogue } from './dialogue.js';
import { createParticles } from './particles.js';
import { createHud } from './hud.js';
import { createCareer } from './stats.js';
import { loadSave, writeSave } from './save.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 7);

// deterministic RNG (mulberry32) so staged scenes and traffic are repeatable
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed * 1000 + 17);

// ---------- renderer / scene ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8906a, 130, 460);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0xbdd7ee, 0x4a3b2c, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
scene.add(sun); scene.add(sun.target);

// ---------- the game object ----------
const G = {
  scene, state: shotName ? 'play' : 'menu',
  gameTime: 17.0, cash: 250, respect: 0,
  career: createCareer(),
  flags: { badgeScan: 0 },
  statsOpen: false, frozen: !!shotName,
  stagedStats: null, standingOverride: null,
  mapUnitsOverride: null, objectiveOverride: null,
  districtName: 'City Centre', standing: 40,
  currentVehicle: null, inVehicle: false,
  camOverride: null, camYaw: Math.PI * 0.75,
};
window.__game = G;

const world = buildWorld(scene, rng);
G.world = world;
G.player = createPlayer(scene);
G.police = createPolice(scene);
G.peds = createPedestrians(scene, rng, 42);
G.particles = createParticles(scene);
G.audio = createAudio();
G.weapons = createWeapons();
G.dialogue = createDialogue({
  box: document.getElementById('dialogue'),
  portrait: document.getElementById('dlgPortrait'),
  name: document.getElementById('dlgName'),
  text: document.getElementById('dlgText'),
});

const vehicles = [];
G.spawnVehicle = (key, x, z, heading) => {
  const v = createVehicle(scene, key, x, z, heading);
  vehicles.push(v);
  return v;
};
G.setInVehicle = (v) => {
  G.currentVehicle = v;
  G.inVehicle = true;
  G.player.setVisible(false);
  if (!v.stolenCounted) {
    v.stolenCounted = true;
    if (v.ai) { v.ai = null; }
    G.career.carsStolen++;
    G.player.stats.carsStolen++;
    G.police.addCrime(0.55);
  }
  G.audio.engineStart();
};
function exitVehicle() {
  const v = G.currentVehicle;
  if (!v) return;
  G.currentVehicle = null;
  G.inVehicle = false;
  G.player.pos.set(v.pos.x + Math.cos(v.heading) * 2.2, 0, v.pos.z - Math.sin(v.heading) * 2.2);
  G.player.heading = v.heading;
  G.player.setVisible(true);
  G.audio.engineStop();
}
G.setTime = (h) => { G.gameTime = h; };
G.setCamera = (pos, look) => {
  G.camOverride = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) };
};
G.mapUnits = () => G.mapUnitsOverride ??
  [...G.police.units, ...G.police.blockers].map((v) => ({ x: v.pos.x, z: v.pos.z, kind: 'cop' }));
G.objectivePos = () => G.objectiveOverride ?? G.missions?.target() ?? null;

// ---------- missions / crew / hud ----------
G.missions = createMissions({
  setMarker(x, z) {
    if (x === null || x === undefined) world.marker.visible = false;
    else { world.marker.visible = true; world.marker.position.set(x, 5.5, z); }
  },
  dialogue: G.dialogue,
  audio: G.audio,
  career: G.career,
  playerPos: () => G.player.pos,
  onTaxiPaid(fare, tip) {
    G.cash += fare + (tip || 0);
    G.career.taxiRun++;
    G.career.taxiEarned += fare + (tip || 0);
    G.audio.cash();
    if (tip) G.dialogue.show('Reno', `Fast and clean — the fare tipped $${tip} on top.`);
  },
  onMissionPaid(m, bonus) {
    G.cash += m.pay + bonus;
    G.respect += m.respect;
    G.audio.cash();
    if (bonus > 0) G.dialogue.show(m.contact, `Clean run — $${bonus} bonus on top. ${m.title} is done.`);
    else G.dialogue.show(m.contact, `${m.title} is done. $${m.pay} wired, respect earned.`);
  },
});
G.crew = createCrew({
  police: G.police,
  currentVehicle: () => G.currentVehicle,
  dialogue: G.dialogue,
  audio: G.audio,
  flags: G.flags,
});
G.hud = createHud(G);

// ---------- traffic & parked cars ----------
for (let i = 0; i < 14; i++) vehicles.push(makeTrafficCar(scene, rng));
const parkedSpots = [
  ['sedan', -46, -108, 0], ['coupe', 66, 108, Math.PI], ['sedan', 118, -46, Math.PI / 2],
  ['coupe', -118, 62, -Math.PI / 2], ['sedan', 174, 118, Math.PI], ['bike', -160, -118, 0.4],
  ['sedan', 46, 232, 0], ['coupe', -232, -62, Math.PI / 2], ['sedan', 232, -118, Math.PI],
];
for (const [key, x, z, h] of parkedSpots) G.spawnVehicle(key, x, z, h);
G.spawnVehicle('spyder', -227.6, -200, Math.PI); // Reno's ride, parked on the Hideout's street

// ---------- save ----------
const saved = loadSave();
G.cash = saved.cash; G.respect = saved.respect;
Object.assign(G.career, saved.career);
saved.storyDone.forEach((id) => G.missions.markDone(id));
G.audio.setStation(saved.station || 0);
let saveT = 0;
function autosave(dt) {
  saveT -= dt;
  if (saveT > 0 || G.frozen) return;
  saveT = 15;
  writeSave({
    cash: G.cash, respect: G.respect, station: G.audio.stationIndex,
    storyDone: MISSIONS.filter((m) => G.missions.isDone(m.id)).map((m) => m.id),
    career: G.career,
  });
}

// ---------- sun & sky ----------
const SKY = [
  [0.0, 0x0a1020, 0.12, 0x33415e, 0.25], [5.0, 0x0d1424, 0.12, 0x33415e, 0.25],
  [7.0, 0x8d9bb5, 0.55, 0xd9b48c, 0.55], [10.0, 0x8ec9e8, 1.25, 0xfff2d0, 0.8],
  [15.5, 0x9fd0ec, 1.35, 0xffeec4, 0.9], [17.5, 0xf2a56b, 1.5, 0xffc478, 0.95],
  [18.8, 0xd96a4a, 0.9, 0xff9d5c, 0.7], [19.8, 0x57406e, 0.35, 0xb98ac9, 0.4],
  [21.0, 0x0d1424, 0.12, 0x33415e, 0.25], [24.0, 0x0a1020, 0.12, 0x33415e, 0.25],
];
const cA = new THREE.Color(), cB = new THREE.Color();
function applySky() {
  const h = G.gameTime % 24;
  let i = 0;
  while (i + 1 < SKY.length && SKY[i + 1][0] <= h) i++;
  const a = SKY[i], b = SKY[Math.min(i + 1, SKY.length - 1)];
  const span = Math.max(0.001, b[0] - a[0]);
  const u = Math.min(1, Math.max(0, (h - a[0]) / span));
  cA.setHex(a[1]); cB.setHex(b[1]);
  scene.background = cA.clone().lerp(cB, u);
  scene.fog.color.copy(scene.background);
  sun.intensity = a[2] + (b[2] - a[2]) * u;
  cA.setHex(a[3]); cB.setHex(b[3]);
  sun.color.copy(cA.lerp(cB, u));
  hemi.intensity = a[4] + (b[4] - a[4]) * u;
  const sunAng = ((h - 6) / 12) * Math.PI;
  const px = G.player.pos.x, pz = G.player.pos.z;
  sun.position.set(px + Math.cos(sunAng) * 260, Math.max(18, Math.sin(sunAng) * 240), pz + 90);
  sun.target.position.set(px, 0, pz);
}

// ---------- input ----------
const keys = new Set();
let mouseDown = false;
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    if (G.state === 'play') {
      G.statsOpen = !G.statsOpen;
      G.hud.els.stats.classList.toggle('hidden', !G.statsOpen);
      if (G.statsOpen) G.hud.renderStats();
    }
    return;
  }
  keys.add(e.code);
  if (e.code === 'KeyP' && (G.state === 'play' || G.state === 'pause')) { togglePause(); return; }
  if (G.state !== 'play' || G.statsOpen) return;
  if (e.code === 'KeyE') { interact(); return; }
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 5) G.weapons.select(n - 1);
  }
  if (e.code === 'KeyQ' || e.code === 'KeyZ' || e.code === 'KeyC') {
    const m = G.crew.byKey(e.code.slice(3));
    if (m) G.crew.use(m.id);
  }
  if (e.code === 'KeyR' && G.inVehicle) {
    const st = G.audio.nextStation();
    G.dialogue.show('Reno', `${st.name} — ${st.tag}`);
  }
  if (e.code === 'KeyT' && !G.inVehicle) {
    const dest = PLACES[Math.floor(rng() * PLACES.length)];
    G.missions.startTaxi(dest);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('mousedown', () => {
  if (G.state === 'menu') { startGame(); return; }
  mouseDown = true;
});
addEventListener('mouseup', () => { mouseDown = false; });
document.getElementById('menu').addEventListener('mousedown', () => {
  if (G.state === 'menu') startGame();
});

function togglePause() {
  if (G.state === 'play') {
    G.state = 'pause';
    document.getElementById('pauseOverlay').classList.remove('hidden');
  } else if (G.state === 'pause') {
    G.state = 'play';
    document.getElementById('pauseOverlay').classList.add('hidden');
  }
}

function interact() {
  if (G.inVehicle) { exitVehicle(); return; }
  let best = null, bestD = 3.4;
  for (const v of [...vehicles, ...G.police.units]) {
    const d = Math.hypot(v.pos.x - G.player.pos.x, v.pos.z - G.player.pos.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  if (best) G.setInVehicle(best);
}

function startGame() {
  G.audio.init();
  G.audio.click();
  G.state = 'play';
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('mapBox').classList.remove('hidden');
  document.getElementById('vitals').classList.remove('hidden');
  if (!G.missions.current) G.missions.startNext();
}

// ---------- combat ----------
let lastShotAt = -9;
function tryShoot(now) {
  const def = G.weapons.currentDef();
  if (now - lastShotAt < def.cooldown) return;
  if (G.weapons.fire(0) !== 'ok') { G.audio.click(); lastShotAt = now; return; }
  lastShotAt = now;
  const p = G.player;
  const origin = G.inVehicle ? G.currentVehicle.pos : p.pos;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const baseAng = Math.atan2(dir.x, dir.z);
  if (def.id !== 'fists') {
    G.audio.shot();
    G.career.shotsFired++; p.stats.shotsFired++;
    G.particles.sparks(origin.x + dir.x * 1.2, 1.35, origin.z + dir.z * 1.2, 3);
  }
  let best = null, bestScore = Infinity;
  const consider = (pos, radius, kind, ref) => {
    const dx = pos.x - origin.x, dz = pos.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > def.range + radius) return;
    let diff = Math.abs(Math.atan2(dx, dz) - baseAng);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const score = diff * 10 + dist * 0.02;
    if (diff < 0.42 && score < bestScore) { bestScore = score; best = { kind, ref, dist }; }
  };
  for (const ped of G.peds.list) if (ped.mode !== 'down') consider(ped.pos, 0.5, 'ped', ped);
  for (const v of [...vehicles, ...G.police.units, ...G.police.blockers]) {
    if (v !== G.currentVehicle) consider(v.pos, v.radius, 'vehicle', v);
  }
  if (!best) return;
  if (best.kind === 'ped') {
    G.peds.knockDown(best.ref);
    G.police.addCrime(0.7);
    G.particles.dust(best.ref.pos.x, 0.6, best.ref.pos.z, 5);
  } else {
    best.ref.applyImpact(def.damage * 0.45);
    G.particles.sparks(best.ref.pos.x, 0.8, best.ref.pos.z, 9);
    G.police.addCrime(best.ref.isPolice ? 0.85 : 0.4);
  }
}

// ---------- consequences ----------
function onBusted() {
  G.career.busted++;
  const fine = Math.min(G.cash, 150);
  G.cash -= fine;
  G.police.clear();
  if (G.inVehicle) exitVehicle();
  const spd = PLACES.find((p) => p.id === 'spd');
  G.player.pos.set(spd.x + 6, 0, spd.z + 6);
  G.hud.flash('BUSTED', `The SPD impounds your pride and $${fine}. Released at the station steps.`);
  G.audio.blip(196);
}
function onWasted() {
  G.career.wasted++;
  const bill = Math.min(G.cash, 120);
  G.cash -= bill;
  G.police.clear();
  if (G.inVehicle) exitVehicle();
  const hosp = PLACES.find((p) => p.id === 'hospital');
  G.player.pos.set(hosp.x + 6, 0, hosp.z + 6);
  G.player.health = 60;
  G.hud.flash('WASTED', `You wake up outside the hospital, $${bill} poorer and very sore.`);
  G.audio.blip(160);
}

// ---------- the loop ----------
const clockT = new THREE.Clock();
let elapsed = 0, frames = 0;
const camPos = new THREE.Vector3(140, 60, 240);
const camLook = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clockT.getDelta());
  elapsed += dt;
  frames++;
  const now = elapsed;

  if (G.frozen) {
    if (G.inVehicle && G.currentVehicle) {
      G.player.pos.copy(G.currentVehicle.pos);
      G.player.heading = G.currentVehicle.heading;
    }
    world.update(dt, elapsed);
    const d0 = districtAt(G.player.pos.x, G.player.pos.z);
    G.districtName = d0.name;
    if (G.standingOverride !== null) G.standing = G.standingOverride;
    if (G.camOverride) {
      camera.position.copy(G.camOverride.pos);
      camera.lookAt(G.camOverride.look);
    }
    applySky();
    G.hud.update(dt);
    renderer.render(scene, camera);
    if (frames > 40) window.__shotReady = true;
    return;
  }

  if (G.state === 'menu') {
    const a = elapsed * 0.045;
    camera.position.set(Math.sin(a) * 190, 58, Math.cos(a) * 190);
    camera.lookAt(0, 6, 0);
    world.update(dt, elapsed);
    applySky();
    renderer.render(scene, camera);
    return;
  }
  if (G.state === 'pause') { renderer.render(scene, camera); return; }

  // time + world life
  G.gameTime = (G.gameTime + dt * (24 / 720)) % 24;
  world.update(dt, elapsed);
  G.peds.update(dt, elapsed);
  G.particles.update(dt);
  G.weapons.tick(dt);
  G.crew.update(dt);
  G.dialogue.update(dt);
  G.flags.badgeScan = Math.max(0, (G.flags.badgeScan || 0) - dt);
  applySky();
  autosave(dt);

  const p = G.player;
  const spdRef = { speed: 0 };

  if (G.inVehicle) {
    const v = G.currentVehicle;
    const throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
    const brake = keys.has('KeyS') || keys.has('ArrowDown');
    const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) -
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    const prevSpeed = v.speed;
    driveStep(v, dt, throttle, steer, brake);
    if (resolveCollisions(world.colliders, v.pos, 1.5)) {
      const impact = Math.abs(prevSpeed);
      if (impact > 5) {
        v.applyImpact(impact * 0.55);
        G.particles.sparks(v.pos.x, 0.7, v.pos.z, 10);
        if (impact > 13) p.hurt(impact * 0.35);
        G.audio.blip(120);
      }
      v.speed = -prevSpeed * 0.28;
    }
    // car-on-car
    for (const o of [...vehicles, ...G.police.units, ...G.police.blockers]) {
      if (o === v) continue;
      const dx = v.pos.x - o.pos.x, dz = v.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz), min = v.radius + o.radius - 0.5;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        v.pos.x += (dx / d) * push; v.pos.z += (dz / d) * push;
        const rel = Math.abs(v.speed - (o.speed || 0));
        if (rel > 4) {
          v.applyImpact(rel * 0.4); o.applyImpact(rel * 0.3);
          G.particles.sparks(v.pos.x, 0.7, v.pos.z, 8);
          if (o.isPolice) G.police.addCrime(0.5);
        }
        v.speed *= 0.55;
      }
    }
    v.syncMesh();
    p.pos.copy(v.pos);
    p.heading = v.heading;
    G.career.distanceDriven += Math.abs(v.speed) * dt;
    if (Math.abs(v.speed) > 6 && rng() < dt * 6) {
      G.particles.exhaust(v.pos.x - Math.sin(v.heading) * 2.2, 0.45, v.pos.z - Math.cos(v.heading) * 2.2);
    }
    G.audio.engineUpdate(v.speed / v.spec.top, dt);
    spdRef.speed = Math.abs(v.speed);
    // running a pedestrian down is a crime with a face
    for (const ped of G.peds.list) {
      if (ped.mode === 'down') continue;
      if (Math.abs(v.speed) > 5 && Math.hypot(ped.pos.x - v.pos.x, ped.pos.z - v.pos.z) < 1.8) {
        G.peds.knockDown(ped);
        G.police.addCrime(1.0);
      }
    }
  } else {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const dirX = Math.sin(G.camYaw), dirZ = Math.cos(G.camYaw);
    const rightX = dirZ, rightZ = -dirX;
    p.update(dt, dirX * f + rightX * s, dirZ * f + rightZ * s,
      keys.has('ShiftLeft') || keys.has('ShiftRight'), world.colliders);
    // the camera yaw drifts to rest behind Reno
    let diff = p.heading - G.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (p.moving) G.camYaw += diff * Math.min(1, dt * 3.2);
    spdRef.speed = 0;
  }

  // traffic
  for (const v of vehicles) if (v.ai) updateTrafficCar(v, dt, vehicles, world.colliders, rng);

  // police
  const anyNear = G.police.units.some((u) => Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 78);
  G.police.update(dt, {
    pos: p.pos, speed: spdRef.speed,
    heading: G.inVehicle ? G.currentVehicle.heading : p.heading,
    visible: anyNear,
  }, world.colliders, rng, onBusted);

  // missions
  if (!G.statsOpen) G.missions.update(dt, p.pos);
  if (p.health <= 0) onWasted();

  // shooting (held mouse auto-fires the automatics)
  if (mouseDown && !G.statsOpen) {
    const def = G.weapons.currentDef();
    if (def.id === 'smg' || def.id === 'ar' || keys.has('ControlLeft')) tryShoot(now);
  }

  // district + standing
  const d = districtAt(p.pos.x, p.pos.z);
  G.districtName = d.name;
  if (G.standingOverride === null) {
    G.standing = Math.min(100, 22 + G.respect / 28 + G.missions.doneCount() * 7);
  } else G.standing = G.standingOverride;

    // camera
    if (G.camOverride) {
      camera.position.copy(G.camOverride.pos);
      camera.lookAt(G.camOverride.look);
      if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
    } else if (G.inVehicle) {
      // the world leans in as the speed climbs: FOV breathes with velocity
      const ratio = Math.min(1, Math.abs(G.currentVehicle.speed) / G.currentVehicle.spec.top);
      const fov = 58 + ratio * 9;
      if (Math.abs(camera.fov - fov) > 0.15) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const v = G.currentVehicle;
    const back = v.spec.bike ? 6.4 : 9.6, up = v.spec.bike ? 2.6 : 3.7;
    camPos.set(
      v.pos.x - Math.sin(v.heading) * back, up,
      v.pos.z - Math.cos(v.heading) * back,
    );
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 5));
    camLook.set(v.pos.x + Math.sin(v.heading) * 6, 1.3, v.pos.z + Math.cos(v.heading) * 6);
    camera.lookAt(camLook);
  } else {
    if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
    camPos.set(
      p.pos.x - Math.sin(G.camYaw) * 6.4, 3.0,
      p.pos.z - Math.cos(G.camYaw) * 6.4,
    );
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 6));
    camLook.set(
      p.pos.x + Math.sin(G.camYaw) * 3.4, 1.55,
      p.pos.z + Math.cos(G.camYaw) * 3.4,
    );
    camera.lookAt(camLook);
  }

  G.hud.update(dt);
  renderer.render(scene, camera);
}

// click-to-shoot as discrete shots for the semi-autos
canvas.addEventListener('mousedown', () => {
  if (G.state === 'play' && !G.statsOpen && !G.frozen) tryShoot(elapsed);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- staged boot ----------
if (shotName) {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('mapBox').classList.remove('hidden');
  document.getElementById('vitals').classList.remove('hidden');
  if (G.statsOpen) G.hud.els.stats.classList.remove('hidden');
  applyShot(G, shotName);
  if (G.statsOpen) {
    G.hud.els.stats.classList.remove('hidden');
    G.hud.renderStats();
  }
  applySky();
}

frame();
