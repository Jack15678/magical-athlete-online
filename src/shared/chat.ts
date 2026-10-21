import type { ChatMessage, ChatSend, ChatState } from './types.js';

export const CHAT_HISTORY_LIMIT = 100;
export const CHAT_TEXT_LIMIT = 500;
export function validateNickname(value: unknown): string {
  if (typeof value !== 'string') throw Error('请输入昵称。');
  const name = value.trim().normalize('NFKC');
  if (!name || name.length > 20 || /[\p{Cc}\p{Cf}]/u.test(name)) throw Error('昵称需为1～20个字，不能含控制字符。');
  return name;
}
/** Case and width variants share one namespace; IDs remain the only identity. */
export const nicknameKey = (value: string) => value.trim().normalize('NFKC').toLowerCase();
export function uniqueNickname(value: unknown, names: Iterable<string>): string {
  const base = validateNickname(value), occupied = new Set([...names].map(nicknameKey));
  if (!occupied.has(nicknameKey(base))) return base;
  for (let suffix = 1; ; suffix++) {
    const digits = String(suffix), candidate = base.slice(0, 20 - digits.length) + digits;
    if (!occupied.has(nicknameKey(candidate))) return candidate;
  }
}
/** One-time healing for pre-feature saves. Reserve every existing spelling so
 * a duplicate never takes a suffix that already belongs to another member. */
export function deduplicateStoredNicknames<T extends {name:string}>(members:T[]):T[] {
  const reserved=members.map(member=>member.name),seen=new Set<string>(),allocated:string[]=[];
  return members.map(member=>{
    const key=nicknameKey(member.name);
    const name=seen.has(key)?uniqueNickname(member.name.trim().normalize('NFKC').slice(0,20),[...reserved,...allocated]):member.name;
    seen.add(key);allocated.push(name);return {...member,name};
  });
}
export function validateChatSend(value: unknown): ChatSend {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('聊天消息格式不正确。');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['clientMessageId', 'text'].includes(key)) || typeof input.clientMessageId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.clientMessageId) || typeof input.text !== 'string') throw Error('聊天消息格式不正确。');
  const text = input.text.trim();
  if (!text || text.length > CHAT_TEXT_LIMIT || /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\p{Cf}]/u.test(text)) throw Error('消息需为1～500个字，不能含控制字符。');
  return { clientMessageId: input.clientMessageId, text };
}
export function chatState(state?: ChatState): ChatState { return state ?? { messages: [], latestId: 0, windows: {} }; }
export function appendChat(state: ChatState | undefined, message: Omit<ChatMessage, 'id'>): ChatState {
  const current = chatState(state), next = { ...message, id: current.latestId + 1 };
  return { ...current, latestId: next.id, messages: [...current.messages, next].slice(-CHAT_HISTORY_LIMIT) };
}
export function appendPlayerChat(state: ChatState | undefined, senderId: string, senderName: string, input: ChatSend, now: number): ChatState {
  const current = chatState(state), window = (current.windows[senderId] ?? []).filter(at => now - at < 10_000);
  if (window.length >= 6) throw Error('聊天发送太频繁，请稍后再试。');
  const result = appendChat(current, { senderId, senderName, ...input, sentAt: now, kind: 'player' });
  result.windows = { ...current.windows, [senderId]: [...window, now] };
  return result;
}
export function chatBatch(state: ChatState | undefined, afterId = 0): { messages: ChatMessage[]; latestId: number } {
  if (!Number.isSafeInteger(afterId) || afterId < 0) throw Error('聊天同步位置无效。');
  const current = chatState(state);
  return { messages: structuredClone(current.messages.filter(message => message.id > afterId)), latestId: current.latestId };
}
