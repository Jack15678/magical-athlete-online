export type Phase = 'lobby' | 'draft' | 'selection' | 'race' | 'results' | 'finished' | 'paused';
export interface Player { id: string; name: string; seat: number; color: string; ready: boolean; connected: boolean; score: number; hand: string[]; used: string[]; selection: string[]; }
export interface Racer { id: string; playerId: string; characterId: string; position: number; tripped: boolean; finished: boolean; eliminated: boolean; rank?: number; flags: Record<string, unknown>; }
export interface ChoiceOption { id: string; label: string; }
export interface PendingChoice { id: string; playerId: string; racerId?: string; title: string; options: ChoiceOption[]; optional: boolean; kind: string; context: Record<string, unknown>; }
export interface GameEvent { id: number; type: string; text: string; source?: string; targets?: string[]; before?: number[]; after?: number[]; group?: string; cause?: string; }
export interface Draft { market: string[]; order: string[]; cursor: number; batch: number; }
export interface RaceResult { round: number; placements: { racerId: string; playerId: string; characterId: string; rank: number; points: number }[]; }
export interface GameState { phase: Phase; round: number; players: Player[]; deck: string[]; discard: string[]; draft?: Draft; racers: Racer[]; turn: number; turnCount: number; currentRacerId?: string; pending?: PendingChoice; queue: Task[]; logs: GameEvent[]; results: RaceResult[]; rngState: number; randomLog: { index: number; reason: string; value: number }[]; lastRoll?: { racerId: string; face: number; distance: number }; track: 'mild' | 'wild'; flags: Record<string, unknown>; }
export interface Task { kind: string; [key: string]: unknown; }
export interface Room { code: string; hostId: string; createdAt: number; updatedAt: number; version: number; maxPlayers: number; timeoutSeconds: number; deadline: number | null; game: GameState; closedAt?: number; }
export type GameAction = { type: 'ready'; ready: boolean } | { type: 'start' } | { type: 'draft'; characterId: string } | { type: 'select'; characterIds: string[] } | { type: 'roll' } | { type: 'choose'; choiceId: string; optionId: string } | { type: 'next' } | { type: 'rematch' } | { type: 'transfer'; playerId: string } | { type: 'close' };
export interface ActionEnvelope { actionId: string; expectedVersion: number; action: GameAction; }
export interface PlayerView extends Omit<Player, 'hand' | 'selection'> { handCount: number; selected: boolean; hand?: string[]; selection?: string[]; }
export interface RoomView { code: string; version: number; hostId: string; selfId: string; maxPlayers: number; timeoutSeconds: number; deadline: number | null; phase: Phase; round: number; track: 'mild' | 'wild'; players: PlayerView[]; draft?: Draft; racers: Racer[]; currentRacerId?: string; pending?: Omit<PendingChoice, 'context'>; waitingFor?: string; logs: GameEvent[]; results: RaceResult[]; lastRoll?: GameState['lastRoll']; rulesStatus: string; }
export interface Identity { roomCode: string; playerId: string; token: string; }
export interface ActionReply { ok: boolean; error?: string; version?: number; duplicate?: boolean; }
export interface RoomView { hosting?: 'browser' | 'local'; authorityId?: string; authorityOnline?: boolean; closedAt?: number; }
