// roadmap.js — the three reading views: the platinum roadmap, the missable
// watch and the sources & about page.
//
// The roadmap is the same 55 trophies grouped into the six stages the data
// file recommends, each with its own progress bar. The missable watch stays
// deliberately short — one card per flagged trophy, then the reasoning —
// because the cited roadmaps flag exactly one trophy and inventing more
// flags would be inventing facts.

import { escapeHtml, gradeLabel, kindLabel } from './icons.js';
import { isMasked, sourceHtml } from './render.js';

const $ = (id) => document.getElementById(id);

/* ---------------- roadmap ---------------- */

function stageRowHtml(trophy, ui, earned) {
  const masked = isMasked(trophy, ui, earned);
  const name = masked ? 'Hidden trophy — spoiler shield on' : escapeHtml(trophy.name);
  const desc = masked ? `${gradeLabel(trophy.grade)} · ${kindLabel(trophy.kind)}` : escapeHtml(trophy.description);
  return `<button type="button" class="stage-row${earned.has(trophy.id) ? ' is-earned' : ''}" data-jump="${trophy.id}">
        <span class="check">${earned.has(trophy.id) ? '✓' : ''}</span>
        <span><span class="sname">${name}</span><br><span class="sdesc">${desc}</span></span>
        <span class="badges"><span class="badge grade-${trophy.grade}">${gradeLabel(trophy.grade)}</span>${trophy.missable ? '<span class="badge missable">Missable</span>' : ''}</span>
      </button>`;
}

function stageHtml(doc, stage, ui, earned) {
  const rows = doc.trophies
    .filter((t) => t.stage === stage.n)
    .sort((a, b) => a.order - b.order || a.id - b.id);
  const got = rows.filter((t) => earned.has(t.id)).length;
  const pct = Math.round((got / rows.length) * 100);
  return `<section class="stage">
      <div class="stage-head">
        <span class="stage-num">Stage ${stage.n} of ${doc.stages.length}</span>
        <h2>${escapeHtml(stage.title)}</h2>
        <span class="stage-progress">${got} of ${rows.length} earned<span class="bar"><span style="width:${pct}%"></span></span></span>
      </div>
      <p class="stage-blurb">${escapeHtml(stage.blurb)}</p>
      <div class="stage-rows">${rows.map((t) => stageRowHtml(t, ui, earned)).join('')}</div>
    </section>`;
}

export function renderRoadmap(doc, ui, earned, handlers) {
  const wrap = $('roadmap');
  wrap.innerHTML = doc.stages.map((stage) => stageHtml(doc, stage, ui, earned)).join('');
  wrap.querySelectorAll('[data-jump]').forEach((el) =>
    el.addEventListener('click', () => handlers.onJump(Number(el.dataset.jump))));
}

/* ---------------- missable watch ---------------- */

function watchCardHtml(trophy) {
  return `<article class="watch-card">
      <span class="badge missable">Missable — flagged by the cited roadmaps</span>
      <h2>${escapeHtml(trophy.name)} <span class="badge grade-${trophy.grade}">${gradeLabel(trophy.grade)}</span></h2>
      <p class="official-line"><i>“${escapeHtml(trophy.description)}”</i> — official description, PlayStation.</p>
      <p><b>Why it is flagged:</b> ${escapeHtml(trophy.missableNote ?? '')}</p>
      <p><b>What to do:</b> ${escapeHtml(trophy.guide)}</p>
      <button type="button" class="chip" data-jump="${trophy.id}">Open its full guide</button>
    </article>`;
}

const WATCH_REASONING = `<div class="prose">
    <h2>How these flags were decided</h2>
    <p>This guide flags a trophy as missable only when a published roadmap or list does, and names the source on the trophy itself. Two independent roadmaps, GTABase and PowerPyx, flag exactly one of the 55 — Positive Mental Attitude — as possibly missable, because a meditation opportunity with Lucia in Chapter 1 counts toward its total of 18 spots and whether that one is required is unconfirmed (reported by EGamers.io; the Chapter 1 detail is in Leonida Interactive\u2019s unlock guide). No other trophy on the official list is flagged missable by any source this guide cites, and the same roadmaps report that a single playthrough is enough for the platinum.</p>
    <h2>Two standing warnings</h2>
    <ul>
      <li><b>Leave cheats off.</b> GTABase and TechWiser report that using cheats disables trophies and saving, so a trophy run is a no-cheats run from the first mission.</li>
      <li><b>Hidden is not missable.</b> 28 of the 55 trophies are hidden on PlayStation until earned — the story chapters and missions, the character storylines and a handful of open-world secrets. Hidden only means PlayStation does not show the name in advance; it says nothing about being able to miss it. The spoiler shield in the checklist hides the same trophies here until you earn them.</li>
    </ul>
  </div>`;

export function renderMissableWatch(doc, handlers) {
  const wrap = $('missable-watch');
  const cards = doc.trophies.filter((t) => t.missable).map(watchCardHtml).join('');
  wrap.innerHTML = cards + WATCH_REASONING;
  wrap.querySelectorAll('[data-jump]').forEach((el) =>
    el.addEventListener('click', () => handlers.onJump(Number(el.dataset.jump))));
}

/* ---------------- sources & about ---------------- */

export function renderAbout(doc) {
  const items = doc.sources.map((s) => `<li>${sourceHtml(s)}</li>`).join('');
  $('about').innerHTML = `<div class="prose">
    <h2>About this guide</h2>
    <p>Leonida Legend is a complete, offline guide and tracker for the 55 PlayStation 5 trophies of Grand Theft Auto VI: 1 platinum, 2 gold, 6 silver and 46 bronze, 28 of them hidden on PlayStation until earned. Every trophy is here under its official name, with its official description and grade, a guide written for this page, the steps to earn it, and the sources its facts come from.</p>
    <h2>How the tracker works</h2>
    <ul>
      <li><b>Progress saves in your browser</b> (localStorage) the moment you tick a trophy, and survives reloads. Nothing is uploaded anywhere.</li>
      <li><b>Export progress</b> downloads a small JSON file of your earned trophies; <b>Import progress</b> reads one back in, on this or any other machine. A plain list of trophy names is accepted too.</li>
      <li><b>Filters</b> narrow the list by kind (story, missable, collectibles, activities, free roam — and online, which this list does not use), by grade, and by a search over names, descriptions and guides.</li>
      <li><b>The spoiler shield</b> hides the names and descriptions of story trophies — and of every trophy PlayStation itself hides — until you earn them. It is on by default; untick it in the checklist toolbar to read everything.</li>
      <li><b>Counted trophies</b> (250 stunts, 42 Shooting Range challenges, 100 WAiNK locations…) show the count PlayStation tracks on their rows and in their guides, so you always know the size of the job.</li>
    </ul>
    <h2>Where the facts come from</h2>
    <p>The trophy list itself — every name, description, grade, hidden flag and tracked count — is the official PlayStation list, as published and as listed by Exophase and PSNProfiles on 2026-11-18. Strategy and roadmap judgements (difficulty, the one missable flag, the cheats warning, the shape of the 100% checklist) come from the published guides below, and each trophy\u2019s own page names the sources used for it. Guide text is this page\u2019s own words throughout: sources are cited, never copied.</p>
    <ul>${items}</ul>
    <p class="muted">An unofficial fan work, made for a make.fun bounty. It is not affiliated with Rockstar Games or PlayStation, shows none of their artwork, and makes no network requests: the source links above open only if you choose to follow them.</p>
  </div>`;
}
