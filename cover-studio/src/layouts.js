// Panel geometry for the cover layouts.
//
// Every layout is described in fractions of the finished cover, so the
// same arrangement works at any export size. panelsFor() turns the
// fractions into pixel panels, insetting rectangles by half the gutter
// so neighbouring panels share one clean dark seam.

export const LAYOUTS = [
  { id: "grid", name: "Cover Grid", note: "One hero panel over three" },
  { id: "hero-strip", name: "Hero & Strip", note: "Big panel, two stacked beside it" },
  { id: "duo", name: "Duo Split", note: "Two portraits side by side" },
  { id: "slash", name: "Slash Duo", note: "Two panels cut on a diagonal" },
  { id: "nine", name: "Nine Panels", note: "The full 3 by 3 cover grid" },
  { id: "bleed", name: "Full Bleed", note: "One photo, edge to edge" },
];

const FRACTIONS = {
  grid: [
    { x: 0, y: 0, w: 1, h: 0.56 },
    { x: 0, y: 0.56, w: 1 / 3, h: 0.44 },
    { x: 1 / 3, y: 0.56, w: 1 / 3, h: 0.44 },
    { x: 2 / 3, y: 0.56, w: 1 / 3, h: 0.44 },
  ],
  "hero-strip": [
    { x: 0, y: 0, w: 0.6, h: 1 },
    { x: 0.6, y: 0, w: 0.4, h: 0.5 },
    { x: 0.6, y: 0.5, w: 0.4, h: 0.5 },
  ],
  duo: [
    { x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5, y: 0, w: 0.5, h: 1 },
  ],
  nine: [
    { x: 0, y: 0, w: 1 / 3, h: 1 / 3 },
    { x: 1 / 3, y: 0, w: 1 / 3, h: 1 / 3 },
    { x: 2 / 3, y: 0, w: 1 / 3, h: 1 / 3 },
    { x: 0, y: 1 / 3, w: 1 / 3, h: 1 / 3 },
    { x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 },
    { x: 2 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 },
    { x: 0, y: 2 / 3, w: 1 / 3, h: 1 / 3 },
    { x: 1 / 3, y: 2 / 3, w: 1 / 3, h: 1 / 3 },
    { x: 2 / 3, y: 2 / 3, w: 1 / 3, h: 1 / 3 },
  ],
  bleed: [{ x: 0, y: 0, w: 1, h: 1 }],
};

// The slash layout is the one polygon: two panels divided by a diagonal
// seam that leans with the canvas, drawn as points rather than a rect.
const SLASH_POINTS = [
  [
    [0, 0],
    [0.62, 0],
    [0.38, 1],
    [0, 1],
  ],
  [
    [0.62, 0],
    [1, 0],
    [1, 1],
    [0.38, 1],
  ],
];

export function panelCount(layoutId) {
  if (layoutId === "slash") return SLASH_POINTS.length;
  return (FRACTIONS[layoutId] || FRACTIONS.grid).length;
}

// Pixel panels for a layout on a W by H canvas. Rect panels carry
// { x, y, w, h }; polygon panels carry { points, bx, by, bw, bh } where
// the b* fields are the bounding box the photo is fitted into.
export function panelsFor(layoutId, W, H, gutter) {
  if (layoutId === "slash") {
    return SLASH_POINTS.map((pts) => {
      const points = pts.map(([fx, fy]) => [fx * W, fy * H]);
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const bx = Math.min(...xs);
      const by = Math.min(...ys);
      return {
        points,
        bx,
        by,
        bw: Math.max(...xs) - bx,
        bh: Math.max(...ys) - by,
      };
    });
  }
  const half = gutter / 2;
  return (FRACTIONS[layoutId] || FRACTIONS.grid).map((f) => ({
    x: f.x * W + (f.x > 0 ? half : 0),
    y: f.y * H + (f.y > 0 ? half : 0),
    w: f.w * W - (f.x > 0 ? half : 0) - (f.x + f.w < 1 ? half : 0),
    h: f.h * H - (f.y > 0 ? half : 0) - (f.y + f.h < 1 ? half : 0),
  }));
}

// Hit test used by the editor: which panel, if any, holds point (x, y)?
export function panelAt(panels, x, y) {
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    if (p.points) {
      if (pointInPolygon(x, y, p.points)) return i;
    } else if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      return i;
    }
  }
  return -1;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
