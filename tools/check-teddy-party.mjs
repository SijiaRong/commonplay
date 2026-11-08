import assert from 'node:assert/strict';
import {PartySession,stagePoints,MAX_FIELD} from '../teddy-playground/dist/solo/party.js';

// Points: first gets the most, every finisher scores, the final counts double.
assert.deepEqual([0,1,2,3].map(o=>stagePoints(o,4,false)),[6,4,2,1]);
assert.deepEqual([0,1,2,3].map(o=>stagePoints(o,4,true)),[12,8,4,2]);
assert.equal(stagePoints(-1,4,false),0);
assert.equal(stagePoints(0,1,false),3);

// Whole points races with absent humans (bots steer them) for a small room and a full field.
for(const [humans,bots] of [[2,2],[1,MAX_FIELD-1]]){
  const session=new PartySession({seed:42,bots,pool:['teddy','pip'],entrants:Array.from({length:humans},(_,i)=>({name:'玩家'+i,character:'tik'}))});
  const show=session.show;
  assert.equal(show.players.length,humans+bots);
  session.humans.forEach(p=>session.disconnect(p.id));
  session.start();
  const scored=[];
  for(let t=0;session.running&&t<60*60*20;t++){
    session.step();
    for(const e of show.events)if(e.e==='scores')scored.push(e);
    show.events.length=0;
  }
  assert.equal(show.phase,'over','the race reaches the podium');
  assert.equal(scored.length,5,'every stage is scored');
  for(const p of show.players){
    assert.ok(p.alive,'nobody is eliminated');
    assert.equal(p.score,p.stagePoints.reduce((a,b)=>a+b,0));
  }
  const standings=show.standings();
  for(let i=1;i<standings.length;i++)assert.ok(standings[i-1].score>=standings[i].score);
  assert.deepEqual(standings.map(p=>p.place),standings.map((_,i)=>i+1));
  const names=new Set(show.players.map(p=>p.name));
  assert.equal(names.size,show.players.length,'runner names are unique');
  console.log(`${humans+bots} runners: ${standings.slice(0,3).map(p=>p.name+' '+p.score).join(', ')}`);
}

// Bots finishing first don't start the clock; the first person home does.
{
  const session=new PartySession({seed:7,bots:3,entrants:[{name:'甲'},{name:'乙'}]});
  const show=session.show;
  session.start();
  while(show.phase!=='race')session.step();
  for(const p of show.players)if(!p.human)show.qualify(p);
  assert.equal(show.qualifiedCount,3);
  session.step();
  assert.equal(show.endAt,Infinity,'bots alone do not start the countdown');
  show.phaseEnd=show.tick+2; // first finisher just before the original race deadline
  show.qualify(show.players[0]);
  session.step();
  assert.ok(Number.isFinite(show.endAt)&&show.endAt-show.tick>25*60,'a person finishing starts a 30 s countdown');
  assert.ok(session.snapshot(1).graceLeft>25);
  session.step();
  assert.equal(show.phase,'race','the original deadline does not cut the grace period short');
  show.qualify(show.players[1]);
  session.step();
  assert.ok(show.endAt-show.tick<=4*60,'once every person is in the stage wraps up');
}
console.log('Teddy party checks passed.');
