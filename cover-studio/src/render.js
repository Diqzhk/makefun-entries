// The cover renderer: panels, graded photos, lettering and finish.
//
// drawCover() paints a whole cover onto a 2D context at any size, from
// a plain state object, so the editor preview and the PNG export are
// the same drawing at different resolutions. Photos are graded on a
// scratch canvas per panel, then clipped into the panel's shape.

import { panelsFor } from "./layouts.js";
import { gradePixels } from "./grades.js";

const INK_LEVELS = 5;

// Small deterministic random source, so the grain is the same on
// every render of the same cover (preview matches export).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
function noiseTile() {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = 144;
  c.height = 144;
  const g = c.getContext("2d");
  const img = g.createImageData(144, 144);
  const rnd = mulberry32(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function scratch(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Where a photo lands inside a box when cover-fitted: dx and dy run
// from -1 (pinned to the start) through 0 (centred) to 1 (the end).
function fitRect(img, bw, bh, dx, dy, zoom) {
  const scale = Math.max(bw / img.width, bh / img.height) * zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  return {
    x: (bw - w) * (0.5 + dx / 2),
    y: (bh - h) * (0.5 + dy / 2),
    w,
    h,
  };
}

// Grade one photo into a scratch canvas of bw by bh, cover-fitted.
function gradedPhoto(img, bw, bh, dx, dy, zoom, lut, grade, ink) {
  const c = scratch(bw, bh);
  const g = c.getContext("2d");
  const f = fitRect(img, bw, bh, dx, dy, zoom);
  g.drawImage(img, f.x, f.y, f.w, f.h);
  const data = g.getImageData(0, 0, c.width, c.height);
  gradePixels(data, lut, grade, ink, INK_LEVELS);
  g.putImageData(data, 0, 0);
  return c;
}

function panelPath(ctx, panel) {
  ctx.beginPath();
  if (panel.points) {
    panel.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  } else {
    ctx.rect(panel.x, panel.y, panel.w, panel.h);
  }
}

function panelBox(panel) {
  if (panel.points) return { x: panel.bx, y: panel.by, w: panel.bw, h: panel.bh };
  return panel;
}

// A stand-in scene for a panel with no photo yet: sunset, sun, palms.
// The sky is tinted through the current grade's own ramp, so an empty
// panel already sits in the cover's colour world.
function lutTone(lut, hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = Math.round(0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255));
  return `rgb(${lut.r[lum]}, ${lut.g[lum]}, ${lut.b[lum]})`;
}

function drawPlaceholder(ctx, box, state) {
  const { x, y, w, h } = box;
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, lutTone(state.lut, "#241448"));
  sky.addColorStop(0.55, lutTone(state.lut, "#8c2a5e"));
  sky.addColorStop(0.78, lutTone(state.lut, "#e8803c"));
  sky.addColorStop(0.781, lutTone(state.lut, "#1d4a56"));
  sky.addColorStop(1, lutTone(state.lut, "#0d2f3d"));
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const sunR = Math.min(w, h) * 0.26;
  const sunX = x + w * 0.5;
  const sunY = y + h * 0.78 - sunR * 0.4;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.4);
  glow.addColorStop(0, "rgba(255, 214, 140, 0.85)");
  glow.addColorStop(1, "rgba(255, 140, 80, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ffd98c";
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(10, 6, 20, 0.9)";
  palmSilhouette(ctx, x + w * 0.16, y + h * 0.99, h * 0.52);
  palmSilhouette(ctx, x + w * 0.86, y + h * 0.99, h * 0.4);
}

function palmSilhouette(ctx, baseX, baseY, height) {
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(8, 5, 16, 0.95)";
  ctx.lineWidth = height * 0.045;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(height * 0.06, -height * 0.5, height * 0.02, -height * 0.82);
  ctx.stroke();
  const topX = height * 0.02;
  const topY = -height * 0.82;
  ctx.lineWidth = height * 0.032;
  for (const a of [-2.9, -2.35, -1.8, -1.25, -0.7, -0.2]) {
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(a) * height * 0.22,
      topY + Math.sin(a) * height * 0.22 - height * 0.05,
      topX + Math.cos(a) * height * 0.4,
      topY + Math.sin(a) * height * 0.4 + height * 0.13
    );
    ctx.stroke();
  }
  ctx.restore();
}

// The studio's own badge: a sun over waves inside a ring, palm fronds
// on top. Drawn with paths so it stays original art, not a logo copy.
export function drawEmblem(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 8, 22, 0.72)";
  ctx.fill();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = "#ffc857";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.18, r * 0.34, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = "#ff5da2";
  ctx.fill();
  ctx.strokeStyle = "#37e0d8";
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = "round";
  for (const off of [0.42, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy + r * off);
    ctx.quadraticCurveTo(cx - r * 0.2, cy + r * (off - 0.14), cx + r * 0.1, cy + r * off);
    ctx.quadraticCurveTo(cx + r * 0.35, cy + r * (off + 0.12), cx + r * 0.58, cy + r * off);
    ctx.stroke();
  }
  ctx.strokeStyle = "#ffc857";
  ctx.lineWidth = r * 0.06;
  for (const a of [-2.7, -2.1, -1.55, -1.0, -0.45]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.28);
    ctx.quadraticCurveTo(
      cx + Math.cos(a) * r * 0.4,
      cy - r * 0.28 + Math.sin(a) * r * 0.4,
      cx + Math.cos(a) * r * 0.72,
      cy - r * 0.28 + Math.sin(a) * r * 0.72 + r * 0.16
    );
    ctx.stroke();
  }
  ctx.restore();
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawHeatStars(ctx, W, stars, unit) {
  const r = unit * 0.30;
  const gap = unit * 0.78;
  const top = unit * 0.52;
  for (let i = 0; i < 5; i++) {
    const cx = W - unit * 0.55 - (4 - i) * gap;
    starPath(ctx, cx, top, r);
    if (i < stars) {
      ctx.fillStyle = "#ffc857";
      ctx.shadowColor = "rgba(255, 160, 40, 0.8)";
      ctx.shadowBlur = unit * 0.12;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "rgba(10, 8, 20, 0.45)";
      ctx.fill();
      ctx.lineWidth = unit * 0.045;
      ctx.strokeStyle = "rgba(255, 220, 150, 0.85)";
      ctx.stroke();
    }
  }
}

