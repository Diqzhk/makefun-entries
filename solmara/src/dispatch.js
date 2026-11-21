// dispatch.js — the SPD dispatch board's data: which units are hunting Reno,
// what each is doing, and how far away it is. AIR ONE pins to the top whenever
// the helicopter is up.
export function buildDispatch(police, targetPos) {
  const rows = [];
  if (police.heliActive) {
    rows.push({ call: 'AIR ONE', role: 'SPOTLIGHT', dist: 20 });
  }
  const all = [...police.units, ...police.blockers].map((v) => ({
    call: v.callsign || 'UNIT',
    role: v.role || 'INTERCEPT',
    dist: Math.round(Math.hypot(v.pos.x - targetPos.x, v.pos.z - targetPos.z)),
  }));
  all.sort((a, b) => a.dist - b.dist);
  for (const r of all) {
    if (rows.length >= 6) break;
    rows.push(r);
  }
  return {
    rows,
    total: all.length + (police.heliActive ? 1 : 0),
  };
}
