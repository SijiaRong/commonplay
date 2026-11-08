import {Show,DUR} from './shared/sim.js';
import {GRAVITY,TICK_DT,stepWorld} from './shared/physics.js';
import {BTN_JUMP,controlStep} from './shared/control.js';
import {CARD_BY_ID} from './shared/cards.js';
import {makeRng} from './shared/rng.js';
import {plantFeet} from './runner-handling.js';

import {SlideMode} from '../slide/ground-motion.mjs';

// One human, no matchmaking or filler bots. The original Show still owns the
// draft, collision world, checkpoints, stage transitions and five-stage podium.
class SoloShow extends Show {
  startDraft(round) {
    super.startDraft(round);
    if(round===0)return;
    const player=this.players[0];
    const rng=makeRng(crypto.getRandomValues(new Uint32Array(1))[0]);
    const index=rng.int(0,player.draft.options.length-1);
    this.choose(player.id,index);
    this.phaseEnd=this.tick+Math.round(2/TICK_DT);
  }

  startStage(index) {
    super.startStage(index);
    this.slideMode=new SlideMode();
    this.slidePieces=this.stage.pieces.filter(piece=>['shortSlide','curvedSlide'].includes(piece.name));
    this.finishingRun=false;
    this.players[0].trapZone=null;
    const body=this.players[0].body;
    [body.x,body.y,body.z]=this.stage.grid[5];
    body.y+=body.r-.5;
    this.players[0].ctl.headStartT=0;
  }

  track(player) {
    super.track(player);
    const {path,trapZones}=this.stage;
    const i=player.sampleIdx,body=player.body;
    const zone=player.trapZone ?? trapZones.find(z=>i>=z.first && i<=z.last);
    if(!zone)return;
    player.trapZone=zone;
    const anchor=zone.checkpoint;
    const forward=(body.x-path.x[anchor])*path.tx[anchor]+(body.z-path.z[anchor])*path.tz[anchor];
    const distance=path.s[anchor]+forward;
    const slope=(path.y[zone.exit]-path.y[anchor])/(path.s[zone.exit]-path.s[anchor]);
    const surface=path.y[anchor]+forward*slope;
    // A lowering tile can still report ground contact below the normal deck.
    if(body.y<surface-1){
      this.respawnAfterFall(player);
      return;
    }
    const onDeck=body.grounded && body.touchTag!=='trap' &&
      Math.abs(body.y-body.r-path.y[i])<.65;
    if(onDeck && (distance>=path.s[zone.exit]+body.r || distance<path.s[zone.first]-body.r)){
      player.trapZone=null;
    }
  }

  atFinish(player) {
    const {bowl,finish,penHeading,path}=this.stage;
    if(bowl)return super.atFinish(player);
    const b=player.body,dx=b.x-finish.c[0],dz=b.z-finish.c[2];
    const fx=Math.sin(penHeading),fz=Math.cos(penHeading);
    const forward=dx*fx+dz*fz,side=dx*fz-dz*fx;
    // Use the painted stripe's center plane even when a high jump clears the arch.
    return player.s>=path.finishS-4 && b.y>=path.y[path.n-1]-.2 &&
      forward>=0 && forward<=path.length-path.finishS && Math.abs(side)<=finish.hx;
  }

  qualify(player) {
    if(!this.stage.bowl){
      const {finish,penHeading}=this.stage,b=player.body;
      const fx=Math.sin(penHeading),fz=Math.cos(penHeading);
      const beyond=(b.x-finish.c[0])*fx+(b.z-finish.c[2])*fz;
      // Give the visual rider room to clear the entire 1.6-unit stripe before turning.
      if(beyond<3){
        this.finishingRun=true;
        const speed=Math.max(6,b.vx*fx+b.vz*fz);
        b.vx=fx*speed;b.vz=fz*speed;
        return;
      }
    }
    this.finishingRun=false;
    super.qualify(player);
    const {body}=player,{path,bowl,penCenter}=this.stage;
    this.finishHeight=path.y[path.n-1]+body.r;
    body.vx=body.vz=0;
    if(bowl){
      // The finish trigger is inside the drain. Celebrate on its exit platform.
      body.x=penCenter[0];body.z=penCenter[2];body.y=this.finishHeight;
      player.sampleIdx=path.n-1;
      body.tp=(body.tp+1)&255;
    }
    body.grounded=body.y<=this.finishHeight+.02;
    body.groundT=body.grounded?0:1;
    body.gnx=body.gnz=0;body.gny=1;
    if(body.grounded){body.y=this.finishHeight;body.vy=0}
  }

  perkMods(player,aliveN){
    super.perkMods(player,aliveN);
    if(this.slideMode.sliding&&player.body.grounded){
      player.mods.speed*=1.75;
      player.mods.accel*=2.4;
    }
  }

