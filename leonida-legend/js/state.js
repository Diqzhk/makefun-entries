// state.js — the tracker's memory.
//
// Earned trophies live in the browser's localStorage under one key, so a
// reader can close the page and come back to the same checklist. The same
// set can leave the browser as a small JSON download and come back through
// the import control; the import also understands a bare array of ids and a
// bare array of trophy names, which is what simpler checklists export.
// Nothing in this module goes near the network.

const KEY = 'leonida-legend-progress-v1';
const FORMAT = { app: 'leonida-legend-tracker', version: 1 };

function idsFromPayload(parsed) {
  const list = Array.isArray(parsed) ? parsed : parsed?.earned;
  if (!Array.isArray(list)) return null;
  return list.filter((value) => Number.isInteger(value));
}

export function loadEarned() {
  try {
    const ids = idsFromPayload(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    return new Set(ids ?? []);
  } catch {
    return new Set(); // storage blocked or corrupt: start empty, still usable
  }
}

export function saveEarned(earned) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...FORMAT, earned: [...earned] }));
  } catch {
    // A full or blocked store must not break the session's tracking.
  }
}

export function exportProgress(earned) {
  const sorted = [...earned].sort((a, b) => a - b);
  const blob = new Blob([JSON.stringify({ ...FORMAT, earned: sorted }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'leonida-legend-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importProgress(file, trophies) {
  const parsed = JSON.parse(await file.text());
  const items = Array.isArray(parsed) ? parsed : parsed?.earned;
  if (!Array.isArray(items)) throw new Error('that file holds no earned list');
  const validIds = new Set(trophies.map((t) => t.id));
  const idByName = new Map(trophies.map((t) => [t.name, t.id]));
  const earned = new Set();
  for (const item of items) {
    if (Number.isInteger(item) && validIds.has(item)) earned.add(item);
    else if (typeof item === 'string' && idByName.has(item)) earned.add(idByName.get(item));
  }
  return earned;
}
