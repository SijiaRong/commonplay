// Marble physics shared by the server, the solo-mode simulation and client-side prediction.
// Marbles are spheres; the course is built from static and kinematic primitives:
//   box   oriented box (planks, walls, blocks, spinners, hammers)
//   cyl   finite solid cylinder along its local Y axis (pegs, posts, rollers)
//   lathe a thin shell made by revolving a 2D (radius, height) polyline around local Y, optionally only over
//         an angular range (curved turn floors and walls, bowls, banked corners)
//   helix a lathe whose profile also slides along local Y as it goes round (`rise` over the whole angular range,
//         linear or eased in and out), and which may wind past 360 degrees: loop-the-loops, helter-skelters
// Rotation matrices are 9-element row-major arrays: world = R * local + c.
// Everything is plain numbers and arrays so the same code runs in Node, Workers and the browser.

export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;
export const SUBSTEPS = 4;
export const SUB_DT = TICK_DT / SUBSTEPS;
export const GRAVITY = 46;
export const MAX_SPEED = 52;

const SHAPE_BOX = 0;
const SHAPE_CYL = 1;
const SHAPE_LATHE = 2;
const SHAPE_HELIX = 3;
export const SHAPES = { box: SHAPE_BOX, cyl: SHAPE_CYL, lathe: SHAPE_LATHE, helix: SHAPE_HELIX };

// ---------------------------------------------------------------- matrices

export function matIdentity() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function matMul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

export function matRotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function matRotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function matRotZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

// Heading (yaw about +Y, forward = (sin yaw, 0, cos yaw)), then pitch (positive tips the nose down), then roll.
export function matYPR(yaw, pitch = 0, roll = 0) {
  return matMul(matMul(matRotY(yaw), matRotX(pitch)), matRotZ(roll));
}

export function matAxisAngle(ax, ay, az, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
    t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
  ];
}

export function matApply(R, x, y, z) {
  return [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z, R[6] * x + R[7] * y + R[8] * z];
}

// ---------------------------------------------------------------- colliders

const DEFAULT_MAT = { bounce: 0.25, friction: 0.15, kick: 0 };

// Creates a collider. Common options: c (center), R (rotation), mat ({bounce, friction, kick}), tag, motion.
export function makeCollider(shape, o) {
  const col = {
    shape: SHAPES[shape],
    c: o.c.slice(),
    R: (o.R || matIdentity()).slice(),
    hx: o.hx || 0, hy: o.hy || 0, hz: o.hz || 0,
    radius: o.radius || 0, hh: o.hh || 0,
    profile: o.profile ? o.profile.flat() : null,
    a0: o.a0 ?? null, a1: o.a1 ?? null,
    shell: o.shell ?? 0.35,
    rise: o.rise || 0, ease: !!o.ease, lift: o.lift || null, blend: o.blend || 0,
    mat: { ...DEFAULT_MAT, ...(o.mat || {}) },
    tag: o.tag || null,
    boost: o.boost || null, // [fx, fy, fz] acceleration applied while touching (speed strips)
    boostCap: o.boostCap || 0, // if set, the strip only pushes marbles slower than this along it
    // Sensors are not solid: a marble overlapping one gets its `boost` (as above) or, with `launch`, has its
    // velocity set to exactly that vector (a toy cannon's barrel), the same on the server and in prediction.
    sensor: !!o.sensor || !!o.launch,
    launch: o.launch || null,
    motion: o.motion || null,
    c0: o.c.slice(),
    R0: (o.R || matIdentity()).slice(),
    // kinematic state (updated by poseAt)
    wx: 0, wy: 0, wz: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0,
    enabled: true,
    aabb: null,
  };
  if (col.motion) {
    const m = col.motion;
    col.px = m.pivot ? m.pivot[0] : col.c[0];
    col.py = m.pivot ? m.pivot[1] : col.c[1];
    col.pz = m.pivot ? m.pivot[2] : col.c[2];
  }
  // A builder that knows a tighter box (a short arc of a big helix) may pass its own; it must still hold the shape.
  col.aabb = o.aabb ? o.aabb.slice() : computeAABB(col);
  return col;
}

function boundingRadius(col) {
  if (col.shape === SHAPE_BOX) return Math.hypot(col.hx, col.hy, col.hz);
  if (col.shape === SHAPE_CYL) return Math.hypot(col.radius, col.hh);
  let m = 0;
  const p = col.profile;
  for (let i = 0; i < p.length; i += 2) m = Math.max(m, Math.hypot(p[i], p[i + 1]));
  return m + col.shell;
}

