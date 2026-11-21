// police.js — the Solmara Police Department: wanted stars, pursuit drivers,
// roadblocks at three stars, and at four the helicopter with its spotlight.
// Units carry callsigns the dispatch board reads.
import * as THREE from 'three';
import { createVehicle } from './vehicles.js';
import { resolveCollisions, ROAD_CENTERS } from './world.js';

const CALLSIGNS = [
  { call: 'CORAL-48', role: 'RAMMING' },
  { call: 'KITE-1', role: 'FLANKING' },
  { call: 'MARLIN-3', role: 'SHORE WATCH' },
  { call: 'OTTER-7', role: 'INTERCEPT' },
  { call: 'VEGA-2', role: 'INTERCEPT' },
  { call: 'BLOCK-9', role: 'ROADBLOCK' },
];

export function createPolice(scene) {
  const units = [];       // pursuit vehicles
  const blockers = [];    // roadblock vehicles (also counted as units)
  let heli = null;
  let heliAngle = 0;
  let lastKnown = null; // where the net last saw the target — the beam searches here
  let blockAnchor = null; // {x, z} where the current roadblock stands
  let bustTimer = 0;
  let flashT = 0;

  // spotlight pool: a soft disc that sits on the street under the heli beam
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,244,200,.85)');
    grad.addColorStop(0.6, 'rgba(255,244,200,.35)');
    grad.addColorStop(1, 'rgba(255,244,200,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(13.5, 13.5),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.07;
  pool.visible = false;
  scene.add(pool);

  function buildHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 4.6), bodyMat);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.6), bodyMat);
    tail.position.set(0, 0.25, -3.8);
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.4), bodyMat);
    skidL.position.set(-1, -1.05, 0);
    const skidR = skidL.clone(); skidR.position.x = 1;
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.07, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x11131a }));
    rotor.position.y = 1.15;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff3c0 }));
    lamp.position.set(0, -0.9, 1.6);
    g.add(body, tail, skidL, skidR, rotor, lamp);
    g.userData.rotor = rotor;
    const spot = new THREE.SpotLight(0xfff0bc, 0, 90, 0.42, 0.5, 0.6);
    g.add(spot); g.add(spot.target);
    spot.target.position.set(0, -40, 0);
    g.userData.spot = spot;
    g.visible = false;
    scene.add(g);
    return g;
  }

  function spawnUnit(rng, px, pz, blocker = false) {
    const ang = rng() * Math.PI * 2;
    const dist = blocker ? 0 : 55 + rng() * 30;
    const v = createVehicle(scene, 'interceptor', px + Math.sin(ang) * dist, pz + Math.cos(ang) * dist, ang + Math.PI);
    const meta = CALLSIGNS[(units.length + blockers.length) % CALLSIGNS.length];
    v.callsign = blocker ? 'BLOCK-9' : meta.call;
    v.role = blocker ? 'ROADBLOCK' : meta.role;
    v.isPolice = true;
    (blocker ? blockers : units).push(v);
    return v;
  }

  const police = {
    wanted: 0,
    heat: 0,
    units, blockers,
    get heliActive() { return !!heli && heli.visible; },
    addCrime(amount) {
      this.heat += amount;
      const w = Math.min(5, Math.floor(this.heat));
      if (w > this.wanted) this.wanted = w;
    },
    clear() {
      this.wanted = 0; this.heat = 0; bustTimer = 0;
    },
    // position the air unit for a staged frame
    stageAirUnit(px, pz) {
      if (!heli) heli = buildHeli();
      heli.visible = true;
      heliAngle = 2.35;
      heli.position.set(px + Math.sin(heliAngle) * 27, 36, pz + Math.cos(heliAngle) * 27);
      heli.userData.spot.intensity = 2600;
      pool.visible = true;
      pool.position.set(px, 0.07, pz);
    },
    update(dt, target, colliders, rng, onBusted) {
      flashT += dt;
      // decay: lie low and the heat bleeds off
      if (this.wanted > 0 && target.speed < 0.5 && !target.visible) {
        this.heat = Math.max(0, this.heat - dt * 0.05);
        this.wanted = Math.min(this.wanted, Math.ceil(this.heat));
      }
      const wantUnits = this.wanted === 0 ? 0 : Math.min(2 + this.wanted, 5);
      while (units.length < wantUnits) spawnUnit(rng, target.pos.x, target.pos.z);
      while (units.length > wantUnits) {
        const v = units.pop();
        scene.remove(v.mesh);
      }
      // roadblock at 3+ stars, planted on the road ahead of the target
      if (this.wanted >= 3) {
        if (!blockAnchor || Math.hypot(blockAnchor.x - target.pos.x, blockAnchor.z - target.pos.z) > 175) {
          for (const b of blockers) scene.remove(b.mesh);
          blockers.length = 0;
          // plant it 70 m ahead along the target's heading, snapped to a road
          const ax = target.pos.x + Math.sin(target.heading) * 70;
          const az = target.pos.z + Math.cos(target.heading) * 70;
          const snap = (v) => ROAD_CENTERS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, ROAD_CENTERS[0]);
          const vertical = Math.abs(Math.sin(target.heading)) < 0.7;
          const bx = vertical ? snap(ax) : ax, bz = vertical ? az : snap(az);
          blockAnchor = { x: bx, z: bz };
          for (const off of [-3.4, 3.4]) {
            const b = spawnUnit(rng, 0, 0, true);
            if (vertical) { b.pos.set(bx + off, 0, bz); b.heading = Math.PI / 2; }
            else { b.pos.set(bx, 0, bz + off); b.heading = 0; }
            b.speed = 0;
            b.syncMesh();
          }
        }
      } else if (blockers.length) {
        for (const b of blockers) scene.remove(b.mesh);
        blockers.length = 0;
        blockAnchor = null;
      }
      // pursuit driving
      for (const v of [...units, ...blockers]) {
        if (v.role === 'ROADBLOCK') continue;
        const dx = target.pos.x - v.pos.x, dz = target.pos.z - v.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 240) { // too far behind: quietly re-stage closer
          const ang = rng() * Math.PI * 2;
          v.pos.set(target.pos.x + Math.sin(ang) * 70, 0, target.pos.z + Math.cos(ang) * 70);
        }
        const want = Math.atan2(dx, dz);
        let diff = want - v.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        const top = v.spec.top * (dist > 26 ? 1 : 0.55);
        v.speed += Math.sign(top - v.speed) * Math.min(Math.abs(top - v.speed), dt * 9);
        v.pos.x += Math.sin(v.heading) * v.speed * dt;
        v.pos.z += Math.cos(v.heading) * v.speed * dt;
        resolveCollisions(colliders, v.pos, 1.6);
        v.syncMesh();
        const bar = v.mesh.userData.lightBar;
        if (bar) {
          bar.children[1].visible = Math.sin(flashT * 10) > 0;
          bar.children[2].visible = Math.sin(flashT * 10) <= 0;
        }
      }
      // helicopter at 4+ stars
      if (this.wanted >= 4) {
        if (!heli) heli = buildHeli();
        heli.visible = true;
        heliAngle += dt * 0.24;
        heli.position.set(
          target.pos.x + Math.sin(heliAngle) * 27, 36,
          target.pos.z + Math.cos(heliAngle) * 27,
        );
        heli.rotation.y = heliAngle + Math.PI;
        heli.userData.rotor.rotation.y += dt * 28;
        heli.userData.spot.intensity = 2600;
        pool.visible = true;
        if (target.visible) {
          lastKnown = { x: target.pos.x, z: target.pos.z };
          pool.position.set(target.pos.x, 0.07, target.pos.z);
        } else if (lastKnown) {
          // lost visual: the beam sweeps the last known block, hunting
          pool.position.set(
            lastKnown.x + Math.sin(flashT * 0.7) * 16, 0.07,
            lastKnown.z + Math.cos(flashT * 0.55) * 16,
          );
        } else {
          pool.position.set(target.pos.x, 0.07, target.pos.z);
        }
      } else if (heli) {
        heli.visible = false;
        heli.userData.spot.intensity = 0;
        pool.visible = false;
      }
      // busted: boxed in and slow with a unit on top of you
      if (this.wanted > 0 && target.speed < 1.3) {
        const near = [...units, ...blockers].some(
          (v) => Math.hypot(v.pos.x - target.pos.x, v.pos.z - target.pos.z) < 5.2);
        bustTimer = near ? bustTimer + dt : Math.max(0, bustTimer - dt * 2);
        if (bustTimer > 2.2) { bustTimer = 0; onBusted(); }
      } else bustTimer = Math.max(0, bustTimer - dt * 2);
    },
  };
  return police;
}
