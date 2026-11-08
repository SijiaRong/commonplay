import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import test from 'node:test';
import WebSocket from 'ws';

for (const variant of ['teddy','bubblecity']) test(variant+' rooms reject bad origins and support racing, spectators and reconnection', {timeout:15000}, async t=>{
  const server=spawn(process.execPath,['party-server.mjs', ...(variant==='bubblecity' ? ['--bubblecity'] : [])],{
    cwd:new URL('./',import.meta.url),env:{...process.env,PORT:'0',MAX_PLAYERS:'4'},stdio:['ignore','pipe','inherit']
  });
  t.after(()=>server.kill());
  let address;
  for await(const line of createInterface({input:server.stdout})){
    const match=line.match(/http:\/\/localhost:(\d+)/);
    if(match){address='127.0.0.1:'+match[1];break}
  }
  assert.ok(address,'server started');
  if(variant==='bubblecity'){
    const page=await fetch('http://'+address).then(r=>r.text());
    assert.match(page,/<title>泡泡星港 · Commonplay<\/title>/);
    assert.match(page,/name="party-endpoint"/);
    assert.equal((await fetch('http://'+address+'/editor/')).status,200);
  }
  const endpoint='ws://'+address+'/party';
  const invalid=new WebSocket(endpoint,{origin:'null'});
  const [error]=await once(invalid,'error');
  assert.match(error.message,/401/);

  async function join(profile){
    const ws=new WebSocket(endpoint,{origin:'http://'+address});
    t.after(()=>ws.terminate());
    const queue=[];
    ws.on('message',data=>queue.push(JSON.parse(data)));
    async function next(type){
      for(;;){
        const index=queue.findIndex(m=>m.type===type);
        if(index>=0)return queue.splice(index,1)[0];
        await once(ws,'message');
      }
    }
    await once(ws,'open');
    const send=m=>ws.send(JSON.stringify(m));
    send({type:'join',...profile});
    return {ws,next,send,...await next('joined')};
  }

  const host=await join({name:'Host'});
  const guest=await join({room:host.code,name:'Guest'});
  host.send({type:'start'});
  assert.equal((await guest.next('roster')).you,1);
  const {stage}=await guest.next('course');
  assert.equal(stage.path.x.length,stage.path.n);
  assert.equal((await guest.next('state')).state.runners.length,2);
  const spectator=await join({room:host.code,name:'Spectator'});
  assert.equal((await spectator.next('roster')).you,-1);
  guest.ws.terminate();
  await once(guest.ws,'close');
  const resumed=await join({room:host.code,token:guest.token});
  assert.equal(resumed.token,guest.token);
  assert.equal((await resumed.next('roster')).you,1);
  assert.equal((await resumed.next('state')).state.runners.length,2);
});