function computeAABB(col) {
  const R = col.R;
  let ex, ey, ez;
  if (col.shape === SHAPE_HELIX) return helixAABB(col);
  if (col.shape === SHAPE_BOX) {
    ex = Math.abs(R[0]) * col.hx + Math.abs(R[1]) * col.hy + Math.abs(R[2]) * col.hz;
    ey = Math.abs(R[3]) * col.hx + Math.abs(R[4]) * col.hy + Math.abs(R[5]) * col.hz;
    ez = Math.abs(R[6]) * col.hx + Math.abs(R[7]) * col.hy + Math.abs(R[8]) * col.hz;
  } else if (col.shape === SHAPE_CYL) {
    ex = Math.abs(R[0]) * col.radius + Math.abs(R[1]) * col.hh + Math.abs(R[2]) * col.radius;
    ey = Math.abs(R[3]) * col.radius + Math.abs(R[4]) * col.hh + Math.abs(R[5]) * col.radius;
    ez = Math.abs(R[6]) * col.radius + Math.abs(R[7]) * col.hh + Math.abs(R[8]) * col.radius;
  } else {
    const b = boundingRadius(col);
    ex = ey = ez = b;
  }
  let cx = col.c[0], cy = col.c[1], cz = col.c[2];
  if (col.motion) {
    // Cover every pose the obstacle can reach.
    const m = col.motion;
    if (m.type === 'slide') {
      const a = m.amp;
      ex += Math.abs(m.dir[0]) * a; ey += Math.abs(m.dir[1]) * a; ez += Math.abs(m.dir[2]) * a;
    } else if (m.type === 'drop') {
      ey += m.depth / 2;
      cy -= m.depth / 2;
    } else {
      const reach = Math.hypot(col.c[0] - col.px, col.c[1] - col.py, col.c[2] - col.pz) + boundingRadius(col);
      cx = col.px; cy = col.py; cz = col.pz;
      ex = ey = ez = reach;
    }
  }
  return [cx - ex, cy - ey, cz - ez, cx + ex, cy + ey, cz + ez];
}

// Smooth 0..1..0 trapdoor curve: closed, opening, open, closing within one period.
function dropAmount(m, t) {
  const p = (((t + m.phase) % m.period) + m.period) % m.period / m.period;
  const o0 = m.closedFrac, o1 = m.closedFrac + 0.08, o2 = 1 - 0.08;
  if (p < o0) return 0;
  if (p < o1) return smooth((p - o0) / (o1 - o0));
  if (p < o2) return 1;
  return 1 - smooth((p - o2) / (1 - o2));
}
function smooth(x) {
  return x * x * (3 - 2 * x);
}

// Moves a kinematic collider to its pose at time t (seconds since the stage started).
export function poseAt(col, t) {
  const m = col.motion;
  if (!m) return;
  if (m.type === 'spin' || m.type === 'swing') {
    let ang, w;
    if (m.type === 'spin') {
      ang = m.speed * t + m.phase;
      w = m.speed;
    } else {
      ang = m.amp * Math.sin(m.speed * t + m.phase);
      w = m.amp * m.speed * Math.cos(m.speed * t + m.phase);
    }
    const [ax, ay, az] = m.axis;
    const Q = matAxisAngle(ax, ay, az, ang);
    const R = matMul(Q, col.R0);
    for (let i = 0; i < 9; i++) col.R[i] = R[i];
    const d = matApply(Q, col.c0[0] - col.px, col.c0[1] - col.py, col.c0[2] - col.pz);
    col.c[0] = col.px + d[0]; col.c[1] = col.py + d[1]; col.c[2] = col.pz + d[2];
    col.wx = ax * w; col.wy = ay * w; col.wz = az * w;
    col.vx = col.vy = col.vz = 0;
  } else if (m.type === 'slide') {
    const s = Math.sin(m.speed * t + m.phase);
    const ds = Math.cos(m.speed * t + m.phase) * m.speed;
    col.c[0] = col.c0[0] + m.dir[0] * m.amp * s;
    col.c[1] = col.c0[1] + m.dir[1] * m.amp * s;
    col.c[2] = col.c0[2] + m.dir[2] * m.amp * s;
    col.vx = m.dir[0] * m.amp * ds; col.vy = m.dir[1] * m.amp * ds; col.vz = m.dir[2] * m.amp * ds;
    col.px = col.c[0]; col.py = col.c[1]; col.pz = col.c[2];
  } else if (m.type === 'drop') {
    const a = dropAmount(m, t);
    const a2 = dropAmount(m, t + 0.01);
    col.c[1] = col.c0[1] - a * m.depth;
    col.vy = -(a2 - a) / 0.01 * m.depth;
    col.vx = col.vz = 0;
    col.px = col.c[0]; col.py = col.c[1]; col.pz = col.c[2];
    // A tile that has fallen away no longer catches marbles.
    col.enabled = a < 0.5;
  } else if (m.type === 'orbit') {
    // A spinning top: turns about its own axis at `spin` rad/s while its center circles `pivot` (about the same
    // axis) at `speed` rad/s. Surface velocity = the center's velocity + spin about the center.
    const [ax, ay, az] = m.axis;
    const Q = matAxisAngle(ax, ay, az, m.spin * t + m.phase);
    const R = matMul(Q, col.R0);
    for (let i = 0; i < 9; i++) col.R[i] = R[i];
    const ang = m.speed * t + m.phase;
    const O = matAxisAngle(ax, ay, az, ang);
    const d = matApply(O, col.c0[0] - m.pivot[0], col.c0[1] - m.pivot[1], col.c0[2] - m.pivot[2]);
    col.c[0] = m.pivot[0] + d[0]; col.c[1] = m.pivot[1] + d[1]; col.c[2] = m.pivot[2] + d[2];
    // v = speed * axis x d
    col.vx = m.speed * (ay * d[2] - az * d[1]);
    col.vy = m.speed * (az * d[0] - ax * d[2]);
    col.vz = m.speed * (ax * d[1] - ay * d[0]);
    col.wx = ax * m.spin; col.wy = ay * m.spin; col.wz = az * m.spin;
    col.px = col.c[0]; col.py = col.c[1]; col.pz = col.c[2];
  }
}

