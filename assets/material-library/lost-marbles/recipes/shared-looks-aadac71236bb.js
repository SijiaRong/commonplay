// Marble workshop looks. A look recolors one base marble (skin) without changing what it is: the interior
// style stays, the pattern colors (slots a/b/c), the glass tint (g) and the surface finish (f) can change.
//
// A look is a tiny object of palette indexes, { a, b, c, g, f }, every key optional (missing = the marble's
// original color, f missing = glossy). It travels with the skin: hello -> rooms.js -> show players -> clients.
// sanitizeLook() is the single gate for anything a client sends or a profile loads.
//
// The palettes are APPEND-ONLY: looks store indexes, so reordering or removing an entry recolors saved marbles.

export const PALETTE = [
  { name: 'Ruby', hex: '#b3122e' },
  { name: 'Cherry', hex: '#ff2d55' },
  { name: 'Coral', hex: '#ff6f61' },
  { name: 'Tangerine', hex: '#ff7a00' },
  { name: 'Amber', hex: '#ffb300' },
  { name: 'Lemon', hex: '#ffe14d' },
  { name: 'Lime', hex: '#a3e635' },
  { name: 'Emerald', hex: '#14a44d' },
  { name: 'Forest', hex: '#1f5a35' },
  { name: 'Mint', hex: '#3ee0b0' },
  { name: 'Teal', hex: '#00a6a6' },
  { name: 'Aqua', hex: '#4dd0e1' },
  { name: 'Sky', hex: '#5ab8ff' },
  { name: 'Cobalt', hex: '#1e5bff' },
  { name: 'Navy', hex: '#1a2a6c' },
  { name: 'Indigo', hex: '#4b32c3' },
  { name: 'Violet', hex: '#8e44ff' },
  { name: 'Orchid', hex: '#d16bff' },
  { name: 'Rose', hex: '#ff7eb6' },
  { name: 'Blush', hex: '#ffd0d8' },
  { name: 'Plum', hex: '#6a1b4d' },
  { name: 'Cream', hex: '#fff3c4' },
  { name: 'Snow', hex: '#ffffff' },
  { name: 'Silver', hex: '#b8c0ca' },
  { name: 'Gold', hex: '#e8b04a' },
  { name: 'Copper', hex: '#c46a36' },
  { name: 'Ink', hex: '#141414' },
];

// Glass tints are pale: the room is seen through the glass multiplied by this color.
export const GLASS = [
  { name: 'Clear', hex: '#ffffff' },
  { name: 'Ice', hex: '#eef8ff' },
  { name: 'Aqua', hex: '#cdf3ee' },
  { name: 'Sea', hex: '#9ff0dc' },
  { name: 'Sky', hex: '#d6ecff' },
  { name: 'Cobalt', hex: '#a9c6ff' },
  { name: 'Lilac', hex: '#e0d4ff' },
  { name: 'Rose', hex: '#ffd9e4' },
  { name: 'Peach', hex: '#ffd6c4' },
  { name: 'Amber', hex: '#ffe2b0' },
  { name: 'Honey', hex: '#ffd27a' },
  { name: 'Bottle', hex: '#c9e7a6' },
  { name: 'Smoke', hex: '#b9b6b0' },
];

// Surface finishes. Unlocked once with stickers, then usable on every marble you own.
export const FINISHES = [
  { id: 'glossy', name: 'Glossy', price: 0, blurb: 'Polished glass' },
  { id: 'frosted', name: 'Frosted', price: 150, blurb: 'Sand-blasted, soft light' },
  { id: 'pearl', name: 'Pearl', price: 300, blurb: 'A pearly, shifting sheen' },
  { id: 'glitter', name: 'Glitter', price: 450, blurb: 'Fine flakes in the glass' },
  // LIGHTS OUT: a lit core that glows a little by day and brightest of all in night shows.
  { id: 'glow', name: 'Glow', price: 600, blurb: 'Lit from inside, brightest at night' },
];
// Index of the Glow finish (FINISHES is append-only, so this never moves).
export const GLOW_FINISH = 4;

// Which color slots each interior style actually draws, with a player-facing name, and whether you can see
// through it (so the glass tint matters). Index = skin style (see skins.js).
export const STYLE_SLOTS = [
  { slots: [['a', 'Vanes'], ['c', 'Tips'], ['b', 'Core']], glass: true }, // 0 cat's eye
  { slots: [['a', 'Ribbon'], ['b', 'Ribbon 2'], ['c', 'Flecks']], glass: true }, // 1 swirl
  { slots: [['a', 'Space'], ['b', 'Nebula'], ['c', 'Dust']], glass: true }, // 2 galaxy
  { slots: [['a', 'Base'], ['b', 'Bands'], ['c', 'Veins']], glass: false }, // 3 agate
  { slots: [['b', 'Bubbles']], glass: true }, // 4 clearie
  { slots: [['a', 'Metal']], glass: false }, // 5 steelie
  { slots: [['a', 'Depths']], glass: true }, // 6 oil slick
  { slots: [['a', 'Stripe 1'], ['b', 'Stripe 2'], ['c', 'Stripe 3']], glass: true }, // 7 onion skin
  { slots: [['a', 'Blobs'], ['b', 'Hot core'], ['c', 'Wax']], glass: true }, // 8 lava
  { slots: [['a', 'Oceans'], ['b', 'Land'], ['c', 'Clouds']], glass: false }, // 9 planet
  { slots: [['a', 'Snow'], ['b', 'Flakes']], glass: true }, // 10 snow globe
  { slots: [['a', 'Fireflies'], ['c', 'Haze']], glass: true }, // 11 firefly jar
  { slots: [['b', 'Cracks'], ['c', 'Deep cracks']], glass: true }, // 12 crackle
  { slots: [['a', 'Curtain'], ['b', 'Sky'], ['c', 'Glow']], glass: true }, // 13 aurora
  { slots: [['a', 'Mirrors']], glass: false }, // 14 disco ball
  { slots: [['a', 'Iris'], ['c', 'Pupil']], glass: false }, // 15 googly eye
];

