// save.js — localStorage persistence: the running save in slot 1, two more
// slots behind it, deep-merge hydration so an old save never loses a field
// the game has grown since, and per-slot summaries for the stats screen.
export const SAVE_KEY = 'solmara-heat-save-v3';

export function defaultSave() {
  return {
    cash: 250,
    respect: 0,
    station: 0,
    storyDone: [],
    career: {
      stagesDone: 0, taxiRun: 0, taxiEarned: 0, carsStolen: 0,
      distanceDriven: 0, shotsFired: 0, busted: 0, wasted: 0,
    },
  };
}

export function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return over === undefined ? base : over;
  }
  const out = { ...base };
  if (typeof over !== 'object' || over === null) return out;
  for (const k of Object.keys(base)) {
    if (k in over) out[k] = deepMerge(base[k], over[k]);
  }
  return out;
}

function slotKey(i) {
  return i === 1 ? SAVE_KEY : `${SAVE_KEY}::${i}`;
}

export function loadSave(slot = 1) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return defaultSave();
    return deepMerge(defaultSave(), JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(data, slot = 1) {
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(data));
  } catch { /* storage unavailable (private mode): play on unsaved */ }
}

let stagedSlots = null;
export function setStagedSlots(slots) { stagedSlots = slots; }

// Summary of one slot for the stats screen: null when the slot is empty.
export function saveSlotSummary(i) {
  if (stagedSlots) return stagedSlots[i - 1] ?? null;
  try {
    const raw = localStorage.getItem(slotKey(i));
    if (!raw) return null;
    const d = deepMerge(defaultSave(), JSON.parse(raw));
    return {
      cash: d.cash,
      respect: d.respect,
      jobsDone: d.storyDone.length,
      label: null, // stats.js composes the label from these numbers
    };
  } catch {
    return null;
  }
}
