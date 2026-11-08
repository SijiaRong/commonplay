// Perks (called cards in the code). Every marble picks three of six before stage 1, then survivors draft one of
// three after every checkpoint. Offers are drawn from the player's deck (picked in the Toy Box between shows),
// weighted by rarity and by how deep into the show the draft is. Mastery (levels 1-5, earned by collecting
// duplicates) scales effects.
//
// The pool is shared: the more marbles in the field already hold a perk, the less often it is dealt to anyone.

export const RARITY = ['Common', 'Rare', 'Epic', 'Legendary'];
export const MAX_MASTERY = 5;
export const MAX_REROLLS = 2;
export const STARTER_OFFER = 6;
export const STARTER_PICKS = 3;

// Base marble stats; cards modify a copy of these.
export const BASE_STATS = {
  topSpeed: 17,      // control speed cap (downhill can exceed it)
  accel: 25,         // grounded control acceleration
  airControl: 0.32,  // fraction of accel available in the air
  mass: 1,
  radius: 0.5,
  jump: 10.5,        // jump launch speed
  jumpCd: 0.9,
  bounce: 0.6,       // marble-on-marble restitution
  grip: 2.4,         // how fast sideways drift is bled off while steering
  gravity: 1,
  drag: 0.05,
  push: 1,           // how hard your bumps shove others
  wallLoss: 1,       // speed lost scraping walls
  doubleJump: 0,
  slipstream: 0,
  comeback: 0,
  frontRunner: 0,
  momentum: 0,
  headStart: 0,
  secondWind: 0,
  lucky: 0,
  stickerMult: 1,
  midas: 0,
  recovery: 0,
  pack: 0,
  lone: 0,
  clutch: 0,
  slingshot: 0,
  rerolls: 0,        // free rerolls in every draft
  iron: 0,
  phoenix: 0,
  active: null,      // { id, level }
};

const CAPS = {
  topSpeed: [12, 27], accel: [16, 46], airControl: [0.2, 1], mass: [0.45, 3.2], radius: [0.4, 0.66],
  jump: [8, 21], jumpCd: [0.45, 2], bounce: [0.3, 1.05], grip: [1, 6], gravity: [0.8, 1.4], drag: [0.01, 0.1],
  push: [1, 2.6], wallLoss: [0, 1],
};

export const ACTIVES = {
  turbo: { name: 'Turbo', cd: 7, key: 'turbo' },
  rocket: { name: 'Rocket', cd: 15, dur: 1.4 },
  pogo: { name: 'Pogo', cd: 6 },
  shockwave: { name: 'Shockwave', cd: 14 },
  ghost: { name: 'Ghost', cd: 15, dur: 2.6 },
  anchor: { name: 'Anchor', cd: 12, dur: 3 },
  warp: { name: 'Warp', cd: 20 },
};

const pct = (x) => Math.round(x * 100) + '%';
const mul = (k, field, amt) => (st, p) => {
  st[field] *= 1 + amt * p * k;
};