  simulate(frozen) {
    const player=this.players[0];
    if(frozen && (this.phase==='intro'||this.phase==='countdown')){
      const b=player.body,gate=this.stage.colliders[this.stage.gate],path=this.stage.path;
      plantFeet(player);
      controlStep(b,player.ctl,{...player.input,btn:player.input.btn & BTN_JUMP},player.st,null);
      stepWorld(this.world,this.bodies,this.stageTime()-TICK_DT);
      // The start platform faces +Z in stage space; stages are translated without rotation.
      // Constrain aerial movement too, including a second jump above either rail.
      const half=path.hw[0]-b.r;
      const x=Math.max(gate.c[0]-half,Math.min(gate.c[0]+half,b.x));
      const z=Math.max(path.z[0]+b.r,Math.min(gate.c[2]-gate.hz-b.r,b.z));
      if(x!==b.x){b.x=x;b.vx=0}
      if(z!==b.z){b.z=z;b.vz=0}
      return;
    }
    if(player.finishOrder<0){
      if(this.phase==='race'&&player.body.active){
        const b=player.body,path=this.stage.path,i=player.sampleIdx;
        const onSlide=this.slidePieces.some(piece=>player.s>=piece.s0&&player.s<piece.s1);
        const sliding=this.slideMode.update(TICK_DT,{grounded:b.grounded,normalY:b.gny,
          speed:Math.hypot(b.vx,b.vz),lockSlide:onSlide||b.gny<0,jump:b.groundT>.16});
        if(sliding&&b.grounded){
          const fx=path.tx[i],fz=path.tz[i],input=player.input;
          const side=input.mx*fz-input.mz*fx;
          const brake=Math.max(0,-input.mx*fx-input.mz*fz);
          // Steer across the chute; pulling back eases the automatic forward drive.
          player.input={mx:fx*(1-.55*brake)+fz*side*.75,mz:fz*(1-.55*brake)-fx*side*.75,btn:input.btn};
          try{return super.simulate(frozen)}finally{player.input=input}
        }
        if(!sliding)plantFeet(player);
      }else this.slideMode.reset();
      return super.simulate(frozen);
    }
    // A jumping finish still lands under gravity; the runner stays at the celebration spot.
    const {body}=player;
    if(body.grounded)return;
    body.vy-=GRAVITY*body.gravity*TICK_DT;
    body.y+=body.vy*TICK_DT;
    if(body.y<=this.finishHeight){
      body.y=this.finishHeight;body.vy=0;
      body.grounded=true;body.groundT=0;
    }
  }
}

export class SoloSession {
  constructor(seed) {
    this.show=new SoloShow({seed,fieldSize:1,entrants:[{name:'玩家',loadout:{deck:['polish','rubber','spring','gyro','feather','grip','turbo','headstart','aero','tailwind','recovery','double','pogo','momentum','rocket','slingshot']}}]});

    this.running=false;
    this.input={x:0,z:0,btn:0};
    this.edges=0;
  }
  start() {
    if(this.running||this.show.phase!=='starter')return;
    const show=this.show,p=show.players[0];
    const rng=makeRng(crypto.getRandomValues(new Uint32Array(1))[0]);
    const shuffled=rng.shuffle([...p.loadout.deck]);
    this.starters=[];
    let hasActive=false;
    for(const id of shuffled){
      const active=CARD_BY_ID[id].kind==='active';
      if(active&&hasActive)continue;
      this.starters.push(id);
      hasActive ||= active;
      if(this.starters.length===p.draft.need)break;
    }
    p.draft.options=this.starters;
    this.starters.forEach((_,index)=>show.choose(0,index));
    show.finishDraft();
    show.startStage(0);
    this.running=true;
  }
  controls(x,z,btn) {
    this.edges|=btn & ~this.input.btn;
    this.input={x,z,btn};
  }
  step() {
    if(!this.running)return;
    const show=this.show,p=show.players[0],input=this.input;
    if(show.phase==='race'){
      // In validation mode one can stop to inspect a fork or moving obstacle.
      p.progT=p.stuckT=0;
      show.phaseEnd=show.tick+3600;
    }
    if(show.finishingRun){
      const heading=show.stage.penHeading;
      show.setInput(0,Math.sin(heading),Math.cos(heading),0);
    }else show.setInput(0,input.x,input.z,input.btn|this.edges);
    this.edges=0;show.step();
    if(show.phase==='over')this.running=false;
  }
  snapshot(){
    const s=this.show,p=s.players[0],b=p.body,stage=s.stage||s.stages[0];
    const spawn=stage.grid[5],started=!!s.stage;
    return {phase:this.running||s.phase==='over'?s.phase:'ready',tick:s.tick,stage:stage.index,
      clock:started?s.stageTime():0,seconds:(s.tick-s.raceTick)/60,
      awarded:s.phase==='draft'?[p.draft.options[p.draft.picked]]:
        stage.index===0&&s.phase==='intro'?this.starters:null,
      gateSeconds:s.phase==='intro'?Math.ceil((s.phaseEnd-s.tick)/60)+DUR.countdown:
        s.phase==='countdown'?Math.ceil((s.phaseEnd-s.tick)/60):null,
      remaining:Math.max(0,Math.ceil((s.phaseEnd-s.tick)/60)),
      x:started?b.x:spawn[0],y:started?b.y:spawn[1],z:started?b.z:spawn[2],
      sliding:!!s.slideMode?.sliding&&p.finishOrder<0&&b.active,vx:b.vx,vy:b.vy,vz:b.vz,r:b.r,tp:b.tp,grounded:b.groundT<.10,
      nx:b.gnx,ny:b.gny,nz:b.gnz,active:!started||b.active,
      s:p.s,sample:p.sampleIdx??0,placed:p.finishOrder>=0,ability:p.st.active?.id||''};
  }
}
