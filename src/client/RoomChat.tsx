import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RoomView } from '../shared/types.js';
import type { RoomConnection } from './network.js';
import type { CommunityState } from './community.js';
import { ChatNoticeBubble, nextChatNotice, type ChatNotice } from './chat-notices.js';

export function RoomChat({ room, community, connection, immersive, onRename }: { room: RoomView; community: CommunityState; connection: RoomConnection | null; immersive: boolean; onRename: () => void }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState('');
  const [seen, setSeen] = useState(() => { try { return Number(sessionStorage.getItem(`magical-athlete:chat-read:${room.code}`)) || community.latestId; } catch { return community.latestId; } });
  const [newBelow, setNewBelow] = useState(false);
  const [notice,setNotice]=useState<ChatNotice|null>(null);
  const noticed=useRef(community.liveRevision??0);
  const noticedMessage=useRef(community.liveMessages?.at(-1)?.id??0);
  const list = useRef<HTMLDivElement>(null), bottom = useRef(true), initial = useRef(true);
  const retry = useRef<{ text: string; clientMessageId: string } | null>(null);
  const unread = community.messages.filter(message => message.id > seen && message.senderId !== room.selfId).length;
  const markRead = () => { setSeen(community.latestId); try { sessionStorage.setItem(`magical-athlete:chat-read:${room.code}`, String(community.latestId)); } catch { /* Optional read marker. */ } };
  const scrollBottom = () => { if (list.current) list.current.scrollTop = list.current.scrollHeight; bottom.current = true; setNewBelow(false); markRead(); };
  useEffect(()=>{
    const revision=community.liveRevision??0;
    if(open||!community.connected)setNotice(null);
    else if(revision>noticed.current){const fresh=(community.liveMessages??[]).filter(message=>message.id>noticedMessage.current);setNotice(previous=>nextChatNotice(previous,fresh,room.selfId,Date.now()));}
    noticed.current=revision;
    noticedMessage.current=community.liveMessages?.at(-1)?.id??noticedMessage.current;
  },[community.liveRevision,community.connected,open,room.selfId]);
  useEffect(()=>{
    if(!notice)return;
    const timer=setTimeout(()=>setNotice(current=>current&&current.expiresAt<=Date.now()?null:current),Math.max(0,notice.expiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[notice]);
  useLayoutEffect(() => {
    if (!open) return;
    if (initial.current || bottom.current) { scrollBottom(); initial.current = false; }
    else setNewBelow(community.latestId > seen);
  }, [open, community.latestId]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => { document.documentElement.style.setProperty('--chat-keyboard-offset', `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`); };
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll',update); window.addEventListener('resize',update); update();
    return () => { viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll',update); window.removeEventListener('resize',update); document.documentElement.style.removeProperty('--chat-keyboard-offset'); };
  }, []);
  useEffect(() => {
    if (!immersive) return;
    let panel: Element | null = null;
    const resize = new ResizeObserver(() => measure());
    const measure = () => {
      const next = document.querySelector('.floating-choice');
      if (next !== panel) { resize.disconnect(); panel = next; if (panel) resize.observe(panel); }
      const height = panel?.getBoundingClientRect().height;
      if (height) document.documentElement.style.setProperty('--chat-skill-height', `${height}px`);
      else document.documentElement.style.removeProperty('--chat-skill-height');
    };
    const changes = new MutationObserver(measure); changes.observe(document.body, {childList: true, subtree: true}); measure();
    return () => {resize.disconnect();changes.disconnect();document.documentElement.style.removeProperty('--chat-skill-height');};
  }, [immersive]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || sending || !connection?.sendChat) return;
    if (value.length > 500) { setError('消息最多 500 个字符。'); return; }
    setSending(true); setError('');
    const request = retry.current?.text === value ? retry.current : { text: value, clientMessageId: crypto.randomUUID() };
    retry.current = request;
    try {
      const reply = await connection.sendChat(request);
      if (!reply.ok) { setError(reply.error ?? '发送失败，请重试。'); return; }
      retry.current = null; setText(''); bottom.current = true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '尚未确认发送，请重试。'); }
    finally { setSending(false); }
  };
  // A viewport overlay must not inherit any ancestor's transform/containment:
  // those turn fixed coordinates into page-local coordinates during scenes.
  return createPortal(<aside className={`room-community ${immersive ? 'in-race' : ''} ${open ? 'is-open' : ''}`} data-testid="room-community" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setOpen(false); }}>
    {!open&&notice&&<div className="chat-notice-region" aria-live="polite" aria-atomic="true"><ChatNoticeBubble notice={notice} onOpen={()=>setOpen(true)} /></div>}
    {!open && <button className="chat-toggle" aria-label={`房间聊天${unread ? `，${unread} 条未读` : ''}`} aria-expanded={false} onClick={() => setOpen(true)}>💬 聊天{unread > 0 && <b className="chat-unread">{unread}</b>}</button>}
    {open && <section className="room-chat" aria-label="房间聊天" data-testid="room-chat">
      <header><div><strong>房间聊天</strong><small>{community.connected ? '玩家与观战者 · 最近 100 条' : '连接中，消息将自动补齐'}</small></div><button aria-label="收起聊天" onClick={() => setOpen(false)}>−</button></header>
      <div className="chat-personal"><span>{community.name ?? room.players.find(player => player.id === room.selfId)?.name ?? room.spectators?.find(viewer => viewer.id === room.selfId)?.name}</span>{room.role !== 'spectator' && <button disabled={room.phase === 'lobby'} title={room.phase === 'lobby' ? '开局后可修改一次昵称' : undefined} onClick={onRename}>修改昵称 · {community.renameRemaining ?? room.renameRemaining ?? 1} 次</button>}</div>
      <div className="chat-messages" ref={list} role="log" aria-label="聊天记录" aria-live="polite" aria-relevant="additions" onScroll={() => { const el = list.current; bottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 36; if (bottom.current) { setNewBelow(false); markRead(); } }}>
        {community.messages.length === 0 && <p className="chat-empty">和房间里的朋友打个招呼吧。</p>}
        {community.messages.map(message => <article key={message.id} className={`chat-message ${message.kind === 'system' ? 'is-system' : ''} ${message.senderId === room.selfId ? 'is-self' : ''}`} data-message-id={message.id}>
          <div><strong>{message.kind === 'system' ? '系统' : message.senderName}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p>
        </article>)}
      </div>
      {newBelow && <button className="chat-new" onClick={scrollBottom}>查看新消息 ↓</button>}
      {error && <p className="chat-error" role="alert">{error}</p>}
      <form onSubmit={send}><label className="sr-only" htmlFor="room-chat-input">聊天消息</label><textarea id="room-chat-input" rows={1} maxLength={500} value={text} onChange={event => setText(event.target.value)} placeholder="说点什么…" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button disabled={sending || !community.connected || !text.trim()}>{sending ? '发送中' : '发送'}</button></form>
    </section>}
  </aside>,document.body);
}

