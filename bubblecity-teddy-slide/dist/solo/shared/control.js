// Turns one tick of player input into forces on a marble body. Shared by the authoritative simulation and the
// client's prediction of its own marble, so both agree on how a marble handles.
//
// input: { mx, mz, btn }  mx/mz = desired world-space direction (length <= 1); btn bits below
// ctl:   per-marble control state (cooldowns, timers); mutated
// st:    stats from cards.computeStats()
// mods:  { speed, accel } situational multipliers decided by the sim (rank perks, slipstream, momentum)

import { TICK_DT } from './physics.js';

export const BTN_JUMP = 1;
export const BTN_ABILITY = 2;
export const BTN_RESPAWN = 4;

// Lacquered surfaces (THE BOWL, collider tag 'slick'): less grip and less control push, so killing an orbit takes
// skill. Contact is last tick's (control runs before physics); `memory` bridges the small hops of a bumpy ride.
export const SLICK = { grip: 0.1, accel: 0.2, memory: 0.2 };

export function makeCtl() {
  return {
    jumpCdT: 0, airJumps: 0, prevBtn: 0, abilityCdT: 0,
    turboT: 0, rocketT: 0, rocketPower: 1, ghostT: 0, anchorT: 0, headStartT: 0, justJumped: 0, slickT: 0,
  };
}

// Copies the fields prediction needs (used to snapshot/restore control state).
export function copyCtl(dst, src) {
  dst.jumpCdT = src.jumpCdT;
  dst.airJumps = src.airJumps;
  dst.prevBtn = src.prevBtn;
  dst.abilityCdT = src.abilityCdT;
  dst.turboT = src.turboT;
  dst.rocketT = src.rocketT;
  dst.rocketPower = src.rocketPower;
  dst.ghostT = src.ghostT;
  dst.anchorT = src.anchorT;
  dst.headStartT = src.headStartT;
  dst.slickT = src.slickT || 0;
  return dst;
}

const IDLE = { mx: 0, mz: 0, btn: 0 };

