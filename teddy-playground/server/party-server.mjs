// 泡泡星城 · 局域网派对服务器
// Serves teddy-playground/dist and runs points races for rooms of up to MAX_PLAYERS people (bots optional).
//   npm install && npm start            → http://<this computer's LAN address>:4180
//   PORT=4180 MAX_PLAYERS=4 npm start   (MAX_PLAYERS may go up to 16)

import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream,readFileSync} from 'node:fs';
import {networkInterfaces} from 'node:os';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomInt} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {PartySession,MAX_FIELD} from '../dist/solo/party.js';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const PORT=Number(process.env.PORT||4180);
const configuredPlayers=Number(process.env.MAX_PLAYERS||4);
if(!Number.isInteger(configuredPlayers))throw new Error('MAX_PLAYERS must be an integer');
const MAX_PLAYERS=Math.max(1,Math.min(MAX_FIELD,configuredPlayers));
const PUBLISH_EVERY=2; // ticks between state messages: 30 per second
const RECONNECT_GRACE=90e3; // ms a dropped racer keeps their seat
const catalog=JSON.parse(readFileSync(resolve(root,'slide/characters.json'),'utf8')).characters;
const characterIds=new Set(catalog.filter(c=>c.ready).map(c=>c.id));
const pool=[...characterIds];

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.css':'text/css','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.hdr':'application/octet-stream','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(resolve(root)+sep)||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return}
    if(!(await stat(path)).isFile()){res.writeHead(404).end();return}
    res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');
    res.setHeader('Cache-Control',extname(path)==='.html'||extname(path)==='.js'?'no-cache':'public, max-age=3600');
    if(req.method==='HEAD'){res.end();return}
    if(path===resolve(root,'index.html')){
      const html=await readFile(path,'utf8');
      res.end(html.replace('<head>',`<head><meta name="party-endpoint" content="./party"><meta name="party-max" content="${MAX_PLAYERS}">`));
    }else createReadStream(path).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end()}
});

// ------------------------------------------------------------------ rooms

