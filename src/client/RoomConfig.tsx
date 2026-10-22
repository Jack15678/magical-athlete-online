import { useEffect, useState } from 'react';
import { CHARACTERS } from '../shared/characters.js';
import { CHARACTER_PACK_IDS, legacyRoomConfig, enabledCharacterIds, requiredCharacterCount, type RoomConfig, type CharacterPackId } from '../shared/room-config.js';
import type { GameAction, RoomView } from '../shared/types.js';
import './room-config.css';

const PACK_INFO: Record<CharacterPackId,{ name:string; kind:string; description:string; source:string }> = {
  original:{name:'基础角色包',kind:'原版',description:'CMYK 基础角色与已采用 FAQ 裁定。',source:'https://www.cmyk.games/products/magical-athlete'},
  'second-wind':{name:'Second Wind',kind:'续作 · 实验性实现',description:'沿用项目已实现的规则版本；详情注明核验缺口。',source:'https://www.cmyk.games/products/magical-athlete'},
  'extra-mile':{name:'Extra Mile',kind:'非官方粉丝扩展',description:'作者网页 v13 名单；仅加入卡文已核实且技能已完成的角色。Box 的实体骰子规则尚未适配，不参与分配。',source:'https://johnnlds.github.io/Magical-Athlete-Racers/?v=13'},
  'leaf-fan':{name:'Leaf’s Fan Expansion',kind:'非官方粉丝扩展',description:'根据作者卡牌、规则书与 PNG 核验，只有已完成的角色参与分配。',source:'https://boardgamegeek.com/filepage/327878/leafs-fan-expansion-for-magical-athlete'},
  wurstii:{name:'Wurstii A',kind:'非官方粉丝扩展',description:'Wurstii v1.0 中已适配的30名角色，含中文卡文、独立立绘和模型；混合强度尚待实战验证。',source:'/rules/wurstii-a.md'},
};
export function packCount(id:CharacterPackId) { return CHARACTERS.filter(character=>(character.edition==='leaf'?'leaf-fan':character.edition??'original')===id).length; }
export function configSummary(config:RoomConfig) { return CHARACTER_PACK_IDS.filter(id=>config.characterPacks[id]).map(id=>`${PACK_INFO[id].name} ${packCount(id)}`).join(' · '); }
export function RoomConfigFields({config,onChange,disabled=false,players=6,practice=false}:{config:RoomConfig;onChange:(config:RoomConfig)=>void;disabled?:boolean;players?:number;practice?:boolean}) {
  return <div className="room-config-fields"><fieldset disabled={disabled}><legend>角色包与玩法</legend><p className="config-intro">勾选本局可分配的角色包；新粉丝扩展默认关闭。</p><div className="pack-options">{CHARACTER_PACK_IDS.map(id=><div key={id} className={`pack-option${packCount(id)===0?' is-unavailable':''}`}><label><input type="checkbox" aria-label={PACK_INFO[id].name} checked={config.characterPacks[id] === true} disabled={disabled||packCount(id)===0} onChange={event=>onChange({...config,characterPacks:{...config.characterPacks,[id]:event.target.checked}})} /><span><strong>{PACK_INFO[id].name}<b>{packCount(id)} 位可用</b></strong><small>{PACK_INFO[id].kind}</small></span></label><p>{PACK_INFO[id].description} <a href={PACK_INFO[id].source} target="_blank" rel="noreferrer">来源 ↗</a></p></div>)}</div><details className="optional-rules"><summary>可选玩法与项目裁定</summary><p>当前没有已核实、可独立开关的额外玩法。角色所需的掷骰、目标选择和反应窗口随角色启用。</p><p>两人双角色及行动顺序沿用现有流程。粘液怪不减速同玩家的另一名选手为项目房规；7–8 人为项目玩法变体，按实际参赛人数启用。</p><p>轻松 / 狂野赛道按四场流程切换。关闭角色包只影响角色分配，不会删减已选角色的必需机制。</p></details><p className="config-total" role="status">当前牌池 {enabledCharacterIds(config).length} 位可用角色 · 本房间至少需要 {requiredCharacterCount(players,practice)} 位</p>{enabledCharacterIds(config).length<requiredCharacterCount(players,practice)&&<p role="alert" className="form-error">角色数量不足，请增加角色包或减少人数上限。</p>}</fieldset></div>;
}
export function RoomConfigPanel({room,busy,act}:{room:RoomView;busy:boolean;act:(action:GameAction)=>void}) {
  const current=room.config??legacyRoomConfig(room.characterPool,room.mode==='practice');
  const key=JSON.stringify(current);
  const [draft,setDraft]=useState(current);
  useEffect(()=>setDraft(current),[key]);
  const canEdit=room.role!=='spectator'&&room.selfId===room.hostId&&['lobby','finished'].includes(room.phase);
  const changed=JSON.stringify(draft)!==key;
  return <details className="room-config-panel"><summary><strong>{room.phase==='finished'?'下一局角色包与玩法':'本房间角色包与玩法'}</strong><span>{configSummary(current)}</span></summary>{canEdit?<><RoomConfigFields config={draft} onChange={setDraft} disabled={busy} players={room.maxPlayers} practice={room.mode==='practice'} /><div className="config-actions"><button type="button" className="button" disabled={busy||!changed||enabledCharacterIds(draft).length<requiredCharacterCount(room.maxPlayers,room.mode==='practice')} onClick={()=>act({type:'configure',config:draft})}>保存本房间设置</button><p>{room.phase==='lobby'?'修改后全员需要重新准备；开始选秀后锁定四场配置。':'保存后下一局生效，上局结果保持可查。'}</p></div></>:<><p>{room.configFrozen?'本局四场配置已锁定。':'房主可在开始选秀前调整设置，修改后所有人重新准备。'}</p><RoomConfigFields config={current} onChange={()=>{}} disabled players={room.maxPlayers} practice={room.mode==='practice'} /></>}<small>规则版本：{room.rulesVersion??'legacy-base-v1'}</small></details>;
}
