// pedestrians.js — Solmara's walkers: low-poly figures strolling the sidewalks,
// turning at crossings, and gathering where a scene needs a crowd.
import * as THREE from 'three';
import { ROAD_CENTERS } from './world.js';

const SHIRTS = [0xd94f30, 0x3f8fd2, 0xf2d13c, 0x7fc94f, 0xe08fd2, 0xf0f0f0, 0x34495e, 0xe67e22];

function makeFigure(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rng() * SHIRTS.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: [0xc98d64, 0x8a5a3b, 0xe8b48c][Math.floor(rng() * 3)] });
  const legs = new THREE.MeshLambertMaterial({ color: [0x2c3444, 0x5d4a35, 0x707880][Math.floor(rng() * 3)] });
  const mk = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m;
  };
  const legGeo = new THREE.BoxGeometry(0.2, 0.85, 0.22);
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.88, 0);
  const ll = new THREE.Mesh(legGeo, legs); ll.position.y = -0.42; legL.add(ll);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.88, 0);
  const lr = new THREE.Mesh(legGeo, legs); lr.position.y = -0.42; legR.add(lr);
  mk(new THREE.BoxGeometry(0.62, 0.62, 0.34), shirt, 0, 1.2, 0);
  mk(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin, 0, 1.72, 0);
  g.add(legL, legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

export function createPedestrians(scene, rng, count = 42) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makeFigure(rng);
    scene.add(mesh);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = ROAD_CENTERS[Math.floor(rng() * ROAD_CENTERS.length)];
    const side = rng() < 0.5 ? -10.6 : 10.6;
    const along = -320 + rng() * 640;
    const p = {
      mesh, pos: mesh.position, axis, line, side,
      dir: rng() < 0.5 ? 1 : -1,
      speed: 1.1 + rng() * 0.9,
      phase: rng() * 6.28,
      mode: 'walk', anchor: null, fallen: 0,
    };
    if (axis === 'z') p.pos.set(line + side, 0, along);
    else p.pos.set(along, 0, line + side);
    peds.push(p);
  }

  return {
    list: peds,
    gatherCrowd(x, z, n) {
      let placed = 0;
      for (const p of peds) {
        if (placed >= n) break;
        if (p.mode === 'down') continue;
        const a = (placed / n) * Math.PI * 2 + 0.4;
        const r = 4 + (placed % 3) * 2.4;
        p.mode = 'mingle';
        p.anchor = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
        p.pos.set(p.anchor.x, 0, p.anchor.z);
        p.mesh.rotation.y = Math.atan2(x - p.pos.x, z - p.pos.z);
        placed++;
      }
    },
    knockDown(p) {
      p.mode = 'down';
      p.fallen = 6;
    },
    update(dt, t) {
      for (const p of peds) {
        if (p.mode === 'down') {
          p.fallen -= dt;
          p.mesh.rotation.x = Math.max(-Math.PI / 2, p.mesh.rotation.x - dt * 5);
          if (p.fallen <= 0) { p.mode = 'walk'; p.mesh.rotation.x = 0; }
          continue;
        }
        if (p.mode === 'mingle' && p.anchor) {
          p.mesh.position.x = p.anchor.x + Math.sin(t * 0.5 + p.phase) * 0.7;
          p.mesh.position.z = p.anchor.z + Math.cos(t * 0.4 + p.phase) * 0.7;
          continue;
        }
        const step = p.speed * p.dir * dt;
        if (p.axis === 'z') p.pos.z += step; else p.pos.x += step;
        if (p.pos.x > 332) p.pos.x = -332;
        if (p.pos.x < -332) p.pos.x = 332;
        if (p.pos.z > 332) p.pos.z = -332;
        if (p.pos.z < -332) p.pos.z = 332;
        p.mesh.rotation.y = p.axis === 'z'
          ? (p.dir > 0 ? 0 : Math.PI)
          : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        const sw = Math.sin(t * 6 * p.speed + p.phase) * 0.4;
        p.mesh.userData.legL.rotation.x = sw;
        p.mesh.userData.legR.rotation.x = -sw;
      }
    },
  };
}
