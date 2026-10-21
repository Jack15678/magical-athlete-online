import type { GameEvent, PublicEventBatch, Room } from './types.js';

// Leaves ample framing space under the relay's 256 KiB authority message cap.
export const PUBLIC_EVENT_BATCH_BYTES = 96 * 1024;
export function publicEventBatch(room:Room,playerId:string,afterId:number):PublicEventBatch {
  if(!room.game.players.some(player=>player.id===playerId)&&!room.spectators?.some(spectator=>spectator.id===playerId))throw Error('你不在这个房间的参赛席位中。');
  if(!Number.isSafeInteger(afterId)||afterId<0)throw Error('动画记录游标无效。');
  const events:GameEvent[]=[];let bytes=128;
  for(const event of room.game.logs){
    if(event.id<=afterId)continue;
    const size=new TextEncoder().encode(JSON.stringify(event)).byteLength+1;
    if(bytes+size>PUBLIC_EVENT_BATCH_BYTES){if(!events.length)throw Error('单条动画记录超过传输限制。');break;}
    // Logs are public by definition. Never serialize state, pending context,
    // private hands, secret selections, the deck, or random state here.
    events.push(structuredClone(event));bytes+=size;
  }
  return{afterId,latestId:room.game.logs.at(-1)?.id??0,events};
}
export function validatePublicEventBatch(value:unknown):value is PublicEventBatch {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const batch=value as PublicEventBatch;
  return Number.isSafeInteger(batch.afterId)&&batch.afterId>=0&&Number.isSafeInteger(batch.latestId)&&batch.latestId>=0&&Array.isArray(batch.events)&&batch.events.every((event,index)=>!!event&&event.id===batch.afterId+index+1&&event.id<=batch.latestId&&typeof event.type==='string'&&typeof event.text==='string');
}
