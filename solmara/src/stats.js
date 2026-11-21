// stats.js — the career ledger: rank ladder, completion strands, and the city
// map both the minimap and the full stats screen draw with.
import { DISTRICTS, PLACES, ROAD_CENTERS } from './world.js';

export const RANKS = [
  { name: 'COURIER', at: 0 },
  { name: 'WHEELMAN', at: 800 },
  { name: 'FIXER', at: 1600 },
  { name: 'RUNNER', at: 2600 },
  { name: 'GHOST', at: 4000 },
  { name: 'KINGPIN', at: 6000 },
];

export function rankFor(respect) {
  let i = 0;
  while (i + 1 < RANKS.length && respect >= RANKS[i + 1].at) i++;
  const cur = RANKS[i];
  const next = RANKS[i + 1] || null;
  return {
    name: cur.name,
    next: next ? next.name : null,
    toNext: next ? next.at - respect : 0,
    frac: next ? (respect - cur.at) / (next.at - cur.at) : 1,
  };
}

export function createCareer() {
  return {
    stagesDone: 0, taxiRun: 0, taxiEarned: 0, carsStolen: 0,
    distanceDriven: 0, shotsFired: 0, busted: 0, wasted: 0,
  };
}

// The four completion strands + the ledger, as one view model. When a staged
// stats block is supplied (screenshot scenes), it wins outright.
export function computeStats({ cash, respect, career, jobsDone, staged }) {
  if (staged) return staged;
  const strands = [
    { label: 'Story jobs', v: Math.min(55, career.stagesDone * 3 + jobsDone * 2), m: 55 },
    { label: 'Taxi fares', v: Math.min(15, career.taxiRun), m: 15 },
    { label: 'Cars taken', v: Math.min(15, career.carsStolen), m: 15 },
    { label: 'Ground covered', v: Math.min(15, Math.floor(career.distanceDriven / 6000)), m: 15 },
  ];
  const pct = Math.round(strands.reduce((a, s) => a + s.v / s.m, 0) / strands.length * 100);
  const ledger = [
    ['Cash on hand', `$${cash.toLocaleString('en-US')}`],
    ['Story jobs done', `${jobsDone} / 5`],
    ['Taxi fares run', `${career.taxiRun}`],
    ['Taxi earnings', `$${career.taxiEarned.toLocaleString('en-US')}`],
    ['Cars stolen', `${career.carsStolen}`],
    ['Distance driven', `${(career.distanceDriven / 1000).toFixed(1)} km`],
    ['Shots fired', `${career.shotsFired}`],
    ['Times busted', `${career.busted}`],
    ['Times wasted', `${career.wasted}`],
  ];
  return { pct, strands, ledger };
}

// Draw the whole city: districts, roads, named places, the GPS route and the
// blips. Used at 880×700 on the stats screen and at 196×196 on the minimap
// (opts.mini shrinks the labels).
export function drawCityMap(canvas, view, opts = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = opts.mini ? 4 : 14;
  const sx = (x) => pad + (x + 340) / 680 * (W - pad * 2);
  const sz = (z) => pad + (z + 340) / 680 * (H - pad * 2);
  g.fillStyle = '#0d1420';
  g.fillRect(0, 0, W, H);
  // sea + beach
  g.fillStyle = '#175d7d';
  g.fillRect(sx(336), 0, W - sx(336), H);
  g.fillStyle = '#dcbd85';
  g.fillRect(sx(300), 0, sx(336) - sx(300), H);
  // districts
  for (const d of DISTRICTS) {
    g.fillStyle = d.tint + '2e';
    g.fillRect(sx(d.x0), sz(d.z0), sx(d.x1) - sx(d.x0), sz(d.z1) - sz(d.z0));
    g.fillStyle = 'rgba(240,238,230,.85)';
    g.font = `700 ${opts.mini ? 8 : 15}px "Segoe UI", Arial`;
    g.textAlign = 'center';
    g.fillText(d.name.toUpperCase(), sx((d.x0 + d.x1) / 2), sz((d.z0 + d.z1) / 2) + (opts.mini ? 0 : d.name === 'City Centre' ? 58 : -46));
  }
  // roads
  g.strokeStyle = 'rgba(200,210,225,.28)';
  g.lineWidth = opts.mini ? 1 : 2;
  for (const c of ROAD_CENTERS) {
    g.beginPath(); g.moveTo(sx(c), sz(-336)); g.lineTo(sx(c), sz(336)); g.stroke();
    g.beginPath(); g.moveTo(sx(-336), sz(c)); g.lineTo(sx(336), sz(c)); g.stroke();
  }
  // named places
  if (!opts.mini) {
    g.font = '600 12px "Segoe UI", Arial';
    for (const p of PLACES) {
      g.fillStyle = '#ffd97a';
      g.beginPath(); g.arc(sx(p.x), sz(p.z), 3.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(240,238,230,.75)';
      if (p.x > 180) { g.textAlign = 'right'; g.fillText(p.name, sx(p.x) - 7, sz(p.z) + 4); }
      else { g.textAlign = 'left'; g.fillText(p.name, sx(p.x) + 7, sz(p.z) + 4); }
    }
  }
  // GPS route: an L along the streets from player to objective
  if (view.objective) {
    g.strokeStyle = '#ffc94d';
    g.lineWidth = opts.mini ? 2 : 3;
    g.setLineDash([7, 6]);
    g.beginPath();
    g.moveTo(sx(view.px), sz(view.pz));
    g.lineTo(sx(view.objective.x), sz(view.pz));
    g.lineTo(sx(view.objective.x), sz(view.objective.z));
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#ffc94d';
    g.beginPath(); g.arc(sx(view.objective.x), sz(view.objective.z), opts.mini ? 4 : 7, 0, Math.PI * 2); g.stroke();
  }
  // police blips
  for (const u of view.units || []) {
    g.fillStyle = u.kind === 'heli' ? '#ffd94d' : '#ff5347';
    g.beginPath(); g.arc(sx(u.x), sz(u.z), opts.mini ? 2.5 : 4.5, 0, Math.PI * 2); g.fill();
  }
  // player arrow
  const px = sx(view.px), pz = sz(view.pz);
  g.save();
  g.translate(px, pz);
  g.rotate(Math.PI - view.heading);
  g.fillStyle = '#ffffff';
  const r = opts.mini ? 5 : 8;
  g.beginPath();
  g.moveTo(0, -r); g.lineTo(r * 0.65, r); g.lineTo(0, r * 0.45); g.lineTo(-r * 0.65, r);
  g.closePath(); g.fill();
  g.restore();
}
