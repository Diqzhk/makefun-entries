// icons.js — shared display helpers for every view.
//
// The only artwork in the guide is the trophy cup, and it is drawn here as
// SVG paths in code (original line work in the public-domain shape of a
// loving cup — no game art, no logos). The rest of the module is text
// plumbing: escaping, grade/kind labels and the tracked-count phrasing the
// rows and detail panel share.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ESCAPES[ch]);
}

// The cup, as six filled shapes over a 100x80 canvas; GRADE fills them with
// the grade's CSS colour variable at render time.
const CUP_SHAPES = [
  'M24 6h52v12c0 15-11 25-26 25S24 33 24 18z',
  'M24 11C12 11 8 19 9 27c1 10 9 16 18 17l-1-9c-5-1-9-4-9-8s2-7 7-8z',
  'M76 11c12 0 16 8 15 16-1 10-9 16-18 17l1-9c5-1 9-4 9-8s-2-7-7-8z',
  'M44 45h12v12H44z',
  'M35 57h30l3 9H32z',
  'M27 66h46v10H27z',
];

export function cupSvg(grade, className) {
  const shapes = CUP_SHAPES.map((d) => `<path d="${d}" fill="var(--${grade})"/>`).join('');
  return `<svg class="${className}" viewBox="0 0 100 80" aria-hidden="true" focusable="false">${shapes}</svg>`;
}

export const GRADE_ORDER = Object.freeze({ platinum: 0, gold: 1, silver: 2, bronze: 3 });

export function gradeLabel(grade) {
  return grade[0].toUpperCase() + grade.slice(1);
}

const KIND_LABELS = Object.freeze({
  story: 'Story',
  activities: 'Activities',
  collectibles: 'Collectibles',
  freeroam: 'Free roam',
  completion: 'Completion',
  platinum: 'Platinum',
});

export function kindLabel(kind) {
  return KIND_LABELS[kind] ?? kind;
}

// How a tracked count reads on a badge: "x 42 Shooting Range challenges",
// "$250,000 laundered", or the completion percentage spelled out.
export function countText(trophy) {
  if (trophy.count == null) return '';
  if (trophy.countLabel === '% completion') return '100% completion';
  if (trophy.countLabel.startsWith('dollars')) {
    return `$${trophy.count.toLocaleString('en-US')} ${trophy.countLabel.slice('dollars '.length)}`;
  }
  return `× ${trophy.count} ${trophy.countLabel}`;
}
