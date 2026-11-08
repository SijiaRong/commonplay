import {Show,PHASE,DUR} from './shared/sim.js';
import {TICK_DT,stepWorld} from './shared/physics.js';
import {BTN_JUMP,controlStep} from './shared/control.js';
import {CARD_BY_ID} from './shared/cards.js';
import {makeRng} from './shared/rng.js';
import {enableRunnerHandling,plantFeet} from './runner-handling.js';

// A points race for 1–16 runners on the teddy course. Everyone runs all five stages: nobody is cut.
// Each stage scores by finishing order, the final counts double, and the podium ranks the totals.
// Runs unchanged in the browser worker (solo) and in the Node room server (party).

export const MAX_FIELD = 16;
export const HUMAN_DECK = ['polish','rubber','spring','gyro','feather','grip','turbo','headstart','aero','tailwind','recovery','double','pogo','momentum','rocket','slingshot'];
const STAGE_GRACE = 30; // seconds a stage keeps running after the first person finishes
const SETTLE = 4; // seconds for close bots once every person is in
const ROW_GAP = 1.5;
const BOT_NAMES = ['棉花糖','小饼干','跳跳豆','布丁','麻薯','汤圆','奶糖','果冻','豆包','小番茄','泡芙','可颂','芝麻','花卷','糯米','橘子'];

// Finishing order 0 is first. Unfinished runners score nothing.
export function stagePoints(order, racers, final) {
  if (order < 0) return 0;
  const base = Math.max(1, racers - order) + (order === 0 ? 2 : order === 1 ? 1 : 0);
  return final ? base * 2 : base;
}