// ---------------------------------------------------------------- closest-point queries

// Scratch contact result: normal (n*), depth, contact point (q*).
const hit = { nx: 0, ny: 0, nz: 0, depth: 0, qx: 0, qy: 0, qz: 0 };

function finishLocal(col, lx, ly, lz, qx, qy, qz, reach) {
  let dx = lx - qx, dy = ly - qy, dz = lz - qz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= reach * reach) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-9) return false;
  dx /= d; dy /= d; dz /= d;
  const R = col.R;
  hit.nx = R[0] * dx + R[1] * dy + R[2] * dz;
  hit.ny = R[3] * dx + R[4] * dy + R[5] * dz;
  hit.nz = R[6] * dx + R[7] * dy + R[8] * dz;
  hit.depth = reach - d;
  hit.qx = col.c[0] + R[0] * qx + R[1] * qy + R[2] * qz;
  hit.qy = col.c[1] + R[3] * qx + R[4] * qy + R[5] * qz;
  hit.qz = col.c[2] + R[6] * qx + R[7] * qy + R[8] * qz;
  return true;
}

function setHitLocalNormal(col, nlx, nly, nlz, depth, qx, qy, qz) {
  const R = col.R;
  hit.nx = R[0] * nlx + R[1] * nly + R[2] * nlz;
  hit.ny = R[3] * nlx + R[4] * nly + R[5] * nlz;
  hit.nz = R[6] * nlx + R[7] * nly + R[8] * nlz;
  hit.depth = depth;
  hit.qx = col.c[0] + R[0] * qx + R[1] * qy + R[2] * qz;
  hit.qy = col.c[1] + R[3] * qx + R[4] * qy + R[5] * qz;
  hit.qz = col.c[2] + R[6] * qx + R[7] * qy + R[8] * qz;
  return true;
}

function testBox(col, px, py, pz, r) {
  const R = col.R;
  const dx = px - col.c[0], dy = py - col.c[1], dz = pz - col.c[2];
  const lx = R[0] * dx + R[3] * dy + R[6] * dz;
  const ly = R[1] * dx + R[4] * dy + R[7] * dz;
  const lz = R[2] * dx + R[5] * dy + R[8] * dz;
  const hx = col.hx, hy = col.hy, hz = col.hz;
  if (lx > hx + r || lx < -hx - r || ly > hy + r || ly < -hy - r || lz > hz + r || lz < -hz - r) return false;
  const ax = Math.abs(lx), ay = Math.abs(ly), az = Math.abs(lz);
  if (ax <= hx && ay <= hy && az <= hz) {
    // Center inside the box: leave through the nearest face.
    const fx = hx - ax, fy = hy - ay, fz = hz - az;
    if (fy <= fx && fy <= fz) {
      const s = ly >= 0 ? 1 : -1;
      return setHitLocalNormal(col, 0, s, 0, fy + r, lx, s * hy, lz);
    }
    if (fx <= fz) {
      const s = lx >= 0 ? 1 : -1;
      return setHitLocalNormal(col, s, 0, 0, fx + r, s * hx, ly, lz);
    }
    const s = lz >= 0 ? 1 : -1;
    return setHitLocalNormal(col, 0, 0, s, fz + r, lx, ly, s * hz);
  }
  const qx = lx < -hx ? -hx : lx > hx ? hx : lx;
  const qy = ly < -hy ? -hy : ly > hy ? hy : ly;
  const qz = lz < -hz ? -hz : lz > hz ? hz : lz;
  return finishLocal(col, lx, ly, lz, qx, qy, qz, r);
}

