// Neon Palms Cover Studio — editor wiring.
//
// Loads the fonts and sample photos, holds the cover's state, wires
// every control in the rail to it, and repaints the stage canvas on
// each change. The same file also serves the screenshot scenes: a
// ?shot= parameter fills the window with one finished cover, and
// ?scene=editor stages the editor with a fixed, flattering state.

import { LAYOUTS, panelAt, panelCount, panelsFor } from "./layouts.js";
import { GRADES, buildLut, gradeSwatch } from "./grades.js";
import { drawCover } from "./render.js";

const SIZES = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  landscape: [1920, 1080],
  story: [1080, 1920],
};

const SAMPLES = [
  { src: "samples/palms-sunset.png", name: "Palms at sunset" },
  { src: "samples/neon-street.png", name: "Neon street" },
  { src: "samples/rooftop-dusk.png", name: "Rooftop dusk" },
  { src: "samples/pier-day.png", name: "The pier" },
  { src: "samples/coast-road.png", name: "Coast road" },
];

const state = {
  layoutId: "grid",
  gradeId: "vice-sunset",
  ink: false,
  grain: 0.35,
  spread: false,
  title: "NEON SHORES",
  subtitle: "a palm city story",
  stars: 3,
  sizeId: "square",
  images: [],
  panels: [],
  selected: 0,
  chosenPhoto: 0,
};

const stage = document.getElementById("stage");
const stageCtx = stage.getContext("2d");
let lutCache = { key: "", lut: null };

function currentGrade() {
  return GRADES.find((g) => g.id === state.gradeId) || GRADES[0];
}

function currentLut() {
  if (lutCache.key !== state.gradeId) {
    lutCache = { key: state.gradeId, lut: buildLut(currentGrade()) };
  }
  return lutCache.lut;
}

function renderState() {
  return {
    layoutId: state.layoutId,
    grade: currentGrade(),
    lut: currentLut(),
    ink: state.ink,
    grain: state.grain,
    spread: state.spread,
    title: state.title,
    subtitle: state.subtitle,
    stars: state.stars,
    images: state.images,
    panels: state.panels,
  };
}

function syncPanels() {
  const n = panelCount(state.layoutId);
  while (state.panels.length < n) {
    state.panels.push({ img: state.panels.length % Math.max(1, state.images.length), dx: 0, dy: 0, zoom: 1 });
  }
  state.panels.length = n;
  if (state.selected >= n) state.selected = 0;
}

function activeSlot() {
  return state.spread ? state.panels[0] : state.panels[state.selected];
}

function paint() {
  syncPanels();
  drawCover(stageCtx, stage.width, stage.height, renderState());
  if (!document.body.classList.contains("shot")) drawSelection();
}

function drawSelection() {
  const panels = panelsFor(state.layoutId, stage.width, stage.height, Math.max(6, Math.round(stage.width * 0.008)));
  const panel = state.spread ? null : panels[state.selected];
  if (!panel) return;
  stageCtx.save();
  stageCtx.beginPath();
  if (panel.points) {
    panel.points.forEach(([x, y], i) => (i === 0 ? stageCtx.moveTo(x, y) : stageCtx.lineTo(x, y)));
    stageCtx.closePath();
  } else {
    stageCtx.rect(panel.x, panel.y, panel.w, panel.h);
  }
  stageCtx.setLineDash([10, 7]);
  stageCtx.lineWidth = 3;
  stageCtx.strokeStyle = "#37e0d8";
  stageCtx.stroke();
  stageCtx.restore();
}

function setStageSize() {
  const [w, h] = SIZES[state.sizeId];
  const scale = Math.min(1, 880 / Math.max(w, h));
  stage.width = Math.round(w * scale);
  stage.height = Math.round(h * scale);
}

// ---------- photos ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function addPhoto(src, name) {
  const img = await loadImage(src);
  state.images.push(img);
  buildTray();
  return state.images.length - 1;
}

function buildTray() {
  const tray = document.getElementById("tray");
  tray.textContent = "";
  state.images.forEach((img, i) => {
    const thumb = document.createElement("img");
    thumb.className = "tray-photo" + (i === state.chosenPhoto ? " chosen" : "");
    thumb.src = img.src;
    thumb.alt = `Photo ${i + 1}`;
    thumb.title = "Use this photo in the selected panel";
    thumb.addEventListener("click", () => {
      state.chosenPhoto = i;
      const slot = activeSlot();
      if (slot) slot.img = i;
      buildTray();
      paint();
    });
    tray.appendChild(thumb);
  });
}

async function onFilesChosen(files) {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const idx = await addPhoto(url, file.name);
    const empty = state.panels.findIndex((p, i) => i >= SAMPLES.length || p.img === i);
    if (state.panels[state.selected]) state.panels[state.selected].img = idx;
    state.chosenPhoto = idx;
    if (empty >= 0) state.panels[empty].img = idx;
  }
  buildTray();
  paint();
}

// ---------- control builders ----------

