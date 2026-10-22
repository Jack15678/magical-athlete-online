import { useState } from 'react';
import { CHARACTERS, type CharacterData } from '../shared/characters.js';
import type { CharacterPool } from '../shared/types.js';

export const POOL_LABELS: Record<CharacterPool, string> = {original: '原作', 'second-wind': 'Second Wind', mixed: '两代混合', wurstii:'原作＋Wurstii A', all:'原作＋Second Wind＋Wurstii A'};
export const EDITION_LABELS = { original:'基础角色包', 'second-wind':'Second Wind', 'extra-mile':'Extra Mile', leaf:'Leaf’s Fan Expansion', wurstii:'Wurstii A' } as const;
export const isSecondWind = (character?: CharacterData) => character?.edition === 'second-wind';
export function EditionBadge({ character }: {character?: CharacterData}) { const edition=character?.edition??'original'; return <span className={`edition-badge ${edition}`}>{EDITION_LABELS[edition]}{['extra-mile','leaf','wurstii'].includes(edition)&&' · 非官方粉丝扩展'}</span>; }
export function useCharacterFilter() {
  const [edition, setEdition] = useState<keyof typeof EDITION_LABELS | 'all'>('all'), [query, setQuery] = useState('');
  const filter = (ids: readonly string[]) => ids.filter(id => {
    const character = CHARACTERS.find(card => card.id === id);
    return character && (edition === 'all' || (character.edition ?? 'original') === edition) && `${character.nameZh} ${character.nameEn} ${id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const controls = <div className="character-filters"><input aria-label="搜索角色" type="search" placeholder="搜索中文名 / English name" value={query} onChange={event => setQuery(event.target.value)} /><label>版本筛选<select aria-label="角色版本筛选" value={edition} onChange={event => setEdition(event.target.value as typeof edition)}><option value="all">全部角色包</option>{Object.entries(EDITION_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>;
  return {filter, controls};
}
