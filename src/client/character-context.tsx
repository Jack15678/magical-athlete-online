import type { PlayerView, Racer, RoomView } from '../shared/types.js';
import { CHARACTERS } from '../shared/characters.js';

export function characterContext(room: RoomView | undefined, characterId: string) {
  const onBoard=room&&['race','results','finished','paused'].includes(room.phase)?room.racers:[];
  const racers=onBoard.filter(racer=>racer.characterId===characterId);
  const holdings: {player:PlayerView;kind:'hand'|'played'}[]=[];
  if(room&&!racers.length)for(const player of room.players){
    // Only the viewer's projected hand is a legitimate private ownership source.
    // Never infer hidden selections or inspect an opponent hand, even if a stale
    // caller accidentally supplies one alongside this public room projection.
    if(player.id===room.selfId&&player.hand?.includes(characterId))holdings.push({player,kind:'hand'});
    else if(player.used.includes(characterId))holdings.push({player,kind:'played'});
  }
  const abilityHolders=onBoard.filter(racer=>{
    const state=racer.flags.publicAbilities as {powers?:string[]}|undefined;
    return racer.characterId!==characterId&&state?.powers?.includes(characterId);
  });
  return {racers,holdings,abilityHolders,market:!!room?.draft?.market.includes(characterId)};
}

export function currentController(room:RoomView,racer:Racer){
  const confirmed=room.racers.find(current=>current.id===racer.id);
  return room.players.find(player=>player.id===(confirmed?.playerId??racer.playerId));
}

export function copiedAbilitySource(room:RoomView|undefined,racer:Racer,powerId:string):string|undefined {
  const state=racer.flags.publicAbilities as {powers?:string[];copiedFrom?:string}|undefined;
  if(!state?.copiedFrom||powerId!==state.powers?.[0]||powerId===racer.characterId)return;
  const source=room?.racers.find(value=>value.id===state.copiedFrom);
  if(!source)return '本场已公开来源（该实例已离场）';
  const name=CHARACTERS.find(character=>character.id===source.characterId)?.nameZh??source.characterId;
  const player=room&&currentController(room,source);
  return `${name}${player?` · ${player.name}${player.id===room!.selfId?'（你）':''}`:''}`;
}

export function StepdadTarget({room,racer}:{room?:RoomView;racer?:Racer}) {
  if(!room||!racer)return null;
  const state=racer.flags.publicAbilities as {powers?:string[];acquired?:string[];stepTargetId?:string}|undefined;
  if(racer.characterId!=='stepdad'&&!state?.powers?.includes('stepdad')&&!state?.acquired?.includes('stepdad'))return null;
  const target=room.racers.find(value=>value.id===(state?.stepTargetId??racer.flags.stepTarget)),controller=target?currentController(room,target):undefined;
  return <section className="character-ownership" aria-label="继父本场左邻判定"><h3>继父 · 本场固定左邻</h3><p>按赛前固定选手顺序的下一位判定，与屏幕左右、赛道位置无关；可以是自己控制的另一名选手。</p>{target?<p>本场目标：<strong>{CHARACTERS.find(character=>character.id===target.characterId)?.nameZh??target.characterId}</strong> · {controller?.name??'等待玩家同步'}{controller?.id===room.selfId?'（你）':''}。只对其主要移动加 2；该实例夺冠时，继父的当前控制者获得 3 分。</p>:<p>当前没有另一名合法固定左邻，不会强化继父自己。</p>}</section>;
}

const playerText=(room:RoomView,player:PlayerView|undefined)=>player?`${player.seat+1}号 · ${player.name}${player.id===room.selfId?'（你）':''}`:'等待同步玩家信息';

export function CharacterOwnership({room,characterId,selectedId,onSelect}:{room?:RoomView;characterId:string;selectedId?:string;onSelect:(id:string)=>void}){
  const context=characterContext(room,characterId);
  if(!room)return <p className="character-owner-note">角色图鉴 · 加入房间后可查看已公开的角色归属。</p>;
  return <section className="character-ownership" aria-label="角色归属与当前玩家">
    <h3>{context.racers.length?'当前掌握角色的玩家':'角色归属'}</h3>
    {context.racers.length>0?<div className="character-instances">{context.racers.map((racer,index)=>{
      const player=currentController(room,racer),selected=selectedId===racer.id;
      return <button type="button" key={racer.id} data-racer-id={racer.id} className={selected?'is-selected':''} aria-pressed={selected} onClick={()=>onSelect(racer.id)} aria-label={`查看本场实例${index+1}的玩家与能力`}>
        <strong>{playerText(room,player)}</strong><span>本场实例 {index+1} · {racer.eliminated?'已淘汰':racer.finished?`第 ${racer.rank??'—'} 名`:`${racer.position} 格`}{racer.tripped?' · 绊倒':''}</span>
        {racer.identityPlayerId&&racer.identityPlayerId!==racer.playerId&&<small>控制权已交换，以当前玩家为准</small>}
      </button>;
    })}</div>:<>
      {context.holdings.map(({player,kind})=><p key={player.id}><strong>{playerText(room,player)}</strong> · {kind==='hand'?'你的手牌':'已公开使用的角色牌'}</p>)}
      {context.market&&<p>公共选秀区 · 尚未确认分配</p>}
      {!context.holdings.length&&!context.market&&<p>当前没有该角色的场上实例或可见持牌信息。</p>}
      <small>其他玩家尚未公开的手牌与暗选不会在此展示。</small>
    </>}
    {context.abilityHolders.length>0&&<div className="shared-ability-holders"><h4>也掌握此能力的选手</h4>{context.abilityHolders.map(racer=><p key={racer.id}>{CHARACTERS.find(character=>character.id===racer.characterId)?.nameZh??racer.characterId} · {playerText(room,currentController(room,racer))}</p>)}<small>复制或额外能力不会改变选手的角色身份。</small></div>}
  </section>;
}
