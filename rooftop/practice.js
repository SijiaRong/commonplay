import {enableRunnerHandling} from './runner-handling.js';
// Keep the live controller, collisions and network snapshots while practicing on one fixed course.
import {ShowSession} from '../.local/lost-marbles/public/shared/session.js';
import {randomInt} from 'node:crypto';

export class PracticeSession extends ShowSession {
  constructor(seed = randomInt(0x100000000)) {
    super({seed, entrants:[]});
    const show = this.show;
    enableRunnerHandling(show);
    show.players = [];
    show.bodies = [];
    show.startStage(0);
    show.startRace();
    show.phaseEnd = 0;
    show.events.length = 0;
    show.checkRaceEnd = () => {};
    show.qualify = p => {
      p.s = p.safeS = -1;
      show.queueRespawn(p, .15);
    };
  }

  join(ws, name) {
    const show = this.show;
    const free = show.players.findIndex(p => !p.alive);
    const id = free < 0 ? show.players.length : free;
    const p = show.makePlayer(id,name,0,false,null,null,1);
    show.players[id] = p;
    show.bodies[id] = p.body;
    const row = Math.floor(id / 10);
    const [x,y,z] = show.stage.grid[row * 10 + (id % 10 + 5) % 10];
    Object.assign(p.body,{x,y,z,active:true,r:p.st.radius,mass:p.st.mass,bounce:p.st.bounce,
      push:p.st.push,wallLoss:p.st.wallLoss,gravity:p.st.gravity});
    p.safeS = p.s = -1;
    this.attach(ws,id);
  }

  detach(ws) {
    const seat = this.seats.get(ws);
    if (!seat) return;
    this.seats.delete(ws);
    const p = this.show.players[seat.id];
    p.alive = p.body.active = false;
  }

  tick() {
    // A tester may pause to inspect a landing or practice turning in place.
    for (const p of this.show.players) p.progT = p.stuckT = 0;
    super.tick();
  }
}