function buildPickers(containerId, items, currentId, onPick, decorate) {
  const box = document.getElementById(containerId);
  box.textContent = "";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pick-button" + (item.id === currentId ? " active" : "");
    btn.textContent = item.name;
    if (decorate) decorate(btn, item);
    btn.addEventListener("click", () => onPick(item.id));
    box.appendChild(btn);
  });
}

function buildControls() {
  buildPickers("layout-list", LAYOUTS, state.layoutId, (id) => {
    state.layoutId = id;
    syncPanels();
    buildControls();
    paint();
  });
  buildPickers(
    "grade-list",
    GRADES,
    state.gradeId,
    (id) => {
      state.gradeId = id;
      buildControls();
      paint();
    },
    (btn, grade) => {
      btn.classList.add("grade-button");
      btn.style.background = gradeSwatch(grade);
    }
  );
}

// ---------- stage interaction ----------

function stagePoint(evt) {
  const rect = stage.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * stage.width,
    y: ((evt.clientY - rect.top) / rect.height) * stage.height,
  };
}

function panelBoxAt(index) {
  const panels = panelsFor(state.layoutId, stage.width, stage.height, Math.max(6, Math.round(stage.width * 0.008)));
  const p = panels[index];
  if (!p) return null;
  return p.points ? { x: p.bx, y: p.by, w: p.bw, h: p.bh } : p;
}

let drag = null;