function fitFontSize(ctx, text, family, maxWidth, startSize, minSize) {
  let size = startSize;
  ctx.font = `${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size *= 0.92;
    ctx.font = `${size}px ${family}`;
  }
  return size;
}

function drawLettering(ctx, W, H, state) {
  const unit = W / 54; // one design unit, scales with the cover
  // Scrim so the lettering sits on the art without fighting it.
  const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
  scrim.addColorStop(0, "rgba(8, 4, 16, 0)");
  scrim.addColorStop(0.6, "rgba(8, 4, 16, 0.45)");
  scrim.addColorStop(1, "rgba(8, 4, 16, 0.9)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  drawHeatStars(ctx, W, state.stars, unit);
  drawEmblem(ctx, unit * 1.65, unit * 1.65, unit * 1.18);

  const title = (state.title || "").trim();
  const subtitle = (state.subtitle || "").trim();
  const centreX = W / 2;
  let cursorY = H - unit * 1.1;

  if (title) {
    const size = fitFontSize(ctx, title.toUpperCase(), "Anton, sans-serif", W * 0.92, unit * 5.4, unit * 1.4);
    ctx.font = `${size}px Anton, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const grad = ctx.createLinearGradient(0, cursorY - size, 0, cursorY);
    grad.addColorStop(0, "#fff3b0");
    grad.addColorStop(0.45, "#ffb35c");
    grad.addColorStop(0.78, "#ff5da2");
    grad.addColorStop(1, "#e83e8c");
    ctx.lineWidth = size / 14;
    ctx.strokeStyle = "#20081c";
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = size / 6;
    ctx.shadowOffsetY = size / 22;
    ctx.strokeText(title.toUpperCase(), centreX, cursorY);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = grad;
    ctx.fillText(title.toUpperCase(), centreX, cursorY);
    cursorY -= size * 1.08;
  }

  if (subtitle) {
    const size = fitFontSize(ctx, subtitle, "Pacifico, cursive", W * 0.8, unit * 2.5, unit * 0.9);
    ctx.font = `${size}px Pacifico, cursive`;
    ctx.textAlign = "center";
    ctx.save();
    ctx.translate(centreX, cursorY);
    ctx.rotate(-0.028);
    ctx.shadowColor = "rgba(55, 224, 216, 0.9)";
    ctx.shadowBlur = size / 2.4;
    ctx.fillStyle = "#a8fff8";
    ctx.fillText(subtitle, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#37e0d8";
    ctx.fillText(subtitle, 0, 0);
    ctx.restore();
  }
}

// Paint the whole cover described by state onto ctx at W by H.
export function drawCover(ctx, W, H, state) {
  const gutter = Math.max(6, Math.round(W * 0.008));
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#170f2c");
  bg.addColorStop(1, "#07050e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const panels = panelsFor(state.layoutId, W, H, gutter);

  if (state.spread && state.images.length > 0) {
    const first = state.panels[0] || { img: 0, dx: 0, dy: 0, zoom: 1 };
    const img = state.images[first.img % state.images.length];
    const layer = gradedPhoto(img, W, H, first.dx, first.dy, first.zoom, state.lut, state.grade, state.ink);
    panels.forEach((panel) => {
      ctx.save();
      panelPath(ctx, panel);
      ctx.clip();
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    });
  } else {
    panels.forEach((panel, i) => {
      const box = panelBox(panel);
      const slot = state.panels[i] || { img: i, dx: 0, dy: 0, zoom: 1 };
      ctx.save();
      panelPath(ctx, panel);
      ctx.clip();
      const img = state.images.length ? state.images[slot.img % state.images.length] : null;
      if (img) {
        const layer = gradedPhoto(img, box.w, box.h, slot.dx, slot.dy, slot.zoom, state.lut, state.grade, state.ink);
        ctx.drawImage(layer, box.x, box.y);
      } else {
        drawPlaceholder(ctx, box, state);
      }
      ctx.restore();
    });
  }

  // Seams and a soft inner shade on every panel edge.
  panels.forEach((panel) => {
    panelPath(ctx, panel);
    ctx.lineWidth = gutter;
    ctx.strokeStyle = "#07050e";
    ctx.stroke();
    panelPath(ctx, panel);
    ctx.lineWidth = Math.max(1.5, gutter * 0.18);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.stroke();
  });

  // Vignette.
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vig.addColorStop(0, "rgba(6, 2, 12, 0)");
  vig.addColorStop(1, "rgba(6, 2, 12, 0.4)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Film grain.
  if (state.grain > 0) {
    ctx.save();
    ctx.globalAlpha = state.grain * 0.15;
    ctx.fillStyle = ctx.createPattern(noiseTile(), "repeat");
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawLettering(ctx, W, H, state);

  // Poster frame: a black edge and a fine gold keyline inside it.
  ctx.lineWidth = Math.max(4, W * 0.006);
  ctx.strokeStyle = "#05040a";
  ctx.strokeRect(0, 0, W, H);
  ctx.lineWidth = Math.max(1.5, W * 0.0022);
  ctx.strokeStyle = "rgba(255, 200, 87, 0.55)";
  const inset = Math.max(6, W * 0.011);
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
}
