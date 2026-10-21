import { PUBLIC_EVENT_BATCH_BYTES, validatePublicEventBatch } from '../shared/public-events.js';
import { DurableObject } from 'cloudflare:workers';
import { MAX_SPECTATORS, PLAYER_COLORS, ROOM_TTL_MS, RULES_STATUS } from '../shared/constants.js';
import type { ActionEnvelope, ActionReply, GameMode, Identity, Phase, RoomSummary, RoomView } from '../shared/types.js';
import type { RelayJoinReply, RelayMetadata, RelayServerMessage } from '../shared/relay.js';
import { personalRoom, roomExpiry, type RoomClosure, type RoomCloseReason } from '../shared/room-lifecycle.js';

interface Env { ROOMS: DurableObjectNamespace<RoomRelay>; ASSETS: Fetcher }
interface StoredMember { isAI?:boolean; id:string; name:string; seat:number; tokenHash:string }
interface StoredSpectator { id:string; name:string; tokenHash:string }
interface RoomRecord {
  mode?:GameMode; code:string; authorityId:string; adminHostId:string; maxPlayers:number; timeoutSeconds:number;
  phase:Phase; createdAt:number; expiresAt:number; members:StoredMember[]; spectators?:StoredSpectator[];
  joiningLockId?:string;
  pendingClose?:{actorId:string;requestId:string;duplicateRequestIds?:string[];envelope:ActionEnvelope};
  closedAt?:number;
  hostLeftAt?:number;
  hostSeenAt?:number;
}
interface Connection {
  connectionId:string; acceptedAt:number; playerId?:string; authority?:boolean; authorityLeaseAt?:number; hostLeaseAt?:number;
  windowAt:number; count:number;
}
const CODE = /^[A-Z2-9]{6}$/;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PHASES = new Set<Phase>(['lobby','draft','selection','race','results','finished','paused']);
const AUTH_TIMEOUT_MS = 10_000;
const AUTHORITY_LEASE_MS = 35_000;
const DIRECTORY_ID = '__room_directory__';
const ROOM_CLOSED_MESSAGE = '房间已解散，请创建或加入其他房间。';
const CLIENT_BYTES = 8_192;
const HOST_BYTES = 262_144;
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const requestWindows = new Map<string,{ at:number; count:number }>();

class HttpError extends Error { constructor(readonly status:number,message:string) { super(message); } }
const json = (body:unknown,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const object = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const textId = (value:unknown,max=100):value is string => typeof value==='string' && value.length>0 && value.length<=max && !/[\p{Cc}\p{Cf}]/u.test(value);
const phase = (value:unknown):value is Phase => typeof value==='string' && PHASES.has(value as Phase);
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sha256 = async(value:string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function constantEqual(a:string,b:string):boolean { if(a.length!==b.length)return false; let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0; }
function name(value:unknown):string {
  if(typeof value!=='string')throw new HttpError(400,'请输入昵称。');
  const result=value.trim();
  if(!result||result.length>20||/[\p{Cc}\p{Cf}]/u.test(result))throw new HttpError(400,'昵称需为1～20个字，不能含控制字符。');
  return result;
}
function only(value:Record<string,unknown>,keys:string[]):boolean { return Object.keys(value).every(key=>keys.includes(key)); }
async function body(request:Request):Promise<Record<string,unknown>> {
  if(Number(request.headers.get('content-length'))>4096)throw new HttpError(413,'请求内容过大。');
  if(!request.body)throw new HttpError(400,'缺少请求内容。');
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try { for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>4096){await reader.cancel();throw new HttpError(413,'请求内容过大。');}chunks.push(item.value);} }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'请求格式不正确。');}
  if(!object(parsed))throw new HttpError(400,'请求格式不正确。');return parsed;
}
function httpRate(request:Request):boolean {
  const now=Date.now(),key=request.headers.get('CF-Connecting-IP')??'local';
  let current=requestWindows.get(key);
  if(!current||now-current.at>60_000){current={at:now,count:0};requestWindows.set(key,current);}
  if(requestWindows.size>2048){for(const [address,window] of requestWindows)if(now-window.at>60_000)requestWindows.delete(address);if(requestWindows.size>2048)requestWindows.delete(requestWindows.keys().next().value!);}
  return ++current.count<=120;
}
function originAllowed(request:Request):boolean { const origin=request.headers.get('Origin');return origin===null||origin===new URL(request.url).origin; }
function parseIdentity(value:unknown):Identity|null {
  if(!object(value)||!only(value,['roomCode','playerId','token','role'])||(value.role!==undefined&&value.role!=='player'&&value.role!=='spectator')||typeof value.roomCode!=='string'||!CODE.test(value.roomCode)||typeof value.playerId!=='string'||!UUID.test(value.playerId)||typeof value.token!=='string'||!TOKEN.test(value.token))return null;
  return value as unknown as Identity;
}
function actionEnvelope(value:unknown):value is ActionEnvelope {
  if(!object(value)||!only(value,['actionId','expectedVersion','action'])||typeof value.actionId!=='string'||!UUID.test(value.actionId)||!Number.isSafeInteger(value.expectedVersion)||(value.expectedVersion as number)<0||!object(value.action))return false;
  const a=value.action;
  switch(a.type){
    case 'ready':return only(a,['type','ready'])&&typeof a.ready==='boolean';
    case 'start':case 'roll':case 'next':case 'rematch':case 'close':return only(a,['type']);
    case 'draft':return only(a,['type','characterId'])&&textId(a.characterId,50);
    case 'practice-team':return only(a,['type','characterIds'])&&Array.isArray(a.characterIds)&&a.characterIds.length===4&&a.characterIds.every(id=>textId(id,50));
    case 'select':return only(a,['type','characterIds'])&&Array.isArray(a.characterIds)&&a.characterIds.length>=1&&a.characterIds.length<=2&&a.characterIds.every(id=>textId(id,50));
    case 'choose':return only(a,['type','choiceId','optionId'])&&textId(a.choiceId)&&textId(a.optionId);
    case 'transfer':return only(a,['type','playerId'])&&typeof a.playerId==='string'&&UUID.test(a.playerId);
    default:return false;
  }
}
function actionReply(value:unknown):value is ActionReply {
  return object(value)&&only(value,['ok','error','version','duplicate'])&&typeof value.ok==='boolean'&&(value.error===undefined||textId(value.error,1000))&&(value.version===undefined||(Number.isSafeInteger(value.version)&&(value.version as number)>=0))&&(value.duplicate===undefined||typeof value.duplicate==='boolean');
}

