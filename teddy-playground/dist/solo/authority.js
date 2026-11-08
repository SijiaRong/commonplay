import {PartySession,MAX_FIELD} from './party.js';

// The solo authority: one human plus optional bots, stepped at 60 Hz. Runs in a browser worker (static hosting)
// or behind the solo socket of the local Node host. The party server sends the same course/state/roster messages.
export function createAuthority(send) {
  let session,stageSent=-1,last=performance.now(),balance=0,paused=false;
  function publish() {
    const state=session.snapshot(0);
    if(stageSent!==state.stage){
      send({type:'course',stage:session.show.stages[state.stage]});
      stageSent=state.stage;
    }
    send({type:'state',state});
    session.show.events.length=0;
  }
  function receive(m){
    if(!m || typeof m!=='object')return;
    if(m.type==='init'){
      if(session||!Number.isInteger(m.seed)||m.seed<0||m.seed>0xffffffff)return;
      const bots=Math.max(0,Math.min(MAX_FIELD-1,m.bots|0));
      const name=String(m.name||'我').slice(0,12)||'我';
      const pool=Array.isArray(m.pool)?m.pool.filter(id=>typeof id==='string').slice(0,32):[];
      session=new PartySession({seed:m.seed,bots,pool,entrants:[{name,character:typeof m.character==='string'?m.character:null}]});
      send({type:'roster',you:0,players:session.roster()});
      stageSent=-1;balance=0;last=performance.now();publish();return;
    }
    if(!session)return;
    if(m.type==='start'&&!session.running){session.start();last=performance.now();balance=0;publish()}
    if(m.type==='input')session.controls(0,m.x,m.z,m.btn);
    if(m.type==='pause'){paused=m.value;last=performance.now();balance=0;session.controls(0,0,0,0);session.edges[0]=0}
  };
  const timer=setInterval(()=>{
    const now=performance.now();
    if(!session?.running||paused){last=now;return}
    balance+=Math.min(.15,(now-last)/1000);last=now;
    let changed=false;
    while(balance>=1/60){session.step();balance-=1/60;changed=true}
    if(changed)publish();
  },1000/30);
  return {receive, close:()=>clearInterval(timer)};
}