// Applies control for one tick. `frozen` (countdown) ignores movement. Returns the name of an ability fired
// this tick (or null) so the sim can apply its world effects (shockwave, warp).
export function controlStep(body, ctl, input, st, mods, frozen = false) {
  const dt = TICK_DT;
  const inp = frozen ? IDLE : input || IDLE;
  const btn = inp.btn | 0;
  const pressed = btn & ~ctl.prevBtn;
  ctl.prevBtn = btn;

  ctl.jumpCdT = Math.max(0, ctl.jumpCdT - dt);
  ctl.abilityCdT = Math.max(0, ctl.abilityCdT - dt);
  ctl.turboT = Math.max(0, ctl.turboT - dt);
  ctl.rocketT = Math.max(0, ctl.rocketT - dt);
  ctl.ghostT = Math.max(0, ctl.ghostT - dt);
  ctl.anchorT = Math.max(0, ctl.anchorT - dt);
  if (!frozen) ctl.headStartT = Math.max(0, ctl.headStartT - dt);
  ctl.slickT = body.touchTag === 'slick' ? SLICK.memory : Math.max(0, (ctl.slickT || 0) - dt);
  const slick = ctl.slickT > 0;
  body.ghost = ctl.ghostT > 0 || body.spawnGhost > 0;
  body.anchored = ctl.anchorT > 0;

  let mx = Number.isFinite(inp.mx) ? inp.mx : 0;
  let mz = Number.isFinite(inp.mz) ? inp.mz : 0;
  let mag = Math.hypot(mx, mz);
  if (mag > 1) {
    mx /= mag;
    mz /= mag;
    mag = 1;
  }
  const dx = mag > 1e-4 ? mx / mag : 0;
  const dz = mag > 1e-4 ? mz / mag : 0;

  const grounded = body.groundT < 0.12;
  let top = st.topSpeed * (mods ? mods.speed : 1);
  let acc = st.accel * (mods ? mods.accel : 1);
  if (ctl.headStartT > 0) {
    top *= 1.35;
    acc *= 1.4;
  }
  if (ctl.turboT > 0) top *= 1.45;
  if (!grounded) acc *= st.airControl;
  if (slick) acc *= SLICK.accel;

  const along = body.vx * dx + body.vz * dz;
  let lim = (top - along) / (top * 0.25);
  lim = lim < 0 ? 0 : lim > 1 ? 1 : lim;
  let ax = dx * acc * mag * lim, ay = 0, az = dz * acc * mag * lim;

  if (ctl.rocketT > 0) {
    // Thrust along the stick, or along the current heading when the stick is idle.
    let tx = dx, tz = dz;
    if (mag < 0.2) {
      const h = Math.hypot(body.vx, body.vz) || 1;
      tx = body.vx / h;
      tz = body.vz / h;
    }
    const thrust = 42 * (ctl.rocketPower || 1);
    ax += tx * thrust;
    az += tz * thrust;
  }

  if (grounded) {
    // Keep the push in the ground plane so it doesn't press into slopes.
    const d = ax * body.gnx + ay * body.gny + az * body.gnz;
    ax -= body.gnx * d;
    ay -= body.gny * d;
    az -= body.gnz * d;
    if (mag > 0.15 && !frozen) {
      // Grip: bleed sideways drift while steering, handing some of it back as forward speed.
      const px = body.vx - along * dx, pz = body.vz - along * dz;
      const k = Math.min(1, st.grip * (slick ? SLICK.grip : 1) * dt * mag);
      const perp = Math.hypot(px, pz);
      body.vx -= px * k;
      body.vz -= pz * k;
      if (along > -2 && along < top) {
        body.vx += dx * perp * k * 0.55;
        body.vz += dz * perp * k * 0.55;
      }
    }
  }
  const drag = 1 - st.drag * dt;
  body.vx *= drag;
  body.vz *= drag;
  body.ax = ax;
  body.ay = ay;
  body.az = az;

  if (frozen) return null;

  // Jump (press edge).
  if (pressed & BTN_JUMP) {
    if (grounded && ctl.jumpCdT <= 0) {
      let jx = body.gnx, jy = body.gny + 1, jz = body.gnz;
      const l = Math.hypot(jx, jy, jz);
      jx /= l; jy /= l; jz /= l;
      const vn = body.vx * jx + body.vy * jy + body.vz * jz;
      if (vn < 0) {
        body.vx -= jx * vn;
        body.vy -= jy * vn;
        body.vz -= jz * vn;
      }
      body.vx += jx * st.jump;
      body.vy += jy * st.jump;
      body.vz += jz * st.jump;
      body.groundT = 0.2;
      ctl.jumpCdT = st.jumpCd;
      ctl.airJumps = st.doubleJump | 0;
      ctl.justJumped = 1;
    } else if (!grounded && ctl.airJumps > 0) {
      ctl.airJumps--;
      body.vy = Math.max(body.vy, 0) + st.jump * 0.85;
      ctl.justJumped = 2;
    }
  }

  // Active ability (press edge).
  let fired = null;
  const act = st.active;
  if (act && pressed & BTN_ABILITY && ctl.abilityCdT <= 0) {
    fired = act.id;
    ctl.abilityCdT = act.cd;
    const p = act.power;
    let hx = dx, hz = dz;
    if (mag < 0.2) {
      const h = Math.hypot(body.vx, body.vz);
      hx = h > 0.5 ? body.vx / h : 0;
      hz = h > 0.5 ? body.vz / h : 0;
    }
    switch (act.id) {
      case 'turbo':
        body.vx += hx * 13 * p;
        body.vz += hz * 13 * p;
        ctl.turboT = 0.8;
        break;
      case 'rocket':
        ctl.rocketT = 1.4;
        ctl.rocketPower = p;
        break;
      case 'pogo':
        body.vy = Math.max(body.vy, 0) + 17.5 * Math.min(1.25, p);
        body.groundT = 0.3;
        break;
      case 'ghost':
        ctl.ghostT = 2.6 * p;
        break;
      case 'anchor':
        ctl.anchorT = 3 * p;
        break;
      default:
        break; // shockwave and warp are applied by the sim
    }
  }
  body.ghost = ctl.ghostT > 0 || body.spawnGhost > 0;
  body.anchored = ctl.anchorT > 0;
  return fired;
}
