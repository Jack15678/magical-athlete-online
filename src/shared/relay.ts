import type { ActionEnvelope,ActionReply,Identity,Phase,RoomView } from './types.js';
export interface RelayMember { id:string; name:string; seat:number; connected:boolean }
export interface RelayMetadata { code:string; authorityId:string; adminHostId:string; maxPlayers:number; timeoutSeconds:number; phase:Phase; createdAt:number; members:RelayMember[] }
export interface RelayJoinReply { identity:Identity; room:RoomView; meta:RelayMetadata }
export type RelayClientMessage =
 | {type:'auth';identity:Identity;authority?:boolean}
 | {type:'action';requestId:string;envelope:ActionEnvelope}
 | {type:'sync';requestId?:string}
 | {type:'deliver';to:string;room?:RoomView;requestId?:string;result?:ActionReply;phase:Phase;adminHostId:string};
export type RelayServerMessage =
 | {type:'auth-ok';meta:RelayMetadata;authority:boolean;authorityOnline:boolean}
 | {type:'roster';meta:RelayMetadata}
 | {type:'request';playerId:string;requestId:string;operation:'action'|'sync';envelope?:ActionEnvelope}
 | {type:'host-status';online:boolean}
 | {type:'snapshot';room:RoomView;requestId?:string}
 | {type:'ack';requestId:string;result:ActionReply}
 | {type:'error';message:string;requestId?:string};
