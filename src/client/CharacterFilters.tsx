import { useState } from 'react';
import { CHARACTERS, type CharacterData } from '../shared/characters.js';
import type { CharacterPool } from '../shared/types.js';

export const POOL_LABELS: Record<CharacterPool, string> = {original: '原作', 'second-wind': 'Second Wind', mixed: '两代混合', wurstii: '原作＋Wurstii A', all: '全部混合'};
const EDITION_LABELS = {all: '全部角色', original: '原作', 'second-wind': 'Second Wind', wurstii: 'Wurstii A'};
export const isSecondWind = (character?: CharacterData) => character?.edition === 'second-wind';
export function EditionBadge({ character }: {character?: CharacterData}) { return <span className={`edition-badge ${character?.edition ?? 'original'}`}>{EDITION_LABELS[character?.edition ?? 'original']}</span>; }
export function useCharacterFilter() {
  const [edition, setEdition] = useState<keyof typeof EDITION_LABELS>('all'), [query, setQuery] = useState('');
  const filter = (ids: readonly string[]) => ids.filter(id => {
    const character = CHARACTERS.find(card => card.id === id);
    return character && (edition === 'all' || (character.edition ?? 'original') === edition) && `${character.nameZh} ${character.nameEn} ${id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const controls = <div className="character-filters"><input aria-label="搜索角色" type="search" placeholder="搜索中文名 / English name" value={query} onChange={event => setQuery(event.target.value)} /><label>版本筛选<select aria-label="角色版本筛选" value={edition} onChange={event => setEdition(event.target.value as keyof typeof EDITION_LABELS)}>{Object.entries(EDITION_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>;
  return {filter, controls};
}
