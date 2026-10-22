export type GameMode = 'multiplayer' | 'practice' | 'ai';
export type CharacterPool = 'original' | 'second-wind' | 'mixed' | 'wurstii' | 'all';
export interface ChatSend { clientMessageId: string; text: string; }
export interface ChatMessage { id: number; clientMessageId?: string; senderId?: string; senderName: string; text: string; sentAt: number; kind: 'player' | 'system'; }
export interface ChatReply { ok: boolean; message?: ChatMessage; duplicate?: boolean; error?: string; }
export interface RenameReply { ok: boolean; name?: string; remaining?: number; duplicate?: boolean; error?: string; }
export interface ChatState { messages: ChatMessage[]; latestId: number; windows: Record<string, number[]>; }
export type RoomRole = 'player' | 'spectator';
export interface Spectator { id: string; name: string; connected: boolean; }
export interface RoomSummary { code: string; hostName: string; phase: Phase; playerCount: number; maxPlayers: number; spectatorCount: number; createdAt: number; expiresAt: number; authorityOnline: boolean; mode?: GameMode; }
export type Phase = 'lobby' | 'draft' | 'selection' | 'race' | 'results' | 'finished' | 'paused';
export interface Player { isAI?: boolean; id: string; name: string; seat: number; color: string; ready: boolean; connected: boolean; score: number; hand: string[]; used: string[]; selection: string[]; }
/** One public route by which a racer owns an ability. Never includes unrevealed
 * draw candidates, private hands, a deck order, or another racer's resources. */
