import {enableRunnerHandling} from './runner-handling.js';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomInt} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';
import {ShowSession} from '../teddy-playground/dist/solo/shared/session.js';
import {PracticeSession} from './practice.js';

const files = new Map(['index.html','game.js','models.js','course.js','style.css'].map(name => ['/'+name,'public/'+name]));
files.set('/', 'public/index.html');
for (const path of ['shared/course.js','shared/physics.js','shared/rng.js',
  'js/render/courseView.js','js/render/geometry.js','js/render/textures.js']) {
  files.set('/track/'+path,'../teddy-playground/dist/solo/'+path);
}
files.set('/track/js/render/materials.js','public/track-materials.js');
for (const name of ['three.module.js','three.core.js']) files.set('/lib/'+name,'node_modules/three/build/'+name);
const server = http.createServer(async (req,res) => {
  const file = files.get(req.url.split('?')[0]);
  if (!file) return res.writeHead(404).end();
  try {
    const data = await readFile(new URL(file,import.meta.url));
    res.writeHead(200, {'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-cache'});
    res.end(data);
  } catch { res.writeHead(500).end(); }
});
const sockets = new WebSocketServer({
  server, path:'/race', maxPayload:2048,
  verifyClient({origin, req}) {
    return !origin || origin === 'http://' + req.headers.host;
  }
});
const practice = process.env.GAME_MODE !== 'race';
const members = new Map();
let session;
function send(ws, msg) { if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function lobby() {
  if(session) return;
  const players = [...members.values()];
  for(const [ws,name] of members) send(ws,{t:'lobby',players,host:ws === members.keys().next().value, name});
}
function start() {
  const entrants = [...members.values()].slice(0,50).map(name => ({name,skin:0,bot:false}));
  const seed = randomInt(0x7fffffff);
  session = new ShowSession({seed,entrants});
  enableRunnerHandling(session.show);
  session.show.players.forEach(p => {if(p.bot) p.name = '信使 '+String(p.id+1).padStart(2,'0');});
  let id = 0;
  for(const ws of members.keys()) session.attach(ws,id < 50 ? id++ : -1);
}
sockets.on('connection',ws => {
  send(ws,{t:'mode',practice});
  ws.on('error',()=>ws.terminate());
  ws.on('message', data => {
    let m;
    try {m=JSON.parse(data);} catch {return;}
    if(!m || typeof m !== 'object') return;
    if(!members.has(ws)) {
      if(m.t !== 'join') return;
      if(members.size >= 50) return ws.close(1008,'Room full');
      members.set(ws,String(m.name || '跑手').trim().slice(0,14) || '跑手');
      if(practice) {
        session ??= new PracticeSession(Number.isInteger(m.seed) && m.seed >= 0 && m.seed <= 0xffffffff ? m.seed : undefined);
        session.join(ws,members.get(ws));
      } else if(session) session.attach(ws,-1); else lobby();
    } else if(session) session.onMessage(ws,m);
    else if(m.t==='start' && ws === members.keys().next().value) start();
  });
  ws.on('close',()=>{ session?.detach(ws); members.delete(ws); if(!members.size) session=null; lobby(); });
});
let previous = performance.now();
let debt = 0;
setInterval(()=>{
  const now=performance.now();
  debt += Math.min(now-previous,200);
  previous=now;
  while(debt >= 1000/60) {
    debt -= 1000/60;
    if(session) {
      session.tick();
      if(session.over) {session=null; lobby();}
    }
  }
},8);
server.listen(Number(process.env.PORT || 4178),'0.0.0.0',()=>console.log('Commonplay listening on',server.address()));
