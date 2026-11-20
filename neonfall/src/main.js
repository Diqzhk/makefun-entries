// NEONFALL — a neon arena survival shooter.
// Canvas 2D, ES modules, zero network requests, zero external assets:
// every shape is drawn in code and every sound is synthesized (audio.js).
//
// Survive five escalating waves of geometric hostiles, harvest XP shards,
// choose upgrades, and bring down the Hexagon Prime at wave 5.
// Lose all hull and the signal is lost.
//
// Screenshot / staging mode: ?shot=menu|play|levelup|boss&seed=N runs the
// real simulation under a seeded RNG with a fixed timestep and stages a
// representative scene (with an autopilot flying the ship) for capture.

import { initAudio, toggleMute, isMuted, sfx } from './audio.js';

// ---------------------------------------------------------------- RNG ----
// Mulberry32: small, fast, deterministic. All gameplay randomness flows
// through this one generator so seeded runs are reproducible.
class RNG {
  constructor(seed) { this.s = seed >>> 0; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

// ------------------------------------------------------------- helpers ----
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};
const fmtScore = (n) => String(Math.floor(n)).padStart(6, '0');

// -------------------------------------------------------- shot staging ----
const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot'); // null | 'menu' | 'play' | 'levelup' | 'boss'
const SHOT_SEED = Number.parseInt(params.get('seed') || '1', 10) || 1;
const rng = new RNG(
  SHOT ? SHOT_SEED >>> 0 : ((Date.now() % 2147483647) ^ 0x85ebca6b) >>> 0,
);

// -------------------------------------------------------------- canvas ----
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
let W = 0; // viewport size in CSS pixels (the arena is the window)
let H = 0;
let DPR = 1;
let vignette = null; // cached radial gradient, rebuilt on resize

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vignette.addColorStop(0, 'rgba(2,3,10,0)');
  vignette.addColorStop(1, 'rgba(2,3,10,0.55)');
  if (player) {
    player.x = clamp(player.x, player.r, W - player.r);
    player.y = clamp(player.y, player.r, H - player.r);
  }
}
window.addEventListener('resize', resize);

// --------------------------------------------------------------- input ----
const keys = new Set();
const mouse = { x: 0, y: 0, down: false };

function userGesture() {
  initAudio(); // WebAudio may only start after a gesture
}

window.addEventListener('keydown', (e) => {
  userGesture();
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  handleKeyPress(k);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  keys.clear();
  mouse.down = false;
  if (G.state === 'playing') setPaused(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing') setPaused(true);
});
canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
canvas.addEventListener('mousedown', (e) => {
  userGesture();
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.down = true;
  handleClick(e.clientX, e.clientY);
});
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('touchstart', (e) => {
  userGesture();
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; mouse.down = true; handleClick(t.clientX, t.clientY); }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', () => { mouse.down = false; });

// ----------------------------------------------------------- background ---
// Three star layers in a wrapping tile, parallaxed against the player's
// offset from the arena centre; plus a faint drifting grid.
const STAR_TILE = 1024;
const starLayers = [];
{
  const srng = new RNG(1337);
  const defs = [
    { n: 80, f: 0.10, r: 1.0, a: 0.5 },
    { n: 55, f: 0.22, r: 1.5, a: 0.7 },
    { n: 32, f: 0.40, r: 2.2, a: 0.95 },
  ];
  for (const d of defs) {
    const stars = [];
    for (let i = 0; i < d.n; i++) {
      stars.push({ x: srng.range(0, STAR_TILE), y: srng.range(0, STAR_TILE), tw: srng.range(0, TAU) });
    }
    starLayers.push({ ...d, stars });
  }
}

// ---------------------------------------------------------------- state ---
const STEP = 1 / 60; // fixed simulation timestep
const G = {
  state: 'menu', // menu | playing | levelup | paused | gameover | victory
  t: 0, // global animation clock (always runs)
  time: 0, // survival timer (runs while playing)
  wave: 0,
  score: 0,
  kills: 0,
  endless: false,
  autopilot: false,
  queue: [], // enemy types waiting to spawn this wave
  spawnT: 0,
  spawnInterval: 1,
  betweenT: 0, // intermission timer between waves
  trickleT: 0, // boss-wave minion trickle
  boss: null,
  bossAlive: false,
  trauma: 0, // screen shake energy
  hurtFlash: 0,
  announce: { title: '', sub: '', t: 0, dur: 0 },
  cards: [], // level-up card hit-rects
  buttons: [], // menu / end-screen button hit-rects
  choices: [], // current level-up upgrade picks
  finalStats: null,
};

const bullets = []; // player projectiles
const ebullets = []; // enemy projectiles
const enemies = [];
const gems = []; // XP shards
const parts = []; // particles
const floats = []; // floating damage numbers
const decor = []; // decorative shapes drifting behind the title screen

const MAX_PARTS = 380;
const MAX_FLOATS = 42;
const MAX_ENEMIES = 70;

// --------------------------------------------------------------- player ---
const SHIELD_RECHARGE = 9;
const player = {
  x: 0, y: 0, vx: 0, vy: 0, r: 14,
  hp: 100, maxHp: 100,
  speed: 265, dmg: 10, fireRate: 4.2, projectiles: 1, magnetR: 95,
  fireCd: 0, invuln: 0, muzzle: 0, aimA: 0,
  shieldOwned: false, shieldUp: false, shieldCd: 0,
  level: 1, xp: 0, xpNeed: xpForLevel(1),
  alive: true,
};

function xpForLevel(level) {
  return 10 + (level - 1) * 7;
}

// --------------------------------------------------------- enemy types ----
const ETYPES = {
  chaser:   { r: 15, hp: 26,   speed: 118, dmg: 10, score: 50,   xp: 1,  color: '#ff2d78' },
  small:    { r: 9,  hp: 10,   speed: 170, dmg: 6,  score: 25,   xp: 1,  color: '#ff7ab0' },
  shooter:  { r: 16, hp: 42,   speed: 96,  dmg: 8,  score: 120,  xp: 3,  color: '#ff9f1c' },
  splitter: { r: 20, hp: 60,   speed: 78,  dmg: 12, score: 100,  xp: 3,  color: '#39ff88' },
  boss:     { r: 62, hp: 1500, speed: 58,  dmg: 20, score: 2000, xp: 40, color: '#ff3355' },
};
const BOLT_DMG = 8;
const BOLT_SPEED = 238;

// ------------------------------------------------------------ fx helpers --
function spawnParticles(x, y, color, n, power = 190, size = 3, dur = 0.55) {
  for (let i = 0; i < n; i++) {
    if (parts.length >= MAX_PARTS) return;
    const a = rng.range(0, TAU);
    const sp = rng.range(power * 0.25, power);
    parts.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      t: 0, dur: rng.range(dur * 0.5, dur),
      size: rng.range(size * 0.5, size * 1.4),
      color,
    });
  }
}

function spawnExplosion(x, y, color, scale = 1) {
  spawnParticles(x, y, color, Math.round(16 * scale), 230 * scale, 3.4, 0.6);
  spawnParticles(x, y, '#ffffff', Math.round(5 * scale), 150 * scale, 2.2, 0.35);
  G.trauma = Math.min(1, G.trauma + 0.16 * scale);
}

function addFloat(x, y, text, color = '#e8fbff', size = 13) {
  if (floats.length >= MAX_FLOATS) floats.shift();
  floats.push({ x: x + rng.range(-6, 6), y, vy: -52, t: 0, dur: 0.8, text, color, size });
}

function announce(title, sub = '', dur = 2.2) {
  G.announce = { title, sub, t: 0, dur };
  if (statusEl) statusEl.textContent = sub ? `${title}. ${sub}` : title;
}

