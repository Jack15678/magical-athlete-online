import type { ChatMessage } from '../shared/types.js';

export interface CommunityState { messages: ChatMessage[]; latestId: number; connected: boolean; renameRemaining?: number; name?: string }
/** Community updates have their own sequence and never advance gameplay. */
export class CommunityFeed {
  private state: CommunityState = { messages: [], latestId: 0, connected: false };
  private listeners = new Set<(state: CommunityState) => void>();
  subscribe = (listener: (state: CommunityState) => void) => {
    this.listeners.add(listener); listener(this.state);
    return () => { this.listeners.delete(listener); };
  };
  update(change: Partial<CommunityState>) {
    const messages = change.messages ? [...new Map([...this.state.messages, ...change.messages].map(message => [message.id, message])).values()].sort((a, b) => a.id - b.id).slice(-100) : this.state.messages;
    this.state = { ...this.state, ...change, messages, latestId: Math.max(this.state.latestId, change.latestId ?? 0, messages.at(-1)?.id ?? 0) };
    for (const listener of this.listeners) listener(this.state);
  }
}
