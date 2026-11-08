// Geometry builders for the wooden-block world. Everything is appended into a GeoBuilder, which bakes
// transforms and vertex colors so a whole stage renders in a handful of draw calls.
import * as THREE from 'three';

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  vert(x, y, z, nx, ny, nz, u, v, r, g, b) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(r, g, b);
    return this.pos.length / 3 - 1;
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const n = this.count;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Transform helper: R is a 9-element row-major rotation, c the translation.
export function makeXform(R, c) {
  return {
    p: (x, y, z) => [R[0] * x + R[1] * y + R[2] * z + c[0], R[3] * x + R[4] * y + R[5] * z + c[1], R[6] * x + R[7] * y + R[8] * z + c[2]],
    n: (x, y, z) => [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z],
  };
}
export const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const tmpColor = new THREE.Color();
export function rgb(hex, jitter = 0, rnd = Math.random) {
  tmpColor.set(hex);
  const k = 1 + (rnd() - 0.5) * 2 * jitter;
  return [tmpColor.r * k, tmpColor.g * k, tmpColor.b * k];
}

// Box with chamfered edges, size (sx, sy, sz), centered at c with rotation R.
// UVs are world-scaled planar per face with the grain along each face's longer side.
export function chamferBox(gb, R, c, sx, sy, sz, color, opts = {}) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const b = Math.min(opts.bevel ?? 0.16, hx * 0.42, hy * 0.42, hz * 0.42);
  const X = makeXform(R, c);
  const uvs = opts.uvScale ?? 0.11;
  const ou = opts.uOff ?? 0, ov = opts.vOff ?? 0;
  const [cr, cg, cb] = color;
  // Each vertex takes the normal of the box face it lies on, so the bevels shade as smooth rounded edges.
  const eps = 1e-5;
  const vn = (v) => {
    if (Math.abs(Math.abs(v[0]) - hx) < eps) return [Math.sign(v[0]), 0, 0];
    if (Math.abs(Math.abs(v[1]) - hy) < eps) return [0, Math.sign(v[1]), 0];
    return [0, 0, Math.sign(v[2])];
  };
  const emit = (v, u, w) => {
    const n = vn(v);
    const N = X.n(n[0], n[1], n[2]);
    // Slightly darker undersides: a hint of occlusion that also helps when screen-space AO is off.
    const shade = N[1] < -0.5 ? 0.8 : 1;
    const P = X.p(v[0], v[1], v[2]);
    gb.vert(P[0], P[1], P[2], N[0], N[1], N[2], u * uvs + ou, w * uvs + ov, cr * shade, cg * shade, cb * shade);
  };
  const quad = (a, bb, cc, d, n, ua, va) => {
    const i0 = gb.count;
    for (const v of [a, bb, cc, d]) emit(v, ua(v), va(v));
    gb.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  };
  const tri = (a, bb, cc, n) => {
    const i0 = gb.count;
    for (const v of [a, bb, cc]) emit(v, v[0] + v[2], v[1]);
    gb.idx.push(i0, i0 + 1, i0 + 2);
  };
  const ix = hx - b, iy = hy - b, iz = hz - b;
  // Face UV axes: pick the longer in-face dimension for U so grain runs along the block.
  const ax = (u, v) => ({ u, v });
  // +X / -X faces (axes y,z)
  for (const s of [1, -1]) {
    const longZ = sz >= sy;
    const ua = longZ ? (p) => p[2] : (p) => p[1];
    const va = longZ ? (p) => p[1] : (p) => p[2];
    const x = s * hx;
    if (s > 0) quad([x, -iy, iz], [x, -iy, -iz], [x, iy, -iz], [x, iy, iz], [1, 0, 0], ua, va);
    else quad([x, -iy, -iz], [x, -iy, iz], [x, iy, iz], [x, iy, -iz], [-1, 0, 0], ua, va);
  }
  // +Y / -Y (axes x,z)
  for (const s of [1, -1]) {
    const longZ = sz >= sx;
    const ua = longZ ? (p) => p[2] : (p) => p[0];
    const va = longZ ? (p) => p[0] : (p) => p[2];
    const y = s * hy;
    if (s > 0) quad([-ix, y, iz], [ix, y, iz], [ix, y, -iz], [-ix, y, -iz], [0, 1, 0], ua, va);
    else quad([-ix, y, -iz], [ix, y, -iz], [ix, y, iz], [-ix, y, iz], [0, -1, 0], ua, va);
  }
  // +Z / -Z (axes x,y)
  for (const s of [1, -1]) {
    const longX = sx >= sy;
    const ua = longX ? (p) => p[0] : (p) => p[1];
    const va = longX ? (p) => p[1] : (p) => p[0];
    const z = s * hz;
    if (s > 0) quad([-ix, -iy, z], [ix, -iy, z], [ix, iy, z], [-ix, iy, z], [0, 0, 1], ua, va);
    else quad([ix, -iy, z], [-ix, -iy, z], [-ix, iy, z], [ix, iy, z], [0, 0, -1], ua, va);
  }
  if (b <= 0.001) return;
  const r2 = Math.SQRT1_2;
  // 12 edge bevels.
  for (const sx_ of [1, -1]) {
    for (const sy_ of [1, -1]) {
      // edges along Z between X and Y faces
      const a = [sx_ * hx, sy_ * iy, iz], bb = [sx_ * hx, sy_ * iy, -iz], cc = [sx_ * ix, sy_ * hy, -iz], d = [sx_ * ix, sy_ * hy, iz];
      const n = [sx_ * r2, sy_ * r2, 0];
      if (sx_ * sy_ > 0) quad(a, bb, cc, d, n, (p) => p[2], (p) => p[1]);
      else quad(d, cc, bb, a, n, (p) => p[2], (p) => p[1]);
    }
  }
  for (const sx_ of [1, -1]) {
    for (const sz_ of [1, -1]) {
      // edges along Y between X and Z faces
      const a = [sx_ * hx, -iy, sz_ * iz], bb = [sx_ * hx, iy, sz_ * iz], cc = [sx_ * ix, iy, sz_ * hz], d = [sx_ * ix, -iy, sz_ * hz];
      const n = [sx_ * r2, 0, sz_ * r2];
      if (sx_ * sz_ > 0) quad(a, bb, cc, d, n, (p) => p[1], (p) => p[0]);
      else quad(d, cc, bb, a, n, (p) => p[1], (p) => p[0]);
    }
  }
  for (const sy_ of [1, -1]) {
    for (const sz_ of [1, -1]) {
      // edges along X between Y and Z faces
      const a = [-ix, sy_ * hy, sz_ * iz], bb = [ix, sy_ * hy, sz_ * iz], cc = [ix, sy_ * iy, sz_ * hz], d = [-ix, sy_ * iy, sz_ * hz];
      const n = [0, sy_ * r2, sz_ * r2];
      if (sy_ * sz_ > 0) quad(d, cc, bb, a, n, (p) => p[0], (p) => p[1]);
      else quad(a, bb, cc, d, n, (p) => p[0], (p) => p[1]);
    }
  }
  // 8 corners.
  const r3 = 1 / Math.sqrt(3);
  for (const sx_ of [1, -1]) {
    for (const sy_ of [1, -1]) {
      for (const sz_ of [1, -1]) {
        const a = [sx_ * hx, sy_ * iy, sz_ * iz], bb = [sx_ * ix, sy_ * hy, sz_ * iz], cc = [sx_ * ix, sy_ * iy, sz_ * hz];
        const n = [sx_ * r3, sy_ * r3, sz_ * r3];
        if (sx_ * sy_ * sz_ > 0) tri(a, bb, cc, n);
        else tri(a, cc, bb, n);
      }
    }
  }
  void ax;
}

