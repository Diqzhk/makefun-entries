// hud.js — every panel on the screen: mission card, dispatch board, weapons,
// crew, vehicle, vitals, minimap and the full stats/map screen. The DOM lives
// in index.html; this module keeps it honest, a few times a second.
import { drawPortrait } from './dialogue.js';
import { buildDispatch } from './dispatch.js';
import { drawCityMap, rankFor, computeStats } from './stats.js';
import { saveSlotSummary } from './save.js';
import { MISSIONS } from './missions.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

export function createHud(G) {
  const els = {
    mission: $('missionPanel'), mKick: $('missionKick'), mTitle: $('missionTitle'),
    stageText: $('stageText'), stagePips: $('stagePips'), objective: $('objective'),
    nextLine: $('nextLine'), timerLine: $('timerLine'),
    dispatch: $('dispatchPanel'), dCount: $('dispatchCount'), dRows: $('dispatchRows'), dFoot: $('dispatchFoot'),
    stars: $('stars'), cash: $('cashLine'), rankName: $('rankName'), respectBar: $('respectBar'),
    clock: $('clockLine'), weapons: $('weapons'), crew: $('crew'),
    vehPanel: $('vehiclePanel'), vehName: $('vehName'), dmgBar: $('dmgBar'), dmgPct: $('dmgPct'),
    radio: $('radioLine'), mapBox: $('mapBox'), minimap: $('minimap'),
    districtName: $('districtName'), standingBar: $('standingBar'),
    vitals: $('vitals'), healthBar: $('healthBar'), armourBar: $('armourBar'),
    healthNum: $('healthNum'), armourNum: $('armourNum'),
    speedo: $('speedo'), speedNum: $('speedNum'),
    stats: $('statsScreen'), statsClock: $('statsClock'), ringCanvas: $('ringCanvas'),
    ringNum: $('ringNum'), strands: $('strandList'), jobs: $('jobList'),
    cityMap: $('cityMap'), rankBig: $('rankBig'), respectLine: $('respectLine'),
    ledger: $('ledger'), slots: $('slotList'),
    footDistrict: $('footDistrict'), footStanding: $('footStanding'), footRank: $('footRank'),
    flash: $('flashOverlay'), flashTitle: $('flashTitle'), flashText: $('flashText'),
  };

  // weapon slots, built once
  const wEls = G.weapons.slots.map((s, i) => {
    const d = document.createElement('div');
    d.className = 'wslot';
    d.innerHTML = `<div class="wk">${i + 1}</div><div class="wn">${s.tag}</div><div class="wa"></div>`;
    els.weapons.appendChild(d);
    return d;
  });
  // crew cards, built once
  const cEls = G.crew.members.map((m) => {
    const d = document.createElement('div');
    d.className = 'crewCard';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 104;
    drawPortrait(cv, m.name);
    const info = document.createElement('div');
    info.className = 'cinfo';
    info.innerHTML = `<div class="cname">${m.name}</div><div class="crole">${m.role}</div>` +
      `<div class="cabil">${m.ability}</div><div class="cdwrap"><div class="cdbar"></div></div>`;
    const key = document.createElement('div');
    key.className = 'ckey'; key.textContent = `[${m.key}]`;
    d.append(cv, info, key);
    els.crew.appendChild(d);
    return { root: d, bar: info.querySelector('.cdbar') };
  });

  let slowT = 0, flashLeft = 0;

  function flash(title, text, dur = 2.6) {
    els.flashTitle.textContent = title;
    els.flashTitle.style.color = title === 'BUSTED' ? '#57b6ff' : '#ff5347';
    els.flashText.textContent = text;
    els.flash.classList.remove('hidden');
    flashLeft = dur;
  }

  function renderStats() {
    const staged = G.stagedStats || null;
    const view = computeStats({
      cash: G.cash, respect: G.respect, career: G.career,
      jobsDone: G.missions.doneCount(), staged,
    });
    // completion ring
    const rc = els.ringCanvas.getContext('2d');
    rc.clearRect(0, 0, 300, 300);
    rc.lineWidth = 17;
    rc.strokeStyle = '#2b3342';
    rc.beginPath(); rc.arc(150, 150, 128, 0, Math.PI * 2); rc.stroke();
    rc.strokeStyle = '#ffc94d';
    rc.beginPath();
    rc.arc(150, 150, 128, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (view.pct / 100));
    rc.stroke();
    els.ringNum.textContent = `${view.pct}%`;
    els.strands.innerHTML = view.strands.map((s) =>
      `<div class="strand"><span class="sl">${s.label}</span><span class="sw"><span class="sb" style="width:${Math.round(s.v / s.m * 100)}%"></span></span><span class="sv">${s.v} / ${s.m}</span></div>`).join('');
    // story jobs
    const cur = G.missions.current;
    els.jobs.innerHTML = MISSIONS.map((m) => {
      if (G.missions.isDone(m.id)) return `<div class="jobRow"><span>✓ ${m.title}</span><span class="st">★★★</span></div>`;
      if (cur && cur.mission.id === m.id) return `<div class="jobRow cur"><span>▸ ${m.title}</span><span>STAGE ${cur.stageIdx + 1}</span></div>`;
      if (MISSIONS.findIndex((x) => !G.missions.isDone(x.id)) === MISSIONS.indexOf(m))
        return `<div class="jobRow"><span>· ${m.title}</span><span></span></div>`;
      return `<div class="jobRow lock"><span>· ${m.title}</span><span>—</span></div>`;
    }).join('');
    // rank + ledger
    const rank = rankFor(G.respect);
    els.rankBig.textContent = rank.name;
    els.respectLine.textContent = rank.next
      ? `${G.respect.toLocaleString('en-US')} respect · ${rank.toNext.toLocaleString('en-US')} to ${rank.next}`
      : `${G.respect.toLocaleString('en-US')} respect · top of the ladder`;
    els.ledger.innerHTML = view.ledger.map(([k, v]) =>
      `<div class="ledgerRow"><span>${k}</span><b>${v}</b></div>`).join('');
    // slots
    els.slots.innerHTML = [1, 2, 3].map((i) => {
      const s = saveSlotSummary(i);
      if (!s) return `<div class="slot empty"><div class="sh"><span>SLOT ${i}</span><span>EMPTY</span></div>No run recorded here yet.</div>`;
      const head = s.head || `JOB ${s.jobsDone} OF 5 ON THE BOARD`;
      const r = s.rank || rankFor(s.respect).name;
      return `<div class="slot"><div class="sh"><span>SLOT ${i}</span><span>${head}</span></div>` +
        `$${s.cash.toLocaleString('en-US')} · ${s.respect.toLocaleString('en-US')} respect · ${r}</div>`;
    }).join('');
    els.statsClock.textContent = els.clock.textContent;
    els.footDistrict.textContent = (G.districtName || 'CITY CENTRE').toUpperCase();
    els.footStanding.textContent = `${Math.round(G.standing)}`;
    els.footRank.textContent = rank.name;
    drawCityMap(els.cityMap, {
      px: G.player.pos.x, pz: G.player.pos.z, heading: G.player.heading,
      units: G.mapUnits(), objective: G.objectivePos(),
    });
  }

  function update(dt) {
    if (flashLeft > 0) {
      flashLeft -= dt;
      if (flashLeft <= 0) els.flash.classList.add('hidden');
    }
    slowT -= dt;
    const slow = slowT <= 0;
    if (slow) slowT = 0.2;

    // stars + cash + rank + clock (cheap text, but only when changed)
    const w = G.police.wanted;
    if (update._w !== w) {
      update._w = w;
      [...els.stars.children].forEach((s, i) => s.className = i < w ? 'lit' : '');
    }
    if (update._cash !== G.cash) { update._cash = G.cash; els.cash.textContent = fmt(G.cash); }
    const rank = rankFor(G.respect);
    if (update._rank !== rank.name) { update._rank = rank.name; els.rankName.textContent = rank.name; }
    els.respectBar.style.width = `${Math.round(rank.frac * 100)}%`;
    const hh = Math.floor(G.gameTime) % 24, mm = Math.floor((G.gameTime % 1) * 60);
    els.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

    // mission panel
    const mv = G.missions.view();
    if (mv) {
      els.mission.classList.remove('hidden');
      if (slow) {
        els.mKick.textContent = mv.kick;
        els.mTitle.textContent = mv.title;
        els.stageText.textContent = mv.stageText;
        els.objective.textContent = mv.objective;
        els.nextLine.textContent = `▸ ${mv.next.replace(/^Then: /, 'Then: ')}`;
        els.stagePips.innerHTML = Array.from({ length: mv.stages }, (_, i) =>
          `<span class="pip ${i < mv.stageIdx ? 'done' : i === mv.stageIdx ? 'on' : ''}"></span>`).join('');
      }
      if (mv.time > 0) {
        els.timerLine.classList.remove('hidden');
        const left = Math.max(0, Math.ceil(mv.timerLeft));
        els.timerLine.textContent = `⏱ ${left}s on the clock`;
        els.timerLine.classList.toggle('urgent', mv.timerLeft < 15);
        els.mission.classList.toggle('urgent', mv.timerLeft < 15);
      } else {
        els.timerLine.classList.add('hidden');
        els.mission.classList.remove('urgent');
      }
    } else els.mission.classList.add('hidden');

    // dispatch board
    const showDispatch = w > 0 || (G.flags.badgeScan || 0) > 0;
    if (showDispatch && slow) {
      const d = buildDispatch(G.police, G.player.pos);
      els.dispatch.classList.remove('hidden');
      els.dCount.textContent = `${d.total} UNITS`;
      els.dRows.innerHTML = d.rows.map((r) =>
        `<div class="drow"><b>${r.call}</b><span class="role">${r.role}</span><span class="dist">${r.dist} M</span></div>`).join('');
      els.dFoot.textContent = `${d.total} UNITS · CITYWIDE HUNT${d.rows.length < d.total ? ` · +${d.total - d.rows.length} MORE` : ''}`;
    } else if (!showDispatch) els.dispatch.classList.add('hidden');

    // weapons + crew
    if (slow) {
      G.weapons.slots.forEach((s, i) => {
        wEls[i].classList.toggle('sel', i === G.weapons.current);
        wEls[i].querySelector('.wa').textContent = G.weapons.ammoText(s);
      });
      G.crew.members.forEach((m, i) => {
        cEls[i].bar.style.width = `${Math.round((1 - m.cooldown / m.cooldownMax) * 100)}%`;
        cEls[i].root.classList.toggle('cooling', m.cooldown > 0);
      });
    }

    // vehicle panel + speedo
    const v = G.currentVehicle;
    if (v) {
      els.vehPanel.classList.remove('hidden');
      els.speedo.classList.remove('hidden');
      els.vehName.textContent = v.name;
      const dmg = Math.round(v.damage);
      els.dmgBar.style.width = `${100 - dmg}%`;
      els.dmgBar.style.background = dmg > 66 ? '#ff5347' : dmg > 33 ? '#ffc94d' : '#7dd069';
      els.dmgPct.textContent = `${dmg}%`;
      const st = G.audio.station;
      els.radio.innerHTML = `♪ ${st.name} <span>${st.tag}</span>`;
      els.speedNum.textContent = `${Math.abs(Math.round(v.speed * 3.6))}`;
    } else {
      els.vehPanel.classList.add('hidden');
      els.speedo.classList.add('hidden');
    }

    // vitals + district
    els.healthBar.style.width = `${G.player.health}%`;
    els.armourBar.style.width = `${G.player.armour}%`;
    els.healthNum.textContent = `${Math.ceil(G.player.health)}`;
    els.armourNum.textContent = `${Math.ceil(G.player.armour)}`;
    if (update._dist !== G.districtName) {
      update._dist = G.districtName;
      els.districtName.textContent = (G.districtName || '').toUpperCase();
    }
    els.standingBar.style.width = `${Math.round(G.standing)}%`;

    // minimap
    drawCityMap(els.minimap, {
      px: G.player.pos.x, pz: G.player.pos.z,
      heading: G.inVehicle ? G.currentVehicle.heading : G.player.heading,
      units: G.mapUnits(), objective: G.objectivePos(),
    }, { mini: true });

    if (G.statsOpen) renderStats();
  }

  return { els, update, flash, renderStats };
}
