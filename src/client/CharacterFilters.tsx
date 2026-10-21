import { useState } from 'react';
import { CHARACTERS, type CharacterData } from '../shared/characters.js';
import type { CharacterPool } from '../shared/types.js';

export const POOL_LABELS: Record<CharacterPool, string> = {original: '原作', 'second-wind': 'Second Wind', mixed: '两代混合'};
export const isSecondWind = (character?: CharacterData) => character?.edition === 'second-wind';
export function EditionBadge({ character }: {character?: CharacterData}) { return <span className={`edition-badge ${isSecondWind(character) ? 'second-wind' : ''}`}>{isSecondWind(character) ? 'Second Wind' : '原作'}</span>; }
export function useCharacterFilter() {
  const [edition, setEdition] = useState<CharacterPool>('mixed'), [query, setQuery] = useState('');
  const filter = (ids: readonly string[]) => ids.filter(id => {
    const character = CHARACTERS.find(card => card.id === id);
    return character && (edition === 'mixed' || (character.edition ?? 'original') === edition) && `${character.nameZh} ${character.nameEn} ${id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const controls = <div className="character-filters"><input aria-label="搜索角色" type="search" placeholder="搜索中文名 / English name" value={query} onChange={event => setQuery(event.target.value)} /><label>版本筛选<select aria-label="角色版本筛选" value={edition} onChange={event => setEdition(event.target.value as CharacterPool)}>{Object.entries(POOL_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>;
  return {filter, controls};
}
