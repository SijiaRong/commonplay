import http from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {createAuthority} from '../teddy-playground/dist/solo/authority.js';

const root=fileURLToPath(new URL('../teddy-playground/dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(resolve(root)+sep)||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return}
    if(!(await stat(path)).isFile()){res.writeHead(404).end();return}
    res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');
    if(req.method==='HEAD'){res.end();return}
    if(path===resolve(root,'index.html')){
      const html=await readFile(path,'utf8');
      res.end(html.replace('<head>','<head><meta name="solo-endpoint" content="/solo-session">'));
    } else createReadStream(path).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end()}
});
const sockets=new WebSocketServer({server,path:'/solo-session',maxPayload:2048,
  verifyClient:({origin,req})=>!origin||origin==='http://'+req.headers.host});
sockets.on('connection',socket=>{
  const authority=createAuthority(m=>{
    if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m,(_key,v)=>ArrayBuffer.isView(v)?Array.from(v):v));
  });
  socket.on('message',bytes=>{try{authority.receive(JSON.parse(bytes))}catch{socket.close(1003,'Invalid input')}});
  socket.on('error',()=>socket.terminate());
  socket.on('close',()=>authority.close());
});
server.listen(Number(process.env.PORT||4178),'0.0.0.0',()=>console.log('小熊单人闯关',server.address()));