export const withPartyRules = BaseShow => class PartyShow extends BaseShow {
  constructor(options) {
    super(options);
    this.untimed = options.untimed;
    for (const p of this.players) {
      p.score = 0;
      p.stagePoints = [];
      p.finishTimes = [];
      p.trapZone = null;
    }
  }

  // Every stage was laid out for the original cut-down field (the final has ten slots). Extra runners line up
  // in rows behind, centre slots first. The start platform faces +Z in stage space.
  slots(st) {
    const grid = st.grid.map((g, i) => ({g, i, row: Math.floor(i / 10)}));
    const center = grid.slice(0, Math.min(10, grid.length)).reduce((sum, s) => sum + s.g[0], 0) / Math.min(10, grid.length);
    grid.sort((a, b) => a.row - b.row || Math.abs(a.g[0] - center) - Math.abs(b.g[0] - center) || a.i - b.i);
    const slots = grid.map(s => s.g);
    for (let k = slots.length; k < this.players.length; k++) {
      const [x, y, z] = slots[k % 10];
      slots.push([x + .44, y, z - ROW_GAP * Math.floor(k / 10) * (grid.length >= 20 ? 2 : 1)]);
    }
    return slots;
  }

  startDraft(round) {
    super.startDraft(round);
    if (round === 0) return;
    // Between stages every human is handed a random perk from their offer; the reveal shows for two seconds.
    for (const player of this.players) {
      if (!player.human || !player.draft) continue;
      const rng = makeRng(crypto.getRandomValues(new Uint32Array(1))[0]);
      this.choose(player.id, rng.int(0, player.draft.options.length - 1));
    }
    this.phaseEnd = this.tick + Math.round(2 / TICK_DT);
  }

  startStage(index) {
    super.startStage(index);
    const st = this.stage, slots = this.slots(st);
    this.gridOrder().forEach((player, slot) => {
      player.trapZone = null;
      player.finishingRun = false;
      const body = player.body, g = slots[slot];
      body.x = g[0]; body.y = g[1] + body.r - .5; body.z = g[2];
      player.ctl.headStartT = 0;
    });
  }

  gridOrder() {
    // The previous stage's points order leads the next grid.
    if (!this.lastOrder) return super.gridOrder();
    const order = this.lastOrder.map(id => this.players[id]);
    for (const p of this.players) if (!order.includes(p)) order.push(p);
    return order;
  }

  quota() {
    return this.players.length;
  }

  startRace() {
    super.startRace();
    this.endAt = Infinity;
    if (this.untimed) this.phaseEnd = Infinity;
  }

  // Bots never hurry people: the countdown starts when the first person finishes, and the stage wraps up
  // a few seconds after the last person is in.
  checkRaceEnd() {
    const people = this.players.filter(p => p.human && p.connected);
    const peopleIn = people.filter(p => p.finishOrder >= 0).length;
    if (peopleIn && this.endAt === Infinity && !this.untimed) this.endAt = this.tick + STAGE_GRACE / TICK_DT;
    if (people.length && peopleIn === people.length) this.endAt = Math.min(this.endAt, this.tick + SETTLE / TICK_DT);
    const allIn = this.players.every(p => p.finishOrder >= 0);
    if (allIn || this.tick >= (Number.isFinite(this.endAt) ? this.endAt : this.phaseEnd)) this.scoreStage();
  }

  scoreStage() {
    this.updateRanking();
    const final = this.stage.final, n = this.players.length;
    const awards = [];
    for (const p of this.ranking) {
      const points = stagePoints(p.finishOrder, n, final);
      p.score += points;
      p.stagePoints[this.stageIndex] = points;
      p.finishTimes[this.stageIndex] = p.finishOrder >= 0 ? (p.finishTick - this.raceTick) * TICK_DT : null;
      if (p.finishOrder >= 0) p.stats.stagesCleared++;
      awards.push([p.id, points, p.finishOrder]);
    }
    this.lastOrder = this.standings().map(p => p.id);
    this.emit({e: 'scores', stage: this.stageIndex, awards});
    if (final) {
      this.standings().forEach((p, i) => (p.place = i + 1));
      this.setPhase(PHASE.PODIUM, DUR.podium);
      this.emit({e: 'results', results: this.results()});
    } else this.setPhase(PHASE.CUT, this.players.length > 1 ? 6 : DUR.cut); // time to read the stage scores
  }

  // Totals first; a tie goes to whoever placed better in the latest stage, then on progress.
  standings() {
    const order = p => p.finishOrder >= 0 ? p.finishOrder : 1000 + (p.rank ?? 999);
    return this.players.slice().sort((a, b) => b.score - a.score || order(a) - order(b) || a.id - b.id);
  }

  track(player) {
    super.track(player);
    const {path, trapZones} = this.stage;
    if (!trapZones?.length) return;
    const i = player.sampleIdx, body = player.body;
    const zone = player.trapZone ?? trapZones.find(z => i >= z.first && i <= z.last);
    if (!zone) return;
    player.trapZone = zone;
    const anchor = zone.checkpoint;
    const forward = (body.x - path.x[anchor]) * path.tx[anchor] + (body.z - path.z[anchor]) * path.tz[anchor];
    const distance = path.s[anchor] + forward;
    const slope = (path.y[zone.exit] - path.y[anchor]) / (path.s[zone.exit] - path.s[anchor]);
    const surface = path.y[anchor] + forward * slope;
    // A lowering tile can still report ground contact below the normal deck.
    if (body.y < surface - 1) {
      this.respawnAfterFall(player);
      return;
    }
    const onDeck = body.grounded && body.touchTag !== 'trap' && Math.abs(body.y - body.r - path.y[i]) < .65;
    if (onDeck && (distance >= path.s[zone.exit] + body.r || distance < path.s[zone.first] - body.r)) player.trapZone = null;
  }

  atFinish(player) {
    const {bowl, finish, penHeading, path} = this.stage;
    if (bowl && bowl.finishInDrain !== false) return super.atFinish(player);
    if (bowl && !player.passedDrain) return false;
    const b = player.body, dx = b.x - finish.c[0], dz = b.z - finish.c[2];
    const fx = Math.sin(penHeading), fz = Math.cos(penHeading);
    const forward = dx * fx + dz * fz, side = dx * fz - dz * fx;
    // Use the painted stripe's center plane even when a high jump clears the arch.
    return player.s >= path.finishS - 4 && b.y >= path.y[path.n - 1] - .2 &&
      forward >= 0 && forward <= path.length - path.finishS && Math.abs(side) <= finish.hx;
  }

  qualify(player) {
    const {finish, penHeading, bowl, penCenter, path} = this.stage, b = player.body;
    const finishInDrain = bowl && bowl.finishInDrain !== false;
    if (!finishInDrain && player.human) {
      const fx = Math.sin(penHeading), fz = Math.cos(penHeading);
      const beyond = (b.x - finish.c[0]) * fx + (b.z - finish.c[2]) * fz;
      // Carry a humanoid runner clear of the 1.6-unit stripe before it stops to celebrate.
      if (beyond < 3) {
        player.finishingRun = true;
        const speed = Math.max(6, b.vx * fx + b.vz * fz);
        b.vx = fx * speed; b.vz = fz * speed;
        return;
      }
    }
    player.finishingRun = false;
    super.qualify(player);
    b.vx = b.vz = 0;
    if (finishInDrain) {
      // The finish trigger is inside the drain. Celebrate on its exit platform, spread out by finishing order.
      const k = player.finishOrder, j = k % 5, side = ((j + 1) >> 1) * (j % 2 ? 1 : -1) * 1.4, back = Math.floor(k / 5) * 1.4;
      const fx = Math.sin(penHeading), fz = Math.cos(penHeading);
      b.x = penCenter[0] + fz * side - fx * back; b.z = penCenter[2] - fx * side - fz * back;
      b.y = path.y[path.n - 1] + b.r; b.vy = 0;
      player.sampleIdx = path.n - 1;
      b.tp = (b.tp + 1) & 255;
    }
  }

  simulate(frozen) {
    if (!(frozen && (this.phase === PHASE.INTRO || this.phase === PHASE.COUNTDOWN))) return super.simulate(frozen);
    // Behind the gate runners may walk and hop about the start platform.
    const st = this.stage, gate = st.colliders[st.gate], path = st.path;
    for (const p of this.players) {
      const input = p.human && p.connected ? {...p.input, btn: p.input.btn & BTN_JUMP} : {mx: 0, mz: 0, btn: 0};
      plantFeet({...p, input});
      controlStep(p.body, p.ctl, input, p.st, null);
    }
    stepWorld(this.world, this.bodies, this.stageTime() - TICK_DT);
    for (const p of this.players) {
      const b = p.body, half = path.hw[0] - b.r;
      const x = Math.max(gate.c[0] - half, Math.min(gate.c[0] + half, b.x));
      const z = Math.min(gate.c[2] - gate.hz - b.r, b.z);
      if (x !== b.x) { b.x = x; b.vx = 0; }
      if (z !== b.z) { b.z = z; b.vz = 0; }
    }
  }
}

