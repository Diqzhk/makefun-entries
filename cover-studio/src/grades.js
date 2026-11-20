// Colour grades as gradient maps.
//
// Each grade is a ramp of colour stops over the photo's brightness.
// buildLut() bakes a ramp into a 256-entry lookup table, and
// gradePixels() rewrites an ImageData through it: a pixel's luminance
// picks its new colour, and a little of the original colour is mixed
// back (each grade's `keep`) so faces and fabrics do not go flat.
// The ink mode quantises luminance to a few flat bands first, which
// turns the same ramp into a screen-print poster.

export const GRADES = [
  {
    id: "vice-sunset",
    name: "Vice Sunset",
    keep: 0.3,
    stops: [
      [0.0, [18, 10, 44]],
      [0.32, [96, 24, 92]],
      [0.58, [214, 58, 102]],
      [0.8, [255, 132, 74]],
      [1.0, [255, 228, 166]],
    ],
  },
  {
    id: "neon-night",
    name: "Neon Night",
    keep: 0.22,
    stops: [
      [0.0, [4, 12, 24]],
      [0.35, [10, 62, 92]],
      [0.6, [20, 168, 178]],
      [0.82, [240, 66, 168]],
      [1.0, [214, 248, 255]],
    ],
  },
  {
    id: "golden-hour",
    name: "Golden Hour",
    keep: 0.38,
    stops: [
      [0.0, [26, 16, 10]],
      [0.35, [110, 58, 24]],
      [0.62, [208, 116, 40]],
      [0.85, [250, 190, 96]],
      [1.0, [255, 244, 214]],
    ],
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    keep: 0.3,
    stops: [
      [0.0, [30, 14, 62]],
      [0.35, [104, 44, 158]],
      [0.6, [236, 92, 168]],
      [0.82, [120, 196, 246]],
      [1.0, [240, 252, 255]],
    ],
  },
  {
    id: "noir-teal",
    name: "Noir Teal",
    keep: 0.12,
    stops: [
      [0.0, [6, 14, 16]],
      [0.4, [22, 62, 66]],
      [0.7, [86, 148, 146]],
      [1.0, [226, 244, 238]],
    ],
  },
  {
    id: "chrome-dusk",
    name: "Chrome Dusk",
    keep: 0.26,
    stops: [
      [0.0, [12, 12, 22]],
      [0.34, [52, 54, 88]],
      [0.58, [116, 128, 168]],
      [0.8, [232, 148, 178]],
      [1.0, [246, 240, 255]],
    ],
  },
];

// A CSS gradient of the same ramp, for the editor's swatch buttons.
export function gradeSwatch(grade) {
  const parts = grade.stops.map(
    ([pos, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${Math.round(pos * 100)}%`
  );
  return `linear-gradient(100deg, ${parts.join(", ")})`;
}

function smooth(a, b, t) {
  const u = t * t * (3 - 2 * t);
  return a + (b - a) * u;
}

// Bake one grade's ramp into per-channel lookup tables.
export function buildLut(grade) {
  const lut = { r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256) };
  const stops = grade.stops;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const [p0, c0] = stops[s];
    const [p1, c1] = stops[s + 1];
    const f = p1 > p0 ? (t - p0) / (p1 - p0) : 0;
    lut.r[i] = smooth(c0[0], c1[0], f);
    lut.g[i] = smooth(c0[1], c1[1], f);
    lut.b[i] = smooth(c0[2], c1[2], f);
  }
  return lut;
}

// Rewrite pixels through a grade. When ink is on, luminance is first
// snapped to `inkLevels` flat bands, the posterised screen-print look.
export function gradePixels(imageData, lut, grade, ink, inkLevels) {
  const data = imageData.data;
  const keep = grade.keep;
  const lift = 1 - keep;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    if (ink) {
      const band = Math.round((lum / 255) * (inkLevels - 1));
      lum = Math.round((band / (inkLevels - 1)) * 255);
    }
    data[i] = lut.r[lum] * lift + r * keep;
    data[i + 1] = lut.g[lum] * lift + g * keep;
    data[i + 2] = lut.b[lum] * lift + b * keep;
  }
  return imageData;
}