const KEYS = { a: PALETTE.length, b: PALETTE.length, c: PALETTE.length, g: GLASS.length, f: FINISHES.length };

// Returns a clean look ({ a, b, c, g, f } with only valid, non-default keys) or null for "the original marble".
// Anything else a client might send (strings, floats, huge numbers, extra keys, arrays) is dropped.
export function sanitizeLook(look) {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return null;
  const out = {};
  let any = false;
  for (const [k, n] of Object.entries(KEYS)) {
    const v = Object.prototype.hasOwnProperty.call(look, k) ? look[k] : undefined;
    if (!Number.isInteger(v) || v < 0 || v >= n) continue;
    if (k === 'f' && v === 0) continue;
    out[k] = v;
    any = true;
  }
  return any ? out : null;
}

export function sameLook(x, y) {
  const a = sanitizeLook(x), b = sanitizeLook(y);
  if (!a || !b) return !a && !b;
  for (const k of Object.keys(KEYS)) if (a[k] !== b[k]) return false;
  return true;
}

// The base skin with a look applied: { name, style, a, b, c, glass, finish (an index into FINISHES) }.
export function lookedSkin(skin, look) {
  const out = { ...skin, finish: 0 };
  const l = sanitizeLook(look);
  if (!l) return out;
  if (l.a !== undefined) out.a = PALETTE[l.a].hex;
  if (l.b !== undefined) out.b = PALETTE[l.b].hex;
  if (l.c !== undefined) out.c = PALETTE[l.c].hex;
  if (l.g !== undefined) out.glass = GLASS[l.g].hex;
  if (l.f !== undefined) out.finish = l.f;
  return out;
}

// Hand-picked color families that look good together in glass, by palette name. Randomize and the bots roll
// from these, so a random marble never looks like a clash.
const HARMONIES = [
  ['Cherry', 'Blush', 'Rose'], ['Cobalt', 'Snow', 'Aqua'], ['Amber', 'Cream', 'Tangerine'], ['Emerald', 'Lemon', 'Forest'],
  ['Violet', 'Orchid', 'Sky'], ['Teal', 'Mint', 'Navy'], ['Ruby', 'Gold', 'Ink'], ['Coral', 'Cream', 'Teal'],
  ['Indigo', 'Rose', 'Aqua'], ['Copper', 'Cream', 'Forest'], ['Navy', 'Gold', 'Snow'], ['Plum', 'Rose', 'Gold'],
  ['Lime', 'Snow', 'Teal'], ['Ink', 'Silver', 'Snow'], ['Sky', 'Snow', 'Cobalt'], ['Tangerine', 'Ink', 'Lemon'],
  ['Mint', 'Blush', 'Coral'], ['Gold', 'Snow', 'Amber'], ['Cherry', 'Lemon', 'Tangerine'], ['Aqua', 'Violet', 'Snow'],
];
const IDX = Object.fromEntries(PALETTE.map((p, i) => [p.name, i]));
const SOFT_GLASS = [0, 0, 0, 0, 1, 2, 4, 6, 7, 9];

// A random tasteful look for a marble style. rand() -> [0, 1). finishes: the finish indexes allowed.
// Opaque styles get their metal/stone colors from the harmony too; the glass tint stays clear most of the time.
export function randomLook(style, rand = Math.random, finishes = [0]) {
  const info = STYLE_SLOTS[style] || STYLE_SLOTS[0];
  const pick = (arr) => arr[Math.floor(rand() * arr.length) % arr.length];
  const fam = pick(HARMONIES).map((n) => IDX[n]);
  // Rotate the family so the lead color isn't always the same one.
  const rot = Math.floor(rand() * 3) % 3;
  const cols = [fam[rot], fam[(rot + 1) % 3], fam[(rot + 2) % 3]];
  const look = {};
  info.slots.forEach(([k], i) => (look[k] = cols[i]));
  if (style === 5 || style === 14) look.a = pick([IDX.Silver, IDX.Gold, IDX.Copper, IDX.Snow, IDX.Rose, IDX.Sky]);
  if (style === 15) look.c = IDX.Ink;
  if (info.glass) look.g = pick(SOFT_GLASS);
  look.f = pick(finishes.length ? finishes : [0]);
  return sanitizeLook(look);
}