function testCyl(col, px, py, pz, r) {
  const R = col.R;
  const dx = px - col.c[0], dy = py - col.c[1], dz = pz - col.c[2];
  const lx = R[0] * dx + R[3] * dy + R[6] * dz;
  const ly = R[1] * dx + R[4] * dy + R[7] * dz;
  const lz = R[2] * dx + R[5] * dy + R[8] * dz;
  const rad = col.radius, hh = col.hh;
  if (ly > hh + r || ly < -hh - r) return false;
  const rho = Math.sqrt(lx * lx + lz * lz);
  if (rho > rad + r) return false;
  if (rho <= rad && Math.abs(ly) <= hh) {
    const radial = rad - rho, axial = hh - Math.abs(ly);
    if (axial < radial) {
      const s = ly >= 0 ? 1 : -1;
      return setHitLocalNormal(col, 0, s, 0, axial + r, lx, s * hh, lz);
    }
    const ux = rho > 1e-6 ? lx / rho : 1, uz = rho > 1e-6 ? lz / rho : 0;
    return setHitLocalNormal(col, ux, 0, uz, radial + r, ux * rad, ly, uz * rad);
  }
  const qy = ly < -hh ? -hh : ly > hh ? hh : ly;
  let qx = lx, qz = lz;
  if (rho > rad) {
    qx = (lx / rho) * rad;
    qz = (lz / rho) * rad;
  }
  return finishLocal(col, lx, ly, lz, qx, qy, qz, r);
}

const TWO_PI = Math.PI * 2;

function testLathe(col, px, py, pz, r) {
  const R = col.R;
  const dx = px - col.c[0], dy = py - col.c[1], dz = pz - col.c[2];
  const lx = R[0] * dx + R[3] * dy + R[6] * dz;
  const ly = R[1] * dx + R[4] * dy + R[7] * dz;
  const lz = R[2] * dx + R[5] * dy + R[8] * dz;
  let phi = Math.atan2(lz, lx);
  if (col.a0 !== null) {
    // Clamp the angle into [a0, a1]; outside, use the nearer boundary meridian.
    const span = col.a1 - col.a0;
    let rel = phi - col.a0;
    rel = ((rel % TWO_PI) + TWO_PI) % TWO_PI;
    if (rel > span) {
      const toEnd = rel - span, toStart = TWO_PI - rel;
      rel = toEnd < toStart ? span : 0;
    }
    phi = col.a0 + rel;
  }
  const ux = Math.cos(phi), uz = Math.sin(phi);
  const rho = lx * ux + lz * uz;
  // Closest point on the profile polyline to (rho, ly).
  const p = col.profile;
  let best = Infinity, bq = 0, by = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 2], byy = p[i + 3];
    const ex = bx - ax, ey = byy - ay;
    const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((rho - ax) * ex + (ly - ay) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + ex * t, cy = ay + ey * t;
    const d2 = (rho - cx) * (rho - cx) + (ly - cy) * (ly - cy);
    if (d2 < best) {
      best = d2;
      bq = cx;
      by = cy;
    }
  }
  const qx = ux * bq, qz = uz * bq;
  const reach = r + col.shell;
  if (!finishLocal(col, lx, ly, lz, qx, by, qz, reach)) return false;
  // Report the contact on the shell surface rather than its mid-line.
  hit.qx += hit.nx * col.shell;
  hit.qy += hit.ny * col.shell;
  hit.qz += hit.nz * col.shell;
  return true;
}


// ---------------------------------------------------------------- helix

