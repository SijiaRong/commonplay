// Wire format. Control messages are JSON text; the 20 Hz world snapshot is binary:
//
//   u8  kind (1)
//   u32 server tick
//   u32 last input seq processed for the recipient (0 = none)
//   u8  recipient's marble id (255 = spectator)        \
//   f32 x y z vx vy vz of the recipient's marble        |  own block, used for prediction
//   u16 jumpCd abilityCd turbo rocket ghost anchor      |  (timers in ms)
//       headStart groundT spawnGhost                    |
//   u8  airJumps prevBtn rocketPower*50                 |
//   i8  ground normal xyz (*127)                        |
//   u16 mods speed accel (*1000)                        |
//   u16 slick memory (ms), u8 touching a slick surface  /
//   u8  marble count
//   per marble: u8 id, u8 flags, u8 teleport counter, i16 x y z (*40), i16 vx vy vz (*100)

export const PROTOCOL_VERSION = 8;
export const SNAP = 1;
const POS_Q = 40;
const VEL_Q = 100;
const PER_MARBLE = 15;
const OWN_BYTES = 1 + 24 + 18 + 3 + 3 + 4 + 3;
const HEAD = 1 + 4 + 4;

export const MF_ACTIVE = 1;
export const MF_GROUNDED = 2;
export const MF_GHOST = 4;
export const MF_ANCHOR = 8;
export const MF_FINISHED = 16;
export const MF_ROCKET = 32;
export const MF_TURBO = 64;
export const MF_DRAFT = 128;

const clamp16 = (v) => (v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v));
const ms16 = (s) => Math.max(0, Math.min(65535, Math.round(s * 1000)));

// Encodes the part of the snapshot shared by every recipient.
export function encodeBody(show) {
  const players = show.players;
  let n = 0;
  for (const p of players) if (p.alive) n++;
  const buf = new ArrayBuffer(1 + n * PER_MARBLE);
  const dv = new DataView(buf);
  dv.setUint8(0, n);
  let o = 1;
  for (const p of players) {
    if (!p.alive) continue;
    const b = p.body;
    let f = 0;
    if (b.active) f |= MF_ACTIVE;
    if (b.groundT < 0.12) f |= MF_GROUNDED;
    if (b.ghost) f |= MF_GHOST;
    if (b.anchored) f |= MF_ANCHOR;
    if (p.finishOrder >= 0) f |= MF_FINISHED;
    if (p.ctl.rocketT > 0) f |= MF_ROCKET;
    if (p.ctl.turboT > 0 || p.ctl.headStartT > 0) f |= MF_TURBO;
    if (p.drafting && show.tick - p.drafting < 6) f |= MF_DRAFT;
    dv.setUint8(o, p.id);
    dv.setUint8(o + 1, f);
    dv.setUint8(o + 2, b.tp);
    dv.setInt16(o + 3, clamp16(b.x * POS_Q), true);
    dv.setInt16(o + 5, clamp16(b.y * POS_Q), true);
    dv.setInt16(o + 7, clamp16(b.z * POS_Q), true);
    dv.setInt16(o + 9, clamp16(b.vx * VEL_Q), true);
    dv.setInt16(o + 11, clamp16(b.vy * VEL_Q), true);
    dv.setInt16(o + 13, clamp16(b.vz * VEL_Q), true);
    o += PER_MARBLE;
  }
  return new Uint8Array(buf);
}

