// Static hosting runs the authority in a worker. The local Node host supplies a
// private socket instead; the scene consumes exactly the same messages.
export function openAuthority() {
  const endpoint=document.querySelector('meta[name="solo-endpoint"]')?.content;
  if(!endpoint)return new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  const url=new URL(endpoint,location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(url),pending=[];
  let closed=false;
  const port={
    onmessage:null,onerror:null,
    postMessage(message){
      if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));
      else if(socket.readyState===WebSocket.CONNECTING)pending.push(message);
    },
    terminate(){closed=true;pending.length=0;socket.close()}
  };
  socket.onopen=()=>{for(const m of pending)port.postMessage(m);pending.length=0};
  socket.onmessage=e=>port.onmessage?.({data:JSON.parse(e.data)});
  socket.onclose=()=>{if(!closed)port.onerror?.(new Error('单人模拟连接已断开'))};
  return port;
}