// Axial offset of a helix profile `rel` radians after a0 (and its derivative).
function helixOff(col, rel) {
  const span = col.a1 - col.a0;
  const u = rel / span;
  return col.ease ? col.rise * u * u * (3 - 2 * u) : col.rise * u;
}
function helixSlope(col, rel) {
  const span = col.a1 - col.a0;
  const u = rel / span;
  return col.ease ? (col.rise * 6 * u * (1 - u)) / span : col.rise / span;
}

// Bank weight: 0 at both ends of the angular range, easing to 1 over `blend` radians.
function helixBank(col, rel) {
  if (!col.blend) return 1;
  const span = col.a1 - col.a0;
  const a = Math.max(0, Math.min(1, rel / col.blend)), b = Math.max(0, Math.min(1, (span - rel) / col.blend));
  return a * a * (3 - 2 * a) * b * b * (3 - 2 * b);
}

function helixAABB(col) {
  const p = col.profile;
  let rmax = 0, ylo = Infinity, yhi = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const lift = col.lift ? col.lift[i >> 1] : 0;
    rmax = Math.max(rmax, p[i]);
    ylo = Math.min(ylo, p[i + 1] + Math.min(0, lift));
    yhi = Math.max(yhi, p[i + 1] + Math.max(0, lift));
  }
  rmax += col.shell;
  ylo += Math.min(0, col.rise) - col.shell;
  yhi += Math.max(0, col.rise) + col.shell;
  const R = col.R;
  const hy = (yhi - ylo) / 2, my = (ylo + yhi) / 2;
  const cx = col.c[0] + R[1] * my, cy = col.c[1] + R[4] * my, cz = col.c[2] + R[7] * my;
  const ex = (Math.abs(R[0]) + Math.abs(R[2])) * rmax + Math.abs(R[1]) * hy;
  const ey = (Math.abs(R[3]) + Math.abs(R[5])) * rmax + Math.abs(R[4]) * hy;
  const ez = (Math.abs(R[6]) + Math.abs(R[8])) * rmax + Math.abs(R[7]) * hy;
  return [cx - ex, cy - ey, cz - ez, cx + ex, cy + ey, cz + ez];
}

// Like testLathe, but the profile is shifted along local Y by helixOff(rel). Where the shell winds past a full turn,
// the winding nearest the point (along the axis) is the one tested. The contact normal includes the helical tilt.
function testHelix(col, px, py, pz, r) {
  const R = col.R;
  const dx = px - col.c[0], dy = py - col.c[1], dz = pz - col.c[2];
  const lx = R[0] * dx + R[3] * dy + R[6] * dz;
  const ly = R[1] * dx + R[4] * dy + R[7] * dz;
  const lz = R[2] * dx + R[5] * dy + R[8] * dz;
  const span = col.a1 - col.a0;
  const p = col.profile;
  const yMid = (p[1] + p[p.length - 1]) / 2;
  let rel = (((Math.atan2(lz, lx) - col.a0) % TWO_PI) + TWO_PI) % TWO_PI;
  let clamped = false;
  if (rel > span) {
    // Outside the angular range (only possible below one full turn): the nearer end meridian.
    rel = rel - span < TWO_PI - rel ? span : 0;
    clamped = true;
  } else {
    let best = rel, bd = Infinity;
    for (let k = rel; k <= span + 1e-9; k += TWO_PI) {
      const d = Math.abs(ly - helixOff(col, k) - yMid);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    rel = best;
  }
  const phi = col.a0 + rel;
  const ux = Math.cos(phi), uz = Math.sin(phi);
  const off = helixOff(col, rel);
  const ly2 = ly - off;
  const rho = lx * ux + lz * uz;
  // Optional bank: each profile point also rises by lift[i] * w, w easing from 0 at the ends to 1.
  const L = col.lift;
  const w = L ? helixBank(col, rel) : 0;
  let best = Infinity, bq = 0, by = 0, bl = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], bx = p[i + 2];
    const ay = L ? p[i + 1] + w * L[i >> 1] : p[i + 1], byy = L ? p[i + 3] + w * L[(i >> 1) + 1] : p[i + 3];
    const ex = bx - ax, ey = byy - ay;
    const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((rho - ax) * ex + (ly2 - ay) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + ex * t, cy = ay + ey * t;
    const d2 = (rho - cx) * (rho - cx) + (ly2 - cy) * (ly2 - cy);
    if (d2 < best) {
      best = d2;
      bq = cx;
      by = cy;
      bl = L ? L[i >> 1] + (L[(i >> 1) + 1] - L[i >> 1]) * t : 0;
    }
  }
  const reach = r + col.shell;
  if (clamped) {
    if (!finishLocal(col, lx, ly, lz, ux * bq, by + off, uz * bq, reach)) return false;
    hit.qx += hit.nx * col.shell;
    hit.qy += hit.ny * col.shell;
    hit.qz += hit.nz * col.shell;
    return true;
  }
  // In the meridian plane the offset to the profile is (dRho, dY); the true surface normal also leans along the
  // direction of travel by the helix slope, and the true distance shrinks by the same factor.
  const d = Math.sqrt(best);
  if (d < 1e-9 || d >= reach * 1.5) return false;
  const mr = (rho - bq) / d, my = (ly2 - by) / d;
  const slope = helixSlope(col, rel) + (L ? bl * (helixBank(col, rel + 1e-3) - helixBank(col, rel - 1e-3)) * 500 : 0);
  const nphi = (-my * slope) / Math.max(0.3, rho);
  const k = 1 / Math.sqrt(1 + nphi * nphi);
  const dist = d * k;
  if (dist >= reach) return false;
  const nlx = (mr * ux - nphi * uz) * k, nly = my * k, nlz = (mr * uz + nphi * ux) * k;
  const back = dist - col.shell;
  return setHitLocalNormal(col, nlx, nly, nlz, reach - dist, lx - nlx * back, ly - nly * back, lz - nlz * back);
}

