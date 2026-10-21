import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkOwnedRoom, forgetClosedRoom, ownedRoomCandidates, readClosedRoom, readIdentity, readRouteIdentity, rememberOwnedRoom, saveIdentity } from '../src/client/network.js';
import type { Identity, RoomView } from '../src/shared/types.js';

class MemoryStorage implements Storage {
  private values = new Map<string,string>();
  get length(){return this.values.size;}
  clear(){this.values.clear();}
  key(index:number){return [...this.values.keys()][index]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  removeItem(key:string){this.values.delete(key);}
  setItem(key:string,value:string){this.values.set(key,String(value));}
}
const owner:Identity={roomCode:'ABC234',playerId:'owner',token:'owner-secret',role:'player'};
const view=(overrides:Partial<RoomView>={}):Pick<RoomView,'code'|'hostId'|'ownerId'|'mode'|'phase'|'createdAt'|'hostLeftAt'|'expiresAt'|'closedAt'>=>({code:owner.roomCode,hostId:'owner',ownerId:'owner',mode:'multiplayer',phase:'race',createdAt:1000,...overrides});
const savedFetch=globalThis.fetch,previousLocal=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),previousSession=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
beforeEach(()=>{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:new MemoryStorage()});Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:new MemoryStorage()});});
afterEach(()=>{globalThis.fetch=savedFetch;if(previousLocal)Object.defineProperty(globalThis,'localStorage',previousLocal);else delete (globalThis as any).localStorage;if(previousSession)Object.defineProperty(globalThis,'sessionStorage',previousSession);else delete (globalThis as any).sessionStorage;});
function status(reply:Record<string,unknown>,code=200){globalThis.fetch=async()=>new Response(JSON.stringify(reply),{status:code,headers:{'Content-Type':'application/json'}});}

test('owner recovery metadata contains no token and route refresh keeps the player despite another spectator tab',()=>{
  saveIdentity(owner);rememberOwnedRoom(view(),owner,true);
  assert(!localStorage.getItem('magical-athlete:owned-rooms:v1')!.includes(owner.token));
  const route=sessionStorage.getItem('magical-athlete:route-identity:v1')!;assert(!route.includes(owner.token));
  // Another tab changes only shared localStorage; this tab retains its route role.
  const spectator:Identity={...owner,playerId:'viewer',token:'viewer-secret',role:'spectator'};
  localStorage.setItem(`magical-athlete:identity:${owner.roomCode}:spectator`,JSON.stringify(spectator));localStorage.setItem(`magical-athlete:identity:${owner.roomCode}`,JSON.stringify(spectator));
  assert.deepEqual(readRouteIdentity(owner.roomCode),owner);assert.deepEqual(ownedRoomCandidates(),[owner]);
  sessionStorage.clear();assert.deepEqual(readRouteIdentity(owner.roomCode),owner,'a fresh tab falls back to its retained owner identity');
});

test('legacy credentials can discover an owned practice room without the public directory or a presence connection',async()=>{
  saveIdentity(owner);let checkedUrl='',checkedBody='';
  globalThis.fetch=async(input,options)=>{checkedUrl=String(input);checkedBody=String(options?.body);return new Response(JSON.stringify({ok:true,ownerId:owner.playerId,mode:'practice',phase:'selection',createdAt:1000,hostLeftAt:5000,expiresAt:1805000}),{status:200});};
  const recovered=await checkOwnedRoom(ownedRoomCandidates()[0]!);assert.equal(recovered?.mode,'practice');assert.equal(recovered?.hostLeftAt,5000);assert(checkedUrl.endsWith('/ABC234/resume-status'));assert.deepEqual(JSON.parse(checkedBody),owner);
});

test('server liveness overrides an old local expiry when another owner tab remains online',async()=>{
  saveIdentity(owner);rememberOwnedRoom(view({hostLeftAt:1,expiresAt:2}),owner);
  status({ok:true,ownerId:owner.playerId,mode:'multiplayer',phase:'race',createdAt:1000,expiresAt:Number.MAX_SAFE_INTEGER});
  const recovered=await checkOwnedRoom(owner);assert(recovered);assert.equal(recovered.hostLeftAt,undefined);assert.equal(recovered.expiresAt,undefined);assert.deepEqual(readIdentity(owner.roomCode,'player'),owner);
});

test('closed or expired authority status removes the return entry and all obsolete room credentials',async()=>{
  for(const code of [404,410]){
    saveIdentity(owner);rememberOwnedRoom(view(),owner);status({error:'房间已关闭'},code);assert.equal(await checkOwnedRoom(owner),null);assert.deepEqual(ownedRoomCandidates(),[]);assert.equal(readIdentity(owner.roomCode),null);
  }
});

test('a changed owner removes only the owner entry and preserves valid guest credentials',async()=>{
  saveIdentity(owner);rememberOwnedRoom(view(),owner);status({ok:true,ownerId:'new-owner',mode:'multiplayer',phase:'lobby',createdAt:1000});
  assert.equal(await checkOwnedRoom(owner),null);assert.equal(localStorage.getItem('magical-athlete:owned-rooms:v1'),'[]');assert.deepEqual(readIdentity(owner.roomCode,'player'),owner);
});

test('network failure keeps recovery credentials, and a real closure notification clears recovery metadata',async()=>{
  saveIdentity(owner);rememberOwnedRoom(view(),owner);globalThis.fetch=async()=>{throw Error('offline');};
  await assert.rejects(checkOwnedRoom(owner),/offline/);assert.deepEqual(readIdentity(owner.roomCode,'player'),owner);assert.deepEqual(ownedRoomCandidates(),[owner]);
  forgetClosedRoom(owner.roomCode);assert.equal(readIdentity(owner.roomCode),null);assert.equal(localStorage.getItem('magical-athlete:owned-rooms:v1'),'[]');assert.equal(readClosedRoom(owner.roomCode),'closed');assert(!localStorage.getItem('magical-athlete:closed-rooms:v1')!.includes(owner.token));
});

test('an invalid credential does not claim the room is closed',async()=>{
  saveIdentity(owner);rememberOwnedRoom(view(),owner);status({error:'身份失效'},401);
  assert.equal(await checkOwnedRoom(owner),null);assert.equal(readIdentity(owner.roomCode),null);assert.equal(readClosedRoom(owner.roomCode),null);
});

test('a verified live authority response clears a previous non-secret closure marker',async()=>{
  saveIdentity(owner);forgetClosedRoom(owner.roomCode);saveIdentity(owner);
  status({ok:true,ownerId:owner.playerId,mode:'multiplayer',phase:'lobby',createdAt:1000});
  assert(await checkOwnedRoom(owner));assert.equal(readClosedRoom(owner.roomCode),null);assert.deepEqual(ownedRoomCandidates(),[owner]);
});