// Cylinder along local Y with a small chamfer. `bands` > 1 alternates ring colors; `stripes` alternates
// colors around the circumference (so spinning rollers read as spinning).
export function cylinder(gb, R, c, radius, height, color, opts = {}) {
  const seg = opts.segments ?? (radius > 1.5 ? 28 : radius > 0.7 ? 20 : 14);
  const X = makeXform(R, c);
  const hh = height / 2;
  const b = Math.min(opts.bevel ?? 0.1, radius * 0.3, hh * 0.4);
  const alt = opts.alt || [0.97, 0.94, 0.88];
  const bands = opts.bands || 1;
  const uvs = 0.12;
  const ringColor = (bi) => (bands > 1 && bi % 2 ? alt : color);
  const segColor = (si) => (opts.stripes && si % 2 ? alt : null);
  const add = (lx, ly, lz, nx, ny, nz, u, v, col) => {
    const P = X.p(lx, ly, lz);
    const N = X.n(nx, ny, nz);
    return gb.vert(P[0], P[1], P[2], N[0], N[1], N[2], u, v, col[0], col[1], col[2]);
  };
  // Side, banded.
  const y0 = -hh + b, y1 = hh - b;
  for (let bi = 0; bi < bands; bi++) {
    const ya = y0 + ((y1 - y0) * bi) / bands, yb = y0 + ((y1 - y0) * (bi + 1)) / bands;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const col = segColor(s) || ringColor(bi);
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const u0 = (s / seg) * radius * 6.28 * uvs, u1 = ((s + 1) / seg) * radius * 6.28 * uvs;
      const i0 = add(c0 * radius, ya, s0 * radius, c0, 0, s0, u0, ya * uvs, col);
      const i1 = add(c1 * radius, ya, s1 * radius, c1, 0, s1, u1, ya * uvs, col);
      const i2 = add(c1 * radius, yb, s1 * radius, c1, 0, s1, u1, yb * uvs, col);
      const i3 = add(c0 * radius, yb, s0 * radius, c0, 0, s0, u0, yb * uvs, col);
      gb.idx.push(i0, i2, i1, i0, i3, i2);
    }
  }
  // Chamfer rings and caps.
  for (const sgn of [1, -1]) {
    const yE = sgn * (hh - b), yC = sgn * hh;
    const capCol = sgn > 0 ? ringColor(bands - 1) : ringColor(0);
    const center = add(0, yC, 0, 0, sgn, 0, 0, 0, capCol);
    const rin = radius - b;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const col = segColor(s) || capCol;
      const n2 = Math.SQRT1_2;
      const j0 = add(c0 * radius, yE, s0 * radius, c0 * n2, sgn * n2, s0 * n2, c0, s0, col);
      const j1 = add(c1 * radius, yE, s1 * radius, c1 * n2, sgn * n2, s1 * n2, c1, s1, col);
      const j2 = add(c1 * rin, yC, s1 * rin, c1 * n2, sgn * n2, s1 * n2, c1, s1, col);
      const j3 = add(c0 * rin, yC, s0 * rin, c0 * n2, sgn * n2, s0 * n2, c0, s0, col);
      if (sgn > 0) gb.idx.push(j0, j2, j1, j0, j3, j2);
      else gb.idx.push(j0, j1, j2, j0, j2, j3);
      const k0 = add(c0 * rin, yC, s0 * rin, 0, sgn, 0, c0 * rin * uvs, s0 * rin * uvs, capCol);
      const k1 = add(c1 * rin, yC, s1 * rin, 0, sgn, 0, c1 * rin * uvs, s1 * rin * uvs, capCol);
      if (sgn > 0) gb.idx.push(center, k1, k0);
      else gb.idx.push(center, k0, k1);
    }
  }
}

