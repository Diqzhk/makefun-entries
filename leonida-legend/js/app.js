// app.js — Leonida Legend's wiring.
//
// One small state object holds everything the URL can deep-link (view,
// filters, sort, search, shield, selection); the toolbar, tabs and import
// control write into it, and every change ends in the same paint() call,
// which re-renders each view from the data plus the earned set. The only
// file fetched is the guide's own data/trophies.json beside this page.

import { exportProgress, importProgress, loadEarned, saveEarned } from './state.js';
import { renderDetail, renderHeader, renderKindChips, renderList } from './render.js';
import { renderAbout, renderMissableWatch, renderRoadmap } from './roadmap.js';

const VIEWS = ['list', 'roadmap', 'missable', 'about'];

function stateFromUrl() {
  const q = new URLSearchParams(location.search);
  return {
    view: q.get('view') ?? 'list',
    kind: q.get('kind') ?? 'all',
    grade: q.get('grade') ?? 'all',
    sort: q.get('sort') ?? 'roadmap',
    search: q.get('search') ?? '',
    spoiler: q.get('spoiler') !== '0',
    hideEarned: q.get('hide') === '1',
    selected: Number(q.get('trophy') ?? 17),
  };
}

const ui = stateFromUrl();
const doc = await (await fetch('data/trophies.json')).json();
let earned = loadEarned();

const handlers = {
  onToggle(id) {
    earned.has(id) ? earned.delete(id) : earned.add(id);
    saveEarned(earned);
    paint();
  },
  onSelect(id) {
    ui.selected = id;
    paint();
  },
  onJump(id) {
    ui.selected = id;
    showView('list');
    paint();
    document.querySelector(`[data-row="${id}"]`)?.scrollIntoView({ block: 'center' });
  },
};

function showView(view) {
  ui.view = view;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('is-active', tab.dataset.view === view);
  }
  for (const section of document.querySelectorAll('.view')) {
    section.hidden = section.id !== `view-${view}`;
  }
}

function paint() {
  renderHeader(doc, earned);
  renderKindChips(doc, ui);
  renderList(doc, ui, earned, ui.selected, handlers);
  renderDetail(doc, ui, earned, ui.selected, handlers);
  renderRoadmap(doc, ui, earned, handlers);
  renderMissableWatch(doc, handlers);
  renderAbout(doc);
}

function on(id, event, fn) {
  document.getElementById(id).addEventListener(event, fn);
}

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => { showView(tab.dataset.view); paint(); }));
on('kind-chips', 'click', (event) => {
  const chip = event.target.closest('[data-kind]');
  if (chip) { ui.kind = chip.dataset.kind; paint(); }
});
on('search', 'input', (event) => { ui.search = event.target.value; paint(); });
on('grade-filter', 'change', (event) => { ui.grade = event.target.value; paint(); });
on('sort-order', 'change', (event) => { ui.sort = event.target.value; paint(); });
on('spoiler-toggle', 'change', (event) => { ui.spoiler = event.target.checked; paint(); });
on('hide-earned', 'change', (event) => { ui.hideEarned = event.target.checked; paint(); });
on('export-btn', 'click', () => exportProgress(earned));
on('import-file', 'change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    earned = await importProgress(file, doc.trophies);
    saveEarned(earned);
    paint();
  } catch {
    alert('That file did not contain importable progress. Export a progress file from this tracker and import that.');
  }
});

// Start from the deep-linked state: controls first, then view, then paint.
document.getElementById('search').value = ui.search;
document.getElementById('grade-filter').value = ui.grade;
document.getElementById('sort-order').value = ui.sort;
document.getElementById('spoiler-toggle').checked = ui.spoiler;
document.getElementById('hide-earned').checked = ui.hideEarned;
showView(VIEWS.includes(ui.view) ? ui.view : 'list');
paint();