export function testCollider(col, px, py, pz, r) {
  if (col.shape === SHAPE_BOX) return testBox(col, px, py, pz, r);
  if (col.shape === SHAPE_CYL) return testCyl(col, px, py, pz, r);
  if (col.shape === SHAPE_HELIX) return testHelix(col, px, py, pz, r);
  return testLathe(col, px, py, pz, r);
}
export { hit as lastHit };

// ---------------------------------------------------------------- world

const CELL = 10;

export class World {
  constructor(colliders) {
    this.colliders = colliders;
    this.kinematic = colliders.filter((c) => c.motion);
    this.grid = new Map();
    this.time = 0;
    for (let i = 0; i < colliders.length; i++) {
      const a = colliders[i].aabb;
      const pad = 1.2;
      const x0 = Math.floor((a[0] - pad) / CELL), x1 = Math.floor((a[3] + pad) / CELL);
      const z0 = Math.floor((a[2] - pad) / CELL), z1 = Math.floor((a[5] + pad) / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const k = x * 73856 + z;
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(i);
        }
      }
    }
    this.empty = [];
  }

  candidates(x, z) {
    return this.grid.get(Math.floor(x / CELL) * 73856 + Math.floor(z / CELL)) || this.empty;
  }

  setTime(t) {
    this.time = t;
    for (const k of this.kinematic) poseAt(k, t);
  }
}

// Per-marble physical state. Stats (speed, mass...) live on the sim's player object; physics only needs
// radius, mass and a few modifiers which the sim copies onto the body.
export function makeBody(id) {
  return {
    id,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    r: 0.5, mass: 1,
    // per-tick control acceleration (already projected and limited by the sim)
    ax: 0, ay: 0, az: 0,
    grounded: false, groundT: 1, gnx: 0, gny: 1, gnz: 0,
    bounce: 0.6, push: 1, wallLoss: 1, gravity: 1,
    ghost: false, active: true, anchored: false, spawnGhost: 0, tp: 0,
    wallHit: false, bumped: 0, bumpSpeed: 0, landSpeed: 0, touchTag: null, boostX: 0, boostY: 0, boostZ: 0,
  };
}

const MAX_CONTACTS = 10;
const cIdx = new Int32Array(MAX_CONTACTS);
const cDepth = new Float64Array(MAX_CONTACTS);