// Revolves a closed outline [[r, y], ...] (counter-clockwise in r-y) about local Y from angle a0 to a1,
// with flat end caps. x = cos(phi) r, z = sin(phi) r (matches the physics lathe convention).
export function lathe(gb, c, outline, a0, a1, color, opts = {}) {
  const span = a1 - a0;
  const seg = Math.max(6, Math.ceil((span / Math.PI) * (opts.segments ?? 28)));
  const uvs = 0.11;
  const n = outline.length;
  for (let e = 0; e < n; e++) {
    const [ra, ya] = outline[e];
    const [rb, yb] = outline[(e + 1) % n];
    // 2D outward normal of this edge (outline is CCW in r-y).
    let ex = rb - ra, ey = yb - ya;
    const el = Math.hypot(ex, ey) || 1;
    ex /= el;
    ey /= el;
    const nr = ey, ny = -ex;
    for (let s = 0; s < seg; s++) {
      const p0 = a0 + (span * s) / seg, p1 = a0 + (span * (s + 1)) / seg;
      const pts = [[ra, ya, p0], [rb, yb, p0], [rb, yb, p1], [ra, ya, p1]];
      const i0 = gb.count;
      for (const [r, y, ph] of pts) {
        const cx = Math.cos(ph), sz = Math.sin(ph);
        gb.vert(c[0] + cx * r, c[1] + y, c[2] + sz * r, cx * nr, ny, sz * nr, ph * Math.max(ra, rb) * uvs, (y + r) * uvs, color[0], color[1], color[2]);
      }
      gb.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
  // End caps (outline assumed convex).
  for (const [ph, sgn] of [[a0, -1], [a1, 1]]) {
    const cx = Math.cos(ph), sz = Math.sin(ph);
    // Cap normal: tangent direction of increasing phi, flipped at the start.
    const tx = -sz * sgn, tz = cx * sgn;
    const i0 = gb.count;
    for (const [r, y] of outline) {
      gb.vert(c[0] + cx * r, c[1] + y, c[2] + sz * r, tx, 0, tz, r * uvs, y * uvs, color[0] * 0.95, color[1] * 0.95, color[2] * 0.95);
    }
    for (let k = 1; k < n - 1; k++) {
      if (sgn > 0) gb.idx.push(i0, i0 + k, i0 + k + 1);
      else gb.idx.push(i0, i0 + k + 1, i0 + k);
    }
  }
}

// Revolves an open profile all the way round local Y with smooth shading (THE BOWL's lacquered surfaces).
// rows: [[r, y, nr, ny], ...] along the profile, (nr, ny) the unit normal in the r-y plane on the side to show.
// x = cos(phi) r, z = sin(phi) r, as for lathe(). opts.segments sets the steps round the circle.
export function revolveRows(gb, c, rows, color, opts = {}) {
  const seg = opts.segments ?? 96;
  const uvs = opts.uvScale ?? 0.11;
  if (rows.length < 2) return;
  // Arc length down the profile for the V coordinate.
  const arc = [0];
  for (let i = 1; i < rows.length; i++) arc.push(arc[i - 1] + Math.hypot(rows[i][0] - rows[i - 1][0], rows[i][1] - rows[i - 1][1]));
  const i0 = gb.count;
  for (let i = 0; i < rows.length; i++) {
    const [r, y, nr, ny] = rows[i];
    for (let j = 0; j <= seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      const cx = Math.cos(ph), sz = Math.sin(ph);
      gb.vert(c[0] + cx * r, c[1] + y, c[2] + sz * r, cx * nr, ny, sz * nr, ph * Math.max(r, 1) * uvs, arc[i] * uvs, color[0], color[1], color[2]);
    }
  }
  // Pick the winding that faces the requested normal (test the first quad with some area).
  let flip = false;
  const ph1 = (Math.PI * 2) / seg;
  for (let i = 0; i + 1 < rows.length; i++) {
    const [ra, ya, nra, nya] = rows[i], [rb, yb] = rows[i + 1];
    const u = [rb - ra, yb - ya, 0], v = [Math.cos(ph1) * rb - ra, yb - ya, Math.sin(ph1) * rb];
    const cx = u[1] * v[2] - u[2] * v[1], cy = u[2] * v[0] - u[0] * v[2];
    const d = cx * nra + cy * nya;
    if (Math.abs(d) > 1e-9) {
      flip = d < 0;
      break;
    }
  }
  const W = seg + 1;
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i0 + i * W + j, b = i0 + (i + 1) * W + j, cc = b + 1, d = a + 1;
      if (flip) gb.idx.push(a, cc, b, a, d, cc);
      else gb.idx.push(a, b, cc, a, cc, d);
    }
  }
}


