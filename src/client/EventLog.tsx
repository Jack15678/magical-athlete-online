import { createContext, useContext, useEffect, useState } from 'react';
import { validatePublicEventBatch } from '../shared/public-events.js';
import type { GameEvent, RoomView } from '../shared/types.js';
import type { RoomConnection } from './network.js';

export const PublicEventConnection = createContext<RoomConnection|null>(null);
export function EventLog({room}:{room:RoomView}) {
  const connection=useContext(PublicEventConnection);
  const [archive,setArchive]=useState<GameEvent[]>([]),[count,setCount]=useState(18),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const latest=room.logs.at(-1)?.id??0;
  useEffect(()=>{if(archive.length&&(archive.at(-1)?.id??0)>latest){setArchive([]);setCount(18);}},[latest]);
  const events=[...new Map([...archive,...room.logs].map(event=>[event.id,event])).values()].sort((a,b)=>a.id-b.id);
  const load=async()=>{
    if(!connection?.readEvents||loading)return;setLoading(true);setError('');
    try{
      const all:GameEvent[]=[...archive];let cursor=archive.at(-1)?.id??0,target=latest,first=true;
      do{
        const batch=await connection.readEvents(cursor);
        if(!validatePublicEventBatch(batch)||batch.afterId!==cursor||(!batch.events.length&&cursor<target))throw Error('公开记录尚未同步完整，请稍后重试。');
        if(first){target=batch.latestId;first=false;}
        if(batch.latestId<target)throw Error('已进入新一局，请重新读取记录。');
        all.push(...batch.events.filter(event=>event.id<=target));cursor=batch.events.at(-1)?.id??cursor;
      }while(cursor<target);
      setArchive(all);setCount(Math.max(60,count));
    }catch(cause){setError(cause instanceof Error?cause.message:'记录读取失败，请重试。');}finally{setLoading(false);}
  };
  return <section className="event-log"><h2>赛场播报 <span>最新在前</span></h2><ol aria-live="polite" aria-relevant="additions">{events.slice(-count).reverse().map(event=><li key={event.id}><span>{event.id.toString().padStart(2,'0')}</span><div><p>{event.text}</p>{event.cause&&<small>原因：{event.cause}{event.group&&` · 连锁 ${event.group}`}</small>}</div></li>)}{!events.length&&<li><p>发令枪还没响，大家蓄势待发。</p></li>}</ol><div className="event-log-actions">{connection?.readEvents&&latest>18&&latest>(archive.at(-1)?.id??0)&&<button className="text-button" disabled={loading} onClick={()=>void load()}>{loading?'读取中…':archive.length?'补齐本局公开记录':'读取本局完整公开记录'}</button>}{events.length>count&&<button className="text-button" onClick={()=>setCount(value=>value+60)}>显示更早记录（{Math.min(count,events.length)} / {events.length}）</button>}</div>{error&&<p role="alert" className="form-error">{error}</p>}</section>;
}