// -------------------------------------------------------------- spawning --
function spawnPos(minPlayerDist = 260) {
  // Just outside a random edge, retried until far enough from the player.
  let x = 0, y = 0;
  for (let i = 0; i < 10; i++) {
    const edge = rng.int(0, 3);
    if (edge === 0) { x = rng.range(0, W); y = -36; }
    else if (edge === 1) { x = rng.range(0, W); y = H + 36; }
    else if (edge === 2) { x = -36; y = rng.range(0, H); }
    else { x = W + 36; y = rng.range(0, H); }
    if (dist2(x, y, player.x, player.y) > minPlayerDist * minPlayerDist) break;
  }
  return { x, y };
}

function hpScale() { return 1 + 0.22 * (G.wave - 1); }
function spdScale() { return Math.min(1.35, 1 + 0.03 * (G.wave - 1)); }

function spawnEnemy(type, x, y) {
  const base = ETYPES[type];
  const e = {
    type, x, y, vx: 0, vy: 0,
    r: base.r,
    hp: Math.round(base.hp * hpScale()),
    maxHp: Math.round(base.hp * hpScale()),
    speed: base.speed * spdScale() * rng.range(0.92, 1.08),
    dmg: base.dmg, score: base.score, xp: base.xp, color: base.color,
    flash: 0, t: rng.range(0, 100), phase: rng.range(0, TAU),
    touchCd: 0, fireCd: rng.range(1.2, 2.6), charge: 0,
    atkT: 2.2, atkCycle: 0, burst: 0, burstT: 0, spiralT: 0, emitT: 0, spiralA: 0,
    rot: rng.range(0, TAU),
  };
  enemies.push(e);
  return e;
}

function spawnBoss() {
  const b = spawnEnemy('boss', W / 2, -80);
  const tier = Math.max(1, Math.round(G.wave / 5));
  b.hp = b.maxHp = Math.round(ETYPES.boss.hp * (1 + 0.6 * (tier - 1)));
  b.x = W / 2;
  b.y = -70;
  G.boss = b;
  G.bossAlive = true;
  sfx.boss();
  announce('WARNING', 'Hexagon Prime is inbound', 2.6);
  return b;
}

function spawnEBullet(x, y, vx, vy) {
  ebullets.push({ x, y, vx, vy, r: 5, life: 6 });
}

function dropGems(x, y, value) {
  let left = value;
  while (left > 0) {
    const v = Math.min(5, left);
    left -= v;
    const a = rng.range(0, TAU);
    const sp = rng.range(30, 150);
    gems.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      value: v, r: 4 + v, t: rng.range(0, TAU),
    });
  }
}

function buildQueue(w) {
  const q = [];
  const push = (t, n) => { for (let i = 0; i < n; i++) q.push(t); };
  let ch = 6 + w * 2;
  let sp = w >= 2 ? 1 + w : 0;
  let sh = w >= 3 ? w - 1 : 0;
  if (w > 5) {
    const m = 1 + (w - 5) * 0.25;
    ch = Math.round(ch * m); sp = Math.round(sp * m); sh = Math.round(sh * m);
  }
  push('chaser', ch); push('splitter', sp); push('shooter', sh);
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = q[i]; q[i] = q[j]; q[j] = tmp;
  }
  return q;
}

function startWave(n) {
  G.wave = n;
  G.betweenT = 0;
  G.trickleT = 0;
  if (n % 5 === 0) {
    G.queue = [];
    spawnBoss();
  } else {
    G.queue = buildQueue(n);
    G.spawnInterval = clamp(1.15 - n * 0.06 - Math.max(0, n - 5) * 0.03, 0.45, 1.15);
    G.spawnT = 0.6;
    announce('WAVE ' + n, n === 1 ? 'Hostiles on the grid' : '', 1.9);
  }
  if (statusEl) statusEl.textContent = 'Wave ' + n;
}

// -------------------------------------------------------------- upgrades --
const UPGRADES = [
  {
    id: 'dmg', name: 'Overcharge Rounds', desc: '+25% bullet damage',
    can: () => true,
    apply: () => { player.dmg *= 1.25; },
  },
  {
    id: 'rate', name: 'Rapid Cycler', desc: '+20% fire rate',
    can: () => true,
    apply: () => { player.fireRate *= 1.2; },
  },
  {
    id: 'speed', name: 'Ion Thrusters', desc: '+12% move speed',
    can: () => true,
    apply: () => { player.speed *= 1.12; },
  },
  {
    id: 'hp', name: 'Hull Plating', desc: '+25 max hull and repair 40',
    can: () => true,
    apply: () => { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 40); },
  },
  {
    id: 'magnet', name: 'Tractor Field', desc: '+60% XP pickup radius',
    can: () => true,
    apply: () => { player.magnetR *= 1.6; },
  },
  {
    id: 'proj', name: 'Split Cannon', desc: '+1 projectile per shot',
    can: () => player.projectiles < 5,
    apply: () => { player.projectiles += 1; },
  },
  {
    id: 'shield', name: 'Aegis Shield', desc: 'Blocks one hit, then recharges',
    can: () => !player.shieldOwned,
    apply: () => { player.shieldOwned = true; player.shieldUp = true; player.shieldCd = 0; },
  },
];

function openLevelUp() {
  const pool = UPGRADES.filter((u) => u.can());
  const picks = [];
  const copy = pool.slice();
  while (picks.length < 3 && copy.length > 0) {
    const i = Math.floor(rng.next() * copy.length);
    picks.push(copy.splice(i, 1)[0]);
  }
  G.choices = picks;
  G.state = 'levelup';
  sfx.levelup();
  announce('LEVEL ' + player.level, 'Choose an upgrade', 1.6);
}

function chooseUpgrade(i) {
  const u = G.choices[i];
  if (!u) return;
  u.apply();
  G.choices = [];
  G.state = 'playing';
  // Chain into another pending level-up if XP still overflows.
  if (player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level += 1;
    player.xpNeed = xpForLevel(player.level);
    openLevelUp();
  }
}

function gainXp(v) {
  player.xp += v;
  if (player.xp >= player.xpNeed && G.state === 'playing') {
    player.xp -= player.xpNeed;
    player.level += 1;
    player.xpNeed = xpForLevel(player.level);
    openLevelUp();
  }
}

// ---------------------------------------------------------------- combat --
function fireBullets() {
  const n = player.projectiles;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 0.085;
    const a = player.aimA + off;
    const sp = 740;
    bullets.push({
      x: player.x + Math.cos(player.aimA) * (player.r + 4),
      y: player.y + Math.sin(player.aimA) * (player.r + 4),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.95, dmg: player.dmg, r: 4,
    });
  }
  player.muzzle = 0.05;
  player.vx -= Math.cos(player.aimA) * 12;
  player.vy -= Math.sin(player.aimA) * 12;
  sfx.shoot();
}

function damageEnemy(e, dmg, ang) {
  e.hp -= dmg;
  e.flash = 0.09;
  addFloat(e.x, e.y - e.r - 4, String(Math.round(dmg)), e.type === 'boss' ? '#ffd7de' : '#e8fbff', e.type === 'boss' ? 15 : 12);
  spawnParticles(e.x, e.y, e.color, 2, 150, 2.4, 0.3);
  if (e.type !== 'boss') {
    e.vx += Math.cos(ang) * 130;
    e.vy += Math.sin(ang) * 130;
  }
  sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  G.kills += 1;
  G.score += e.score;
  const big = e.type === 'boss';
  spawnExplosion(e.x, e.y, e.color, big ? 3.2 : e.type === 'splitter' ? 1.2 : 0.8);
  sfx.explosion(big);
  dropGems(e.x, e.y, e.xp);
  addFloat(e.x, e.y, '+' + e.score, '#ffe066', big ? 22 : 13);
  if (e.type === 'splitter') {
    for (let i = 0; i < 2; i++) {
      const s = spawnEnemy('small', e.x + rng.range(-8, 8), e.y + rng.range(-8, 8));
      const a = rng.range(0, TAU);
      s.vx = Math.cos(a) * 190;
      s.vy = Math.sin(a) * 190;
    }
  }
  if (big) {
    G.boss = null;
    G.bossAlive = false;
    G.trauma = 1;
    for (const b of ebullets) spawnParticles(b.x, b.y, '#ff9f1c', 1, 90, 2.4, 0.35);
    ebullets.length = 0;
    if (G.wave === 5 && !G.endless) winGame();
    else announce('CAPITAL SIGNAL DOWN', 'The arena holds — for now', 2.4);
  }
}

