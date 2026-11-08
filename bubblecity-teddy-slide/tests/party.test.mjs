import test from 'node:test';
import assert from 'node:assert/strict';
import {PartySession} from '../../teddy-playground/dist/solo/party.js';
import {CityPartyShow} from '../dist/solo/city-party.js';

test('two seats use independent inputs and slide states on the city Saturn stage', () => {
  const session = new PartySession({
    ShowClass:CityPartyShow, seed:20261108, entrants:[{name:'A'}, {name:'B'}]
  });
  session.start();
  const {show} = session;
  show.startStage(1);
  show.startRace();
  const {path, pieces} = show.stage;
  const slide = pieces.find(p => p.name === 'saturnSlide');
  const entry = path.s.findIndex(s => s >= slide.s0 - 6);
  const [rider, guest] = show.players;
  rider.s = path.s[entry];
  rider.sampleIdx = entry;
  Object.assign(rider.body, {x:path.x[entry], y:path.y[entry]+rider.body.r+.05, z:path.z[entry]});
  let seenSliding = false;
  for (let tick=0; tick<1200 && rider.finishOrder<0; tick++) {
    const target = Math.min(rider.sampleIdx+4, path.n-1);
    const dx=path.x[target]-rider.body.x, dz=path.z[target]-rider.body.z;
    const distance=Math.hypot(dx,dz)||1;
    session.controls(0, dx/distance, dz/distance, 0);
    session.step();
    const {runners} = session.snapshot(1);
    if (runners[0][8] & 16) seenSliding=true;
    assert.equal(runners[1][8] & 16, 0);
  }
  assert.ok(seenSliding);
  assert.equal(rider.finishOrder, 0);
  assert.equal(guest.finishOrder, -1);
});
