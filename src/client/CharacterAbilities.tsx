import type { PublicAbilityEntry, Racer, RoomView } from '../shared/types.js';
import { CHARACTERS } from '../shared/characters.js';
import { Avatar } from './avatars.js';
import { copiedAbilitySource } from './character-context.js';

type ShowCharacter = (id: string, racerId?: string) => void;
const character = (id: string) => CHARACTERS.find(value => value.id === id);

/** Read the public projection only. Never inspect a hand, offered cards or deck. */
export function publicAbilityDetail(racer: Racer) {
  const state = racer.flags.publicAbilities;
  const fallbackPower = typeof racer.flags.power === 'string' ? racer.flags.power : typeof racer.flags.copiedPower === 'string' ? racer.flags.copiedPower : racer.characterId;
  const fallback = fallbackPower === 'copycat' && typeof racer.flags.copyPower === 'string' ? racer.flags.copyPower : fallbackPower;
  const active = [...new Set(state?.powers ?? [fallback])];
  const owned = [...new Set(state?.ownedPowers ?? active)];
  return { state, active, owned, disabled: !!state?.disabledBy?.length };
}

export function abilityEntryLabel(entry: PublicAbilityEntry, room?: RoomView) {
  const sourceCard = entry.sourceCardId ? character(entry.sourceCardId)?.nameZh ?? entry.sourceCardId : undefined;
  const sourceRacer = room?.racers.find(value => value.id === entry.sourceRacerId);
  const sourcePlayer = sourceRacer && room?.players.find(value => value.id === sourceRacer.playerId);
  const originLabel = { printed: '角色自带', copy: '复制获得', draw: '抽牌获得', acquired: '额外获得', temporary: '临时借用' }[entry.origin];
  const via = entry.via && entry.via !== entry.sourceCardId ? character(entry.via)?.nameZh ?? entry.via : undefined;
  const origin = via ? `${originLabel}（${via}）` : originLabel;
  const sourceRacerName = sourceRacer && sourceRacer.characterId !== entry.sourceCardId ? character(sourceRacer.characterId)?.nameZh ?? sourceRacer.characterId : undefined;
  const source = [sourceCard, sourceRacerName, sourcePlayer ? `${sourcePlayer.name}${sourcePlayer.id === room?.selfId ? '（你）' : ''}` : undefined].filter(Boolean).join(' · ');
  const baseDuration = { race: '持续至本场结束', 'next-turn': '下次自身回合开始失效', 'source-change': '随复制目标变化' }[entry.duration];
  const followsLeader = entry.sourceCardId === 'copycat' || entry.via === 'copycat';
  const duration = followsLeader ? entry.duration === 'source-change' ? '能力随领先者变化' : `${baseDuration} · 能力随领先者变化` : baseDuration;
  return { source: source ? `${origin}：${source}` : origin, duration };
}

export function EffectiveAbilities({ racer, room, onDetail }: { racer: Racer; room?: RoomView; onDetail: ShowCharacter }) {
  const { state, active, owned, disabled } = publicAbilityDetail(racer);
  return <section className={`effective-powers current-abilities${disabled ? ' is-disabled' : ''}`} aria-label="现在拥有的能力">
    <div className="current-abilities-heading"><h3>现在拥有的能力</h3><span className={`ability-state${disabled ? ' is-disabled' : ''}`}>{disabled ? '暂时禁用' : active.length ? '当前生效' : '暂无生效能力'}</span></div>
    {disabled && <p className="disabled-ability" role="status">能力被 Null 禁用：位于虚无者前方。离开作用范围后恢复。</p>}
    {!owned.length && <p className="ability-empty">{disabled ? '当前没有生效能力；已获得能力不会因禁用而丢弃。' : '当前没有生效能力。等待后续公开的复制、抽牌或选择结果。'}</p>}
    <div className="current-ability-list">{owned.map(id => {
      const power = character(id), entries = state?.entries?.filter(value => value.id === id) ?? [];
      const copiedFrom = copiedAbilitySource(room, racer, id);
      const legacySource = copiedFrom ? `复制来源：${copiedFrom}` : state?.acquired?.includes(id) ? '本场获得的额外能力' : id === racer.characterId ? '角色自带' : '本场获得';
      const provenance = entries.length ? entries.map(entry => abilityEntryLabel(entry, room)) : [{source: legacySource, duration: undefined}];
      return <article className="current-ability-card" key={id} data-power-id={id}>
        <button type="button" className="power-name character-ability-link" aria-label={`查看${power?.nameZh ?? id}的技能与当前玩家`} onClick={() => onDetail(id)}><Avatar id={id} /><span><strong>{power?.nameZh ?? id}</strong><small>{power?.nameEn ?? id}</small></span><span className="ability-open" aria-hidden="true">↗</span></button>
        <div className="ability-provenance">{provenance.map((entry, index) => <span key={index}>{entry.source}{entry.duration && <> · {entry.duration}</>}</span>)}{!active.includes(id) && <span className="ability-inactive-label">当前未生效</span>}</div>
        <p className="current-ability-description">{power?.ability ?? '角色规则正在载入。'}</p>
        {id === 'kraken' && <p className="ability-counter">本场剩余次数：<strong>{state?.krakenRemaining ?? 1}</strong></p>}
      </article>;
    })}</div>
    {state?.entries?.some(entry => entry.origin === 'temporary') && <p className="ability-duration-note">临时能力在下次自身回合开始失效，嵌套复制不会延长期限。</p>}
    {(state?.form === 'were-mouth' || state?.mount) && <div className="ability-live-status">{state?.form === 'were-mouth' && <span>当前形态：W.E.R.E.M.O.U.T.H.</span>}{state?.mount && <span>当前坐骑：野猪 · 主移动 +2</span>}</div>}
  </section>;
}

/** The chosen card is a source record, distinct from the live ability above it. */
export function EggAbility({ racer, onDetail }: { racer: Racer; onDetail: ShowCharacter }) {
  const drawn = typeof racer.flags.eggCardId === 'string' ? character(racer.flags.eggCardId) : undefined;
  const inherited = typeof racer.flags.twinCardId === 'string' ? character(racer.flags.twinCardId) : undefined;
  if (!drawn && !inherited) return null;
  return <section className="ability-source-record" aria-label="蛋本场获得的能力来源">
    {drawn && <div><h3>本场抽到</h3><button type="button" className="character-ability-link" aria-label={`查看${drawn.nameZh}的技能与当前玩家`} onClick={() => onDetail(drawn.id)}><Avatar id={drawn.id} /><span>{drawn.nameZh}</span><span aria-hidden="true">↗</span></button></div>}
    {inherited && <div><h3>继承的冠军</h3><button type="button" className="character-ability-link" aria-label={`查看${inherited.nameZh}的技能与当前玩家`} onClick={() => onDetail(inherited.id)}><Avatar id={inherited.id} /><span>{inherited.nameZh}</span><span aria-hidden="true">↗</span></button></div>}
    <p>本场选择已公开。来源卡与现在拥有的能力分别记录，点击来源可查看原卡规则。</p>
  </section>;
}
