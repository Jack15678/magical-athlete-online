import { CHARACTERS } from '../shared/characters.js';
import type { AbilityRevealData } from './ability-reveal.js';
import { Avatar } from './avatars.js';
import './ability-reveal.css';

export function AbilityReveal({ reveal, onDetail }: {reveal:AbilityRevealData;onDetail:(id:string,racerId?:string)=>void}) {
  return <aside className="ability-reveal-card" role="status" aria-label="新能力提示" data-testid="ability-reveal" data-event-id={reveal.eventId}>
    <div className="ability-reveal-heading"><span aria-hidden="true">✦</span><div><small>{reveal.recipient}</small><h2>{reveal.title}</h2></div></div>
    {reveal.privateDrawCount !== undefined ? <p className="ability-reveal-private">抽到 <strong>{reveal.privateDrawCount}</strong> 张私人手牌</p> : <div className="ability-reveal-powers">{reveal.powers.map(id=><button type="button" key={id} onClick={()=>onDetail(id)} aria-label={`查看${CHARACTERS.find(card=>card.id===id)?.nameZh ?? id}能力`}><Avatar id={id}/><strong>{CHARACTERS.find(card=>card.id===id)?.nameZh ?? id}</strong><span aria-hidden="true">↗</span></button>)}</div>}
    <p>{reveal.source}</p><p>{reveal.duration}</p>
    {reveal.characterId && <button type="button" className="ability-reveal-detail" onClick={()=>onDetail(reveal.characterId!,reveal.racerId)}>之后可点头像查看当前能力 ↗</button>}
  </aside>;
}
