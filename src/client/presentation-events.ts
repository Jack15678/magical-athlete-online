import type { GameEvent, PublicEventBatch, RoomView } from '../shared/types.js';
import { validatePublicEventBatch } from '../shared/public-events.js';

/** An in-memory reliable public-event stream. The regular UI log remains short;
 * batches repair gaps and unacknowledged events survive React snapshot batching. */
export class PresentationEventStream {
  private latest:RoomView|null=null;
  private cursor=0;
  private acknowledged=0;
  private retained:GameEvent[]=[];
  private available=new Map<number,GameEvent>();
  private epoch=0;
  get generation(){return this.epoch;}
  reset(){this.latest=null;this.cursor=0;this.acknowledged=0;this.retained=[];this.available.clear();this.epoch++;}
  acknowledge(cursor:number){
    if(!Number.isSafeInteger(cursor)||cursor<=this.acknowledged)return;
    this.acknowledged=Math.min(cursor,this.cursor);this.retained=this.retained.filter(event=>event.id>this.acknowledged);
  }
  receive(room:RoomView):{room?:RoomView;afterId?:number} {
    const target=room.logs.at(-1)?.id??0;
    if(!this.latest||room.code!==this.latest.code||(room.version>=this.latest.version&&target<this.cursor)){
      this.reset();this.latest=room;this.cursor=target;this.acknowledged=target;
      return{room:{...room,presentationEvents:[...room.logs]}};
    }
    if(room.version<this.latest.version)return{};
    this.latest=room;
    for(const event of room.logs)if(event.id>this.cursor)this.available.set(event.id,event);
    return this.drain();
  }
  accept(batch:PublicEventBatch,generation:number):{room?:RoomView;afterId?:number} {
    if(generation!==this.epoch)return{};
    if(!validatePublicEventBatch(batch))throw Error('动画记录格式不正确，正在等待完整记录。');
    if(!this.latest)return{};
    for(const event of batch.events)if(event.id>this.cursor)this.available.set(event.id,event);
    const before=this.cursor,update=this.drain();
    if(update.afterId!==undefined&&this.cursor===before&&!batch.events.length)throw Error('尚未取得完整动画记录，请重新连接。');
    return update;
  }
  private drain():{room?:RoomView;afterId?:number} {
    if(!this.latest)return{};
    const target=this.latest.logs.at(-1)?.id??0;
    while(this.cursor<target){const event=this.available.get(this.cursor+1);if(!event)break;this.available.delete(event.id);this.retained.push(event);this.cursor=event.id;}
    if(this.cursor<target)return{afterId:this.cursor};
    return{room:{...this.latest,presentationEvents:[...new Map([...this.retained,...this.latest.logs].map(event=>[event.id,event])).values()].sort((a,b)=>a.id-b.id)}};
  }
}

/** Both transports use the same repair policy. Only a real new connection
 * resets its baseline; ordinary snapshots cannot silently discard animation. */
export class PresentationEventClient {
  private stream=new PresentationEventStream();
  private fetching:number|undefined;
  constructor(private readonly read:(afterId:number)=>Promise<PublicEventBatch>,private readonly publish:(room:RoomView)=>void,private readonly failure:(error:unknown)=>void){}
  reset(){this.stream.reset();this.fetching=undefined;}
  acknowledge(cursor:number){this.stream.acknowledge(cursor);}
  receive(room:RoomView){this.dispatch(this.stream.receive(room));}
  private dispatch(update:{room?:RoomView;afterId?:number}){
    if(update.room)this.publish(update.room);
    if(update.afterId===undefined||this.fetching===this.stream.generation)return;
    const generation=this.stream.generation;this.fetching=generation;
    void this.read(update.afterId).then(batch=>{
      if(generation!==this.stream.generation)return;
      this.fetching=undefined;this.dispatch(this.stream.accept(batch,generation));
    }).catch(error=>{if(generation===this.stream.generation){this.fetching=undefined;this.failure(error);}});
  }
}
