// The authoritative show: 50 marbles, five stages, a cut of ten at every checkpoint and a perk draft for the
// survivors (perks are "cards" in the code). Runs on the server (one per room) and in the browser for solo play. Pure logic: no I/O.
//
// Flow:  starter draft -> [intro -> countdown -> race -> cut -> draft] x4 -> intro -> countdown -> final -> podium
// Call tick() 60 times a second. Read show.events (drained by the caller) for things clients need to hear.

import {
  buildShow, respawnSample, nearestSample, sampleAt, F_JUMP, F_RISKY, F_TURN, F_BOOST, F_LOOP, F_BANK, F_PIPE, STAGE_COUNT, FIELD_SIZE, CUT_PER_STAGE,
  bowlS, bowlHeightAt, whirlS, dishHeightAt, normalizePlan,
} from './course.js';
import { World, makeBody, stepWorld, insideBox, TICK_HZ, TICK_DT } from './physics.js';
import { computeStats, drawOffer, botScore, sanitizeLoadout, CARD_BY_ID, STARTER_CARDS, CARDS, STARTER_OFFER, STARTER_PICKS } from './cards.js';
import { controlStep, makeCtl, BTN_JUMP, BTN_ABILITY, BTN_RESPAWN } from './control.js';
import { makeRng } from './rng.js';
import { botName } from './names.js';
import { SKINS } from './skins.js';
import { sanitizeLook, randomLook } from './looks.js';

export const PHASE = {
  STARTER: 'starter', INTRO: 'intro', COUNTDOWN: 'countdown', RACE: 'race', CUT: 'cut', DRAFT: 'draft', PODIUM: 'podium', OVER: 'over',
};
export const DUR = { starter: 20, intro: 2, countdown: 3, cut: 3.4, draft: 13, podium: 11 };
const SEC = TICK_HZ;
const FINAL_GRACE = 22; // seconds the final runs on after the winner crosses
const CHECKPOINT_GRACE = 40; // seconds a stage runs on after its first qualifier
const RESPAWN_DELAY = 1.1;
export const LOOP_GIVE_UP = 4.5; // seconds from a loop fork to past the loop before a stuck marble is sent back
// Bots at a MEGA JUMP: where (units past the lip) they aim to press jump, and how often a weak one forgets to.
const MEGA_AIM = 0.5;
const MEGA_SKIP = 0.5;

