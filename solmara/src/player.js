// player.js — Reno, on foot: a simple articulated low-poly figure with a walk
// cycle, health/armour, and the stat hooks the career ledger reads.
import * as THREE from 'three';
import { resolveCollisions } from './world.js';

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  return m;
}

export function createPlayer(scene) {
  const g = new THREE.Group();
  // outfit: coral shirt, dark jeans, tan skin, black cap hair
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.16, 0.92, 0); legR.position.set(0.16, 0.92, 0);
  legL.add(box(0.24, 0.92, 0.26, 0x2c3444, 0, -0.46, 0));
  legR.add(box(0.24, 0.92, 0.26, 0x2c3444, 0, -0.46, 0));
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.47, 1.52, 0); armR.position.set(0.47, 1.52, 0);
  armL.add(box(0.2, 0.78, 0.22, 0xd96a4a, 0, -0.36, 0));
  armR.add(box(0.2, 0.78, 0.22, 0xd96a4a, 0, -0.36, 0));
  const torso = box(0.74, 0.68, 0.4, 0xe0653f, 0, 1.26, 0);
  const head = box(0.42, 0.44, 0.42, 0xc98d64, 0, 1.86, 0);
  const hair = box(0.46, 0.14, 0.46, 0x1d1a17, 0, 2.1, 0);
  g.add(legL, legR, armL, armR, torso, head, hair);
  scene.add(g);

  const player = {
    mesh: g,
    pos: g.position,
    heading: 0,
    speed: 0,
    health: 100,
    armour: 0,
    walkPhase: 0,
    moving: false,
    stats: { distance: 0, shotsFired: 0, carsStolen: 0 },
    hurt(amount) {
      const soaked = Math.min(this.armour, amount * 0.7);
      this.armour -= soaked;
      this.health -= (amount - soaked);
      if (this.health < 0) this.health = 0;
    },
    heal(amount) { this.health = Math.min(100, this.health + amount); },
    // move: desired velocity vector in world space; sprint multiplies speed
    update(dt, moveX, moveZ, sprint, colliders) {
      const len = Math.hypot(moveX, moveZ);
      this.moving = len > 0.01;
      if (this.moving) {
        const sp = sprint ? 7.4 : 4.4;
        const vx = (moveX / len) * sp, vz = (moveZ / len) * sp;
        this.pos.x += vx * dt;
        this.pos.z += vz * dt;
        this.stats.distance += sp * dt;
        const target = Math.atan2(vx, vz);
        let diff = target - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += diff * Math.min(1, dt * 12);
        this.walkPhase += dt * (sprint ? 11 : 8);
      } else {
        this.walkPhase *= 0.8;
      }
      resolveCollisions(colliders, this.pos, 0.45);
      g.rotation.y = this.heading;
      const sw = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
      legL.rotation.x = sw; legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.8; armR.rotation.x = sw * 0.8;
      g.position.y = this.moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0;
    },
    setVisible(v) { g.visible = v; },
  };
  g.position.set(-222, 0, -192);
  player.heading = Math.PI;
  return player;
}
