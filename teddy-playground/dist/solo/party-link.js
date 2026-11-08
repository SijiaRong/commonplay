// A room connection that looks like the solo worker port: postMessage / onmessage / onerror / terminate.
export function openParty(endpoint,join){
  const url=new URL(endpoint,location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(url),pending=[];
  let terminated=false,pinger=null;
  const port={
    onmessage:null,onerror:null,closed:false,
    postMessage(message){
      if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));
      else if(socket.readyState===WebSocket.CONNECTING)pending.push(message);
    },
    terminate(){terminated=true;pending.length=0;clearInterval(pinger);socket.close()}
  };
  socket.onopen=()=>{
    socket.send(JSON.stringify(join));
    for(const m of pending)socket.send(JSON.stringify(m));pending.length=0;
    pinger=setInterval(()=>port.postMessage({type:'ping',c:performance.now()}),5000);
  };
  socket.onmessage=e=>{let data;try{data=JSON.parse(e.data)}catch{return}port.onmessage?.({data})};
  socket.onclose=e=>{
    port.closed=true;clearInterval(pinger);
    if(terminated)return;
    // 1000: left or the room closed; 4000: the same seat connected from another tab.
    const final=e.code===1000||e.code===4000;
    port.onerror?.(Object.assign(new Error(e.reason||'与房间的连接已断开，正在重连…'),{final}));
  };
  return port;
}