// Like lathe(), for the physics helix: the outline also slides `rise` along the axis between a0 and a1 (eased in
// and out if `ease`), may wind past a full turn, and the whole piece is rotated by R (so a loop-the-loop can lie on
// its side). End caps fan from the outline's centroid, so a trough-shaped outline caps cleanly.
export function helixLathe(gb, R, c, outline, a0, a1, rise, ease, color, opts = {}) {
  const span = a1 - a0;
  const seg = Math.max(6, Math.ceil((span / Math.PI) * (opts.segments ?? 28)));
  const X = makeXform(R, c);
  const off = (ph) => {
    const u = (ph - a0) / span;
    return ease ? rise * u * u * (3 - 2 * u) : rise * u;
  };
  const uvs = 0.11;
  const n = outline.length;
  // Optional bank (matches the physics helix): outline vertex e rises by lift[e] * w(phi), w easing in and out
  // over `blend` radians at the ends.
  const lift = opts.lift, blend = opts.blend || 0;
  const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const bw = (ph) => (!lift ? 0 : !blend ? 1 : sm((ph - a0) / blend) * sm((a1 - ph) / blend));
  const at = (e, ph) => outline[e][1] + off(ph) + (lift ? lift[e] * bw(ph) : 0);
  const put = (r, y, ph, nr, ny, u, v) => {
    const cx = Math.cos(ph), sz = Math.sin(ph);
    const P = X.p(cx * r, y, sz * r);
    const N = X.n(cx * nr, ny, sz * nr);
    return gb.vert(P[0], P[1], P[2], N[0], N[1], N[2], u, v, color[0], color[1], color[2]);
  };
  for (let e = 0; e < n; e++) {
    const e2 = (e + 1) % n;
    const ra = outline[e][0], rb = outline[e2][0];
    const rm = Math.max(ra, rb) * uvs;
    // Edge normal in the meridian, from the (possibly lifted) outline at this angle.
    const nrm = (ph) => {
      const ex = rb - ra, ey = at(e2, ph) - at(e, ph);
      const el = Math.hypot(ex, ey) || 1;
      return [ey / el, -ex / el];
    };
    for (let s = 0; s < seg; s++) {
      const p0 = a0 + (span * s) / seg, p1 = a0 + (span * (s + 1)) / seg;
      const n0 = nrm(p0), n1 = nrm(p1);
      const ya0 = at(e, p0), yb0 = at(e2, p0), ya1 = at(e, p1), yb1 = at(e2, p1);
      const i0 = put(ra, ya0, p0, n0[0], n0[1], p0 * rm, (ya0 + ra) * uvs);
      put(rb, yb0, p0, n0[0], n0[1], p0 * rm, (yb0 + rb) * uvs);
      put(rb, yb1, p1, n1[0], n1[1], p1 * rm, (yb1 + rb) * uvs);
      put(ra, ya1, p1, n1[0], n1[1], p1 * rm, (ya1 + ra) * uvs);
      gb.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
  let mr = 0, my = 0;
  for (const [r, y] of outline) {
    mr += r / n;
    my += y / n;
  }
  for (const [ph, sgn] of [[a0, -1], [a1, 1]]) {
    const cx = Math.cos(ph), sz = Math.sin(ph);
    const T = X.n(-sz * sgn, 0, cx * sgn);
    const k = 0.95;
    const vtx = (r, y) => {
      const P = X.p(cx * r, y + off(ph), sz * r);
      return gb.vert(P[0], P[1], P[2], T[0], T[1], T[2], r * uvs, y * uvs, color[0] * k, color[1] * k, color[2] * k);
    };
    const ic = vtx(mr, my);
    const i0 = gb.count;
    for (const [r, y] of outline) vtx(r, y);
    for (let e = 0; e < n; e++) {
      const a = i0 + e, b = i0 + ((e + 1) % n);
      if (sgn > 0) gb.idx.push(ic, a, b);
      else gb.idx.push(ic, b, a);
    }
  }
}
