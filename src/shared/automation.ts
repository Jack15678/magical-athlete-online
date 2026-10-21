import { systemAction } from '../engine/index.js';
import { decideAI } from '../engine/ai.js';
import { projectRoom } from './room-core.js';
import type { GameAction, Room } from './types.js';

export interface ScheduledAction {playerId:string;action:GameAction;reason:'system'|'ai'}
/** Authority scheduling. AI pauses between intents; presentation never changes
 * rules, deadlines, legal choices, or the resulting state. */
export function immediateRoomAction(room:Room,now:number):ScheduledAction|undefined {
  if(room.closedAt!==undefined)return;
  const system=systemAction(room.game);if(system)return{...system,reason:'system'};
  if(now<room.updatedAt+1_200)return;
  for(const p of room.game.players.filter(p=>p.isAI)){
    const action=decideAI(projectRoom(room,p.id,{authorityId:room.hostId,authorityOnline:true}));
    if(action)return{playerId:p.id,action,reason:'ai'};
  }
}