export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    try {
      const url=new URL(request.url);
      if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
      if(!originAllowed(request))return json({error:'来源不被允许。'},403);
      if(!httpRate(request))return json({error:'请求太频繁，请稍后再试。'},429);
      if(url.pathname==='/api/browser/health'&&request.method==='GET')return json({ok:true,hosting:'browser',transport:'durable-object-websocket'});
      if(url.pathname==='/api/browser/rooms'&&request.method==='GET')return env.ROOMS.get(env.ROOMS.idFromName(DIRECTORY_ID)).fetch('https://room.internal/directory/list');
      if(url.pathname==='/api/browser/rooms'&&request.method==='POST'){
        const input=await body(request);
        if(!only(input,['name','maxPlayers','timeoutSeconds','mode','aiCount']))throw new HttpError(400,'请求包含未知字段。');
        const nickname=name(input.name),mode=input.mode??'multiplayer',aiCount=input.aiCount??3,timeoutSeconds=input.timeoutSeconds??120;
        if(typeof mode!=='string'||!['multiplayer','practice','ai'].includes(mode))throw new HttpError(400,'比赛模式无效。');
        if(input.aiCount!==undefined&&(!Number.isInteger(aiCount)||(aiCount as number)<1||(aiCount as number)>7))throw new HttpError(400,'AI人数需为1～7。');
        const maxPlayers=mode==='practice'?1:mode==='ai'?(aiCount as number)+1:input.maxPlayers??8;
        if(!Number.isInteger(maxPlayers)||(maxPlayers as number)<(mode==='practice'?1:2)||(maxPlayers as number)>8)throw new HttpError(400,'房间人数需为2～8人。');
        if(!Number.isInteger(timeoutSeconds)||(timeoutSeconds!==0&&((timeoutSeconds as number)<30||(timeoutSeconds as number)>600)))throw new HttpError(400,'超时需为0或30～600秒。');
        for(let attempt=0;attempt<5;attempt++){
          const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>codeAlphabet[b%codeAlphabet.length]).join('');
          const response=await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://room.internal/create/'+code,{method:'POST',body:JSON.stringify({name:nickname,maxPlayers,timeoutSeconds,mode,aiCount})});
          if(response.status!==409)return response;
        }
        return json({error:'暂时无法分配房间码，请稍后再试。'},503);
      }
      const joining=url.pathname.match(/^\/api\/browser\/rooms\/([A-Z2-9]{6})\/join$/i);
      if(joining&&request.method==='POST'){
        const input=await body(request);if(!only(input,['name','role']))throw new HttpError(400,'请求包含未知字段。');
        if(input.role!==undefined&&input.role!=='player'&&input.role!=='spectator')throw new HttpError(400,'加入身份无效。');
        const code=joining[1]!.toUpperCase();
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://room.internal/join/'+code,{method:'POST',body:JSON.stringify({name:name(input.name),role:input.role??'player'})});
      }
      const leaving=url.pathname.match(/^\/api\/browser\/rooms\/([A-Z2-9]{6})\/leave$/i);
      if(leaving&&request.method==='POST'){
        const identity=parseIdentity(await body(request)),code=leaving[1]!.toUpperCase();
        if(!identity||identity.roomCode!==code)throw new HttpError(400,'退出凭据格式不正确。');
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch('https://room.internal/leave/'+code,{method:'POST',body:JSON.stringify(identity)});
      }
      const upgrading=url.pathname.match(/^\/api\/browser\/ws\/([A-Z2-9]{6})$/i);
      if(upgrading&&request.method==='GET'){
        if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'此地址需要WebSocket连接。'},426);
        const code=upgrading[1]!.toUpperCase();
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request('https://room.internal/ws/'+code,request));
      }
      return json({error:'接口不存在。'},404);
    } catch(error) { return json({error:error instanceof HttpError?error.message:'中继暂时不可用，请保留网页并稍后重试。'},error instanceof HttpError?error.status:503); }
  },
};