export interface PublicAbilityEntry {
  id: string;
  origin: 'printed' | 'copy' | 'draw' | 'acquired' | 'temporary';
  sourceCardId?: string;
  sourceRacerId?: string;
  /** Public card/mechanism responsible for this grant, when recorded. */
  via?: string;
  duration: 'race' | 'next-turn' | 'source-change';
}
export interface PublicAbilityState {
  powers: string[];
  /** Ownership survives suppression; older rule versions may omit this field. */
  ownedPowers?: string[];
  entries?: PublicAbilityEntry[];
  disabledBy?: string[];
  copiedFrom?: string;
  acquired?: string[];
  krakenRemaining?: number;
  form?: string;
  mount?: string;
  stepTargetId?: string;
  stepTargetControllerId?: string;
}
export interface RacerFlags extends Record<string, unknown> {
  publicAbilities?: PublicAbilityState;
  /** Printed card selected by Egg this race; never replaced by later inheritance. */
  eggCardId?: string;
  /** Printed previous-champion card selected through Twin this race. */
  twinCardId?: string;
}
export interface Racer { id: string; playerId: string; characterId: string; position: number; tripped: boolean; finished: boolean; eliminated: boolean; rank?: number; flags: RacerFlags; }
export interface ChoiceOption { id: string; label: string; }
export interface PendingChoice { id: string; playerId: string; racerId?: string; title: string; options: ChoiceOption[]; optional: boolean; kind: string; context: Record<string, unknown>; }
export interface GameEvent { id: number; type: string; text: string; source?: string; targets?: string[]; faces?: number[]; before?: number[]; after?: number[]; group?: string; cause?: string; selectedCardId?: string; }
export interface Draft { market: string[]; order: string[]; cursor: number; batch: number; }
export interface RaceResult { round: number; placements: { racerId: string; playerId: string; characterId: string; rank: number; points: number }[]; }
export interface GameState { mode?: GameMode; phase: Phase; round: number; players: Player[]; deck: string[]; discard: string[]; draft?: Draft; racers: Racer[]; baseTurnOrder?: string[]; turn: number; turnCount: number; currentRacerId?: string; pending?: PendingChoice; queue: Task[]; logs: GameEvent[]; results: RaceResult[]; rngState: number; randomLog: { index: number; reason: string; value: number }[]; lastRoll?: { racerId: string; face: number; distance: number }; track: 'mild' | 'wild'; flags: Record<string, unknown>; }
export interface Task { kind: string; [key: string]: unknown; }
export interface Room { mode?: GameMode; code: string; hostId: string; createdAt: number; updatedAt: number; version: number; maxPlayers: number; timeoutSeconds: number; deadline: number | null; game: GameState; closedAt?: number; hostLeftAt?: number; closeReason?: 'expired' | 'host-away' | 'dismissed'; }
export type GameAction = { type: 'configure'; config: import('./room-config.js').RoomConfig } | { type: 'ready'; ready: boolean } | { type: 'start' } | { type: 'draft'; characterId: string } | { type: 'practice-team'; characterIds: string[] } | { type: 'select'; characterIds: string[] } | { type: 'roll' } | { type: 'choose'; choiceId: string; optionId: string } | { type: 'next' } | { type: 'rematch' } | { type: 'transfer'; playerId: string } | { type: 'close' };
export interface ActionEnvelope { actionId: string; expectedVersion: number; action: GameAction; }
export interface PlayerView extends Omit<Player, 'hand' | 'selection'> { handCount: number; selected: boolean; hand?: string[]; selection?: string[]; }
export interface PublicEventBatch { afterId: number; latestId: number; events: GameEvent[]; }
export interface PublicEventReply { ok: boolean; batch?: PublicEventBatch; error?: string; }
export interface RoomView { presentationEvents?: GameEvent[]; mode?: GameMode; turnStage?: 'starting' | 'choice' | 'roll' | 'resolving'; code: string; version: number; hostId: string; selfId: string; maxPlayers: number; timeoutSeconds: number; deadline: number | null; phase: Phase; round: number; track: 'mild' | 'wild'; players: PlayerView[]; draft?: Draft; racers: Racer[]; currentRacerId?: string; pending?: Omit<PendingChoice, 'context'>; waitingFor?: string; logs: GameEvent[]; results: RaceResult[]; lastRoll?: GameState['lastRoll']; rulesStatus: string; }
export interface Identity { roomCode: string; playerId: string; token: string; role?: RoomRole; }
export interface ActionReply { ok: boolean; error?: string; version?: number; duplicate?: boolean; }
export interface RoomView { hosting?: 'browser' | 'local' | 'worker'; authorityId?: string; authorityOnline?: boolean; closedAt?: number; }
export interface RoomView { baseTurnOrder?: string[]; hostLeftAt?: number; closeReason?: 'expired' | 'host-away' | 'dismissed'; }
export interface Room { spectators?: Spectator[]; }
export interface Room { ownerId?: string; }
export interface RoomView { ownerId?: string; }
export interface RoomView { role?: RoomRole; spectators?: Spectator[]; createdAt?: number; expiresAt?: number; }
export interface Player { renameUsed?: boolean; renameRequestId?: string; }
export interface GameState { characterPool?: CharacterPool; rulesVersion?: string; }
export interface GameState { config?: import('./room-config.js').RoomConfig; }
export interface Room { configFrozen?: boolean; }
export interface RoomView { config?: import('./room-config.js').RoomConfig; configFrozen?: boolean; }
export interface RoomView { waitingPrompt?: {playerId:string; racerId?:string; kind:string}; }
export interface Room { chat?: ChatState; }
export interface RoomView { characterPool?: CharacterPool; rulesVersion?: string; chat?: ChatMessage[]; chatLatestId?: number; renameRemaining?: number; }
export interface Racer { identityPlayerId?: string; }
export interface GameState { randomStream?: import('./random.js').RandomStream }
export interface RaceResult { drawReason?: 'forced-cycle' }

/** Public snapshots for intermediate presentation beats, never hidden choice data. */
export interface GameEvent { changes?: { racerId:string; playerId?:string; form?:string; mount?:string|null }[]; }

export interface GameEvent { rollKind?: 'main'|'ability'|'contest'|'recovery'|'reroll'; }
/** Public grant at this event's exact time; never private draw candidates. */
export interface GameEvent { grantedPowerIds?: string[]; grantDuration?: PublicAbilityEntry['duration']; }
