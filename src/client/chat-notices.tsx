import type { CSSProperties } from 'react';
import type { ChatMessage } from '../shared/types.js';

/** Keep lifetime, capacity and animation costs bounded in one place. */
export const CHAT_NOTICE_CONFIG = Object.freeze({ desktopLimit: 5, mobileLimit: 3, mobileBreakpoint: 650, lifetimeMs: 8_000, enterMs: 220, exitMs: 220, stackMs: 220 });
export const CHAT_NOTICE_MS = CHAT_NOTICE_CONFIG.lifetimeMs;
export interface ChatNotice { message: ChatMessage; createdAt: number; expiresAt: number; leaving: boolean }
export function advanceChatNotices(previous: readonly ChatNotice[], now: number, limit: number): ChatNotice[] {
  return previous.filter(notice => now < notice.expiresAt + CHAT_NOTICE_CONFIG.exitMs)
    .slice(-limit).map(notice => ({ ...notice, leaving: now >= notice.expiresAt }));
}
/** Input contains only the transport's fresh live tail, never history hydration. */
export function appendChatNotices(previous: readonly ChatNotice[], messages: readonly ChatMessage[], selfId: string, now: number, limit: number): ChatNotice[] {
  const retained = advanceChatNotices(previous, now, limit), ids = new Set(retained.map(notice => notice.message.id));
  for (const message of [...messages].sort((a, b) => a.id - b.id)) {
    if (message.senderId === selfId || ids.has(message.id)) continue;
    ids.add(message.id);
    retained.push({ message, createdAt: now, expiresAt: now + CHAT_NOTICE_MS, leaving: false });
  }
  return retained.slice(-limit);
}
export function ChatNoticeBubble({ notice, onOpen }: { notice: ChatNotice; onOpen: () => void }) {
  const message = notice.message, text = message.text.length > 160 ? message.text.slice(0, 160) + '…' : message.text;
  return <button type="button" className={`chat-notice${notice.leaving ? ' is-leaving' : ''}`} data-testid="chat-notice" data-message-id={message.id} onClick={onOpen} style={{ '--chat-notice-enter': `${CHAT_NOTICE_CONFIG.enterMs}ms`, '--chat-notice-exit': `${CHAT_NOTICE_CONFIG.exitMs}ms` } as CSSProperties} aria-label={`查看聊天记录，${message.kind === 'system' ? '系统' : message.senderName}：${text}`}><strong>{message.kind === 'system' ? '系统' : message.senderName}</strong><span>{text}</span></button>;
}