// Resolves one body against the static and kinematic course. Returns nothing; updates the body.
function collideStatic(world, b, h) {
  const list = world.candidates(b.x, b.z);
  const cols = world.colliders;
  let n = 0;
  const r = b.r;
  for (let i = 0; i < list.length; i++) {
    const col = cols[list[i]];
    if (!col.enabled) continue;
    const a = col.aabb;
    if (b.x < a[0] - r || b.x > a[3] + r || b.y < a[1] - r || b.y > a[4] + r || b.z < a[2] - r || b.z > a[5] + r) continue;
    if (!testCollider(col, b.x, b.y, b.z, r)) continue;
    if (col.sensor) {
      sense(col, b);
      continue;
    }
    if (col.tag === 'trigger') continue;
    if (n < MAX_CONTACTS) {
      cIdx[n] = list[i];
      cDepth[n] = hit.depth;
      n++;
    }
  }
  if (n === 0) return;
  // Deepest first, re-testing each after earlier pushes: avoids snagging on seams between coplanar blocks.
  for (let i = 1; i < n; i++) {
    const ci = cIdx[i], cd = cDepth[i];
    let j = i - 1;
    while (j >= 0 && cDepth[j] < cd) {
      cIdx[j + 1] = cIdx[j];
      cDepth[j + 1] = cDepth[j];
      j--;
    }
    cIdx[j + 1] = ci;
    cDepth[j + 1] = cd;
  }
  for (let i = 0; i < n; i++) {
    const col = cols[cIdx[i]];
    if (!testCollider(col, b.x, b.y, b.z, r)) continue;
    const nx = hit.nx, ny = hit.ny, nz = hit.nz;
    b.x += nx * hit.depth;
    b.y += ny * hit.depth;
    b.z += nz * hit.depth;
    // Surface velocity of a moving obstacle at the contact point.
    let sx = 0, sy = 0, sz = 0;
    if (col.motion) {
      const rx = hit.qx - col.px, ry = hit.qy - col.py, rz = hit.qz - col.pz;
      sx = col.vx + col.wy * rz - col.wz * ry;
      sy = col.vy + col.wz * rx - col.wx * rz;
      sz = col.vz + col.wx * ry - col.wy * rx;
    }
    const rvx = b.vx - sx, rvy = b.vy - sy, rvz = b.vz - sz;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    const isGround = ny > 0.55;
    if (vn < 0) {
      const m = col.mat;
      let e = m.bounce;
      if (-vn < 3 && !m.kick) e = 0; // settle instead of jittering when resting
      if (isGround && -vn > b.landSpeed) b.landSpeed = -vn;
      // Tangential friction: marbles roll, so only a little is lost; walls cost more unless the marble is "sticky".
      const tvx = rvx - vn * nx, tvy = rvy - vn * ny, tvz = rvz - vn * nz;
      let keep = isGround ? 1 - m.friction * 0.5 * h : 1 - m.friction * b.wallLoss * Math.min(1, -vn / 6);
      if (keep < 0) keep = 0;
      let out = -vn * e;
      if (m.kick) out = Math.max(out, m.kick);
      b.vx = sx + tvx * keep + nx * out;
      b.vy = sy + tvy * keep + ny * out;
      b.vz = sz + tvz * keep + nz * out;
      if (!isGround && ny < 0.3 && -vn > 2) b.wallHit = true;
    }
    if (isGround) {
      b.grounded = true;
      b.groundT = 0;
      b.gnx = nx; b.gny = ny; b.gnz = nz;
    }
    if (col.boost && (!col.boostCap || b.vx * col.boost[0] + b.vy * col.boost[1] + b.vz * col.boost[2] < col.boostCap * Math.hypot(col.boost[0], col.boost[1], col.boost[2]))) {
      b.boostX = col.boost[0];
      b.boostY = col.boost[1];
      b.boostZ = col.boost[2];
    }
    if (col.tag) b.touchTag = col.tag;
  }
}

// A marble inside a sensor: a launcher sets its velocity outright; a boost sensor pushes like a speed strip.
function sense(col, b) {
  if (col.launch) {
    b.vx = col.launch[0];
    b.vy = col.launch[1];
    b.vz = col.launch[2];
    b.groundT = Math.max(b.groundT, 0.2);
    if (col.tag) b.touchTag = col.tag;
    return;
  }
  const bo = col.boost;
  if (bo && (!col.boostCap || b.vx * bo[0] + b.vy * bo[1] + b.vz * bo[2] < col.boostCap * Math.hypot(bo[0], bo[1], bo[2]))) {
    b.boostX = bo[0];
    b.boostY = bo[1];
    b.boostZ = bo[2];
  }
  if (col.tag) b.touchTag = col.tag;
}