function wireStage() {
  stage.addEventListener("pointerdown", (evt) => {
    const pt = stagePoint(evt);
    const panels = panelsFor(state.layoutId, stage.width, stage.height, Math.max(6, Math.round(stage.width * 0.008)));
    const hit = panelAt(panels, pt.x, pt.y);
    if (hit >= 0) state.selected = hit;
    const slot = activeSlot();
    if (!slot) return;
    drag = { x: pt.x, y: pt.y, slot };
    stage.classList.add("dragging");
    stage.setPointerCapture(evt.pointerId);
    paint();
  });

  stage.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const pt = stagePoint(evt);
    const box = panelBoxAt(state.spread ? 0 : state.selected);
    const img = state.images[drag.slot.img % state.images.length];
    if (box && img) {
      const scale = Math.max(box.w / img.width, box.h / img.height) * drag.slot.zoom;
      const slackX = box.w - img.width * scale;
      const slackY = box.h - img.height * scale;
      if (slackX < 0) drag.slot.dx = clamp(drag.slot.dx + (2 * (pt.x - drag.x)) / slackX, -1, 1);
      if (slackY < 0) drag.slot.dy = clamp(drag.slot.dy + (2 * (pt.y - drag.y)) / slackY, -1, 1);
    }
    drag.x = pt.x;
    drag.y = pt.y;
    paint();
  });

  const endDrag = () => {
    drag = null;
    stage.classList.remove("dragging");
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("wheel", (evt) => {
    evt.preventDefault();
    const slot = activeSlot();
    if (!slot) return;
    slot.zoom = clamp(slot.zoom * Math.exp(-evt.deltaY * 0.0012), 1, 3.2);
    document.getElementById("zoom-slider").value = Math.round(slot.zoom * 100);
    paint();
  }, { passive: false });

  window.addEventListener("keydown", (evt) => {
    const slot = activeSlot();
    if (!slot || evt.target.tagName === "INPUT" || evt.target.tagName === "SELECT") return;
    const step = evt.shiftKey ? 0.12 : 0.04;
    if (evt.key === "ArrowLeft") slot.dx = clamp(slot.dx - step, -1, 1);
    else if (evt.key === "ArrowRight") slot.dx = clamp(slot.dx + step, -1, 1);
    else if (evt.key === "ArrowUp") slot.dy = clamp(slot.dy - step, -1, 1);
    else if (evt.key === "ArrowDown") slot.dy = clamp(slot.dy + step, -1, 1);
    else return;
    evt.preventDefault();
    paint();
  });
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------- rail wiring ----------

function wireRail() {
  document.getElementById("file-input").addEventListener("change", (evt) => {
    onFilesChosen([...evt.target.files]);
    evt.target.value = "";
  });
  document.getElementById("spread-toggle").addEventListener("change", (evt) => {
    state.spread = evt.target.checked;
    paint();
  });
  document.getElementById("shuffle-button").addEventListener("click", () => {
    // Rotate every panel's photo by one, wrapping around the tray: a
    // one-click way to audition the same layout with fresh pairings.
    if (state.images.length < 2) return;
    state.panels.forEach((slot) => {
      slot.img = (slot.img + 1) % state.images.length;
    });
    state.chosenPhoto = (state.chosenPhoto + 1) % state.images.length;
    buildTray();
    paint();
  });
  document.getElementById("ink-toggle").addEventListener("change", (evt) => {
    state.ink = evt.target.checked;
    paint();
  });
  document.getElementById("grain-slider").addEventListener("input", (evt) => {
    state.grain = Number(evt.target.value) / 100;
    paint();
  });
  document.getElementById("title-input").addEventListener("input", (evt) => {
    state.title = evt.target.value;
    paint();
  });
  document.getElementById("subtitle-input").addEventListener("input", (evt) => {
    state.subtitle = evt.target.value;
    paint();
  });
  const starLabel = () => {
    document.getElementById("star-count").textContent = `${state.stars} ★`;
  };
  document.getElementById("star-up").addEventListener("click", () => {
    state.stars = clamp(state.stars + 1, 0, 5);
    starLabel();
    paint();
  });
  document.getElementById("star-down").addEventListener("click", () => {
    state.stars = clamp(state.stars - 1, 0, 5);
    starLabel();
    paint();
  });
  document.getElementById("zoom-slider").addEventListener("input", (evt) => {
    const slot = activeSlot();
    if (!slot) return;
    slot.zoom = Number(evt.target.value) / 100;
    paint();
  });
  document.getElementById("size-select").addEventListener("change", (evt) => {
    state.sizeId = evt.target.value;
    setStageSize();
    paint();
  });
  document.getElementById("export-button").addEventListener("click", exportPng);
}

function exportPng() {
  const [w, h] = SIZES[state.sizeId];
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  drawCover(out.getContext("2d"), w, h, renderState());
  out.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neon-palms-cover-${state.sizeId}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

// ---------- scenes for screenshots ----------

// Each scene names its panels outright — photo, pan and zoom — framed
// against the samples: the wide landscape hero wants the palms scene's
// lower half (sun and shore), the portrait hero wants the neon street
// shifted left so its pink sign and the car both stay in frame.
const SHOT_SCENES = {
  "cover-landscape": {
    sizeId: "landscape",
    layoutId: "hero-strip",
    gradeId: "vice-sunset",
    stars: 4,
    panels: [
      { img: 0, dx: 0, dy: 0.3, zoom: 1.05 },
      { img: 1, dx: -0.2, dy: 0.1, zoom: 1.1 },
      { img: 3, dx: 0, dy: 0.35, zoom: 1.05 },
    ],
  },
  "cover-portrait": {
    sizeId: "portrait",
    layoutId: "hero-strip",
    gradeId: "neon-night",
    stars: 5,
    panels: [
      { img: 4, dx: -0.35, dy: 0.1, zoom: 1.05 },
      { img: 2, dx: 0, dy: 0.2, zoom: 1.1 },
      { img: 0, dx: 0.1, dy: 0.3, zoom: 1 },
    ],
  },
  "cover-square": {
    sizeId: "square",
    layoutId: "nine",
    gradeId: "bubblegum",
    stars: 3,
    panels: [
      { img: 0, dx: 0, dy: 0.2, zoom: 1.05 },
      { img: 1, dx: -0.2, dy: 0, zoom: 1.1 },
      { img: 2, dx: 0, dy: 0.3, zoom: 1.05 },
      { img: 3, dx: 0, dy: 0.25, zoom: 1 },
      { img: 4, dx: 0.1, dy: 0, zoom: 1.1 },
      { img: 0, dx: -0.3, dy: 0.35, zoom: 1.2 },
      { img: 4, dx: 0, dy: 0.1, zoom: 1.05 },
      { img: 1, dx: 0.3, dy: 0.2, zoom: 1.15 },
      { img: 2, dx: -0.1, dy: 0.4, zoom: 1.1 },
    ],
  },
};

function applyScene(scene) {
  state.sizeId = scene.sizeId;
  state.layoutId = scene.layoutId;
  state.gradeId = scene.gradeId;
  state.stars = scene.stars;
  state.panels = scene.panels.map((slot) => ({ ...slot }));
  document.getElementById("size-select").value = scene.sizeId;
}

// ---------- boot ----------

async function boot() {
  const anton = new FontFace("Anton", "url(fonts/Anton.woff2)");
  const pacifico = new FontFace("Pacifico", "url(fonts/Pacifico.woff2)");
  document.fonts.add(anton);
  document.fonts.add(pacifico);
  await Promise.all([anton.load(), pacifico.load()]);

  for (const sample of SAMPLES) await addPhoto(sample.src, sample.name);

  const params = new URLSearchParams(location.search);
  const shot = params.get("shot");
  if (shot && SHOT_SCENES[shot]) {
    document.body.classList.add("shot");
    applyScene(SHOT_SCENES[shot]);
    const [w, h] = SIZES[state.sizeId];
    stage.width = w;
    stage.height = h;
  } else {
    if (params.get("scene") === "editor") {
      state.layoutId = "grid";
      state.panels = [0, 1, 2, 3].map((img) => ({ img, dx: 0, dy: 0, zoom: 1.12 }));
      state.selected = 0;
      state.stars = 4;
    }
    setStageSize();
  }

  buildControls();
  buildTray();
  wireRail();
  wireStage();
  syncPanels();
  paint();
  document.title = "Neon Palms — Cover Studio";
  window.__neonPalmsReady = true;
}

boot();
