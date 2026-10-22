/** Real local workerd/DO/WebSocket benchmark. Start wrangler on 8791 with an isolated --persist-to directory. */
import { writeFileSync } from 'node:fs';
import type { GameAction, Identity, RoomView, ActionReply } from '../src/shared/types.js';
const url=process.env.LOAD_WORKER_URL??'http://127.0.0.1:8791';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url))throw Error('This benchmark only creates rooms on an explicitly local workerd instance.');
const durationMs=Number(process.env.LOAD_DURATION_MS??10_000),clients:Peer[]=[],latencies:number[]=[],errors:string[]=[];
let actions=0,snapshots=0,maxHarnessRss=process.memoryUsage().rss;
interface Peer {socket:WebSocket;identity:Identity;room:RoomView;host:boolean;busy:boolean;lastAt:number;requests:Map<string,{resolve:(reply:ActionReply)=>void;timer:ReturnType<typeof setTimeout>}>}
const post=async(path:string,body:unknown)=>{const response=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'local-load-http'},body:JSON.stringify(body)});const result=await response.json() as any;if(!response.ok)throw Error(result.error);return result;};
async function connect(created:{identity:Identity;room:RoomView},host:boolean){
  const socket=new WebSocket(`${url.replace('http:','ws:')}/api/browser/ws/${created.identity.roomCode}`),peer:Peer={socket,...created,host,busy:false,lastAt:0,requests:new Map()};clients.push(peer);
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('worker sync timeout')),10_000);
    socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'auth',identity:peer.identity})));
    socket.addEventListener('error',()=>reject(Error('worker socket error')));
    socket.addEventListener('message',event=>{
      if(event.data==='pong')return;const message=JSON.parse(String(event.data));
      if(message.type==='auth-ok'){if(message.meta.authorityMode!=='worker')reject(Error('Expected server computation'));socket.send(JSON.stringify({type:'sync',requestId:crypto.randomUUID()}));}
      if(message.type==='snapshot'){if(message.room.version>=peer.room.version)peer.room=message.room;snapshots++;clearTimeout(timer);resolve();}
      if(message.type==='ack'){const waiting=peer.requests.get(message.requestId);if(waiting){clearTimeout(waiting.timer);peer.requests.delete(message.requestId);waiting.resolve(message.result);}}
      if(message.type==='error')errors.push(message.message);
    });
  });return peer;
}
async function act(peer:Peer,action:GameAction){
  peer.busy=true;peer.lastAt=performance.now();const at=peer.lastAt,requestId=crypto.randomUUID();
  try{
    const reply=await new Promise<ActionReply>((resolve,reject)=>{const timer=setTimeout(()=>{peer.requests.delete(requestId);reject(Error('worker ack timeout'));},8_000);peer.requests.set(requestId,{resolve,timer});peer.socket.send(JSON.stringify({type:'action',requestId,envelope:{actionId:crypto.randomUUID(),expectedVersion:peer.room.version,action}}));});
    latencies.push(performance.now()-at);if(reply.ok)actions++;else if(!/已有更新|画面已更新/.test(reply.error??''))errors.push(reply.error??'Action rejected');return reply;
  }catch(error){errors.push(String(error));return {ok:false} as ActionReply;}finally{peer.busy=false;}
}
const started=performance.now();
try{
  for(let index=0;index<30;index++){
    const host=await post('/api/browser/rooms',{name:`主${index}`,maxPlayers:2,timeoutSeconds:0,requestId:crypto.randomUUID()});await connect(host,true);
    const guest=await post(`/api/browser/rooms/${host.identity.roomCode}/join`,{name:`客${index}`});await connect(guest,false);
  }
  const full=await fetch(url+'/api/browser/rooms',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'local-load-http'},body:JSON.stringify({name:'第31间',requestId:crypto.randomUUID()})});if(full.status!==409)throw Error(`Room 31 must fail, received ${full.status}`);await full.body?.cancel();
  for(const peer of clients)peer.socket.send(JSON.stringify({type:'chat-send',requestId:crypto.randomUUID(),clientMessageId:crypto.randomUUID(),text:'30房服务端并发验收'}));
  const until=performance.now()+durationMs,inflight=new Set<Promise<unknown>>();
  while(performance.now()<until){
    for(const peer of clients){
      if(peer.busy||performance.now()-peer.lastAt<350)continue;const room=peer.room,self=room.players.find(player=>player.id===peer.identity.playerId);if(!self)continue;let action:GameAction|undefined;
      if(room.phase==='lobby'){if(!self.ready)action={type:'ready',ready:true};else if(peer.host&&room.players.length===2&&room.players.every(player=>player.ready&&player.connected))action={type:'start'};}
      else if(room.phase==='draft'&&room.draft?.order[room.draft.cursor]===self.id)action={type:'draft',characterId:room.draft.market[0]!};
      else if(room.phase==='selection'&&!self.selected)action={type:'select',characterIds:self.hand!.filter(id=>!self.used.includes(id)).slice(0,2)};
      else if(room.phase==='race'){if(room.pending)action={type:'choose',choiceId:room.pending.id,optionId:room.pending.options.find(option=>['skip','pass','decline'].includes(option.id))?.id??room.pending.options[0]!.id};else if(room.turnStage==='roll'&&!room.waitingFor&&room.racers.find(racer=>racer.id===room.currentRacerId)?.playerId===self.id)action={type:'roll'};}
      else if(room.phase==='results'&&peer.host)action={type:'next'};
      if(action){const operation=act(peer,action);inflight.add(operation);void operation.finally(()=>inflight.delete(operation));}
    }
    maxHarnessRss=Math.max(maxHarnessRss,process.memoryUsage().rss);await new Promise(resolve=>setTimeout(resolve,25));
  }
  await Promise.all(inflight);latencies.sort((a,b)=>a-b);const percentile=(p:number)=>Number((latencies[Math.min(latencies.length-1,Math.floor(latencies.length*p))]??0).toFixed(2));
  const capacity=(await(await fetch(url+'/api/browser/rooms')).json() as any).capacity;
  const result={date:new Date().toISOString(),backend:'local workerd + SQLite Durable Objects + real WebSocket',rooms:30,clients:60,durationMs,elapsedMs:Math.round(performance.now()-started),actions,snapshots,ackMs:{p50:percentile(.5),p95:percentile(.95),max:percentile(1)},maxHarnessRssMiB:Number((maxHarnessRss/1024/1024).toFixed(1)),capacity,errors,phases:[...new Set(clients.map(peer=>peer.room.phase))],notes:'Memory is the Node load harness; workerd process memory is measured separately. This local result does not measure production-region latency.'};
  if(process.env.LOAD_RESULT_PATH)writeFileSync(process.env.LOAD_RESULT_PATH,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  if(errors.length||actions<100)process.exitCode=1;
}finally{
  for(const peer of clients.filter(peer=>peer.host&&peer.socket.readyState===WebSocket.OPEN))await act(peer,{type:'close'});
  for(const peer of clients){for(const waiting of peer.requests.values())clearTimeout(waiting.timer);peer.socket.close();}
}
