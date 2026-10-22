import type { ChatMessage } from '../shared/types.js';

export const CHAT_NOTICE_MS=6_000;
export interface ChatNotice { message:ChatMessage; count:number; expiresAt:number }
export function nextChatNotice(previous:ChatNotice|null,messages:ChatMessage[],selfId:string,now:number):ChatNotice|null{
  const incoming=messages.filter(message=>message.senderId!==selfId);
  if(!incoming.length)return previous;
  return {message:incoming.at(-1)!,count:(previous&&previous.expiresAt>now?previous.count:0)+incoming.length,expiresAt:now+CHAT_NOTICE_MS};
}
export function ChatNoticeBubble({notice,onOpen}:{notice:ChatNotice;onOpen:()=>void}){
  const message=notice.message,text=message.text.length>100?message.text.slice(0,100)+'…':message.text;
  return <button type="button" className="chat-notice" data-testid="chat-notice" onClick={onOpen} aria-label={`查看新消息，${message.kind==='system'?'系统':message.senderName}：${text}`}><strong>{message.kind==='system'?'系统':message.senderName}</strong><span>{text}</span>{notice.count>1&&<small>共 {notice.count} 条新消息 · 点击查看</small>}</button>;
}
