import {downhillDegrees} from '../slide/ground-motion.mjs';
import {TICK_DT} from './shared/physics.js';
import {plantFeet} from './runner-handling.js';

export const slidePieces = stage => stage.pieces.filter(piece =>
  ['shortSlide', 'curvedSlide', 'saturnSlide'].includes(piece.name));

export function applySlideBoost(player, mode) {
  if (mode.sliding && mode.flatTime === 0 && player.body.grounded) {
    player.mods.speed *= 1.75;
    player.mods.accel *= 2.4;
  }
}

// Return the effective input for this simulation step. Keep raw input for the next step.
export function slideInput(player, mode, pieces, path) {
  const {body, input, sampleIdx} = player;
  const speed = Math.hypot(body.vx, body.vz);
  const onSlide = pieces.some(piece => player.s >= piece.s0 && player.s < piece.s1);
  const sliding = mode.update(TICK_DT, {
    grounded:body.grounded, speed, jump:body.groundT > .16, lockSlide:onSlide || body.gny < 0,
    downhill:downhillDegrees(body.gnx, body.gny, body.gnz, body.vx, body.vz)
  });
  if (!sliding) plantFeet(player);
  if (!sliding || !body.grounded) return input;
  if (mode.flatTime > 0) {
    const runSpeed = player.st.topSpeed * Math.min(1, Math.hypot(input.mx, input.mz));
    if (speed > runSpeed) {
      const scale = Math.max(runSpeed, speed - 100 * TICK_DT) / speed;
      body.vx *= scale;
      body.vz *= scale;
    }
    return input;
  }
  const tx = path.tx[sampleIdx], tz = path.tz[sampleIdx];
  const direction = body.gnx * tx + body.gnz * tz < -.02 ? -1 : 1;
  const fx = direction * tx, fz = direction * tz;
  const side = input.mx * fz - input.mz * fx;
  const drive = 1 - .55 * Math.max(0, -input.mx * fx - input.mz * fz);
  return {mx:fx * drive + fz * side * .75, mz:fz * drive - fx * side * .75, btn:input.btn};
}