function damagePlayer(dmg, ang) {
  if (!player.alive || player.invuln > 0 || G.state !== 'playing') return;
  if (player.shieldOwned && player.shieldUp) {
    player.shieldUp = false;
    player.shieldCd = SHIELD_RECHARGE;
    player.invuln = 0.7;
    G.trauma = Math.min(1, G.trauma + 0.25);
    spawnParticles(player.x, player.y, '#67e8f9', 16, 240, 2.6, 0.4);
    addFloat(player.x, player.y - 26, 'SHIELD DOWN', '#67e8f9', 13);
    sfx.shieldBreak();
    return;
  }
  player.hp -= dmg;
  player.invuln = 0.6;
  G.hurtFlash = 0.28;
  G.trauma = Math.min(1, G.trauma + 0.38);
  player.vx += Math.cos(ang) * 240;
  player.vy += Math.sin(ang) * 240;
  spawnParticles(player.x, player.y, '#ff5470', 10, 200, 2.6, 0.4);
  sfx.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    gameOver();
  }
}

// ------------------------------------------------------------ game flow ---
function resetRun() {
  bullets.length = 0; ebullets.length = 0; enemies.length = 0;
  gems.length = 0; parts.length = 0; floats.length = 0;
  Object.assign(player, {
    x: W / 2, y: H / 2, vx: 0, vy: 0,
    hp: 100, maxHp: 100, speed: 265, dmg: 10, fireRate: 4.2,
    projectiles: 1, magnetR: 95, fireCd: 0, invuln: 0, muzzle: 0, aimA: -Math.PI / 2,
    shieldOwned: false, shieldUp: false, shieldCd: 0,
    level: 1, xp: 0, xpNeed: xpForLevel(1), alive: true,
  });
  Object.assign(G, {
    time: 0, wave: 0, score: 0, kills: 0, endless: false,
    queue: [], boss: null, bossAlive: false, trauma: 0, hurtFlash: 0,
    betweenT: 0, trickleT: 0, finalStats: null,
  });
}

function startGame() {
  resetRun();
  G.state = 'playing';
  startWave(1);
}

function snapshotStats() {
  return { score: G.score, wave: G.wave, time: G.time, kills: G.kills, level: player.level };
}

function winGame() {
  G.finalStats = snapshotStats();
  G.state = 'victory';
  sfx.victory();
  if (statusEl) statusEl.textContent = 'Victory. Signal restored.';
}

function continueEndless() {
  G.endless = true;
  G.state = 'playing';
  announce('ENDLESS MODE', 'How long can you hold the grid?', 2.4);
  startWave(6);
}

function gameOver() {
  player.alive = false;
  G.finalStats = snapshotStats();
  G.state = 'gameover';
  spawnExplosion(player.x, player.y, '#22d3ee', 2.4);
  sfx.explosion(true);
  sfx.gameover();
  if (statusEl) statusEl.textContent = 'Game over. Signal lost.';
}

function setPaused(on) {
  if (on && G.state === 'playing') G.state = 'paused';
  else if (!on && G.state === 'paused') G.state = 'playing';
}

function handleKeyPress(k) {
  if (k === 'm') { toggleMute(); return; }
  switch (G.state) {
    case 'menu':
      if (k === 'enter' || k === ' ') startGame();
      break;
    case 'playing':
      if (k === 'p' || k === 'escape') setPaused(true);
      break;
    case 'paused':
      if (k === 'p' || k === 'escape' || k === 'enter') setPaused(false);
      break;
    case 'levelup':
      if (k === '1' || k === '2' || k === '3') chooseUpgrade(Number(k) - 1);
      break;
    case 'gameover':
      if (k === 'r' || k === 'enter') startGame();
      break;
    case 'victory':
      if (k === 'c' || k === 'enter') continueEndless();
      else if (k === 'r') startGame();
      break;
  }
}

function handleClick(x, y) {
  if (G.state === 'levelup') {
    for (let i = 0; i < G.cards.length; i++) {
      const c = G.cards[i];
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { chooseUpgrade(i); return; }
    }
    return;
  }
  for (const b of G.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
  }
  if (G.state === 'menu') startGame();
  else if (G.state === 'paused') setPaused(false);
}

// -------------------------------------------------------------- autopilot -
// Used only by the ?shot= staging scenes: flies the ship with the game's own
// movement, aiming and firing systems so staged screenshots are real play.
const pilot = { tx: 0, ty: 0, orbitA: 0 };

function nearestEnemy(x, y) {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function pilotMove(dt) {
  pilot.orbitA += dt * 0.45;
  let tx = W / 2 + Math.cos(pilot.orbitA) * Math.min(230, W * 0.24);
  let ty = H / 2 + Math.sin(pilot.orbitA * 1.3) * Math.min(150, H * 0.2);
  // Repulsion from hostiles and their bolts: simple, effective dodging.
  for (const e of enemies) {
    const d2 = dist2(player.x, player.y, e.x, e.y);
    const safe = (e.r + 120) * (e.r + 120);
    if (d2 < safe && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (1 - d / (e.r + 120)) * 260;
      tx += ((player.x - e.x) / d) * push;
      ty += ((player.y - e.y) / d) * push;
    }
  }
  for (const b of ebullets) {
    const d2 = dist2(player.x, player.y, b.x, b.y);
    if (d2 < 110 * 110 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      tx += ((player.x - b.x) / d) * 90;
      ty += ((player.y - b.y) / d) * 90;
    }
  }
  pilot.tx = clamp(tx, 50, W - 50);
  pilot.ty = clamp(ty, 50, H - 50);
  const dx = pilot.tx - player.x, dy = pilot.ty - player.y;
  const d = Math.hypot(dx, dy);
  if (d < 8) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}

function moveInput(dt) {
  if (G.autopilot) return pilotMove(dt);
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  return { x, y };
}

function aimPos() {
  if (G.autopilot) {
    const t = nearestEnemy(player.x, player.y);
    if (t) return { x: t.x, y: t.y };
  }
  return mouse;
}

function firing() {
  if (G.autopilot) return enemies.length > 0;
  return mouse.down || keys.has(' ');
}

// ---------------------------------------------------------------- update --
function updatePlayer(dt) {
  const m = moveInput(dt);
  const accel = 2500;
  player.vx += m.x * accel * dt;
  player.vy += m.y * accel * dt;
  const fr = Math.exp(-6.5 * dt);
  player.vx *= fr;
  player.vy *= fr;
  const sp = Math.hypot(player.vx, player.vy);
  const max = player.speed * 1.6; // headroom for knockback
  if (sp > max) { player.vx = (player.vx / sp) * max; player.vy = (player.vy / sp) * max; }
  player.x = clamp(player.x + player.vx * dt, player.r, W - player.r);
  player.y = clamp(player.y + player.vy * dt, player.r, H - player.r);

  const aim = aimPos();
  player.aimA = Math.atan2(aim.y - player.y, aim.x - player.x);

  player.fireCd -= dt;
  if (firing() && player.fireCd <= 0) {
    player.fireCd = 1 / player.fireRate;
    fireBullets();
  }
  if (player.invuln > 0) player.invuln -= dt;
  if (player.muzzle > 0) player.muzzle -= dt;
  if (player.shieldOwned && !player.shieldUp) {
    player.shieldCd -= dt;
    if (player.shieldCd <= 0) {
      player.shieldUp = true;
      spawnParticles(player.x, player.y, '#67e8f9', 10, 160, 2.2, 0.35);
      addFloat(player.x, player.y - 26, 'SHIELD ONLINE', '#67e8f9', 12);
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -70 || b.x > W + 70 || b.y < -70 || b.y > H + 70) {
      bullets.splice(i, 1);
    }
  }
  // Player bullets vs enemies.
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const rr = e.r + b.r;
      if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
        damageEnemy(e, b.dmg, Math.atan2(b.vy, b.vx));
        hit = true;
        break;
      }
    }
    if (hit) bullets.splice(i, 1);
  }
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -70 || b.x > W + 70 || b.y < -70 || b.y > H + 70) {
      ebullets.splice(i, 1);
      continue;
    }
    if (player.alive) {
      const rr = player.r + b.r - 2;
      if (dist2(b.x, b.y, player.x, player.y) < rr * rr) {
        damagePlayer(BOLT_DMG, Math.atan2(b.vy, b.vx));
        ebullets.splice(i, 1);
      }
    }
  }
}

