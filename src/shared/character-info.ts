import { CHARACTERS } from './characters.js';
import type { GameEvent, Racer, RacerFlags } from './types.js';

const knownCard = (id: unknown): id is string => typeof id === 'string' && CHARACTERS.some(card => card.id === id);

/** Only already revealed choices belong in public racer information. Older saves
 * recorded the choice in a public copy event instead of a dedicated flag. Match
 * its exact original text; a current inherited power cannot prove the drawn card.
 */
export function publicCopyCardIds(racer: Racer, logs: readonly GameEvent[]): Pick<RacerFlags, 'eggCardId' | 'twinCardId'> {
  const result: Pick<RacerFlags, 'eggCardId' | 'twinCardId'> = {};
  for (const kind of ['egg', 'twin'] as const) {
    const field = kind === 'egg' ? 'eggCardId' : 'twinCardId';
    const stored = racer.flags[field];
    if (knownCard(stored)) { result[field] = stored; continue; }
    const event = logs.find(entry => entry.type === 'copy' && entry.source === racer.id && entry.cause === kind);
    if (!event) continue;
    if (knownCard(event.selectedCardId)) { result[field] = event.selectedCardId; continue; }
    const printedName = CHARACTERS.find(card => card.id === racer.characterId)?.nameZh ?? racer.characterId;
    const selected = CHARACTERS.find(card => event.text === `${printedName}本场复制${card.nameZh}`);
    if (selected) result[field] = selected.id;
  }
  return result;
}
