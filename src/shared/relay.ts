import type { ActionEnvelope,ActionReply,GameMode,Identity,Phase,PublicEventBatch,RoomView,Spectator } from './types.js';
export interface RelayMember { isAI?:boolean; id:string; name:string; seat:number; connected:boolean }
export interface RelayMetadata { mode?:GameMode; code:string; authorityId:string; adminHostId:string; maxPlayers:number; timeoutSeconds:number; phase:Phase; createdAt:number; members:RelayMember[] }
export interface RelayJoinReply { identity:Identity; room:RoomView; meta:RelayMetadata }
export interface RelayMetadata { spectators?:Spectator[]; expiresAt?:number; }
export type RelayClientMessage =
 | {type:'auth';identity:Identity;authority?:boolean}
 | {type:'action';requestId:string;envelope:ActionEnvelope}
 | {type:'sync';requestId?:string}
 | {type:'events';requestId:string;afterId:number}
 | {type:'deliver-events';to:string;requestId:string;batch:PublicEventBatch}
 | {type:'deliver-events';to:string;requestId:string;error:string}
 | {type:'deliver';to:string;room?:RoomView;requestId?:string;result?:ActionReply;phase:Phase;adminHostId:string};
export type RelayServerMessage =
 | {type:'auth-ok';meta:RelayMetadata;authority:boolean;authorityOnline:boolean}
 | {type:'roster';meta:RelayMetadata}
 | {type:'request';playerId:string;requestId:string;operation:'action'|'sync'|'events';afterId?:number;envelope?:ActionEnvelope}
 | {type:'host-status';online:boolean}
 | {type:'snapshot';room:RoomView;requestId?:string}
 | {type:'events';requestId:string;batch:PublicEventBatch}
 | {type:'room-closed';code:string;closedAt:number;reason?:'expired'}
 | {type:'ack';requestId:string;result:ActionReply}
 | {type:'error';message:string;requestId?:string};