function steer(e, tx, ty, dt, strength = 5) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx += ((dx / d) * e.speed - e.vx) * Math.min(1, strength * dt);
  e.vy += ((dy / d) * e.speed - e.vy) * Math.min(1, strength * dt);
}

function bossAttack(b) {
  const kind = b.atkCycle % 4;
  b.atkCycle += 1;
  if (kind === 0) {
    // Radial burst.
    const n = 26;
    const off = rng.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      spawnEBullet(b.x, b.y, Math.cos(a) * BOLT_SPEED, Math.sin(a) * BOLT_SPEED);
    }
    spawnParticles(b.x, b.y, b.color, 10, 160, 2.6, 0.35);
    sfx.explosion(false);
  } else if (kind === 1) {
    // Aimed triple burst (fired over time in updateBoss).
    b.burst = 3;
    b.burstT = 0;
  } else if (kind === 2) {
    // Spawn minions.
    for (let i = 0; i < 3; i++) {
      const m = spawnEnemy(i === 0 ? 'chaser' : 'small', b.x + rng.range(-76, 76), b.y + rng.range(-30, 50));
      m.vx = rng.range(-90, 90);
      m.vy = rng.range(40, 130);
    }
    spawnParticles(b.x, b.y, '#ff7ab0', 12, 170, 2.6, 0.4);
    sfx.explosion(false);
  } else {
    // Rotating spiral emitter.
    b.spiralT = 1.4;
    b.emitT = 0;
    b.spiralA = rng.range(0, TAU);
  }
}

function updateBoss(b, dt) {
  // Drift to a strafing anchor above the player.
  const ax = W / 2 + Math.sin(G.t * 0.35) * Math.min(270, W * 0.27) + (player.x - W / 2) * 0.22;
  const ay = Math.min(195, H * 0.27) + Math.sin(G.t * 0.6) * 44;
  steer(b, ax, ay, dt, 1.6);
  b.rot += dt * 0.5;

  b.atkT -= dt;
  if (b.atkT <= 0 && b.y > 40) {
    bossAttack(b);
    b.atkT = rng.range(1.5, 2.1);
  }
  if (b.burst > 0) {
    b.burstT -= dt;
    if (b.burstT <= 0) {
      b.burst -= 1;
      b.burstT = 0.17;
      const base = Math.atan2(player.y - b.y, player.x - b.x);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.13;
        spawnEBullet(b.x, b.y, Math.cos(a) * (BOLT_SPEED + 26), Math.sin(a) * (BOLT_SPEED + 26));
      }
      sfx.shoot();
    }
  }
  if (b.spiralT > 0) {
    b.spiralT -= dt;
    b.emitT -= dt;
    if (b.emitT <= 0) {
      b.emitT = 0.065;
      b.spiralA += 0.46;
      for (const off of [0, Math.PI]) {
        const a = b.spiralA + off;
        spawnEBullet(b.x, b.y, Math.cos(a) * (BOLT_SPEED - 18), Math.sin(a) * (BOLT_SPEED - 18));
      }
    }
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.touchCd > 0) e.touchCd -= dt;
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.type === 'chaser' || e.type === 'small') {
      const wob = Math.sin(e.t * 3.1 + e.phase) * 26;
      steer(e, player.x + (-dy / d) * wob, player.y + (dx / d) * wob, dt, 4.2);
    } else if (e.type === 'splitter') {
      steer(e, player.x, player.y, dt, 3.2);
      e.rot += dt * 0.9;
    } else if (e.type === 'shooter') {
      const want = 300;
      let tx, ty;
      const strafe = Math.sin(e.phase) > 0 ? 1 : -1;
      if (d > want + 45) { tx = player.x; ty = player.y; }
      else if (d < want - 55) { tx = e.x - dx; ty = e.y - dy; }
      else { tx = e.x + (-dy / d) * strafe * 120; ty = e.y + (dx / d) * strafe * 120; }
      steer(e, tx, ty, dt, 3.4);
      e.rot += dt * 1.4;
      // Telegraph, then fire a bolt at the player.
      e.fireCd -= dt;
      if (e.fireCd < 0.32 && e.fireCd > 0) e.charge = 1 - e.fireCd / 0.32;
      if (e.fireCd <= 0) {
        e.fireCd = rng.range(2.1, 3.0);
        e.charge = 0;
        if (d < 620 && player.alive) {
          spawnEBullet(e.x, e.y, (dx / d) * BOLT_SPEED, (dy / d) * BOLT_SPEED);
          sfx.shoot();
        }
      }
    } else if (e.type === 'boss') {
      updateBoss(e, dt);
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.type !== 'boss') {
      e.x = clamp(e.x, -90, W + 90);
      e.y = clamp(e.y, -90, H + 90);
    } else {
      e.x = clamp(e.x, e.r, W - e.r);
      e.y = clamp(e.y, -90, H - e.r);
    }

    // Contact damage.
    if (player.alive && e.touchCd <= 0) {
      const rr = e.r + player.r - 2;
      if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
        damagePlayer(e.dmg, Math.atan2(dy, dx));
        e.touchCd = 0.85;
        e.vx -= (dx / d) * 160;
        e.vy -= (dy / d) * 160;
      }
    }
  }
  // Gentle separation so hostiles do not stack into one blob.
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.type === 'boss') continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.type === 'boss') continue;
      const rr = a.r + b.r;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = ((rr - d) / d) * 0.5 * 30 * dt;
        const px = (a.x - b.x) * push, py = (a.y - b.y) * push;
        a.x += px; a.y += py;
        b.x -= px; b.y -= py;
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead) enemies.splice(i, 1);
  }
}

function updateGems(dt) {
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    g.t += dt * 3;
    const dx = player.x - g.x, dy = player.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (player.alive && d < player.magnetR) {
      const pull = 640 * (1 - d / player.magnetR) + 210;
      g.vx += (dx / d) * pull * dt * 6;
      g.vy += (dy / d) * pull * dt * 6;
    } else {
      g.vx *= Math.exp(-3.2 * dt);
      g.vy *= Math.exp(-3.2 * dt);
    }
    const sp = Math.hypot(g.vx, g.vy);
    if (sp > 620) { g.vx = (g.vx / sp) * 620; g.vy = (g.vy / sp) * 620; }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (player.alive && d < player.r + 12) {
      gems.splice(i, 1);
      spawnParticles(g.x, g.y, '#a3e635', 3, 110, 2, 0.3);
      sfx.pickup();
      gainXp(g.value);
    }
  }
}

