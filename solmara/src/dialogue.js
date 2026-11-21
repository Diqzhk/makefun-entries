// dialogue.js — canvas-drawn portraits (one stylised face per character) and
// the dialogue box queue: lines show in order, each for as long as it takes
// to read, and staged scenes can pin one line in place.
const FACES = {
  'Marisol Vega': { skin: '#8a5a3b', hair: '#241a12', style: 'bun', shirt: '#c94f6d', bg: '#3a2430' },
  'Sana Iqbal':   { skin: '#c98d64', hair: '#173f3a', style: 'scarf', shirt: '#2e8f86', bg: '#17302e' },
  'Wrench Fontana': { skin: '#e8b48c', hair: '#d8b25c', style: 'buzz', shirt: '#5d7dc9', bg: '#232c40' },
  'Reno':         { skin: '#c98d64', hair: '#1d1a17', style: 'crop', shirt: '#e0653f', bg: '#38231c' },
  'SPD Dispatch': { skin: '#b9bec6', hair: '#39414f', style: 'cap', shirt: '#39414f', bg: '#20242c' },
};

export function drawPortrait(canvas, name) {
  const f = FACES[name] || FACES.Reno;
  const g = canvas.getContext('2d');
  const S = canvas.width;
  g.fillStyle = f.bg; g.fillRect(0, 0, S, S);
  // shoulders / shirt
  g.fillStyle = f.shirt;
  g.beginPath();
  g.moveTo(S * 0.16, S); g.lineTo(S * 0.26, S * 0.74); g.lineTo(S * 0.74, S * 0.74);
  g.lineTo(S * 0.84, S); g.closePath(); g.fill();
  // face
  g.fillStyle = f.skin;
  g.beginPath(); g.ellipse(S / 2, S * 0.46, S * 0.21, S * 0.26, 0, 0, Math.PI * 2); g.fill();
  // hair / headwear by style
  g.fillStyle = f.hair;
  if (f.style === 'scarf') {
    g.beginPath(); g.ellipse(S / 2, S * 0.42, S * 0.27, S * 0.31, 0, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(S * 0.23, S * 0.4, S * 0.09, S * 0.42);
    g.fillRect(S * 0.68, S * 0.4, S * 0.09, S * 0.42);
    g.fillStyle = f.skin;
    g.beginPath(); g.ellipse(S / 2, S * 0.47, S * 0.185, S * 0.23, 0, 0, Math.PI * 2); g.fill();
  } else if (f.style === 'bun') {
    g.beginPath(); g.ellipse(S / 2, S * 0.3, S * 0.22, S * 0.13, 0, Math.PI, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(S / 2, S * 0.17, S * 0.09, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffc94d';
    g.beginPath(); g.arc(S * 0.76, S * 0.52, S * 0.035, 0, Math.PI * 2); g.fill();
  } else if (f.style === 'buzz') {
    g.beginPath(); g.ellipse(S / 2, S * 0.31, S * 0.21, S * 0.1, 0, Math.PI, Math.PI * 2); g.fill();
    g.fillStyle = '#b98d4f'; // beard
    g.beginPath(); g.ellipse(S / 2, S * 0.6, S * 0.15, S * 0.1, 0, 0, Math.PI); g.fill();
  } else if (f.style === 'cap') {
    g.fillRect(S * 0.28, S * 0.24, S * 0.44, S * 0.09);
    g.fillRect(S * 0.24, S * 0.31, S * 0.52, S * 0.045);
  } else {
    g.beginPath(); g.ellipse(S / 2, S * 0.29, S * 0.215, S * 0.11, 0, Math.PI, Math.PI * 2); g.fill();
  }
  // eyes + mouth
  g.fillStyle = '#191410';
  g.beginPath(); g.arc(S * 0.43, S * 0.47, S * 0.022, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(S * 0.57, S * 0.47, S * 0.022, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#191410'; g.lineWidth = S * 0.016;
  g.beginPath(); g.moveTo(S * 0.45, S * 0.62); g.lineTo(S * 0.55, S * 0.62); g.stroke();
}

export function createDialogue(els) {
  const queue = [];
  let current = null;
  let pinned = false;
  function render() {
    if (!current) { els.box.classList.add('hidden'); return; }
    els.box.classList.remove('hidden');
    drawPortrait(els.portrait, current.name);
    els.name.textContent = current.name.toUpperCase();
    els.text.textContent = current.text;
  }
  return {
    show(name, text, pinnedLine = false) {
      queue.push({ name, text, left: Math.max(2.4, text.length * 0.052) });
      pinned = pinnedLine;
      if (!current) { current = queue.shift(); render(); }
    },
    pin(name, text) { // staged scenes: one line, held
      current = { name, text, left: 9999 };
      pinned = true;
      render();
    },
    clear() { current = null; queue.length = 0; pinned = false; render(); },
    update(dt) {
      if (!current || pinned) return;
      current.left -= dt;
      if (current.left <= 0) {
        current = queue.shift() || null;
        render();
      }
    },
  };
}
