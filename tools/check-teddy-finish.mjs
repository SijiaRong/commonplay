import assert from 'node:assert/strict';
import {PartySession} from '../teddy-playground/dist/solo/party.js';

// Enter each actual finish trigger with forward momentum, then keep jumping through the results screen and
// (where present) the next draft. A finished runner stops on its celebration spot until it moves again.
const own=session=>{
  const state=session.snapshot(0),r=state.runners[0];
  return {...state,x:r[1],y:r[2],z:r[3],vx:r[4],vy:r[5],vz:r[6],grounded:!!(r[8]&1),placed:!!(r[8]&4)};
};
for(const [index,jumpHeight] of [[0,0],[0,10],[1,0],[2,0],[3,0],[4,0]]){
  const session=new PartySession({seed:20261108,entrants:[{name:'玩家'}]});
  const show=session.show;
  session.running=true;
  show.finishDraft();
  show.startStage(index);
  show.startRace();
  const {path,bowl,finish,penCenter,penHeading,final}=show.stage;
  const player=show.players[0],body=player.body;
  const floor=path.y[path.n-1];
  const forward=[Math.sin(penHeading),Math.cos(penHeading)];
  [body.x,body.y,body.z]=finish.c;
  const beyond=()=> (body.x-finish.c[0])*forward[0]+(body.z-finish.c[2])*forward[1];
  if(!bowl){
    body.x-=forward[0]*2;body.z-=forward[1]*2;
    body.y=floor+body.r+jumpHeight;
  }
  body.vx=forward[0]*14;body.vz=forward[1]*14;
  player.s=bowl?bowl.drainS:path.finishS;
  session.controls(0,...forward,0);
  session.step();
  if(!bowl){
    while(beyond()<0){
      assert.equal(player.finishOrder,-1);
      assert.equal(player.finishingRun,false);
      session.step();
      assert.ok(show.tick<200);
    }
    assert.equal(player.finishingRun,true);
    session.controls(0,-forward[0],-forward[1],7);
    while(player.finishOrder<0){
      const before=beyond();
      session.step();
      assert.ok(beyond()>=before-1e-7);
      assert.ok(show.tick<300);
    }
    assert.ok(beyond()>=3);
  }
  const arrived=own(session);
  assert.equal(arrived.placed,true);
  assert.equal(arrived.phase,final?'podium':'cut');
  assert.equal(player.score,final?6:3,'a lone finisher scores 3, double in the final');
  if(bowl)assert.deepEqual([arrived.x,arrived.z],[+penCenter[0].toFixed(2),+penCenter[2].toFixed(2)]);
  if(jumpHeight)assert.ok(arrived.y>floor+body.r+2);

  // Keep the stick and jump button released: the runner settles where it finished.
  session.controls(0,0,0,0);
  const phases=new Set();
  while(session.running&&show.stageIndex===index){
    const state=own(session);
    phases.add(state.phase);
    assert.ok(Math.hypot(state.x-arrived.x,state.z-arrived.z)<.2,'finished runner stays on its spot');
    if(state.tick-arrived.tick>90)assert.equal(state.grounded,true);
    assert.ok(state.tick-arrived.tick<2000,'stage should advance');
    session.step();
  }
  if(final)assert.equal(show.phase,'over');
  else{
    assert.ok(phases.has('draft'));
    assert.equal(show.stageIndex,index+1);
    assert.equal(own(session).placed,false);
    while(show.phase!=='race')session.step();
    const start=own(session);
    session.controls(0,0,1,0);
    for(let tick=0;tick<45;tick++)session.step();
    assert.ok(Math.hypot(body.x-start.x,body.z-start.z)>1);
  }
}
console.log('Teddy finish checks passed for grounded, airborne, bowl and final finishes.');
