// shots.js — deterministic screenshot staging. A ?shot=<name>&seed=<n> URL
// boots straight into a frozen, composed moment of the game: the chase, the
// stats screen, the night market, the sunset drive. No toasts, no menus —
// just the game, mid-breath.
import { createVehicle } from './vehicles.js';
import { setStagedSlots } from './save.js';

function policeCar(G, x, z, heading, callsign, role, blocker = false) {
  const v = createVehicle(G.scene, 'interceptor', x, z, heading);
  v.callsign = callsign;
  v.role = role;
  v.isPolice = true;
  (blocker ? G.police.blockers : G.police.units).push(v);
  return v;
}

function chase(G) {
  G.setTime(17.35); // 17:21
  G.cash = 12840; G.respect = 1240;
  const car = G.spawnVehicle('spyder', 283.6, 60, Math.PI);
  car.speed = 82 / 3.6;
  car.damage = 38;
  G.setInVehicle(car);
  G.audio.setStation(0);
  G.weapons.select(2);
  G.police.wanted = 4; G.police.heat = 4.3;
  policeCar(G, 276.4, 53, Math.PI, 'CORAL-48', 'RAMMING');
  policeCar(G, 283.6, 74, Math.PI, 'KITE-1', 'FLANKING');
  policeCar(G, 258, 40, Math.PI * 0.8, 'MARLIN-3', 'SHORE WATCH');
  policeCar(G, 278, 16, Math.PI / 2, 'BLOCK-9', 'ROADBLOCK', true);
  policeCar(G, 286, 16, Math.PI / 2, 'BLOCK-9', 'ROADBLOCK', true);
  policeCar(G, 283.6, 140, Math.PI, 'OTTER-7', 'INTERCEPT');
  G.spawnVehicle('coupe', 276.4, -30, 0);
  G.spawnVehicle('sedan', 283.6, -58, Math.PI);
  G.police.stageAirUnit(283.6, 60);
  G.missions.forceStage('golden-mile', 1);
  G.missions.current.timerLeft = 74;
  G.dialogue.pin('Sana Iqbal', 'Badges on our six and a block up the strand — punch it, Reno, I will call the gaps.');
  G.setCamera([285.8, 4.8, 83], [281.5, 1.0, 28]);
}

function stats(G) {
  G.setTime(17.6); // 17:36
  G.cash = 12840; G.respect = 1240;
  G.standingOverride = 71;
  G.player.pos.set(280, 0, 66);
  G.player.heading = -0.6;
  const car = G.spawnVehicle('spyder', 286.5, 76, 0.5);
  car.damage = 12;
  G.missions.forceStage('golden-mile', 0);
  G.stagedStats = {
    pct: 75,
    strands: [
      { label: 'Story jobs', v: 33, m: 55 },
      { label: 'Taxi fares', v: 15, m: 15 },
      { label: 'Cars taken', v: 15, m: 15 },
      { label: 'Ground covered', v: 12, m: 15 },
    ],
    ledger: [
      ['Cash on hand', '$12,840'],
      ['Story jobs done', '3 / 5'],
      ['Taxi fares run', '23'],
      ['Taxi earnings', '$5,140'],
      ['Cars stolen', '41'],
      ['Distance driven', '48.6 km'],
      ['Shots fired', '132'],
      ['Times busted', '2'],
      ['Times wasted', '1'],
    ],
  };
  setStagedSlots([
    { cash: 12840, respect: 1240, head: 'JOB 4 OF 5 ON THE BOARD', rank: 'WHEELMAN' },
    { cash: 4210, respect: 640, head: 'JOB 2 OF 5 ON THE BOARD', rank: 'COURIER' },
    null,
  ]);
  G.mapUnitsOverride = [
    { x: 252, z: 120, kind: 'cop' }, { x: 224, z: 56, kind: 'cop' },
    { x: 283, z: -40, kind: 'heli' }, { x: 196, z: 168, kind: 'cop' },
  ];
  G.objectiveOverride = { x: 280, z: 224 };
  G.statsOpen = true;
}

function market(G) {
  G.setTime(19.35); // 19:21
  G.cash = 3260; G.respect = 420;
  G.player.pos.set(-193, 0, 5);
  G.player.heading = -Math.PI / 2 - 0.25;
  G.peds.gatherCrowd(-214, 2, 11);
  G.missions.forceStage('night-market', 0);
  G.dialogue.pin('Marisol Vega', 'Third stall from the fountain, Reno. The silk bundle — and do not haggle with Sari tonight.');
  G.setCamera([-168, 3.4, 17], [-212, 3.0, -2]);
}

function drive(G) {
  G.setTime(17.14); // 17:08
  G.cash = 5120; G.respect = 500;
  const car = G.spawnVehicle('spyder', 283.6, 112, Math.PI);
  car.speed = 85 / 3.6;
  car.damage = 12;
  G.setInVehicle(car);
  G.audio.setStation(1); // RADIO BRISA
  G.weapons.select(2);    // SMG
  G.spawnVehicle('sedan', 283.6, 74, Math.PI);
  G.spawnVehicle('coupe', 276.4, 70, 0);
  G.spawnVehicle('sedan', 276.4, 150, 0);
  G.spawnVehicle('coupe', 283.6, 168, Math.PI);
  G.spawnVehicle('sedan', 290.5, 88, 0);
  G.missions.forceStage('first-run', 1);
  G.dialogue.pin('Marisol Vega', 'Sea on your right, hotel on the clock. Make it pretty, Reno.');
  G.setCamera([287.5, 3.4, 128], [281.5, 1.4, 86]);
}

export const SHOTS = { chase, stats, market, drive };

export function applyShot(G, name) {
  const fn = SHOTS[name];
  if (!fn) return false;
  fn(G);
  return true;
}
