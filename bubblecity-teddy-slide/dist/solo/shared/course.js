// Procedural course: every show is five stages built from one seed, identically on the server and every client.
// A stage is a zig-zag of downhill "runs" joined by flat 180-degree turns. Runs are made of pieces (ramps, peg
// fields, spinners, hammers, trapdoors, gates...) and forks where the lane splits into two or three branches
// with different hazards: the Fall Guys style choice. The stage ends in a walled checkpoint pen.
//
// buildStage() returns:
//   colliders   physics primitives (see physics.js); the start gate has tag 'gate'
//   visuals     render descriptors for the client (boxes, cylinders, lathes, kinematic meshes, banners)
//   path        dense centerline samples per branch, used for progress, ranking, bots and respawns
//   forks       fork metadata (branch kinds) for bots and the course preview
//   grid        start slots, front row first
//   finish      the trigger box marking the checkpoint / finish line

import { makeCollider, matYPR, matIdentity, matApply } from './physics.js';
import { makeRng } from './rng.js';
import { GRAVITY as GRAVITY_U } from './physics.js';

export const STAGE_COUNT = 5;
export const FIELD_SIZE = 50;
export const CUT_PER_STAGE = 10;
export const STAGE_NAMES = ['The Bookshelf Drop', 'Crayon Canyon', 'Pillow Pass', 'Rug Rumble', 'Toy Box Finale'];
export const LANE_WIDTH = [18, 17, 16, 15, 14];

// Stages whose checkpoint (or, for the final, the finish) is THE BOWL instead of the walled pen. Stage 1 (index 0)
// keeps its pen: first-time players learn there.
export const BOWL_STAGES = [4];
// Reserve the original outside footprint for the Saturn slide and final bowl.
const LARGE_FINISH_STAGES = [1, 4];

// THE BOWL's shape. The surface height at radius r (below the rim) follows a coin-funnel profile: slope
// A + K / r^2, gentle near the rim and steep toward the drain. `rim` is the inner face of the rim wall.
export const BOWL = {
  rim: 24, rimFinal: 21, drain: 2.6, chute: 8, A: 0.05, K: 20, wallH: 3.2, throat: 3.5, thick: 1.2,
};
const BOWL_RUN_TRIM = 30;
// Room for the rider and a fully pitched chase camera on the playable landing lanes.
const EXIT_HEADROOM = 9;
const EXTRA_EXIT_DROP = EXIT_HEADROOM - 1.6;

// THE WHIRLPOOL: a mid-course mini bowl (same coin-funnel profile family, steeper), entered off a chute along the
// lane's edge. Its drain drops marbles onto the lane below, which runs on under the bowl. `perch` is how far the
// rim sits below the chute's end (so the chute's floor clears the surface it hangs over).
export const WHIRL = { R: 11, drain: 2.4, chute: 6, A: 0.06, K: 14, wallH: 2.6, throat: 3, thick: 1.0, perch: 1.2, friction: 0.35 };
// THE PLUNGE: a slatted tube bends the lane over a crest into a 65-degree face, and a long concave bend levels it
// out into a run-out. Radius of the crest, the tube's height, face length, the bend's radius.
export const PLUNGE = { crest: 5, gap: 2.2, face: 8, bend: 8, angle: (65 * Math.PI) / 180 };
// THE DRUM (a wall of death): the lane narrows, runs out onto the steep inner wall of a toy drum, winds once round it
// dropping `drop`, and leaves underneath its own way in. `pipe` is the radius of the curve up the wall.
export const DRUM = { lane: 9, post: 2.5, pipe: 5.5, wall: 7.5, hoop: 1.6, drop: 9.5, blend: 0.95 };

// Sample flags.
export const F_RESPAWN = 1;
export const F_JUMP = 2;
export const F_RISKY = 4;
export const F_TURN = 8;
export const F_BOOST = 16;
export const F_LOOP = 32; // in or right at a loop-the-loop: bots hold their line, the camera keeps facing forward
export const F_BANK = 64; // banked turn: bots ride up the bank instead of braking for the inside line
export const F_PIPE = 128; // half-pipe: bots carve along one wall

const WALL_H = 2.0;
// Loop-the-loop floor radius. A marble needs about sqrt(5 g (LOOP_R - r)) at the bottom (~28) plus what the
// curve costs; the entry strip gives everyone 30+ (tests/ramps.test.mjs).
export const LOOP_R = 3.8;
// How much lower a helter-skelter (540-degree spiral turn) ends than it starts.
export const HELIX_DROP = 9;
const FLOOR_T = 1.0;
const SAMPLE_STEP = 1.5;

// Enamel tints for the Bubbleport toy course.
export const PALETTE = {
  red: '#d88365', orange: '#efaa81', yellow: '#d5ae78', green: '#9ac9b3', teal: '#65aea3', blue: '#7eafb1',
  navy: '#356d6b', purple: '#ae958d', pink: '#eeae98', wood: '#ffffff', birch: '#f6efe6', walnut: '#c9a27d',
  cream: '#efe6d6',
};
const BRIGHT = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
const NATURAL = ['wood', 'birch', 'wood', 'wood', 'walnut'];

const MAT = {
  floor: { bounce: 0.2, friction: 0.12 },
  wall: { bounce: 0.35, friction: 0.15 },
  peg: { bounce: 0.55, friction: 0.05 },
  bumper: { bounce: 0.9, friction: 0.02, kick: 13 },
  obstacle: { bounce: 0.6, friction: 0.08 },
  roller: { bounce: 0.2, friction: 0.6 },
  // Lacquered loop and helix track: no bounce and no scrub, so a marble riding the inside of a curve keeps its speed.
  slick: { bounce: 0, friction: 0 },
};