const rooms=new Map();
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(){
  for(;;){
    const code=Array.from({length:4},()=>CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    if(!rooms.has(code))return code;
  }
}
const encodeCourse=(_key,value)=>ArrayBuffer.isView(value)?Array.from(value):value;
function send(ws,message){
  if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message,message.type==='course'?encodeCourse:undefined));
}
const cleanName=value=>(typeof value==='string'?value:'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,12);

class Room{
  constructor(){
    this.code=newCode();
    this.members=[]; // {token,name,character,ws,seat,dropTimer}
    this.host=null;
    this.bots=0;
    this.session=null;
    this.timer=null;
    this.last=0;
    this.balance=0;
    this.lastResults=null;
    rooms.set(this.code,this);
  }
  get inGame(){return !!this.session?.running}
  connected(){return this.members.filter(m=>m.ws)}
  lobbyState(){
    return {type:'room',code:this.code,max:MAX_PLAYERS,field:MAX_FIELD,bots:this.bots,inGame:this.inGame,
      host:this.host?.token===undefined?null:this.members.indexOf(this.host),
      members:this.members.map(m=>({name:m.name,character:m.character,online:!!m.ws,racing:m.seat>=0&&this.inGame}))};
  }
  broadcastLobby(){
    const state=this.lobbyState();
    for(const m of this.members)send(m.ws,{...state,you:this.members.indexOf(m),isHost:m===this.host});
  }
  add(ws,{name,character,token}){
    let member=token&&this.members.find(m=>m.token===token);
    if(member){
      if(member.ws&&member.ws!==ws)member.ws.close(4000,'在别处重新连接');
      clearTimeout(member.dropTimer);member.dropTimer=null;
      member.ws=ws;
      if(name)member.name=name;
      if(!this.inGame&&characterIds.has(character))member.character=character;
      if(this.inGame&&member.seat>=0)this.session.reconnect(member.seat);
    }else{
      if(this.members.length>=MAX_PLAYERS)return {error:'房间已满（最多 '+MAX_PLAYERS+' 人）'};
      member={token:randomBytes(12).toString('hex'),name:name||'玩家'+(this.members.length+1),
        character:characterIds.has(character)?character:'teddy',ws,seat:-1,stageSent:-1,dropTimer:null};
      this.members.push(member);
    }
    if(!this.host||!this.host.ws)this.host=member;
    this.bots=Math.min(this.bots,MAX_FIELD-this.members.length);
    member.stageSent=-1;
    send(ws,{type:'joined',code:this.code,token:member.token});
    this.broadcastLobby();
    if(this.inGame)this.sendRace(member,true);
    else if(this.lastResults)send(ws,this.lastResults);
    return {member};
  }
  drop(member){
    member.ws=null;
    if(this.inGame&&member.seat>=0){
      // A bot steers until they come back.
      this.session.disconnect(member.seat);
      member.dropTimer=setTimeout(()=>this.remove(member),RECONNECT_GRACE);
    }else this.remove(member);
    if(this.host===member)this.host=this.connected()[0]||this.members[0]||null;
    this.broadcastLobby();
  }
  remove(member){
    clearTimeout(member.dropTimer);
    const index=this.members.indexOf(member);
    if(index<0)return;
    member.ws?.close(1000,'已离开房间');
    if(this.inGame&&member.seat>=0)this.session.disconnect(member.seat);
    this.members.splice(index,1);
    if(this.host===member)this.host=this.connected()[0]||this.members[0]||null;
    if(!this.members.length){this.close();return}
    this.broadcastLobby();
  }
  close(){
    clearInterval(this.timer);this.timer=null;
    for(const m of this.members)m.ws?.close(1000,'房间已关闭');
    rooms.delete(this.code);
  }
  start(){
    if(this.inGame)return;
    const racers=this.connected();
    if(!racers.length)return;
    for(const m of this.members)m.seat=-1;
    racers.forEach((m,i)=>{m.seat=i;m.stageSent=-1});
    this.session=new PartySession({seed:randomInt(0xffffffff),bots:Math.min(this.bots,MAX_FIELD-racers.length),pool,
      entrants:racers.map(m=>({name:m.name,character:m.character}))});
    this.session.start();
    this.lastResults=null;
    for(const m of this.members)this.sendRace(m,true);
    this.broadcastLobby();
    this.last=performance.now();this.balance=0;
    clearInterval(this.timer);
    this.timer=setInterval(()=>this.tick(),1000/60);
  }
  tick(){
    const session=this.session,now=performance.now();
    this.balance+=Math.min(.15,(now-this.last)/1000);this.last=now;
    let stepped=false;
    while(this.balance>=1/60&&session.running){
      session.step();this.balance-=1/60;stepped=true;
      if(session.show.tick%PUBLISH_EVERY===0)for(const m of this.members)this.sendRace(m);
      session.show.events.length=0;
    }
    if(stepped&&!session.running){
      for(const m of this.members)this.sendRace(m);
      clearInterval(this.timer);this.timer=null;
      this.lastResults={type:'results',board:session.snapshot(-1).board,roster:session.roster()};
      for(const m of [...this.members]){
        send(m.ws,this.lastResults);
        // Dropped racers who never came back leave once the race is over.
        if(!m.ws)this.remove(m);
      }
      if(rooms.has(this.code))this.broadcastLobby();
    }
  }
  sendRace(member,fresh=false){
    if(!member.ws||!this.session)return;
    const session=this.session,state=session.snapshot(member.seat);
    if(fresh)send(member.ws,{type:'roster',you:member.seat,players:session.roster()});
    if(member.stageSent!==state.stage){
      send(member.ws,{type:'course',stage:session.show.stages[state.stage]});
      member.stageSent=state.stage;
    }
    send(member.ws,{type:'state',state});
  }
}

// ------------------------------------------------------------------ sockets

const wss=new WebSocketServer({server,path:'/party',maxPayload:4096,
  verifyClient:({origin,req})=>origin===undefined||origin==='http://'+req.headers.host||origin==='https://'+req.headers.host});
wss.on('connection',(ws)=>{
  let room=null,member=null;
  ws.isAlive=true;
  ws.on('pong',()=>{ws.isAlive=true});
  ws.on('error',()=>ws.terminate());
  ws.on('message',bytes=>{
    let m;try{m=JSON.parse(bytes)}catch{ws.close(1003,'无效消息');return}
    if(!m||typeof m!=='object')return;
    if(m.type==='join'){
      if(member)return;
      const code=(typeof m.room==='string'?m.room:'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
      let target=code?rooms.get(code):new Room();
      if(!target){send(ws,{type:'error',message:'找不到房间 '+code+'，请检查房间码'});return}
      const result=target.add(ws,{name:cleanName(m.name),character:m.character,token:typeof m.token==='string'?m.token:null});
      if(result.error){send(ws,{type:'error',message:result.error});if(!target.members.length)target.close();return}
      room=target;member=result.member;return;
    }
    if(!member||member.ws!==ws)return;
    switch(m.type){
      case 'input':
        if(room.inGame&&member.seat>=0)room.session.controls(member.seat,m.x,m.z,Number.isInteger(m.btn)?m.btn:0);
        break;
      case 'profile':
        if(room.inGame)break;
        if(m.name!==undefined)member.name=cleanName(m.name)||member.name;
        if(characterIds.has(m.character))member.character=m.character;
        room.broadcastLobby();
        break;
      case 'bots':
        if(member!==room.host||room.inGame||!Number.isInteger(m.count))break;
        room.bots=Math.max(0,Math.min(MAX_FIELD-room.members.length,m.count|0));
        room.broadcastLobby();
        break;
      case 'start':
        if(member===room.host)room.start();
        break;
      case 'leave':
        room.remove(member);member=null;room=null;
        break;
      case 'ping':
        send(ws,{type:'pong',c:m.c});
        break;
    }
  });
  ws.on('close',()=>{if(member&&member.ws===ws)room.drop(member)});
});
setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;ws.ping()}},10e3);

server.listen(PORT,process.env.HOST||'0.0.0.0',()=>{
  const port=server.address().port;
  const addresses=Object.values(networkInterfaces()).flat().filter(a=>a&&a.family==='IPv4'&&!a.internal).map(a=>a.address);
  console.log(`泡泡星城派对服务器已启动（每个房间最多 ${MAX_PLAYERS} 人，含机器人最多 ${MAX_FIELD} 名选手）`);
  console.log(`  本机打开:   http://localhost:${port}`);
  for(const a of addresses)console.log(`  同一 Wi-Fi: http://${a}:${port}`);
});
