// render.js — the checklist view: header progress, kind chips, trophy rows
// and the detail panel.
//
// The spoiler shield is enforced here, at render time, not in the data: a
// trophy the reader has not earned yet is masked when it is a story trophy
// or one PlayStation itself hides, and a masked trophy shows neither its
// name nor its description (and cannot be found by searching, either).

import { GRADE_ORDER, countText, cupSvg, escapeHtml, gradeLabel, kindLabel } from './icons.js';

export const KIND_FILTERS = [
  { key: 'all', label: 'All 55' },
  { key: 'story', label: 'Story' },
  { key: 'missable', label: 'Missable' },
  { key: 'collectibles', label: 'Collectibles' },
  { key: 'activities', label: 'Activities' },
  { key: 'freeroam', label: 'Free roam' },
  { key: 'online', label: 'Online' },
];

const $ = (id) => document.getElementById(id);

/* ---------------- filtering ---------------- */

export function isMasked(trophy, ui, earned) {
  return ui.spoiler && !earned.has(trophy.id) && (trophy.hidden || trophy.kind === 'story');
}

export function trophyMatchesKind(trophy, kindKey) {
  switch (kindKey) {
    case 'all': return true;
    case 'missable': return trophy.missable;
    case 'online': return trophy.kind === 'online';
    default: return trophy.kind === kindKey;
  }
}

function matchesSearch(trophy, query, masked) {
  if (query === '') return true;
  if (masked) return false;
  const text = [trophy.name, trophy.description, trophy.guide, ...trophy.steps].join(' ').toLowerCase();
  return text.includes(query);
}

const SORTERS = {
  roadmap: (a, b) => a.stage - b.stage || a.order - b.order || a.id - b.id,
  list: (a, b) => a.id - b.id,
  grade: (a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || a.id - b.id,
  name: (a, b) => a.name.localeCompare(b.name),
};

export function visibleTrophies(doc, ui, earned) {
  const query = ui.search.trim().toLowerCase();
  const kept = doc.trophies.filter((trophy) =>
    trophyMatchesKind(trophy, ui.kind) &&
    (ui.grade === 'all' || trophy.grade === ui.grade) &&
    !(ui.hideEarned && earned.has(trophy.id)) &&
    matchesSearch(trophy, query, isMasked(trophy, ui, earned)));
  return kept.sort(SORTERS[ui.sort] ?? SORTERS.roadmap);
}

/* ---------------- header and chips ---------------- */

export function renderHeader(doc, earned) {
  const total = doc.trophies.length;
  const done = earned.size;
  $('big-percent').textContent = `${Math.round((done / total) * 100)}%`;
  $('big-count').textContent = `${done} of ${total} earned`;
  $('big-bar-fill').style.width = `${(done / total) * 100}%`;
  $('grade-tallies').innerHTML = ['platinum', 'gold', 'silver', 'bronze'].map((grade) => {
    const inGrade = doc.trophies.filter((t) => t.grade === grade);
    const got = inGrade.filter((t) => earned.has(t.id)).length;
    return `<span class="tally"><span class="dot" style="background:var(--${grade})"></span>${gradeLabel(grade)} <b>${got}/${inGrade.length}</b></span>`;
  }).join('');
}

export function renderKindChips(doc, ui) {
  $('kind-chips').innerHTML = KIND_FILTERS.map(({ key, label }) => {
    const n = doc.trophies.filter((t) => trophyMatchesKind(t, key)).length;
    return `<button type="button" class="chip${ui.kind === key ? ' is-active' : ''}" data-kind="${key}">${label}<span class="n">${n}</span></button>`;
  }).join('');
}

/* ---------------- rows ---------------- */

function badgeRow(trophy) {
  const badges = [`<span class="badge grade-${trophy.grade}">${gradeLabel(trophy.grade)}</span>`];
  if (trophy.missable) badges.push('<span class="badge missable">Missable</span>');
  if (trophy.hidden) badges.push('<span class="badge hidden-badge">Hidden on PSN</span>');
  const count = countText(trophy);
  if (count) badges.push(`<span class="badge count">${escapeHtml(count)}</span>`);
  return badges.join('');
}

function rowHtml(trophy, ui, earned, selectedId) {
  const masked = isMasked(trophy, ui, earned);
  const name = masked ? 'Hidden trophy — spoiler shield on' : escapeHtml(trophy.name);
  const desc = masked
    ? `${gradeLabel(trophy.grade)} · ${kindLabel(trophy.kind)} · earn it (or lift the shield) to reveal it`
    : escapeHtml(trophy.description);
  const classes = ['row'];
  if (earned.has(trophy.id)) classes.push('is-earned');
  if (selectedId === trophy.id) classes.push('is-selected');
  if (masked) classes.push('is-masked');
  return `<div class="${classes.join(' ')}" data-row="${trophy.id}">
      <button type="button" class="check" data-toggle="${trophy.id}" aria-label="Toggle earned for ${masked ? 'a hidden trophy' : escapeHtml(trophy.name)}">${earned.has(trophy.id) ? '✓' : ''}</button>
      <button type="button" class="row-main" data-select="${trophy.id}">
        ${cupSvg(trophy.grade, 'cup')}
        <span class="names"><span class="tname">${name}</span><br><span class="tdesc">${desc}</span></span>
        <span class="badges">${badgeRow(trophy)}</span>
      </button>
    </div>`;
}

const ONLINE_NOTE = ' — the published PS5 list has no online trophies; every one of the 55 is offline and single-player.';
const ONLINE_EMPTY = 'Nothing to show: the official PlayStation 5 list for GTA VI contains no online trophies — all 55 are earned offline in single player (EGamers.io\u2019s list summary). The Online filter stays so the set matches the kinds the list could have had.';

export function renderList(doc, ui, earned, selectedId, handlers) {
  const list = visibleTrophies(doc, ui, earned);
  const wrap = $('trophy-list');
  $('result-count').textContent = `${list.length} of ${doc.trophies.length} trophies shown` + (ui.kind === 'online' ? ONLINE_NOTE : '');
  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-note">${ui.kind === 'online' ? ONLINE_EMPTY : 'No trophy matches those filters. Loosen the search or pick another kind.'}</div>`;
    return;
  }
  wrap.innerHTML = list.map((t) => rowHtml(t, ui, earned, selectedId)).join('');
  wrap.querySelectorAll('[data-toggle]').forEach((el) =>
    el.addEventListener('click', () => handlers.onToggle(Number(el.dataset.toggle))));
  wrap.querySelectorAll('[data-select]').forEach((el) =>
    el.addEventListener('click', () => handlers.onSelect(Number(el.dataset.select))));
}