export function RenameForm({ room, community, connection, onSuccess }: { room: RoomView; community: CommunityState; connection: RoomConnection | null; onSuccess: (name: string) => void }) {
  const current = community.name ?? room.players.find(player => player.id === room.selfId)?.name ?? '';
  const [name, setName] = useState(current), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<{ requestId: string; name: string } | null>(null);
  const remaining = community.renameRemaining ?? room.renameRemaining ?? 1;
  return <form className="rename-form" onSubmit={async event => {
    event.preventDefault(); if (busy || !remaining || !connection?.rename) return;
    setBusy(true); setError('');
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) { setError('昵称需要 1～20 个字符。'); setBusy(false); return; }
    if (request.current?.name !== trimmed) request.current = { requestId: crypto.randomUUID(), name: trimmed };
    try { const reply = await connection.rename(request.current!); if (reply.ok && reply.name) onSuccess(reply.name); else { setError(reply.error ?? '修改未成功，请重试。'); request.current = null; } }
    catch (cause) { setError(cause instanceof Error ? cause.message : '尚未确认修改，请重试。'); }
    finally { setBusy(false); }
  }}><p>当前昵称：<strong>{current}</strong></p><p>{remaining ? '每局完整对局可修改一次，四场比赛共用。重名时自动追加最小可用数字。' : '本局已修改过昵称'}</p><label>新昵称<input autoComplete="nickname" autoFocus maxLength={20} disabled={!remaining || busy} value={name} onChange={event => setName(event.target.value)} /></label>{error && <p role="alert" className="form-error">{error}</p>}<button className="button" disabled={!remaining || busy || !name.trim() || name.trim() === current}>{busy ? '修改中…' : '确认修改昵称'}</button></form>;
}
