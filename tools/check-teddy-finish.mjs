import assert from 'node:assert/strict';
import {SoloSession} from '../teddy-playground/dist/solo/backend.js';

// Enter each actual finish trigger with forward momentum, then keep moving
// and jumping through the results screen and (where present) the next draft.
for(const [index,jumpHeight] of [[0,0],[0,10],[1,0],[2,0],[3,0],[4,0]]){
  const session=new SoloSession(20261108);
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
  session.controls(...forward,0);
  session.step();
  if(!bowl){
    while(beyond()<0){
      assert.equal(player.finishOrder,-1);
      assert.equal(show.finishingRun,false);
      session.step();
      assert.ok(show.tick<200);
    }
    assert.equal(show.finishingRun,true);
    session.controls(-forward[0],-forward[1],7);
    while(player.finishOrder<0){
      const before=beyond();
      session.step();
      assert.ok(beyond()>=before-1e-7);
      assert.ok(show.tick<300);
    }
    assert.ok(beyond()>=3);
  }
  const arrived=session.snapshot();
  assert.equal(arrived.placed,true);
  assert.equal(arrived.phase,final?'podium':'cut');
  if(bowl)assert.deepEqual([arrived.x,arrived.z],[penCenter[0],penCenter[2]]);
  if(jumpHeight)assert.ok(arrived.y>floor+body.r+2);

  session.controls(-forward[0],-forward[1],7);
  const phases=new Set();
  while(session.running&&show.stageIndex===index){
    const state=session.snapshot();
    phases.add(state.phase);
    assert.deepEqual([state.x,state.z,state.vx,state.vz],[arrived.x,arrived.z,0,0]);
    if(state.tick-arrived.tick>60){
      assert.equal(state.y,floor+body.r);
      assert.equal(state.vy,0);
      assert.equal(state.grounded,true);
    }
    assert.ok(state.tick-arrived.tick<2000,'stage should advance');
    session.step();
  }
  if(final)assert.equal(show.phase,'over');
  else{
    assert.ok(phases.has('draft'));
    assert.equal(show.stageIndex,index+1);
    assert.equal(session.snapshot().placed,false);
    session.controls(0,0,0);
    while(show.phase!=='race')session.step();
    const start=session.snapshot();
    session.controls(0,1,0);
    for(let tick=0;tick<45;tick++)session.step();
    assert.ok(Math.hypot(body.x-start.x,body.z-start.z)>1);
  }
}
console.log('Teddy finish checks passed for grounded, airborne, bowl and final finishes.');
