import {TICK_DT} from './shared/physics.js';
import {BTN_JUMP} from './shared/control.js';

const BRAKE_DECELERATION = 78; // units/s²
const TURN_GRIP = 9; // additional sideways damping per second
const REVERSE_DECELERATION = 60;

export function plantFeet({body, input, ctl}) {
  if (!body.grounded || ((input.btn & BTN_JUMP) && !(ctl.prevBtn & BTN_JUMP))) return;
  const strength = Math.hypot(input.mx, input.mz);
  if (strength < .01) {
    const speed = Math.hypot(body.vx, body.vz);
    if (!speed) return;
    const fraction = Math.max(0, 1 - BRAKE_DECELERATION * TICK_DT / speed);
    body.vx *= fraction;
    body.vz *= fraction;
    return;
  }

  const x = input.mx / strength, z = input.mz / strength;
  const along = body.vx * x + body.vz * z;
  const sideways = body.vx * z - body.vz * x;
  const grip = 1 - Math.exp(-TURN_GRIP * TICK_DT * Math.min(strength, 1));
  const reverseBrake = Math.min(Math.max(0, -along), REVERSE_DECELERATION * TICK_DT);
  body.vx += x * reverseBrake - z * sideways * grip;
  body.vz += z * reverseBrake + x * sideways * grip;
}

export function enableRunnerHandling(show) {
  const simulate = show.simulate.bind(show);
  // Session.tick has already applied the latest queued input when simulate runs.
  show.simulate = frozen => {
    if (!frozen && show.phase === 'race') {
      for (const p of show.players) {
        if (p.human && p.connected && p.alive && p.body.active) plantFeet(p);
      }
    }
    simulate(frozen);
  };
}