const PartyShow = withPartyRules(Show);

// entrants: [{name, character}] humans in seat order. bots: extra AI runners. untimed: a lone human with no
// bots may stop anywhere to look around (the original solo validation mode).
export class PartySession {
  // pool: character ids bots may wear.
  constructor({seed, entrants, bots = 0, pool = [], ShowClass = PartyShow}) {
    const humans = entrants.slice(0, MAX_FIELD);
    const fieldSize = Math.min(MAX_FIELD, humans.length + Math.max(0, bots | 0));
    this.characters = [];
    this.show = new ShowClass({
      seed, fieldSize, untimed: fieldSize === 1,
      entrants: humans.map(e => ({name: e.name, loadout: {deck: HUMAN_DECK}})),
    });
    enableRunnerHandling(this.show);
    // Bots get a friendly name and wear one of the playable characters so the field looks like a party.
    const rng = makeRng(seed ^ 0x51ed270b), names = rng.shuffle(BOT_NAMES.slice()), taken = new Set(humans.map(h => h.name));
    this.show.players.forEach((p, i) => {
      if (p.human) { this.characters[i] = humans[i].character || null; return; }
      p.name = names.find(n => !taken.has(n)) || p.name; taken.add(p.name);
      this.characters[i] = pool.length ? pool[rng.int(0, pool.length - 1)] : null;
    });
    this.running = false;
    this.inputs = this.show.players.map(() => ({x: 0, z: 0, btn: 0}));
    this.edges = this.show.players.map(() => 0);
    this.starters = [];
  }

  get humans() {
    return this.show.players.filter(p => p.human);
  }