/** This object authenticates and routes. It deliberately never imports the game engine. */
export class RoomRelay extends DurableObject<Env> {
  private record:RoomRecord|null=null;
  private closed:RoomClosure|null=null;
  private readonly snapshots=new Map<string,RoomView>();
  private serial:Promise<unknown>=Promise.resolve();
  constructor(ctx:DurableObjectState,env:Env){
    super(ctx,env);
    ctx.blockConcurrencyWhile(async()=>{
      this.record=await ctx.storage.get<RoomRecord>('room')??null;this.closed=await ctx.storage.get<RoomClosure>('closed')??null;
      if(this.record&&personalRoom(this.record)&&this.record.closedAt!==undefined){await this.closePersonal('dismissed',this.record.closedAt);return;}
      // Hibernation preserves sockets and their platform ping timestamps. A
      // genuine restart without sockets starts (or preserves) owner absence.
      if(this.record&&personalRoom(this.record)&&this.record.closedAt===undefined)await this.refreshHostPresence(this.record.hostSeenAt===undefined?Date.now():Math.min(Date.now(),this.record.hostSeenAt+AUTHORITY_LEASE_MS));
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  private run<T>(operation:()=>Promise<T>):Promise<T>{const next=this.serial.then(operation,operation);this.serial=next.catch(()=>{});return next;}
  private attachment(socket:WebSocket):Connection|null { try{return socket.deserializeAttachment() as Connection|null;}catch{return null;} }
  private sockets():WebSocket[]{return this.ctx.getWebSockets().filter(socket=>socket.readyState===WebSocket.OPEN);}
  private expiry(room=this.record!):number {return roomExpiry(room);}
  private spectator(playerId:string):StoredSpectator|undefined {return this.record?.spectators?.find(person=>person.id===playerId);}
  private participant(playerId:string):StoredMember|StoredSpectator|undefined {return this.record?.members.find(person=>person.id===playerId)??this.spectator(playerId);}
  private summary():RoomSummary {
    const room=this.record!;
    return {code:room.code,hostName:room.members.find(person=>person.id===room.adminHostId)?.name??room.members[0]?.name??'房主',phase:room.phase,playerCount:room.members.length,maxPlayers:room.maxPlayers,spectatorCount:(room.spectators??[]).filter(person=>this.online(person.id)).length,createdAt:room.createdAt,expiresAt:this.expiry(),authorityOnline:!!this.authority(),mode:room.mode??'multiplayer'};
  }
  private async publishDirectory():Promise<void> {
    if(!this.env.ROOMS||!this.record)return;
    const room=this.record,listed=room.mode!=='practice'&&room.closedAt===undefined&&this.expiry(room)>Date.now();
    // A transient directory failure must never turn an already committed room
    // or identity into a misleading failed join. Auth/reconnect retries publish.
    try{const response=await this.env.ROOMS.get(this.env.ROOMS.idFromName(DIRECTORY_ID)).fetch('https://room.internal/directory/'+(listed?'upsert':'remove'),{method:'POST',body:JSON.stringify(listed?this.summary():{code:room.code})});await response.body?.cancel();}catch{}
  }
  private async directory(request:Request,operation:string):Promise<Response> {
    if(operation==='upsert'&&request.method==='POST'){
      const entry=await request.json() as RoomSummary;
      if(!CODE.test(entry.code))throw new HttpError(400,'房间码格式不正确。');
      if(entry.mode==='practice')await this.ctx.storage.delete('directory:'+entry.code);else await this.ctx.storage.put('directory:'+entry.code,entry);return json({ok:true});
    }
    if(operation==='remove'&&request.method==='POST'){
      const entry=await request.json() as {code:string};if(!CODE.test(entry.code))throw new HttpError(400,'房间码格式不正确。');
      await this.ctx.storage.delete('directory:'+entry.code);return json({ok:true});
    }
    if(operation==='list'&&request.method==='GET'){
      const entries:RoomSummary[]=[];let startAfter:string|undefined;
      for(;;){
        const page=await this.ctx.storage.list<RoomSummary>({prefix:'directory:',limit:1000,...(startAfter?{startAfter}:{})});
        entries.push(...page.values());if(page.size<1000)break;startAfter=[...page.keys()].at(-1)!;
      }
      const rooms:RoomSummary[]=[];
      for(let offset=0;offset<entries.length;offset+=20){
        const results=await Promise.all(entries.slice(offset,offset+20).map(async entry=>{
          const key='directory:'+entry.code;
          if(entry.mode==='practice'||(entry.mode==='ai'?entry.expiresAt:Math.min(entry.expiresAt,entry.createdAt+ROOM_TTL_MS))<=Date.now()){await this.ctx.storage.delete(key);return;}
          try{
            const response=await this.env.ROOMS.get(this.env.ROOMS.idFromName(entry.code)).fetch('https://room.internal/summary/'+entry.code);
            if(response.status===404||response.status===410){await response.body?.cancel();await this.ctx.storage.delete(key);return;}
            if(!response.ok){await response.body?.cancel();return;}
            const fresh=await response.json() as RoomSummary;
            if(fresh.mode==='practice'||fresh.expiresAt<=Date.now()){await this.ctx.storage.delete(key);return;}
            // Presence changes already publish their own durable entry. A list
            // must not resurrect a room removed while this summary was read.
            return fresh;
          }catch{return;}
        }));
        rooms.push(...results.filter((entry):entry is RoomSummary=>!!entry));
      }
      return json({rooms:rooms.sort((a,b)=>b.createdAt-a.createdAt||a.code.localeCompare(b.code))});
    }
    return json({error:'接口不存在。'},404);
  }
  private authorityDeadline(socket:WebSocket,state:Connection):number {
    // Platform-maintained auto-response timestamps survive hibernation. Raw
    // ping/pong therefore renews liveness without waking this object to write.
    const ping=this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime()??0;
    return Math.max(state.authorityLeaseAt??state.acceptedAt,ping)+AUTHORITY_LEASE_MS;
  }
  private retireAuthority(socket:WebSocket,code:number,reason:string):void {
    const state=this.attachment(socket);if(!state?.authority)return;
    state.authority=false;delete state.playerId;socket.serializeAttachment(state);
    try{socket.close(code,reason);}catch{}
    this.notify({type:'roster',meta:this.metadata()});this.notify({type:'host-status',online:false});
  }
  private authority():WebSocket|undefined {
    if(this.record?.closedAt!==undefined)return undefined;
    const socket=this.sockets().find(socket=>this.attachment(socket)?.authority===true);
    if(socket&&this.authorityDeadline(socket,this.attachment(socket)!)<=Date.now()){
      this.retireAuthority(socket,4408,'主持网页心跳已超时，等待重连');return undefined;
    }
    return socket;
  }
  private online(playerId:string):boolean {return this.sockets().some(socket=>this.attachment(socket)?.playerId===playerId);}
  private hostDeadline(socket:WebSocket,state:Connection):number {
    return Math.max(state.hostLeaseAt??state.authorityLeaseAt??state.acceptedAt,this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime()??0)+AUTHORITY_LEASE_MS;
  }
  private async refreshHostPresence(leftAt=Date.now()):Promise<void> {
    const room=this.record;if(!room||!personalRoom(room)||room.closedAt!==undefined)return;
    const connected=this.sockets().some(socket=>{const state=this.attachment(socket);return state?.playerId===room.adminHostId&&this.hostDeadline(socket,state)>Date.now();});
    if(connected){
      const hostSeenAt=Math.max(...this.sockets().map(socket=>{const state=this.attachment(socket);return state?.playerId===room.adminHostId?this.hostDeadline(socket,state)-AUTHORITY_LEASE_MS:0;}));
      if(room.hostLeftAt!==undefined||hostSeenAt!==(room.hostSeenAt??0)){const next={...room,hostSeenAt};delete next.hostLeftAt;await this.ctx.storage.put('room',next);this.record=next;}
    }
    else if(!connected&&room.hostLeftAt===undefined){const next={...room,hostLeftAt:leftAt};await this.ctx.storage.put('room',next);this.record=next;}
    if(!connected)await this.ensureAlarmNoLaterThan(this.expiry());
  }
  private send(socket:WebSocket,message:RelayServerMessage):void {try{socket.send(JSON.stringify(message));}catch{try{socket.close(1011,'连接已失效');}catch{}}}
  private notify(message:RelayServerMessage):void {for(const socket of this.sockets())if(this.attachment(socket)?.playerId)this.send(socket,message);}
  private metadata():RelayMetadata {
    const room=this.record!;
    return {mode:room.mode??'multiplayer',code:room.code,authorityId:room.authorityId,adminHostId:room.adminHostId,maxPlayers:room.maxPlayers,timeoutSeconds:room.timeoutSeconds,phase:room.phase,createdAt:room.createdAt,expiresAt:personalRoom(room)&&room.hostLeftAt===undefined?undefined:this.expiry(),hostLeftAt:room.hostLeftAt,members:room.members.map(({id,name,seat,isAI})=>({id,name,seat,...(isAI?{isAI:true}:{}),connected:!!isAI||this.online(id)})),spectators:(room.spectators??[]).map(({id,name})=>({id,name,connected:this.online(id)}))};
  }
  private view(playerId:string):RoomView {
    const room=this.record!;
    return this.decorate({mode:room.mode??'multiplayer',code:room.code,version:1,hostId:room.adminHostId,selfId:playerId,maxPlayers:room.maxPlayers,timeoutSeconds:room.timeoutSeconds,deadline:null,phase:room.phase,round:0,track:'mild',players:this.metadata().members.map(p=>({...p,color:PLAYER_COLORS[p.seat]!,ready:false,score:0,used:[],handCount:0,selected:false,...(p.id===playerId?{hand:[],selection:[]}:{})})),racers:[],logs:[],results:[],rulesStatus:RULES_STATUS});
  }
  private decorate(room:RoomView):RoomView {
    const spectator=!!this.spectator(room.selfId);
    return {...room,...(spectator?{players:room.players.map(({hand,selection,...publicPlayer})=>publicPlayer),pending:undefined}:{}),role:spectator?'spectator':'player',spectators:this.metadata().spectators,createdAt:this.record!.createdAt,expiresAt:this.metadata().expiresAt,hostLeftAt:this.record!.hostLeftAt,hosting:'browser',authorityId:this.record!.authorityId,authorityOnline:this.record!.closedAt===undefined&&!!this.authority()};
  }
  private async initialView(playerId:string):Promise<RoomView> {
    if(this.spectator(playerId)){
      const cached=[...this.snapshots.values()].sort((a,b)=>b.version-a.version)[0]??await this.ctx.storage.get<RoomView>('view:'+this.record!.members[0]!.id);
      if(cached)return this.decorate({...cached,selfId:playerId});
    }
    return this.view(playerId);
  }
  private closedNotice():RelayServerMessage {return this.closed?{type:'room-closed',code:this.closed.code,closedAt:this.closed.closedAt,reason:this.closed.reason}:{type:'room-closed',code:this.record!.code,closedAt:this.record!.closedAt!};}
  private stopClosedConnections():void {
    const notice=this.closedNotice();
    for(const socket of this.sockets()){
      this.send(socket,notice);
      const state=this.attachment(socket);if(state){delete state.playerId;state.authority=false;socket.serializeAttachment(state);}
      try{socket.close(4410,ROOM_CLOSED_MESSAGE);}catch{}
    }
  }
  private terminalUpgrade(notice:RelayServerMessage,code=4410,reason=ROOM_CLOSED_MESSAGE):Response {
    // Browsers cannot read an HTTP 410 WebSocket handshake failure. Complete
    // only the transport handshake so returning players receive the tombstone.
    const pair=new WebSocketPair(),[client,server]=Object.values(pair) as [WebSocket,WebSocket],now=Date.now();
    this.ctx.acceptWebSocket(server);server.serializeAttachment({connectionId:crypto.randomUUID(),acceptedAt:now,windowAt:now,count:0} satisfies Connection);
    this.send(server,notice);server.close(code,reason);
    return new Response(null,{status:101,webSocket:client});
  }
  private async valid(updateDirectory=true):Promise<RoomRecord> {
    if(this.closed)throw new HttpError(410,ROOM_CLOSED_MESSAGE);
    if(!this.record||this.expiry()<=Date.now()){
      if(this.record)await this.expire(updateDirectory);
      if(this.closed)throw new HttpError(410,ROOM_CLOSED_MESSAGE);
      throw new HttpError(404,'房间不存在或已过期，请检查房间码。');
    }
    if(this.record.closedAt!==undefined)throw new HttpError(410,ROOM_CLOSED_MESSAGE);
    return this.record;
  }
  private async save(next:RoomRecord):Promise<void> {await this.ctx.storage.put('room',next);this.record=next;await this.publishDirectory();}
  private async ensureAlarmNoLaterThan(at:number):Promise<void> {
    at=Math.min(at,this.expiry());const scheduled=await this.ctx.storage.getAlarm();if(scheduled===null||at<scheduled)await this.ctx.storage.setAlarm(at);
  }
  async fetch(request:Request):Promise<Response>{
    // Listing waits on room summaries; keep it outside the mutation queue so
    // a room that is currently publishing presence can always complete.
    if(new URL(request.url).pathname==='/directory/list'&&request.method==='GET'){
      try{return await this.directory(request,'list');}catch{return json({error:'房间列表暂时不可用，请稍后重试。'},503);}
    }
    return this.run(async()=>{
      try {
        const parts=new URL(request.url).pathname.split('/'),operation=parts[1],code=parts[2];
        if(operation==='directory')return this.directory(request,code??'');
        if(!code||!CODE.test(code))throw new HttpError(400,'房间码格式不正确。');
        if(operation==='create'&&request.method==='POST'){
          if(this.closed)return json({error:'房间码已被使用。'},409);
          if(this.record&&this.expiry()>Date.now())return json({error:'房间码已被使用。'},409);
          if(this.record)await this.expire();
          const input=await body(request),nickname=name(input.name),now=Date.now(),secret=token();
          const player:StoredMember={id:crypto.randomUUID(),name:nickname,seat:0,tokenHash:await sha256(secret)};
          const mode=(input.mode??'multiplayer') as GameMode;
          const bots:StoredMember[]=Array.from({length:mode==='ai'?(input.aiCount as number??3):0},(_,i)=>({id:crypto.randomUUID(),name:`电脑${i+1}`,seat:i+1,tokenHash:'',isAI:true}));
          const created:RoomRecord={mode,code,authorityId:player.id,adminHostId:player.id,maxPlayers:input.maxPlayers as number,timeoutSeconds:input.timeoutSeconds as number,phase:'lobby',createdAt:now,expiresAt:now+ROOM_TTL_MS,...(mode!=='multiplayer'?{hostLeftAt:now}:{}),members:[player,...bots],spectators:[]};
          await this.ctx.storage.transaction(async txn=>{await txn.put('room',created);await txn.setAlarm(this.expiry(created));});
          this.record=created;
          await this.publishDirectory();
          return json({identity:{roomCode:code,playerId:player.id,token:secret},room:this.view(player.id),meta:this.metadata()} satisfies RelayJoinReply,201);
        }
        if(operation==='ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
          if(this.closed)return this.terminalUpgrade(this.closedNotice());
          if(!this.record||this.expiry()<=Date.now()){
            const expiredAt=this.record?this.expiry():Date.now();if(this.record)await this.expire();
            if(this.closed)return this.terminalUpgrade(this.closedNotice());
            return this.terminalUpgrade({type:'room-closed',code,closedAt:expiredAt,reason:'expired'},4404,'房间已过期');
          }
          if(this.record.code===code&&this.record.closedAt!==undefined)return this.terminalUpgrade(this.closedNotice());
        }
        const room=await this.valid(operation!=='summary');if(room.code!==code)throw new HttpError(404,'房间不存在。');
        if(operation==='summary'&&request.method==='GET')return json(this.summary());
        if(operation==='join'&&request.method==='POST'){
          const input=await body(request);
          if(!only(input,['name','role'])||(input.role!==undefined&&input.role!=='player'&&input.role!=='spectator'))throw new HttpError(400,'加入身份格式不正确。');
          const nickname=name(input.name),secret=token();
          if(room.pendingClose)throw new HttpError(409,'房间正在解散，请等待确认。');
          if(input.role==='spectator'){
            if((room.spectators?.length??0)>=MAX_SPECTATORS)throw new HttpError(409,'观战人数已满。');
            const spectator:StoredSpectator={id:crypto.randomUUID(),name:nickname,tokenHash:await sha256(secret)};
            await this.save({...room,spectators:[...(room.spectators??[]),spectator]});this.notify({type:'roster',meta:this.metadata()});
            return json({identity:{roomCode:code,playerId:spectator.id,token:secret,role:'spectator'},room:await this.initialView(spectator.id),meta:this.metadata()} satisfies RelayJoinReply,201);
          }
          if(room.mode==='practice'||room.mode==='ai')throw new HttpError(409,'此对局为自己练习或人机模式。');
          if(room.phase!=='lobby'||room.joiningLockId)throw new HttpError(409,'比赛已经开始或正在开始，席位已锁定。原玩家请使用原浏览器重连。');
          if(!this.authority())throw new HttpError(409,'主持网页暂时离线，请等房主回到游戏后再加入。');
          if(room.members.length>=room.maxPlayers)throw new HttpError(409,'房间已满。');
          const seat=Array.from({length:room.maxPlayers},(_,i)=>i).find(seat=>!room.members.some(member=>member.seat===seat))!;
          const player:StoredMember={id:crypto.randomUUID(),name:nickname,seat,tokenHash:await sha256(secret)};
          await this.save({...room,members:[...room.members,player]});this.notify({type:'roster',meta:this.metadata()});
          return json({identity:{roomCode:code,playerId:player.id,token:secret},room:this.view(player.id),meta:this.metadata()} satisfies RelayJoinReply,201);
        }
        if(operation==='leave'&&request.method==='POST'){
          const identity=parseIdentity(await body(request)),person=identity?this.participant(identity.playerId):undefined;
          if(!identity||identity.roomCode!==room.code||!person||!constantEqual(person.tokenHash,await sha256(identity.token))||(identity.role!==undefined&&identity.role!==(this.spectator(person.id)?'spectator':'player')))throw new HttpError(401,'退出凭据无效。');
          const spectator=!!this.spectator(person.id),retainIdentity=!spectator&&(person.id===room.authorityId||room.phase!=='lobby'||!!room.joiningLockId);
          if(!retainIdentity){
            const updated={...room,members:room.members.filter(member=>member.id!==person.id),spectators:(room.spectators??[]).filter(viewer=>viewer.id!==person.id)};
            if(updated.adminHostId===person.id)updated.adminHostId=room.authorityId;
            if(updated.pendingClose?.actorId===person.id)delete updated.pendingClose;
            await this.ctx.storage.transaction(async txn=>{await txn.put('room',updated);await txn.delete('view:'+person.id);});
            this.record=updated;this.snapshots.delete(person.id);
          }
          let wasAuthority=false;
          for(const socket of this.sockets()){
            const state=this.attachment(socket);if(state?.playerId!==person.id)continue;
            wasAuthority ||=!!state.authority;delete state.playerId;state.authority=false;socket.serializeAttachment(state);
            // Explicit leave must not be undone by another tab's automatic
            // reconnect. Credentials retained for players still allow a manual return.
            try{socket.close(4401,'已退出房间');}catch{}
          }
          this.notify({type:'roster',meta:this.metadata()});if(wasAuthority)this.notify({type:'host-status',online:false});
          await this.refreshHostPresence();
          await this.publishDirectory();return json({ok:true,retainIdentity});
        }
        if(operation==='ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
          const sockets=this.sockets();
          for(const pending of sockets){const state=this.attachment(pending);if(state&&!state.playerId&&state.acceptedAt+AUTH_TIMEOUT_MS<=Date.now())pending.close(4401,'认证超时');}
          if(sockets.filter(s=>!this.attachment(s)?.playerId&&s.readyState===WebSocket.OPEN).length>=8||sockets.length>=48)throw new HttpError(429,'页面连接过多，请关闭多余标签页。');
          const now=Date.now();
          // Persist the authentication deadline before accepting the socket. A
          // quota/storage failure must not leave an unreachable accepted peer.
          await this.ensureAlarmNoLaterThan(now+AUTH_TIMEOUT_MS);
          const pair=new WebSocketPair(),[client,server]=Object.values(pair) as [WebSocket,WebSocket];
          this.ctx.acceptWebSocket(server);server.serializeAttachment({connectionId:crypto.randomUUID(),acceptedAt:now,windowAt:now,count:0} satisfies Connection);
          return new Response(null,{status:101,webSocket:client});
        }
        return json({error:'接口不存在。'},404);
      } catch(error){return json({error:error instanceof HttpError?error.message:'中继暂时不可用，请稍后重试。'},error instanceof HttpError?error.status:503);}
    });
  }
  async webSocketMessage(socket:WebSocket,data:string|ArrayBuffer):Promise<void>{
    await this.run(async()=>{
      let requestId:string|undefined;
      try {
        const room=await this.valid(),connection=this.attachment(socket);if(!connection)return;
        if(socket.readyState!==WebSocket.OPEN)return;
        if(typeof data!=='string'){socket.close(4400,'只接受文本消息');return;}
        if(data.length>(connection.authority?HOST_BYTES:CLIENT_BYTES)||new TextEncoder().encode(data).byteLength>(connection.authority?HOST_BYTES:CLIENT_BYTES)){socket.close(4400,'消息过大');return;}
        const now=Date.now();
        if(now-connection.windowAt>10_000){connection.windowAt=now;connection.count=0;}
        if(++connection.count>(connection.authority?1000:60)){socket.close(4429,'消息太频繁');return;}
        socket.serializeAttachment(connection);
        let parsed:unknown;try{parsed=JSON.parse(data);}catch{throw Error('消息格式不正确。');}
        if(!object(parsed))throw Error('消息格式不正确。');
        if(textId(parsed.requestId))requestId=parsed.requestId;
        if(parsed.type==='auth'){
          if(connection.playerId)throw Error('连接已经认证。');
          if(now-connection.acceptedAt>AUTH_TIMEOUT_MS){socket.close(4401,'认证超时');return;}
          if(!only(parsed,['type','identity','authority'])||(parsed.authority!==undefined&&typeof parsed.authority!=='boolean')){socket.close(4401,'认证格式错误');return;}
          const identity=parseIdentity(parsed.identity),member=identity?this.participant(identity.playerId):undefined;
          if(!identity||identity.roomCode!==room.code||!member||!constantEqual(member.tokenHash,await sha256(identity.token))||(identity.role!==undefined&&identity.role!==(this.spectator(member.id)?'spectator':'player'))){socket.close(4401,'重连凭据无效');return;}
          if(parsed.authority===true&&member.id!==room.authorityId){socket.close(4401,'只有创建者可主持');return;}
          const own=this.sockets().filter(s=>this.attachment(s)?.playerId===member.id);
          if(own.length>=5&&(!parsed.authority||!own.some(s=>this.attachment(s)?.authority))){socket.close(4429,'同一身份页面过多');return;}
          if(parsed.authority||(personalRoom(room)&&member.id===room.adminHostId)){
            // Never acknowledge an authority role whose expiry check could not
            // be persisted (for example, when the Free write quota is spent).
            try{await this.ensureAlarmNoLaterThan(now+AUTHORITY_LEASE_MS);}
            catch{this.send(socket,{type:'error',message:'中继暂时无法维护主持连接，请稍后重试。'});socket.close(1013,'主持租约保存失败');return;}
            if(parsed.authority)connection.authorityLeaseAt=now;
            if(personalRoom(room)&&member.id===room.adminHostId)connection.hostLeaseAt=now;
          }
          // New valid authority replaces a stale connection left by a refresh/network loss.
          if(parsed.authority)for(const previous of own)if(this.attachment(previous)?.authority){const old=this.attachment(previous)!;old.authority=false;old.playerId=undefined;previous.serializeAttachment(old);previous.close(4409,'主持已在另一页面恢复');}
          connection.playerId=member.id;connection.authority=parsed.authority===true;socket.serializeAttachment(connection);
          await this.refreshHostPresence();
          // Any unconfirmed start belonged to the replaced/disconnected authority session.
          if(connection.authority&&room.joiningLockId){const restored={...room};delete restored.joiningLockId;await this.save(restored);}
          this.send(socket,{type:'auth-ok',meta:this.metadata(),authority:!!connection.authority,authorityOnline:!!this.authority()});
          const snapshot=this.snapshots.get(member.id)??await this.ctx.storage.get<RoomView>('view:'+member.id);
          if(snapshot){this.snapshots.set(member.id,snapshot);this.send(socket,{type:'snapshot',room:this.decorate(snapshot)});}
          this.notify({type:'roster',meta:this.metadata()});this.notify({type:'host-status',online:!!this.authority()});
          await this.publishDirectory();
          // The browser may already have committed close while the relay's
          // tombstone write/ack failed. Replay the exact durable intent so its
          // existing receipt can finish closure without creating a new action.
          if(connection.authority&&this.record?.pendingClose){const pending=this.record.pendingClose;this.send(socket,{type:'request',playerId:pending.actorId,requestId:pending.requestId,operation:'action',envelope:pending.envelope});}
          return;
        }
        if(!connection.playerId){socket.close(4401,'请先认证');return;}
        if(parsed.type==='deliver-events'){
          const currentAuthority=this.authority();
          if(!connection.authority||!currentAuthority||this.attachment(currentAuthority)?.connectionId!==connection.connectionId)throw Error('只有当前主持网页可以发送动画记录。');
          if(!only(parsed,['type','to','requestId','batch','error'])||!textId(parsed.to)||!this.participant(parsed.to)||!requestId)throw Error('动画记录格式不正确。');
          if(parsed.error!==undefined){
            if(parsed.batch!==undefined||!textId(parsed.error,1000))throw Error('动画记录错误格式不正确。');
            for(const target of this.sockets())if(this.attachment(target)?.playerId===parsed.to)this.send(target,{type:'error',requestId,message:parsed.error});return;
          }
          if(!validatePublicEventBatch(parsed.batch)||new TextEncoder().encode(JSON.stringify(parsed.batch)).byteLength>PUBLIC_EVENT_BATCH_BYTES)throw Error('动画记录格式不正确。');
          for(const target of this.sockets())if(this.attachment(target)?.playerId===parsed.to)this.send(target,{type:'events',requestId,batch:parsed.batch});
          return;
        }
        if(parsed.type==='deliver'){
          const currentAuthority=this.authority();
          if(!connection.authority||!currentAuthority||this.attachment(currentAuthority)?.connectionId!==connection.connectionId)throw Error('只有当前主持网页可以发送状态。');
          if(!only(parsed,['type','to','room','requestId','result','phase','adminHostId'])||!textId(parsed.to)||!this.participant(parsed.to)||!phase(parsed.phase)||!textId(parsed.adminHostId)||!room.members.some(p=>p.id===parsed.adminHostId))throw Error('主持状态格式不正确。');
          if(parsed.requestId!==undefined&&!textId(parsed.requestId))throw Error('确认编号不正确。');
          if(parsed.result!==undefined&&!actionReply(parsed.result))throw Error('确认格式不正确。');
          let snapshot:RoomView|undefined;
          if(parsed.room!==undefined){
            if(!object(parsed.room)||parsed.room.code!==room.code||parsed.room.selfId!==parsed.to||parsed.room.phase!==parsed.phase||!Number.isSafeInteger(parsed.room.version)||(parsed.room.version as number)<1||!Array.isArray(parsed.room.players)||parsed.room.players.length>8)throw Error('视图不属于目标玩家或房间。');
            snapshot=this.decorate(parsed.room as unknown as RoomView);
          }
          if(snapshot?.closedAt!==undefined){
            if(!Number.isSafeInteger(snapshot.closedAt)||snapshot.closedAt<0)throw Error('解散时间格式不正确。');
            const pending=room.pendingClose;
            // An initial closed projection during recovery must wait for the
            // replayed receipt. Authority status alone never authorizes close.
            const closeRequestIds=pending?[pending.requestId,...(pending.duplicateRequestIds??[])]:[];
            if(!pending||pending.actorId!==room.adminHostId||parsed.to!==pending.actorId||!closeRequestIds.includes(parsed.requestId as string)||!parsed.result?.ok)return;
            const closed:RoomRecord={...room,closedAt:snapshot.closedAt,phase:parsed.phase,expiresAt:this.expiry(room)};
            delete closed.pendingClose;delete closed.joiningLockId;
            await this.ctx.storage.transaction(async txn=>{
              await txn.put('room',closed);
              await txn.delete([...room.members,...(room.spectators??[])].map(member=>'view:'+member.id));
              await txn.setAlarm(closed.expiresAt);
            });
            this.record=closed;this.snapshots.clear();
            for(const target of this.sockets())if(this.attachment(target)?.playerId===pending.actorId){
              for(const closeRequestId of closeRequestIds)this.send(target,{type:'ack',requestId:closeRequestId,result:parsed.result as ActionReply});
              this.send(target,{type:'snapshot',room:this.decorate(snapshot),requestId:pending.requestId});
            }
            this.stopClosedConnections();await this.publishDirectory();return;
          }
          const releaseAdmission=!!room.joiningLockId&&(parsed.phase!=='lobby'||(parsed.requestId===room.joiningLockId&&parsed.result!==undefined));
          const releaseClose=!!room.pendingClose&&parsed.to===room.pendingClose.actorId&&[room.pendingClose.requestId,...(room.pendingClose.duplicateRequestIds??[])].includes(parsed.requestId as string)&&parsed.result?.ok===false;
          const metadataChanged=room.phase!==parsed.phase||room.adminHostId!==parsed.adminHostId||releaseAdmission||releaseClose;
          const updated={...room,phase:parsed.phase,adminHostId:parsed.adminHostId};
          // An unrelated stale lobby snapshot must not reopen admission while start is in flight.
          if(releaseAdmission)delete updated.joiningLockId;
          if(releaseClose)delete updated.pendingClose;
          const previous=snapshot?this.snapshots.get(parsed.to):undefined;
          const snapshotChanged=!!snapshot&&(!previous||JSON.stringify(previous)!==JSON.stringify(snapshot));
          if(metadataChanged||snapshotChanged)await this.ctx.storage.transaction(async txn=>{
            if(metadataChanged)await txn.put('room',updated);
            if(snapshotChanged)await txn.put('view:'+parsed.to,snapshot!);
          });
          if(metadataChanged)this.record=updated;
          if(snapshot)this.snapshots.set(parsed.to,snapshot);
          for(const target of this.sockets())if(this.attachment(target)?.playerId===parsed.to){
            if(snapshot)this.send(target,{type:'snapshot',room:this.decorate(snapshot),...(parsed.requestId?{requestId:parsed.requestId as string}:{})});
            if(parsed.requestId&&parsed.result){
              const replies=releaseClose?[room.pendingClose!.requestId,...(room.pendingClose!.duplicateRequestIds??[])]:[parsed.requestId as string];
              for(const replyId of replies)this.send(target,{type:'ack',requestId:replyId,result:parsed.result as ActionReply});
            }
          }
          if(metadataChanged){this.notify({type:'roster',meta:this.metadata()});await this.publishDirectory();}
          return;
        }
        // Personal-room dismissal is a server operation. It remains available
        // from another owner tab even while the browser computing the game is offline.
        if(personalRoom(room)&&parsed.type==='action'&&object(parsed.envelope)&&object(parsed.envelope.action)&&parsed.envelope.action.type==='close'){
          if(!only(parsed,['type','requestId','envelope'])||!requestId||!actionEnvelope(parsed.envelope))throw Error('操作格式不正确。');
          if(connection.playerId!==room.adminHostId)throw Error('只有当前管理房主能解散房间。');
          const envelope=parsed.envelope,version=Math.max(...[...this.snapshots.values()].map(view=>view.version),1)+1;
          await this.closePersonal('dismissed',Date.now(),{hostId:connection.playerId,actionId:envelope.actionId,version},()=>this.send(socket,{type:'ack',requestId:requestId!,result:{ok:true,version}}));return;
        }
        const host=this.authority();
        if(!host){this.send(socket,{type:'host-status',online:false});throw Error('主持网页离线，游戏已暂停。请等待房主回来。');}
        if(parsed.type==='events'){
          if(!only(parsed,['type','requestId','afterId'])||!requestId||!Number.isSafeInteger(parsed.afterId)||(parsed.afterId as number)<0)throw Error('动画记录请求格式不正确。');
          this.send(host,{type:'request',playerId:connection.playerId,requestId,operation:'events',afterId:parsed.afterId as number});return;
        }
        if(parsed.type==='sync'){
          if(!only(parsed,['type','requestId'])||(parsed.requestId!==undefined&&!textId(parsed.requestId)))throw Error('同步请求格式不正确。');
          if(room.pendingClose){
            const pending=room.pendingClose;
            this.send(host,{type:'request',playerId:pending.actorId,requestId:pending.requestId,operation:'action',envelope:pending.envelope});return;
          }
          this.send(host,{type:'request',playerId:connection.playerId,requestId:requestId??crypto.randomUUID(),operation:'sync'});return;
        }
        if(parsed.type==='action'){
          if(this.spectator(connection.playerId))throw Error('观战者不能进行比赛操作。');
          if(!only(parsed,['type','requestId','envelope'])||!requestId||!actionEnvelope(parsed.envelope))throw Error('操作格式不正确。');
          if(parsed.envelope.action.type==='close'){
            if(connection.playerId!==room.adminHostId)throw Error('只有当前管理房主能解散房间。');
            if(room.pendingClose&&(room.pendingClose.actorId!==connection.playerId||room.pendingClose.envelope.actionId!==parsed.envelope.actionId))throw Error('房间正在解散，请等待确认。');
            if(room.pendingClose){
              const aliases=room.pendingClose.duplicateRequestIds??[];
              if(requestId!==room.pendingClose.requestId&&!aliases.includes(requestId)){
                if(aliases.length>=8)throw Error('解散请求正在确认，请等待结果或重新连接。');
                await this.save({...room,pendingClose:{...room.pendingClose,duplicateRequestIds:[...aliases,requestId]}});
              }
            } else await this.save({...room,pendingClose:{actorId:connection.playerId,requestId,envelope:parsed.envelope}});
          } else if(room.pendingClose)throw Error('房间正在解散，请等待确认。');
          if(parsed.envelope.action.type==='start'&&room.phase==='lobby'&&connection.playerId===room.adminHostId){
            if(room.joiningLockId&&room.joiningLockId!==requestId)throw Error('比赛正在开始，请等待结果。');
            await this.save({...room,joiningLockId:requestId});
          }
          this.send(host,{type:'request',playerId:connection.playerId,requestId,operation:'action',envelope:parsed.envelope});return;
        }
        throw Error('不支持的消息类型。');
      } catch(error){
        if(error instanceof HttpError&&error.status===410){if(socket.readyState===WebSocket.OPEN){this.send(socket,this.closedNotice());socket.close(4410,ROOM_CLOSED_MESSAGE);}return;}
        this.send(socket,{type:'error',message:error instanceof HttpError?error.message:error instanceof Error?error.message:'消息处理失败，请重试。',...(requestId?{requestId}:{})});if(error instanceof HttpError&&error.status===404)try{socket.close(4404,'房间已失效');}catch{}
      }
    });
  }
  async webSocketClose(socket:WebSocket,code:number,reason:string,wasClean:boolean):Promise<void>{
    await this.run(async()=>{
      const state=this.attachment(socket),wasMember=!!state?.playerId,wasAuthority=!!state?.authority;
      if(state){delete state.playerId;state.authority=false;try{socket.serializeAttachment(state);}catch{}}
      try{socket.close(code,reason);}catch{}
      if(this.record&&this.expiry()<=Date.now()){await this.expire();return;}
      await this.refreshHostPresence();
      if(wasMember&&this.record?.closedAt===undefined&&this.record){this.notify({type:'roster',meta:this.metadata()});if(wasAuthority)this.notify({type:'host-status',online:!!this.authority()});await this.publishDirectory();}
    });
  }
  async webSocketError(socket:WebSocket):Promise<void>{await this.webSocketClose(socket,1011,'连接中断',false);}
  private async expire(updateDirectory=true):Promise<void>{
    if(!this.record)return;
    if(personalRoom(this.record)){await this.closePersonal('host-away',this.expiry());return;}
    const notice:RelayServerMessage={type:'room-closed',code:this.record.code,closedAt:this.expiry(),reason:'expired'};
    for(const socket of this.sockets()){this.send(socket,notice);try{socket.close(4404,'房间已过期');}catch{}}
    if(updateDirectory)await this.publishDirectory();
    await this.ctx.storage.deleteAlarm();await this.ctx.storage.deleteAll();this.snapshots.clear();this.record=null;
  }
  private async closePersonal(reason:RoomCloseReason,closedAt:number,receipt:Partial<RoomClosure>={},acknowledge?:()=>void):Promise<void>{
    if(this.closed){acknowledge?.();return;}
    const room=this.record;if(!room)return;
    const closure:RoomClosure={code:room.code,closedAt,reason,...receipt};
    // Keep only a small tombstone. No private views, authority intents, AI
    // work or timers survive closure, including after an object restart.
    await this.ctx.storage.transaction(async txn=>{const keys=[...(await txn.list({prefix:''})).keys()];if(keys.length)await txn.delete(keys);await txn.put('closed',closure);await txn.deleteAlarm();});
    this.closed=closure;this.snapshots.clear();
    acknowledge?.();this.stopClosedConnections();
    this.record={...room,closedAt};await this.publishDirectory();this.record=null;
  }
  async alarm():Promise<void>{
    await this.run(async()=>{
      if(!this.record)return;
      const now=Date.now();if(this.expiry()<=now){await this.expire();return;}
      if(this.record.closedAt!==undefined){this.stopClosedConnections();await this.ctx.storage.setAlarm(this.expiry());return;}
      let next=this.expiry(),lastHostDeadline=0;
      for(const socket of this.sockets()){
        const state=this.attachment(socket);if(!state)continue;
        if(personalRoom(this.record)&&state.playerId===this.record.adminHostId){
          const deadline=this.hostDeadline(socket,state);lastHostDeadline=Math.max(lastHostDeadline,deadline);
          if(deadline<=now){state.authority=false;delete state.playerId;socket.serializeAttachment(state);socket.close(4408,'房主网页心跳已超时，等待重连');continue;}
          next=Math.min(next,deadline);
        }
        if(state.authority){
          const deadline=this.authorityDeadline(socket,state);
          if(deadline<=now)this.retireAuthority(socket,4408,'主持网页心跳已超时，等待重连');
          else next=Math.min(next,deadline);
        } else if(!state.playerId){
          const deadline=state.acceptedAt+AUTH_TIMEOUT_MS;
          if(deadline<=now)socket.close(4401,'认证超时');else next=Math.min(next,deadline);
        }
      }
      await this.refreshHostPresence(lastHostDeadline||now);
      if(this.record&&this.expiry()<=now){await this.expire();return;}
      next=Math.min(next,this.expiry());
      try{if(next===Number.MAX_SAFE_INTEGER)await this.ctx.storage.deleteAlarm();else await this.ctx.storage.setAlarm(next);}
      catch(error){
        const host=this.sockets().find(socket=>this.attachment(socket)?.authority);
        if(host)this.retireAuthority(host,1013,'中继无法维护主持租约，请稍后重连');
        throw error; // Let the platform retry cleanup; no unguarded authority remains.
      }
      await this.publishDirectory();
    });
  }
}
