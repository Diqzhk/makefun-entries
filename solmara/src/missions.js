// missions.js — five story jobs for two contacts, each in stages with an
// objective, a "then" line and a voice line at the start of every stage, plus
// the repeatable taxi work. Timed stages pay a clean-run bonus when they are
// beaten with more than a quarter of the clock to spare.
import { PLACES } from './world.js';

const place = (id) => PLACES.find((p) => p.id === id);

export const MISSIONS = [
  {
    id: 'first-run', title: 'First Run', contact: 'Marisol Vega', pay: 300, respect: 60,
    stages: [
      { obj: 'Pick up the package at the Hideout', next: 'Then: deliver it to the Palms Hotel', at: place('hideout'),
        line: 'Package waits at the Hideout, Reno. Quick hands, quiet streets.' },
      { obj: 'Deliver the package to the Palms Hotel', next: 'Final stage of this job', at: place('hotel'),
        line: 'The hotel is expecting. Make it pretty, Reno.' },
    ],
  },
  {
    id: 'hot-goods', title: 'Hot Goods', contact: 'Marisol Vega', pay: 450, respect: 80,
    stages: [
      { obj: 'Reach the Harbor Side warehouse row', next: 'Then: run the goods to the Chop Shop', at: { x: -224, z: 224 },
        line: 'Crates are already warm, Reno. Get to Harbor Side before they cool.' },
      { obj: 'Run the goods to the Chop Shop', next: 'Then: bring the money home to the Hideout', at: place('chop'),
        line: 'Chop Shop pays cash and asks nothing. My favourite kind of friend.' },
      { obj: 'Bring the money home to the Hideout', next: 'Final stage of this job', at: place('hideout'),
        line: 'Home stretch. If the SPD sniffs you, the crew is a call away.' },
    ],
  },
  {
    id: 'night-market', title: 'Night Market Run', contact: 'Marisol Vega', pay: 520, respect: 90,
    stages: [
      { obj: 'Pick up the package at the Old Market stall', next: 'Then: deliver it to Solmara Marina', at: place('market'),
        line: 'Third stall from the fountain, Reno. The silk bundle — and do not haggle with Sari tonight.' },
      { obj: 'Deliver the package to Solmara Marina', next: 'Final stage of this job', at: place('marina'),
        line: 'A boat is idling at the Marina. It does not wait, and neither do I.' },
    ],
  },
  {
    id: 'golden-mile', title: 'Golden Mile', contact: 'Sana Iqbal', pay: 650, respect: 120,
    stages: [
      { obj: 'Hit the strand checkpoint at South Beach', next: 'Then: thread the Golden Mile north', at: { x: 280, z: 224 }, time: 75,
        line: 'Checkpoints are lit, Reno. Strand, south end. I will call the gaps.' },
      { obj: 'Thread the Golden Mile — hit the strand checkpoint', next: 'Then: drop Sana at Solmara Marina', at: { x: 280, z: -40 }, time: 74,
        line: 'Badges on our six and a block up the strand — punch it, Reno, I will call the gaps.' },
      { obj: 'Drop Sana at Solmara Marina', next: 'Final stage of this job', at: place('marina'),
        line: 'Marina, then we are ghosts. Keep her smooth.' },
    ],
  },
  {
    id: 'harbor-heat', title: 'Harbor Heat', contact: 'Sana Iqbal', pay: 800, respect: 150,
    stages: [
      { obj: 'Meet the harbour contact at Harbor Side', next: 'Then: shake the tail and reach the Old Market', at: { x: -280, z: 168 },
        line: 'Harbour contact wears yellow. If a grey sedan watches, we are made.' },
      { obj: 'Shake the tail and reach the Old Market', next: 'Then: finish at the Hideout', at: place('market'), time: 90,
        line: 'Tail confirmed. Lose them in the market streets, Reno.' },
      { obj: 'Finish at the Hideout', next: 'Final stage of this job', at: place('hideout'),
        line: 'One more block. The city is ours tonight.' },
    ],
  },
];

