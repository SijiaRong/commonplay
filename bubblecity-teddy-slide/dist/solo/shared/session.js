// Runs one show for a set of connected clients: queues their inputs, steps the simulation, and fans out
// events and snapshots. Used by the server's rooms and, in-process, by solo play.
//
// A connection is any object with send(textOrBytes). Seats map a connection to a marble id (or -1 to spectate).

import { Show, PHASE } from './sim.js';
import { encodeBody, encodeSnapshot } from './protocol.js';

const MAX_QUEUE = 8;
const BOARD_EVERY = 15;
const EMOTES = 8;

export class ShowSession {
  // entrants: [{ name, skin, look, loadout, key }] humans first; snapshotEvery: ticks between snapshots
  // startStage: solo-only dev shortcut (?stage=N); plan: a solo Course Builder course. The server passes neither.
  // night: a LIGHTS OUT night show (lighting only: the race is identical), told to every client in the show message.
  constructor({ seed, entrants, snapshotEvery = 3, botLevel = 1, startStage = 0, plan = null, night = false }) {
    this.show = new Show({ seed, entrants, botLevel, startStage, plan });
    this.night = !!night;
    this.snapshotEvery = snapshotEvery;
    this.seats = new Map(); // conn -> { id, queue, lastSeq, ack, emoteT }
    this.over = false;
    this.onOver = null;
  }

  // Seats a connection on marble `id` (or -1 as a spectator) and sends it everything needed to join.
  attach(conn, id) {
    const seat = { id, queue: [], lastSeq: 0, ack: 0, emoteT: 0 };
    this.seats.set(conn, seat);
    const show = this.show;
    if (id >= 0) show.reconnect(id);
    const players = show.players.map((p) => ({ id: p.id, name: p.name, skin: p.skin, look: p.look || null, human: p.human }));
    // A planned course travels with the show so the client builds the same one (absent for every ordinary show).
    conn.send(JSON.stringify({ t: 'show', seed: show.seed, you: id, players, state: show.snapshotState(), ...(show.plan ? { plan: show.plan } : {}), ...(this.night ? { night: 1 } : {}) }));
    const p = show.players[id];
    if (p && p.draft && p.draft.picked < 0 && (show.phase === PHASE.STARTER || show.phase === PHASE.DRAFT)) {
      const d = p.draft;
      const fi = show.fieldInfo || { perks: {} };
      conn.send(JSON.stringify({ t: 'ev', e: 'draft', to: id, round: d.round, options: d.options, need: d.need, picks: d.picks, rerolls: d.rerolls, until: show.phaseEnd, inField: d.options.map((o) => fi.perks[o] || 0) }));
    }
  }

  detach(conn) {
    const seat = this.seats.get(conn);
    if (!seat) return;
    this.seats.delete(conn);
    if (seat.id >= 0) {
      let still = false;
      for (const s of this.seats.values()) if (s.id === seat.id) still = true;
      if (!still) this.show.disconnect(seat.id);
    }
  }

  humansConnected() {
    let n = 0;
    for (const s of this.seats.values()) if (s.id >= 0) n++;
    return n;
  }

  // msg is a parsed JSON object from the client.
  onMessage(conn, msg) {
    const seat = this.seats.get(conn);
    if (!seat) return;
    const show = this.show;
    switch (msg.t) {
      case 'i': {
        if (seat.id < 0 || !Array.isArray(msg.q)) return;
        for (const e of msg.q.slice(0, 6)) {
          if (!Array.isArray(e) || e.length < 4) continue;
          const seq = e[0] >>> 0;
          if (seq <= seat.lastSeq) continue;
          seat.lastSeq = seq;
          seat.queue.push([seq, (e[1] | 0) / 100, (e[2] | 0) / 100, e[3] & 7]);
        }
        if (seat.queue.length > MAX_QUEUE) seat.queue.splice(0, seat.queue.length - 3);
        break;
      }
      case 'pick':
        if (seat.id >= 0) show.choose(seat.id, msg.i | 0);
        break;
      case 'reroll':
        if (seat.id >= 0) show.reroll(seat.id);
        break;
      case 'emote': {
        const k = msg.k | 0;
        if (seat.id < 0 || k < 0 || k >= EMOTES || show.tick < seat.emoteT) return;
        seat.emoteT = show.tick + 45;
        this.broadcast(JSON.stringify({ t: 'emote', id: seat.id, k }));
        break;
      }
      case 'ping':
        conn.send(JSON.stringify({ t: 'pong', c: msg.c, s: show.tick }));
        break;
    }
  }

  broadcast(text) {
    for (const conn of this.seats.keys()) conn.send(text);
  }

  tick() {
    if (this.over) return;
    const show = this.show;
    for (const seat of this.seats.values()) {
      if (seat.id < 0) continue;
      const q = seat.queue;
      if (q.length) {
        // Catch up if the client has run ahead (burst after a stall): skip to the newest few.
        if (q.length > 4) q.splice(0, q.length - 2);
        const [seq, mx, mz, btn] = q.shift();
        show.setInput(seat.id, mx, mz, btn);
        seat.ack = seq;
      }
    }
    show.step();
    // Events.
    for (const e of show.events) {
      if (e.to !== undefined) {
        const text = JSON.stringify({ t: 'ev', ...e });
        for (const [conn, seat] of this.seats) if (seat.id === e.to) conn.send(text);
      } else {
        this.broadcast(JSON.stringify({ t: 'ev', ...e }));
      }
    }
    show.events.length = 0;
    if (show.tick % this.snapshotEvery === 0) {
      const body = encodeBody(show);
      for (const [conn, seat] of this.seats) {
        const p = seat.id >= 0 ? show.players[seat.id] : null;
        conn.send(encodeSnapshot(show, body, p, seat.ack));
      }
    }
    if (show.tick % BOARD_EVERY === 0 && show.stage) {
      const r = show.ranking;
      this.broadcast(JSON.stringify({ t: 'board', r: r.map((p) => p.id), s: r.map((p) => Math.round(p.s)), q: show.qualifiedCount }));
    }
    if (show.phase === PHASE.OVER) {
      this.over = true;
      if (this.onOver) this.onOver();
    }
  }
}