function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.dur) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-2.4 * dt);
    p.vy *= Math.exp(-2.4 * dt);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    f.y += f.vy * dt;
    f.vy *= Math.exp(-1.6 * dt);
    if (f.t >= f.dur) floats.splice(i, 1);
  }
  if (G.trauma > 0) G.trauma = Math.max(0, G.trauma - dt * 1.5);
  if (G.hurtFlash > 0) G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.4);
  if (G.announce.t < G.announce.dur) G.announce.t += dt;
}

function updateSpawning(dt) {
  if (G.queue.length > 0) {
    G.spawnT -= dt;
    if (G.spawnT <= 0 && enemies.length < MAX_ENEMIES) {
      G.spawnT = G.spawnInterval * rng.range(0.75, 1.25);
      const pos = spawnPos();
      spawnEnemy(G.queue.shift(), pos.x, pos.y);
    }
  }
  if (G.bossAlive) {
    // Slow minion trickle while the boss is up.
    G.trickleT += dt;
    if (G.trickleT > 4.5) {
      G.trickleT = 0;
      const minions = enemies.filter((e) => e.type !== 'boss').length;
      if (minions < 5) {
        const pos = spawnPos(300);
        spawnEnemy(rng.chance(0.6) ? 'chaser' : 'small', pos.x, pos.y);
      }
    }
  }
  if (G.queue.length === 0 && enemies.length === 0 && !G.bossAlive) {
    G.betweenT += dt;
    if (G.betweenT > 2.1) startWave(G.wave + 1);
  } else {
    G.betweenT = 0;
  }
}

function tick(dt) {
  G.t += dt;
  switch (G.state) {
    case 'playing':
      G.time += dt;
      updateSpawning(dt);
      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updateGems(dt);
      updateFx(dt);
      break;
    case 'gameover':
    case 'victory':
      updateFx(dt);
      break;
    case 'menu':
      for (const d of decor) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.rs * dt;
        if (d.x < -50) d.x = W + 50;
        if (d.x > W + 50) d.x = -50;
        if (d.y < -50) d.y = H + 50;
        if (d.y > H + 50) d.y = -50;
      }
      updateFx(dt);
      break;
    default:
      break; // paused / levelup: the world holds still
  }
}

// -------------------------------------------------------------- rendering -
const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
let bgCache = { g: null, w: 0, h: 0 };

function bgGradient() {
  if (!bgCache.g || bgCache.w !== W || bgCache.h !== H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070a1d');
    g.addColorStop(0.55, '#05060f');
    g.addColorStop(1, '#030409');
    bgCache = { g, w: W, h: H };
  }
  return bgCache.g;
}

function polyPath(n, r, rot) {
  const p = new Path2D();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
  }
  p.closePath();
  return p;
}

// Layered strokes fake a neon glow without shadowBlur's cost.
function neonPath(path, color, fillA = 0.15) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.15; ctx.lineWidth = 7; ctx.stroke(path);
  ctx.globalAlpha = 0.45; ctx.lineWidth = 3.5; ctx.stroke(path);
  ctx.globalAlpha = fillA; ctx.fillStyle = color; ctx.fill(path);
  ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.stroke(path);
  ctx.restore();
}