export function createMissions(ctx) {
  const done = new Set();
  let current = null;   // {mission, stageIdx, timerLeft}
  let taxi = null;      // {dest, fare}

  function stageTarget() {
    if (taxi) return taxi.dest;
    if (!current) return null;
    return current.mission.stages[current.stageIdx].at;
  }

  function beginStage() {
    const st = current.mission.stages[current.stageIdx];
    current.timerLeft = st.time || 0;
    ctx.setMarker(st.at.x, st.at.z);
    if (st.line) ctx.dialogue.show(current.mission.contact, st.line);
  }

  const api = {
    get current() { return current; },
    get taxi() { return taxi; },
    isDone(id) { return done.has(id); },
    markDone(id) { done.add(id); },
    target() { return stageTarget(); },
    doneCount() { return done.size; },
    startNext() {
      const m = MISSIONS.find((x) => !done.has(x.id));
      if (!m) { current = null; ctx.setMarker(null); return null; }
      current = { mission: m, stageIdx: 0, timerLeft: 0 };
      taxi = null;
      beginStage();
      return m;
    },
    startTaxi(dest) {
      if (current || taxi) return false;
      const from = ctx.playerPos();
      const dist = Math.hypot(dest.x - from.x, dest.z - from.z);
      const fare = Math.round((dist * 0.55) / 5) * 5;
      taxi = { dest, fare, dist, elapsed: 0 };
      ctx.setMarker(dest.x, dest.z);
      ctx.dialogue.show('Reno', `Fare accepted — ${dist | 0} metres, $${fare} on the meter. Beat the traffic and they tip.`);
      return true;
    },
    // staged scenes drive the panel directly
    forceStage(missionId, stageIdx) {
      const m = MISSIONS.find((x) => x.id === missionId);
      if (!m) return;
      for (const x of MISSIONS) if (MISSIONS.indexOf(x) < MISSIONS.indexOf(m)) done.add(x.id);
      current = { mission: m, stageIdx, timerLeft: m.stages[stageIdx].time || 0 };
      const st = m.stages[stageIdx];
      ctx.setMarker(st.at.x, st.at.z);
    },
    view() {
      if (taxi) {
        return {
          kick: 'TAXI FARE', title: 'Off the Books Cabs', stageText: 'FARE',
          stageIdx: 0, stages: 1, objective: `Take the fare to ${taxi.dest.name}`,
          next: `Fare on arrival: $${taxi.fare}`, timerLeft: 0, time: 0,
        };
      }
      if (!current) return null;
      const m = current.mission;
      const st = m.stages[current.stageIdx];
      return {
        kick: `MISSION · ${m.contact.toUpperCase()}`,
        title: m.title,
        stageText: `STAGE ${current.stageIdx + 1}/${m.stages.length}`,
        stageIdx: current.stageIdx, stages: m.stages.length,
        objective: st.obj, next: st.next,
        timerLeft: current.timerLeft, time: st.time || 0,
      };
    },
    update(dt, pos) {
      const tgt = stageTarget();
      if (!tgt) return;
      if (taxi) taxi.elapsed += dt;
      if (current && current.timerLeft > 0) {
        current.timerLeft -= dt;
        if (current.timerLeft <= 0) {
          // blown clock: the stage restarts, the contact is not pleased
          const st = current.mission.stages[current.stageIdx];
          current.timerLeft = st.time;
          ctx.dialogue.show(current.mission.contact, 'Too slow. The window moved — run it again.');
          ctx.audio.blip(220);
          return;
        }
      }
      const dist = Math.hypot(tgt.x - pos.x, tgt.z - pos.z);
      if (dist > 8) return;
      if (taxi) {
        // a fare beaten home faster than traffic pace earns a 25% tip
        const tip = taxi.elapsed < taxi.dist / 9 ? Math.ceil(taxi.fare * 0.25 / 5) * 5 : 0;
        const fare = taxi.fare;
        taxi = null;
        ctx.setMarker(null);
        ctx.onTaxiPaid(fare, tip);
        api.startNext();
        return;
      }
      const m = current.mission;
      const st = m.stages[current.stageIdx];
      ctx.career.stagesDone++;
      if (current.stageIdx + 1 < m.stages.length) {
        current.stageIdx++;
        beginStage();
        ctx.audio.blip(990);
      } else {
        let bonus = 0;
        if (st.time && current.timerLeft > st.time * 0.25) bonus = 40;
        done.add(m.id);
        current = null;
        ctx.setMarker(null);
        ctx.onMissionPaid(m, bonus);
        api.startNext();
      }
    },
  };
  return api;
}