// Marble-marble contacts (O(n^2) with an early-out; 50 bodies is ~1200 cheap checks per substep).
function collideBodies(bodies, events) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const a = bodies[i];
    if (!a.active || a.ghost) continue;
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j];
      if (!b.active || b.ghost) continue;
      const rr = a.r + b.r;
      const dx = b.x - a.x;
      if (dx > rr || dx < -rr) continue;
      const dy = b.y - a.y;
      if (dy > rr || dy < -rr) continue;
      const dz = b.z - a.z;
      if (dz > rr || dz < -rr) continue;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const ma = a.anchored ? a.mass * 8 : a.mass;
      const mb = b.anchored ? b.mass * 8 : b.mass;
      const ia = 1 / ma, ib = 1 / mb;
      const overlap = rr - d;
      const sa = overlap * (ia / (ia + ib)), sb = overlap * (ib / (ia + ib));
      a.x -= nx * sa; a.y -= ny * sa; a.z -= nz * sa;
      b.x += nx * sb; b.y += ny * sb; b.z += nz * sb;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
      if (rv < 0) {
        const e = Math.min(1.1, (a.bounce + b.bounce) * 0.5);
        const j = (-(1 + e) * rv) / (ia + ib);
        // "push" lets a marble shove others harder than physics alone would.
        const ja = j * ia * b.push, jb = j * ib * a.push;
        a.vx -= nx * ja; a.vy -= ny * ja; a.vz -= nz * ja;
        b.vx += nx * jb; b.vy += ny * jb; b.vz += nz * jb;
        if (-rv > 1.5) {
          a.bumped++;
          b.bumped++;
          if (-rv > a.bumpSpeed) a.bumpSpeed = -rv;
          if (-rv > b.bumpSpeed) b.bumpSpeed = -rv;
          if (events) events.push(a.id, b.id, -rv);
        }
      }
    }
  }
}

function integrate(b, h) {
  b.vy -= GRAVITY * b.gravity * h;
  b.vx += (b.ax + b.boostX) * h;
  b.vy += (b.ay + b.boostY) * h;
  b.vz += (b.az + b.boostZ) * h;
  const sp2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
  if (sp2 > MAX_SPEED * MAX_SPEED) {
    const k = MAX_SPEED / Math.sqrt(sp2);
    b.vx *= k; b.vy *= k; b.vz *= k;
  }
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;
}

// Advances the world one tick (SUBSTEPS substeps). `t0` is the stage time at the start of the tick.
// `events`, if given, collects bump pairs as flat [idA, idB, speed, ...].
export function stepWorld(world, bodies, t0, events) {
  for (const b of bodies) {
    if (!b.active) continue;
    b.grounded = false;
    b.wallHit = false;
    b.landSpeed = 0;
    b.touchTag = null;
  }
  for (let s = 0; s < SUBSTEPS; s++) {
    world.setTime(t0 + (s + 1) * SUB_DT);
    for (const b of bodies) {
      if (!b.active) continue;
      integrate(b, SUB_DT);
      b.boostX = b.boostY = b.boostZ = 0;
    }
    collideBodies(bodies, events);
    for (const b of bodies) if (b.active) collideStatic(world, b, SUB_DT);
  }
  for (const b of bodies) {
    if (!b.active) continue;
    if (!b.grounded) b.groundT += TICK_DT;
  }
}

// Steps a single body against the course only, treating `others` as immovable spheres (used by client prediction).
export function stepSingle(world, b, t0, others) {
  b.grounded = false;
  b.wallHit = false;
  b.landSpeed = 0;
  b.touchTag = null;
  for (let s = 0; s < SUBSTEPS; s++) {
    world.setTime(t0 + (s + 1) * SUB_DT);
    integrate(b, SUB_DT);
    b.boostX = b.boostY = b.boostZ = 0;
    if (others && !b.ghost) {
      for (let i = 0; i < others.length; i += 5) {
        const ox = others[i], oy = others[i + 1], oz = others[i + 2], or = others[i + 3], om = others[i + 4];
        const rr = b.r + or;
        const dx = b.x - ox, dy = b.y - oy, dz = b.z - oz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const share = om / (om + b.mass);
        b.x += nx * (rr - d) * share;
        b.y += ny * (rr - d) * share;
        b.z += nz * (rr - d) * share;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < 0) {
          const k = (1 + b.bounce) * share;
          b.vx -= nx * vn * k; b.vy -= ny * vn * k; b.vz -= nz * vn * k;
        }
      }
    }
    collideStatic(world, b, SUB_DT);
  }
  if (!b.grounded) b.groundT += TICK_DT;
}

// Is the point inside an (axis-aligned in collider space) trigger box?
export function insideBox(col, px, py, pz, pad = 0) {
  const R = col.R;
  const dx = px - col.c[0], dy = py - col.c[1], dz = pz - col.c[2];
  const lx = R[0] * dx + R[3] * dy + R[6] * dz;
  const ly = R[1] * dx + R[4] * dy + R[7] * dz;
  const lz = R[2] * dx + R[5] * dy + R[8] * dz;
  return Math.abs(lx) <= col.hx + pad && Math.abs(ly) <= col.hy + pad && Math.abs(lz) <= col.hz + pad;
}