  start() {
    const show = this.show;
    if (this.running || show.phase !== PHASE.STARTER) return;
    // Humans are dealt three starting perks (at most one active); bots draft their own.
    for (const p of this.humans) {
      const rng = makeRng(crypto.getRandomValues(new Uint32Array(1))[0]);
      const picks = [];
      let hasActive = false;
      for (const id of rng.shuffle([...p.loadout.deck])) {
        const active = CARD_BY_ID[id].kind === 'active';
        if (active && hasActive) continue;
        picks.push(id);
        hasActive ||= active;
        if (picks.length === p.draft.need) break;
      }
      p.draft.options = picks;
      picks.forEach((_, index) => show.choose(p.id, index));
      this.starters[p.id] = picks;
    }
    show.finishDraft();
    show.startStage(0);
    this.running = true;
  }

  controls(id, x, z, btn) {
    if (!this.inputs[id]) return;
    x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    z = Number.isFinite(z) ? Math.max(-1, Math.min(1, z)) : 0;
    btn = btn & 7;
    this.edges[id] |= btn & ~this.inputs[id].btn;
    this.inputs[id] = {x, z, btn};
  }

  disconnect(id) {
    this.show.disconnect(id);
    this.inputs[id] = {x: 0, z: 0, btn: 0};
  }

  reconnect(id) {
    const p = this.show.players[id];
    if (!p) return;
    this.show.reconnect(id);
    if (p.human) p.ai = null;
  }

  step() {
    if (!this.running) return;
    const show = this.show;
    for (const p of this.humans) {
      if (show.phase === 'race' && p.connected) p.progT = p.stuckT = 0; // a person may stop to look around
      const input = this.inputs[p.id];
      if (p.finishingRun) {
        const heading = show.stage.penHeading;
        show.setInput(p.id, Math.sin(heading), Math.cos(heading), 0);
      } else if (p.connected) show.setInput(p.id, input.x, input.z, input.btn | this.edges[p.id]);
      this.edges[p.id] = 0;
    }
    show.step();
    if (show.phase === PHASE.OVER) this.running = false;
  }

  // Shared world state, then the viewer's own block. Positions are rounded: this goes out 30 times a second.
  snapshot(you) {
    const s = this.show, stage = s.stage || s.stages[0], started = !!s.stage;
    const r2 = v => Math.round(v * 100) / 100;
    const standings = s.standings();
    const runners = !started ? [] : s.players.map(p => {
      const b = p.body;
      return [p.id, r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.tp,
        (b.groundT < .1 ? 1 : 0) | (b.active ? 2 : 0) | (p.finishOrder >= 0 ? 4 : 0) | (p.connected ? 8 : 0),
        p.sampleIdx ?? 0, Math.round(p.s * 10) / 10, r2(b.gnx), r2(b.gny), r2(b.gnz), r2(b.r)];
    });
    const state = {
      phase: this.running || s.phase === 'over' ? s.phase : 'ready', tick: s.tick, stage: stage.index,
      clock: started ? s.stageTime() : 0, seconds: (s.tick - s.raceTick) / 60,
      gateSeconds: s.phase === 'intro' ? Math.ceil((s.phaseEnd - s.tick) / 60) + DUR.countdown :
        s.phase === 'countdown' ? Math.ceil((s.phaseEnd - s.tick) / 60) : null,
      remaining: Number.isFinite(s.phaseEnd) ? Math.max(0, Math.ceil((s.phaseEnd - s.tick) / 60)) : null,
      graceLeft: s.phase === 'race' && Number.isFinite(s.endAt) ? Math.max(0, Math.ceil((s.endAt - s.tick) / 60)) : null,
      runners,
      board: standings.map(p => [p.id, p.score, p.finishOrder, p.stagePoints[s.stageIndex] ?? null]),
      live: (s.ranking || []).map(p => p.id),
    };
    const me = s.players[you];
    if (me) {
      state.you = you;
      state.ability = me.st.active?.id || '';
      state.awarded = s.phase === 'draft' && me.draft ? [me.draft.options[me.draft.picked]] :
        stage.index === 0 && s.phase === 'intro' ? this.starters[you] || null : null;
      if (!started) [state.spawnX, state.spawnY, state.spawnZ] = slotsFor(s, stage, you);
    }
    return state;
  }

  roster() {
    return this.show.players.map((p, i) => ({id: p.id, name: p.name, human: p.human, character: this.characters[i]}));
  }
}

function slotsFor(show, stage, id) {
  const slots = show.slots(stage);
  return slots[Math.min(id, slots.length - 1)];
}
