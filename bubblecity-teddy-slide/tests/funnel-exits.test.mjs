import assert from 'node:assert/strict';
import test from 'node:test';
import {SoloSession} from '../dist/solo/backend.js';

function dropIntoDrain(index) {
  const session = new SoloSession(20261108);
  session.running = true;
  const show = session.show;
  show.finishDraft();
  show.startStage(index);
  show.startRace();
  const player = show.players[0];
  const funnel = show.stage.bowl ?? show.stage.whirl;
  player.s = funnel.drainS;
  Object.assign(player.body, {
    x: funnel.c[0], y: funnel.c[1] + funnel.yd - 1, z: funnel.c[2],
    vx: 0, vy: -2, vz: 0,
  });
  return {session, show, player, funnel};
}

function land({session, show, player}) {
  for (let tick = 0; tick < 100; tick++) {
    session.step();
    assert.equal(show.phase, 'race');
    assert.ok(player.body.active);
    if (player.body.grounded) return;
  }
  assert.fail('Runner should land below the funnel');
}

for (const seed of [20261108, 12, 73]) {
  test(`stage two follows the Saturn slide into the checkpoint (seed ${seed})`, () => {
    const session = new SoloSession(seed);
    session.running = true;
    const {show} = session;
    show.finishDraft();
    show.startStage(1);
    show.startRace();
    const {stage} = show;
    const {path} = stage;
    const slide = stage.pieces.find(p => p.name === 'saturnSlide');
    assert.ok(slide && !stage.bowl);
    const rider = show.players[0];
    const entry = path.s.findIndex(s => s >= slide.s0 - 6);
    rider.s = path.s[entry];
    rider.sampleIdx = entry;
    Object.assign(rider.body, {x: path.x[entry], y: path.y[entry] + rider.body.r + .05, z: path.z[entry]});
    const initialTeleport = rider.body.tp;
    let slid = false;
    for (let tick = 0; tick < 1200 && rider.finishOrder < 0; tick++) {
      const target = Math.min(rider.sampleIdx + 4, path.n - 1);
      const dx = path.x[target] - rider.body.x, dz = path.z[target] - rider.body.z;
      const d = Math.hypot(dx, dz) || 1;
      session.controls(dx / d, dz / d, 0);
      session.step();
      if (rider.s > slide.s0 && rider.s < slide.s1 && show.slideMode.sliding) slid = true;
      assert.equal(rider.body.tp, initialTeleport, 'no respawn or teleport');
    }
    assert.ok(slid, 'runner enters sliding motion in the turn');
    assert.equal(rider.finishOrder, 0, `stopped at ${rider.s}, finish ${path.finishS}`);
    assert.ok(rider.s >= path.finishS);
  });
}

test('stage three has camera clearance on the landing and a playable exit', () => {
  const run = dropIntoDrain(2);
  const {session, player, funnel} = run;
  land(run);
  const throatBottom = funnel.c[1] + funnel.yd - funnel.throat;
  assert.ok(throatBottom - player.body.y > Math.hypot(6.6, 3.05));
  session.controls(funnel.fwd[0], funnel.fwd[2], 0);
  for (let tick = 0; tick < 180 && player.s < funnel.drainS + 16; tick++) session.step();
  assert.ok(player.s >= funnel.drainS + 16);
  assert.equal(player.finishOrder, -1);
});
