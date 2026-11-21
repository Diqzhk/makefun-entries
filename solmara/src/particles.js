// particles.js — one pooled THREE.Points cloud for every spark, dust puff and
// exhaust wisp in the game. The sprite is a soft radial disc, so a particle
// never renders as a hard square.
import * as THREE from 'three';

const CAP = 700;

function discTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,.38)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createParticles(scene) {
  const pos = new Float32Array(CAP * 3);
  const col = new Float32Array(CAP * 3);
  for (let i = 0; i < CAP; i++) pos[i * 3 + 1] = -999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: discTexture(), size: 0.85, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);

  const pool = [];
  for (let i = 0; i < CAP; i++) pool.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0 });
  let cursor = 0;
  const tmpC = new THREE.Color();

  function spawn(x, y, z, opts) {
    const n = opts.count || 8;
    tmpC.set(opts.color);
    for (let k = 0; k < n; k++) {
      const p = pool[cursor];
      const i = cursor;
      cursor = (cursor + 1) % CAP;
      p.life = p.max = (opts.life || 0.6) * (0.6 + Math.random() * 0.7);
      p.grav = opts.gravity ?? 0;
      p.drag = opts.drag ?? 0;
      const sp = opts.speed || 3;
      p.vx = (Math.random() - 0.5) * sp;
      p.vy = Math.random() * (opts.up || 2);
      p.vz = (Math.random() - 0.5) * sp;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const j = 0.75 + Math.random() * 0.4;
      col[i * 3] = tmpC.r * j; col[i * 3 + 1] = tmpC.g * j; col[i * 3 + 2] = tmpC.b * j;
    }
  }

  return {
    sparks(x, y, z, n = 10) { spawn(x, y, z, { count: n, color: 0xffb347, speed: 5, up: 3, life: 0.45, gravity: -6 }); },
    dust(x, y, z, n = 6) { spawn(x, y, z, { count: n, color: 0xcbb590, speed: 1.6, up: 0.8, life: 0.9, drag: 1.4 }); },
    exhaust(x, y, z) { spawn(x, y, z, { count: 1, color: 0x8a8f96, speed: 0.4, up: 1.1, life: 0.7, drag: 0.6 }); },
    update(dt) {
      for (let i = 0; i < CAP; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { pos[i * 3 + 1] = -999; continue; }
        p.vy += p.grav * dt;
        if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vz *= d; }
        pos[i * 3] += p.vx * dt;
        pos[i * 3 + 1] += p.vy * dt;
        pos[i * 3 + 2] += p.vz * dt;
        if (pos[i * 3 + 1] < 0.05) pos[i * 3 + 1] = 0.05;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
