/** Local actual Socket.IO protocol benchmark. No deployment or credentials. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/server/index.js';
import type { GameAction, Identity, RoomView } from '../src/shared/types.js';

const durationMs=Number(process.env.LOAD_DURATION_MS??10000),folder=mkdtempSync(join(tmpdir(),'athlete-load-')),app=createApplication(join(folder,'load.sqlite'));
const sockets:Socket[]=[],latency:number[]=[],errors:string[]=[];let actions=0,snapshots=0,maxRss=process.memoryUsage().rss;
const lag=monitorEventLoopDelay({resolution:10});lag.enable();const started=performance.now();
try{
  await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));
  const address=app.http.address();if(!address||typeof address==='string')throw Error('No listen address');const url=`http://127.0.0.1:${address.port}`;
  const post=async(path:string,body:unknown)=>{const response=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json() as any;if(!response.ok)throw Error(result.error);return result;};
  interface Peer {socket:Socket;identity:Identity;room:RoomView;busy:boolean;lastAt:number;host:boolean}
  const peers:Peer[]=[];
  for(let index=0;index<30;index++){
    const host=await post('/api/rooms',{name:`主${index}`,maxPlayers:2,timeoutSeconds:0,requestId:crypto.randomUUID()});
    const guest=await post(`/api/rooms/${host.identity.roomCode}/join`,{name:`客${index}`});
    for(const [created,isHost]of [[host,true],[guest,false]] as const){
      const socket=io(url,{transports:['websocket'],auth:created.identity,reconnection:false});sockets.push(socket);
      const peer:Peer={socket,identity:created.identity,room:created.room,busy:false,lastAt:0,host:isHost};peers.push(peer);
      socket.on('snapshot',(room:RoomView)=>{peer.room=room;snapshots++;});socket.on('connect_error',error=>errors.push(error.message));
      await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);setTimeout(()=>reject(Error('connect timeout')),5000).unref();});
    }
  }
  const act=(peer:Peer,action:GameAction)=>{
    peer.busy=true;peer.lastAt=performance.now();const at=peer.lastAt;
    peer.socket.timeout(5000).emit('action',{actionId:crypto.randomUUID(),expectedVersion:peer.room.version,action},(error:Error|null,result:{ok:boolean;error?:string})=>{
      peer.busy=false;latency.push(performance.now()-at);if(error)errors.push(error.message);else if(!result.ok&&!result.error?.includes('画面已更新'))errors.push(result.error??'Action failed');else if(result.ok)actions++;
    });
  };
  for(const peer of peers)peer.socket.emit('chat-send',{clientMessageId:crypto.randomUUID(),text:'30房实际协议并发验收'},()=>{});
  const playUntil=performance.now()+durationMs;
  while(performance.now()<playUntil){
    for(const peer of peers){
      if(peer.busy||performance.now()-peer.lastAt<300)continue;const room=peer.room,self=room.players.find(p=>p.id===peer.identity.playerId);if(!self)continue;
      if(room.phase==='lobby'){if(!self.ready)act(peer,{type:'ready',ready:true});else if(peer.host&&room.players.length===2&&room.players.every(p=>p.ready&&p.connected))act(peer,{type:'start'});}
      else if(room.phase==='draft'&&room.draft?.order[room.draft.cursor]===self.id)act(peer,{type:'draft',characterId:room.draft.market[0]!});
      else if(room.phase==='selection'&&!self.selected)act(peer,{type:'select',characterIds:self.hand!.slice(0,2)});
      else if(room.phase==='race'){if(room.pending)act(peer,{type:'choose',choiceId:room.pending.id,optionId:room.pending.options[0]!.id});else if(room.turnStage==='roll'&&room.racers.find(r=>r.id===room.currentRacerId)?.playerId===self.id)act(peer,{type:'roll'});}
      else if(room.phase==='results'&&peer.host)act(peer,{type:'next'});
    }
    maxRss=Math.max(maxRss,process.memoryUsage().rss);await new Promise(resolve=>setTimeout(resolve,25));
  }
  await new Promise(resolve=>setTimeout(resolve,500));latency.sort((a,b)=>a-b);
  const percentile=(p:number)=>Number((latency[Math.min(latency.length-1,Math.floor(latency.length*p))]??0).toFixed(2));
  const result={date:new Date().toISOString(),backend:'local Node + SQLite + real WebSocket Socket.IO',rooms:30,clients:60,durationMs,elapsedMs:Math.round(performance.now()-started),actions,snapshots,ackMs:{p50:percentile(.5),p95:percentile(.95),max:percentile(1)},eventLoopMs:{mean:Number((lag.mean/1e6).toFixed(2)),p95:Number((lag.percentile(95)/1e6).toFixed(2))},maxRssMiB:Number((maxRss/1024/1024).toFixed(1)),errors,phases:[...new Set(peers.map(peer=>peer.room.phase))],capacity:app.rooms.capacity()};
  if(process.env.LOAD_RESULT_PATH)writeFileSync(process.env.LOAD_RESULT_PATH,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  if(errors.length||actions<100)process.exitCode=1;
}finally{for(const socket of sockets)socket.disconnect();lag.disable();await app.close();rmSync(folder,{recursive:true,force:true});}