// kind: 'stat' (passive numbers), 'perk' (passive rule), 'active' (E / right click), 'eco' (stickers)
export const CARDS = [
  // ---------------- commons
  { id: 'polish', name: 'Polished Glass', rarity: 0, kind: 'stat', icon: 'sparkles', desc: (p) => `+${pct(0.06 * p)} top speed`, apply: mul(1, 'topSpeed', 0.06), bot: 1 },
  { id: 'rubber', name: 'Rubber Band', rarity: 0, kind: 'stat', icon: 'gauge', desc: (p) => `+${pct(0.16 * p)} acceleration`, apply: mul(1, 'accel', 0.16), bot: 1 },
  { id: 'lead', name: 'Lead Core', rarity: 0, kind: 'stat', icon: 'weight', desc: (p) => `+${pct(0.35 * p)} mass. Win more bumps`, apply: mul(1, 'mass', 0.35), bot: 0.9 },
  { id: 'spring', name: 'Spring Loaded', rarity: 0, kind: 'stat', icon: 'arrow-big-up', desc: (p) => `+${pct(0.22 * p)} jump height, faster jump recharge`, apply: (st, p) => { st.jump *= 1 + 0.11 * p; st.jumpCd *= 1 - 0.12 * p; }, bot: 0.6 },
  { id: 'gyro', name: 'Gyroscope', rarity: 0, kind: 'stat', icon: 'orbit', desc: (p) => `+${pct(0.6 * p)} steering in the air`, apply: mul(1, 'airControl', 0.6), bot: 0.5 },
  { id: 'feather', name: 'Featherweight', rarity: 0, kind: 'stat', icon: 'feather', desc: (p) => `+${pct(0.2 * p)} acceleration, ${pct(0.18)} lighter`, apply: (st, p) => { st.accel *= 1 + 0.2 * p; st.mass *= 0.82; }, bot: 0.8 },
  { id: 'grip', name: 'Grip Tape', rarity: 0, kind: 'stat', icon: 'hand', desc: (p) => `+${pct(0.5 * p)} cornering grip`, apply: mul(1, 'grip', 0.5), bot: 0.8 },
  { id: 'turbo', name: 'Turbo', rarity: 0, kind: 'active', icon: 'fast-forward', active: 'turbo', desc: () => 'ABILITY: burst of speed. Stack to recharge faster', bot: 1.2 },
  { id: 'headstart', name: 'Head Start', rarity: 0, kind: 'perk', icon: 'flag', desc: (p) => `Launch off every start gate with a ${(1.6 * p).toFixed(1)}s speed burst`, apply: (st, p) => { st.headStart += 1.6 * p; }, bot: 0.9 },
  { id: 'magnet', name: 'Sticker Magnet', rarity: 0, kind: 'eco', icon: 'magnet', desc: (p) => `+${pct(0.4 * p)} stickers earned this show`, apply: (st, p) => { st.stickerMult += 0.4 * p; }, bot: 0.3 },
  { id: 'aero', name: 'Aerodynamic', rarity: 0, kind: 'stat', icon: 'wind', desc: (p) => `${pct(0.45 * p)} less drag, +${pct(0.03 * p)} top speed`, apply: (st, p) => { st.drag *= 1 - 0.45 * Math.min(1.6, p); st.topSpeed *= 1 + 0.03 * p; }, bot: 0.9 },
  { id: 'tailwind', name: 'Tailwind', rarity: 0, kind: 'stat', icon: 'leaf', desc: (p) => `+${pct(0.04 * p)} top speed, +${pct(0.08 * p)} acceleration`, apply: (st, p) => { st.topSpeed *= 1 + 0.04 * p; st.accel *= 1 + 0.08 * p; }, bot: 1 },
  { id: 'recovery', name: 'Quick Recovery', rarity: 0, kind: 'perk', icon: 'bandage', desc: () => 'Respawn three times faster, a little further ahead', apply: (st, p) => { st.recovery += p; }, bot: 0.8 },
  { id: 'bounce', name: 'Bounce Back', rarity: 0, kind: 'stat', icon: 'redo-2', desc: (p) => `+${pct(0.25 * p)} mass and +${pct(0.25 * p)} grip: bumps knock you off line less`, apply: (st, p) => { st.mass *= 1 + 0.25 * p; st.grip *= 1 + 0.25 * p; }, bot: 0.9 },
  { id: 'bumper', name: 'Bumper Car', rarity: 0, kind: 'stat', icon: 'circle-dot', desc: (p) => `+${pct(0.3 * p)} bounce off other marbles`, apply: (st, p) => { st.bounce *= 1 + 0.3 * p; st.push *= 1 + 0.12 * p; }, bot: 0.6 },

  // ---------------- rares
  { id: 'slip', name: 'Slipstream', rarity: 1, kind: 'perk', icon: 'waves', desc: (p) => `Tailing another marble: +${pct(0.25 * p)} accel, +${pct(0.1 * p)} top speed`, apply: (st, p) => { st.slipstream += p; }, bot: 1.1 },
  { id: 'comeback', name: 'Comeback Kid', rarity: 1, kind: 'perk', icon: 'flame', desc: (p) => `In the bottom 40%: +${pct(0.12 * p)} speed and accel`, apply: (st, p) => { st.comeback += p; }, bot: 1.1 },
  { id: 'front', name: 'Pole Position', rarity: 1, kind: 'perk', icon: 'crown', desc: (p) => `In the top 5: +${pct(0.08 * p)} top speed`, apply: (st, p) => { st.frontRunner += p; }, bot: 1 },
  { id: 'double', name: 'Double Jump', rarity: 1, kind: 'perk', icon: 'chevrons-up', desc: () => 'Jump again in mid-air', apply: (st) => { st.doubleJump = 1; }, once: true, bot: 0.8 },
  { id: 'gravwell', name: 'Gravity Well', rarity: 1, kind: 'stat', icon: 'arrow-down-to-line', desc: (p) => `+${pct(0.12 * p)} gravity: faster downhill`, apply: mul(1, 'gravity', 0.12), bot: 1 },
  { id: 'anchor', name: 'Anchor', rarity: 1, kind: 'active', icon: 'anchor', active: 'anchor', desc: () => 'ABILITY: become an immovable boulder for 3s', bot: 0.8 },
  { id: 'bully', name: 'Bully', rarity: 1, kind: 'stat', icon: 'biceps-flexed', desc: (p) => `Your bumps shove ${pct(0.45 * p)} harder`, apply: mul(1, 'push', 0.45), bot: 0.9 },
  { id: 'second', name: 'Second Wind', rarity: 1, kind: 'perk', icon: 'heart-pulse', desc: () => 'Instant respawns, and you come back with a boost', apply: (st, p) => { st.secondWind += p; }, bot: 0.8 },
  { id: 'sticky', name: 'Sticky', rarity: 1, kind: 'stat', icon: 'droplet', desc: (p) => `Walls stop slowing you. +${pct(0.4 * p)} grip`, apply: (st, p) => { st.wallLoss *= 0.15; st.grip *= 1 + 0.4 * p; }, bot: 0.9 },
  { id: 'pack', name: 'Pack Hunter', rarity: 1, kind: 'perk', icon: 'users', desc: (p) => `+${pct(0.03 * p)} top speed for every marble close by (max +${pct(0.09 * p)})`, apply: (st, p) => { st.pack += p; }, bot: 1 },
  { id: 'lone', name: 'Lone Wolf', rarity: 1, kind: 'perk', icon: 'moon', desc: (p) => `Nobody near you: +${pct(0.06 * p)} top speed, +${pct(0.12 * p)} accel`, apply: (st, p) => { st.lone += p; }, bot: 1 },
  { id: 'clutch', name: 'Clutch', rarity: 1, kind: 'perk', icon: 'timer', desc: (p) => `Last 30% of every stage: +${pct(0.09 * p)} top speed and accel`, apply: (st, p) => { st.clutch += p; }, bot: 1.1 },
  { id: 'highroller', name: 'High Roller', rarity: 1, kind: 'perk', icon: 'dices', desc: () => 'One free reroll in every draft', apply: (st) => { st.rerolls += 1; }, once: true, bot: 0.5 },
  { id: 'pogo', name: 'Pogo', rarity: 1, kind: 'active', icon: 'arrow-big-up-dash', active: 'pogo', desc: () => 'ABILITY: a huge leap. Clear hazards and walls', bot: 0.7 },

  // ---------------- epics
  { id: 'shockwave', name: 'Shockwave', rarity: 2, kind: 'active', icon: 'bomb', active: 'shockwave', desc: () => 'ABILITY: blast every nearby marble away', bot: 1.2 },
  { id: 'ghost', name: 'Ghost Marble', rarity: 2, kind: 'active', icon: 'ghost', active: 'ghost', desc: () => 'ABILITY: pass through other marbles for 2.6s', bot: 1 },
  { id: 'momentum', name: 'Momentum', rarity: 2, kind: 'perk', icon: 'trending-up', desc: (p) => `+${pct(0.025 * p)} top speed per second without hitting a wall (max +${pct(0.15 * p)})`, apply: (st, p) => { st.momentum += p; }, bot: 1.1 },
  { id: 'glass', name: 'Glass Cannon', rarity: 2, kind: 'stat', icon: 'zap', desc: (p) => `+${pct(0.12 * p)} speed and accel, 40% lighter`, apply: (st, p) => { st.topSpeed *= 1 + 0.12 * p; st.accel *= 1 + 0.12 * p; st.mass *= 0.6; }, bot: 1.2 },
  { id: 'growth', name: 'Growth Spurt', rarity: 2, kind: 'stat', icon: 'expand', desc: (p) => `20% bigger and +${pct(0.5 * p)} mass`, apply: (st, p) => { st.radius *= 1.2; st.mass *= 1 + 0.5 * p; }, bot: 0.9 },
  { id: 'pocket', name: 'Pocket Size', rarity: 2, kind: 'stat', icon: 'shrink', desc: (p) => `15% smaller, +${pct(0.07 * p)} top speed`, apply: (st, p) => { st.radius *= 0.85; st.topSpeed *= 1 + 0.07 * p; st.mass *= 0.85; }, bot: 1 },
  { id: 'triple', name: 'Triple Jump', rarity: 2, kind: 'perk', icon: 'arrow-up-from-line', desc: () => 'Jump twice more in mid-air', apply: (st) => { st.doubleJump = Math.max(st.doubleJump, 2); }, once: true, bot: 0.9 },
  { id: 'slingshot', name: 'Slingshot', rarity: 2, kind: 'perk', icon: 'route', desc: (p) => `Coming out of a turn gives you a gentle ${(0.8 * p).toFixed(1)}s push`, apply: (st, p) => { st.slingshot += p; }, bot: 1.1 },
  { id: 'iron', name: 'Iron Shell', rarity: 2, kind: 'stat', icon: 'shield', desc: (p) => `Shockwaves can't move you. +${pct(0.3 * p)} mass, +${pct(0.2 * p)} bump power`, apply: (st, p) => { st.iron = 1; st.mass *= 1 + 0.3 * p; st.push *= 1 + 0.2 * p; }, bot: 1 },
  { id: 'rocket', name: 'Rocket', rarity: 2, kind: 'active', icon: 'rocket', active: 'rocket', desc: () => 'ABILITY: 1.4s of strong thrust', bot: 1.2 },

  // ---------------- legendaries
  { id: 'lucky', name: 'Lucky Marble', rarity: 3, kind: 'perk', icon: 'clover', desc: () => 'Once: if you would be cut, you survive instead', apply: (st) => { st.lucky += 1; }, bot: 1.3 },
  { id: 'golden', name: 'Golden Core', rarity: 3, kind: 'stat', icon: 'trophy', desc: (p) => `+${pct(0.08 * p)} speed, accel, jump and mass`, apply: (st, p) => { const k = 1 + 0.08 * p; st.topSpeed *= k; st.accel *= k; st.jump *= k; st.mass *= k; }, bot: 1.4 },
  { id: 'warp', name: 'Warp', rarity: 3, kind: 'active', icon: 'wand-sparkles', active: 'warp', desc: () => 'ABILITY: teleport 10 units down the track', bot: 1.3 },
  { id: 'phoenix', name: 'Phoenix', rarity: 3, kind: 'perk', icon: 'sunrise', desc: () => 'Fall off and you are reborn instantly, further down the track, at full speed', apply: (st) => { st.phoenix = 1; st.recovery += 1; }, once: true, bot: 1.3 },
  { id: 'crown', name: 'Crown Jewel', rarity: 3, kind: 'stat', icon: 'gem', desc: (p) => `+${pct(0.06 * p)} speed and accel, +30% stickers, a free reroll every draft`, apply: (st, p) => { st.topSpeed *= 1 + 0.06 * p; st.accel *= 1 + 0.06 * p; st.stickerMult += 0.3; st.rerolls += 1; }, once: true, bot: 1.3 },
  { id: 'midas', name: 'Midas Touch', rarity: 3, kind: 'eco', icon: 'coins', desc: (p) => `+${pct(1 * p)} stickers, +1 sticker per marble you bump hard`, apply: (st, p) => { st.stickerMult += 1 * p; st.midas = 1; }, bot: 0.4 },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// Perks everyone starts with: every common plus a set of the more exciting ones, so builds have variety from the
// first show.
export const FREE_CARDS = CARDS.filter((c) => c.rarity === 0).map((c) => c.id).concat(['slip', 'double', 'pogo', 'comeback', 'momentum', 'shockwave', 'ghost', 'rocket', 'pack', 'slingshot']);
export const STARTER_CARDS = FREE_CARDS;
export const DECK_MIN = 12;
export const DECK_MAX = 28;

export function masteryPower(level) {
  const l = Math.max(1, Math.min(MAX_MASTERY, level | 0 || 1));
  return 1 + 0.12 * (l - 1);
}

// Copies needed for each mastery level (total copies owned, including the first).
export const MASTERY_COPIES = [1, 3, 6, 10, 15];
export function masteryFromCopies(copies) {
  let lvl = 1;
  for (let i = 0; i < MASTERY_COPIES.length; i++) if (copies >= MASTERY_COPIES[i]) lvl = i + 1;
  return lvl;
}

// Computes a marble's stats from its drafted cards: [{ id, level }] in pick order.
export function computeStats(hand) {
  const st = { ...BASE_STATS };
  let active = null;
  for (const h of hand) {
    const c = CARD_BY_ID[h.id];
    if (!c) continue;
    const p = masteryPower(h.level);
    if (c.kind === 'active') {
      if (active && active.id === c.active) {
        active.level += 1;
        active.power = Math.max(active.power, p);
      } else active = { id: c.active, level: 1, power: p };
      continue;
    }
    c.apply(st, p);
  }
  for (const [k, [lo, hi]] of Object.entries(CAPS)) st[k] = Math.max(lo, Math.min(hi, st[k]));
  if (active) {
    const def = ACTIVES[active.id];
    active.cd = def.cd * Math.pow(0.82, active.level - 1) / (1 + (active.power - 1) * 0.5);
    active.power *= Math.pow(1.12, active.level - 1);
  }
  st.active = active;
  return st;
}

// Rarity weights by draft round (0 = starter pick before stage 1).
const RARITY_WEIGHTS = [
  [70, 26, 4, 0],
  [60, 30, 9, 1],
  [48, 34, 14, 4],
  [38, 34, 20, 8],
  [28, 34, 27, 11],
];

// Draws `n` distinct card ids from `deck` (array of ids) for draft `round`. `held` (ids) excludes repeats of
// one-shot cards. `field` ({ id: count }) is how many marbles in the show already hold each perk: the shared pool,
// so popular perks are dealt less. `rng` is a makeRng.
export function drawOffer(deck, round, rng, held = [], n = 3, field = null) {
  const w = RARITY_WEIGHTS[Math.min(round, RARITY_WEIGHTS.length - 1)];
  const pool = deck
    .map((id) => CARD_BY_ID[id])
    .filter((c) => c && !(c.once && held.includes(c.id)))
    .map((c) => {
      let k = w[c.rarity];
      // Shared pool: every copy already in the field makes it rarer for everyone.
      if (field && field[c.id]) k /= 1 + 0.12 * field[c.id];
      return { c, w: k };
    });
  const out = [];
  while (out.length < n && pool.length) {
    const pick = rng.weighted(pool);
    out.push(pick.c.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  // Tiny decks: pad with any commons so there are always enough choices.
  for (const c of CARDS) {
    if (out.length >= n) break;
    if (!out.includes(c.id) && c.rarity === 0) out.push(c.id);
  }
  return out;
}

// How much a bot wants a card (it also prefers rarer ones).
export function botScore(id, hand) {
  const c = CARD_BY_ID[id];
  if (!c) return 0;
  let s = c.bot * (1 + c.rarity * 0.35);
  if (c.kind === 'active' && hand.some((h) => CARD_BY_ID[h.id]?.kind === 'active' && CARD_BY_ID[h.id].active !== c.active)) s *= 0.5;
  if (c.once && hand.some((h) => h.id === id)) s = 0;
  return s;
}

// Sanitizes a profile sent by a client: deck of known unique ids within size limits, mastery levels clamped.
export function sanitizeLoadout(raw) {
  const out = { deck: STARTER_CARDS.slice(), levels: {}, rerolls: 0 };
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.deck)) {
    const seen = new Set();
    const deck = [];
    for (const id of raw.deck) {
      if (typeof id === 'string' && CARD_BY_ID[id] && !seen.has(id)) {
        seen.add(id);
        deck.push(id);
      }
    }
    if (deck.length >= DECK_MIN && deck.length <= DECK_MAX) out.deck = deck;
  }
  if (raw.levels && typeof raw.levels === 'object') {
    for (const id of out.deck) {
      const l = Number(raw.levels[id]);
      if (Number.isFinite(l)) out.levels[id] = Math.max(1, Math.min(MAX_MASTERY, Math.floor(l)));
    }
  }
  const rr = Number(raw.rerolls);
  out.rerolls = Number.isFinite(rr) ? Math.max(0, Math.min(MAX_REROLLS, Math.floor(rr))) : 0;
  return out;
}