// Full snapshot for one recipient (player p, or null for a spectator).
export function encodeSnapshot(show, body, p, ackSeq) {
  const out = new Uint8Array(HEAD + OWN_BYTES + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, SNAP);
  dv.setUint32(1, show.tick >>> 0, true);
  dv.setUint32(5, ackSeq >>> 0, true);
  let o = HEAD;
  if (p && p.alive) {
    const b = p.body, c = p.ctl;
    dv.setUint8(o, p.id);
    dv.setFloat32(o + 1, b.x, true);
    dv.setFloat32(o + 5, b.y, true);
    dv.setFloat32(o + 9, b.z, true);
    dv.setFloat32(o + 13, b.vx, true);
    dv.setFloat32(o + 17, b.vy, true);
    dv.setFloat32(o + 21, b.vz, true);
    const t = [c.jumpCdT, c.abilityCdT, c.turboT, c.rocketT, c.ghostT, c.anchorT, c.headStartT, Math.min(b.groundT, 60), Math.max(0, b.spawnGhost)];
    for (let k = 0; k < 9; k++) dv.setUint16(o + 25 + k * 2, ms16(t[k]), true);
    dv.setUint8(o + 43, c.airJumps & 255);
    dv.setUint8(o + 44, c.prevBtn & 255);
    dv.setUint8(o + 45, Math.max(0, Math.min(255, Math.round((c.rocketPower || 1) * 50))));
    dv.setInt8(o + 46, Math.round(b.gnx * 127));
    dv.setInt8(o + 47, Math.round(b.gny * 127));
    dv.setInt8(o + 48, Math.round(b.gnz * 127));
    dv.setUint16(o + 49, Math.round(p.mods.speed * 1000), true);
    dv.setUint16(o + 51, Math.round(p.mods.accel * 1000), true);
    dv.setUint16(o + 53, ms16(c.slickT || 0), true);
    dv.setUint8(o + 55, b.touchTag === 'slick' ? 1 : 0);
  } else {
    dv.setUint8(o, 255);
  }
  out.set(body, HEAD + OWN_BYTES);
  return out;
}

// Decodes a snapshot into { tick, ack, own, marbles: [{id, flags, tp, x, y, z, vx, vy, vz}] }.
export function decodeSnapshot(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  if (dv.getUint8(0) !== SNAP) return null;
  const tick = dv.getUint32(1, true);
  const ack = dv.getUint32(5, true);
  let o = HEAD;
  let own = null;
  const oid = dv.getUint8(o);
  if (oid !== 255) {
    const t = [];
    for (let k = 0; k < 9; k++) t.push(dv.getUint16(o + 25 + k * 2, true) / 1000);
    own = {
      id: oid,
      x: dv.getFloat32(o + 1, true), y: dv.getFloat32(o + 5, true), z: dv.getFloat32(o + 9, true),
      vx: dv.getFloat32(o + 13, true), vy: dv.getFloat32(o + 17, true), vz: dv.getFloat32(o + 21, true),
      jumpCdT: t[0], abilityCdT: t[1], turboT: t[2], rocketT: t[3], ghostT: t[4], anchorT: t[5], headStartT: t[6], groundT: t[7], spawnGhost: t[8],
      airJumps: dv.getUint8(o + 43), prevBtn: dv.getUint8(o + 44), rocketPower: dv.getUint8(o + 45) / 50,
      gnx: dv.getInt8(o + 46) / 127, gny: dv.getInt8(o + 47) / 127, gnz: dv.getInt8(o + 48) / 127,
      modSpeed: dv.getUint16(o + 49, true) / 1000, modAccel: dv.getUint16(o + 51, true) / 1000,
      slickT: dv.getUint16(o + 53, true) / 1000, touchSlick: dv.getUint8(o + 55) === 1,
    };
  }
  o = HEAD + OWN_BYTES;
  const n = dv.getUint8(o);
  o++;
  const marbles = new Array(n);
  for (let i = 0; i < n; i++) {
    marbles[i] = {
      id: dv.getUint8(o),
      flags: dv.getUint8(o + 1),
      tp: dv.getUint8(o + 2),
      x: dv.getInt16(o + 3, true) / POS_Q,
      y: dv.getInt16(o + 5, true) / POS_Q,
      z: dv.getInt16(o + 7, true) / POS_Q,
      vx: dv.getInt16(o + 9, true) / VEL_Q,
      vy: dv.getInt16(o + 11, true) / VEL_Q,
      vz: dv.getInt16(o + 13, true) / VEL_Q,
    };
    o += PER_MARBLE;
  }
  return { tick, ack, own, marbles };
}
