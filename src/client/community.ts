import type { ChatMessage } from '../shared/types.js';

export interface CommunityState { messages: ChatMessage[]; latestId: number; connected: boolean; renameRemaining?: number; name?: string; liveRevision?: number; liveMessages?: ChatMessage[] }
/** Community updates have their own sequence and never advance gameplay. */
export class CommunityFeed {
  private state: CommunityState = { messages: [], latestId: 0, connected: false };
  private listeners = new Set<(state: CommunityState) => void>();
  private hydrated = false;
  subscribe = (listener: (state: CommunityState) => void) => {
    this.listeners.add(listener); listener(this.state);
    return () => { this.listeners.delete(listener); };
  };
  update(change: Partial<CommunityState>, source: 'update' | 'history' | 'live' = 'update') {
    // The transport explicitly marks hydration. A reconnect backlog must never
    // become a toast, even when its IDs are newer than the cached history.
    if(change.connected===false)this.hydrated=false;
    const fresh=source==='live'&&this.hydrated&&this.state.connected?(change.messages??[]).filter(message=>message.id>this.state.latestId):[];
    if(source==='history'&&change.messages)this.hydrated=true;
    const messages = change.messages ? [...new Map([...this.state.messages, ...change.messages].map(message => [message.id, message])).values()].sort((a, b) => a.id - b.id).slice(-100) : this.state.messages;
    this.state = { ...this.state, ...change, messages, latestId: Math.max(this.state.latestId, change.latestId ?? 0, messages.at(-1)?.id ?? 0) };
    // Keep a bounded live tail so React batching cannot drop the first messages
    // of a burst before the collapsed panel gets its next render.
    if(fresh.length)this.state={...this.state,liveRevision:(this.state.liveRevision??0)+1,liveMessages:[...(this.state.liveMessages??[]),...fresh].slice(-100)};
    if(change.connected===false)this.state={...this.state,liveMessages:[]};
    for (const listener of this.listeners) listener(this.state);
  }
}