function flashPath(path, flash) {
  if (flash <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(flash / 0.09, 0, 1) * 0.85;
  ctx.fillStyle = '#ffffff';
  ctx.fill(path);
  ctx.restore();
}

function text(str, x, y, o = {}) {
  const { size = 14, color = '#e8fbff', font = FONT, weight = 600, align = 'center', alpha = 1, glow = 0 } = o;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = bgGradient();
  ctx.fillRect(0, 0, W, H);
  const camX = player.x - W / 2, camY = player.y - H / 2;
  // Grid.
  const gs = 64;
  const gx = ((-camX * 0.25) % gs + gs) % gs;
  const gy = ((-camY * 0.25) % gs + gs) % gs;
  ctx.save();
  ctx.strokeStyle = 'rgba(45,212,191,0.055)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = gx; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = gy; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();
  // Stars.
  for (const layer of starLayers) {
    const ox = ((-camX * layer.f) % STAR_TILE + STAR_TILE) % STAR_TILE - STAR_TILE;
    const oy = ((-camY * layer.f) % STAR_TILE + STAR_TILE) % STAR_TILE - STAR_TILE;
    ctx.save();
    ctx.fillStyle = '#cfe9ff';
    for (let tx = ox; tx < W; tx += STAR_TILE) {
      for (let ty = oy; ty < H; ty += STAR_TILE) {
        for (const s of layer.stars) {
          const tw = 0.65 + 0.35 * Math.sin(G.t * 1.7 + s.tw);
          ctx.globalAlpha = layer.a * tw;
          ctx.beginPath();
          ctx.arc(tx + s.x, ty + s.y, layer.r, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}

function drawGem(g) {
  ctx.save();
  ctx.translate(g.x, g.y + Math.sin(g.t) * 2);
  ctx.rotate(g.t * 0.4);
  const p = polyPath(4, g.r, 0);
  neonPath(p, g.value >= 5 ? '#d9f99d' : '#a3e635', 0.5);
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.type === 'chaser' || e.type === 'small') {
    const a = Math.atan2(e.vy, e.vx);
    ctx.rotate(a);
    const p = new Path2D();
    p.moveTo(e.r, 0);
    p.lineTo(-e.r * 0.8, e.r * 0.72);
    p.lineTo(-e.r * 0.38, 0);
    p.lineTo(-e.r * 0.8, -e.r * 0.72);
    p.closePath();
    neonPath(p, e.color, 0.22);
    flashPath(p, e.flash);
  } else if (e.type === 'shooter') {
    ctx.rotate(e.rot);
    const p = polyPath(4, e.r, 0);
    neonPath(p, e.color, 0.16);
    flashPath(p, e.flash);
    const inner = polyPath(4, e.r * 0.5, -e.rot * 2.2);
    neonPath(inner, e.color, 0.3);
    if (e.charge > 0) {
      ctx.save();
      ctx.globalAlpha = e.charge;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(0, 0, 3 + e.charge * 5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  } else if (e.type === 'splitter') {
    ctx.rotate(e.rot);
    const p = polyPath(5, e.r, 0);
    neonPath(p, e.color, 0.16);
    flashPath(p, e.flash);
    const inner = polyPath(5, e.r * 0.52, 0.4);
    neonPath(inner, e.color, 0.3);
  } else if (e.type === 'boss') {
    ctx.rotate(e.rot);
    const p = polyPath(6, e.r, 0);
    neonPath(p, e.color, 0.13);
    flashPath(p, e.flash);
    const inner = polyPath(6, e.r * 0.64, -e.rot * 1.6);
    neonPath(inner, '#b537f2', 0.12);
    ctx.save();
    const pulse = 0.75 + 0.25 * Math.sin(G.t * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffd7de';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.16, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Micro HP bar for damaged non-boss hostiles.
  if (e.type !== 'boss' && e.hp < e.maxHp) {
    const w = e.r * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(e.x - e.r, e.y - e.r - 10, w, 3);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - e.r, e.y - e.r - 10, w * clamp(e.hp / e.maxHp, 0, 1), 3);
    ctx.restore();
  }
}

function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Aegis shield ring.
  if (p.shieldOwned) {
    ctx.save();
    if (p.shieldUp) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(G.t * 3.2);
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 8, 0, TAU);
      ctx.stroke();
    } else {
      const frac = 1 - clamp(p.shieldCd / SHIELD_RECHARGE, 0, 1);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 8, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Invulnerability blink.
  if (p.invuln > 0.12 && Math.floor(G.t * 16) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.rotate(p.aimA);
  // Hull: sleek dart around a glowing orb core.
  const hull = new Path2D();
  hull.moveTo(19, 0);
  hull.lineTo(-11, 10);
  hull.lineTo(-6, 0);
  hull.lineTo(-11, -10);
  hull.closePath();
  neonPath(hull, '#22d3ee', 0.2);
  ctx.save();
  ctx.fillStyle = '#e0fbff';
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Muzzle flash.
  if (p.muzzle > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(p.muzzle / 0.05, 0, 1);
    ctx.fillStyle = '#a5f3fc';
    const f = polyPath(4, 10, G.t * 9);
    ctx.translate(24, 0);
    ctx.fill(f);
    ctx.restore();
  }
  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e0fbff';
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  for (const b of ebullets) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ff5470';
    ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffb3c1';
    ctx.beginPath(); ctx.arc(b.x, b.y, 4.4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawFx() {
  for (const p of parts) {
    const f = 1 - p.t / p.dur;
    ctx.save();
    ctx.globalAlpha = f;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * f), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const f of floats) {
    const a = f.t < 0.1 ? f.t / 0.1 : 1 - Math.max(0, (f.t - f.dur * 0.55) / (f.dur * 0.45));
    text(f.text, f.x, f.y, { size: f.size, color: f.color, font: MONO, weight: 700, alpha: clamp(a, 0, 1) });
  }
}

function bar(x, y, w, h, frac, fill, label) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,28,0.72)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(148,197,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (frac > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(frac, 0, 1), h - 4);
  }
  ctx.restore();
  if (label) text(label, x, y - 9, { size: 10, color: '#8ab6d6', align: 'left', weight: 700 });
}

function drawHUD() {
  // Hull (top-left). On narrow (phone) screens the bar shrinks and the wave
  // readout drops to its own row so the three top blocks never overlap.
  const small = W < 560;
  const hpFrac = player.hp / player.maxHp;
  const hpColor = hpFrac > 0.5 ? '#39ff88' : hpFrac > 0.25 ? '#ffe066' : '#ff5470';
  const hullW = small ? 104 : 228;
  bar(18, 22, hullW, 14, hpFrac, hpColor, 'HULL');
  text(`${Math.ceil(player.hp)} / ${player.maxHp}`, 26 + hullW, 29, { size: 12, color: '#e8fbff', font: MONO, align: 'left' });
  if (player.shieldOwned) {
    text(player.shieldUp ? 'AEGIS ONLINE' : 'AEGIS CHARGING', 18, 52,
      { size: 10, color: '#67e8f9', align: 'left', weight: 700, alpha: player.shieldUp ? 0.95 : 0.6 });
  }
  // Wave (top-center; second row on narrow screens).
  const waveY = small ? 68 : 26;
  text('WAVE ' + G.wave + (G.endless ? ' · ENDLESS' : ''), W / 2, waveY, { size: small ? 15 : 17, weight: 800, color: '#e8fbff' });
  text('HOSTILES ' + (enemies.length + G.queue.length), W / 2, waveY + 20, { size: 10, color: '#8ab6d6', weight: 700 });
  // Boss bar.
  if (G.bossAlive && G.boss) {
    const bw = Math.min(620, W * 0.62);
    const bossY = small ? 104 : 58;
    bar((W - bw) / 2, bossY, bw, 12, G.boss.hp / G.boss.maxHp, '#ff3355', '');
    text('HEXAGON PRIME', W / 2, bossY - 6, { size: 10, color: '#ff8fa3', weight: 800 });
  }
  // Score block (top-right).
  text('SCORE ' + fmtScore(G.score), W - 18, 24, { size: 14, color: '#e8fbff', font: MONO, align: 'right', weight: 700 });
  text('TIME ' + fmtTime(G.time), W - 18, 44, { size: 12, color: '#8ab6d6', font: MONO, align: 'right' });
  text('KILLS ' + G.kills, W - 18, 62, { size: 12, color: '#8ab6d6', font: MONO, align: 'right' });
  // XP bar (bottom).
  text('LV ' + player.level, 18, H - 34, { size: 13, color: '#a3e635', align: 'left', weight: 800 });
  bar(18, H - 24, W - 36, 10, player.xp / player.xpNeed, '#a3e635', '');
  text(`XP ${player.xp} / ${player.xpNeed}`, W - 18, H - 34, { size: 10, color: '#8ab6d6', font: MONO, align: 'right' });
  // Hints.
  text('WASD MOVE · MOUSE AIM · P PAUSE · M ' + (isMuted() ? 'UNMUTE' : 'MUTE'), 18, H - 48,
    { size: 10, color: '#5b7a94', align: 'left', alpha: 0.8 });
  if (isMuted()) text('SOUND OFF', W - 18, H - 48, { size: 10, color: '#5b7a94', align: 'right', alpha: 0.8 });
}

function drawAnnounce() {
  const a = G.announce;
  if (!a.title || a.t >= a.dur) return;
  const p = a.t / a.dur;
  const alpha = p < 0.12 ? p / 0.12 : p > 0.72 ? (1 - p) / 0.28 : 1;
  text(a.title, W / 2, H * 0.27, { size: 42, weight: 900, color: '#e8fbff', alpha, glow: 22 });
  if (a.sub) text(a.sub, W / 2, H * 0.27 + 36, { size: 15, color: '#8ab6d6', alpha, weight: 600 });
}

function rrect(x, y, w, h, r) {
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r);
  p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h);
  p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r);
  p.arcTo(x, y, x + r, y, r);
  p.closePath();
  return p;
}

function drawButton(x, y, w, h, label, action, primary = false) {
  const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  ctx.save();
  ctx.fillStyle = hover ? 'rgba(34,211,238,0.2)' : 'rgba(10,18,38,0.85)';
  ctx.fill(rrect(x, y, w, h, 8));
  ctx.strokeStyle = primary ? '#22d3ee' : '#5b7a94';
  ctx.lineWidth = hover ? 2.5 : 1.5;
  ctx.stroke(rrect(x, y, w, h, 8));
  ctx.restore();
  text(label, x + w / 2, y + h / 2 + 1, { size: 15, weight: 800, color: primary ? '#a5f3fc' : '#c7d8e8' });
  G.buttons.push({ x, y, w, h, action });
}

function drawMenu() {
  ctx.save();
  ctx.fillStyle = 'rgba(3,4,12,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const cy = H * 0.34;
  const small = W < 640; // phone: shrink the title and wrap the brief so nothing clips off-screen
  const pulse = 0.85 + 0.15 * Math.sin(G.t * 2.2);
  const titleSize = small ? 46 : 84;
  text('NEONFALL', W / 2, cy, { size: titleSize, weight: 900, color: '#22d3ee', glow: 34 * pulse });
  text('NEONFALL', W / 2, cy, { size: titleSize, weight: 900, color: '#e0fbff', alpha: 0.85 });
  text('A R E N A   S U R V I V A L   P R O T O C O L', W / 2, cy + 62, { size: small ? 10 : 15, color: '#ff2d78', weight: 700 });
  const lines = small
    ? [
        'WASD / ARROWS — MOVE · MOUSE — AIM',
        'HOLD CLICK / SPACE — FIRE · TOUCH — AIM & FIRE',
        'Survive 5 waves. Harvest XP shards.',
        'Choose upgrades. Destroy the Hexagon Prime',
        'at wave 5 to restore the signal.',
      ]
    : [
        'WASD / ARROWS — MOVE        MOUSE — AIM        HOLD CLICK / SPACE — FIRE',
        'Survive 5 waves. Harvest XP shards. Choose your upgrades.',
        'Destroy the Hexagon Prime at wave 5 to restore the signal.',
      ];
  lines.forEach((s, i) => text(s, W / 2, cy + (small ? 104 : 118) + i * (small ? 20 : 24), { size: small ? 11 : 14, color: '#9fc3dd', weight: 500 }));
  const bw = 280, bh = 52;
  drawButton(W / 2 - bw / 2, cy + 208, bw, bh, 'ENTER THE GRID', () => startGame(), true);
  text('or press ENTER', W / 2, cy + 282, { size: 12, color: '#5b7a94' });
  text('All art and audio generated in code — no downloads, no assets', W / 2, H - 26, { size: 11, color: '#41586e' });
}

function drawPaused() {
  ctx.save();
  ctx.fillStyle = 'rgba(3,4,12,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  text('PAUSED', W / 2, H * 0.44, { size: 46, weight: 900, color: '#e8fbff', glow: 18 });
  text('Press P or ESC to resume', W / 2, H * 0.44 + 44, { size: 14, color: '#8ab6d6' });
}

function drawUpgradeIcon(id, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#a5f3fc';
  ctx.fillStyle = '#a5f3fc';
  ctx.lineWidth = 2.4;
  if (id === 'dmg') {
    const p = new Path2D();
    p.moveTo(0, -16); p.lineTo(12, 10); p.lineTo(-12, 10); p.closePath();
    ctx.stroke(p);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
  } else if (id === 'rate') {
    for (let i = 0; i < 3; i++) {
      const y = -12 + i * 12;
      ctx.beginPath(); ctx.moveTo(-14, y); ctx.lineTo(4, y); ctx.lineTo(14, y + 5); ctx.stroke();
    }
  } else if (id === 'speed') {
    for (const off of [-9, 5]) {
      ctx.beginPath(); ctx.moveTo(off - 6, -12); ctx.lineTo(off + 8, 0); ctx.lineTo(off - 6, 12); ctx.stroke();
    }
  } else if (id === 'hp') {
    ctx.beginPath();
    ctx.moveTo(-5, -15); ctx.lineTo(5, -15); ctx.lineTo(5, -5); ctx.lineTo(15, -5);
    ctx.lineTo(15, 5); ctx.lineTo(5, 5); ctx.lineTo(5, 15); ctx.lineTo(-5, 15);
    ctx.lineTo(-5, 5); ctx.lineTo(-15, 5); ctx.lineTo(-15, -5); ctx.lineTo(-5, -5);
    ctx.closePath(); ctx.stroke();
  } else if (id === 'magnet') {
    ctx.beginPath(); ctx.arc(0, 0, 13, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13, -9); ctx.lineTo(-13, -17); ctx.moveTo(13, -9); ctx.lineTo(13, -17); ctx.stroke();
  } else if (id === 'proj') {
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.arc(Math.sin(a) * 15, -Math.cos(a) * 15 + 6, 3.4, 0, TAU);
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(Math.sin(a) * 12, -Math.cos(a) * 10 + 6); ctx.stroke();
    }
  } else if (id === 'shield') {
    ctx.stroke(polyPath(6, 15, Math.PI / 6));
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function wrapText(str, maxW, size) {
  ctx.save();
  ctx.font = `500 ${size}px ${FONT}`;
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines;
}

function drawLevelUp() {
  ctx.save();
  ctx.fillStyle = 'rgba(3,4,12,0.66)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  text('LEVEL UP', W / 2, H * 0.2, { size: 40, weight: 900, color: '#a3e635', glow: 20 });
  text('Choose one upgrade', W / 2, H * 0.2 + 38, { size: 14, color: '#8ab6d6' });
  const cw = 232, ch = 256, gap = 26;
  const total = cw * G.choices.length + gap * (G.choices.length - 1);
  const x0 = (W - total) / 2;
  const y0 = H * 0.2 + 76;
  G.cards = [];
  G.choices.forEach((u, i) => {
    const x = x0 + i * (cw + gap);
    const hover = mouse.x >= x && mouse.x <= x + cw && mouse.y >= y0 && mouse.y <= y0 + ch;
    ctx.save();
    ctx.fillStyle = hover ? 'rgba(20,32,58,0.96)' : 'rgba(9,14,30,0.94)';
    ctx.fill(rrect(x, y0, cw, ch, 12));
    ctx.strokeStyle = hover ? '#a3e635' : 'rgba(163,230,53,0.4)';
    ctx.lineWidth = hover ? 2.5 : 1.5;
    ctx.stroke(rrect(x, y0, cw, ch, 12));
    ctx.restore();
    drawUpgradeIcon(u.id, x + cw / 2, y0 + 52);
    text(u.name, x + cw / 2, y0 + 108, { size: 17, weight: 800, color: '#e8fbff' });
    const dl = wrapText(u.desc, cw - 34, 13);
    dl.forEach((s, j) => text(s, x + cw / 2, y0 + 140 + j * 19, { size: 13, color: '#9fc3dd', weight: 500 }));
    text('[ ' + (i + 1) + ' ]', x + cw / 2, y0 + ch - 24, { size: 12, color: '#5b7a94', font: MONO, weight: 700 });
    G.cards.push({ x, y: y0, w: cw, h: ch });
  });
}

function drawEndScreen(victory) {
  const st = G.finalStats || snapshotStats();
  ctx.save();
  ctx.fillStyle = victory ? 'rgba(2,10,8,0.6)' : 'rgba(12,3,6,0.66)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const cy = H * 0.3;
  if (victory) {
    text('SIGNAL RESTORED', W / 2, cy, { size: 54, weight: 900, color: '#39ff88', glow: 26 });
    text('The Hexagon Prime is down. The grid breathes again.', W / 2, cy + 44, { size: 15, color: '#9fc3dd' });
  } else {
    text('SIGNAL LOST', W / 2, cy, { size: 54, weight: 900, color: '#ff5470', glow: 26 });
    text('Your ship went dark on wave ' + st.wave + '.', W / 2, cy + 44, { size: 15, color: '#9fc3dd' });
  }
  const rows = [
    ['SCORE', fmtScore(st.score)],
    ['WAVE REACHED', String(st.wave)],
    ['TIME SURVIVED', fmtTime(st.time)],
    ['KILLS', String(st.kills)],
    ['LEVEL', String(st.level)],
  ];
  rows.forEach((r, i) => {
    text(r[0], W / 2 - 90, cy + 92 + i * 24, { size: 13, color: '#5b7a94', align: 'right', weight: 700 });
    text(r[1], W / 2 - 74, cy + 92 + i * 24, { size: 14, color: '#e8fbff', font: MONO, align: 'left', weight: 700 });
  });
  const by = cy + 92 + rows.length * 24 + 22;
  if (victory) {
    drawButton(W / 2 - 268, by, 256, 50, 'CONTINUE — ENDLESS  [C]', () => continueEndless(), true);
    drawButton(W / 2 + 12, by, 256, 50, 'RESTART  [R]', () => startGame(), false);
  } else {
    drawButton(W / 2 - 130, by, 260, 50, 'RETRY  [R]', () => startGame(), true);
  }
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  G.buttons = [];
  // Screen shake: deterministic wobble from the animation clock.
  const sh = G.trauma * G.trauma * 13;
  const ox = Math.sin(G.t * 91.7) * sh;
  const oy = Math.cos(G.t * 83.3) * sh;
  ctx.save();
  ctx.translate(ox, oy);
  drawBackground();
  if (G.state === 'menu') {
    for (const d of decor) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.globalAlpha = 0.5;
      const p = polyPath(d.sides, d.r, 0);
      neonPath(p, d.color, 0.1);
      ctx.restore();
    }
  }
  for (const g of gems) drawGem(g);
  drawBullets();
  if (G.state !== 'menu') {
    for (const e of enemies) drawEnemy(e);
    if (player.alive) drawPlayer();
  }
  drawFx();
  ctx.restore();

  // Hurt vignette pulse.
  if (G.hurtFlash > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(255,45,85,${(G.hurtFlash * 0.16).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (vignette) {
    ctx.save();
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (G.state === 'playing' || G.state === 'paused' || G.state === 'levelup') drawHUD();
  if (G.state === 'playing') drawAnnounce();
  if (G.state === 'menu') drawMenu();
  else if (G.state === 'paused') drawPaused();
  else if (G.state === 'levelup') drawLevelUp();
  else if (G.state === 'gameover') drawEndScreen(false);
  else if (G.state === 'victory') drawEndScreen(true);
}

// ---------------------------------------------------------- shot staging --
// ?shot= scenes are staged with the game's own systems (real enemies,
// bullets, gems and particles), then the normal simulation runs them —
// with the autopilot flying — under the seeded RNG. Nothing is fake art.
function stageBattle(wave, o) {
  startGame();
  enemies.length = 0; bullets.length = 0; ebullets.length = 0;
  gems.length = 0; parts.length = 0; floats.length = 0;
  G.queue = []; G.boss = null; G.bossAlive = false;
  G.wave = wave;
  G.score = o.score; G.kills = o.kills; G.time = o.time;
  player.level = o.level;
  player.xpNeed = xpForLevel(o.level);
  player.xp = Math.floor(player.xpNeed * o.xpFrac);
  player.hp = o.hp;
  player.x = W * 0.42; player.y = H * 0.58;
  player.vx = 0; player.vy = 0;
  for (const [type, deg, dist] of o.comp) {
    const a = (deg * Math.PI) / 180;
    spawnEnemy(
      type,
      clamp(player.x + Math.cos(a) * dist, 26, W - 26),
      clamp(player.y + Math.sin(a) * dist, 26, H - 26),
    );
  }
  for (const [dx, dy, v] of o.gemSpots) {
    gems.push({
      x: clamp(player.x + dx, 16, W - 16), y: clamp(player.y + dy, 16, H - 16),
      vx: 0, vy: 0, value: v, r: 4 + v, t: rng.range(0, TAU),
    });
  }
  // Player rounds already in flight toward the first hostile.
  const t0 = enemies[0];
  if (t0) {
    const base = Math.atan2(t0.y - player.y, t0.x - player.x);
    player.aimA = base;
    for (let i = 0; i < 5; i++) {
      const d = 46 + i * 48;
      bullets.push({
        x: player.x + Math.cos(base) * d, y: player.y + Math.sin(base) * d,
        vx: Math.cos(base) * 740, vy: Math.sin(base) * 740,
        life: 0.9, dmg: player.dmg, r: 4,
      });
    }
  }
  // Shooter bolts already in flight toward the player.
  for (const e of enemies) {
    if (e.type !== 'shooter') continue;
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    for (let i = 0; i < 2; i++) {
      const d = 70 + i * 76;
      spawnEBullet(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, Math.cos(a) * BOLT_SPEED, Math.sin(a) * BOLT_SPEED);
    }
  }
  spawnParticles(player.x + 44, player.y - 30, '#ff2d78', 12, 180, 2.6, 0.5);
  spawnParticles(player.x - 60, player.y + 40, '#22d3ee', 8, 140, 2.2, 0.45);
  G.queue = buildQueue(wave);
  G.spawnInterval = clamp(1.15 - wave * 0.06, 0.45, 1.15);
  G.spawnT = 3.2;
  G.announce = { title: '', sub: '', t: 0, dur: 0 };
  G.autopilot = true;
}

function stagePlay() {
  stageBattle(3, {
    score: 1450, kills: 27, time: 74, level: 3, xpFrac: 0.55, hp: 82,
    comp: [
      ['chaser', 35, 235], ['chaser', 140, 265], ['chaser', 285, 205],
      ['splitter', 205, 295], ['shooter', 85, 335], ['shooter', 325, 355],
    ],
    gemSpots: [[120, 60, 1], [-90, 110, 1], [160, -40, 3], [-150, -70, 1], [60, 150, 1], [-40, -140, 3]],
  });
}

function stageLevelup() {
  stageBattle(2, {
    score: 620, kills: 14, time: 41, level: 2, xpFrac: 0.2, hp: 64,
    comp: [
      ['chaser', 30, 250], ['chaser', 160, 290],
      ['splitter', 230, 270], ['shooter', 320, 330],
    ],
    gemSpots: [[100, 80, 1], [-120, 60, 1], [40, -120, 3]],
  });
  openLevelUp(); // freezes the staged battle behind the upgrade cards
}

function stageBoss() {
  startGame();
  enemies.length = 0; bullets.length = 0; ebullets.length = 0;
  gems.length = 0; parts.length = 0; floats.length = 0;
  G.queue = [];
  G.wave = 5;
  G.score = 3900; G.kills = 88; G.time = 168;
  player.level = 5;
  player.xpNeed = xpForLevel(5);
  player.xp = Math.floor(player.xpNeed * 0.35);
  player.hp = 72;
  player.x = W / 2; player.y = H * 0.68;
  player.vx = 0; player.vy = 0;
  const b = spawnBoss();
  b.x = W / 2; b.y = 168;
  b.vx = 0; b.vy = 0;
  b.hp = Math.round(b.maxHp * 0.6);
  b.atkT = 1.5;
  spawnEnemy('chaser', W / 2 - 195, 215);
  spawnEnemy('small', W / 2 + 205, 245);
  spawnEnemy('small', W / 2 + 155, 115);
  bossAttack(b); // a radial burst is already in flight
  const base = Math.atan2(b.y - player.y, b.x - player.x);
  player.aimA = base;
  for (let i = 0; i < 6; i++) {
    const d = 50 + i * 52;
    bullets.push({
      x: player.x + Math.cos(base) * d, y: player.y + Math.sin(base) * d,
      vx: Math.cos(base) * 740, vy: Math.sin(base) * 740,
      life: 0.95, dmg: player.dmg, r: 4,
    });
  }
  for (const [dx, dy, v] of [[-170, 90, 3], [180, 120, 1], [-60, 170, 1]]) {
    gems.push({
      x: clamp(player.x + dx, 16, W - 16), y: clamp(player.y + dy, 16, H - 16),
      vx: 0, vy: 0, value: v, r: 4 + v, t: rng.range(0, TAU),
    });
  }
  spawnParticles(b.x - 44, b.y + 30, '#ff3355', 12, 190, 2.8, 0.5);
  G.announce = { title: '', sub: '', t: 0, dur: 0 };
  G.autopilot = true;
}

// ------------------------------------------------------------------ boot --
function seedDecor() {
  const kinds = [
    ['chaser', 3], ['splitter', 5], ['shooter', 4], ['small', 3],
    ['chaser', 3], ['splitter', 5], ['small', 3],
  ];
  for (const [type, sides] of kinds) {
    decor.push({
      x: rng.range(0, W), y: rng.range(0, H),
      vx: rng.range(-16, 16), vy: rng.range(-10, 10),
      rot: rng.range(0, TAU), rs: rng.range(-0.5, 0.5),
      sides, r: ETYPES[type].r * 1.15, color: ETYPES[type].color,
    });
  }
}

resize();
player.x = W / 2;
player.y = H / 2;
mouse.x = W / 2;
mouse.y = H / 2 - 120;
seedDecor();
if (SHOT === 'play') stagePlay();
else if (SHOT === 'levelup') stageLevelup();
else if (SHOT === 'boss') stageBoss();
// 'menu' (and normal play) boot straight into the title screen state.

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 8) {
    tick(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 8) acc = 0; // drop backlog rather than spiral
  draw();
}
requestAnimationFrame(frame);
