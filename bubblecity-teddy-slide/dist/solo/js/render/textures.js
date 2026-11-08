// Small procedural textures drawn on canvases: speed-strip chevrons, the finish checker, printed banner and
// sign boards, and a soft glow sprite. (Wood and the room come from scanned assets in /assets.)
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

export function chevronTexture() {
  // Chevrons pointing toward +U (canvas right), two per tile.
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff8c00';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff1a8';
  for (let i = 0; i < 2; i++) {
    const x = i * (S / 2);
    ctx.beginPath();
    ctx.moveTo(x + S * 0.06, S * 0.08);
    ctx.lineTo(x + S * 0.26, S * 0.08);
    ctx.lineTo(x + S * 0.46, S * 0.5);
    ctx.lineTo(x + S * 0.26, S * 0.92);
    ctx.lineTo(x + S * 0.06, S * 0.92);
    ctx.lineTo(x + S * 0.26, S * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  return finish(c);
}

export function checkerTexture() {
  const S = 128;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#1c1c22' : '#f6f2ea';
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  return finish(c);
}

// Canvas size multiplier for printed boards: phones use half size (a stage has dozens of signs and banners, ~25 MB
// of textures with mips at full size, and they rarely cover more than a few hundred pixels on a phone).
let textScale = 1;
export function setTextScale(k) {
  textScale = k;
}

// Printed banner / sign: a lacquered board with a fine inset rule and condensed italic type.
export function textTexture(text, { bg = '#2e66c2', fg = '#ffffff', w = 1024, h = 150 } = {}) {
  w = Math.round(w * textScale);
  h = Math.round(h * textScale);
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shade(bg, 1.12));
  g.addColorStop(1, shade(bg, 0.82));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(2, h * 0.025);
  ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  let size = h * 0.66;
  const font = (px) => `italic 800 ${px}px "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.font = font(size);
  const label = text.toUpperCase().split('').join(String.fromCharCode(8202));
  while (ctx.measureText(label).width > w * 0.84 && size > 10) {
    size -= 3;
    ctx.font = font(size);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(label, w / 2, h / 2 + size * 0.04);
  return finish(c, { repeat: false });
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Soft radial glow sprite (dust motes, sparkles).
export function glowTexture() {
  const S = 64;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c, { repeat: false });
}

