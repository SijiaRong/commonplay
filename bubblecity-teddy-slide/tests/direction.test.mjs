import assert from 'node:assert/strict';
import test from 'node:test';
import {SlideMode,downhillDegrees} from '../dist/slide/ground-motion.mjs';

test('a marked chute requires sustained downhill travel, even on a bank',()=>{
  const mode=new SlideMode();
  const step=(vx,vz)=>mode.update(1/60,{grounded:true,speed:Math.hypot(vx,vz),lockSlide:true,
    downhill:downhillDegrees(.5,Math.sqrt(.75),0,vx,vz)});
  for(let i=0;i<30;i++){
    assert.equal(step(-5,0),false);
    assert.equal(step(0,5),false);
    assert.equal(step(0,0),false);
  }
  for(let i=0;i<7;i++) assert.equal(step(5,0),false);
  assert.equal(step(5,0),true);
  assert.equal(step(-5,0),false);
});
