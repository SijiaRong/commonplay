import assert from 'node:assert/strict';
import {PartySession} from '../teddy-playground/dist/solo/party.js';

// Stand on each moving tile and let the actual wave drop the runner.
const session=new PartySession({seed:20261108,entrants:[{name:'玩家'}]});
session.start();
const show=session.show;
for(const index of [0,2]){
  show.startStage(index);
  show.startRace();
  const {path,colliders,trapZones}=show.stage;
  const [zone]=trapZones,entry=zone.checkpoint;
  const tiles=colliders.filter(c=>c.tag==='trap');
  const p=show.players[0],b=p.body;
  p.st.recovery=1;
  for(const tile of tiles){
    Object.assign(b,{x:tile.c0[0],y:tile.c0[1]+tile.hy+b.r+.05,z:tile.c0[2],
      vx:0,vy:0,vz:0,active:true});
    p.s=path.s[entry];p.safeS=p.s;
    p.trapZone=null;
    const previous=b.tp;
    for(let t=0;t<420&&b.tp===previous;t++)session.step();
    assert.notEqual(b.tp,previous,'fall must cause a respawn');
    assert.equal(p.sampleIdx,entry);
    assert.equal(b.x,path.x[entry]);
    assert.equal(b.z,path.z[entry]);
    assert.equal(b.vx,0);
    assert.equal(b.vz,0);
    for(let t=0;t<60;t++)session.step();
    assert(b.active&&b.grounded,'entrance must be solid');
  }
  // Drifting beyond the last row in midair must not unlock a forward respawn.
  const end=zone.last;
  Object.assign(b,{x:path.x[end],y:path.y[end]+3,z:path.z[end],grounded:false});
  p.s=path.s[end];show.track(p);assert.equal(p.trapZone,zone);
  b.y=path.y[end]+b.r;b.grounded=true;b.touchTag=null;
  show.track(p);assert.equal(p.trapZone,null);
  console.log('Stage',index+1,tiles.length,'tiles checked');
}