/* ---------------- detail panel ---------------- */

// A source line becomes label + link when it carries an https URL.
export function sourceHtml(source) {
  const at = source.indexOf('https://');
  if (at === -1) return escapeHtml(source);
  const label = source.slice(0, at).replace(/[:\s]+$/, '');
  const url = source.slice(at).replace(/[.)]+$/, '');
  return `${escapeHtml(label)}: <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
}

function metaBadges(trophy) {
  const badges = [
    `<span class="badge grade-${trophy.grade}">${gradeLabel(trophy.grade)}</span>`,
    `<span class="badge">${kindLabel(trophy.kind)}</span>`,
    `<span class="badge">Roadmap stage ${trophy.stage}</span>`,
  ];
  if (trophy.hidden) badges.push('<span class="badge hidden-badge">Hidden on PSN</span>');
  if (trophy.missable) badges.push('<span class="badge missable">Missable</span>');
  return badges.join('');
}

function maskedDetail(trophy, handlers) {
  return `${cupSvg(trophy.grade, 'cup-lg')}
      <h2>Hidden trophy</h2>
      <p class="official"><span class="official-label">Spoiler shield</span>Its name and description stay hidden until you earn it.</p>
      <div class="meta-row">${metaBadges(trophy)}</div>
      <p>This is a ${kindLabel(trophy.kind).toLowerCase()} trophy you have not earned yet. The spoiler shield hides story trophies (and every trophy PlayStation itself hides) so a first playthrough stays a surprise. Turn the shield off above to read it now, or mark it earned when it pops.</p>
      <button type="button" class="earn-btn" data-earn="${trophy.id}">Mark as earned</button>`;
}

function fullDetail(trophy, earned) {
  const got = earned.has(trophy.id);
  const count = countText(trophy);
  return `${cupSvg(trophy.grade, 'cup-lg')}
    <h2>${escapeHtml(trophy.name)}</h2>
    <p class="official"><span class="official-label">Official description — PlayStation</span>${escapeHtml(trophy.description)}</p>
    <div class="meta-row">${metaBadges(trophy)}</div>
    ${count ? `<div class="count-box">PlayStation tracks this one: <b>${escapeHtml(count)}</b>. Tick the trophy here when the in-game count completes.</div>` : ''}
    ${trophy.missable ? `<div class="missable-box"><b>Missable — read before you play on.</b><br>${escapeHtml(trophy.missableNote ?? '')}</div>` : ''}
    <h3>How to earn it</h3>
    <p>${escapeHtml(trophy.guide)}</p>
    <h3>Steps</h3>
    <ol class="steps">${trophy.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    <h3>Sources</h3>
    <ul class="sources">${trophy.sources.map((s) => `<li>${sourceHtml(s)}</li>`).join('')}</ul>
    <button type="button" class="earn-btn${got ? ' is-earned' : ''}" data-earn="${trophy.id}">${got ? '✓ Earned — tap to undo' : 'Mark as earned'}</button>`;
}

const PLACEHOLDER = `<p class="placeholder">Pick any trophy on the left and its guide opens here: the official description, how to earn it in this guide\u2019s own words, the steps, and the sources every fact comes from.</p>
    <p class="placeholder">The platinum roadmap tab lays the same 55 trophies out in the order to earn them, and the missable watch tab explains the one trophy the published roadmaps flag as missable.</p>`;

export function renderDetail(doc, ui, earned, selectedId, handlers) {
  const panel = $('detail');
  const trophy = doc.trophies.find((t) => t.id === selectedId);
  if (!trophy) {
    panel.innerHTML = PLACEHOLDER;
    return;
  }
  panel.innerHTML = isMasked(trophy, ui, earned) ? maskedDetail(trophy, handlers) : fullDetail(trophy, earned);
  panel.querySelector('[data-earn]').addEventListener('click', () => handlers.onToggle(trophy.id));
}