export class Show {
  // entrants: [{ name, skin, bot, loadout, key }] (at most FIELD_SIZE; the rest are filled with bots)
  // startStage (solo dev shortcut, ?stage=N): skip straight to that stage index; see skipStages().
  // plan (solo Course Builder only, never online): the course is laid out from it; see buildPlannedStage().
  constructor({ seed, entrants = [], botLevel = 1, startStage = 0, plan = null, fieldSize = FIELD_SIZE }) {
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed ^ 0x5bd1e995);
    this.plan = plan ? normalizePlan(plan) : null;
    this.stages = this.plan ? buildShow(this.seed, { plan: this.plan }) : buildShow(this.seed);
    this.tick = 0;
    this.phase = PHASE.STARTER;
    this.phaseTick = 0;
    this.phaseEnd = DUR.starter * SEC;
    this.stageIndex = -1;
    this.stage = null;
    this.world = null;
    this.loadTick = 0;
    this.raceTick = 0;
    this.firstFinishTick = -1;
    this.qualifiedCount = 0;
    this.events = [];
    this.bumpEvents = [];
    this.ranking = [];
    this.forkCounts = [];
    this.draftRound = 0;
    this.players = [];
    const usedNames = new Set(entrants.map((e) => e.name));
    for (let i = 0; i < fieldSize; i++) {
      const e = entrants[i];
      const bot = !e || e.bot;
      let name = e ? e.name : null;
      if (!name) {
        do name = botName(this.rng); while (usedNames.has(name));
        usedNames.add(name);
      }
      const loadout = e && e.loadout ? sanitizeLoadout(e.loadout) : this.botLoadout(botLevel);
      this.players.push(this.makePlayer(i, name, e ? e.skin : this.rng.int(0, SKINS.length - 1), bot, loadout, e ? e.key : null, botLevel));
    }
    this.bodies = this.players.map((p) => p.body);
    this.assignLooks(entrants);
    this.skipTo = Math.max(0, Math.min(this.stages.length - 1, startStage | 0));
    this.startDraft(0);
  }

  makePlayer(id, name, skin, bot, loadout, key, botLevel) {
    const body = makeBody(id);
    body.active = false;
    const skill = Math.min(1, Math.max(0.4, this.rng.range(0.55, 1) * (0.88 + 0.12 * botLevel)));
    return {
      id, name, skin: Number.isInteger(skin) && skin >= 0 && skin < SKINS.length ? skin : 0, bot, human: !bot, key,
      connected: !bot, loadout, hand: [], st: computeStats([]), body, ctl: makeCtl(),
      alive: true, eliminatedStage: -1, place: 0, finishOrder: -1, finishTick: -1,
      s: 0, branchOf: [], input: { mx: 0, mz: 0, btn: 0 }, seq: 0,
      respawnT: 0, offT: 0, stuckT: 0, progS: -Infinity, progT: 0, loopT: 0, momentumT: 0, respawnPending: false, inTurn: false,
      mods: { speed: 1, accel: 1 }, luckyUsed: 0,
      stats: { bumps: 0, hardBumps: 0, respawns: 0, topSpeed: 0, midas: 0, stagesCleared: 0 },
      draft: null,
      ai: bot ? this.makeAi(skill) : null,
      afkT: 0,
    };
  }

  // Workshop looks: an entrant brings its own (clamped), and about half the bots wear a random tasteful one so the
  // field looks varied. Bots roll from their own generator, so the race plays out exactly as it would without.
  assignLooks(entrants) {
    const rng = makeRng(this.seed ^ 0x1007c0de);
    for (const p of this.players) {
      const e = entrants[p.id];
      if (e && (!e.bot || e.look !== undefined)) p.look = sanitizeLook(e.look);
      else p.look = rng.next() < 0.5 ? randomLook((SKINS[p.skin] || SKINS[0]).style, rng.next, [0, 0, 0, 1, 2, 3]) : null;
    }
  }

  makeAi(skill) {
    return {
      skill, offset: this.rng.range(-0.6, 0.6), offsetT: 0, noise: 0, noiseT: 0, risk: this.rng.range(0.2, 1),
      aggro: this.rng.range(0, 1), abilityT: this.rng.range(1, 4), mx: 0, mz: 0, think: 0, jumpHold: 0,
    };
  }

  botLoadout(level) {
    // Bots carry the free perks plus a good handful of unlocks, weighted toward the ones that win races.
    const pool = CARDS.filter((c) => c.rarity > 0 && c.kind !== 'eco').map((c) => c.id);
    const extra = this.rng.shuffle(pool).slice(0, this.rng.int(5, 9));
    const commons = STARTER_CARDS.filter((id) => CARD_BY_ID[id].kind !== 'eco');
    const deck = extra.concat(this.rng.shuffle(commons.slice())).slice(0, 20);
    const levels = {};
    for (const id of deck) levels[id] = Math.max(1, Math.min(5, Math.round(this.rng.range(1, 2.8) * level)));
    return { deck, levels, rerolls: 0 };
  }

  emit(e) {
    this.events.push(e);
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  // ------------------------------------------------------------ drafts

  startDraft(round) {
    this.draftRound = round;
    this.phase = round === 0 ? PHASE.STARTER : PHASE.DRAFT;
    this.phaseTick = this.tick;
    this.phaseEnd = this.tick + (round === 0 ? DUR.starter : DUR.draft) * SEC;
    const drng = makeRng((this.seed ^ Math.imul(round + 7, 0x27d4eb2f)) >>> 0);
    // The opening draft deals six and you keep three; after that it's one of three.
    const n = round === 0 ? STARTER_OFFER : 3;
    const need = round === 0 ? STARTER_PICKS : 1;
    this.fieldInfo = this.field();
    for (const p of this.players) {
      if (!p.alive) continue;
      const held = p.hand.map((h) => h.id);
      const free = computeStats(p.hand).rerolls;
      p.draft = { round, options: drawOffer(p.loadout.deck, round, drng.fork(), held, n, this.fieldInfo.perks), need, picks: [], rerolls: Math.max(0, p.loadout.rerolls - (p.rerollsUsed || 0)) + free, freeRerolls: free, picked: -1, rng: drng.fork() };
      if (p.bot) {
        p.draft.botAt = this.tick + Math.floor(this.rng.range(0.6, 4) * SEC);
      }
      this.emitDraft(p);
    }
    this.emit({ e: 'phase', phase: this.phase, until: this.phaseEnd, stage: this.stageIndex, round, at: this.tick });
  }

  // The shared pool: how many alive marbles hold each perk.
  field() {
    const perks = {};
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const h of p.hand) perks[h.id] = (perks[h.id] || 0) + 1;
    }
    return { perks };
  }

  emitDraft(p) {
    const d = p.draft;
    const fi = this.fieldInfo || { perks: {} };
    this.emit({
      e: 'draft', to: p.id, round: d.round, options: d.options, need: d.need, picks: d.picks, rerolls: d.rerolls, until: this.phaseEnd,
      inField: d.options.map((id) => fi.perks[id] || 0),
    });
  }

  choose(id, index) {
    const p = this.players[id];
    if (!p || !p.alive || !p.draft || p.draft.picked >= 0) return false;
    if (this.phase !== PHASE.STARTER && this.phase !== PHASE.DRAFT) return false;
    if (!Number.isInteger(index) || index < 0 || index >= p.draft.options.length) return false;
    if (p.draft.picks.includes(index)) return false;
    const cardId = p.draft.options[index];
    p.draft.picks.push(index);
    if (p.draft.picks.length >= p.draft.need) p.draft.picked = index;
    p.hand.push({ id: cardId, level: p.loadout.levels[cardId] || 1 });
    this.emit({ e: 'picked', id: p.id, card: cardId, hand: p.hand.map((h) => [h.id, h.level]) });
    return true;
  }

  reroll(id) {
    const p = this.players[id];
    // Rerolls swap the whole offer, so they're only allowed before the first pick of a draft.
    if (!p || !p.alive || !p.draft || p.draft.picked >= 0 || p.draft.picks.length || p.draft.rerolls <= 0) return false;
    if (this.phase !== PHASE.STARTER && this.phase !== PHASE.DRAFT) return false;
    p.draft.rerolls--;
    // Free rerolls (perks) are spent first; bought ones carry across the show.
    if (p.draft.freeRerolls > 0) p.draft.freeRerolls--;
    else p.rerollsUsed = (p.rerollsUsed || 0) + 1;
    const held = p.hand.map((h) => h.id);
    const prev = p.draft.options;
    const n = prev.length;
    const fp = this.fieldInfo ? this.fieldInfo.perks : null;
    let opts = drawOffer(p.loadout.deck.filter((c) => !prev.includes(c)), p.draft.round, p.draft.rng, held, n, fp);
    if (opts.length < n) opts = drawOffer(p.loadout.deck, p.draft.round, p.draft.rng, held, n, fp);
    p.draft.options = opts;
    this.emitDraft(p);
    return true;
  }

  // Fills the rest of a draft the way a bot would: best-scoring perk each time, given what it already holds.
  botPick(p) {
    const d = p.draft;
    while (d && d.picked < 0) {
      let best = -1, bs = -1;
      for (let i = 0; i < d.options.length; i++) {
        if (d.picks.includes(i)) continue;
        const s = botScore(d.options[i], p.hand) * this.rng.range(0.8, 1.2);
        if (s > bs) {
          bs = s;
          best = i;
        }
      }
      if (best < 0 || !this.choose(p.id, best)) break;
    }
  }

  finishDraft() {
    for (const p of this.players) {
      if (!p.alive || !p.draft) continue;
      if (p.draft.picked < 0) {
        // Timed out: take the card a bot would pick.
        this.botPick(p);
      }
      p.draft = null;
    }
  }

  draftDone() {
    for (const p of this.players) {
      if (p.alive && p.draft && p.draft.picked < 0 && p.human && p.connected) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ stages

  startStage(i) {
    this.stageIndex = i;
    const st = this.stages[i];
    this.stage = st;
    this.world = new World(st.colliders);
    const gate = st.colliders[st.gate];
    gate.enabled = true;
    this.loadTick = this.tick;
    this.firstFinishTick = -1;
    this.qualifiedCount = 0;
    this.forkCounts = st.forks.map((f) => Object.fromEntries(f.branches.map((b) => [b.id, 0])));
    const order = this.gridOrder();
    order.forEach((p, slot) => {
      p.st = computeStats(p.hand);
      const b = p.body;
      const g = st.grid[Math.min(slot, st.grid.length - 1)];
      b.x = g[0]; b.y = g[1] + (p.st.radius - 0.5); b.z = g[2];
      b.vx = b.vy = b.vz = 0;
      b.r = p.st.radius;
      b.mass = p.st.mass;
      b.bounce = p.st.bounce;
      b.push = p.st.push;
      b.wallLoss = p.st.wallLoss;
      b.gravity = p.st.gravity;
      b.active = true;
      b.groundT = 0;
      b.spawnGhost = 0;
      b.tp = (b.tp + 1) & 255;
      p.ctl = makeCtl();
      p.ctl.headStartT = p.st.headStart;
      p.s = -1;
      p.safeS = -1;
      p.branchOf = [];
      p.finishOrder = -1;
      p.finishTick = -1;
      p.respawnT = 0;
      p.respawnPending = false;
      p.offT = 0;
      p.stuckT = 0;
      p.progS = -Infinity;
      p.progT = 0;
      p.momentumT = 0;
      p.inTurn = false;
      p.slingT = 0;
      p.bowlIn = false;
      p.passedDrain = false;
      p.whirlIn = false;
      p.loopT = 0;
      // Bot memory is per stage: fork ids start again at 0 on every stage.
      if (p.ai) p.ai.megaFk = -1;
    });
    for (const p of this.players) if (!p.alive) p.body.active = false;
    this.setPhase(PHASE.INTRO, DUR.intro);
    this.emit({
      e: 'stage', index: i, loadTick: this.loadTick, alive: order.map((p) => p.id),
      roster: order.map((p) => [p.id, +p.st.radius.toFixed(3), p.st.active ? p.st.active.id : '']),
    });
  }

  gridOrder() {
    // Previous stage's finishing order goes to the front; for stage 1 the grid is shuffled.
    const alive = this.alivePlayers();
    if (this.lastOrder) {
      const set = new Set(alive.map((p) => p.id));
      const ordered = this.lastOrder.filter((id) => set.has(id)).map((id) => this.players[id]);
      for (const p of alive) if (!ordered.includes(p)) ordered.push(p);
      return ordered;
    }
    return this.rng.shuffle(alive.slice());
  }

  // Dev shortcut for solo shows (?stage=N): auto-picks everyone's starters, then for each skipped stage cuts ten
  // random bots (humans always survive) and runs that stage's draft as an instant auto-pick, then loads stage n.
  skipStages(n) {
    this.skipTo = 0;
    this.finishDraft();
    for (let i = 0; i < n; i++) {
      const alive = this.alivePlayers();
      const bots = this.rng.shuffle(alive.filter((p) => !p.human));
      bots.slice(0, CUT_PER_STAGE).forEach((p, k) => {
        p.alive = false;
        p.eliminatedStage = i;
        p.place = alive.length - CUT_PER_STAGE + 1 + k;
        p.body.active = false;
      });
      for (const p of this.alivePlayers()) p.stats.stagesCleared++;
      this.stageIndex = i;
      this.startDraft(i + 1);
      this.finishDraft();
    }
    this.lastOrder = null;
    this.startStage(n);
  }

  setPhase(phase, dur) {
    this.phase = phase;
    this.phaseTick = this.tick;
    this.phaseEnd = this.tick + Math.round(dur * SEC);
    this.emit({ e: 'phase', phase, until: this.phaseEnd, stage: this.stageIndex, at: this.tick });
  }

  stageTime() {
    return (this.tick - this.loadTick) / SEC;
  }

  quota() {
    const alive = this.alivePlayers().length;
    return this.stage.final ? alive : Math.max(1, alive - CUT_PER_STAGE);
  }

  // ------------------------------------------------------------ main loop

  step() {
    this.tick++;
    const ph = this.phase;
    if (ph === PHASE.STARTER && this.skipTo > 0) {
      this.skipStages(this.skipTo);
      return;
    }
    if (ph === PHASE.STARTER || ph === PHASE.DRAFT) {
      for (const p of this.players) {
        if (p.alive && p.draft && p.bot && p.draft.picked < 0 && this.tick >= p.draft.botAt) this.botPick(p);
      }
      const minDone = this.tick - this.phaseTick > 2.5 * SEC;
      if (this.tick >= this.phaseEnd || (minDone && this.draftDone())) {
        this.finishDraft();
        this.startStage(ph === PHASE.STARTER ? 0 : this.stageIndex + 1);
        return;
      }
      if (ph === PHASE.DRAFT) this.simulate(false);
      return;
    }
    if (ph === PHASE.INTRO || ph === PHASE.COUNTDOWN) {
      this.simulate(true);
      if (this.tick >= this.phaseEnd) {
        if (ph === PHASE.INTRO) this.setPhase(PHASE.COUNTDOWN, DUR.countdown);
        else this.startRace();
      }
      return;
    }
    if (ph === PHASE.RACE) {
      this.simulate(false);
      this.checkRaceEnd();
      return;
    }
    if (ph === PHASE.CUT) {
      this.simulate(false);
      if (this.tick >= this.phaseEnd) this.startDraft(this.stageIndex + 1);
      return;
    }
    if (ph === PHASE.PODIUM) {
      this.simulate(false);
      if (this.tick >= this.phaseEnd) {
        this.phase = PHASE.OVER;
        this.emit({ e: 'phase', phase: PHASE.OVER, until: this.tick, stage: this.stageIndex, at: this.tick });
      }
    }
  }

  startRace() {
    this.stage.colliders[this.stage.gate].enabled = false;
    this.raceTick = this.tick;
    const limit = this.stage.path.length / 7 + 40;
    this.setPhase(PHASE.RACE, limit);
    for (const p of this.alivePlayers()) p.ctl.headStartT = p.st.headStart;
  }

  // Runs control, physics and race bookkeeping for one tick.
  simulate(frozen) {
    const st = this.stage;
    if (!st) return;
    const racing = this.phase === PHASE.RACE;
    const inPen = this.phase === PHASE.CUT || this.phase === PHASE.DRAFT || this.phase === PHASE.PODIUM;
    if (this.tick % 10 === 0 || this.ranking.length === 0) this.updateRanking();
    const aliveN = this.ranking.length;
    for (const p of this.players) {
      if (!p.alive) continue;
      const b = p.body;
      if (!b.active) {
        if (p.respawnPending) {
          p.respawnT -= TICK_DT;
          if (p.respawnT <= 0) this.respawn(p, inPen);
        }
        continue;
      }
      if (b.spawnGhost > 0) b.spawnGhost -= TICK_DT;
      if (p.bot || !p.connected) this.think(p, frozen);
      p.mods.speed = 1;
      p.mods.accel = 1;
      if (racing) this.perkMods(p, aliveN);
      const inp = p.finishOrder >= 0 && p.bot ? { mx: 0, mz: 0, btn: 0 } : p.input;
      const fired = controlStep(b, p.ctl, inp, p.st, p.mods, frozen);
      if (fired) this.abilityEffect(p, fired);
      if (!frozen && inp.btn & BTN_RESPAWN && !(p.prevRespawnBtn & BTN_RESPAWN) && p.finishOrder < 0) this.queueRespawn(p, 0.35);
      p.prevRespawnBtn = inp.btn;
    }
    this.bumpEvents.length = 0;
    stepWorld(this.world, this.bodies, this.stageTime() - TICK_DT, this.bumpEvents);
    const bev = this.bumpEvents;
    for (let i = 0; i < bev.length; i += 3) {
      const a = this.players[bev[i]], c = this.players[bev[i + 1]];
      a.stats.bumps++;
      c.stats.bumps++;
      if (bev[i + 2] > 6) {
        for (const q of [a, c]) {
          q.stats.hardBumps++;
          if (q.st.midas && q.stats.midas < 30) q.stats.midas++;
        }
      }
    }
    for (const p of this.players) {
      if (!p.alive || !p.body.active) continue;
      const b = p.body;
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (sp > p.stats.topSpeed) p.stats.topSpeed = sp;
      if (b.wallHit || b.bumped) {
        p.momentumT = 0;
        b.bumped = 0;
      } else p.momentumT += TICK_DT;
      if (b.y < st.killY) {
        this.respawnAfterFall(p);
        continue;
      }
      if (inPen) {
        // Keep everyone corralled while the cut and draft play out.
        continue;
      }
      if (frozen) continue;
      this.track(p);
      if (p.finishOrder < 0) {
        // (Once the quota is full nobody else qualifies, even a marble crossing in the same tick as the last one.)
        if (this.atFinish(p) && (!racing || st.final || this.qualifiedCount < this.quota())) this.qualify(p);
        else if (sp < 1.0 && !p.bowlIn) {
          p.stuckT += TICK_DT;
          if (p.stuckT > 7) this.queueRespawn(p, 0.2);
        } else p.stuckT = Math.max(0, p.stuckT - TICK_DT * 2);
        // A marble wedged where it can only hop (between a peg and a wall: the bots' unstick hop keeps its speed up
        // now and then, so the timer above never fills) makes no progress at all: it goes back too.
        if (p.s > p.progS + 1.5 || p.bowlIn || p.whirlIn) {
          p.progS = p.s;
          p.progT = 0;
        } else if ((p.progT += TICK_DT) > 12) this.queueRespawn(p, 0.2);
      }
    }
  }

  // Progress along the path, branch tracking and off-course detection.
  track(p) {
    const st = this.stage;
    const path = st.path;
    const b = p.body;
    if (st.bowl && this.trackBowl(p)) return;
    if (st.whirl && this.trackWhirl(p)) return;
    const out = { d: 0 };
    let i = nearestSample(path, b.x, b.y, b.z, p.s - 10, p.s + 22, out);
    let d = out.d;
    if (i >= 0 && d > path.hw[i] + 4) {
      // Lost the thread (big bump, shortcut): look along the whole course, but don't jump too far ahead.
      const j = nearestSample(path, b.x, b.y, b.z, p.s - 40, p.s + 80, out);
      if (j >= 0 && out.d < path.hw[j] + 2) {
        i = j;
        d = out.d;
      }
    }
    if (i < 0) return;
    if (st.bowl && !p.passedDrain && p.finishOrder < 0 && path.s[i] > st.bowl.drainS) {
      // Past the drain without going through it (bounced out over the rim onto the exit chute or into the pen):
      // that doesn't count, so back to the chute into the bowl.
      this.queueRespawn(p, 0.4);
      return;
    }
    if (d > path.hw[i] + 6) {
      p.offT += TICK_DT;
      if (p.offT > 2.2) this.queueRespawn(p, 0.4);
      return;
    }
    p.offT = 0;
    p.s = path.s[i];
    // Where it last rolled on the course: a fall respawns from here, not from track it fell past (a marble dropping
    // off a fork just before THE PLUNGE matched the plunge's face below it and gained 15-25 units).
    if (b.groundT < 0.12) p.safeS = p.s;
    // Slingshot: coming out of a turn fires a burst.
    const turning = (path.fl[i] & F_TURN) !== 0;
    if (p.inTurn && !turning && p.st.slingshot && this.phase === PHASE.RACE) p.slingT = 0.8 * p.st.slingshot;
    p.inTurn = turning;
    if (path.fk[i] >= 0) {
      const fk = path.fk[i];
      // Trampolines: the ledge's samples are nearest to a marble on the floor under its overhang too; one that is
      // down there (bounced short) is on the lower lane.
      const tr = st.forks[fk].tramp;
      const br = tr && path.br[i] === tr.ledge && b.y < path.y[i] - 1 ? tr.low : path.br[i];
      if (p.branchOf[fk] !== br) {
        if (p.branchOf[fk] !== undefined && this.forkCounts[fk]) this.forkCounts[fk][p.branchOf[fk]]--;
        p.branchOf[fk] = br;
        if (this.forkCounts[fk]) this.forkCounts[fk][br]++;
      }
    }
    p.sampleIdx = i;
    // A marble that can't get round a loop (rocking at its foot, stalled in it) goes back to the last safe point.
    // From the fork to the far side of the loop takes about two seconds.
    let inLoop = (path.fl[i] & F_LOOP) !== 0;
    for (const f of st.forks) if (f.loop && p.branchOf[f.id] === f.loop.br && p.s > f.s0 && p.s < f.loop.sOut) inLoop = true;
    p.loopT = inLoop ? p.loopT + TICK_DT : 0;
    if (p.loopT > LOOP_GIVE_UP && this.phase === PHASE.RACE) this.queueRespawn(p, 0.3);
  }

  // Inside THE BOWL progress is how close you are to the drain, and off-course detection is off: the bowl is the
  // course. Returns false when the marble is not in the bowl (still on the chute, flown out, or below it).
  trackBowl(p) {
    const st = this.stage;
    const b = p.body;
    if (p.finishOrder >= 0) return false;
    const s = bowlS(st.bowl, b.x, b.y, b.z);
    if (s < 0 || (!p.bowlIn && p.s < st.bowl.entryS - 25)) {
      p.bowlIn = false;
      return false;
    }
    if (!st.bowl.finishInDrain && s === st.bowl.drainS && b.y < st.bowl.c[1] + st.bowl.yd - 0.5) p.passedDrain = true;
    p.bowlIn = true;
    p.s = s;
    p.offT = 0;
    p.inTurn = false;
    p.sampleIdx = sampleAt(st.path, s, p.branchOf);
    return true;
  }

  // THE WHIRLPOOL, mid-course: like THE BOWL, progress inside it is by radius and off-course detection is off. Once
  // the drain drops you onto the lane below, the ordinary path takes over again.
  trackWhirl(p) {
    const st = this.stage;
    const b = p.body;
    const wp = st.whirl;
    const s = p.finishOrder >= 0 ? -1 : whirlS(wp, b.x, b.y, b.z);
    if (s < 0 || (!p.whirlIn && (p.s < wp.entryS - 25 || p.s > wp.drainS + 1))) {
      p.whirlIn = false;
      return false;
    }
    p.whirlIn = true;
    p.s = s;
    p.offT = 0;
    p.inTurn = false;
    p.sampleIdx = sampleAt(st.path, s, p.branchOf);
    return true;
  }

  atFinish(p) {
    const b = p.body;
    return insideBox(this.stage.finish, b.x, b.y, b.z, 0.2);
  }

  qualify(p) {
    p.finishOrder = this.qualifiedCount++;
    p.finishTick = this.tick;
    p.s = Math.max(p.s, this.stage.path.finishS);
    if (this.firstFinishTick < 0) this.firstFinishTick = this.tick;
    const quota = this.quota();
    this.emit({ e: 'qualify', id: p.id, order: p.finishOrder, time: (this.tick - this.raceTick) / SEC, quota });
  }

  respawnAfterFall(p) {
    this.queueRespawn(p, p.st.phoenix ? 0.05 : p.st.secondWind ? 0.15 : p.st.recovery ? RESPAWN_DELAY / 3 : RESPAWN_DELAY, true);
  }

  queueRespawn(p, delay, fell = false) {
    if (p.respawnPending) return;
    p.respawnPending = true;
    p.respawnT = delay;
    p.body.active = false;
    p.stats.respawns++;
    p.stuckT = 0;
    p.offT = 0;
    p.progS = -Infinity;
    p.progT = 0;
    this.emit({ e: 'fall', id: p.id, fell });
  }

  respawn(p, inPen) {
    const st = this.stage;
    const b = p.body;
    p.respawnPending = false;
    const checkpoint = p.trapZone?.checkpoint;
    let x, y, z, tx, tz;
    if (inPen || p.finishOrder >= 0) {
      const c = st.penCenter;
      x = c[0] + this.rng.range(-3, 3);
      y = c[1] + 1;
      z = c[2] + this.rng.range(-3, 3);
      tx = Math.sin(st.penHeading);
      tz = Math.cos(st.penHeading);
    } else {
      const path = st.path;
      // Quick Recovery and Phoenix put you back a little further on.
      const ahead = p.st.phoenix ? 6 : p.st.recovery ? 3 : -1;
      const from = p.safeS !== undefined && p.safeS < p.s ? p.safeS : p.s;
      const i = checkpoint ?? respawnSample(path, Math.min(from + ahead, path.finishS - 2));
      const side = checkpoint == null ? this.rng.range(-1, 1) * Math.max(0, path.hw[i] - 1.5) : 0;
      tx = path.tx[i];
      tz = path.tz[i];
      x = path.x[i] + tz * side;
      y = path.y[i] + 1.2;
      z = path.z[i] - tx * side;
      p.s = path.s[i];
      p.safeS = p.s;
      p.sampleIdx = i;
    }
    b.x = x; b.y = y; b.z = z;
    const v = checkpoint != null ? 0 : p.st.phoenix ? 19 : p.st.secondWind ? 15 : 4;
    b.vx = tx * v; b.vy = 0; b.vz = tz * v;
    b.active = true;
    b.groundT = 1;
    b.spawnGhost = 1.2;
    p.bowlIn = false;
    if (st.bowl && p.s <= st.bowl.drainS) p.passedDrain = false;
    p.whirlIn = false;
    p.loopT = 0;
    // A bot back at the top of a mega jump's run-in tries the jump again.
    if (p.ai) p.ai.megaFk = -1;
    b.tp = (b.tp + 1) & 255;
    this.emit({ e: 'respawn', id: p.id });
  }

  perkMods(p, aliveN) {
    const st = p.st;
    const m = p.mods;
    const rank = p.rank ?? aliveN;
    if (st.comeback && rank >= aliveN * 0.6) {
      m.speed += 0.12 * st.comeback;
      m.accel += 0.12 * st.comeback;
    }
    if (st.frontRunner && rank < 5) m.speed += 0.08 * st.frontRunner;
    if (st.clutch && this.stage && p.s > this.stage.path.finishS * 0.7) {
      m.speed += 0.09 * st.clutch;
      m.accel += 0.09 * st.clutch;
    }
    // Slingshot: a gentle push for a moment after each turn (through the synced speed mods, not a burst).
    if (p.slingT > 0) {
      p.slingT -= TICK_DT;
      m.speed += 0.06 * st.slingshot;
      m.accel += 0.15 * st.slingshot;
    }
    if (st.pack || st.lone) {
      const b = p.body;
      let near4 = 0, near6 = 0;
      for (const q of this.bodies) {
        if (q === b || !q.active) continue;
        const d2 = (q.x - b.x) ** 2 + (q.y - b.y) ** 2 + (q.z - b.z) ** 2;
        if (d2 < 36) {
          near6++;
          if (d2 < 16) near4++;
        }
      }
      // Eased over about a second, so the bonus swells and fades instead of flickering as marbles pass.
      const k = 1 - Math.exp(-TICK_DT / 0.9);
      p.packSm = (p.packSm || 0) + (Math.min(3, near4) - (p.packSm || 0)) * k;
      p.loneSm = (p.loneSm || 0) + ((near6 === 0 ? 1 : 0) - (p.loneSm || 0)) * k;
      if (st.pack) m.speed += p.packSm * 0.03 * st.pack;
      if (st.lone) {
        m.speed += 0.06 * st.lone * p.loneSm;
        m.accel += 0.12 * st.lone * p.loneSm;
      }
    }
    if (st.momentum) m.speed += Math.min(0.15 * st.momentum, 0.025 * st.momentum * p.momentumT);
    if (st.slipstream) {
      const b = p.body;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 6) {
        const ux = b.vx / sp, uz = b.vz / sp;
        for (const q of this.bodies) {
          if (q === b || !q.active) continue;
          const dx = q.x - b.x, dy = q.y - b.y, dz = q.z - b.z;
          if (Math.abs(dy) > 2) continue;
          const d = Math.hypot(dx, dz);
          if (d > 5 || d < 0.5) continue;
          if (dx * ux + dz * uz > d * 0.8) {
            m.speed += 0.1 * st.slipstream;
            m.accel += 0.25 * st.slipstream;
            p.drafting = this.tick;
            break;
          }
        }
      }
    }
  }

  abilityEffect(p, kind) {
    const b = p.body;
    if (kind === 'shockwave') {
      const power = p.st.active.power;
      for (const q of this.players) {
        if (q === p || !q.alive || !q.body.active || q.body.ghost || q.st.iron) continue;
        const o = q.body;
        const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 7 || d < 1e-3) continue;
        const k = (18 * power * (1 - (d / 7) * 0.5)) / (o.anchored ? o.mass * 8 : o.mass);
        o.vx += (dx / d) * k;
        o.vy += Math.max(0, dy / d) * k * 0.5 + 3;
        o.vz += (dz / d) * k;
      }
    } else if (kind === 'warp' && this.phase === PHASE.RACE && p.finishOrder < 0 && p.whirlIn) {
      // In THE WHIRLPOOL: the same hop in toward the drain.
      const wp = this.stage.whirl;
      const dx = b.x - wp.c[0], dz = b.z - wp.c[2];
      const d = Math.hypot(dx, dz) || 1;
      const r = Math.max(wp.Rd + 1.8, d - 4);
      b.x = wp.c[0] + (dx / d) * r;
      b.z = wp.c[2] + (dz / d) * r;
      b.y = wp.c[1] + dishHeightAt(wp.R, r, wp.A, wp.K) + b.r + 0.3;
      b.vy = 0;
      b.tp = (b.tp + 1) & 255;
    } else if (kind === 'warp' && this.phase === PHASE.RACE && p.finishOrder < 0 && p.bowlIn) {
      // In THE BOWL: hop a few units straight in toward the drain, keeping your speed (and so your orbit).
      const bw = this.stage.bowl;
      const dx = b.x - bw.c[0], dz = b.z - bw.c[2];
      const d = Math.hypot(dx, dz) || 1;
      const r = Math.max(bw.Rd + 2.5, d - 6);
      b.x = bw.c[0] + (dx / d) * r;
      b.z = bw.c[2] + (dz / d) * r;
      b.y = bw.c[1] + bowlHeightAt(bw.R, r) + b.r + 0.3;
      b.vy = 0;
      b.tp = (b.tp + 1) & 255;
    } else if (kind === 'warp' && this.phase === PHASE.RACE && p.finishOrder < 0) {
      const path = this.stage.path;
      // Choose branches ahead if the player hasn't been through them yet.
      for (const f of this.stage.forks) {
        if (p.branchOf[f.id] === undefined && f.s0 < p.s + 12 && f.s1 > p.s) p.branchOf[f.id] = this.safestBranch(f).id;
      }
      const target = Math.min(p.s + 10, path.finishS - 1);
      let i = sampleAt(path, target, p.branchOf);
      // Never into a loop-the-loop (you would land on top of it): past it instead.
      for (let t = target; i >= 0 && path.fl[i] & F_LOOP && t < path.finishS - 2; t += 1.5) i = sampleAt(path, t, p.branchOf);
      if (i >= 0) {
        const sp = Math.max(6, Math.hypot(b.vx, b.vz));
        b.x = path.x[i];
        b.y = path.y[i] + 0.8;
        b.z = path.z[i];
        b.vx = path.tx[i] * sp;
        b.vz = path.tz[i] * sp;
        b.vy = 0;
        b.tp = (b.tp + 1) & 255;
        p.s = path.s[i];
        p.safeS = p.s;
      }
    }
    this.emit({ e: 'ability', id: p.id, kind });
  }

  safestBranch(f) {
    let best = f.branches[0];
    for (const br of f.branches) if (br.risk < best.risk) best = br;
    return best;
  }

  updateRanking() {
    const alive = this.alivePlayers();
    alive.sort((a, b) => {
      const fa = a.finishOrder >= 0, fb = b.finishOrder >= 0;
      if (fa !== fb) return fa ? -1 : 1;
      if (fa) return a.finishOrder - b.finishOrder;
      if (a.respawnPending !== b.respawnPending) return a.respawnPending ? 1 : -1;
      return b.s - a.s;
    });
    alive.forEach((p, i) => (p.rank = i));
    this.ranking = alive;
  }

  checkRaceEnd() {
    const quota = this.quota();
    const final = this.stage.final;
    const alive = this.alivePlayers();
    const allIn = alive.every((p) => p.finishOrder >= 0);
    const graceOver = this.firstFinishTick >= 0 && this.tick - this.firstFinishTick > (final ? FINAL_GRACE : CHECKPOINT_GRACE) * SEC;
    const timeUp = this.tick >= this.phaseEnd;
    if (final) {
      if (allIn || graceOver || timeUp) this.endFinal();
      return;
    }
    if (this.qualifiedCount >= quota || allIn || graceOver || timeUp) this.doCut(quota);
  }

  doCut(quota) {
    this.updateRanking();
    const ranking = this.ranking.slice();
    const safe = ranking.slice(0, quota);
    const cut = ranking.slice(quota);
    const saved = [];
    // Lucky Marble: a marble on the chopping block trades places with the lowest safe marble without one.
    for (const p of cut.slice()) {
      if (p.st.lucky > p.luckyUsed) {
        for (let k = safe.length - 1; k >= 0; k--) {
          const q = safe[k];
          if (!(q.st.lucky > q.luckyUsed) && !saved.includes(q)) {
            safe[k] = p;
            cut[cut.indexOf(p)] = q;
            p.luckyUsed++;
            saved.push(p);
            break;
          }
        }
      }
    }
    const aliveBefore = ranking.length;
    cut.forEach((p, k) => {
      p.alive = false;
      p.eliminatedStage = this.stageIndex;
      p.place = aliveBefore - cut.length + 1 + k;
      p.body.active = false;
      p.respawnPending = false;
    });
    for (const p of safe) p.stats.stagesCleared++;
    this.lastOrder = safe.map((p) => p.id);
    this.updateRanking();
    this.emit({ e: 'cut', ids: cut.map((p) => p.id), places: cut.map((p) => p.place), lucky: saved.map((p) => p.id), stage: this.stageIndex });
    this.setPhase(PHASE.CUT, DUR.cut);
  }

  endFinal() {
    this.updateRanking();
    this.ranking.forEach((p, i) => {
      p.place = i + 1;
      p.stats.stagesCleared += p.finishOrder >= 0 ? 1 : 0;
    });
    this.setPhase(PHASE.PODIUM, DUR.podium);
    this.emit({ e: 'results', results: this.results() });
  }

  results() {
    return this.players
      .map((p) => ({
        id: p.id, name: p.name, skin: p.skin, look: p.look || null, bot: p.bot && !p.human, human: p.human, place: p.place, out: p.eliminatedStage,
        hand: p.hand.map((h) => [h.id, h.level]), bumps: p.stats.bumps, hardBumps: p.stats.hardBumps, respawns: p.stats.respawns,
        topSpeed: +p.stats.topSpeed.toFixed(1), midas: p.stats.midas, cleared: p.stats.stagesCleared,
        stickerMult: +p.st.stickerMult.toFixed(2),
      }))
      .sort((a, b) => a.place - b.place);
  }

  // ------------------------------------------------------------ bots

  think(p, frozen) {
    const ai = p.ai || (p.ai = this.makeAi(0.6));
    const b = p.body;
    const st = this.stage;
    const path = st.path;
    if (frozen) {
      p.input = { mx: 0, mz: 0, btn: 0 };
      return;
    }
    const inPen = this.phase !== PHASE.RACE || p.finishOrder >= 0;
    if (inPen) {
      // Idle roll around the pen.
      if (this.tick % 40 === p.id % 40) {
        const a = this.rng.range(0, Math.PI * 2);
        ai.mx = Math.cos(a) * 0.3;
        ai.mz = Math.sin(a) * 0.3;
      }
      const c = st.penCenter;
      const dx = c[0] - b.x, dz = c[2] - b.z;
      const d = Math.hypot(dx, dz) || 1;
      p.input = { mx: ai.mx + (d > 4 ? (dx / d) * 0.6 : 0), mz: ai.mz + (d > 4 ? (dz / d) * 0.6 : 0), btn: 0 };
      return;
    }
    if (st.bowl && p.bowlIn) {
      this.thinkBowl(p, ai);
      return;
    }
    if (st.whirl && p.whirlIn) {
      this.thinkBowl(p, ai, st.whirl);
      return;
    }
    // Commit to branches at forks coming up.
    for (const f of st.forks) {
      if (p.branchOf[f.id] === undefined && f.s0 - p.s < 30 && f.s1 > p.s) {
        p.branchOf[f.id] = this.chooseBranch(p, f).id;
        this.forkCounts[f.id][p.branchOf[f.id]]++;
      }
    }
    const sp = Math.hypot(b.vx, b.vz);
    let look = 4.5 + sp * 0.32;
    // THE DRUM: aim close ahead and high up the wall (a target far round the drum would cut across to the post).
    const inDrum = st.drums && st.drums.some((dm) => p.s + look > dm.s0 && p.s < dm.s1);
    if (inDrum) look = Math.min(look, 5);
    // Heading for a loop: aim down its entry lane, not across at where the loop comes back down.
    for (const f of st.forks) {
      const lp = f.loop;
      if (lp && p.branchOf[f.id] === lp.br && p.s < lp.sBottom && p.s + look > lp.sBottom) look = Math.max(1.5, lp.sBottom - p.s);
    }
    const here0 = p.sampleIdx ?? -1;
    if (here0 >= 0 && path.fl[here0] & F_LOOP) {
      // In a loop or its lane: on the flat, run straight down the lane's center line; riding the curve, push
      // along the way you're already going. No jumps or abilities in here.
      let mx, mz;
      if (b.groundT < 0.12 && b.gny > 0.9 || sp < 3) {
        const tx = path.tx[here0], tz = path.tz[here0];
        const err = (path.x[here0] - b.x) * tz - (path.z[here0] - b.z) * tx;
        mx = tx + tz * err * 0.6;
        mz = tz - tx * err * 0.6;
      } else {
        mx = b.vx / sp;
        mz = b.vz / sp;
      }
      const m = Math.hypot(mx, mz) || 1;
      ai.mx = mx / m;
      ai.mz = mz / m;
      p.input = { mx: ai.mx, mz: ai.mz, btn: 0 };
      return;
    }
    const ti = sampleAt(path, p.s + look, p.branchOf);
    if (ti < 0) {
      p.input = { mx: 0, mz: 0, btn: 0 };
      return;
    }
    if (--ai.offsetT <= 0) {
      ai.offsetT = this.rng.int(90, 260);
      ai.offset = this.rng.range(-0.75, 0.75);
    }
    if (--ai.noiseT <= 0) {
      ai.noiseT = this.rng.int(10, 30);
      ai.noise = this.rng.range(-1, 1) * (1 - ai.skill) * 0.45;
    }
    const risky = path.fl[ti] & F_RISKY;
    const turnAhead = path.fl[ti] & F_TURN;
    const hw = path.hw[ti];
    let off = risky ? ai.offset * 0.15 : ai.offset;
    // Half-pipe: carve along a wall (each bot keeps to its own side).
    if (path.fl[ti] & F_PIPE) off = (ai.offset >= 0 ? 1 : -1) * (0.5 + 0.35 * ai.skill);
    if (turnAhead) {
      // Racing line: hug the inside of the bend (the side the track is turning toward).
      const t2 = sampleAt(path, p.s + look + 6, p.branchOf);
      if (t2 >= 0) {
        const turnSide = path.tx[t2] * path.tz[ti] - path.tz[t2] * path.tx[ti];
        off = (turnSide > 0 ? 1 : -1) * (0.35 + 0.35 * ai.skill);
        // On a banked turn, ride up the bank (outside of center) and keep the speed instead.
        if (path.fl[ti] & F_BANK) off = (turnSide > 0 ? -1 : 1) * (inDrum ? 0.65 + 0.35 * ai.skill : 0.1 + 0.4 * ai.skill);
      }
    }
    const side = off * Math.max(0, hw - p.st.radius - 0.7);
    let tx = path.x[ti] + path.tz[ti] * side;
    let tz = path.z[ti] - path.tx[ti] * side;
    const wp = st.whirl;
    if (wp && p.s < wp.entryS + 0.5 && p.s + look > wp.entryS) {
      // Coming down THE WHIRLPOOL's chute: straight on over the rim, as for THE BOWL.
      const k = Math.max(2, p.s + look - wp.entryS);
      tx = wp.E[0] + wp.fwd[0] * k;
      tz = wp.E[2] + wp.fwd[2] * k;
    }
    const bw = st.bowl;
    if (bw && p.s + look > bw.entryS) {
      // Coming down THE BOWL's chute: aim straight on over the rim (the radial samples past the entry would pull
      // the line into the chute's inner wall).
      const k = Math.max(2, p.s + look - bw.entryS);
      tx = bw.E[0] + bw.fwd[0] * k;
      tz = bw.E[2] + bw.fwd[2] * k;
    }
    let dx = tx - b.x, dz = tz - b.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    const noise = risky ? ai.noise * 0.25 : ai.noise;
    const ca = Math.cos(noise), sa = Math.sin(noise);
    const ndx = dx * ca - dz * sa, ndz = dx * sa + dz * ca;
    // Drive toward the target: always push forward (gravity does the rest downhill), bleed off sideways drift,
    // and only brake into turns or on narrow, risky ground when carrying too much speed.
    const along = b.vx * ndx + b.vz * ndz;
    const px = b.vx - along * ndx, pz = b.vz - along * ndz;
    let cap = Infinity;
    if (turnAhead) cap = p.st.topSpeed * (path.fl[ti] & F_BANK ? 1.3 + 0.3 * ai.skill : 1.0 + 0.25 * ai.skill);
    if (risky && !(path.fl[ti] & F_BOOST)) cap = Math.min(cap, p.st.topSpeed * (1.05 + 0.25 * ai.skill));
    // THE DRUM: never brake on the wall of death; the speed is what holds you up on it.
    if (inDrum) cap = Infinity;
    const fwd = along > cap ? -0.6 : 1;
    let mx = ndx * fwd - px * 0.22, mz = ndz * fwd - pz * 0.22;
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    // Reaction lag for weaker bots: blend toward the new intent.
    const blend = 0.3 + 0.6 * ai.skill;
    ai.mx += (mx - ai.mx) * blend;
    ai.mz += (mz - ai.mz) * blend;
    let btn = 0;
    const here = p.sampleIdx ?? ti;
    // Jump at kickers and gaps: look a little ahead so the jump leaves from the lip.
    const soon = sampleAt(path, p.s + 1.5 + sp * 0.08, p.branchOf);
    const jumpZone = (path.fl[here] & F_JUMP) || (soon >= 0 && path.fl[soon] & F_JUMP);
    if (jumpZone && b.groundT < 0.1 && this.rng.chance(0.35 + 0.6 * ai.skill)) btn |= BTN_JUMP;
    // Double jumps: use the spare air jump to carry over a gap.
    if (jumpZone && b.groundT > 0.35 && b.vy < -2 && p.ctl.airJumps > 0 && this.rng.chance(0.2 * ai.skill)) btn |= BTN_JUMP;
    if (p.stuckT > 1.0 && this.tick % 24 === 0) btn |= BTN_JUMP;
    btn |= this.thinkJumps(p, ai, sp);
    // Abilities.
    ai.abilityT -= TICK_DT;
    if (p.st.active && p.ctl.abilityCdT <= 0 && ai.abilityT <= 0) {
      if (this.wantsAbility(p, ti)) {
        btn |= BTN_ABILITY;
        ai.abilityT = this.rng.range(0.4, 2.2) * (1.4 - ai.skill);
      }
    }
    p.input = { mx: ai.mx, mz: ai.mz, btn };
  }

  // Bots in THE BOWL: steer for the drain and bleed off orbit speed by leaning against it. Skill decides how hard
  // they lean and how often they hesitate, so the strong ones spiral in and the weak ones orbit wide.
  thinkBowl(p, ai, bw = this.stage.bowl) {
    const b = p.body;
    const dx = bw.c[0] - b.x, dz = bw.c[2] - b.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d, tx = -uz, tz = ux;
    const vt = b.vx * tx + b.vz * tz;
    if (ai.bowlLean === undefined) {
      ai.bowlLean = Math.max(0, ai.skill * this.rng.range(0.5, 1.5) - 0.35);
      ai.bowlHesT = 0;
    }
    if (--ai.noiseT <= 0) {
      ai.noiseT = this.rng.int(10, 30);
      ai.noise = this.rng.range(-1, 1) * (1 - ai.skill) * 0.6;
      // Weaker bots sometimes freeze up for a moment and just ride the orbit.
      if (this.rng.chance((1 - ai.skill) * 0.35)) ai.bowlHesT = this.rng.int(20, 70);
    }
    let mx = 0, mz = 0;
    if (ai.bowlHesT > 0) ai.bowlHesT--;
    else {
      const lean = Math.max(-1, Math.min(1, vt * 0.12)) * ai.bowlLean * (d < bw.Rd + 3 ? 0.3 : 1);
      mx = ux - tx * lean;
      mz = uz - tz * lean;
      const ca = Math.cos(ai.noise), sa = Math.sin(ai.noise);
      [mx, mz] = [mx * ca - mz * sa, mx * sa + mz * ca];
      const m = Math.hypot(mx, mz);
      if (m > 1) {
        mx /= m;
        mz /= m;
      }
    }
    const blend = 0.3 + 0.6 * ai.skill;
    ai.mx += (mx - ai.mx) * blend;
    ai.mz += (mz - ai.mz) * blend;
    let btn = 0;
    ai.abilityT -= TICK_DT;
    if (p.st.active && p.ctl.abilityCdT <= 0 && ai.abilityT <= 0 && this.wantsAbility(p, p.sampleIdx ?? 0)) {
      btn |= BTN_ABILITY;
      ai.abilityT = this.rng.range(0.4, 2.2) * (1.4 - ai.skill);
    }
    p.input = { mx: ai.mx, mz: ai.mz, btn };
  }

  // MEGA JUMP: hold the line down the run-in and press jump at the lip, with timing that is only as good as the bot.
  // The window that reaches the far deck is roughly two units before the lip to four after it (the jump's grace
  // time after leaving the ground), so a sharp bot nearly always makes it and a weak one often doesn't.
  thinkJumps(p, ai, sp) {
    const b = p.body;
    for (const f of this.stage.forks) {
      const m = f.mega;
      if (!m || p.s < m.sStart - 2 || p.s > f.s0 + 10) continue;
      if (ai.megaFk !== f.id) {
        ai.megaFk = f.id;
        ai.megaJumped = false;
        const spread = 2 + 7.5 * (1 - ai.skill);
        ai.megaAt = this.rng.chance((1 - ai.skill) * MEGA_SKIP) ? null : MEGA_AIM + this.rng.range(-1, 1) * spread;
      }
      if (ai.megaAt === null || ai.megaJumped || b.groundT >= 0.12) return 0;
      const x = (b.x - m.lip[0]) * m.f[0] + (b.z - m.lip[2]) * m.f[1];
      if (x >= ai.megaAt && x < 8) {
        ai.megaJumped = true;
        return BTN_JUMP;
      }
      return 0;
    }
    return 0;
  }

  wantsAbility(p, ti) {
    const path = this.stage.path;
    const b = p.body;
    const kind = p.st.active.id;
    const near = (r) => {
      let n = 0;
      for (const q of this.bodies) {
        if (q === b || !q.active) continue;
        const dx = q.x - b.x, dy = q.y - b.y, dz = q.z - b.z;
        if (dx * dx + dy * dy + dz * dz < r * r) n++;
      }
      return n;
    };
    if (p.bowlIn || p.whirlIn) {
      // In THE BOWL a shove in the crowd is gold; boosts and jumps only throw you back out to the rim.
      if (kind === 'shockwave') return near(5) >= 3 + Math.floor(p.ai.aggro * 2);
      if (kind === 'ghost') return near(3) >= 4;
      if (kind === 'anchor') return near(3.5) >= 3;
      return false;
    }
    const straight = !(path.fl[ti] & (F_TURN | F_RISKY));
    const sp = Math.hypot(b.vx, b.vz);
    switch (kind) {
      case 'turbo':
      case 'rocket':
        return straight && sp < p.st.topSpeed * 0.95 && b.groundT < 0.2;
      case 'pogo':
        return p.stuckT > 1 || (path.fl[ti] & F_JUMP) !== 0 || near(2.5) >= 3;
      case 'shockwave':
        // Not into the packed grid right after the gate drops (a volley there knocked dozens off the start).
        if (this.tick - this.raceTick < 4 * TICK_HZ) return false;
        return near(5) >= 3 + Math.floor(p.ai.aggro * 2);
      case 'ghost':
        return near(4) >= 4;
      case 'anchor':
        return near(3.5) >= 3;
      case 'warp': {
        const ahead = sampleAt(path, p.s + 10, p.branchOf);
        return straight && ahead >= 0 && path.fk[ahead] < 0 && !(path.fl[ahead] & F_RISKY);
      }
    }
    return false;
  }

  chooseBranch(p, f) {
    // A mega jump's landings are decided by the flight, not chosen: everyone aims for the far deck.
    if (f.mega) return f.branches[0];
    const ai = p.ai || { skill: 0.6, risk: 0.5 };
    const total = this.alivePlayers().length || 1;
    let best = f.branches[0], bs = -Infinity;
    for (const br of f.branches) {
      const crowd = (this.forkCounts[f.id][br.id] || 0) / total;
      const s = br.speed * (0.6 + 0.4 * ai.skill) - br.risk * (1.05 - ai.skill * 0.8) * (0.6 + 0.5 * (1 - ai.risk)) - crowd * 0.9 + this.rng.range(0, 0.4);
      if (s > bs) {
        bs = s;
        best = br;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ players

  setInput(id, mx, mz, btn) {
    const p = this.players[id];
    if (!p) return;
    p.input = { mx: Number.isFinite(mx) ? Math.max(-1, Math.min(1, mx)) : 0, mz: Number.isFinite(mz) ? Math.max(-1, Math.min(1, mz)) : 0, btn: btn & 7 };
  }

  // A human left: a bot takes over their marble so the field stays at fifty.
  disconnect(id) {
    const p = this.players[id];
    if (!p) return;
    p.connected = false;
    if (!p.ai) p.ai = this.makeAi(0.55);
    p.input = { mx: 0, mz: 0, btn: 0 };
  }

  reconnect(id) {
    const p = this.players[id];
    if (!p) return;
    p.connected = true;
  }

  // Compact per-player state for a client joining or rejoining mid-show.
  snapshotState() {
    return {
      seed: this.seed,
      tick: this.tick,
      phase: this.phase,
      phaseEnd: this.phaseEnd,
      stage: this.stageIndex,
      loadTick: this.loadTick,
      raceTick: this.raceTick,
      qualified: this.qualifiedCount,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, skin: p.skin, look: p.look || null, human: p.human, alive: p.alive, place: p.place, out: p.eliminatedStage,
        finish: p.finishOrder, r: +p.st.radius.toFixed(3), hand: p.hand.map((h) => [h.id, h.level]),
        act: p.st.active ? p.st.active.id : '',
      })),
    };
  }
}

export { CARD_BY_ID };