// ---------------------------------------------------------------- vector helpers

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Rotation whose local Z runs from p0 to p1 and whose local Y is as close to `up` as possible.
function frameBetween(p0, p1, up = [0, 1, 0]) {
  const z = norm(sub(p1, p0));
  let x = cross(up, z);
  if (len(x) < 1e-6) x = cross([1, 0, 0], z);
  x = norm(x);
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

// ---------------------------------------------------------------- builder

class StageBuilder {
  constructor(rng, index, width) {
    this.rng = rng;
    this.index = index;
    this.colliders = [];
    this.visuals = [];
    this.samples = [];
    this.trapZones = [];
    this.forks = [];
    this.branchCount = 0;
    this.T = { x: 0, y: 0, z: 0, h: 0, w: width };
    this.s = 0;
    this.colorCursor = rng.int(0, BRIGHT.length - 1);
    this.supports = [];
    this.lastSupportS = -100;
    this.pieces = [];
  }

  fwd(h = this.T.h) {
    return [Math.sin(h), 0, Math.cos(h)];
  }
  lat(h = this.T.h) {
    return [Math.cos(h), 0, -Math.sin(h)];
  }
  pos() {
    return [this.T.x, this.T.y, this.T.z];
  }
  setPos(p) {
    this.T.x = p[0];
    this.T.y = p[1];
    this.T.z = p[2];
  }
  // A point relative to the turtle: `along` forward, `side` lateral, `up` vertical.
  at(along, side = 0, up = 0) {
    const f = this.fwd(), l = this.lat();
    return [this.T.x + f[0] * along + l[0] * side, this.T.y + up, this.T.z + f[2] * along + l[2] * side];
  }
  nextColor() {
    this.colorCursor = (this.colorCursor + 1 + (this.rng.chance(0.3) ? 1 : 0)) % BRIGHT.length;
    return PALETTE[BRIGHT[this.colorCursor]];
  }
  natural() {
    return PALETTE[this.rng.pick(NATURAL)];
  }

  collider(shape, o) {
    const c = makeCollider(shape, o);
    this.colliders.push(c);
    return this.colliders.length - 1;
  }
  vis(v) {
    this.visuals.push(v);
  }

  sample(p, tangent, hw, branch, fork, flags) {
    this.samples.push({ x: p[0], y: p[1], z: p[2], s: this.sCur, hw, tx: tangent[0], tz: tangent[2], br: branch, fk: fork, fl: flags });
  }

  // Samples a straight centerline from p0 to p1 (floor-top points), advancing sCur by horizontal distance.
  sampleLine(p0, p1, hw, branch = 0, fork = -1, flags = F_RESPAWN, includeStart = true) {
    const d = sub(p1, p0);
    const horiz = Math.hypot(d[0], d[2]);
    const n = Math.max(1, Math.ceil(horiz / SAMPLE_STEP));
    const tangent = norm([d[0], 0, d[2]]);
    const s0 = this.sCur;
    for (let i = includeStart ? 0 : 1; i <= n; i++) {
      const t = i / n;
      this.sCur = s0 + horiz * t;
      this.sample(lerp3(p0, p1, t), tangent, hw, branch, fork, flags);
    }
    this.sCur = s0 + horiz;
  }

  // Oriented box whose top-surface centerline runs from p0 to p1, `width` across and `thick` deep.
  slab(p0, p1, width, thick, o = {}) {
    const R = frameBetween(p0, p1, o.up || [0, 1, 0]);
    const n = [R[1], R[4], R[7]];
    const lx = [R[0], R[3], R[6]];
    const off = o.side || 0;
    const mid = add(add(lerp3(p0, p1, 0.5), mul(lx, off)), mul(n, -thick / 2 + (o.lift || 0)));
    const hz = len(sub(p1, p0)) / 2 + (o.extend || 0);
    const idx = this.collider('box', { c: mid, R, hx: width / 2, hy: thick / 2, hz, mat: o.mat || MAT.floor, tag: o.tag, boost: o.boost, motion: o.motion });
    if (o.visual !== false) {
      this.boxVisual(mid, R, [width, thick, hz * 2], o);
    }
    return idx;
  }

  boxVisual(c, R, size, o = {}) {
    const style = o.style || 'block';
    if (style === 'planks' && size[0] > 4) {
      // Floor made of long boards laid side by side.
      const k = Math.max(2, Math.round(size[0] / 3.2));
      const bw = size[0] / k;
      const lx = [R[0], R[3], R[6]];
      for (let i = 0; i < k; i++) {
        const off = -size[0] / 2 + bw * (i + 0.5);
        this.vis({ k: 'box', c: add(c, mul(lx, off)), R, s: [bw - 0.06, size[1], size[2] - (i % 2 ? 0.02 : 0)], col: o.col || this.natural(), m: o.m || 'wood' });
      }
      return;
    }
    if (style === 'blocks' && size[2] > 3.2) {
      // A wall made of a row of painted blocks.
      const k = Math.max(1, Math.round(size[2] / (o.blockLen || 2.6)));
      const bl = size[2] / k;
      const lz = [R[2], R[5], R[8]];
      for (let i = 0; i < k; i++) {
        const off = -size[2] / 2 + bl * (i + 0.5);
        this.vis({ k: 'box', c: add(c, mul(lz, off)), R, s: [size[0], size[1], bl - 0.07], col: o.col || this.nextColor(), m: 'paint' });
      }
      return;
    }
    this.vis({ k: 'box', c, R, s: size, col: o.col || this.nextColor(), m: o.m || 'paint' });
  }

  // Side wall along a floor line, offset laterally from it.
  wallAlong(p0, p1, side, height = WALL_H, o = {}) {
    const R = frameBetween(p0, p1, [0, 1, 0]);
    const n = [R[1], R[4], R[7]];
    const lx = [R[0], R[3], R[6]];
    const mid = add(add(lerp3(p0, p1, 0.5), mul(lx, side)), mul(n, (height - FLOOR_T) / 2));
    const hz = len(sub(p1, p0)) / 2;
    const th = o.thick || 1;
    this.collider('box', { c: mid, R, hx: th / 2, hy: (height + FLOOR_T) / 2, hz, mat: o.mat || MAT.wall });
    if (o.visual !== false) this.boxVisual(mid, R, [th, height + FLOOR_T, hz * 2], { style: 'blocks', col: o.col });
  }

  // Free oriented box (obstacles, cross walls...).
  box(c, R, size, o = {}) {
    const idx = this.collider('box', { c, R, hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2, mat: o.mat || MAT.obstacle, motion: o.motion, tag: o.tag, boost: o.boost });
    if (o.visual !== false) {
      if (o.motion || o.kin) this.vis({ k: 'kin', i: idx, shape: 'box', s: size, col: o.col || this.nextColor(), m: o.m || 'paint', tag: o.tag });
      else this.boxVisual(c, R, size, o);
    }
    return idx;
  }

  cyl(c, R, radius, height, o = {}) {
    const idx = this.collider('cyl', { c, R, radius, hh: height / 2, mat: o.mat || MAT.peg, motion: o.motion });
    if (o.visual !== false) {
      if (o.motion) this.vis({ k: 'kin', i: idx, shape: 'cyl', r: radius, h: height, col: o.col || this.nextColor(), m: o.m || 'paint', stripes: o.stripes });
      else this.vis({ k: 'cyl', c, R, r: radius, h: height, col: o.col || this.nextColor(), m: o.m || 'paint', stripes: o.stripes });
    }
    return idx;
  }

  // Wooden support tower from under the course down to the room floor (visual only).
  support(p, hw, normalY = 1) {
    const top = p[1] - FLOOR_T - 0.1;
    this.supports.push({ x: p[0], y: top, z: p[2], hw, h: this.T.h, style: this.rng.int(0, 3), seed: this.rng.int(0, 1e6) });
  }

  maybeSupport(p, hw) {
    if (this.sCur - this.lastSupportS >= 20) {
      this.lastSupportS = this.sCur;
      this.support(p, hw);
    }
  }

  // ------------------------------------------------------------ pieces

  componentSpan() {
    const v0 = this.visuals.length, u0 = this.supports.length;
    return () => ({v0, v1:this.visuals.length, u0, u1:this.supports.length});
  }

  // Plain walled ramp. `drop` is how far it descends.
  ramp(length, drop, o = {}) {
    const w = this.T.w;
    const p0 = this.pos();
    const p1 = this.at(length, 0, -drop);
    this.slab(p0, p1, w + 2, FLOOR_T, {style: 'planks', m: o.surface});
    if (!o.noWalls) {
      this.wallAlong(p0, p1, w / 2 + 0.5);
      this.wallAlong(p0, p1, -w / 2 - 0.5);
    }
    if (o.boost) {
      // Painted speed strip down the middle third.
      const bl = Math.min(length * 0.6, 12);
      const a = lerp3(p0, p1, 0.5 - bl / length / 2), b = lerp3(p0, p1, 0.5 + bl / length / 2);
      const dir = norm(sub(p1, p0));
      const lift = [0, 0.02, 0];
      const bi = this.slab(add(a, lift), add(b, lift), w * 0.34, 0.1, { boost: mul(dir, 30), visual: false, mat: MAT.floor });
      const c = this.colliders[bi];
      this.vis({ k: 'box', c: c.c, R: c.R, s: [w * 0.34, 0.12, len(sub(b, a))], col: '#ffd23f', m: 'boost' });
    }
    this.sampleLine(p0, p1, w / 2, 0, -1, F_RESPAWN | (o.boost ? F_BOOST : 0), this.samples.length === 0);
    this.maybeSupport(lerp3(p0, p1, 0.5), w / 2);
    this.setPos(p1);
  }

  // A broad quilt with bolsters that open out and guide runners back into the chute.
  plushRunway(length, width) {
    const firstVisual = this.visuals.length;
    const shoulder = 1.8, taper = 6;
    const outerWidth = width + 2 * shoulder + 2;
    this.slab(this.pos(), this.at(length), outerWidth, FLOOR_T, { col: '#96cfbd', m: 'rubber' });
    const edges = [[0, 0], [taper, shoulder], [length - taper, shoulder], [length, 0]];
    for (const side of [-1, 1]) {
      for (let i = 1; i < edges.length; i++) {
        const point = ([z, flare]) => this.at(z, side * (width / 2 + .5 + flare));
        const a = point(edges[i - 1]), b = point(edges[i]);
        this.wallAlong(a, b, 0, .65, {visual: false});
        const R = frameBetween(a, b, [0, 1, 0]);
        const mid = lerp3(a, b, .5), span = len(sub(a, b));
        this.boxVisual(add(mid, [0, .16, 0]), R, [1, .98, span], {col: '#e59a73', m: 'rubber'});
        const stitches = Math.round(span / .85);
        for (let j = 0; j < stitches; j++) {
          const center = add(lerp3(a, b, (j + .5) / stitches), [0, .655, 0]);
          this.boxVisual(center, R, [.09, .025, .42], {col: '#fff1cc', m: 'rubber'});
        }
      }
    }
    for (const v of this.visuals.slice(firstVisual)) v.plushRunway = true;
    return distance => shoulder * Math.min(1, distance / taper, (length - distance) / taper);
  }

  // Level decks at the start of each run. Keep the entrance and exit clear
  // so there is space to stand up, line up a jump and re-enter the chute.
  runningDeck(run) {
    const components = this.componentSpan();
    const length = [26, 32, 30][run];
    const name = ['runway', 'slalomDeck', 'hurdleDeck'][run];
    const s0 = this.sCur, c0 = this.colliders.length;
    const width = this.T.w, start = this.pos(), end = this.at(length);
    const rotation = matYPR(this.T.h);
    let extraHalfWidth;
    if (this.index === 0 && run === 0) {
      extraHalfWidth = this.plushRunway(length, width);
    } else {
      this.slab(start, end, width + 2, FLOOR_T, { col: PALETTE.teal, m: 'paint' });
      for (const side of [-1, 1]) {
        this.wallAlong(start, end, side * (width / 2 + .5), .65, { col: PALETTE.birch });
      }
      for (const distance of [2, length - 2]) {
        this.boxVisual(this.at(distance, 0, .015), rotation, [width, .025, .35], { col: PALETTE.cream });
      }
    }
    const hazards = run === 1 ? [10, 22] : run === 2 ? [15] : [];
    for (const distance of hazards) {
      if (run === 1) {
        const side = distance === 10 ? -1 : 1;
        this.cyl(this.at(distance, side * width * .10, 1), rotation, 1.35, 2,
          { col: PALETTE.yellow, stripes: true });
      } else {
        this.box(this.at(distance, -width * .18, .42), rotation, [width * .58, .84, .85],
          { col: PALETTE.orange });
      }
    }
    const firstSample = this.samples.length;
    this.sampleLine(start, end, width / 2, 0, -1, F_RESPAWN, false);
    for (let i = firstSample; i < this.samples.length; i++) {
      if (extraHalfWidth) this.samples[i].hw += extraHalfWidth(this.samples[i].s - s0);
      if (hazards.some(d => Math.abs(this.samples[i].s - s0 - d) < 3)) this.samples[i].fl &= ~F_RESPAWN;
    }
    this.maybeSupport(this.at(length / 2), width / 2);
    this.setPos(end);
    this.pieces.push({ ...components(), name, s0, s1: this.sCur, c0, c1: this.colliders.length });
    return length;
  }

  // Short flat ledge, then a sheer drop of `height` onto the next piece.
  cliff(height) {
    this.ramp(5, 0.3);
    const p = this.pos();
    this.T.y -= height;
    // Front face of the step gets a row of blocks so the drop reads as a ledge.
    const w = this.T.w;
    const R = matYPR(this.T.h);
    const c = add(p, [0, -height / 2 - FLOOR_T / 2, 0]);
    this.vis({ k: 'box', c: add(c, mul(this.fwd(), -0.5)), R, s: [w + 2, height - FLOOR_T, 1], col: this.nextColor(), m: 'paint' });
    // The fall itself: the path continues straight down.
    this.sampleLine(p, this.pos(), w / 2, 0, -1, 0, false);
  }

  // Rolling speed bumps: half-buried logs across the lane.
  bumps(length, drop) {
    const p0 = this.pos();
    this.ramp(length, drop);
    const p1 = this.pos();
    const w = this.T.w;
    const k = Math.floor(length / 4.5);
    for (let i = 1; i < k; i++) {
      const p = lerp3(p0, p1, i / k);
      const R = matYPR(this.T.h, 0, Math.PI / 2);
      this.cyl(add(p, [0, -0.45, 0]), R, 0.75, w, { mat: MAT.floor, col: this.nextColor(), stripes: true });
    }
  }

  // Plinko: a steeper ramp studded with staggered pegs.
  pegs(length, drop, density = 1) {
    const p0 = this.pos();
    this.ramp(length, drop);
    const p1 = this.pos();
    const w = this.T.w;
    const R0 = matYPR(this.T.h, Math.atan2(drop, length));
    const rows = Math.floor(length / (3.4 / density));
    for (let r = 1; r < rows; r++) {
      const t = r / rows;
      const p = lerp3(p0, p1, t);
      const stagger = r % 2 ? 0 : 1.6;
      for (let x = -w / 2 + 1.6 + stagger; x < w / 2 - 1.2; x += 3.3) {
        const n = [R0[1], R0[4], R0[7]];
        const c = add(add(p, mul(this.lat(), x)), mul(n, 1.1));
        this.cyl(c, R0, 0.42, 2.2, { col: r % 2 ? PALETTE.cream : this.nextColor() });
      }
    }
  }

  // One or two rows of spinning bars.
  spinners(length, drop) {
    const p0 = this.pos();
    this.ramp(length, drop);
    const p1 = this.pos();
    const w = this.T.w;
    const pitch = Math.atan2(drop, length);
    const R0 = matYPR(this.T.h, pitch);
    const n = [R0[1], R0[4], R0[7]];
    const rows = length > 20 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const p = lerp3(p0, p1, rows === 2 ? (r ? 0.72 : 0.28) : 0.5);
      const offs = rows === 2 ? [-w / 4, w / 4] : [0];
      for (const x of offs) {
        const c = add(add(p, mul(this.lat(), x)), mul(n, 0.75));
        const barLen = offs.length > 1 ? w / 2 - 1.2 : w - 3;
        const speed = (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(1.5, 2.3) * (this.index > 2 ? 1.2 : 1);
        this.box(c, R0, [barLen, 1.1, 0.9], { motion: { type: 'spin', axis: n, pivot: c, speed, phase: this.rng.range(0, 6.28) }, mat: MAT.obstacle });
        this.cyl(add(c, mul(n, 0.15)), R0, 0.7, 1.6, { col: PALETTE.cream });
      }
    }
  }

  // A full-width sweeping arm on a flat disc.
  sweeper(length) {
    const p0 = this.pos();
    this.ramp(length, 0.5);
    const p1 = this.pos();
    const w = this.T.w;
    const c = add(lerp3(p0, p1, 0.5), [0, 0.8, 0]);
    const R0 = matYPR(this.T.h);
    const speed = (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(1.0, 1.4);
    this.box(c, R0, [w - 1.5, 1.2, 1.0], { motion: { type: 'spin', axis: [0, 1, 0], pivot: c, speed, phase: this.rng.range(0, 6.28) } });
    this.cyl(c, matIdentity(), 1.0, 2.2, { col: PALETTE.red });
  }

  // Pendulum hammers swinging across the lane.
  hammers(length, drop, count = 2) {
    const entryS = this.sCur, firstSample = this.samples.length;
    const p0 = this.pos();
    this.ramp(length, drop);
    const p1 = this.pos();
    const w = this.T.w;
    const f = this.fwd();
    for (let i = 0; i < count; i++) {
      const fraction = (i + 1) / (count + 1);
      const p = lerp3(p0, p1, fraction);
      if (drop === 0) {
        for (let j = firstSample; j < this.samples.length; j++) {
          if (Math.abs(this.samples[j].s - entryS - length * fraction) < 3) this.samples[j].fl &= ~F_RESPAWN;
        }
      }
      const pivotH = 9;
      const pivot = add(p, [0, pivotH, 0]);
      const headC = add(p, [0, 1.35, 0]);
      const R0 = matYPR(this.T.h);
      const motion = { type: 'swing', axis: f, pivot, amp: 1.05, speed: this.rng.range(1.6, 2.1), phase: i * 1.7 + this.rng.range(0, 1) };
      this.box(headC, R0, [3.2, 2.4, 2.4], { motion, mat: { bounce: 0.7, friction: 0.05, kick: 6 }, col: PALETTE.red });
      // Rod (thin, collides too so marbles can't slip through the arm).
      const rodC = add(p, [0, (pivotH + 2.5) / 2, 0]);
      this.box(rodC, R0, [0.35, pivotH - 2.6, 0.35], { motion: { ...motion }, m: 'wood', col: PALETTE.walnut });
      // Gantry posts and beam (static, outside the walls).
      const l = this.lat();
      for (const sgn of [1, -1]) {
        const base = add(p, mul(l, sgn * (w / 2 + 1.6)));
        this.vis({ k: 'box', c: add(base, [0, pivotH / 2, 0]), R: R0, s: [1.2, pivotH + 1, 1.2], col: PALETTE.navy, m: 'paint' });
      }
      this.vis({ k: 'box', c: add(pivot, [0, 0.6, 0]), R: R0, s: [w + 4.6, 1.2, 1.2], col: PALETTE.yellow, m: 'paint' });
    }
  }

  // Rotating rollers across the lane: some help, some fight you.
  rollers(length, drop) {
    const p0 = this.pos();
    this.ramp(length, drop);
    const p1 = this.pos();
    const w = this.T.w;
    const k = Math.floor(length / 5);
    const l = this.lat();
    for (let i = 1; i < k; i++) {
      const p = add(lerp3(p0, p1, i / k), [0, -0.35, 0]);
      const R0 = matYPR(this.T.h, 0, Math.PI / 2);
      const dirSign = i % 2 ? 1 : -1;
      this.cyl(p, R0, 0.9, w, { motion: { type: 'spin', axis: l, pivot: p, speed: dirSign * 4.5, phase: 0 }, mat: MAT.roller, col: i % 2 ? PALETTE.green : PALETTE.orange, stripes: true });
    }
  }

  // Lane pinches to a narrow neck and opens again.
  funnel(length, drop) {
    const w = this.T.w;
    const neck = Math.max(5, w * 0.38);
    const p0 = this.pos();
    const p1 = this.at(length, 0, -drop);
    this.slab(p0, p1, w + 2, FLOOR_T, { style: 'planks' });
    const a = 0.4, b = 0.6;
    const m0 = lerp3(p0, p1, a), m1 = lerp3(p0, p1, b);
    const l = this.lat();
    for (const sgn of [1, -1]) {
      const o0 = mul(l, sgn * (w / 2 + 0.5)), on = mul(l, sgn * (neck / 2 + 0.5));
      const segs = [[add(p0, o0), add(m0, on)], [add(m0, on), add(m1, on)], [add(m1, on), add(p1, o0)]];
      for (const [s0, s1] of segs) {
        // Angled wall segments; slightly overlapped so there are no gaps at the joints.
        const d = norm(sub(s1, s0));
        this.wallAlong(sub(s0, mul(d, 0.4)), add(s1, mul(d, 0.4)), 0);
      }
    }
    // Wedge fillers behind the angled walls (visual).
    this.sampleLine(p0, p1, neck / 2, 0, -1, F_RESPAWN);
    this.maybeSupport(lerp3(p0, p1, 0.5), w / 2);
    this.setPos(p1);
  }

  // Cross wall with three openings, each guarded by a sliding door.
  gates(length, drop) {
    const s0 = this.sCur, firstSample = this.samples.length;
    const p0 = this.pos();
    this.ramp(length, drop);
    const p1 = this.pos();
    const w = this.T.w;
    const pitch = Math.atan2(drop, length);
    const R0 = matYPR(this.T.h, pitch);
    const n = [R0[1], R0[4], R0[7]];
    const l = this.lat();
    const gateFraction = .55;
    const p = lerp3(p0, p1, gateFraction);
    // On the flat door decks a reset can place the runner anywhere across the
    // lane. Exclude both the wall and the door's swept area from respawn.
    if (drop === 0) {
      for (const sample of this.samples.slice(firstSample)) {
        if (Math.abs(sample.s - s0 - length * gateFraction) < 4) sample.fl &= ~F_RESPAWN;
      }
    }
    const openings = 3;
    const gapW = 3.4;
    const solid = (w - openings * gapW) / (openings + 1);
    let x = -w / 2;
    for (let i = 0; i <= openings; i++) {
      const c = add(add(p, mul(l, x + solid / 2)), mul(n, 1.4));
      this.box(c, R0, [solid, 2.8, 1.4], { mat: MAT.wall });
      x += solid;
      if (i < openings) {
        const dc = add(add(p, mul(l, x + gapW / 2)), add(mul(n, 1.4), mul(this.fwd(), 1.2)));
        this.box(dc, R0, [gapW, 2.6, 0.8], { motion: { type: 'slide', dir: l, amp: gapW * 0.75, speed: this.rng.range(1.4, 2.2), phase: i * 2.1 }, col: PALETTE.yellow });
        x += gapW;
      }
    }
  }

  // Trapdoor floor: tiles drop away on a rolling wave.
  trapFloor(length, drop) {
    const w = this.T.w;
    const p0 = this.pos();
    const p1 = this.at(length, 0, -drop);
    const lead = 3;
    const a = lerp3(p0, p1, lead / length), b = lerp3(p0, p1, 1 - lead / length);
    this.slab(p0, a, w + 2, FLOOR_T, { style: 'planks' });
    this.slab(b, p1, w + 2, FLOOR_T, { style: 'planks' });
    const rows = 4, cols = 3;
    const tileL = len(sub(b, a)) / rows;
    const tileW = (w + 2) / cols;
    const pitch = Math.atan2(drop, length);
    const R0 = matYPR(this.T.h, pitch);
    const nrm = [R0[1], R0[4], R0[7]];
    const l = this.lat();
    const period = this.rng.range(4.8, 5.4);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = (r + 0.5) / rows;
        const ctr = add(add(lerp3(a, b, t), mul(l, -w / 2 - 1 + tileW * (c + 0.5))), mul(nrm, -FLOOR_T / 2));
        // Stagger all twelve tiles, spacing drops in the same row a third of a cycle apart.
        const phase = (c * rows + r) * period / (rows * cols);
        this.box(ctr, R0, [tileW - 0.08, FLOOR_T, tileL - 0.08], { motion: { type: 'drop', depth: 6, period, phase, closedFrac: 0.835 }, mat: MAT.floor, col: (r + c) % 2 ? PALETTE.cream : PALETTE.red, tag: 'trap' });
      }
    }
    this.wallAlong(p0, p1, w / 2 + 0.5);
    this.wallAlong(p0, p1, -w / 2 - 0.5);
    this.sampleTrapFloor(p0, a, b, p1, w / 2, 0, -1, F_RESPAWN);
    this.setPos(p1);
  }

  sampleTrapFloor(start, firstTile, lastTile, end, hw, branch, fork, safeFlags) {
    const first = this.samples.length;
    const spawn = lerp3(start, firstTile, .5);
    this.sampleLine(start, spawn, hw, branch, fork, safeFlags);
    const checkpoint = this.samples.length - 1;
    this.sampleLine(spawn, firstTile, hw, branch, fork, safeFlags, false);
    this.sampleLine(firstTile, lastTile, hw, branch, fork, F_RISKY, false);
    const exit = this.samples.length - 1;
    this.sampleLine(lastTile, end, hw, branch, fork, safeFlags, false);
    this.trapZones.push({ first, checkpoint, exit, last: this.samples.length - 1 });
  }

  // Rolling hills: alternating rises and dips.
  hills(length, drop) {
    const w = this.T.w;
    const humps = Math.max(2, Math.floor(length / 7));
    const p0 = this.pos();
    const pts = [p0];
    for (let i = 1; i <= humps * 2; i++) {
      const t = i / (humps * 2);
      const base = this.at(length * t, 0, -drop * t);
      pts.push(i % 2 ? add(base, [0, 1.3, 0]) : base);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      this.slab(pts[i], pts[i + 1], w + 2, FLOOR_T, { style: 'planks', col: i % 2 ? PALETTE.birch : PALETTE.wood });
    }
    const p1 = pts[pts.length - 1];
    this.wallAlong(add(p0, [0, 0.6, 0]), add(p1, [0, 0.6, 0]), w / 2 + 0.5, WALL_H + 0.6);
    this.wallAlong(add(p0, [0, 0.6, 0]), add(p1, [0, 0.6, 0]), -w / 2 - 0.5, WALL_H + 0.6);
    this.sampleLine(p0, p1, w / 2, 0, -1, F_RESPAWN);
    this.maybeSupport(lerp3(p0, p1, 0.5), w / 2);
    this.setPos(p1);
  }

  // Bouncy pinball bumpers scattered over the lane.
  bumperField(length, drop) {
    const p0 = this.pos();
    this.ramp(length, drop);
    const p1 = this.pos();
    const w = this.T.w;
    const R0 = matYPR(this.T.h, Math.atan2(drop, length));
    const n = [R0[1], R0[4], R0[7]];
    const count = Math.floor(length / 5);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.7) / (count + 0.4);
      const x = (i % 2 ? 1 : -1) * this.rng.range(1, w / 2 - 2.6);
      const c = add(add(lerp3(p0, p1, t), mul(this.lat(), x)), mul(n, 0.9));
      this.cyl(c, R0, 1.25, 1.8, { mat: MAT.bumper, col: PALETTE.pink, m: 'rubber' });
    }
  }

  // Kicker ramp over a gap onto a landing well below: a big airborne drop.
  bigAir(length, drop) {
    const w = this.T.w;
    const p0 = this.pos();
    const tk = 0.45, tg = 0.66, plunge = this.rng.range(3.5, 5);
    const p1 = this.at(length, 0, -drop - plunge);
    const P = (t) => this.at(length * t, 0, -drop * t);
    const kick0 = P(tk), kick1 = add(P(tk + 0.07), [0, 1.1, 0]);
    this.slab(p0, kick0, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(p0, kick0, w / 2 + 0.5);
    this.wallAlong(p0, kick0, -w / 2 - 0.5);
    const lift = [0, 0.02, 0];
    const dir = norm(sub(kick0, p0));
    const bi = this.slab(add(P(0.12), lift), add(P(tk - 0.03), lift), w * 0.5, 0.1, { boost: mul(dir, 32), visual: false });
    const c = this.colliders[bi];
    this.vis({ k: 'box', c: c.c, R: c.R, s: [w * 0.5, 0.12, len(sub(P(tk - 0.03), P(0.12)))], col: '#ffd23f', m: 'boost' });
    this.slab(kick0, kick1, w + 2, 0.7, { col: PALETTE.orange, m: 'paint' });
    const land = add(P(tg), [0, -plunge, 0]);
    this.slab(land, p1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(land, p1, w / 2 + 0.5, WALL_H + 1.2);
    this.wallAlong(land, p1, -w / 2 - 0.5, WALL_H + 1.2);
    // Backstop under the kicker lip so short jumps drop onto the landing instead of into the room.
    this.slab(add(land, mul(this.fwd(), -(length * (tg - tk) + 1))), land, w + 2, FLOOR_T, { style: 'planks', col: PALETTE.walnut });
    this.vis({ k: 'banner', c: add(P(tk), [0, 7, 0]), h: this.T.h, w: w + 3, text: 'BIG AIR', col: PALETTE.orange, posts: true });
    this.sampleLine(p0, kick0, w / 2, 0, -1, F_RESPAWN | F_BOOST, false);
    this.sampleLine(kick0, land, w / 2, 0, -1, F_JUMP | F_RISKY, false);
    this.sampleLine(land, p1, w / 2, 0, -1, F_RESPAWN, false);
    this.maybeSupport(lerp3(land, p1, 0.5), w / 2);
    this.setPos(p1);
  }

  // A staircase of sheer drops, like a waterfall of shelves.
  cascade(steps) {
    for (let i = 0; i < steps; i++) this.cliff(this.rng.range(1.6, 2.4));
  }

  // Seesaw floor: plank sections rocking in counter-phase, so the joints always meet.
  seesaws(length, drop) {
    const w = this.T.w;
    const p0 = this.pos();
    const p1 = this.at(length, 0, -drop);
    const k = 3;
    const lead = 2.5;
    const a = lerp3(p0, p1, lead / length), b = lerp3(p0, p1, 1 - lead / length);
    this.slab(p0, a, w + 2, FLOOR_T, { style: 'planks' });
    this.slab(b, p1, w + 2, FLOOR_T, { style: 'planks' });
    const pitch = Math.atan2(drop, length);
    const R0 = matYPR(this.T.h, pitch);
    const nrm = [R0[1], R0[4], R0[7]];
    const l = this.lat();
    const segL = len(sub(b, a)) / k;
    const speed = this.rng.range(1.1, 1.5), amp = 0.13;
    for (let i = 0; i < k; i++) {
      const ctr = add(lerp3(a, b, (i + 0.5) / k), mul(nrm, -FLOOR_T / 2));
      const motion = { type: 'swing', axis: l, pivot: lerp3(a, b, (i + 0.5) / k), amp, speed, phase: i % 2 ? Math.PI : 0 };
      this.box(ctr, R0, [w + 1.8, FLOOR_T, segL - 0.05], { motion, mat: MAT.floor, col: i % 2 ? PALETTE.cream : PALETTE.teal });
      // Fulcrum block under each seesaw.
      this.vis({ k: 'box', c: add(lerp3(a, b, (i + 0.5) / k), [0, -FLOOR_T - 0.6, 0]), R: matYPR(this.T.h), s: [w + 1, 1.2, 1.2], col: PALETTE.navy, m: 'paint' });
    }
    this.wallAlong(add(p0, [0, 0.8, 0]), add(p1, [0, 0.8, 0]), w / 2 + 0.5, WALL_H + 0.8);
    this.wallAlong(add(p0, [0, 0.8, 0]), add(p1, [0, 0.8, 0]), -w / 2 - 0.5, WALL_H + 0.8);
    this.sampleLine(p0, a, w / 2, 0, -1, F_RESPAWN, false);
    this.sampleLine(a, b, w / 2, 0, -1, 0, false);
    this.sampleLine(b, p1, w / 2, 0, -1, F_RESPAWN, false);
    this.maybeSupport(lerp3(p0, p1, 0.5), w / 2);
    this.setPos(p1);
  }

  // Piano keys: the floor is a grid of blocks bobbing up and down in a travelling wave.
  keys(length, drop) {
    const w = this.T.w;
    const p0 = this.pos();
    const p1 = this.at(length, 0, -drop);
    const lead = 2.5;
    const a = lerp3(p0, p1, lead / length), b = lerp3(p0, p1, 1 - lead / length);
    this.slab(p0, a, w + 2, FLOOR_T, { style: 'planks' });
    this.slab(b, p1, w + 2, FLOOR_T, { style: 'planks' });
    // Static floor a little below, in case a key is caught low.
    this.slab(add(a, [0, -1.2, 0]), add(b, [0, -1.2, 0]), w + 2, FLOOR_T, { style: 'planks', col: PALETTE.walnut });
    const pitch = Math.atan2(drop, length);
    const R0 = matYPR(this.T.h, pitch);
    const nrm = [R0[1], R0[4], R0[7]];
    const l = this.lat();
    const rows = Math.max(4, Math.round(len(sub(b, a)) / 2.6)), cols = 4;
    const keyL = len(sub(b, a)) / rows, keyW = (w + 2) / cols;
    const speed = this.rng.range(2.2, 3);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ctr = add(add(lerp3(a, b, (r + 0.5) / rows), mul(l, -w / 2 - 1 + keyW * (c + 0.5))), mul(nrm, -FLOOR_T / 2 - 0.25));
        const motion = { type: 'slide', dir: [0, 1, 0], amp: 0.42, speed, phase: -r * 0.8 + c * 0.5 };
        this.box(ctr, R0, [keyW - 0.06, FLOOR_T + 0.5, keyL - 0.06], { motion, mat: MAT.floor, col: (r + c) % 2 ? PALETTE.cream : this.nextColor() });
      }
    }
    this.wallAlong(add(p0, [0, 0.4, 0]), add(p1, [0, 0.4, 0]), w / 2 + 0.5, WALL_H + 0.4);
    this.wallAlong(add(p0, [0, 0.4, 0]), add(p1, [0, 0.4, 0]), -w / 2 - 0.5, WALL_H + 0.4);
    this.sampleLine(p0, a, w / 2, 0, -1, F_RESPAWN, false);
    this.sampleLine(a, b, w / 2, 0, -1, 0, false);
    this.sampleLine(b, p1, w / 2, 0, -1, F_RESPAWN, false);
    this.maybeSupport(lerp3(p0, p1, 0.5), w / 2);
    this.setPos(p1);
  }

  // Half-pipe: the lane's cross-section becomes a U (a flat middle and five rolled painted slabs a side, a quarter
  // circle up to vertical), so marbles can carve up the walls. The U grows out of the floor over a lead-in and sinks
  // back into it at the end (the whole U pitched into the plank floor), so there is no step on the way in or out.
  // Pink bumpers down the middle make the high line the fast one.
  halfpipe(length, drop) {
    const w = this.T.w;
    const l = this.lat();
    const p0 = this.pos(), p1 = this.at(length, 0, -drop);
    const wc = w * 0.3, Rh = w / 2 - wc / 2;
    const lead = 12, sink = Rh * 0.75;
    const P = (u, x, y) => add(lerp3(p0, p1, u / length), add(mul(l, x), [0, y, 0]));
    this.slab(p0, p1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(p0, p1, w / 2 + 0.5);
    this.wallAlong(p0, p1, -w / 2 - 0.5);
    const bands = 5;
    const cols = [this.nextColor(), PALETTE.cream];
    for (const sgn of [1, -1]) {
      for (let j = 0; j < bands; j++) {
        const t0 = (Math.PI / 2) * (j / bands), t1 = (Math.PI / 2) * ((j + 1) / bands), tm = (t0 + t1) / 2;
        const e0 = [wc / 2 + Rh * Math.sin(t0), Rh * (1 - Math.cos(t0))];
        const e1 = [wc / 2 + Rh * Math.sin(t1), Rh * (1 - Math.cos(t1))];
        const mx = sgn * (e0[0] + e1[0]) / 2, my = (e0[1] + e1[1]) / 2;
        const cw = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) + 0.04;
        const up = norm(add(mul(l, -sgn * Math.sin(tm)), [0, Math.cos(tm), 0]));
        // Each band starts where its lead-in is just under the floor's surface, so little pokes out below.
        const ue = Math.max(0, lead * (1 - (my + 0.9) / sink));
        const col = cols[j % 2];
        this.slab(P(ue, mx, my - sink * (1 - ue / lead)), P(lead, mx, my), cw, FLOOR_T, { up, col });
        this.slab(P(lead, mx, my), P(length - lead, mx, my), cw, FLOOR_T, { up, col, style: 'blocks', blockLen: 3.2 });
        this.slab(P(length - lead, mx, my), P(length - ue, mx, my - sink * (1 - ue / lead)), cw, FLOOR_T, { up, col });
      }
    }
    // A low diamond spine down the middle (ramp nose, so nothing bounces a marble back): ride the walls.
    const sp0 = lead - 1, sp1 = length - lead + 2, ridge = 0.8;
    const Rs = frameBetween(P(sp0, 0, 0), P(sp1, 0, 0), norm(add(l, [0, 1, 0])));
    const half = (ridge + 0.25) / Math.SQRT2;
    this.box(add(lerp3(P(sp0, 0, 0), P(sp1, 0, 0), 0.5), [0, -0.25, 0]), Rs, [half * 2, half * 2, len(sub(P(sp1, 0, 0), P(sp0, 0, 0)))], { mat: MAT.wall, col: PALETTE.yellow });
    this.slab(P(sp0 - 3.5, 0.3, -0.05), P(sp0 + 0.4, 0.3, ridge), 1.1, 0.8, { col: PALETTE.yellow, m: 'paint' });
    const a = P(2, 0, 0), b = P(length - 2, 0, 0);
    this.sampleLine(p0, a, w / 2, 0, -1, F_RESPAWN, false);
    this.sampleLine(a, b, w / 2, 0, -1, F_PIPE, false);
    this.sampleLine(b, p1, w / 2, 0, -1, F_RESPAWN, false);
    this.maybeSupport(lerp3(p0, p1, 0.3), w / 2);
    this.maybeSupport(lerp3(p0, p1, 0.75), w / 2);
    this.setPos(p1);
  }

  // ------------------------------------------------------------ fork

  // Splits the lane into branches with different hazards; all re-merge at the same point.
  fork(length, drop, kinds) {
    const w = this.T.w;
    const k = kinds.length;
    // The high road is a narrow raised deck; the other branches share what's left.
    const nHigh = kinds.filter((x) => x === 'high').length;
    const highW = 5;
    // A loop needs room for its entry lane and, beside it, the lane it comes back down onto.
    const nLoop = kinds.filter((x) => x === 'loop').length;
    const loopW = Math.min(10, w * 0.58);
    const restW = (w - (k - 1) - nHigh * highW - nLoop * loopW) / (k - nHigh - nLoop);
    const widths = kinds.map((x) => (x === 'high' ? highW : x === 'loop' ? loopW : restW));
    const lefts = [];
    for (let i = 0, x = -w / 2; i < k; i++) {
      lefts.push(x);
      x += widths[i] + 1;
    }
    const p0 = this.pos();
    const p1 = this.at(length, 0, -drop);
    const l = this.lat();
    const forkId = this.forks.length;
    const fork = { id: forkId, s0: this.sCur, s1: this.sCur + Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), branches: [] };
    this.forks.push(fork);
    const sStart = this.sCur;
    // Outer walls and dividers.
    this.wallAlong(p0, p1, w / 2 + 0.5);
    this.wallAlong(p0, p1, -w / 2 - 0.5);
    for (let i = 1; i < k; i++) {
      const x = lefts[i] - 0.5;
      const a = add(p0, mul(l, x)), b = add(p1, mul(l, x));
      // Beside the high road the embankment itself is the divider (and its open edge is the point).
      if (kinds[i] !== 'high' && kinds[i - 1] !== 'high') this.wallAlong(a, b, 0, 3.2, { thick: 1 });
      else this.wallAlong(a, lerp3(a, b, 0.08), 0, 3.2, { thick: 1 });
      // Round nose so marbles glance off the divider instead of stopping dead on it.
      this.cyl(add(a, [0, 0.9, 0]), matIdentity(), 0.75, 4, { mat: MAT.wall, col: PALETTE.cream });
    }
    // Sign posts over each branch entrance.
    for (let i = 0; i < k; i++) {
      const wb = widths[i];
      const x = lefts[i] + wb / 2;
      const branchId = ++this.branchCount;
      const info = BRANCH_INFO[kinds[i]];
      fork.branches.push({ id: branchId, kind: kinds[i], speed: info.speed, risk: info.risk, side: x });
      this.vis({ k: 'sign', c: add(add(p0, mul(l, x)), [0, 7.4, 0]), h: this.T.h, w: Math.min(wb, 4.6), text: info.label, col: info.col });
      this.sCur = sStart;
      this.branchOuter = i === 0 ? -1 : i === k - 1 ? 1 : 0;
      this.branch(kinds[i], add(p0, mul(l, x)), add(p1, mul(l, x)), wb, branchId, forkId);
    }
    // Gantry the branch signs hang from.
    this.vis({ k: 'box', c: add(add(p0, [0, 8.9, 0]), mul(this.fwd(), -0.2)), R: matYPR(this.T.h), s: [w + 3, 0.6, 0.6], col: PALETTE.walnut, m: 'wood' });
    for (const sgn of [1, -1]) {
      this.vis({ k: 'box', c: add(add(p0, mul(l, sgn * (w / 2 + 1.5))), [0, 4.1, 0]), R: matYPR(this.T.h), s: [0.7, 10.2, 0.7], col: PALETTE.walnut, m: 'wood' });
    }
    this.sCur = sStart + Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    this.maybeSupport(lerp3(p0, p1, 0.3), w / 2);
    this.maybeSupport(lerp3(p0, p1, 0.8), w / 2);
    this.setPos(p1);
  }

  branch(kind, a, b, wb, br, fk) {
    const hw = wb / 2;
    const dir = norm(sub(b, a));
    const L = len(sub(b, a));
    const pitch = Math.asin(Math.max(-1, Math.min(1, -dir[1])));
    const R0 = matYPR(this.T.h, pitch);
    const n = [R0[1], R0[4], R0[7]];
    const l = this.lat();
    const P = (t) => lerp3(a, b, t);
    const floor = (t0, t1, o = {}) => this.slab(P(t0), P(t1), wb + (o.narrow ? 0 : 0.2), FLOOR_T, { style: 'planks', ...o });
    const flagsSafe = 0;
    switch (kind) {
      case 'clear': {
        floor(0, 1);
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'boost': {
        floor(0, 1);
        const lift = [0, 0.02, 0];
        const bi = this.slab(add(P(0.15), lift), add(P(0.75), lift), wb * 0.6, 0.1, { boost: mul(dir, 34), visual: false });
        const c = this.colliders[bi];
        this.vis({ k: 'box', c: c.c, R: c.R, s: [wb * 0.6, 0.12, L * 0.6], col: '#ffd23f', m: 'boost' });
        this.sampleLine(a, b, hw, br, fk, F_BOOST);
        break;
      }
      case 'beam': {
        // A narrow beam with a speed strip and nothing either side.
        const bw = 2.3;
        floor(0, 0.06);
        this.slab(P(0.06), P(0.94), bw, FLOOR_T, { col: PALETTE.yellow, m: 'paint' });
        floor(0.94, 1);
        const lift = [0, 0.02, 0];
        const bi = this.slab(add(P(0.2), lift), add(P(0.7), lift), bw * 0.7, 0.1, { boost: mul(dir, 22), visual: false });
        const c = this.colliders[bi];
        this.vis({ k: 'box', c: c.c, R: c.R, s: [bw * 0.7, 0.12, L * 0.5], col: '#ffd23f', m: 'boost' });
        this.sampleLine(a, b, 1.0, br, fk, F_RISKY | F_BOOST);
        break;
      }
      case 'jump': {
        // Speed strip, kicker ramp, gap, landing.
        const tk = 0.42, tg = 0.62;
        floor(0, tk);
        const lift = [0, 0.02, 0];
        const bi = this.slab(add(P(0.08), lift), add(P(tk - 0.04), lift), wb * 0.6, 0.1, { boost: mul(dir, 36), visual: false });
        const c = this.colliders[bi];
        this.vis({ k: 'box', c: c.c, R: c.R, s: [wb * 0.6, 0.12, L * (tk - 0.12)], col: '#ffd23f', m: 'boost' });
        const k0 = P(tk), k1 = add(P(tk + 0.06), [0, 0.9, 0]);
        this.slab(k0, k1, wb, 0.6, { col: PALETTE.orange, m: 'paint' });
        const landing = add(P(tg), [0, -0.6, 0]);
        this.slab(landing, P(1), wb + 0.2, FLOOR_T, { style: 'planks' });
        this.sampleLine(a, k0, hw, br, fk, F_BOOST);
        this.sampleLine(k0, landing, hw, br, fk, F_JUMP | F_RISKY, false);
        this.sampleLine(landing, b, hw, br, fk, 0, false);
        break;
      }
      case 'stairs': {
        const steps = 5;
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps, t1 = (i + 1) / steps;
          const y = P(t0)[1];
          const s0 = [P(t0)[0], y, P(t0)[2]], s1 = [P(t1)[0], y, P(t1)[2]];
          this.slab(s0, s1, wb + 0.2, FLOOR_T + (P(t0)[1] - P(t1)[1]), { col: i % 2 ? PALETTE.blue : PALETTE.teal, m: 'paint' });
        }
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'pegs': {
        floor(0, 1);
        for (let t = 0.15, r = 0; t < 0.92; t += 0.11, r++) {
          for (let x = -hw + 1.2 + (r % 2 ? 1.3 : 0); x < hw - 0.9; x += 2.6) {
            this.cyl(add(add(P(t), mul(l, x)), mul(n, 1.1)), R0, 0.4, 2.2, { col: r % 2 ? PALETTE.cream : PALETTE.green });
          }
        }
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'spinner': {
        floor(0, 1);
        for (const t of [0.35, 0.72]) {
          const c = add(P(t), mul(n, 0.75));
          this.box(c, R0, [wb - 1.0, 1.1, 0.8], { motion: { type: 'spin', axis: n, pivot: c, speed: this.rng.range(1.8, 2.6) * (t < 0.5 ? 1 : -1), phase: this.rng.range(0, 6.28) } });
          this.cyl(c, R0, 0.55, 1.6, { col: PALETTE.cream });
        }
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'hammer': {
        floor(0, 1);
        const p = P(0.5);
        const pivotH = 8;
        const pivot = add(p, [0, pivotH, 0]);
        const motion = { type: 'swing', axis: this.fwd(), pivot, amp: 0.85, speed: this.rng.range(1.9, 2.3), phase: this.rng.range(0, 6) };
        const Ry = matYPR(this.T.h);
        this.box(add(p, [0, 1.3, 0]), Ry, [Math.min(3, wb - 1.5), 2.2, 2.2], { motion, mat: { bounce: 0.7, friction: 0.05, kick: 6 }, col: PALETTE.red });
        this.box(add(p, [0, (pivotH + 2.4) / 2, 0]), Ry, [0.3, pivotH - 2.4, 0.3], { motion: { ...motion }, m: 'wood', col: PALETTE.walnut });
        this.vis({ k: 'box', c: add(pivot, [0, 0.5, 0]), R: Ry, s: [wb + 1, 1, 1], col: PALETTE.navy, m: 'paint' });
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'trap': {
        floor(0, 0.12);
        floor(0.88, 1);
        const rows = 4;
        for (let r = 0; r < rows; r++) {
          const t = 0.12 + (r + 0.5) * (0.76 / rows);
          const c = add(P(t), mul(n, -FLOOR_T / 2));
          this.box(c, R0, [wb + 0.2, FLOOR_T, L * 0.76 / rows - 0.08], { motion: { type: 'drop', depth: 6, period: 4, phase: -r, closedFrac: 0.78 }, mat: MAT.floor, col: r % 2 ? PALETTE.cream : PALETTE.red, tag: 'trap' });
        }
        this.sampleTrapFloor(a, P(.12), P(.88), b, hw, br, fk, flagsSafe);
        break;
      }
      case 'bumpers': {
        floor(0, 1);
        for (const [t, x] of [[0.3, -0.3], [0.5, 0.3], [0.72, -0.15]]) {
          this.cyl(add(add(P(t), mul(l, x * wb)), mul(n, 0.9)), R0, 1.0, 1.8, { mat: MAT.bumper, col: PALETTE.pink, m: 'rubber' });
        }
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'tunnel': {
        floor(0, 1);
        // A row of open block arches overhead (decoration only, so the camera can follow through), pegs inside.
        for (let t = 0.12; t < 0.9; t += 0.19) {
          const c = add(P(t), mul(n, 3.9));
          this.vis({ k: 'box', c, R: R0, s: [wb + 1.4, 0.8, 1.2], col: PALETTE.purple, m: 'paint' });
        }
        for (let t = 0.2, r = 0; t < 0.85; t += 0.16, r++) {
          this.cyl(add(add(P(t), mul(l, (r % 2 ? 0.25 : -0.25) * wb)), mul(n, 1.1)), R0, 0.45, 2.2, { col: PALETTE.cream });
        }
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'high': {
        // The high road: a kicker up onto a narrow plank deck on a block embankment, which holds its height while
        // the low road falls away beside it. Sliding pushers try to shove you off the open edge, down onto the
        // low road; make it across and a steep chute drops you back in ahead.
        const outer = this.branchOuter || 1;
        // The deck descends in step with the low road, so it keeps both its height and its speed.
        const tr = 0.24, tc = 0.86, rise = 2.2;
        const fall = a[1] - b[1];
        // Smoothstep climb so the crest rolls over instead of launching you off the deck.
        const deckY = (t) => {
          if (t > tr) return a[1] + rise - fall * (t - tr);
          const u = t / tr;
          return a[1] + rise * u * u * (3 - 2 * u);
        };
        const D = (t) => [P(t)[0], deckY(t), P(t)[2]];
        const lift = [0, 0.02, 0];
        // Approach strip: you need the speed to make the climb.
        floor(0, 0.06);
        const bi = this.slab(add(P(0.0), lift), add(D(tr * 0.85), lift), wb * 0.7, 0.1, { boost: mul(norm(sub(D(tr), P(0))), 32), visual: false });
        const bc = this.colliders[bi];
        this.vis({ k: 'box', c: bc.c, R: bc.R, s: [wb * 0.7, 0.12, len(sub(D(tr * 0.85), P(0)))], col: '#ffd23f', m: 'boost' });
        const segs = [[0, tr * 0.25], [tr * 0.25, tr * 0.5], [tr * 0.5, tr * 0.75], [tr * 0.75, tr], [tr, 0.52], [0.52, tc]];
        for (const [t0, t1] of segs) {
          const top0 = D(t0), top1 = D(t1);
          const depth = Math.max(top0[1] - P(t0)[1], top1[1] - P(t1)[1]) + FLOOR_T;
          this.slab(top0, top1, wb + 0.2, FLOOR_T, { style: 'planks', col: PALETTE.birch });
          // Embankment of painted blocks under the deck (solid, so it doubles as the divider).
          const R = frameBetween(top0, top1);
          const nn = [R[1], R[4], R[7]];
          const mid = add(lerp3(top0, top1, 0.5), mul(nn, -FLOOR_T - (depth - FLOOR_T) / 2));
          const hz = len(sub(top1, top0)) / 2;
          const climbing = t1 <= tr;
          if (depth > FLOOR_T + 0.3) {
            this.collider('box', { c: mid, R, hx: wb / 2 + 0.1, hy: (depth - FLOOR_T) / 2, hz, mat: MAT.wall });
            this.boxVisual(mid, R, [wb + 0.2, depth - FLOOR_T, hz * 2], climbing ? { col: PALETTE.navy } : { style: 'blocks', blockLen: 2.2 });
          }
          // Guard wall on the outer edge (one straight piece up the climb); the inner edge only has a low lip,
          // so a shove still sends you over.
          if (!climbing) this.wallAlong(top0, top1, outer * (wb / 2 + 0.5), 1.6, { thick: 0.8 });
          if (t0 >= tr * 0.5) this.wallAlong(top0, top1, -outer * (wb / 2 + 0.15), 0.32, { thick: 0.3, col: PALETTE.yellow });
        }
        this.wallAlong(add(D(0), [0, 0.25, 0]), add(D(tr), [0, 0.25, 0]), outer * (wb / 2 + 0.5), 1.6, { thick: 0.8 });
        // Chute back down to the merge.
        const c0 = D(tc);
        this.slab(c0, b, wb + 0.2, FLOOR_T, { col: PALETTE.orange, m: 'paint' });
        this.wallAlong(c0, b, outer * (wb / 2 + 0.5), 2.2, { thick: 0.8 });
        this.wallAlong(c0, b, -outer * (wb / 2 + 0.5), 2.2, { thick: 0.8 });
        // Speed strip on the deck, then the pushers.
        const ds = this.slab(add(D(0.24), lift), add(D(0.82), lift), wb * 0.5, 0.1, { boost: mul(norm(sub(D(0.82), D(0.24))), 40), visual: false });
        const dc = this.colliders[ds];
        this.vis({ k: 'box', c: dc.c, R: dc.R, s: [wb * 0.5, 0.12, len(sub(D(0.82), D(0.24)))], col: '#ffd23f', m: 'boost' });
        const Rd = matYPR(this.T.h);
        const pushers = this.index >= 3 ? [0.5, 0.7] : [0.62];
        pushers.forEach((t, i) => {
          const c = add(D(t), [0, 0.7, 0]);
          this.box(c, Rd, [1.6, 1.4, 1.0], { motion: { type: 'slide', dir: l, amp: wb / 2 - 0.3, speed: this.rng.range(1.4, 1.9), phase: i * 2.2 + this.rng.range(0, 1) }, col: PALETTE.red, mat: { bounce: 0.6, friction: 0.05, kick: 5 } });
        });
        this.sampleLine(P(0), D(tr), hw, br, fk, F_BOOST);
        this.sampleLine(D(tr), D(tc), hw, br, fk, F_RISKY | F_BOOST, false);
        this.sampleLine(D(tc), b, hw, br, fk, 0, false);
        break;
      }
      case 'low': {
        // The low road: safe and walled, but bumpy, so it costs time.
        floor(0, 1);
        const Rb = matYPR(this.T.h, 0, Math.PI / 2);
        for (const t of [0.22, 0.38, 0.54, 0.7, 0.86]) this.cyl(add(P(t), [0, -0.42, 0]), Rb, 0.8, wb + 0.2, { mat: MAT.floor, col: this.nextColor(), stripes: true });
        this.sampleLine(a, b, hw, br, fk, flagsSafe);
        break;
      }
      case 'loop': {
        this.loopBranch(a, b, wb, br, fk);
        break;
      }
      case 'cannon': {
        this.cannonBranch(a, b, wb, br, fk);
        break;
      }
      default:
        throw new Error('unknown branch ' + kind);
    }
  }

  // ------------------------------------------------------------ loop-the-loop

  // A funnel and a long speed strip into a full vertical loop. The loop drifts sideways as it goes round (an eased
  // corkscrew, a smooth helix collider), so it comes down beside its own entry lane; the exit lane runs on to the
  // merge. The track has a shallow trough and a lip each side, and the entry lane only spans the trough's flat
  // middle, so the two meet flush. A marble without the speed drops off the top onto the lower part of the loop.
  loopBranch(a, b, wb, br, fk) {
    const c0 = this.colliders.length;
    const f = this.fwd(), l = this.lat(), up = [0, 1, 0];
    const Lh = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const fall = a[1] - b[1];
    const sig = -(this.branchOuter || 1); // entry lane on the neighbour's side, exit lane along the outside
    const Ws = Math.max(3.2, Math.min(4.2, (wb - 0.75) / 2.2));
    const k = Ws / 4.2;
    const xe = sig * (wb / 2 - Ws / 2), xx = -xe;
    const Rf = LOOP_R, shell = 0.25, rl = Rf + shell;
    const uf = 10, uc = Math.max(16, Lh * 0.5), ux = uc + Rf + 0.6, up0 = uc - Rf - 0.5;
    const yB = -(fall * (uc / Lh) + 0.8); // the loop sits in a slight dip
    const yAt = (u) => (u <= uc ? (yB * u) / uc : yB + (-fall - yB) * ((u - uc) / (Lh - uc)));
    const Q = (u, x, y = yAt(u)) => [a[0] + f[0] * u + l[0] * x, a[1] + y, a[2] + f[2] * u + l[2] * x];
    // Cross-section [lateral, height above the floor], one side to the other.
    const half = [[1.0 * k, 0], [1.6 * k, 0.18], [2.1 * k, 0.65], [2.1 * k, 1.4]];
    const sec = half.slice().reverse().map(([y, h]) => [-y, h]).concat(half);
    const C = add(Q(uc, 0, yB), [0, Rf, 0]);
    const R = [0, l[0], f[0], -1, 0, 0, 0, l[2], f[2]];
    const rise = xx - xe;
    this.collider('helix', { c: C, R, profile: sec.map(([y, h]) => [rl - h, xe + y]), a0: 0, a1: Math.PI * 2, rise, ease: true, shell, mat: MAT.slick });
    // Visuals: the trough in natural wood, painted lips, on a plinth.
    const ride = sec.slice(1, -1).reverse().map(([y, h]) => [rl - shell - h, xe + y]);
    const floorOutline = [[rl - shell - 0.65, xe - 2.1 * k], [rl + 0.35, xe - 2.1 * k], [rl + 0.35, xe + 2.1 * k]].concat(ride.slice(0, -1));
    const hv = { k: 'helix', c: C, R, a0: 0, a1: Math.PI * 2, rise, ease: true, segments: 26 };
    this.vis({ ...hv, outline: floorOutline, col: PALETTE.birch, m: 'wood' });
    const lipCol = this.nextColor();
    for (const sgn of [-1, 1]) {
      const y0 = xe + sgn * 2.1 * k - shell, y1 = xe + sgn * 2.1 * k + shell;
      this.vis({ ...hv, outline: [[rl - 1.4 - shell, y0], [rl - 0.5, y0], [rl - 0.5, y1], [rl - 1.4 - shell, y1]], col: sgn > 0 ? lipCol : PALETTE.cream, m: 'paint' });
    }
    this.vis({ k: 'box', c: add(Q(uc, 0, yB), [0, -1.4, 0]), R: matYPR(this.T.h), s: [wb + 1, 1.2, 2 * Rf + 1.4], col: PALETTE.navy, m: 'paint' });
    // Approach: full width, then a diagonal guide wall funnels everyone into the entry lane and its speed strip.
    this.slab(Q(0, 0), Q(uf + 0.5, 0), wb + 0.2, FLOOR_T, { style: 'planks' });
    // Funnel and lane walls are slick: a marble that hits one loses its sideways bounce, not its speed.
    this.wallAlong(Q(0.4, -sig * (wb / 2 - 0.2)), Q(uf, xe - sig * 2.0 * k), 0, WALL_H, { thick: 0.8, mat: MAT.slick });
    this.slab(Q(uf, xe), Q(uc + 0.1, xe, yB), Ws + 0.1, FLOOR_T, { style: 'planks' });
    this.wallAlong(Q(0.3, xe), Q(uc - 0.15, xe), sig * 1.85 * k, 1.4, { thick: 0.5 * k, mat: MAT.slick });
    const inW = 0.5 * k + 0.33;
    this.wallAlong(Q(uf, xe), Q(uc - 0.15, xe), -sig * (1.6 * k + inW / 2), 1.4, { thick: inW, mat: MAT.slick });
    // Speed strips over the whole approach and the whole lane: everyone reaches the loop with 30+ to spare.
    const lift = [0, 0.02, 0];
    for (const [u0, u1, x, w] of [[1.2, uf, 0, wb - 0.4], [uf, uc - 0.8, xe, 3.2 * k]]) {
      const bs0 = Q(u0, x), bs1 = Q(u1, x);
      const bi = this.slab(add(bs0, lift), add(bs1, lift), w, 0.1, { boost: mul(norm(sub(Q(u1, xe), Q(u0, xe))), 32), boostCap: 33, visual: false });
      const bc = this.colliders[bi];
      this.vis({ k: 'box', c: bc.c, R: bc.R, s: [w, 0.12, len(sub(bs1, bs0))], col: '#ffd23f', m: 'boost' });
    }
    // Median between the lanes, and the pocket behind the loop on the exit side (floored and closed off).
    const mw = wb - 2 * Ws - 0.66;
    this.wallAlong(Q(uf, 0), Q(uc, 0, yB), 0, 1.4, { thick: mw });
    this.wallAlong(Q(uc, 0, yB), Q(ux, 0), 0, 1.4, { thick: mw });
    const pIn = mw / 2, pw = wb / 2 - pIn, px = -sig * (pIn + pw / 2);
    this.slab(Q(uf, px), Q(up0, px), pw, FLOOR_T, { style: 'planks', col: PALETTE.walnut });
    this.wallAlong(Q(up0, -sig * pIn), Q(up0, -sig * wb / 2), 0, 1.4, { thick: 0.6 });
    // Exit: the lane it lands on, walled up to past the loop, then the full width again to the merge.
    this.slab(Q(uc - 0.1, xx, yB), Q(uc + 3.3, xx), Ws + 0.1, FLOOR_T, { style: 'planks' });
    this.wallAlong(Q(uc + 0.15, xx), Q(ux, xx), sig * (2.1 * k + 0.165), 1.4, { thick: 0.33 });
    this.slab(Q(uc + 3.2, 0), b, wb + 0.2, FLOOR_T, { style: 'planks' });
    this.wallAlong(Q(uc + 3.6, xe - sig * Ws / 2), Q(uc + 3.6, xe + sig * Ws / 2), 0, 0.9, { thick: 0.5 });
    // Path: approach and lane, round the loop (facing forward throughout, for the camera), the exit lane.
    const s0 = this.sCur;
    const D = 6; // progress the loop itself is worth
    const sOut = (u) => s0 + uc + D + ((u - uc) * (Lh - uc - D)) / (Lh - uc);
    const put = (p, s, hw, fl, t = f) => {
      this.sCur = s;
      this.sample(p, t, hw, br, fk, fl);
    };
    const seg = (u0, x0, u1, x1, hw0, hw1, flags, sFn, first) => {
      const p0 = Q(u0, x0), p1 = Q(u1, x1);
      const t = norm([p1[0] - p0[0], 0, p1[2] - p0[2]]);
      const n = Math.max(1, Math.ceil(Math.hypot(u1 - u0, x1 - x0) / SAMPLE_STEP));
      for (let i = first ? 0 : 1; i <= n; i++) {
        const q = i / n, u = u0 + (u1 - u0) * q;
        put(Q(u, x0 + (x1 - x0) * q), sFn(u), hw0 + (hw1 - hw0) * q, typeof flags === 'function' ? flags(u) : flags, t);
      }
    };
    const laneHw = 1.6 * k;
    seg(0, 0, uf, xe, wb / 2, laneHw, F_BOOST, (u) => s0 + u, true);
    seg(uf, xe, uc, xe, laneHw, laneHw, F_BOOST | F_RISKY | F_LOOP, (u) => s0 + u, false);
    const N = 16;
    for (let i = 1; i < N; i++) {
      const ph = (Math.PI * 2 * i) / N, q = i / N;
      const off = rise * q * q * (3 - 2 * q);
      const p = add(add(C, add(mul(up, -Math.cos(ph) * Rf), mul(f, Math.sin(ph) * Rf))), mul(l, xe + off));
      put(p, s0 + uc + D * q, laneHw, F_LOOP | F_RISKY | F_BOOST);
    }
    seg(uc, xx, ux, xx, Ws / 2, Ws / 2, (u) => (u < uc + 2 ? F_LOOP : 0), sOut, true);
    seg(ux, xx, Lh, 0, Ws / 2, wb / 2, 0, sOut, false);
    this.sCur = s0 + Lh;
    this.forks[fk].loop = { br, sBottom: s0 + uc, sOut: s0 + uc + D, c0, c1: this.colliders.length };
  }

  // ------------------------------------------------------------ big jumps and air time

  // Curved ramp across the lane: a slice of a cylinder lying on its side (axis along the lane's lateral), the marble
  // riding its inside from angle a0 to a1 (0 = straight down from the axis C, positive = forward). Smooth at any speed.
  arcRamp(C, Rk, a0, a1, w, o = {}) {
    const f = this.fwd(), l = this.lat();
    const R = [0, l[0], f[0], -1, 0, 0, 0, l[2], f[2]];
    const sh = 0.5, hw = w / 2;
    // Convex (a crest, ridden on the outside): the shell and the visual thickness sit inside the radius instead.
    const cv = o.convex ? -1 : 1;
    // Tight bounds for the slice (the generic helix bounds cover the whole circle, which for a big crest radius
    // reaches far below the course).
    const box = (rLo, rHi, yLo, yHi) => {
      const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i <= 16; i++) {
        const ph = a0 + ((a1 - a0) * i) / 16;
        for (const r of [rLo, rHi]) {
          for (const y of [yLo, yHi]) {
            const p = add(C, add(add(mul([0, -1, 0], Math.cos(ph) * r), mul(f, Math.sin(ph) * r)), mul(l, y)));
            for (let k = 0; k < 3; k++) {
              bb[k] = Math.min(bb[k], p[k] - 0.6);
              bb[k + 3] = Math.max(bb[k + 3], p[k] + 0.6);
            }
          }
        }
      }
      return bb;
    };
    this.collider('helix', { c: C, R, profile: [[Rk + cv * sh, -hw], [Rk + cv * sh, hw]], a0, a1, shell: sh, mat: o.mat || MAT.floor, aabb: box(Rk + cv * sh - sh, Rk + cv * sh + sh, -hw, hw) });
    const th = o.thick || 0.9;
    // helixLathe counts segments per half turn; about one every 0.8 units of arc.
    const segs = (Math.max(4, Math.ceil(((a1 - a0) * Rk) / 0.8)) * Math.PI) / (a1 - a0);
    const r0 = o.convex ? Rk - th : Rk, r1 = o.convex ? Rk : Rk + th;
    this.vis({ k: 'helix', c: C, R, a0, a1, rise: 0, outline: [[r0, -hw], [r1, -hw], [r1, hw], [r0, hw]], col: o.col || PALETTE.orange, m: o.m || 'paint', segments: segs });
    if (o.walls) {
      // Side cheeks: flat annular walls standing on the curve.
      const wh = o.walls;
      for (const sgn of [1, -1]) {
        const y = sgn * (hw + 0.5);
        this.collider('helix', { c: C, R, profile: [[Rk - wh, y], [Rk + 0.6, y]], a0, a1, shell: 0.5, mat: MAT.wall, aabb: box(Rk - wh - 0.5, Rk + 1.1, y - 0.5, y + 0.5) });
        this.vis({ k: 'helix', c: C, R, a0, a1, rise: 0, outline: [[Rk - wh, y - 0.5], [Rk + th + 0.3, y - 0.5], [Rk + th + 0.3, y + 0.5], [Rk - wh, y + 0.5]], col: o.wallCol || this.nextColor(), m: 'paint', segments: segs });
      }
    }
    return (phi) => add(C, add(mul([0, -1, 0], Math.cos(phi) * Rk), mul(f, Math.sin(phi) * Rk)));
  }

  // Toy cannon (a fork branch): a funnel into the breech of a painted barrel on a wheeled carriage, pointing up at a
  // steep angle. A launcher sensor just inside the breech sets every marble's velocity to the same vector, so the
  // flight is identical on the server and in prediction: a high arc off its platform onto the floor near the end of
  // the branch. The barrel is a hollow tube collider, so the marble flies straight out of the muzzle.
  cannonBranch(a, b, wb, br, fk) {
    const f = this.fwd(), l = this.lat(), up = [0, 1, 0];
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const fall = a[1] - b[1];
    const hw = wb / 2;
    const yAt = (u) => (-fall * u) / L;
    const Q = (u, x = 0, y = yAt(u)) => [a[0] + f[0] * u + l[0] * x, a[1] + y, a[2] + f[2] * u + l[2] * x];
    const ub = CANNON.breech, th = CANNON.angle, Lb = CANNON.barrel, bore = CANNON.bore;
    // The cannon stands on a block platform: a short ramp up to it (the cannon sets everyone's speed, so the climb
    // costs nothing) and a funnel into the breech (slick walls, so a glancing marble keeps its speed).
    const rise = CANNON.rise, uP0 = ub - 1.2, uP1 = ub + 3.2;
    const top = (u) => yAt(u) + rise;
    this.slab(Q(0), Q(1), wb + 0.2, FLOOR_T, { style: 'planks' });
    this.slab(Q(1), Q(uP0, 0, top(uP0)), wb + 0.2, FLOOR_T, { col: PALETTE.orange, m: 'paint' });
    this.slab(Q(uP0, 0, top(uP0)), Q(uP1, 0, top(uP1)), wb + 0.2, FLOOR_T, { style: 'planks', col: PALETTE.birch });
    this.box(add(lerp3(Q(uP0), Q(uP1), 0.5), [0, (rise - FLOOR_T) / 2, 0]), matYPR(this.T.h), [wb + 0.2, rise - FLOOR_T + 0.02, uP1 - uP0], { mat: MAT.wall, col: PALETTE.navy });
    for (const sgn of [1, -1]) this.wallAlong(Q(0.6, sgn * (hw - 0.4)), Q(ub - 0.3, sgn * (bore - 0.25), top(ub - 0.3)), 0, 1.6, { thick: 0.5, mat: MAT.slick, col: PALETTE.cream });
    // The barrel: axis d from the breech (at marble-center height) up at `th`.
    const B = add(Q(ub, 0, top(ub)), [0, 0.55, 0]);
    const d = add(mul(f, Math.cos(th)), mul(up, Math.sin(th)));
    const Z = add(mul(up, -Math.cos(th)), mul(f, Math.sin(th)));
    const Rb = [l[0], d[0], Z[0], l[1], d[1], Z[1], l[2], d[2], Z[2]];
    const tube = 0.25;
    // (The collider starts a little inside the mouth: the launcher has the marble by then, and a big marble rolling
    // in can't catch the tilted rim's back edge.)
    this.collider('helix', { c: B, R: Rb, profile: [[bore + tube, 0.6], [bore + tube, Lb]], a0: 0, a1: Math.PI * 2, shell: tube, mat: MAT.wall });
    // Launch speed for the target landing (plain ballistics from the breech).
    const D = L - ub - CANNON.landBack;
    const dyLand = yAt(ub + D) + 0.5 - (top(ub) + 0.55);
    const V = Math.sqrt((GRAVITY_U * D * D) / (2 * Math.cos(th) ** 2 * (D * Math.tan(th) - dyLand))) * CANNON.dragComp;
    this.collider('box', { c: add(B, mul(d, 0.5)), R: Rb, hx: bore - 0.1, hy: 0.5, hz: bore - 0.1, launch: mul(d, V), tag: 'cannon' });
    // Visuals: a red barrel with cream bands, a dark bore, a fat muzzle ring; a walnut carriage on two wheels.
    const tv = (r0, r1, y0, y1, col, segments = 10) => this.vis({ k: 'helix', c: B, R: Rb, a0: 0, a1: Math.PI * 2, rise: 0, outline: [[r0, y0], [r1, y0], [r1, y1], [r0, y1]], col, m: 'paint', segments });
    tv(bore + 0.05, bore + 0.5, 0, Lb, PALETTE.red);
    tv(bore, bore + 0.05, 0.02, Lb - 0.02, PALETTE.navy, 8);
    for (const [y0, y1] of [[0, 0.5], [Lb * 0.45, Lb * 0.45 + 0.45]]) tv(bore + 0.5, bore + 0.68, y0, y1, PALETTE.cream);
    tv(bore + 0.05, bore + 0.85, Lb - 0.7, Lb, PALETTE.yellow);
    // Carriage: a block cradle under the barrel's back half, and the wheels either side.
    const cU = ub + 1.3;
    this.box(add(Q(cU, 0, top(cU)), [0, -0.1, 0]), matYPR(this.T.h, -th * 0.5), [2.6, 1.6, 3.6], { mat: MAT.wall, col: PALETTE.walnut, m: 'wood' });
    const Rw = matYPR(this.T.h, 0, Math.PI / 2);
    for (const sgn of [1, -1]) {
      const wc = add(Q(cU, sgn * Math.min(hw - 0.35, bore + 0.75), top(cU)), [0, 0.9, 0]);
      this.vis({ k: 'cyl', c: wc, R: Rw, r: 1.35, h: 0.45, col: PALETTE.yellow, m: 'paint' });
      this.vis({ k: 'cyl', c: wc, R: Rw, r: 0.45, h: 0.6, col: PALETTE.navy, m: 'paint' });
    }
    // The floor the marbles fly over, on the branch's own line, to the merge.
    this.slab(Q(uP0), Q(L), wb + 0.2, FLOOR_T, { style: 'planks', col: PALETTE.walnut });
    // Target ring painted on the floor.
    const tgt = Q(ub + D, 0, yAt(ub + D) + 0.02);
    this.vis({ k: 'cyl', c: tgt, R: matIdentity(), r: Math.min(hw - 0.3, 2.4), h: 0.06, col: PALETTE.cream, m: 'paint' });
    this.vis({ k: 'cyl', c: add(tgt, [0, 0.01, 0]), R: matIdentity(), r: Math.min(hw - 0.3, 2.4) * 0.55, h: 0.06, col: PALETTE.red, m: 'paint' });
    // Path: the approach, the flight (as launched, no drag), the floor.
    const s0 = this.sCur;
    const put = (u, x, y, fl) => {
      this.sCur = s0 + u;
      this.sample([a[0] + f[0] * u, a[1] + y, a[2] + f[2] * u], f, hw, br, fk, fl);
    };
    for (let u = 0; u <= ub; u += SAMPLE_STEP) put(u, 0, u < 1 ? yAt(u) : u < uP0 ? yAt(u) + (rise * (u - 1)) / (uP0 - 1) : top(u), 0);
    const vx = V * Math.cos(th), vy = V * Math.sin(th);
    const air0 = this.samples.length;
    let u = ub, y = 0;
    for (let t = 0; ; t += 0.02) {
      u = ub + vx * t;
      y = top(ub) + 0.55 + vy * t - 0.5 * GRAVITY_U * t * t;
      if (t > 0.2 && y < yAt(u) + 0.6) break;
      if (u - (this.sCur - s0) >= SAMPLE_STEP) put(u, 0, y - 0.5, F_RISKY | F_BOOST);
    }
    const airEnd = this.samples.length;
    for (let uu = Math.ceil(u / SAMPLE_STEP) * SAMPLE_STEP; uu <= L + 1e-6; uu += SAMPLE_STEP) put(uu, 0, yAt(uu), 0);
    this.sCur = s0 + L;
    (this.airZones || (this.airZones = [])).push({ s0: s0 + ub - 1, s1: s0 + ub + D, land: tgt, br });
    this.forks[fk].cannon = { br, V, breech: B.slice(), d, D, air: [air0, airEnd] };
  }

  // HOOP JUMP: the lane necks down onto a speed strip and a kicker that launches through a big striped hoop hanging
  // from a gantry. The hoop's rim is solid (clip it and you bounce off); through the middle a sensor gives a short
  // push forward. Short of it, you just drop onto the floor below and roll on.
  hoopJump(L, drop) {
    const w = this.T.w, f = this.fwd(), l = this.lat();
    const p0 = this.pos(), p1 = this.at(L, 0, -drop);
    const H = HOOP;
    const P = (u, x = 0, y = 0) => add(add(lerp3(p0, p1, u / L), mul(l, x)), [0, y, 0]);
    const nw = H.neck, uk0 = H.kick0, uk1 = H.kick1, uR = uk1 + H.dist;
    this.slab(p0, p1, w + 2, FLOOR_T, { style: 'planks' });
    // Tall walls from the lip on: a marble that clips the rim goes sideways at hoop height.
    const pw = P(uk0);
    for (const sgn of [1, -1]) {
      this.wallAlong(p0, pw, sgn * (w / 2 + 0.5));
      this.wallAlong(pw, p1, sgn * (w / 2 + 0.5), H.wallH);
    }
    // Neck: angled walls in, straight to the lip.
    for (const sgn of [1, -1]) {
      const d0 = P(1, sgn * (w / 2 - 0.3)), d1 = P(H.neckAt, sgn * (nw / 2 + 0.4));
      const dd = norm(sub(d1, d0));
      this.wallAlong(sub(d0, mul(dd, 0.3)), add(d1, mul(dd, 0.3)), 0, WALL_H, { thick: 0.8, mat: MAT.slick });
      this.wallAlong(P(H.neckAt, sgn * (nw / 2 + 0.4)), P(uk1, sgn * (nw / 2 + 0.4)), 0, WALL_H + H.rise, { thick: 0.8, col: PALETTE.navy });
    }
    this.strip(P(2), P(uk0 - 0.2), nw * 0.7, H.boost, H.cap);
    // Kicker, and a block under its high end.
    const k0 = P(uk0), k1 = P(uk1, 0, H.rise);
    this.slab(k0, k1, nw + 0.2, 0.6, { col: PALETTE.orange, m: 'paint' });
    this.box(P(uk1 - 0.6, 0, H.rise / 2 - 0.35), matYPR(this.T.h), [nw + 0.2, H.rise - 0.6, 1.2], { mat: MAT.wall, col: PALETTE.orange });
    const lip = k1;
    // The hoop: a torus standing across the lane (axis along it), painted in alternating stripes.
    const C = add(P(uR), [0, H.rise + H.up + (lip[1] - P(uk1)[1] - H.rise), 0]);
    const Rh = [l[0], f[0], 0, 0, 0, -1, l[2], f[2], 0];
    const Rr = H.radius, tr = H.tube;
    const rim = this.collider('lathe', { c: C, R: Rh, profile: [[Rr, -0.01], [Rr, 0.01]], shell: tr, mat: { bounce: 0.35, friction: 0.05 } });
    const nArc = 10;
    for (let i = 0; i < nArc; i++) {
      this.vis({ k: 'helix', c: C, R: Rh, a0: (Math.PI * 2 * i) / nArc, a1: (Math.PI * 2 * (i + 1)) / nArc, rise: 0, outline: [[Rr - tr, -tr], [Rr + tr, -tr], [Rr + tr, tr], [Rr - tr, tr]], col: i % 2 ? PALETTE.cream : PALETTE.red, m: 'paint', segments: 12 });
    }
    // Through the middle: a push along the lane.
    const bonus = this.collider('box', { c: C, R: matYPR(this.T.h), hx: H.bonusR, hy: H.bonusR, hz: 0.5, sensor: true, boost: mul(f, H.bonus), boostCap: H.bonusCap, tag: 'hoop' });
    this.pieceExtra = { rim, bonus };
    // Gantry: posts beside the lane, a beam over the hoop, two hangers.
    const top = C[1] + Rr + tr;
    const Ry = matYPR(this.T.h);
    const beamY = top + 1.4;
    for (const sgn of [1, -1]) {
      const base = P(uR, sgn * (w / 2 + 1.6));
      this.vis({ k: 'box', c: [base[0], (base[1] - 1 + beamY) / 2, base[2]], R: Ry, s: [1.1, beamY - base[1] + 1, 1.1], col: PALETTE.navy, m: 'paint' });
      this.vis({ k: 'box', c: add(C, add(mul(l, sgn * 1.4), [0, Rr + 0.9, 0])), R: Ry, s: [0.3, 1.8, 0.3], col: PALETTE.walnut, m: 'wood' });
    }
    this.vis({ k: 'box', c: add(P(uR), [0, beamY - P(uR)[1] + 0.4, 0]), R: Ry, s: [w + 4.4, 0.9, 0.9], col: PALETTE.yellow, m: 'paint' });
    this.vis({ k: 'sign', c: add(P(uR), [0, beamY - P(uR)[1] + 1.9, 0]), h: this.T.h, w: 4.6, text: 'HOOP', col: PALETTE.red });
    // Path: in (respawn), the neck and kicker, the flight (bots hold their line), the landing.
    const uLand = Math.min(L - 3, uR + H.landAfter);
    // Respawn spots stay inside the walls as they angle in toward the neck.
    this.sampleLine(p0, P(H.neckAt * 0.5), (w + nw) / 4 + 0.5, 0, -1, F_RESPAWN, false);
    this.sampleLine(P(H.neckAt * 0.5), k0, nw / 2, 0, -1, F_BOOST, false);
    this.sampleLine(k0, lip, nw / 2, 0, -1, F_BOOST, false);
    const air0 = this.samples.length;
    this.sampleLine(lip, add(P(uLand), [0, 0.3, 0]), nw / 2, 0, -1, F_BOOST, false);
    this.pieceExtra.air = [[air0, this.samples.length]];
    this.sampleLine(add(P(uLand), [0, 0.3, 0]), p1, w / 2, 0, -1, F_RESPAWN, false);
    this.maybeSupport(P(L * 0.5), w / 2);
    this.setPos(p1);
  }

  // HOPSCOTCH: the lane carries straight on as a run of floating plank platforms with gaps between them, each a
  // little lower than the last, while the floor drops away into a walled trench below. Jump or carry speed across;
  // fall short (or clip a platform's rounded nose) and you drop into the trench, which is bumpy and slower. Everyone
  // comes off the last platform's end down onto the trench floor, which runs on as the lane.
  hopscotch(L, drop) {
    const w = this.T.w;
    const Hs = HOP;
    const D = Hs.depth;
    const p0 = this.pos(), p1 = this.at(L, 0, -drop - D);
    const sStart = this.sCur;
    const line = (u) => (-drop * u) / L;
    const P = (u, y = line(u)) => this.at(u, 0, y);
    const Rb = matYPR(this.T.h, 0, Math.PI / 2);
    // Platforms.
    let u = 0;
    const plats = [];
    for (let i = 0; i < Hs.lens.length; i++) {
      const y0 = line(u) - i * Hs.step, y1 = line(u + Hs.lens[i]) - i * Hs.step;
      const a = P(u, y0), b = P(u + Hs.lens[i], y1);
      plats.push([u, u + Hs.lens[i], y0, y1]);
      this.slab(a, b, w + 2, FLOOR_T, i === 0 ? { style: 'planks' } : { col: i % 2 ? PALETTE.cream : this.nextColor(), m: 'paint' });
      // Rounded nose on each platform after the first: a hop that arrives a touch low glances up onto it, a lower one
      // is turned down into the trench.
      if (i > 0) this.cyl(add(a, [0, -0.5, 0]), Rb, 0.5, w + 2, { mat: MAT.floor, col: PALETTE.cream });
      const sa = lerp3(a, b, i === 0 ? 0.15 : 0.25), sb = lerp3(a, b, 0.85);
      this.strip(sa, sb, w * 0.55, Hs.boost * (i === 0 ? 1 : 0.6), Hs.cap);
      u += Hs.lens[i] + Hs.gap;
    }
    const lastEnd = plats[plats.length - 1][1];
    // The trench: floor, a back wall under the first platform, logs.
    const lowStart = Hs.lens[0] - 2;
    const T0 = P(lowStart, line(lowStart) - D), T1 = p1;
    this.slab(T0, T1, w + 2, FLOOR_T, { style: 'planks', col: PALETTE.walnut });
    this.box(add(P(lowStart - 0.5, line(lowStart) - D / 2 - 0.5), [0, 0, 0]), matYPR(this.T.h), [w + 2, D - 1, 1], { mat: MAT.wall, col: PALETTE.navy });
    for (let x = lowStart + 3; x < L - 2; x += 4.5) this.cyl(add(P(x, line(x) - D), [0, -0.45, 0]), Rb, 0.75, w + 2, { mat: MAT.floor, col: this.nextColor(), stripes: true });
    // Walls: along the platform line, and down the trench under them.
    for (const sgn of [1, -1]) {
      this.wallAlong(p0, P(lastEnd), sgn * (w / 2 + 0.5), WALL_H + 0.6);
      this.wallAlong(T0, T1, sgn * (w / 2 + 0.5), D - FLOOR_T - 0.02, { col: PALETTE.navy });
    }
    // Path: along the platform tops and the gaps (trench marbles are tracked from below), then down to the floor.
    for (let i = 0; i < plats.length; i++) {
      const [ua, ub, y0, y1] = plats[i];
      if (i > 0) this.sampleLine(P(plats[i - 1][1], plats[i - 1][3]), P(ua, y0), w / 2, 0, -1, F_JUMP | F_RISKY | F_BOOST, false);
      this.sampleLine(P(ua, y0), P(ub, y1), w / 2, 0, -1, i === 0 ? F_RESPAWN | F_BOOST : F_RISKY | F_BOOST, i === 0 && this.samples.length === 0);
    }
    const land = Math.min(L, lastEnd + 2.5);
    this.sampleLine(P(lastEnd, plats[plats.length - 1][3]), P(land, line(land) - D), w / 2, 0, -1, 0, false);
    if (land < L) this.sampleLine(P(land, line(land) - D), p1, w / 2, 0, -1, F_RESPAWN, false);
    this.pieceExtra = { plats: plats.map(([ua, ub]) => [sStart + ua, sStart + ub]) };
    this.maybeSupport(P(L * 0.5, line(L * 0.5) - D), w / 2);
    this.setPos(p1);
  }

  // TRAMPOLINES: rubber drum pads set into the floor on one half of the lane kick marbles up onto a raised shortcut
  // ledge with a speed strip. Bounce short and you hit the ledge's angled front, which turns you into the lower
  // lane beside it, which is bumpy and slower. Registered as a two-branch fork (ledge, lower lane).
  trampolines(L, drop) {
    const w = this.T.w, l = this.lat();
    const p0 = this.pos(), p1 = this.at(L, 0, -drop);
    const T = TRAMP;
    const side = this.rng.chance(0.5) ? 1 : -1;
    const P = (u, x = 0, y = 0) => add(add(lerp3(p0, p1, u / L), mul(l, x)), [0, y, 0]);
    const lw = Math.round(w * T.ledgeW * 2) / 2; // ledge width, along the `side` wall
    const xL = side * (w / 2 - lw / 2); // ledge center
    const xLow = -side * (lw / 2); // lower lane center
    const lowW = w - lw;
    // Floor: solid everywhere except the pad holes.
    const pads = [];
    for (let r = 0; r < T.rows; r++) {
      const u = T.pad0 + r * T.padStep;
      for (let c = 0; c < T.cols; c++) {
        const x = side * (w / 2 - (lw / T.cols) * (c + 0.5));
        pads.push([u, x]);
      }
    }
    this.slab(p0, P(T.pad0 - T.padL / 2), w + 2, FLOOR_T, { style: 'planks' });
    this.slab(P(T.pad0 + (T.rows - 1) * T.padStep + T.padL / 2), p1, w + 2, FLOOR_T, { style: 'planks' });
    // Between the pad rows: full-width boards, and beside them on the ledge half, boards round the pads.
    const uA = T.pad0 - T.padL / 2, uB = T.pad0 + (T.rows - 1) * T.padStep + T.padL / 2;
    this.slab(P(uA, xLow - side * 0.5), P(uB, xLow - side * 0.5), lowW + 1, FLOOR_T, { style: 'planks' });
    for (let r = 0; r < T.rows - 1; r++) {
      const ua = T.pad0 + r * T.padStep + T.padL / 2, ub = ua + T.padStep - T.padL;
      this.slab(P(ua, xL + side * 0.5), P(ub, xL + side * 0.5), lw + 1, FLOOR_T, { style: 'planks' });
    }
    const padMat = { bounce: 0.3, friction: 0.05, kick: T.kick };
    const padW = lw / T.cols;
    for (const [r, [u, x]] of pads.entries()) {
      const c = add(P(u, x), [0, -FLOOR_T / 2, 0]);
      this.box(c, matYPR(this.T.h, Math.atan2(drop, L)), [padW + 0.25, FLOOR_T, T.padL], { mat: padMat, col: r % 2 ? PALETTE.pink : PALETTE.red, m: 'rubber', tag: 'tramp' });
      // A painted drum ring on the rubber (visual).
      const rr = Math.min(padW, T.padL) / 2;
      this.vis({ k: 'lathe', c: P(u, x), outline: [[rr * 0.62, -0.02], [rr * 0.8, -0.02], [rr * 0.8, 0.035], [rr * 0.62, 0.035]], a0: 0, a1: Math.PI * 2, col: PALETTE.cream, m: 'paint', segments: 8 });
    }
    // Tall walls: the pads throw marbles well above an ordinary wall, and a knock up there sends them sideways.
    this.wallAlong(p0, p1, w / 2 + 0.5, T.wallH);
    this.wallAlong(p0, p1, -w / 2 - 0.5, T.wallH);
    // The ledge: a block deck from uL0 to uL1, its front cut on a diagonal toward the lower lane.
    const uL0 = uB + T.ledgeGap, uL1 = L - T.chute;
    const h = T.height;
    const top0 = P(uL0, xL, h), top1 = P(uL1, xL, h);
    this.slab(top0, top1, lw, FLOOR_T, { style: 'planks', col: PALETTE.birch });
    // The deck overhangs a slanted front: a slick wall from the outer front corner to the inner edge further on, so
    // a marble that bounced short is turned into the lower lane instead of stopping against a face. The block
    // embankment starts behind it.
    {
      const b0 = P(uL0 + T.frontSkew, xL, h);
      const R = frameBetween(b0, top1);
      const mid = add(lerp3(b0, top1, 0.5), [0, -FLOOR_T - (h - FLOOR_T) / 2, 0]);
      this.collider('box', { c: mid, R, hx: lw / 2, hy: (h - FLOOR_T) / 2, hz: len(sub(top1, b0)) / 2, mat: MAT.wall });
      this.boxVisual(mid, R, [lw, h - FLOOR_T, len(sub(top1, b0))], { style: 'blocks', blockLen: 2.4 });
    }
    const fA = P(uL0 - 0.2, side * (w / 2), 0), fB = P(uL0 + T.frontSkew, side * (w / 2 - lw), 0);
    this.wallAlong(fA, fB, 0, h - 0.2, { thick: 0.8, mat: MAT.slick, col: PALETTE.navy });
    this.strip(add(top0, mul(norm(sub(top1, top0)), 1.5)), add(top1, mul(norm(sub(top1, top0)), -1.5)), lw * 0.6, 32, 40);
    // Inner lip on the ledge (low). The tall lane wall stands above its outer edge.
    this.wallAlong(P(uL0 + T.frontSkew, side * (w / 2 - lw - 0.15), h), P(uL1, side * (w / 2 - lw - 0.15), h), 0, 0.4, { thick: 0.3, col: PALETTE.yellow });
    // Chute back down at the end.
    this.slab(top1, P(L, xL), lw, FLOOR_T, { col: PALETTE.orange, m: 'paint' });
    // Lower lane: logs.
    const Rb = matYPR(this.T.h, 0, Math.PI / 2);
    for (let u = uL0 + 2; u < uL1 - 1; u += 4) this.cyl(add(P(u, xLow), [0, -0.45, 0]), Rb, 0.7, lowW, { mat: MAT.floor, col: this.nextColor(), stripes: true });
    // Path: the pads (main path), then a fork: ledge and lower lane.
    this.sampleLine(p0, P(uA), w / 2, 0, -1, F_RESPAWN, false);
    this.sampleLine(P(uA), P(uL0), w / 2, 0, -1, 0, false);
    const fkId = this.forks.length;
    const s0 = this.sCur;
    const fork = { id: fkId, s0, s1: s0 + (L - uL0), branches: [] };
    this.forks.push(fork);
    const brLedge = ++this.branchCount, brLow = ++this.branchCount;
    fork.branches.push({ id: brLedge, kind: 'ledge', speed: 1, risk: 0.35, side: xL }, { id: brLow, kind: 'low', speed: 0.5, risk: 0, side: xLow });
    this.sampleLine(P(uL0, xL, h), top1, lw / 2, brLedge, fkId, F_BOOST, false);
    this.sampleLine(top1, P(L, xL), lw / 2, brLedge, fkId, 0, false);
    this.sCur = s0;
    this.sampleLine(P(uL0, xLow), P(L, xLow), lowW / 2, brLow, fkId, 0, false);
    this.sCur = s0 + (L - uL0);
    fork.tramp = { ledge: brLedge, low: brLow };
    this.pieceExtra = { fork: fkId };
    this.maybeSupport(P(L * 0.5), w / 2);
    this.setPos(p1);
  }

  // Painted speed strip on a floor line. The push comes from a thin sensor straddling the floor's surface, so the
  // strip has no edge to clip at speed (a solid strip has to stand proud of the floor to register).
  strip(p0, p1, width, accel, cap = 0) {
    const dir = norm(sub(p1, p0));
    const R = frameBetween(p0, p1);
    const c = lerp3(p0, p1, 0.5);
    const hz = len(sub(p1, p0)) / 2;
    const bi = this.collider('box', { c, R, hx: width / 2, hy: 0.12, hz, sensor: true, boost: mul(dir, accel), boostCap: cap });
    this.vis({ k: 'box', c: add(c, [0, -0.03, 0]), R, s: [width, 0.12, hz * 2], col: '#ffd23f', m: 'boost' });
    return bi;
  }

  // MEGA JUMP: a long, steepening run-in with speed strips, a big curved kicker, and a gap over the room onto tiered
  // landings. Carry the most speed (and jump right at the lip) to reach the FAR deck, which has a speed strip; a
  // little less lands on the MID deck, a ledge with bumps that you roll off onto the far deck behind the leaders; too
  // slow and you drop into the felt NET, whose conveyor carries you up onto the mid deck. Every landing is walled and
  // they all run on to the same exit, so nobody leaves the course. It is registered as a fork whose branches are the
  // three landings (decided by physics, not chosen), so tracking and respawns work as for any fork.
  megaJump(J) {
    const w = this.T.w, f = this.fwd(), l = this.lat();
    const p0 = this.pos();
    const Q = (u, y, x = 0) => [p0[0] + f[0] * u + l[0] * x, p0[1] + y, p0[2] + f[2] * u + l[2] * x];
    const sStart = this.sCur;
    // Banner over the approach.
    this.vis({ k: 'banner', c: Q(3, 8.6), h: this.T.h, w: w + 3, text: 'MEGA JUMP', col: PALETTE.red, posts: true });
    // Run-in: the lead, a smooth crest that steepens to the in-run angle (ridden on the outside of a big curve, so it
    // holds the marble down instead of throwing it), then the straight in-run.
    const th0 = Math.atan(0.06), thI = J.inrun;
    const B = Q(J.lead, -J.lead * 0.06);
    this.slab(p0, B, w + 2, FLOOR_T, { style: 'planks' });
    const Rc = J.Rc;
    const Cc = sub(B, add(mul(f, Rc * Math.sin(th0)), [0, Rc * Math.cos(th0), 0]));
    const crest = this.arcRamp(Cc, Rc, Math.PI - thI, Math.PI - th0, w + 2, { convex: true, col: PALETTE.birch, m: 'wood' });
    const E = crest(Math.PI - thI);
    const iEnd = add(E, add(mul(f, J.inrunLen), [0, -J.inrunLen * Math.tan(thI), 0]));
    this.slab(E, iEnd, w + 2, FLOOR_T, { style: 'planks' });
    const crestMid = crest(Math.PI - (th0 + thI) / 2);
    for (const sgn of [1, -1]) {
      const side = sgn * (w / 2 + 0.5);
      this.wallAlong(p0, B, side, WALL_H + 0.4);
      this.wallAlong(sub(B, mul(f, 0.3)), add(crestMid, [0, -0.1, 0]), side, WALL_H + 0.6);
      this.wallAlong(add(crestMid, [0, -0.1, 0]), add(E, mul(f, 0.3)), side, WALL_H + 0.6);
      this.wallAlong(E, iEnd, side, WALL_H + 0.4);
    }
    // Speed strips down the in-run, the middle of the lane only.
    const sw = w * J.stripW;
    const inL = len(sub(iEnd, E));
    this.strip(lerp3(E, iEnd, 0.6 / inL), lerp3(E, iEnd, 1 - 0.6 / inL), sw, J.boost, J.cap);
    // The kicker: a curve from the in-run angle up to the launch angle.
    const Rk = J.Rk;
    const A = iEnd;
    const C = add(A, add(mul(f, Rk * Math.sin(thI)), [0, Rk * Math.cos(thI), 0]));
    const S = this.arcRamp(C, Rk, -thI, J.launch, w + 2, { col: PALETTE.orange, walls: 2.6, wallCol: PALETTE.navy });
    const lip = S(J.launch);
    const uL = (lip[0] - p0[0]) * f[0] + (lip[2] - p0[2]) * f[2];
    const yL = lip[1] - p0[1];
    const X = (x, y, side = 0) => Q(uL + x, yL + y, side);
    // A cream lip edge (visual), and the kicker's front face below it, which is also the net's back wall.
    this.vis({ k: 'cyl', c: add(lip, [0, -0.5, 0]), R: matYPR(this.T.h, 0, Math.PI / 2), r: 0.5, h: w + 2.4, col: PALETTE.cream, m: 'paint' });
    const yN = -J.Hn, yM = -J.Hm, yF = -J.Hf;
    const arcY = (x) => Rk * (Math.cos(J.launch) - Math.sqrt(1 - (Math.sin(J.launch) + x / Rk) ** 2));
    const faceTop = arcY(-1.4) - 0.9;
    this.box(X(-0.7, (faceTop + yN) / 2), matYPR(this.T.h), [w + 2, faceTop - yN, 1.4], { mat: MAT.wall, col: PALETTE.navy });
    // Path up to the lip (main path): lead is a respawn point; the in-run and kicker are not (a respawn there would
    // arrive slow), so a marble that falls goes back to the top of the run-in.
    this.sampleLine(p0, B, w / 2, 0, -1, F_RESPAWN, false);
    const arcSamples = (fn, p0a, a0, a1, R0) => {
      const n = Math.ceil((Math.abs(a1 - a0) * R0) / SAMPLE_STEP);
      let prev = p0a;
      for (let i = 1; i <= n; i++) {
        const p = fn(a0 + ((a1 - a0) * i) / n);
        this.sCur += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
        this.sample(p, f, w / 2, 0, -1, F_BOOST);
        prev = p;
      }
    };
    arcSamples(crest, B, Math.PI - th0, Math.PI - thI, Rc);
    this.sampleLine(E, iEnd, w / 2, 0, -1, F_BOOST, false);
    arcSamples(S, A, -thI, J.launch, Rk);
    const sLip = this.sCur;
    // ---- landings (x from the lip along the lane, y relative to the lip)
    const xc0 = J.netEnd, xm0 = J.midStart, xm1 = J.midEnd, xe = J.farEnd;
    const yNe = yN - 0.6, yMe = yM - 0.6, yFe = yF - J.farDrop;
    // Felt net: a soft tray under the gap with a cord lattice over it, and a steep conveyor up onto the mid deck.
    this.slab(X(0, yN), X(xc0, yNe), w + 2, FLOOR_T, { mat: JUMP_MAT.felt, col: PALETTE.green, m: 'paint' });
    const nCords = 6;
    for (let i = 1; i < nCords; i++) {
      const side = -w / 2 - 1 + ((w + 2) * i) / nCords;
      this.vis({ k: 'box', c: add(lerp3(X(0.4, yN, side), X(xc0, yNe, side), 0.5), [0, 0.06, 0]), R: frameBetween(X(0, yN), X(xc0, yNe)), s: [0.16, 0.12, xc0 - 0.6], col: PALETTE.cream, m: 'paint' });
    }
    for (let x = 2.5; x < xc0 - 0.5; x += 3) {
      const y = yN + ((yNe - yN) * x) / xc0;
      this.vis({ k: 'box', c: add(X(x, y), [0, 0.06, 0]), R: frameBetween(X(x, y, -1), X(x, y, 1)), s: [0.16, 0.12, w + 1.6], col: PALETTE.cream, m: 'paint' });
    }
    this.slab(X(xc0, yNe), X(xm0, yM), w + 2, FLOOR_T, { col: PALETTE.teal, m: 'paint' });
    this.strip(X(xc0 + 0.6, yNe + (yM - yNe) * (0.6 / (xm0 - xc0))), X(xm0 - 0.4, yM - (yM - yNe) * (0.4 / (xm0 - xc0))), w * 0.8, J.lift, J.liftCap);
    // Mid deck with a couple of logs: a softer landing that costs time.
    this.slab(X(xm0, yM), X(xm1, yMe), w + 2, FLOOR_T, { style: 'planks', col: PALETTE.walnut, mat: JUMP_MAT.cork });
    const Rb = matYPR(this.T.h, 0, Math.PI / 2);
    for (const t of J.logs) {
      const x = xm0 + (xm1 - xm0) * t;
      this.cyl(add(X(x, yM + (yMe - yM) * t), [0, -0.45, 0]), Rb, 0.75, w + 2, { mat: MAT.floor, col: this.nextColor(), stripes: true });
    }
    // Nose on the mid deck's end, so marbles roll off it rather than catching the corner.
    this.cyl(add(X(xm1, yMe), [0, -0.5, 0]), Rb, 0.5, w + 2, { mat: MAT.floor, col: PALETTE.cream });
    // Far deck: lower, sloping away, with a speed strip.
    this.slab(X(xm1 - 0.2, yF), X(xe, yFe), w + 2, FLOOR_T, { style: 'planks' });
    const farT = (x) => yF + (yFe - yF) * ((x - xm1) / (xe - xm1));
    this.strip(X(xm1 + 5, farT(xm1 + 5)), X(xe - 3, farT(xe - 3)), w * 0.55, 30, 42);
    // Walls: the canyon round the net and conveyor stands up to the mid deck's wall tops; the decks have their own.
    const wallTop = yM + WALL_H + 0.4;
    for (const sgn of [1, -1]) {
      const side = sgn * (w / 2 + 0.5);
      this.wallAlong(X(-3.2, yN), X(xm0, yN), side, wallTop - yN);
      // Safety nets either side of the flight, like a ski jump's fences: a knock in the air (the pack leaves the
      // lip bunched) can throw a marble sideways at speed, and the net sends it back. Solid to the physics; drawn as
      // painted posts and cream rails.
      const n0 = -1.5, n1 = J.netTo, nb = wallTop - 0.4, nt = J.netH;
      const R = frameBetween(X(n0, 0), X(n1, 0));
      this.collider('box', { c: X((n0 + n1) / 2, (nb + nt) / 2, side), R, hx: 0.3, hy: (nt - nb) / 2, hz: (n1 - n0) / 2, mat: MAT.wall });
      const posts = Math.ceil((n1 - n0) / 8);
      for (let i = 0; i <= posts; i++) {
        const x = n0 + ((n1 - n0) * i) / posts;
        this.vis({ k: 'cyl', c: X(x, (nb + nt) / 2 + 0.3, side), R: matIdentity(), r: 0.24, h: nt - nb + 0.6, col: PALETTE.walnut, m: 'wood' });
        this.vis({ k: 'cyl', c: X(x, nt + 0.75, side), R: matIdentity(), r: 0.36, h: 0.3, col: PALETTE.red, m: 'paint' });
      }
      for (let k = 1; k <= 2; k++) {
        const y = nb + ((nt - nb) * k) / 2;
        this.vis({ k: 'box', c: X((n0 + n1) / 2, y, side), R, s: [0.14, 0.14, n1 - n0], col: PALETTE.cream, m: 'paint' });
      }
      this.wallAlong(X(xm0, yM), X(xm1, yMe), side, WALL_H + 0.4);
      this.wallAlong(X(xm1, yF), X(xe, yFe), side, WALL_H + 1.4);
    }
    // The block under the mid deck, between the conveyor and the far deck's front (visual, plus a face collider so
    // nothing tucks under the ledge).
    this.box(lerp3(X(xm0 + 0.5, (yM - 1 + yF - 1.5) / 2), X(xm1 - 0.6, (yMe - 1 + yF - 1.5) / 2), 0.5), matYPR(this.T.h), [w + 2, Math.max(0.6, yM - yF - 0.4), xm1 - xm0 - 1.2], { mat: MAT.wall, col: PALETTE.navy });
    for (const x of [xc0 * 0.5, xm0 + 2, (xm1 + xe) / 2]) this.support(X(x, x < xc0 ? yN : x < xm1 ? yM : farT(x)), w / 2);
    // ---- path: a fork whose three branches are the landings
    const fkId = this.forks.length;
    const fork = { id: fkId, s0: sLip, s1: sLip + xe, branches: [], mega: null };
    this.forks.push(fork);
    const g = GRAVITY_U;
    const mkBranch = (kind, speed, risk) => {
      const id = ++this.branchCount;
      fork.branches.push({ id, kind, speed, risk, side: 0 });
      return id;
    };
    const brFar = mkBranch('far', 1, 0.3), brMid = mkBranch('mid', 0.7, 0.2), brNet = mkBranch('net', 0.4, 0);
    const surf = (x) => (x < xc0 ? yN + ((yNe - yN) * x) / xc0 : x < xm0 ? yNe + ((yM - yNe) * (x - xc0)) / (xm0 - xc0) : x < xm1 ? yM + ((yMe - yM) * (x - xm0)) / (xm1 - xm0) : farT(x));
    const surfHigh = (x) => (x < xm1 ? Math.max(surf(x), x >= xm0 ? yM : -Infinity) : farT(x));
    const put = (x, y, br, fl) => {
      this.sCur = sLip + x;
      this.sample(X(x, y), f, w / 2, br, fkId, fl);
    };
    // A nominal flight for each of the upper landings, then along the decks to the exit.
    const air = [];
    for (const [br, v, jump] of [[brFar, J.vFar, true], [brMid, J.vMid, false]]) {
      let vx = v * Math.cos(J.launch), vy = v * Math.sin(J.launch);
      if (jump) {
        vy += 10;
        vx -= 3;
      }
      const i0 = this.samples.length;
      let x = 0, y = 0.5;
      for (let t = 0; ; t += 0.02) {
        x = vx * t;
        y = 0.5 + vy * t - 0.5 * g * t * t;
        if (t > 0 && (y < surfHigh(x) + 0.6 || x > xe)) break;
        if (t === 0 || x - (this.sCur - sLip) >= SAMPLE_STEP) put(x, y, br, F_RISKY | F_BOOST);
      }
      air.push([i0, this.samples.length]);
      for (let xx = Math.ceil(x / SAMPLE_STEP) * SAMPLE_STEP; xx <= xe + 1e-6; xx += SAMPLE_STEP) put(xx, surfHigh(xx), br, 0);
    }
    for (let x = 0.75; x <= xe + 1e-6; x += SAMPLE_STEP) put(x, x < xm0 ? surf(x) : surfHigh(x), brNet, 0);
    this.sCur = sLip + xe;
    fork.mega = {
      lip: lip.slice(), f: [f[0], f[2]], sLip, sStart, br: { far: brFar, mid: brMid, net: brNet },
      // Landing bands along the lane from the lip, for tests and the camera.
      x: { net: xm0, mid: xm1, end: xe }, y: { net: yN, mid: yM, far: yF },
    };
    (this.airZones || (this.airZones = [])).push({ s0: sLip - 2, s1: sLip + xm1 + 8, land: X((xm1 + xe) / 2 - 6, yF) });
    this.pieceExtra = { air, fork: fkId };
    this.setPos(X(xe, yFe));
  }

  // ------------------------------------------------------------ turns, start, finish

  // Flat 180-degree turn around a post; `side` +1 turns toward +lat.
  turn(side) {
    const w = this.T.w;
    const rin = 2.5;
    const rc = w / 2 + rin;
    const ro = rc + w / 2 + 0.5;
    const l = this.lat();
    const f = this.fwd();
    const T0 = this.pos();
    const C = add(T0, mul(l, side * rc));
    const u0 = mul(l, -side);
    const phiS = Math.atan2(u0[2], u0[0]);
    const tan0 = [-u0[2], 0, u0[0]];
    const dir = tan0[0] * f[0] + tan0[2] * f[2] > 0 ? 1 : -1;
    const phiE = phiS + dir * Math.PI;
    const a0 = Math.min(phiS, phiE), a1 = Math.max(phiS, phiE);
    const y = T0[1];
    const shell = 0.5;
    this.collider('lathe', { c: [C[0], y - shell, C[2]], profile: [[rin - 0.6, 0], [ro + 0.2, 0]], a0, a1, shell, mat: MAT.floor });
    this.collider('lathe', { c: [C[0], y, C[2]], profile: [[ro, -1], [ro, 4.2]], a0, a1, shell, mat: MAT.wall });
    this.collider('cyl', { c: [C[0], y + 1.6, C[2]], radius: rin, hh: 3.2, mat: MAT.wall });
    const floorCol = this.natural();
    this.vis({ k: 'lathe', c: [C[0], y, C[2]], outline: [[rin - 0.6, -FLOOR_T], [ro + 0.6, -FLOOR_T], [ro + 0.6, 0], [rin - 0.6, 0]], a0, a1, col: floorCol, m: 'wood' });
    this.vis({ k: 'lathe', c: [C[0], y, C[2]], outline: [[ro - 0.5, -1], [ro + 0.5, -1], [ro + 0.5, 4.2], [ro - 0.5, 4.2]], a0, a1, col: this.nextColor(), m: 'paint', segments: 10 });
    this.vis({ k: 'cyl', c: [C[0], y + 2.4, C[2]], R: matIdentity(), r: rin, h: 4.8, col: this.nextColor(), m: 'paint', stripes: true });
    this.vis({ k: 'cyl', c: [C[0], y + 5.1, C[2]], R: matIdentity(), r: rin + 0.4, h: 0.6, col: PALETTE.cream, m: 'paint' });
    // Path around the arc.
    const arcLen = Math.PI * rc;
    const n = Math.ceil(arcLen / SAMPLE_STEP);
    const s0 = this.sCur;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const phi = phiS + dir * Math.PI * t;
      const p = [C[0] + Math.cos(phi) * rc, y, C[2] + Math.sin(phi) * rc];
      const tg = [-Math.sin(phi) * dir, 0, Math.cos(phi) * dir];
      this.sCur = s0 + arcLen * t;
      this.sample(p, tg, w / 2, 0, -1, F_RESPAWN | F_TURN);
    }
    this.sCur = s0 + arcLen;
    this.support([C[0], y, C[2]], rin);
    this.setPos(add(C, mul(l, side * rc)));
    this.T.h += Math.PI;
  }

  // Banked 180: the footprint, entry and exit of turn(), but the floor rises toward the outside like a velodrome
  // (easing in from flat at both ends), so marbles can carry their speed round high on the bank. With `extra` = 1
  // it is a helter-skelter instead: 540 degrees spiralling down round a tall painted tower, ending where the flat
  // turn would, HELIX_DROP lower (each winding clears the one below and the runs either side).
  // A single half-turn can also descend by an explicit drop to serve as a curved slide.
  bankedTurn(side, extra = 0, drop = extra ? HELIX_DROP : 0, saturn = false) {
    const w = this.T.w;
    const rin = saturn ? 6 : 2.5;
    const rc = w / 2 + rin;
    const ro = rc + w / 2 + 0.5;
    const l = this.lat();
    const f = this.fwd();
    const T0 = this.pos();
    const C = add(T0, mul(l, side * rc));
    const u0 = mul(l, -side);
    const phiS = Math.atan2(u0[2], u0[0]);
    const tan0 = [-u0[2], 0, u0[0]];
    const dir = tan0[0] * f[0] + tan0[2] * f[2] > 0 ? 1 : -1;
    const sweep = Math.PI * (1 + 2 * extra);
    const phiE = phiS + dir * sweep;
    const a0 = Math.min(phiS, phiE), a1 = Math.max(phiS, phiE);
    const y = T0[1];
    const H = drop;
    // Height along the turn (0 at the entry, -H at the exit) as the helix offset over [a0, a1].
    const base = dir > 0 ? 0 : -H, rise = dir > 0 ? -H : H;
    const shell = 0.5;
    const bankH = extra ? 1.4 : Math.min(3, w * 0.19);
    const r0 = rc - 0.5; // the inside half stays flat: the bank is for carrying speed round the outside
    const bank = (r) => (r <= r0 ? 0 : bankH * Math.pow(Math.min(1, (r - r0) / (ro - r0)), 1.7));
    const blend = 0.75;
    const rs = [rin - 0.6, r0];
    for (let i = 1; i <= 6; i++) rs.push(r0 + ((ro + 0.2 - r0) * i) / 6);
    const H0 = { c: [C[0], y - shell, C[2]], R: matIdentity(), a0, a1, rise, blend, shell };
    this.collider('helix', { ...H0, profile: rs.map((r) => [r, base]), lift: rs.map(bank), mat: MAT.floor });
    const wallTop = extra ? 2.2 : 4.2;
    this.collider('helix', { ...H0, c: [C[0], y, C[2]], profile: [[ro, base - 1], [ro, base + wallTop]], lift: [0, bank(ro)], mat: MAT.wall });
    // Visual: natural apron by the post, a painted bank with two cream lines, the outer wall.
    const V = { k: 'helix', c: [C[0], y, C[2]], R: matIdentity(), a0, a1, rise, blend, segments: extra ? 16 : 20 };
    const band = (ra, rb, col, m = 'paint') =>
      this.vis({ ...V, outline: [[ra, base - FLOOR_T], [rb, base - FLOOR_T], [rb, base], [ra, base]], lift: [0, 0, bank(rb), bank(ra)], col, m });
    if (saturn) {
      for (let i = 1; i < rs.length; i++) band(rs[i-1], rs[i], PALETTE.cream, 'trim');
      const inner = [[rin - .6, base - .6], [rin, base - .6], [rin, base + 1.6], [rin - .6, base + 1.6]];
      this.vis({ ...V, outline: inner, col: PALETTE.cream, m: 'road' });
      this.collider('helix', { ...H0, c: [C[0], y, C[2]], profile: [[rin, base - .6], [rin, base + 1.6]], mat: MAT.wall });
    } else {
      const bankCol = this.nextColor();
      const rb0 = r0 + 0.6, span = ro + 0.6 - rb0;
      band(rin - 0.6, rb0, this.natural(), 'wood');
      const lines = [0.42, 0.72];
      let rPrev = rb0;
      for (const q of lines) {
        const ra = rb0 + span * q;
        band(rPrev, ra - 0.25, bankCol);
        band(ra - 0.25, ra + 0.25, PALETTE.cream);
        rPrev = ra + 0.25;
      }
      band(rPrev, ro + 0.6, bankCol);
    }
    this.vis({ ...V, outline: [[ro - 0.5, base - 1], [ro + 0.5, base - 1], [ro + 0.5, base + wallTop], [ro - 0.5, base + wallTop]], lift: [0, 0, bank(ro), bank(ro)], col: saturn ? '#dc835e' : this.nextColor(), m: saturn ? 'coral' : 'paint', segments: extra ? 16 : 14 });
    if (!extra && drop > 0) {
      const rim = base + wallTop;
      this.vis({ ...V, segments: 14, m: saturn ? 'road' : 'brass', col: PALETTE.cream,
        outline: [[ro - 0.56, rim - 0.12], [ro + 0.56, rim - 0.12], [ro + 0.56, rim + 0.06], [ro - 0.56, rim + 0.06]],
        lift: Array(4).fill(bank(ro)) });
      if (saturn) {
        this.vis({ ...V, segments: 14, m: 'road', col: PALETTE.cream,
          outline: [[ro-.6, base-1.1], [ro+.6, base-1.1], [ro+.6, base-.83], [ro-.6, base-.83]] });
      }
      // Mount the guide lights on the inside face, following its faceted curve and bank.
      const bays = 14;
      const radius = (ro - 0.5) * Math.cos((a1 - a0) / (2 * bays));
      const smooth = t => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); };
      for (let i = 0; i < bays; i++) {
        const t = (i + 0.5) / bays, ph = a0 + t * (a1 - a0);
        const cs = Math.cos(ph), sn = Math.sin(ph);
        const bankWeight = smooth((ph - a0) / blend) * smooth((a1 - ph) / blend);
        const lampY = y + rim + rise*t + bank(ro)*bankWeight - 0.5;
        const R = [-sn,-cs,0, 0,0,-1, cs,-sn,0];
        if (saturn) {
          const outer = (ro + .5) * Math.cos((a1-a0) / (2*bays));
          const floor = y + base + rise*t;
          if (i === Math.floor(bays/2)) {
            this.vis({k: 'saturnEmblem', c: [C[0]+cs*(outer+.035), (floor+lampY)/2, C[2]+sn*(outer+.035)], angle: ph});
          }
          if (i % 4 === 1) {
            const radius = ro - 2;
            this.support([C[0]+cs*radius, floor, C[2]+sn*radius], 0);
          }
          const edge = a0 + i*(a1-a0)/bays;
          const ex = Math.cos(edge), ez = Math.sin(edge);
          const weight = smooth((edge-a0)/blend)*smooth((a1-edge)/blend);
          const bottom = y+base+rise*i/bays-1, height = wallTop+1+bank(ro)*weight;
          const x = C[0]+(ro+.51)*ex, z = C[2]+(ro+.51)*ez;
          this.vis({k:'cyl', c:[x,bottom+height/2,z], R:matIdentity(), r:.045, h:height, m:'brass', col:PALETTE.cream});
          for (const h of [.3, height-.3]) {
            this.vis({k:'cyl', c:[x,bottom+h,z], R:[-ez,-ex,0, 0,0,-1, ex,-ez,0], r:.12, h:.12, m:'brass', col:PALETTE.cream});
          }
        }
        for (const [inset, r, m, col] of [[0.05,0.27,'brass',PALETTE.cream],[0.14,0.19,'lamp',PALETTE.cream]]) {
          this.vis({ k:'cyl', c:[C[0]+cs*(radius-inset),lampY,C[2]+sn*(radius-inset)], R, r, h:0.12, m, col });
        }
      }
    }
    // The post (a tall striped tower for the helter-skelter).
    const top = 4.8 + (extra ? 2.5 : 0);
    const postH = top + H;
    const postRadius = saturn ? 2.9 : rin;
    this.collider('cyl', { c: [C[0], y + top / 2 - H / 2 - 1.6, C[2]], radius: postRadius, hh: postH / 2 + 1.6, mat: MAT.wall });
    this.vis({ k: 'cyl', c: [C[0], y + top - postH / 2, C[2]], R: matIdentity(), r: postRadius, h: postH, col: this.nextColor(), m: saturn ? 'trim' : 'paint', stripes: !saturn });
    this.vis({ k: 'cyl', c: [C[0], y + top + 0.3, C[2]], R: matIdentity(), r: postRadius + 0.4, h: 0.6, col: PALETTE.cream, m: 'paint' });
    if (!extra && drop > 0) {
      this.vis({ k: 'saturnLamp', scale: saturn ? 2.1 : 1, c: [C[0], y + top + 0.6, C[2]] });
    }
    if (extra) {
      // A pointed roof cap like a fairground helter-skelter: stacked discs.
      for (let i = 0; i < 4; i++) {
        this.vis({ k: 'cyl', c: [C[0], y + top + 0.9 + i * 0.7, C[2]], R: matIdentity(), r: rin + 0.6 - i * 0.75, h: 0.7, col: i % 2 ? PALETTE.cream : PALETTE.red, m: 'paint' });
      }
    }
    // Path round the bank: on the center line, at its banked height. Not a respawn point (the bank isn't level).
    const arcLen = sweep * rc;
    const n = Math.ceil(arcLen / SAMPLE_STEP);
    const s0 = this.sCur;
    const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const phi = phiS + dir * sweep * t;
      const wgt = sm((phi - a0) / blend) * sm((a1 - phi) / blend);
      const p = [C[0] + Math.cos(phi) * rc, y - H * t + bank(rc) * wgt, C[2] + Math.sin(phi) * rc];
      const tg = [-Math.sin(phi) * dir, 0, Math.cos(phi) * dir];
      this.sCur = s0 + arcLen * t;
      this.sample(p, tg, w / 2, 0, -1, F_TURN | F_BANK | (wgt < 0.02 ? F_RESPAWN : 0));
    }
    this.sCur = s0 + arcLen;
    this.support([C[0], y - H, C[2]], rin);
    this.setPos(add(add(C, mul(l, side * rc)), [0, -H, 0]));
    this.T.h += Math.PI;
  }

  // Flat start platform with a back wall and a gate across the front. Returns grid slots.
  start(count) {
    const w = this.T.w;
    const depth = 3 + Math.ceil(count / 10) * 1.5 + 1.5;
    const back = this.at(-depth, 0, 0);
    const front = this.pos();
    this.slab(back, front, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(back, front, w / 2 + 0.5, 3);
    this.wallAlong(back, front, -w / 2 - 0.5, 3);
    const R0 = matYPR(this.T.h);
    const bc = add(back, mul(this.fwd(), -0.5));
    this.box(add(bc, [0, 1, 0]), R0, [w + 3, 4, 1], { mat: MAT.wall });
    // Gate: removed at GO.
    this.gate = this.box(add(front, [0, 2.1, 0]), R0, [w + 1, 4.2, 0.6], { mat: MAT.wall, tag: 'gate', kin: true, col: PALETTE.red });
    this.vis({ k: 'banner', c: add(front, [0, 6.5, 0]), h: this.T.h, w: w + 3, text: this.index === 0 ? 'START' : 'STAGE ' + (this.index + 1), col: PALETTE.blue });
    const slots = [];
    const perRow = 10;
    const rows = Math.ceil(count / perRow);
    const spacing = Math.min(1.75, (w - 1.6) / (perRow - 1));
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(perRow, count - r * perRow);
      for (let i = 0; i < inRow; i++) {
        const x = (i - (inRow - 1) / 2) * spacing + (r % 2 ? spacing * 0.25 : 0);
        const p = this.at(-1.2 - r * 1.5, x, 0.55);
        slots.push(p);
      }
    }
    this.sCur = -depth;
    this.sampleLine(back, front, w / 2, 0, -1, F_RESPAWN);
    this.sCur = 0;
    this.support(lerp3(back, front, 0.5), w / 2);
    return slots;
  }

  // Walled checkpoint pen; the finish line trigger sits across its mouth.
  pen(final) {
    const w = this.T.w;
    const depth = final ? 22 : 26;
    const p0 = this.pos();
    const p1 = this.at(depth, 0, 0);
    this.slab(p0, p1, w + 2, FLOOR_T, { style: 'planks', col: final ? PALETTE.cream : undefined });
    this.wallAlong(p0, p1, w / 2 + 0.5, 3.2);
    this.wallAlong(p0, p1, -w / 2 - 0.5, 3.2);
    const R0 = matYPR(this.T.h);
    this.box(add(p1, [0, 1.2, 0]), R0, [w + 3, 4.4, 1], { mat: MAT.wall, col: PALETTE.red });
    // Checkered finish strip (visual).
    this.vis({ k: 'box', c: add(this.at(1.2, 0, 0.02), [0, 0, 0]), R: R0, s: [w, 0.06, 1.6], col: '#ffffff', m: 'checker' });
    const finish = makeCollider('box', { c: this.at(1.2, 0, 3), R: R0, hx: w / 2 + 1, hy: 5, hz: 0.9 });
    const arch = { k: 'banner', c: this.at(1.2, 0, 6.8), h: this.T.h, w: w + 3, text: final ? 'FINISH' : 'CHECKPOINT ' + (this.index + 1), col: final ? PALETTE.red : PALETTE.green, posts: true };
    this.vis(arch);
    this.sampleLine(p0, p1, w / 2, 0, -1, F_RESPAWN, false);
    this.support(lerp3(p0, p1, 0.5), w / 2);
    this.setPos(p1);
    const center = this.at(-depth / 2, 0, 0.6);
    return { finish, center, heading: this.T.h, depth };
  }

  // ------------------------------------------------------------ the bowl

  // THE BOWL: the lane funnels into a chute that dumps every marble over the rim of a giant lacquered bowl,
  // tangentially, so the pack orbits like coins in a wishing-well funnel. The drain in the middle is the
  // checkpoint: the finish trigger sits in its throat, and a chute under the bowl carries qualifiers out past the
  // rim into an ordinary open pen. `side` (+1/-1, along lat) is where the bowl's center goes.
  bowl(final, side) {
    const w = this.T.w;
    const R = final ? BOWL.rimFinal : BOWL.rim;
    const Rd = BOWL.drain, wc = BOWL.chute, wallH = BOWL.wallH;
    const Rc = R - wc / 2; // the chute's centerline meets this circle tangentially
    // Funnel from lane width down to the chute.
    const f0 = this.pos();
    const Lf = 12;
    const f1 = this.at(Lf, 0, -Lf * 0.08);
    this.slab(f0, f1, w + 2, FLOOR_T, { style: 'planks' });
    const l = this.lat();
    for (const sgn of [1, -1]) {
      const a = add(f0, mul(l, sgn * (w / 2 + 0.5))), b = add(f1, mul(l, sgn * (wc / 2 + 0.5)));
      const d = norm(sub(b, a));
      this.wallAlong(sub(a, mul(d, 0.4)), add(b, mul(d, 0.4)), 0, WALL_H + 0.4);
    }
    this.sampleLine(f0, f1, wc / 2 + 1, 0, -1, F_RESPAWN, false);
    this.maybeSupport(lerp3(f0, f1, 0.5), w / 2);
    this.setPos(f1);
    // The chute: its last stretch hangs out over the bowl, open on the inner side, so marbles spill over the rim.
    const tWall = Math.sqrt((R + 0.5) ** 2 - (R - wc - 0.5) ** 2); // where the inner wall meets the rim wall
    const Lc = Math.ceil(tWall + 8);
    const slope = 0.1;
    const c0 = this.pos();
    const E = this.at(Lc, 0, -Lc * slope);
    const fw = this.fwd();
    this.slab(c0, E, wc + 1, FLOOR_T, { style: 'planks', side: -side * 0.5, col: PALETTE.birch });
    this.wallAlong(c0, E, -side * (wc / 2 + 0.5), 2.6, { col: PALETTE.blue });
    const wEnd = lerp3(c0, E, (Lc - tWall) / Lc);
    this.wallAlong(c0, add(wEnd, mul(fw, 0.4)), side * (wc / 2 + 0.5), 2.6, { col: PALETTE.blue });
    const sRespawnEnd = Lc - tWall - 2;
    const cR = lerp3(c0, E, sRespawnEnd / Lc);
    this.sampleLine(c0, cR, wc / 2, 0, -1, F_RESPAWN, false);
    this.sampleLine(cR, E, wc / 2, 0, -1, 0, false);
    this.support(lerp3(c0, E, 0.25), wc / 2);
    // Banner over the chute where it crosses the rim, the checkpoint sign hanging under it.
    const bannerAt = add(lerp3(c0, E, (Lc - tWall + 1) / Lc), [0, 7.2, 0]);
    this.vis({ k: 'banner', c: bannerAt, h: this.T.h, w: wc + 3, text: 'THE BOWL', col: PALETTE.purple, posts: true });
    this.vis({ k: 'sign', c: add(bannerAt, [0, -2.05, 0]), h: this.T.h, w: 5.2, text: final ? 'FINISH' : 'CHECKPOINT ' + (this.index + 1), col: final ? PALETTE.red : PALETTE.green });
    const entryS = this.sCur;
    // Bowl center: off to the side so the chute's direction is tangent to the rim.
    const C = add(E, mul(l, side * Rc));
    const rimY = E[1];
    const prof = bowlProfile(R, Rd);
    // Physics: the surface profile pushed down by the shell half-thickness along its normal.
    const shell = 0.5;
    const mid = offsetProfile(prof, -shell);
    this.collider('lathe', { c: [C[0], rimY, C[2]], profile: mid, shell, mat: MAT.floor, tag: 'slick' });
    // Rim wall all the way round, except where the chute comes in.
    const ang = (p) => Math.atan2(p[2] - C[2], p[0] - C[0]);
    const phiE = ang(E);
    const dir = wrapAngle(ang(add(E, fw)) - phiE) > 0 ? 1 : -1;
    const phiX = ang(add(wEnd, mul(l, side * (wc / 2 + 0.5))));
    const gap = Math.abs(wrapAngle(phiE - phiX));
    const a0 = dir > 0 ? phiE : phiE - (2 * Math.PI - gap);
    const a1 = a0 + 2 * Math.PI - gap;
    this.collider('lathe', { c: [C[0], rimY, C[2]], profile: [[R + 0.5, -1.5], [R + 0.5, wallH]], a0, a1, shell: 0.5, mat: MAT.wall });
    const lowQ = { segments: 40 };
    this.vis({ k: 'lathe', c: [C[0], rimY, C[2]], outline: [[R, -1.5], [R + 1, -1.5], [R + 1, wallH], [R, wallH]], a0, a1, col: PALETTE.red, m: 'paint', ...lowQ });
    this.vis({ k: 'lathe', c: [C[0], rimY, C[2]], outline: [[R - 0.15, wallH], [R + 1.15, wallH], [R + 1.15, wallH + 0.35], [R - 0.15, wallH + 0.35]], a0, a1, col: PALETTE.cream, m: 'paint', ...lowQ });
    // Lacquered surface in concentric bands of the block palette, a dark ring round the drain.
    const bands = final
      ? [PALETTE.cream, PALETTE.red, PALETTE.yellow, PALETTE.blue, PALETTE.orange, PALETTE.green, PALETTE.pink, PALETTE.navy]
      : [PALETTE.cream, PALETTE.teal, PALETTE.yellow, PALETTE.red, PALETTE.blue, PALETTE.orange, PALETTE.purple, PALETTE.navy];
    this.vis({ k: 'bowl', c: [C[0], rimY, C[2]], profile: prof, R, Rd, bands, thick: BOWL.thick, throat: BOWL.throat, under: PALETTE.birch });
    // Radial samples from the entry to the drain: progress in the bowl is how close you are to the middle.
    const e = norm(sub([E[0], 0, E[2]], [C[0], 0, C[2]]));
    const inward = mul(e, -1);
    for (let r = Rc - SAMPLE_STEP; r > Rd; r -= SAMPLE_STEP) {
      this.sCur = entryS + (Rc - r);
      this.sample([C[0] + e[0] * r, rimY + bowlHeightAt(R, r), C[2] + e[2] * r], inward, 4, 0, -1, 0);
    }
    const yd = bowlHeightAt(R, Rd);
    const drainS = entryS + (Rc - Rd);
    this.sCur = drainS;
    const lip = [C[0], rimY + yd, C[2]];
    const bottom = [C[0], rimY + yd - BOWL.throat, C[2]];
    this.sample(lip, inward, Rd, 0, -1, 0);
    this.sampleLine(lip, bottom, Rd, 0, -1, 0, false);
    // Stage two continues along the exit chute to the painted checkpoint.
    const finish = makeCollider('box', { c: [C[0], rimY + yd - 1.9, C[2]], hx: Rd + 0.3, hy: 1.2, hz: Rd + 0.3 });
    // Raised on turned legs and block stacks, clear of the exit chute.
    const out = mul(l, side);
    const hOut = Math.atan2(out[0], out[2]);
    const rLeg = R * 0.66;
    for (let k = 1; k <= 5; k++) {
      const a = hOut + (k * Math.PI) / 3;
      const dx = Math.sin(a), dz = Math.cos(a);
      const under = rimY + bowlHeightAt(R, rLeg) - BOWL.thick;
      this.support([C[0] + dx * rLeg, under + FLOOR_T + 0.1, C[2] + dz * rLeg], 0);
    }
    // Exit chute under the bowl: the throat drops qualifiers onto it and it rolls them out past the rim.
    const floorY = bottom[1] - (this.index === 1 ? EXIT_HEADROOM : 1.6);
    this.T.h = hOut;
    this.setPos([C[0] - out[0] * 3, floorY, C[2] - out[2] * 3]);
    const x0 = this.pos();
    const Lx = R + 7;
    const x1 = this.at(Lx, 0, -Lx * 0.06);
    this.slab(x0, x1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(x0, x1, w / 2 + 0.5, 2.4);
    this.wallAlong(x0, x1, -w / 2 - 0.5, 2.4);
    this.box(add(x0, add(mul(this.fwd(), -0.5), [0, 1.2, 0])), matYPR(hOut), [w + 3, 4.4, 1], { mat: MAT.wall, col: PALETTE.navy });
    this.sampleLine([C[0], floorY, C[2]], x1, w / 2, 0, -1, F_RESPAWN, false);
    this.support(lerp3(x0, x1, 0.85), w / 2);
    this.setPos(x1);
    const pen = this.pen(final);
    this.bowlInfo = {
      c: [C[0], rimY, C[2]], R, Rd, Rc, wc, entryS, drainS, yd, throat: BOWL.throat, wallH,
      E: E.slice(), fwd: fw.slice(), slope, out, finishInDrain: this.index !== 1,
    };
    return this.bowlInfo.finishInDrain ? { ...pen, finish, finishS: drainS + 0.4 } : pen;
  }

  // ------------------------------------------------------------ spectacle set pieces

  // Would a piece costing `extra` height still leave room for the rest of the stage under the ceiling? A rough,
  // generous estimate of what is left to come: `restLen` along the runs, `turnsLeft` turns, and the finish.
  dropFits(extra, restLen, turnsLeft, index) {
    const finishDrop = LARGE_FINISH_STAGES.includes(index) ? 18 : 2;
    const est = -this.T.y + extra + restLen * 0.13 + turnsLeft * 5 + finishDrop + (index === 1 ? EXTRA_EXIT_DROP : 0);
    return est <= this.dropRoom;
  }

  // THE WHIRLPOOL: a mid-course mini bowl. The lane funnels into a chute along its far edge (away from `side`), the
  // chute tips everyone over the rim tangentially, they orbit down the slick funnel, and the drain drops them onto
  // the lane below, which carries on under the bowl. The bowl stands out past the lane's edge on `side` (+1/-1
  // along lat), so it only goes on a run's open side. Returns the length used along the run.
  whirlpool(side) {
    const W = WHIRL;
    const w = this.T.w;
    const R = W.R, Rd = W.drain, wc = W.chute, Rc = R - wc / 2;
    const l = this.lat(), fw = this.fwd();
    const p0 = this.pos();
    const cl = -side * (w / 2 - wc / 2); // the chute's centerline, along the lane's far edge
    // Funnel: the outer wall runs straight on; the inner one angles in to the chute.
    const Lf = 10;
    const f1 = this.at(Lf, 0, -Lf * 0.08);
    this.slab(p0, f1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(p0, f1, -side * (w / 2 + 0.5), WALL_H + 0.4);
    const ia = add(p0, mul(l, side * (w / 2 + 0.5))), ib = add(f1, mul(l, cl + side * (wc / 2 + 0.5)));
    const id = norm(sub(ib, ia));
    this.wallAlong(sub(ia, mul(id, 0.4)), add(ib, mul(id, 0.4)), 0, WALL_H + 0.4);
    const c0 = add(f1, mul(l, cl));
    this.sampleLine(p0, c0, wc / 2 + 1, 0, -1, F_RESPAWN, false);
    // The chute: open on the inner side where it crosses the rim, so marbles spill in along it.
    const tWall = Math.sqrt((R + 0.5) ** 2 - (R - wc - 0.5) ** 2);
    const Lc = Math.ceil(tWall + 5);
    const slope = 0.1;
    const E = add(c0, add(mul(fw, Lc), [0, -Lc * slope, 0]));
    this.slab(c0, E, wc + 1, FLOOR_T, { style: 'planks', side: -side * 0.5, col: PALETTE.birch });
    this.wallAlong(c0, E, -side * (wc / 2 + 0.5), 2.6, { col: PALETTE.teal });
    const wEnd = lerp3(c0, E, (Lc - tWall) / Lc);
    this.wallAlong(c0, add(wEnd, mul(fw, 0.4)), side * (wc / 2 + 0.5), 2.6, { col: PALETTE.teal });
    const cR = lerp3(c0, E, (Lc - tWall - 2) / Lc);
    this.sampleLine(c0, cR, wc / 2, 0, -1, F_RESPAWN, false);
    this.sampleLine(cR, E, wc / 2, 0, -1, 0, false);
    this.support(lerp3(c0, E, 0.2), wc / 2);
    this.vis({ k: 'banner', c: add(lerp3(c0, E, (Lc - tWall - 2.5) / Lc), [0, 7, 0]), h: this.T.h, w: wc + 3, text: 'WHIRLPOOL', col: PALETTE.teal, posts: true });
    const entryS = this.sCur;
    const C = add(E, mul(l, side * Rc));
    const rimY = E[1] - W.perch;
    const hAt = (r) => dishHeightAt(R, r, W.A, W.K);
    const prof = dishProfile(R, Rd, W.A, W.K, W.throat);
    const shell = 0.5;
    this.collider('lathe', { c: [C[0], rimY, C[2]], profile: offsetProfile(prof, -shell), shell, mat: { ...MAT.floor, friction: W.friction }, tag: 'slick' });
    // Rim wall all the way round except where the chute crosses it.
    const ang = (p) => Math.atan2(p[2] - C[2], p[0] - C[0]);
    const phiE = ang(E);
    const dir = wrapAngle(ang(add(E, fw)) - phiE) > 0 ? 1 : -1;
    const phiX = ang(add(wEnd, mul(l, side * (wc / 2 + 0.5))));
    const gap = Math.abs(wrapAngle(phiE - phiX));
    const a0 = dir > 0 ? phiE : phiE - (2 * Math.PI - gap);
    const a1 = a0 + 2 * Math.PI - gap;
    this.collider('lathe', { c: [C[0], rimY, C[2]], profile: [[R + 0.5, -1.5], [R + 0.5, W.wallH]], a0, a1, shell: 0.5, mat: MAT.wall });
    const segs = { segments: 30 };
    this.vis({ k: 'lathe', c: [C[0], rimY, C[2]], outline: [[R, -1.5], [R + 1, -1.5], [R + 1, W.wallH], [R, W.wallH]], a0, a1, col: PALETTE.navy, m: 'paint', ...segs });
    this.vis({ k: 'lathe', c: [C[0], rimY, C[2]], outline: [[R - 0.15, W.wallH], [R + 1.15, W.wallH], [R + 1.15, W.wallH + 0.35], [R - 0.15, W.wallH + 0.35]], a0, a1, col: PALETTE.cream, m: 'paint', ...segs });
    const bands = [PALETTE.cream, PALETTE.teal, PALETTE.cream, PALETTE.blue, PALETTE.yellow, PALETTE.navy];
    this.vis({ k: 'bowl', c: [C[0], rimY, C[2]], profile: prof, R, Rd, A: W.A, K: W.K, bands, thick: W.thick, throat: W.throat, under: PALETTE.birch, seg: 64 });
    // Radial samples from the entry to the drain: progress is how close you are to the middle.
    const e = norm(sub([E[0], 0, E[2]], [C[0], 0, C[2]]));
    const inward = mul(e, -1);
    for (let r = Rc - SAMPLE_STEP; r > Rd; r -= SAMPLE_STEP) {
      this.sCur = entryS + (Rc - r);
      this.sample([C[0] + e[0] * r, rimY + hAt(r), C[2] + e[2] * r], inward, 4, 0, -1, 0);
    }
    const yd = hAt(Rd);
    const drainS = entryS + (Rc - Rd);
    this.sCur = drainS;
    const lip = [C[0], rimY + yd, C[2]];
    const bottom = [C[0], rimY + yd - W.throat, C[2]];
    this.sample(lip, inward, Rd, 0, -1, 0);
    this.sample(bottom, fw, Rd, 0, -1, 0);
    // The lane below: it runs on under the bowl along the run's own line (the drain sits over its open side).
    // Leave room for the chase camera below the third-stage whirlpool.
    const floorY = bottom[1] - (this.index === 2 ? EXIT_HEADROOM : 1.6);
    const uC = Lf + Lc;
    const lane = (u, y) => [p0[0] + fw[0] * u, y, p0[2] + fw[2] * u];
    const x0 = lane(uC - 4.5, floorY);
    const Lx = R + 8.5;
    const x1 = lane(uC + R + 4, floorY - Lx * 0.04);
    this.slab(x0, x1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(x0, x1, w / 2 + 0.5, 2.4);
    this.wallAlong(x0, x1, -w / 2 - 0.5, 2.4);
    this.box(add(x0, add(mul(fw, -0.5), [0, 1.2, 0])), matYPR(this.T.h), [w + 3, 4.4, 1], { mat: MAT.wall, col: PALETTE.navy });
    const drop = [C[0], floorY, C[2]];
    const merge = lane(uC + 5, floorY - 9.5 * 0.04);
    // Not a respawn spot right under the drain (a marble put there overlaps its throat).
    this.sampleLine(drop, merge, w / 2 - 2, 0, -1, 0, false);
    this.sampleLine(merge, x1, w / 2, 0, -1, F_RESPAWN, false);
    this.support(lerp3(x0, x1, 0.85), w / 2);
    // Turned legs under the bowl, clear of the lane below: behind it, and out on the open side.
    const cLat = R - w / 2; // the bowl center's lateral offset (toward `side`) from the lane line
    const legs = [[-8.5, cLat - 3.5], [-8.5, cLat + 3.5], [-2, w / 2 + 3], [4, w / 2 + 3]];
    for (const [du, lat] of legs) {
      const pL = add(lane(uC + du, 0), mul(l, side * lat));
      const rr = Math.hypot(pL[0] - C[0], pL[2] - C[2]);
      if (rr > R * 0.85) continue;
      this.support([pL[0], rimY + hAt(rr) - W.thick + FLOOR_T + 0.1, pL[2]], 0);
    }
    this.whirlInfo = {
      c: [C[0], rimY, C[2]], R, Rd, Rc, wc, entryS, drainS, yd, throat: W.throat, wallH: W.wallH, A: W.A, K: W.K,
      E: E.slice(), fwd: fw.slice(), slope,
    };
    this.setPos(x1);
    return uC + R + 4;
  }

  // THE DRUM, a wall of death: the lane narrows along its far edge (away from `side`) and runs out tangentially onto
  // the inside of a giant toy drum, whose floor curves up into a vertical wall (a quarter pipe, banked in and out
  // over the first and last `blend` radians). The ride winds once round the drumstick post, dropping DRUM.drop, and
  // leaves straight on underneath its own way in, so the track crosses over itself. Fast marbles ride high on the
  // wall. Stands out past the lane's edge on `side`.
  drum(side) {
    const D = DRUM;
    const w = this.T.w;
    const wd = D.lane, ri = D.post, rc = ri + wd / 2, ro = ri + wd, Rq = D.pipe, H = D.drop;
    const l = this.lat(), fw = this.fwd();
    const p0 = this.pos();
    const tl = -side * (w / 2 - wd / 2); // the narrow lane's centerline, along the lane's far edge
    const Lf = 8, Le = ro + 1.5, slopeE = 0.06;
    // Funnel down to the narrow lane.
    const f1 = this.at(Lf, 0, -Lf * slopeE);
    this.slab(p0, f1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(p0, f1, -side * (w / 2 + 0.5));
    const ia = add(p0, mul(l, side * (w / 2 + 0.5))), ib = add(f1, mul(l, tl + side * (wd / 2 + 0.5)));
    const idr = norm(sub(ib, ia));
    this.wallAlong(sub(ia, mul(idr, 0.4)), add(ib, mul(idr, 0.4)), 0);
    const e0 = add(f1, mul(l, tl));
    this.sampleLine(p0, e0, wd / 2 + 1, 0, -1, F_RESPAWN, false);
    // The way in: a bridge over the drum's last stretch, to the tangent point T.
    const T = add(e0, add(mul(fw, Le), [0, -Le * slopeE, 0]));
    this.slab(e0, T, wd + 0.2, FLOOR_T, { style: 'planks', col: PALETTE.birch });
    this.wallAlong(e0, T, wd / 2 + 0.5, WALL_H, { thick: 0.8 });
    this.wallAlong(e0, T, -wd / 2 - 0.5, WALL_H, { thick: 0.8 });
    this.sampleLine(e0, T, wd / 2, 0, -1, F_RESPAWN, false);
    this.vis({ k: 'banner', c: add(lerp3(p0, f1, 0.45), [0, 7, 0]), h: this.T.h, w: w + 3, text: 'THE DRUM', col: PALETTE.red, posts: true });
    // The drum.
    const C = add(T, mul(l, side * rc));
    const ang = (p) => Math.atan2(p[2] - C[2], p[0] - C[0]);
    const phiT = ang(T);
    const dir = wrapAngle(ang(add(T, fw)) - phiT) > 0 ? 1 : -1;
    const a0 = dir > 0 ? phiT : phiT - 2 * Math.PI, a1 = a0 + 2 * Math.PI;
    const base = dir > 0 ? 0 : -H, rise = dir > 0 ? -H : H;
    const shell = 0.5;
    const cr = ro - Rq; // where the floor starts to curve up
    const pipeAt = (r) => (r <= cr ? 0 : Rq - Math.sqrt(Math.max(0, Rq * Rq - (r - cr) ** 2)));
    // Floor shell mid-line: flat, then the quarter pipe (offset out by the shell so its surface is the pipe itself).
    const prof = [[ri - 0.6, base - shell], [cr, base - shell]];
    const lift = [0, 0];
    const NP = 7;
    for (let i = 1; i <= NP; i++) {
      const al = (Math.PI / 2) * (i / NP);
      prof.push([cr + (Rq + shell) * Math.sin(al), base - shell]);
      lift.push((Rq + shell) * (1 - Math.cos(al)));
    }
    const H0 = { c: C.slice(), R: matIdentity(), a0, a1, rise, ease: true, blend: D.blend, shell };
    this.collider('helix', { ...H0, profile: prof, lift, mat: MAT.slick });
    // The drum shell: full height all the way round (it passes under the bridge and over the way out).
    this.collider('helix', { ...H0, blend: 0, profile: [[ro + shell, base - 1], [ro + shell, base + D.wall]], mat: MAT.slick });
    // The drum's top hoop overhangs inward, so a marble that hits the wall head-on and climbs it is turned back down.
    this.collider('helix', { ...H0, blend: 0, profile: [[ro - D.hoop, base + D.wall - 0.25], [ro + shell, base + D.wall - 0.25]], shell: 0.25, mat: MAT.slick });
    // The drumstick post.
    const top = D.wall + 3;
    this.collider('cyl', { c: [C[0], C[1] + (top - H - 1.5) / 2, C[2]], radius: ri, hh: (top + H + 1.5) / 2, mat: MAT.wall });
    // Visuals: a natural floor, the curve up the wall in painted bands, the red drum shell with cream hoops.
    const V = { k: 'helix', c: C.slice(), R: matIdentity(), a0, a1, rise, ease: true, blend: D.blend, segments: 22 };
    // Floor bands: [r, y, lift] of the surface and of the underside (FLOOR_T below it, along the curve's normal).
    const FT = FLOOR_T;
    const at = (i) => {
      if (i === 0) return { s: [ri - 0.6, base, 0], o: [ri - 0.6, base - FT, 0] };
      const al = i === 1 ? 0 : (Math.PI / 2) * ((i - 1) / NP);
      return { s: [cr + Rq * Math.sin(al), base, Rq * (1 - Math.cos(al))], o: [cr + (Rq + FT) * Math.sin(al), base - FT, (Rq + FT) * (1 - Math.cos(al))] };
    };
    const band = (i0, i1, col, m = 'paint') => {
      const A = at(i0), B = at(i1);
      const pts = [A.o, B.o, B.s, A.s];
      this.vis({ ...V, outline: pts.map((q) => [q[0], q[1]]), lift: pts.map((q) => q[2]), col, m });
    };
    band(0, 1, PALETTE.birch, 'wood');
    const pipeCols = [PALETTE.cream, this.nextColor(), PALETTE.cream, PALETTE.yellow, PALETTE.cream, PALETTE.blue, PALETTE.cream];
    for (let i = 1; i <= NP; i++) band(i, i + 1, pipeCols[(i - 1) % pipeCols.length]);
    const sh = (y0, y1, col, t = 1.1) => this.vis({ ...V, blend: 0, outline: [[ro, base + y0], [ro + t, base + y0], [ro + t, base + y1], [ro, base + y1]], col, m: 'paint', segments: 22 });
    sh(-1.2, D.wall - 0.5, PALETTE.red);
    this.vis({ ...V, blend: 0, outline: [[ro - D.hoop, base + D.wall - 0.5], [ro + 1.3, base + D.wall - 0.5], [ro + 1.3, base + D.wall], [ro - D.hoop, base + D.wall]], col: PALETTE.cream, m: 'paint', segments: 22 });
    sh(-1.6, -1.2, PALETTE.cream, 1.3);
    this.vis({ k: 'cyl', c: [C[0], C[1] + (top - H - 1.5) / 2, C[2]], R: matIdentity(), r: ri, h: top + H + 1.5, col: PALETTE.birch, m: 'wood' });
    this.vis({ k: 'cyl', c: [C[0], C[1] + top + 0.6, C[2]], R: matIdentity(), r: ri + 0.9, h: 2.2, col: PALETTE.red, m: 'paint' });
    this.vis({ k: 'cyl', c: [C[0], C[1] + top + 1.9, C[2]], R: matIdentity(), r: ri + 0.3, h: 0.5, col: PALETTE.cream, m: 'paint' });
    // Path round the drum on the lane's center line. Ranked by arc, never a respawn point.
    const sT = this.sCur;
    const arc = 2 * Math.PI * rc;
    const n = Math.ceil(arc / SAMPLE_STEP);
    const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const phi = phiT + dir * 2 * Math.PI * t;
      const rel = phi - a0;
      const wgt = sm(rel / D.blend) * sm((2 * Math.PI - rel) / D.blend);
      const p = [C[0] + Math.cos(phi) * rc, T[1] - H * sm(t) + pipeAt(rc) * wgt, C[2] + Math.sin(phi) * rc];
      this.sCur = sT + arc * t;
      this.sample(p, [-Math.sin(phi) * dir, 0, Math.cos(phi) * dir], wd / 2 + 1, 0, -1, F_TURN | F_BANK);
    }
    this.sCur = sT + arc;
    // The way out, underneath the way in, then the lane widens back out.
    const T2 = add(T, [0, -H, 0]);
    const x1 = add(T2, add(mul(fw, Le), [0, -Le * slopeE, 0]));
    this.slab(T2, x1, wd + 0.2, FLOOR_T, { style: 'planks' });
    this.wallAlong(T2, x1, wd / 2 + 0.5, WALL_H, { thick: 0.8 });
    this.wallAlong(T2, x1, -wd / 2 - 0.5, WALL_H, { thick: 0.8 });
    this.sampleLine(T2, x1, wd / 2, 0, -1, F_RESPAWN, true);
    const x2 = add(x1, add(mul(fw, Lf), mul(l, -tl)));
    x2[1] -= Lf * slopeE;
    const x1c = add(x1, mul(l, -tl));
    this.slab(x1c, x2, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(x1c, x2, -side * (w / 2 + 0.5));
    const oa = add(x1, mul(l, side * (wd / 2 + 0.5))), ob = add(x2, mul(l, side * (w / 2 + 0.5)));
    const odr = norm(sub(ob, oa));
    this.wallAlong(sub(oa, mul(odr, 0.4)), add(ob, mul(odr, 0.4)), 0);
    this.sampleLine(x1, x2, wd / 2 + 1, 0, -1, F_RESPAWN, false);
    // Legs under the drum, clear of both lanes.
    for (const q of [0.25, 0.5, 0.75]) {
      const phi = phiT + dir * 2 * Math.PI * q;
      const rr = ro - 2;
      const y = T[1] - H * sm(q) + pipeAt(rr) - FLOOR_T;
      this.support([C[0] + Math.cos(phi) * rr, y + FLOOR_T + 0.1, C[2] + Math.sin(phi) * rr], 0);
    }
    this.support([C[0], T[1] - H - 1.5 + FLOOR_T + 0.1, C[2]], 0);
    this.drumInfo = (this.drumInfo || []).concat([{ s0: sT, s1: sT + arc, c: C.slice(), rc, ro }]);
    this.setPos(x2);
    return Lf + Le + Le + Lf;
  }

  // THE PLUNGE: the lane dives into a tube (a cage of thin hoops over a smooth ceiling) that bends it over into a 65-degree face inside a tower of painted
  // blocks, and a long concave bend levels it out into a run-out at nearly full speed. A rolling marble can only
  // follow a crest to about 46 degrees, so the tube's ceiling catches anything that would fly off and turns it down
  // the face (fast marbles ride the ceiling round, slow ones the floor). All smooth lathe shells and flat slabs that
  // meet tangentially; no box joints in a curve.
  plunge() {
    const P = PLUNGE;
    const w = this.T.w, hw = w / 2;
    const l = this.lat(), fw = this.fwd();
    const th = P.angle, R1 = P.crest, G = P.gap, R2 = R1 + G, R3 = P.bend;
    const ct = Math.cos(th), st = Math.sin(th);
    const p0 = this.pos();
    this.plunged = true;
    // Lead-in, its ceiling flaring down to the tube's mouth.
    const Ll = 6;
    const lip = this.at(Ll, 0, -0.15);
    this.slab(p0, lip, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(p0, lip, hw + 0.5, G + 1.6);
    this.wallAlong(p0, lip, -hw - 0.5, G + 1.6);
    this.sampleLine(p0, lip, hw, 0, -1, F_RESPAWN, false);
    // Ceiling slabs (physics only; the slats are drawn), their surface on the p0-p1 line, solid on the far side of `up`.
    const ceil = (a, b, up) => {
      const i = this.slab(a, b, w + 2, 0.5, { up, visual: false, mat: MAT.slick });
      this.colliders[i].noCam = true; // the camera looks in between the slats
      return i;
    };
    const f0 = add(lerp3(p0, lip, 0.15), [0, G + 1.5, 0]), f1 = add(lip, [0, G, 0]);
    ceil(f0, f1, [0, -1, 0]);
    // A lathe frame lying on its side: local Y along lat, angle phi measured from straight down toward forward.
    const R = [0, l[0], fw[0], -1, 0, 0, 0, l[2], fw[2]];
    const dirAt = (phi) => [Math.sin(phi) * fw[0], -Math.cos(phi), Math.sin(phi) * fw[2]];
    const tanAt = (phi) => [Math.cos(phi) * fw[0], Math.sin(phi), Math.cos(phi) * fw[2]];
    const shell = 0.4, span = [[-hw - 1, 0], [hw + 1, 0]];
    const prof = (rho) => span.map(([y]) => [rho, y]);
    const Cc = add(lip, [0, -R1, 0]);
    this.collider('lathe', { c: Cc, R, profile: prof(R1 - shell), a0: Math.PI - th, a1: Math.PI, shell, mat: MAT.slick });
    const hood = this.collider('lathe', { c: Cc, R, profile: prof(R2 + shell), a0: Math.PI - th, a1: Math.PI, shell, mat: MAT.slick });
    this.colliders[hood].noCam = true;
    const n = [st * fw[0], ct, st * fw[2]]; // the face's normal
    const d = [ct * fw[0], -st, ct * fw[2]]; // and its direction, down the face
    const Pc = add(Cc, mul(n, R1));
    const Pb = add(Pc, mul(d, P.face));
    this.slab(Pc, Pb, w + 2, FLOOR_T, { up: n, style: 'planks', col: PALETTE.birch });
    // The ceiling runs on down the face, closing in on it (to just over the biggest marble), so whatever rides it is
    // laid onto the face before the bend instead of meeting the bend in mid-air.
    const Hc = add(Cc, mul(n, R2)), Hb = add(add(Pc, mul(d, P.face * 0.8)), mul(n, 1.5));
    const hd = norm(sub(Hb, Hc)), hn = cross(l, hd); // the ceiling's underside faces hn (toward the face)
    ceil(Hc, Hb, hn[0] * n[0] + hn[1] * n[1] + hn[2] * n[2] < 0 ? hn : mul(hn, -1));
    const Cb = add(Pb, mul(n, R3));
    this.collider('lathe', { c: Cb, R, profile: prof(R3 + shell), a0: -th, a1: 0, shell, mat: MAT.slick });
    const Pbot = add(Cb, [0, -R3, 0]);
    // Visuals: the crest and the bend in natural wood (smooth shells); painted slats over the tube.
    const HV = { k: 'helix', R, rise: 0, segments: 30, m: 'wood' };
    const out = (r0, r1) => [[r0, -hw - 1], [r1, -hw - 1], [r1, hw + 1], [r0, hw + 1]];
    this.vis({ ...HV, c: Cc, a0: Math.PI - th, a1: Math.PI, outline: out(R1 - FLOOR_T, R1), col: PALETTE.wood });
    this.vis({ ...HV, c: Cb, a0: -th, a1: 0, outline: out(R3, R3 + FLOOR_T), col: PALETTE.wood });
    let slat = 0;
    const slatAt = (c, rad, tan) => {
      const Rs = [l[0], rad[0], -tan[0], l[1], rad[1], -tan[1], l[2], rad[2], -tan[2]];
      this.vis({ k: 'box', c: add(c, mul(rad, 0.2)), R: Rs, s: [w + 2.4, 0.4, 0.5], col: slat++ % 2 ? PALETTE.cream : PALETTE.orange, m: 'paint' });
    };
    const fd = norm(sub(f1, f0));
    // (slatAt takes the tangent pointing back up the tube, as tanAt does, so the frame stays right-handed)
    for (let k = 0; k < 2; k++) slatAt(lerp3(f0, f1, k / 2), cross(fd, l), mul(fd, -1));
    const nArc = Math.max(3, Math.round((R2 * th) / 2.6));
    for (let k = 0; k <= nArc; k++) {
      const phi = Math.PI - (th * k) / nArc;
      slatAt(add(Cc, mul(dirAt(phi), R2)), dirAt(phi), tanAt(phi));
    }
    for (let k = 1; k <= 2; k++) slatAt(lerp3(Hc, Hb, k / 2.2), cross(hd, l), mul(hd, -1));
    // The tower: two side walls of stacked painted blocks, stepping down with the tube (each column of blocks stands a
    // little above the tube's roof over it), so the drop can be watched over the near wall.
    const uOf = (q) => (q[0] - lip[0]) * fw[0] + (q[2] - lip[2]) * fw[2];
    const uEnd = uOf(Pbot);
    const yBot = Pbot[1] - FLOOR_T - 0.4;
    const roofAt = (u) => {
      if (u <= 0) return lip[1] + G;
      if (u <= R2 * st) return Cc[1] + Math.sqrt(Math.max(0, R2 * R2 - u * u));
      const uh = uOf(Hb);
      if (u <= uh) return Hc[1] + ((Hb[1] - Hc[1]) * (u - uOf(Hc))) / (uh - uOf(Hc));
      const ub = Math.min(u, uEnd); // over the bend there is no roof: the wall stands a lane wall above its floor
      return Cb[1] - Math.sqrt(Math.max(0, R3 * R3 - (uEnd - ub) ** 2)) + 2.6;
    };
    const R0 = matYPR(this.T.h);
    const cols = Math.max(2, Math.round((uEnd + 1) / 3.2)), colL = (uEnd + 1) / cols;
    for (const sgn of [1, -1]) {
      for (let j = 0; j < cols; j++) {
        const u0 = -0.5 + colL * j, u1 = u0 + colL;
        let top = -Infinity;
        for (let k = 0; k <= 4; k++) top = Math.max(top, roofAt(u0 + (colL * k) / 4) + 0.6);
        const cc = add(add(lip, mul(fw, (u0 + u1) / 2)), mul(l, sgn * (hw + 1.1)));
        this.collider('box', { c: [cc[0], (top + yBot) / 2, cc[2]], R: R0, hx: 0.6, hy: (top - yBot) / 2, hz: colL / 2 + 0.02, mat: MAT.wall });
        const rows = Math.max(1, Math.round((top - yBot) / 2.7)), rowH = (top - yBot) / rows;
        for (let i = 0; i < rows; i++) {
          const bc = [cc[0], yBot + rowH * (i + 0.5), cc[2]];
          this.vis({ k: 'box', c: bc, R: R0, s: [1.2, rowH - 0.07, colL - 0.07], col: (i + j) % 3 ? this.nextColor() : PALETTE.cream, m: 'paint' });
        }
      }
    }
    this.vis({ k: 'banner', c: add(lerp3(p0, lip, 0.3), [0, G + 5.6, 0]), h: this.T.h, w: w + 3, text: 'THE PLUNGE', col: PALETTE.blue, posts: true });
    // Path: over the crest, down the face, round the bend (all facing forward, for the camera).
    const put = (p) => {
      const last = this.samples[this.samples.length - 1];
      this.sCur += Math.hypot(p[0] - last.x, p[2] - last.z);
      this.sample(p, fw, hw, 0, -1, 0);
    };
    for (let k = 1; k <= 5; k++) put(add(Cc, mul(dirAt(Math.PI - (th * k) / 5), R1)));
    for (let k = 1; k <= 6; k++) put(lerp3(Pc, Pb, k / 6));
    for (let k = 1; k <= 6; k++) put(add(Cb, mul(dirAt(-th + (th * k) / 6), R3)));
    // Run-out.
    const Lr = 14;
    const p1 = add(Pbot, add(mul(fw, Lr), [0, -Lr * 0.03, 0]));
    this.slab(Pbot, p1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(Pbot, p1, hw + 0.5, WALL_H + 0.4);
    this.wallAlong(Pbot, p1, -hw - 0.5, WALL_H + 0.4);
    this.sampleLine(Pbot, p1, hw, 0, -1, F_RESPAWN, false);
    this.support(lerp3(Pbot, p1, 0.5), hw);
    this.setPos(p1);
    return Ll + uEnd + Lr;
  }

  // A giant spinning top (two in a wide lane) wandering round the middle of a gentle stretch. It spins fast and its
  // painted rim grips, so a marble that clips it is flung off sideways; time your line past it.
  spinTop(length, drop) {
    const w = this.T.w;
    const p0 = this.pos();
    const p1 = this.at(length, 0, -drop);
    this.slab(p0, p1, w + 2, FLOOR_T, { style: 'planks' });
    this.wallAlong(p0, p1, w / 2 + 0.5, WALL_H + 0.3);
    this.wallAlong(p0, p1, -w / 2 - 0.5, WALL_H + 0.3);
    const pitch = Math.atan2(drop, length);
    const R0 = matYPR(this.T.h, pitch);
    const nrm = [R0[1], R0[4], R0[7]];
    const l = this.lat();
    const tops = w >= 16 ? [[0.36, Math.min(3.3, w * 0.2)], [0.72, 2.3]] : [[0.5, Math.min(3.1, w * 0.21)]];
    const spinDir = this.rng.chance(0.5) ? 1 : -1;
    let u0 = length, u1 = 0; // where the tops roam, along the piece
    tops.forEach(([t, rT], i) => {
      const pivot = lerp3(p0, p1, t);
      const orbit = Math.max(1.2, Math.min(2.6, w / 2 - rT - 2.4));
      u0 = Math.min(u0, t * length - orbit - rT - 2);
      u1 = Math.max(u1, t * length + orbit + rT + 2);
      const phase = this.rng.range(0, 6.28);
      const motion = { type: 'orbit', axis: nrm, pivot, speed: (i ? -1 : 1) * spinDir * this.rng.range(0.75, 1.0), spin: spinDir * this.rng.range(4.5, 5.5), phase };
      const at = add(pivot, mul(l, orbit));
      const mat = { bounce: 0.3, friction: 0.45, kick: 1.5 };
      // Solid drums for the physics (body, crown, stem); one turned top on screen.
      // The body reaches down into the floor: nothing can get caught underneath it.
      const parts = [[rT, -0.6, 1.45], [rT * 0.72, 1.45, 2.15], [0.62, 2.15, 4.0]];
      let body = -1;
      for (const [r, y0, y1] of parts) {
        const idx = this.collider('cyl', { c: add(at, mul(nrm, (y0 + y1) / 2)), R: R0, radius: r, hh: (y1 - y0) / 2, mat, motion: { ...motion } });
        if (body < 0) body = idx;
      }
      // Moving the visual with the body: its local frame starts at the body's center.
      const yb = (-0.6 + 1.45) / 2;
      const outline = [[0, 0.08], [0.45, 0.14], [rT * 0.9, 0.5], [rT, 0.82], [rT, 1.4], [rT * 0.86, 1.78], [rT * 0.5, 2.12], [0.62, 2.22], [0.62, 3.75], [0.8, 3.82], [0.8, 4.02], [0, 4.08]]
        .map(([r, y]) => [r, y - yb]);
      this.vis({ k: 'kin', i: body, shape: 'top', outline, col: i ? PALETTE.blue : PALETTE.red, alt: PALETTE.cream, m: 'paint', key: 'top' + rT.toFixed(2) });
    });
    // Respawn points only clear of where the tops roam (never inside one).
    const a = lerp3(p0, p1, Math.max(0.02, u0 / length)), b = lerp3(p0, p1, Math.min(0.98, u1 / length));
    this.sampleLine(p0, a, w / 2, 0, -1, u0 > 1 ? F_RESPAWN : 0, false);
    this.sampleLine(a, b, w / 2, 0, -1, 0, false);
    this.sampleLine(b, p1, w / 2, 0, -1, u1 < length - 1 ? F_RESPAWN : 0, false);
    this.maybeSupport(lerp3(p0, p1, 0.5), w / 2);
    this.setPos(p1);
  }
}

// Height of THE BOWL's surface below its rim at radius r (rim radius R).
export function bowlHeightAt(R, r) {
  const rr = Math.max(r, 0.5);
  return -(BOWL.A * (R - rr) + BOWL.K * (1 / rr - 1 / R));
}

// Surface profile [[r, y], ...] from just under the rim wall, down the funnel to the drain lip and the throat.
function bowlProfile(R, Rd) {
  const pts = [[R + 0.8, 0], [R, 0]];
  const n = 30;
  for (let i = 1; i <= n; i++) {
    // Denser toward the drain, where the curve is steep.
    const r = R * Math.pow(Rd / R, i / n);
    pts.push([r, bowlHeightAt(R, r)]);
  }
  const yd = bowlHeightAt(R, Rd);
  pts.push([Rd, yd - BOWL.throat * 0.5], [Rd, yd - BOWL.throat]);
  return pts;
}

// Offsets an open profile along its (up / inward-facing) normal by d.
function offsetProfile(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let er = b[0] - a[0], ey = b[1] - a[1];
    const el = Math.hypot(er, ey) || 1;
    er /= el;
    ey /= el;
    out.push([pts[i][0] + ey * d, pts[i][1] - er * d]);
  }
  return out;
}

function wrapAngle(a) {
  return ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

// Is (x, y, z) inside THE BOWL (on its surface, in the air above it, or down the drain throat), and not still
// on the entry chute that hangs over the rim? Returns the path distance s for that position (by radius: the
// closer to the drain, the further along), or -1.
export function bowlS(bw, x, y, z) {
  const dx = x - bw.c[0], dz = z - bw.c[2];
  const d = Math.hypot(dx, dz);
  if (d > bw.R + 0.4) return -1;
  const yr = y - bw.c[1];
  if (d < bw.Rd + 0.3 && yr < bw.yd + 0.6) return yr > bw.yd - bw.throat - 0.6 ? bw.drainS : -1;
  if (yr < bowlHeightAt(bw.R, d) - 0.8 || yr > bw.wallH + 9) return -1;
  // Still on the chute (its floor hangs out over the rim)?
  const rx = x - bw.E[0], rz = z - bw.E[2];
  const along = rx * bw.fwd[0] + rz * bw.fwd[2];
  if (along < 0) {
    const lat = Math.abs(rx * bw.fwd[2] - rz * bw.fwd[0]);
    if (lat < bw.wc / 2 + 0.6 && y > bw.E[1] - along * bw.slope + 0.15) return -1;
  }
  const k = Math.max(0, Math.min(1, (bw.Rc - d) / (bw.Rc - bw.Rd)));
  return bw.entryS + k * (bw.drainS - bw.entryS);
}

// The coin-funnel family with its own slope terms (THE WHIRLPOOL): height below the rim at radius r.
export function dishHeightAt(R, r, A, K) {
  const rr = Math.max(r, 0.5);
  return -(A * (R - rr) + K * (1 / rr - 1 / R));
}

function dishProfile(R, Rd, A, K, throat) {
  const pts = [[R + 0.8, 0], [R, 0]];
  const n = 24;
  for (let i = 1; i <= n; i++) {
    const r = R * Math.pow(Rd / R, i / n);
    pts.push([r, dishHeightAt(R, r, A, K)]);
  }
  const yd = dishHeightAt(R, Rd, A, K);
  pts.push([Rd, yd - throat * 0.5], [Rd, yd - throat]);
  return pts;
}

// bowlS for THE WHIRLPOOL (stage.whirl): its path distance s at (x, y, z) by radius, or -1 when not in it (still on
// its chute, flown out, or below it on the lane its drain drops onto).
export function whirlS(wp, x, y, z) {
  const dx = x - wp.c[0], dz = z - wp.c[2];
  const d = Math.hypot(dx, dz);
  if (d > wp.R + 0.4) return -1;
  const yr = y - wp.c[1];
  if (d < wp.Rd + 0.3 && yr < wp.yd + 0.6) return yr > wp.yd - wp.throat - 0.6 ? wp.drainS : -1;
  if (yr < dishHeightAt(wp.R, d, wp.A, wp.K) - 0.8 || yr > wp.wallH + 9) return -1;
  const rx = x - wp.E[0], rz = z - wp.E[2];
  const along = rx * wp.fwd[0] + rz * wp.fwd[2];
  if (along < 0) {
    const lat = Math.abs(rx * wp.fwd[2] - rz * wp.fwd[0]);
    if (lat < wp.wc / 2 + 0.6 && y > wp.E[1] - along * wp.slope - 0.3) return -1;
  }
  const k = Math.max(0, Math.min(1, (wp.Rc - d) / (wp.Rc - wp.Rd)));
  return wp.entryS + k * (wp.drainS - wp.entryS);
}

// Slick surface tag for client prediction (contact tags are not sent): THE BOWL or THE WHIRLPOOL.
export function slickTag(st, x, y, z, groundT) {
  if (!st || groundT >= 0.12) return null;
  if (st.bowl && bowlS(st.bowl, x, y, z) >= 0) return 'slick';
  if (st.whirl && whirlS(st.whirl, x, y, z) >= 0) return 'slick';
  return null;
}

export const BRANCH_INFO = {
  clear: { label: 'EASY', speed: 0.55, risk: 0, col: PALETTE.green },
  boost: { label: 'ZOOM', speed: 0.85, risk: 0.05, col: PALETTE.yellow },
  beam: { label: 'BEAM', speed: 1, risk: 0.65, col: PALETTE.orange },
  jump: { label: 'JUMP', speed: 0.95, risk: 0.45, col: PALETTE.red },
  stairs: { label: 'STAIRS', speed: 0.45, risk: 0, col: PALETTE.teal },
  pegs: { label: 'PEGS', speed: 0.5, risk: 0.05, col: PALETTE.green },
  spinner: { label: 'SPIN', speed: 0.6, risk: 0.2, col: PALETTE.purple },
  hammer: { label: 'BONK', speed: 0.7, risk: 0.3, col: PALETTE.red },
  trap: { label: 'TRAP', speed: 0.85, risk: 0.6, col: PALETTE.orange },
  bumpers: { label: 'BOING', speed: 0.6, risk: 0.15, col: PALETTE.pink },
  tunnel: { label: 'ARCHES', speed: 0.55, risk: 0, col: PALETTE.purple },
  high: { label: 'HIGH ROAD', speed: 1.05, risk: 0.55, col: PALETTE.red },
  low: { label: 'LOW ROAD', speed: 0.5, risk: 0, col: PALETTE.teal },
  loop: { label: 'LOOP', speed: 0.95, risk: 0.3, col: PALETTE.blue },
  cannon: { label: 'CANNON', speed: 1, risk: 0.1, col: PALETTE.red },
};

// Split-level forks: the high road always takes an outside edge, so its guard wall faces the drop to the room.
const SPLIT_SETS = [['high', 'low'], ['high', 'low', 'pegs'], ['high', 'low', 'boost'], ['high', 'low', 'spinner']];

const FORK_SETS = [
  ['stairs', 'beam', 'spinner'],
  ['pegs', 'jump', 'hammer'],
  ['clear', 'trap', 'bumpers'],
  ['tunnel', 'beam', 'stairs'],
  ['bumpers', 'boost', 'pegs'],
  ['spinner', 'jump', 'clear'],
  ['hammer', 'trap', 'tunnel'],
];
const FORK_SETS_2 = [
  ['beam', 'stairs'],
  ['jump', 'pegs'],
  ['trap', 'clear'],
  ['boost', 'bumpers'],
  ['hammer', 'tunnel'],
];

// Loop forks are two-way: the loop takes the larger share of the lane; the other branch is a calm one.
const LOOP_PARTNERS = ['clear', 'pegs', 'stairs', 'bumpers', 'tunnel'];
const LOOP_CHANCE = [0.25, 0.7, 0.7, 0.75, 0.85];
const HELIX_CHANCE = [0, 0.3, 0.35, 0.35, 0.5];

// Piece pool: [name, minStage, weight]
const PIECES = [
  // The classics, turned down so the set pieces below turn up often (a stage has room for only so many pieces).
  ['pegs', 0, 2],
  ['spinners', 0, 2],
  ['bumps', 0, 1.2],
  ['funnel', 0, 1.2],
  ['bumperField', 0, 1.4],
  ['rollers', 1, 1.4],
  ['hills', 0, 1.2],
  ['hammers', 1, 2],
  ['gates', 1, 1.4],
  ['sweeper', 2, 1.4],
  ['trapFloor', 2, 1.4],
  ['cliff', 0, 1.2],
  ['bigAir', 1, 1.4],
  ['cascade', 0, 1.1],
  ['seesaws', 1, 1.4],
  ['keys', 0, 1.4],
  ['halfpipe', 0, 4.2],
  // Air time (see the big jumps section at the end).
  ['hoopJump', 0, 3],
  ['hopscotch', 1, 3.2],
  ['trampolines', 1, 3.4],
  // Spectacle (the plunge only while it fits under the ceiling, once a stage).
  ['plunge', 0, 2.6],
  ['spintop', 0, 1.6],
];

// Set pieces that stand out past the lane's edge go on a run's open side: the first run's, away from the second run,
// or the last run's (THE BOWL is on that side too, but only at the very end). Chance per stage index.
const SIDE_PIECES = [
  ['whirlpool', [0.3, 0.45, 0.4, 0.4, 0.5]],
  ['drum', [0.25, 0.3, 0.3, 0.35, 0.35]],
];
// Worst-case height each costs (checked against the stage's room to the ceiling before it is placed).
const SIDE_DROP = { whirlpool: 15, drum: 14, plunge: 16 };

function sidePlan(seed, index, runs, firstSide) {
  const rng = makeRng((seed ^ Math.imul(index + 11, 0x85ebca6b) ^ 0x51de5ec7) >>> 0);
  // THE BOWL's last run is cut short for the bowl itself: no room there for another set piece and its fork.
  const slots = LARGE_FINISH_STAGES.includes(index) ? [0] : rng.shuffle([0, runs - 1]);
  const plan = [];
  for (const [name, chance] of rng.shuffle(SIDE_PIECES.slice())) {
    if (!slots.length || !rng.chance(chance[index])) continue;
    const run = slots.pop();
    plan[run] = { name, side: run === 0 ? -firstSide : firstSide, at: 0, done: false };
  }
  return plan;
}

// Pieces with a per-stage limit (or a height cost) are only dealt while they still fit.
function pieceAllowed(b, name) {
  if (name === 'plunge') return !b.plunged && b.dropFits(SIDE_DROP.plunge, b.restLen, b.turnsLeft, b.index);
  return true;
}

function addPiece(b, name, slope, arg) {
  const s0 = b.sCur, c0 = b.colliders.length;
  const components = b.componentSpan();
  const L = addPieceInner(b, name, slope, arg);
  b.pieces.push({ ...components(), name, s0, s1: b.sCur, c0, c1: b.colliders.length, ...(b.pieceExtra || {}) });
  b.pieceExtra = null;
  return L;
}

function addPieceInner(b, name, slope, arg) {
  const r = b.rng;
  switch (name) {
    case 'firstDoors':
    case 'finishDoors':
      b.gates(arg, 0);
      return arg;
    case 'hammerDeck':
      b.hammers(arg, 0, 2);
      return arg;
    case 'tileDeck':
      b.trapFloor(arg, 0);
      return arg;
    case 'saturnSlide': {
      const entryS = b.sCur;
      b.bankedTurn(arg, 0, 12, true);
      return b.sCur - entryS;
    }
    case 'curvedSlide': {
      const entryS = b.sCur;
      b.bankedTurn(1, 0, arg);
      return b.sCur - entryS;
    }
    case 'shortSlide':
      b.ramp(arg, arg * slope, {surface: 'road'});
      return arg;
    case 'whirlpool':
      return b.whirlpool(arg);
    case 'drum':
      return b.drum(arg);
    case 'plunge':
      return b.plunge();
    case 'spintop': {
      const L = r.range(22, 26);
      b.spinTop(L, L * slope * 0.5);
      return L;
    }
    case 'pegs': {
      const L = r.range(20, 26);
      b.pegs(L, L * (slope + 0.05));
      return L;
    }
    case 'spinners': {
      const L = r.range(18, 24);
      b.spinners(L, L * slope);
      return L;
    }
    case 'bumps': {
      const L = r.range(16, 22);
      b.bumps(L, L * (slope + 0.03));
      return L;
    }
    case 'funnel': {
      const L = r.range(18, 22);
      b.funnel(L, L * slope);
      return L;
    }
    case 'bumperField': {
      const L = r.range(18, 24);
      b.bumperField(L, L * slope);
      return L;
    }
    case 'rollers': {
      const L = r.range(18, 22);
      b.rollers(L, L * slope);
      return L;
    }
    case 'hills': {
      const L = r.range(18, 24);
      b.hills(L, L * (slope + 0.03));
      return L;
    }
    case 'hammers': {
      const L = r.range(22, 28);
      b.hammers(L, L * slope, L > 25 ? 3 : 2);
      return L;
    }
    case 'gates': {
      const L = r.range(14, 18);
      b.gates(L, L * slope);
      return L;
    }
    case 'sweeper': {
      const L = Math.max(16, b.T.w + 2);
      b.sweeper(L);
      return L;
    }
    case 'trapFloor': {
      const L = r.range(18, 22);
      b.trapFloor(L, L * slope * 0.6);
      return L;
    }
    case 'cliff': {
      b.cliff(r.range(2.5, 3.5));
      return 5;
    }
    case 'bigAir': {
      const L = r.range(22, 26);
      b.bigAir(L, L * slope);
      return L;
    }
    case 'cascade': {
      const n = r.int(3, 4);
      b.cascade(n);
      return n * 5;
    }
    case 'seesaws': {
      const L = r.range(22, 28);
      b.seesaws(L, L * slope * 0.5);
      return L;
    }
    case 'keys': {
      const L = r.range(18, 24);
      b.keys(L, L * slope * 0.6);
      return L;
    }
    case 'halfpipe': {
      const L = r.range(32, 38);
      b.halfpipe(L, L * slope);
      return L;
    }
    case 'hoopJump': {
      const L = r.range(31, 34);
      b.hoopJump(L, L * slope * 0.6);
      return L;
    }
    case 'hopscotch': {
      const L = HOP.lens.reduce((x, y) => x + y + HOP.gap, 0) - HOP.gap + r.range(2, 3);
      b.hopscotch(L, L * slope * 0.5);
      return L;
    }
    case 'trampolines': {
      const L = r.range(31, 34);
      b.trampolines(L, L * slope * 0.5);
      return L;
    }
    case 'megaJump': {
      const u0 = b.sCur;
      b.megaJump(b.index === 0 ? MEGA_GENTLE : MEGA);
      return b.sCur - u0;
    }
  }
  throw new Error('unknown piece ' + name);
}

// Builds stage `index` of the show with `seed`, for `count` marbles. Coordinates are stage-local until placed.
export function buildStage(seed, index, count, opts) {
  // A Course Builder plan lays the player's chosen pieces out instead (see the end of this file).
  if (opts && opts.plan) return buildPlannedStage(seed, index, count, opts);
  const rng = makeRng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const width = LANE_WIDTH[index] || 14;
  const b = new StageBuilder(rng, index, width);
  const final = index === STAGE_COUNT - 1;
  b.sCur = 0;
  const grid = b.start(Math.max(count, 10));
  if (index === 0) {
    // Repeat the gate on level ground before asking the runner to read it
    // again after the descent. The landing deck leaves 15 units to the hurdle.
    b.runningDeck(0);
    addPiece(b, 'firstDoors', 0, 24);
    b.runningDeck(1);
    addPiece(b, 'shortSlide', .4, 20);
    addPiece(b, 'hammerDeck', 0, 32);
    addPiece(b, 'tileDeck', 0, 26);
    addPiece(b, 'curvedSlide', 0, 8);
    b.runningDeck(2);
    addPiece(b, 'finishDoors', 0, 26);
    const stage = finishStage(b, index, grid, b.pen(false), false, count);
    stage.name = 'Toy Gate Run';
    return stage;
  }
  b.ramp(10, 1.2);
  const runs = 3;
  const runLen = final ? 112 : 96 + index * 4;
  const firstSide = rng.chance(0.5) ? 1 : -1;
  let lastPiece = '';
  // Most stages get one loop-the-loop fork (a quarter of first stages do).
  const loopRun = rng.chance(LOOP_CHANCE[index]) ? rng.int(0, runs - 1) : -1;
  let helixUsed = false;
  const spec = sidePlan(seed, index, runs, firstSide);
  b.dropRoom = ROOM.height - 12 - PLACEMENT[index].bottom;
  // MEGA JUMP: most stages give one run over to it (its landings count as that run's fork). Rolled on a generator of
  // its own so the rest of the course draws as before. Not on a run a side set piece (whirlpool, drum) opens.
  const jr = makeRng((seed ^ Math.imul(index + 1, 0x51ed270b)) >>> 0);
  const megaRuns = [0, 1, 2].filter((r) => r !== loopRun && !spec[r] && (index > 0 || r > 0) && !(r === runs - 1 && LARGE_FINISH_STAGES.includes(index)));
  const megaRun = jr.chance(MEGA_CHANCE[index]) && megaRuns.length ? jr.pick(megaRuns) : -1;
  let cannonUsed = false;
  for (let run = 0; run < runs; run++) {
    let used = b.runningDeck(run);
    // THE BOWL's chute and rim reach well past the end of the last run, so that run is shorter.
    const thisRunLen = run === runs - 1 && LARGE_FINISH_STAGES.includes(index) ? runLen - BOWL_RUN_TRIM : runLen;
    // Each run gets exactly one fork, placed somewhere in its middle.
    const forkAt = rng.range(0.25, 0.55) * thisRunLen;
    let forked = false;
    const sp = spec[run];
    if (run === megaRun) {
      used += addPiece(b, 'megaJump', 0.07 + index * 0.006);
      b.ramp(5, 0.4);
      used += 5;
      forked = true;
      lastPiece = 'megaJump';
    }
    while (used < thisRunLen) {
      const slope = 0.07 + index * 0.006;
      // A set piece that stands out past the lane's edge (THE WHIRLPOOL, THE DRUM) opens the run, on its open side.
      if (sp && !sp.done && used >= sp.at) {
        sp.done = true;
        const rest = thisRunLen - used + (runs - 1 - run) * runLen;
        const extra = index === 2 && sp.name === 'whirlpool' ? EXTRA_EXIT_DROP : 0;
        if (b.dropFits(SIDE_DROP[sp.name] + extra, rest, runs - 1 - run, index)) {
          used += addPiece(b, sp.name, slope, sp.side);
          const gap = rng.range(5, 8);
          b.ramp(gap, gap * slope);
          used += gap;
          lastPiece = sp.name;
          continue;
        }
      }
      if (!forked && used >= forkAt) {
        let kinds;
        if (run === loopRun) {
          kinds = ['loop', rng.pick(LOOP_PARTNERS)];
          rng.shuffle(kinds);
        } else if (!cannonUsed && !(run === runs - 1 && LARGE_FINISH_STAGES.includes(index)) && jr.chance(CANNON_CHANCE[index])) {
          // A toy cannon beside a calm branch (at most one a stage; its fork is longer, so not on THE BOWL's short run).
          kinds = jr.chance(0.5) ? ['cannon', jr.pick(CANNON_PARTNERS)] : [jr.pick(CANNON_PARTNERS), 'cannon'];
          cannonUsed = true;
        } else if (rng.chance(0.38)) {
          // High road / low road: the high road hugs one outside edge.
          kinds = rng.pick(width >= 16 ? SPLIT_SETS : SPLIT_SETS.slice(0, 1)).slice(1);
          rng.shuffle(kinds);
          if (rng.chance(0.5)) kinds.unshift('high');
          else kinds.push('high');
        } else {
          const three = width >= 15 && (index < 3 || rng.chance(0.6));
          kinds = rng.pick(three ? FORK_SETS : FORK_SETS_2).slice();
          rng.shuffle(kinds);
        }
        const L = rng.range(30, 36) + (kinds.includes('cannon') ? CANNON.extra : 0);
        b.ramp(4, 0.3);
        const components = b.componentSpan();
        const fs0 = b.sCur, fc0 = b.colliders.length;
        b.fork(L, L * slope, kinds);
        b.pieces.push({ ...components(), name: 'fork', s0: fs0, s1: b.sCur, c0: fc0, c1: b.colliders.length, kinds });
        b.ramp(4, 0.3);
        used += L + 8;
        forked = true;
        lastPiece = 'fork';
        continue;
      }
      if (rng.chance(0.25) && lastPiece !== 'ramp') {
        const L = rng.range(8, 14);
        b.ramp(L, L * (slope + 0.03), { boost: rng.chance(0.35) });
        used += L;
        lastPiece = 'ramp';
        continue;
      }
      b.restLen = thisRunLen - used + (runs - 1 - run) * runLen;
      b.turnsLeft = runs - 1 - run;
      // The long pieces only go where they fit in what is left of the run, so they don't lengthen the stage.
      // (Nor straight after a helter-skelter, whose upper winding hangs over the start of the next run.)
      const afterHelix = b.pieces.length > 0 && b.pieces[b.pieces.length - 1].name === 'helix';
      // A spinning top can bounce a marble back uphill, so never straight after a fork or a jump's open landings.
      const pool = PIECES.filter(([n, min]) => min <= index && n !== lastPiece && pieceAllowed(b, n) && !(n === 'spintop' && (lastPiece === 'fork' || lastPiece === 'megaJump')) && !((n in AIR_LEN && afterHelix) || (n in FIT_LEN && used + FIT_LEN[n] + (forked ? 0 : FORK_ROOM) > thisRunLen + 4)));
      const [name] = rng.weighted(pool, (p) => p[2] * (['cliff', 'cascade', 'bigAir'].includes(p[0]) && used < 10 ? 0 : 1));
      used += addPiece(b, name, slope);
      // Breathing room between hazards.
      const gap = rng.range(4, 7);
      b.ramp(gap, gap * slope);
      used += gap;
      lastPiece = name;
    }
    if (run < runs - 1) {
      b.ramp(4, 0.2);
      // Flat, banked, or (at most one a stage, after the first) a helter-skelter.
      const side = run % 2 ? -firstSide : firstSide;
      const kind = !helixUsed && rng.chance(HELIX_CHANCE[index]) ? 'helix' : rng.chance(0.45) ? 'bank' : 'turn';
      const turnComponents = b.componentSpan();
      const ts0 = b.sCur, tc0 = b.colliders.length;
      if (kind === 'turn') b.turn(side);
      else b.bankedTurn(side, kind === 'helix' ? 1 : 0);
      if (kind === 'helix') helixUsed = true;
      b.pieces.push({ ...turnComponents(), name: kind, s0: ts0, s1: b.sCur, c0: tc0, c1: b.colliders.length });
      b.ramp(6, 0.4);
    }
  }
  b.ramp(8, 0.6);
  // THE BOWL sits off the outside of the last run (away from the runs before it): the runs step sideways by
  // firstSide each turn, so the far side is +firstSide along the last run's lateral axis.
  if (index === 1) {
    addPiece(b, 'saturnSlide', 0, firstSide);
    b.ramp(14, .7);
    return finishStage(b, index, grid, b.pen(false), false, count);
  }
  const pen = BOWL_STAGES.includes(index) ? b.bowl(final, firstSide) : b.pen(final);
  return finishStage(b, index, grid, pen, final, count);
}

function finishStage(b, index, grid, pen, final, count) {
  // Pack path samples.
  const S = b.samples;
  const n = S.length;
  const path = {
    n,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), s: new Float32Array(n),
    hw: new Float32Array(n), tx: new Float32Array(n), tz: new Float32Array(n),
    br: new Int16Array(n), fk: new Int16Array(n), fl: new Uint8Array(n),
    length: 0, buckets: null, bucketSize: 2, sMin: 0,
  };
  let sMax = -Infinity, sMin = Infinity;
  for (let i = 0; i < n; i++) {
    const p = S[i];
    path.x[i] = p.x; path.y[i] = p.y; path.z[i] = p.z; path.s[i] = p.s; path.hw[i] = p.hw;
    path.tx[i] = p.tx; path.tz[i] = p.tz; path.br[i] = p.br; path.fk[i] = p.fk; path.fl[i] = p.fl;
    sMax = Math.max(sMax, p.s);
    sMin = Math.min(sMin, p.s);
  }
  path.sMin = sMin;
  path.length = sMax;
  // Finish line distance: where the pen's trigger sits.
  const finishS = pen.finishS ?? sMax - pen.depth + 1.2;
  path.finishS = finishS;
  const nb = Math.ceil((sMax - sMin) / path.bucketSize) + 2;
  path.buckets = Array.from({ length: nb }, () => []);
  for (let i = 0; i < n; i++) path.buckets[Math.floor((path.s[i] - sMin) / path.bucketSize)].push(i);

  let minY = Infinity, maxY = -Infinity;
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const c of b.colliders) {
    for (let k = 0; k < 3; k++) {
      bounds[k] = Math.min(bounds[k], c.aabb[k]);
      bounds[k + 3] = Math.max(bounds[k + 3], c.aabb[k + 3]);
    }
  }
  for (let i = 0; i < n; i++) {
    minY = Math.min(minY, path.y[i]);
    maxY = Math.max(maxY, path.y[i]);
  }
  return {
    index,
    name: STAGE_NAMES[index],
    final,
    count,
    width: b.T.w,
    colliders: b.colliders,
    visuals: b.visuals,
    supports: b.supports,
    pieces: b.pieces,
    trapZones: b.trapZones,
    path,
    forks: b.forks,
    grid,
    gate: b.gate,
    finish: pen.finish,
    penCenter: pen.center,
    penHeading: pen.heading,
    startHeading: 0,
    killY: minY - 12,
    topY: maxY,
    bounds,
    offset: [0, 0, 0],
    bowl: b.bowlInfo || null,
    // Long flights (mega jumps, cannons): where the chase camera eases back to show the landing.
    airZones: b.airZones || [],
    whirl: b.whirlInfo || null,
    drums: b.drumInfo || [],
  };
}

// Moves a built stage by `d` (stages are built at the origin and then placed in the room).
export function translateStage(st, d) {
  const mv = (p) => {
    p[0] += d[0];
    p[1] += d[1];
    p[2] += d[2];
  };
  for (const c of st.colliders) {
    mv(c.c);
    mv(c.c0);
    c.px += d[0]; c.py += d[1]; c.pz += d[2];
    if (c.motion && c.motion.pivot) {
      c.motion.pivot = [c.motion.pivot[0] + d[0], c.motion.pivot[1] + d[1], c.motion.pivot[2] + d[2]];
    }
    for (let k = 0; k < 3; k++) {
      c.aabb[k] += d[k];
      c.aabb[k + 3] += d[k];
    }
  }
  for (const v of st.visuals) if (v.c) v.c = [v.c[0] + d[0], v.c[1] + d[1], v.c[2] + d[2]];
  for (const s of st.supports) {
    s.x += d[0];
    s.y += d[1];
    s.z += d[2];
  }
  const p = st.path;
  for (let i = 0; i < p.n; i++) {
    p.x[i] += d[0];
    p.y[i] += d[1];
    p.z[i] += d[2];
  }
  for (const g of st.grid) mv(g);
  mv(st.finish.c);
  mv(st.finish.c0);
  mv(st.penCenter);
  if (st.bowl) {
    mv(st.bowl.c);
    mv(st.bowl.E);
  }
  for (const z of st.airZones || []) mv(z.land);
  for (const f of st.forks) {
    if (f.mega) mv(f.mega.lip);
    if (f.cannon) mv(f.cannon.breech);
  }
  if (st.whirl) {
    mv(st.whirl.c);
    mv(st.whirl.E);
  }
  for (const dm of st.drums || []) mv(dm.c);
  for (let k = 0; k < 3; k++) {
    st.bounds[k] += d[k];
    st.bounds[k + 3] += d[k];
  }
  st.killY += d[1];
  st.topY += d[1];
  st.offset = [st.offset[0] + d[0], st.offset[1] + d[1], st.offset[2] + d[2]];
}

// Where each stage sits in the bedroom: [x, z] of its footprint center, and the height of its start platform.
export const ROOM = { halfX: 230, halfZ: 230, height: 150 };
const PLACEMENT = [
  { x: -135, z: -110, bottom: 66 },
  { x: 0, z: -125, bottom: 50 },
  { x: 135, z: -110, bottom: 35 },
  { x: 75, z: 110, bottom: 19 },
  { x: -80, z: 110, bottom: 3 },
];

// Builds the whole show: all five stages, placed in the room. Field size shrinks by CUT_PER_STAGE each stage.
export function buildShow(seed, opts) {
  if (opts && opts.plan) return buildPlannedShow(seed, opts);
  const stages = [];
  for (let i = 0; i < STAGE_COUNT; i++) {
    const count = FIELD_SIZE - CUT_PER_STAGE * i;
    const st = buildStage(seed, i, count);
    const pl = PLACEMENT[i];
    const cx = (st.bounds[0] + st.bounds[3]) / 2, cz = (st.bounds[2] + st.bounds[5]) / 2;
    let minY = Infinity;
    for (let k = 0; k < st.path.n; k++) minY = Math.min(minY, st.path.y[k]);
    // Centered on its spot, but pulled back in if a big footprint (a bowl, a long jump) would poke through a wall.
    const keep = 3;
    let dx = pl.x - cx, dz = pl.z - cz;
    dx += Math.max(0, -ROOM.halfX + keep - (st.bounds[0] + dx)) - Math.max(0, st.bounds[3] + dx - (ROOM.halfX - keep));
    dz += Math.max(0, -ROOM.halfZ + keep - (st.bounds[2] + dz)) - Math.max(0, st.bounds[5] + dz - (ROOM.halfZ - keep));
    translateStage(st, [dx, pl.bottom - minY, dz]);
    stages.push(st);
  }
  return stages;
}

// Respawn point for a marble that was last safely at distance `s`: the latest respawnable main-path sample.
export function respawnSample(path, s) {
  let best = -1;
  const b1 = Math.min(path.buckets.length - 1, Math.floor((s - path.sMin) / path.bucketSize));
  for (let bi = b1; bi >= 0 && best < 0; bi--) {
    let bs = -Infinity;
    for (const i of path.buckets[bi]) {
      if (path.br[i] !== 0 || !(path.fl[i] & F_RESPAWN) || path.s[i] > s) continue;
      if (path.s[i] > bs) {
        bs = path.s[i];
        best = i;
      }
    }
  }
  return best < 0 ? 0 : best;
}

// Finds the path sample nearest to (x, y, z), searching s in [sLo, sHi]. Returns index or -1; sets out.d.
export function nearestSample(path, x, y, z, sLo, sHi, out) {
  const b0 = Math.max(0, Math.floor((sLo - path.sMin) / path.bucketSize));
  const b1 = Math.min(path.buckets.length - 1, Math.floor((sHi - path.sMin) / path.bucketSize));
  let best = -1, bd = Infinity;
  for (let bi = b0; bi <= b1; bi++) {
    for (const i of path.buckets[bi]) {
      const dx = path.x[i] - x, dy = (path.y[i] - y) * 1.6, dz = path.z[i] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  if (out) out.d = Math.sqrt(bd);
  return best;
}

// Sample on branch set `branchOf` (fork id -> branch id) nearest to distance s.
export function sampleAt(path, s, branchOf) {
  const bi = Math.max(0, Math.min(path.buckets.length - 1, Math.floor((s - path.sMin) / path.bucketSize)));
  let best = -1, bd = Infinity;
  for (let k = bi - 1; k <= bi + 1; k++) {
    if (k < 0 || k >= path.buckets.length) continue;
    for (const i of path.buckets[k]) {
      const fk = path.fk[i];
      if (fk >= 0 && branchOf[fk] !== path.br[i]) continue;
      const d = Math.abs(path.s[i] - s);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- big jumps

// Surfaces for the jump pieces: the felt net (dead, grippy), rubber drum pads, the hoop's rim.
const JUMP_MAT = {
  felt: { bounce: 0.05, friction: 1.4 },
  cork: { bounce: 0.15, friction: 0.6 },
};

// Toy cannon forks: chance per fork (once a stage), the calm branches beside it, and the barrel's shape.
const CANNON_CHANCE = [0.2, 0.35, 0.35, 0.35, 0.3];
const CANNON_PARTNERS = ['clear', 'pegs', 'bumpers', 'stairs', 'tunnel'];
const CANNON = { extra: 12, breech: 6, angle: (58 * Math.PI) / 180, barrel: 6.2, bore: 1.8, landBack: 9, rise: 1.4, dragComp: 1 };

// HOOP JUMP: neck width, kicker span and rise, hoop distance past the lip / height above it / radius / tube, the push
// through the middle.
const HOOP = {
  neck: 9, neckAt: 9, kick0: 12, kick1: 14.6, rise: 1.4, boost: 30, cap: 34, dist: 7, up: 1.7, radius: 3.5, tube: 0.4,
  bonusR: 1.9, bonus: 90, bonusCap: 40, landAfter: 10, wallH: 5.5,
};
// HOPSCOTCH: how far the trench drops below the platforms, platform lengths, the gaps, the step down between them.
const HOP = { depth: 3.8, lens: [8, 5, 5, 6], gap: 3.4, step: 0.3, boost: 30, cap: 36 };
// Longest each of the air-time pool pieces gets (for fitting them into a run).
const AIR_LEN = { hoopJump: 34, hopscotch: 24 + 3 * 3.4 + 3, trampolines: 34 };
// The same for the half-pipe, the longest of the older pieces (it used to overshoot runs into the bedroom wall).
const FIT_LEN = { ...AIR_LEN, halfpipe: 38 };
// What a run's fork (and its approach ramps) still needs when one of them is placed before it.
const FORK_ROOM = 40;
// TRAMPOLINES: the ledge's share of the lane, pad rows, the kick, the ledge's height and how far past the pads it
// starts, its slanted front, and the chute at the end.
const TRAMP = {
  ledgeW: 0.45, rows: 2, cols: 2, pad0: 6, padStep: 3.4, padL: 2.4, kick: 17.5, height: 2.4, ledgeGap: 2.2, frontSkew: 5, wallH: 5,
  chute: 6,
};

// Chance a stage gives one of its runs to a MEGA JUMP (stage 1 gets the gentle one).
const MEGA_CHANCE = [0.35, 0.5, 0.5, 0.5, 0.55];
const deg = Math.PI / 180;
// Shape and tuning (lengths along the lane from the lip, heights below it). vFar / vMid are the nominal flights the
// path samples follow (the far one with a jump at the lip).
const MEGA = {
  lead: 6, Rc: 34, inrun: 22 * deg, inrunLen: 18, Rk: 12, launch: 34 * deg, stripW: 0.45, boost: 30, cap: 45,
  Hn: 13, Hm: 8.5, Hf: 11, netEnd: 22, midStart: 30.5, midEnd: 47, farEnd: 72, farDrop: 5, lift: 44, liftCap: 14,
  logs: [0.22, 0.45, 0.68], vFar: 45, vMid: 40, netTo: 46, netH: 5,
};
const MEGA_GENTLE = {
  lead: 6, Rc: 30, inrun: 18 * deg, inrunLen: 14, Rk: 11, launch: 30 * deg, stripW: 0.45, boost: 24, cap: 40,
  Hn: 10, Hm: 6.5, Hf: 8.5, netEnd: 15, midStart: 21.5, midEnd: 34.5, farEnd: 58, farDrop: 3.5, lift: 40, liftCap: 13,
  logs: [0.35], vFar: 38, vMid: 32, netTo: 34, netH: 4,
};

export { matApply };

// ---------------------------------------------------------------- course builder plans

// A plan is the Course Builder's recipe, { stages, per }: `stages` is the full show or one stage, and `per` holds one
// recipe a stage, { items, turns, end }: `items` is the ordered list of featured pieces the player chose for that
// stage (PLAN_ITEMS), `turns` a turn style, `end` the pen or THE BOWL. A stage left empty is an ordinary random
// stage (with its usual finish). An old single-recipe plan { items, turns, end, stages } means that recipe on
// every stage. buildPlannedStage lays the items out with the generator's own machinery: three runs joined by turns,
// exactly one fork a run, breathing ramps after every piece, side set pieces only where they stand clear of the
// course, the mega jump taking a run, the room's ceiling. The plan is spread evenly over the runs and what is left of
// each run is filled with classic pieces, so the five stages (each with its own lane width, slope and seed) differ
// a little. An item that can't go where it comes up waits for the next place it fits; what never fits is dropped.
// stage.plan reports both. Solo only: the server never builds from a plan. With no plan nothing here runs, so
// ordinary courses are untouched.
export const PLAN_MAX = 12;
// How each item is placed: 'piece' (in a run), 'side' (opens the first or last run, past the lane's open edge),
// 'mega' (takes a whole run; its landings are the run's fork) or 'fork' (a run's one fork).
export const PLAN_ITEMS = {
  megaJump: 'mega', whirlpool: 'side', drum: 'side', plunge: 'piece', spintop: 'piece', halfpipe: 'piece',
  hoopJump: 'piece', hopscotch: 'piece', trampolines: 'piece', bigAir: 'piece', cascade: 'piece', cliff: 'piece',
  loop: 'fork', cannon: 'fork', highroad: 'fork', fork: 'fork',
  pegs: 'piece', spinners: 'piece', hammers: 'piece', sweeper: 'piece', seesaws: 'piece', keys: 'piece',
  bumperField: 'piece', rollers: 'piece', gates: 'piece', trapFloor: 'piece', hills: 'piece', bumps: 'piece', funnel: 'piece',
};
export const PLAN_TURNS = ['auto', 'flat', 'bank', 'helix'];
export const PLAN_ENDS = ['pen', 'bowl'];

// A clean copy of a plan from anywhere (saved profile, a message): five stage recipes, unknown items dropped, at
// most PLAN_MAX a stage.
export function normalizePlan(p) {
  if (!p || typeof p !== 'object') return null;
  const per = [];
  for (let i = 0; i < STAGE_COUNT; i++) per.push(normalizeStagePlan(Array.isArray(p.per) ? p.per[i] : p));
  return { stages: p.stages === 'one' ? 'one' : 'full', per };
}

// One stage's recipe, cleaned up.
export function normalizeStagePlan(p) {
  if (!p || typeof p !== 'object') p = {};
  const items = (Array.isArray(p.items) ? p.items : []).filter((n) => typeof n === 'string' && Object.prototype.hasOwnProperty.call(PLAN_ITEMS, n));
  return {
    items: items.slice(0, PLAN_MAX),
    turns: PLAN_TURNS.includes(p.turns) ? p.turns : 'auto',
    end: PLAN_ENDS.includes(p.end) ? p.end : 'pen',
  };
}

// The recipe stage `index` is built from, with the show's length: buildPlannedStage reads items, turns, end, stages.
function stagePlanOf(plan, index) {
  const full = normalizePlan(plan);
  return { ...full.per[full.stages === 'one' ? 0 : index], stages: full.stages };
}

// Longest each item runs along the lane (measured over many shows), the forks with their approach ramps, and the
// worst height a tall item costs (checked against the ceiling like the side pieces' SIDE_DROP).
const PLAN_LEN = {
  pegs: 26, spinners: 24, bumps: 22, funnel: 22, bumperField: 24, rollers: 22, hills: 24, hammers: 28, gates: 18, sweeper: 20,
  trapFloor: 22, cliff: 5, bigAir: 26, cascade: 20, seesaws: 28, keys: 24, halfpipe: 38, hoopJump: 34, hopscotch: 37.5,
  trampolines: 34, plunge: 36, spintop: 26,
};
const PLAN_FORK_LEN = 44;
const PLAN_CANNON_LEN = 56;
// What THE WHIRLPOOL and THE DRUM take of their run (they stand out to the side), with the gap after.
const PLAN_SIDE_LEN = 50;
// (Beyond the run's ordinary slope, which the estimate already counts: a mega jump drops ~25 over ~115.)
const PLAN_DROP = { megaJump: 14, plunge: 16, whirlpool: 15, drum: 14, cascade: 6, bigAir: 5 };
const PLAN_DROP_DEFAULT = 2.5;
// Where planned stages stand: the same spots, a little lower (a plan can stack more drops than a random stage, and
// the ceiling is what limits it), and the back row a little wider apart (a plan can end every stage in THE BOWL).
const PLAN_PLACEMENT = [
  { x: -150, z: -110, bottom: 34 },
  { x: 0, z: -125, bottom: 26 },
  { x: 150, z: -110, bottom: 18 },
  { x: 78, z: 110, bottom: 10 },
  { x: -84, z: 110, bottom: 3 },
];
// How far past its nominal length a run may stretch for a featured piece (ordinary runs overshoot more than this).
const PLAN_SLACK = 22;
// What fills the rest of a run: the classics only, so filler never takes a featured piece's once-a-stage slot.
const FILLER = PIECES.filter(([n]) => ['pegs', 'spinners', 'bumps', 'funnel', 'bumperField', 'rollers', 'hills', 'hammers', 'gates', 'sweeper', 'trapFloor', 'cliff', 'bigAir', 'cascade', 'seesaws', 'keys'].includes(n));
const START_SHY = ['cliff', 'cascade', 'bigAir'];

// How many runs a plan needs (three, like every stage, up to `maxRuns` for a long plan): a mega jump takes a run of
// its own, every run without a fork from the plan still gets one, and runs stretch a little for featured pieces.
function planRuns(plan, runLen, maxRuns, trim) {
  let body = 0, forks = 0, megas = 0;
  for (const n of plan.items) {
    const k = PLAN_ITEMS[n];
    if (k === 'mega') megas++;
    else if (k === 'fork') {
      forks++;
      body += n === 'cannon' ? PLAN_CANNON_LEN : PLAN_FORK_LEN;
    } else body += k === 'side' ? PLAN_SIDE_LEN : PLAN_LEN[n] + 7;
  }
  // Every fork and mega jump needs a run of its own.
  for (let r = Math.max(3, forks + megas); r < maxRuns; r++) {
    const bodyRuns = Math.max(1, r - megas);
    if (body + Math.max(0, bodyRuns - forks) * PLAN_FORK_LEN <= bodyRuns * (runLen + PLAN_SLACK / 2) - trim) return r;
  }
  return Math.max(3, maxRuns);
}

function buildPlannedStage(seed, index, count, opts) {
  const plan = stagePlanOf(opts.plan, index);
  const rng = makeRng((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const width = LANE_WIDTH[index] || 14;
  const b = new StageBuilder(rng, index, width);
  const final = opts.final ?? index === STAGE_COUNT - 1;
  const bowlEnd = plan.end === 'bowl';
  b.sCur = 0;
  const grid = b.start(Math.max(count, 10));
  b.ramp(10, 1.2);
  const runLen = final ? 112 : 96 + index * 4;
  const runs = planRuns(plan, runLen, opts.maxRuns ?? (plan.stages === 'one' ? 5 : bowlEnd ? 3 : 4), bowlEnd ? BOWL_RUN_TRIM : 0);
  const firstSide = rng.chance(0.5) ? 1 : -1;
  // The runs step sideways by firstSide at every turn, so the first run's open side is -firstSide and the last
  // run's is +firstSide along the stage's first lateral axis (each run's own lateral axis flips with its heading).
  const lastSide = runs % 2 ? firstSide : -firstSide;
  const slope = 0.07 + index * 0.006;
  b.dropRoom = ROOM.height - 12 - PLAN_PLACEMENT[index].bottom;
  // dropFits with this plan's turns and finish: would `extra` more height still leave room for the rest?
  const turnCost = plan.turns === 'helix' ? HELIX_DROP + 1 : 5;
  const fits = (extra, rest, turnsLeft) => -b.T.y + extra + rest * 0.13 + turnsLeft * turnCost + (bowlEnd ? 18 : 2) <= b.dropRoom;
  const todo = plan.items.map((name, i) => ({ name, i }));
  const report = { placed: [], dropped: [] };
  const take = (t, run) => {
    todo.splice(todo.indexOf(t), 1);
    report.placed.push({ i: t.i, name: t.name, run });
  };
  const drop = (t) => {
    todo.splice(todo.indexOf(t), 1);
    report.dropped.push({ i: t.i, name: t.name });
  };
  const tag = (t) => (b.pieces[b.pieces.length - 1].plan = t.i);
  // Runs a side piece may open (THE BOWL's last run is short and the bowl takes its open side) and runs the mega
  // jump may take (not the very first of the show, as in buildStage).
  const sideRun = (r) => r === 0 || (r === runs - 1 && !bowlEnd);
  const megaRun = (r) => (r > 0 || index > 0) && !(r === runs - 1 && bowlEnd);
  const kindOf = (t) => PLAN_ITEMS[t.name];
  const forkLen = (t) => (t && t.name === 'cannon' ? PLAN_CANNON_LEN : PLAN_FORK_LEN);
  let lastPiece = '';
  let helixUsed = false;
  let whirled = false;
  for (let run = 0; run < runs; run++) {
    let used = 0;
    let forked = false;
    let taken = 0;
    let opening = true;
    const lastRun = run === runs - 1;
    const shortRun = lastRun && bowlEnd;
    const thisRunLen = shortRun ? runLen - BOWL_RUN_TRIM : runLen;
    const forkAt = rng.range(0.25, 0.55) * thisRunLen;
    // This run's share of what is left: the first `quota` items may open it, the first `bodyQuota` run pieces and
    // forks go in it (the side pieces and mega jumps wait for a run to open, so they don't count against it).
    const quota = Math.ceil(todo.length / (runs - run));
    let bodyQuota = 0;
    const turnsLeft = runs - 1 - run;
    const rest = (u) => thisRunLen - u + turnsLeft * runLen;
    const laterRun = (f) => {
      for (let r = run + 1; r < runs; r++) if (f(r)) return true;
      return false;
    };
    // Items with no chance left in this stage are dropped (a second whirlpool or plunge; a side piece or mega jump
    // with no run left to open; a fork once the last run has its fork).
    const prune = () => {
      for (const t of todo.slice()) {
        const k = kindOf(t);
        if ((t.name === 'whirlpool' && whirled) || (t.name === 'plunge' && b.plunged)) drop(t);
        else if (k === 'side' && !laterRun(sideRun) && !(opening && sideRun(run))) drop(t);
        else if (k === 'mega' && !laterRun(megaRun) && !(opening && megaRun(run))) drop(t);
        else if (k === 'fork' && lastRun && (forked || (t.name === 'cannon' && shortRun))) drop(t);
      }
    };
    prune();
    const isBody = (t) => kindOf(t) === 'piece' || kindOf(t) === 'fork';
    const window = () => todo.filter(isBody).slice(0, Math.max(0, bodyQuota - taken));
    const gapRamp = (lo, hi) => {
      const gap = rng.range(lo, hi);
      b.ramp(gap, gap * slope);
      used += gap;
    };
    // THE WHIRLPOOL or THE DRUM opens the run, on its open side (the last chance takes one from anywhere in the plan).
    if (sideRun(run)) {
      const pool = laterRun(sideRun) ? todo.slice(0, quota) : todo;
      const t = pool.find((x) => kindOf(x) === 'side');
      if (t && fits(PLAN_DROP[t.name], rest(0), turnsLeft)) {
        used += addPiece(b, t.name, slope, run === 0 ? -firstSide : lastSide);
        tag(t);
        take(t, run);
        if (t.name === 'whirlpool') whirled = true;
        gapRamp(5, 8);
        lastPiece = t.name;
      }
    }
    // The mega jump takes the whole run when it is next up (side pieces aside), or now if no later run could take it.
    if (used === 0 && megaRun(run)) {
      const next = todo.find((x) => kindOf(x) !== 'side');
      const t = laterRun(megaRun) ? (next && next.name === 'megaJump' ? next : null) : todo.find((x) => x.name === 'megaJump');
      if (t && fits(PLAN_DROP.megaJump, rest(0), turnsLeft)) {
        used += addPiece(b, 'megaJump', slope);
        tag(t);
        take(t, run);
        b.ramp(5, 0.4);
        used += 5;
        forked = true;
        lastPiece = 'megaJump';
      }
    }
    opening = false;
    // Run pieces and forks spread over the runs still to come, less those a mega jump will take.
    {
      let megaRunsLeft = 0;
      for (let r = run + 1; r < runs; r++) if (megaRun(r)) megaRunsLeft++;
      const megas = Math.min(megaRunsLeft, todo.filter((t) => kindOf(t) === 'mega').length);
      bodyQuota = Math.ceil(todo.filter(isBody).length / Math.max(1, runs - run - megas));
    }
    const emitFork = (kinds, t) => {
      const L = rng.range(30, 36) + (kinds.includes('cannon') ? CANNON.extra : 0);
      b.ramp(4, 0.3);
      const components = b.componentSpan();
      const fs0 = b.sCur, fc0 = b.colliders.length;
      b.fork(L, L * slope, kinds);
      b.pieces.push({ ...components(), name: 'fork', s0: fs0, s1: b.sCur, c0: fc0, c1: b.colliders.length, kinds, ...(t ? { plan: t.i } : {}) });
      b.ramp(4, 0.3);
      used += L + 8;
      forked = true;
      lastPiece = 'fork';
    };
    const splitKinds = () => {
      const kinds = rng.pick(width >= 16 ? SPLIT_SETS : SPLIT_SETS.slice(0, 1)).slice(1);
      rng.shuffle(kinds);
      if (rng.chance(0.5)) kinds.unshift('high');
      else kinds.push('high');
      return kinds;
    };
    const classicKinds = () => {
      const three = width >= 15 && (index < 3 || rng.chance(0.6));
      const kinds = rng.pick(three ? FORK_SETS : FORK_SETS_2).slice();
      rng.shuffle(kinds);
      return kinds;
    };
    const planKinds = (t) => {
      if (t.name === 'loop') return rng.shuffle(['loop', rng.pick(LOOP_PARTNERS)]);
      if (t.name === 'cannon') return rng.chance(0.5) ? ['cannon', rng.pick(CANNON_PARTNERS)] : [rng.pick(CANNON_PARTNERS), 'cannon'];
      if (t.name === 'highroad') return splitKinds();
      return classicKinds();
    };
    while (used < thisRunLen) {
      prune();
      const afterHelix = b.pieces.length > 0 && b.pieces[b.pieces.length - 1].name === 'helix';
      const win = window();
      const winFork = win.find((t) => kindOf(t) === 'fork');
      const status = (t) => {
        const k = kindOf(t);
        if (k === 'side' || k === 'mega') return 'later';
        if (k === 'fork') {
          if (forked || (t.name === 'cannon' && shortRun)) return 'later';
          // Not straight after a helter-skelter: the cannon's breech would sit under the tower's overhang and trap marbles.
          if (t.name === 'cannon' && afterHelix) return 'wait';
          return used + forkLen(t) <= thisRunLen + PLAN_SLACK && fits(PLAN_DROP_DEFAULT, rest(used), turnsLeft) ? 'ok' : 'later';
        }
        if (t.name === 'plunge' && b.plunged) return 'later';
        // The same spacing rules as the random generator: no air piece under a helter-skelter's overhang, no
        // spinning top straight after a fork or jump, no sheer drop right at the start of a run.
        if ((t.name in AIR_LEN && afterHelix) || (t.name === 'spintop' && (lastPiece === 'fork' || lastPiece === 'megaJump')) || (START_SHY.includes(t.name) && used < 10)) return 'wait';
        const reserve = forked ? 0 : forkLen(winFork && winFork !== t ? winFork : null);
        if (used + PLAN_LEN[t.name] + 7 + reserve > thisRunLen + PLAN_SLACK) return 'later';
        return fits(PLAN_DROP[t.name] || PLAN_DROP_DEFAULT, rest(used), turnsLeft) ? 'ok' : 'later';
      };
      const st = win.map(status);
      const forkReady = win.some((t, k) => kindOf(t) === 'fork' && st[k] === 'ok');
      // The run's fork, when the plan has none ready for it.
      if (!forked && used >= forkAt && !forkReady) {
        emitFork(rng.chance(0.38) ? splitKinds() : classicKinds(), null);
        continue;
      }
      const k = st.indexOf('ok');
      if (k >= 0) {
        const t = win[k];
        if (kindOf(t) === 'fork') emitFork(planKinds(t), t);
        else {
          used += addPiece(b, t.name, slope);
          tag(t);
          gapRamp(4, 7);
          lastPiece = t.name;
        }
        take(t, run);
        taken++;
        continue;
      }
      // Filler: a breathing ramp now and then, otherwise a classic piece that still fits under the ceiling.
      if (rng.chance(0.25) && lastPiece !== 'ramp') {
        const L = rng.range(8, 14);
        b.ramp(L, L * (slope + 0.03), { boost: rng.chance(0.35) });
        used += L;
        lastPiece = 'ramp';
        continue;
      }
      let pool = FILLER.filter(([n, min]) => min <= index && n !== lastPiece && fits(PLAN_DROP[n] || PLAN_DROP_DEFAULT, rest(used), turnsLeft));
      if (!pool.length) pool = FILLER.filter(([n, min]) => min <= index && n !== lastPiece && !START_SHY.includes(n));
      const [name] = rng.weighted(pool, (p) => p[2] * (START_SHY.includes(p[0]) && used < 10 ? 0 : 1));
      used += addPiece(b, name, slope);
      gapRamp(4, 7);
      lastPiece = name;
    }
    if (run < runs - 1) {
      b.ramp(4, 0.2);
      const side = run % 2 ? -firstSide : firstSide;
      let kind;
      if (plan.turns === 'flat') kind = 'turn';
      else if (plan.turns === 'bank') kind = 'bank';
      else if (plan.turns === 'helix') kind = fits(HELIX_DROP, turnsLeft * runLen, turnsLeft - 1) ? 'helix' : 'bank';
      else kind = !helixUsed && rng.chance(HELIX_CHANCE[index]) ? 'helix' : rng.chance(0.45) ? 'bank' : 'turn';
      const turnComponents = b.componentSpan();
      const ts0 = b.sCur, tc0 = b.colliders.length;
      if (kind === 'turn') b.turn(side);
      else b.bankedTurn(side, kind === 'helix' ? 1 : 0);
      if (kind === 'helix') helixUsed = true;
      b.pieces.push({ ...turnComponents(), name: kind, s0: ts0, s1: b.sCur, c0: tc0, c1: b.colliders.length });
      b.ramp(6, 0.4);
    }
  }
  for (const t of todo.slice()) drop(t);
  report.dropped.sort((a, c) => a.i - c.i);
  b.ramp(8, 0.6);
  const pen = bowlEnd ? b.bowl(final, lastSide) : b.pen(final);
  const st = finishStage(b, index, grid, pen, final, count);
  st.plan = report;
  return st;
}

// The whole show from a plan: five stages (or, for 'one', a single 50-marble race that is its own final), placed
// in the room the way buildShow places them.
function buildPlannedShow(seed, opts) {
  const plan = normalizePlan(opts.plan);
  const one = plan.stages === 'one';
  const stages = [];
  for (let i = 0; i < (one ? 1 : STAGE_COUNT); i++) {
    const count = one ? FIELD_SIZE : FIELD_SIZE - CUT_PER_STAGE * i;
    if (!one && !plan.per[i].items.length) {
      // Left empty: an ordinary random stage, as in a normal show.
      const st = buildStage(seed, i, count);
      st.plan = { placed: [], dropped: [], random: true };
      placeInRoom(st, PLAN_PLACEMENT[i]);
      stages.push(st);
      continue;
    }
    const st = buildPlannedStage(seed, i, count, { plan, final: one ? true : undefined });
    if (one) st.name = 'Your Course';
    placeInRoom(st, PLAN_PLACEMENT[i]);
    stages.push(st);
  }
  return stages;
}

// buildShow's placement: centered on its spot, pulled back in where it would poke through a wall.
function placeInRoom(st, pl) {
  const cx = (st.bounds[0] + st.bounds[3]) / 2, cz = (st.bounds[2] + st.bounds[5]) / 2;
  let minY = Infinity;
  for (let k = 0; k < st.path.n; k++) minY = Math.min(minY, st.path.y[k]);
  const keep = 3;
  let dx = pl.x - cx, dz = pl.z - cz;
  dx += Math.max(0, -ROOM.halfX + keep - (st.bounds[0] + dx)) - Math.max(0, st.bounds[3] + dx - (ROOM.halfX - keep));
  dz += Math.max(0, -ROOM.halfZ + keep - (st.bounds[2] + dz)) - Math.max(0, st.bounds[5] + dz - (ROOM.halfZ - keep));
  translateStage(st, [dx, pl.bottom - minY, dz]);
}
