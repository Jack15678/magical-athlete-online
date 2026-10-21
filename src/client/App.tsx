import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameAction, Identity, PlayerView, Racer, RoomView } from '../shared/types.js';
import { CHARACTERS } from '../shared/characters.js';
import { Avatar } from './avatars.js';
import { RulesContent } from './RulesContent.js';
import { BROWSER_HOST_MODE, connectRoom, enterRoom, forgetIdentity, readIdentity, sendAction, type ConnectionState, type RoomConnection } from './network.js';
import { usePresentation, type UsePresentationResult } from './usePresentation.js';
const Board3D = lazy(() => import('./scene/Board3D.js').then(module => ({ default: module.Board3D })));

const characters = CHARACTERS;
const findCharacter = (id: string) => characters.find((character) => character.id === id);
const characterName = (id: string) => findCharacter(id)?.nameZh ?? id;
const phaseLabels = { lobby: '赛前集合', draft: '组建你的队伍', selection: '秘密选择运动员', race: '比赛进行中', results: '单场成绩', finished: '总成绩', paused: '比赛已暂停' };
function currentCode() { return /^\/room\/([a-z0-9-]+)/i.exec(location.pathname)?.[1]?.toUpperCase() ?? ''; }
const setting = (key: string, fallback: boolean) => { try { const value = localStorage.getItem(`magical-athlete:${key}`); return value === null ? fallback : value === 'true'; } catch { return fallback; } };
function Icon({ kind, size = 22 }: { kind: 'dice' | 'flag' | 'copy' | 'sound' | 'mute' | 'arrow' | 'trophy'; size?: number }) {
  const paths: Record<string, ReactNode> = {
    dice: <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1" /><circle cx="16" cy="8" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="8" cy="16" r="1" /><circle cx="16" cy="16" r="1" /></>,
    flag: <><path d="M5 22V3m0 1c5-5 9 5 15 0v11c-6 5-10-5-15 0" /><path d="M10 3v10m5-8v10" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 4H5v12" /></>,
    sound: <><path d="M4 9h4l5-5v16l-5-5H4zM17 8q5 4 0 8m3-11q8 7 0 14" /></>,
    mute: <><path d="M3 9h4l5-5v16l-5-5H3zM16 9l6 6m0-6-6 6" /></>,
    arrow: <path d="M3 12h17M14 5l7 7-7 7" />,
    trophy: <><path d="M7 3h10v6c0 7-10 7-10 0V3zm0 2H3v3q0 5 5 5m9-8h4v3q0 5-5 5m-4 2v6m-5 0h10" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
function Button({ children, secondary = false, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button className={`button ${secondary ? 'button-secondary' : ''} ${className}`} {...props}>{children}</button>;
}
function Footer() { return <footer className="footer"><span>非官方同好项目 · 中文角色名为本项目译名</span><a href="https://www.cmyk.games/products/magical-athlete" target="_blank" rel="noreferrer">认识 CMYK 原作 ↗</a></footer>; }

export function App() {
  const [code, setCode] = useState(currentCode);
  const [identity, setIdentity] = useState<Identity | null>(() => readIdentity(currentCode()));
  const [room, setRoom] = useState<RoomView | null>(null);
  const [endRoom, setEndRoom] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [connectionError, setConnectionError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const socket = useRef<RoomConnection | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => setting('muted', true));
  const [reduceMotion, setReduceMotion] = useState(() => setting('reduced-motion', matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [lowQuality, setLowQuality] = useState(() => setting('low-quality', false));
  const [animationSpeed, setAnimationSpeed] = useState(() => { try { return [1, 2, 4].includes(Number(localStorage.getItem('magical-athlete:animation-speed'))) ? Number(localStorage.getItem('magical-athlete:animation-speed')) : 1; } catch { return 1; } });
  useEffect(() => { try { localStorage.setItem('magical-athlete:low-quality', String(lowQuality)); localStorage.setItem('magical-athlete:animation-speed', String(animationSpeed)); } catch { /* Optional local preferences. */ } }, [lowQuality, animationSpeed]);
  const soundRef = useRef<AudioContext | null>(null);
  const sound = useCallback(() => {
    if (muted) return;
    try {
      const ctx = soundRef.current ??= new AudioContext();
      void ctx.resume();
      const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(480, ctx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + .08);
      gain.gain.setValueAtTime(.04, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .14);
      oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .15);
    } catch { /* Browser audio may be unavailable; play never depends on sound. */ }
  }, [muted]);
  useEffect(() => { document.documentElement.dataset.motion = reduceMotion ? 'reduce' : 'full'; try { localStorage.setItem('magical-athlete:reduced-motion', String(reduceMotion)); localStorage.setItem('magical-athlete:muted', String(muted)); } catch { /* Preferences are optional. */ } }, [reduceMotion, muted]);
  useEffect(() => { const pop = () => { const next = currentCode(); setCode(next); setIdentity(readIdentity(next)); setRoom(null); setError(''); setEndRoom(false); setConnection('connecting'); }; addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
  useEffect(() => {
    if (!identity) return;
    setConnection('connecting'); setConnectionError('');
    const client = connectRoom(identity, (next) => { setRoom(previous => previous?.code === next.code && previous.version > next.version ? previous : next); }, (state, message) => { setConnection(state); setConnectionError(message ?? ''); });
    socket.current = client;
    const sync = () => { if (document.visibilityState === 'visible' && client.connected) client.emit('sync'); };
    document.addEventListener('visibilitychange', sync); addEventListener('focus', sync); addEventListener('online', sync); addEventListener('pageshow', sync);
    return () => { client.disconnect(); socket.current = null; document.removeEventListener('visibilitychange', sync); removeEventListener('focus', sync); removeEventListener('online', sync); removeEventListener('pageshow', sync); };
  }, [identity]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (connection === 'closed' || room?.closedAt) document.title = '房间已解散 | 胡闹运动会'; else if (room) document.title = `${room.code} · ${phaseLabels[room.phase]} | 胡闹运动会`; else document.title = '胡闹运动会 · 好友联机'; }, [room, connection]);
  const act = useCallback(async (action: GameAction) => {
    if (!room || room.closedAt || !socket.current?.connected || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try { const reply = await sendAction(socket.current, room, action); if (!reply.ok) { setError(reply.error ?? '此时无法进行这个操作。'); socket.current?.emit('sync'); } else sound(); return reply.ok; }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作未确认，请重新同步。'); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }, [room, sound]);
  const enter = (next: { identity: Identity; room: RoomView }) => { history.pushState({}, '', `/room/${next.room.code}`); setCode(next.room.code); setRoom(next.room); setIdentity(next.identity); setError(''); setConnection('connecting'); };
  const resume = (saved: Identity) => { history.pushState({}, '', `/room/${saved.roomCode}`); setCode(saved.roomCode); setRoom(null); setIdentity(saved); setError(''); setConnection('connecting'); };
  const copy = async (value: string, label: string) => { try { await navigator.clipboard.writeText(value); setNotice(`${label}已复制`); } catch { setCopyFallback(value); } };
  const home = () => { history.pushState({}, '', '/'); setCode(''); setIdentity(null); setRoom(null); setError(''); setEndRoom(false); setConnection('connecting'); setConnectionError(''); };
  const online = connection === 'online' && room?.authorityOnline !== false;
  const presentation = usePresentation(room, { speed: animationSpeed, reducedMotion: reduceMotion, reconnect: !online });
  const visibleRoom = presentation.displayRoom ?? room;
  const closed = connection === 'closed' || !!room?.closedAt;
  return <>
    <header className="site-header"><button className="wordmark" onClick={home} aria-label="胡闹运动会首页"><span className="logo-dice"><Icon kind="dice" size={28} /></span><span>胡闹运动会<small>Magical Athlete · 好友联机</small></span></button><nav><button className="header-link" onClick={() => setRules(true)}>怎么玩</button><button className="sound-toggle" onClick={() => setMuted(!muted)} aria-label={muted ? '开启提示音' : '关闭提示音'} aria-pressed={!muted}><Icon kind={muted ? 'mute' : 'sound'} /></button></nav></header>
    {closed ? <main className="restore-screen room-closed" data-room-closed="true"><div className="large-dice"><Icon kind="flag" size={68} /></div><h1>房间已解散</h1><p>房主已结束此房间，所有玩家已退出。<br />此房间不能恢复。</p><Button onClick={home}>返回首页</Button></main> : !identity ? <Home code={code} onEnter={enter} onResume={resume} onHome={home} onDetail={setDetail} /> : !room ? <main className="restore-screen"><div className="large-dice"><Icon kind="dice" size={68} /></div><h1>{connectionError.includes('计算房主网页离线') ? '等待计算房主返回' : '正在回到赛场…'}</h1><p>{connectionError || '正在恢复你的座位与对局进度。'}</p>{connection === 'offline' && <Button secondary onClick={() => socket.current?.connect()}>重新同步</Button>}{connection === 'error' && <><Button onClick={() => socket.current?.connect()}>重新连接</Button><Button secondary onClick={() => { forgetIdentity(code); setIdentity(null); }}>重新输入昵称</Button></>}</main> : <>
      <div className="room-bar"><div className="room-label">房间 <button onClick={() => void copy(room.code, '房间码')} title="复制房间码">{room.code}<Icon kind="copy" size={15} /></button><span className={`connection ${online ? 'is-online' : ''}`}><i />{online ? '已连接' : connection === 'connecting' ? '连接中' : '重连中'}</span></div><div className="room-actions"><button className="invite-button" onClick={() => void copy(`${location.origin}/room/${room.code}`, '邀请链接')}><Icon kind="copy" size={17} />邀请朋友</button>{room.hostId === room.selfId && <button className="end-room-button" disabled={busy || !online} onClick={() => setEndRoom(true)}>结束房间</button>}</div></div>
      {!online && <div className="connection-banner" role="status">{connectionError || '连接暂时中断，恢复后会自动同步。'}<button onClick={() => { socket.current?.connect(); socket.current?.emit('sync'); }}>立即重连</button></div>}
      {error && !endRoom && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}
      <main className={`game-shell phase-${visibleRoom?.phase ?? room.phase}`} data-room-version={room.version}>
        {room.hosting === 'browser' && <div className="authority-notice"><strong>计算房主：{room.players.find(player => player.id === room.authorityId)?.name ?? '创建者'}</strong><span>{room.authorityId === room.selfId ? '请保持负责计算的原浏览器标签页打开。对局存档保存在这个浏览器中。' : '计算房主页面在线时对局继续；关闭后等待其用原浏览器返回。'}</span></div>}
        <div className="stage-heading"><div><p className="stage-kicker">{room.phase === 'lobby' ? '朋友到齐，就开跑' : room.phase === 'draft' ? `第 ${(room.draft?.batch ?? 0) + 1} 次选秀` : `第 ${Math.max(1, room.round)} / 4 场 · ${room.track === 'mild' ? '轻松赛道' : '狂野赛道'}`}</p><h1>{phaseLabels[visibleRoom?.phase ?? room.phase]}</h1></div><span className="mode-tag">{room.players.length >= 7 ? '7～8 人扩展规则' : room.players.length === 2 ? '两人双角色模式' : '标准模式'}</span></div>
        {room.phase === 'lobby' ? <Lobby room={room} busy={busy || !online} act={act} copy={copy} /> : <>
          {room.phase === 'draft' && <Draft room={room} busy={busy || !online} act={act} onDetail={setDetail} />}
          {room.phase === 'selection' && <Selection room={room} busy={busy || !online} act={act} onDetail={setDetail} />}
          {['race', 'results', 'finished'].includes(room.phase) && <Race room={room} busy={busy || !online} act={act} onDetail={setDetail} presentation={presentation} lowQuality={lowQuality} setLowQuality={setLowQuality} reduceMotion={reduceMotion} setReduceMotion={setReduceMotion} muted={muted} setMuted={setMuted} animationSpeed={animationSpeed} setAnimationSpeed={setAnimationSpeed} />}
          {room.phase === 'paused' && <div className="paper-panel"><h2>比赛已保存</h2><p>需要处理规则状态后继续，当前对局与所有分数均已保留。</p><p>{room.rulesStatus}</p><Button secondary onClick={() => socket.current?.emit('sync')}>重新同步</Button></div>}
          <div className="below-game"><Scoreboard room={room} /><EventLog room={room} /></div>
          <MyTeam room={room} onDetail={setDetail} />
        </>}
        <details className="room-details"><summary>房间设置与扩展说明</summary><p>最多 {room.maxPlayers} 人 · 操作时限 {room.timeoutSeconds === 0 ? '不限时' : `${room.timeoutSeconds} 秒`}。系统仅在合法选项中执行公开默认选择；可选技能默认放弃。</p><p>7～8 人为本项目扩展模式：每人四张独立角色，两次蛇形选秀各展示 2N 张候选牌，奖分沿用基础赛程；尚未声称与官方人数具有相同平衡性。牌堆不足等裁定可在规则说明中查看。</p><p className="rules-status">{room.rulesStatus}</p><button className="text-button" onClick={() => setRules(true)}>查看规则与操作说明</button></details>
      </main>
    </>}
    <Footer />
    {notice && <div className="toast" role="status">{notice}</div>}
    {detail && !closed && <CharacterModal id={detail} onClose={() => setDetail(null)} />}
    {copyFallback && !closed && <Modal title="手动复制" onClose={() => setCopyFallback(null)}><div className="manual-copy"><p>长按或选中下方内容，复制后发给朋友。</p><input aria-label="待复制的邀请内容" value={copyFallback} readOnly onFocus={event => event.target.select()} /><Button secondary onClick={() => setCopyFallback(null)}>完成</Button></div></Modal>}
    {rules && !closed && <Modal title="怎么玩" onClose={() => setRules(false)}><RulesContent browser={BROWSER_HOST_MODE} /></Modal>}
    {endRoom && !closed && room && room.hostId === room.selfId && <Modal title="结束此房间？" busy={busy} descriptionId="end-room-description" onClose={() => { if (!busyRef.current) setEndRoom(false); }}><div className="end-room-confirm"><p id="end-room-description">确认后将解散整个房间，所有玩家都会退出。此操作不能撤销，房间和对局不能恢复。</p>{error && <p className="end-room-error" role="alert">{error}</p>}<div className="end-room-confirm-actions"><Button secondary data-modal-focus="" disabled={busy} onClick={() => setEndRoom(false)}>取消</Button><Button className="button-danger" disabled={busy || !online} onClick={async () => { if (await act({ type: 'close' })) setEndRoom(false); }}>{busy ? '正在结束…' : '确认结束'}</Button></div></div></Modal>}
  </>;
}

function Home({ code, onEnter, onResume, onHome, onDetail }: { code: string; onEnter: (reply: { identity: Identity; room: RoomView }) => void; onResume: (identity: Identity) => void; onHome: () => void; onDetail: (id: string) => void }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem('magical-athlete:name') ?? ''; } catch { return ''; } });
  const [joinCode, setJoinCode] = useState(code);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [timeoutSeconds, setTimeoutSeconds] = useState(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>(code ? 'join' : 'create');
  useEffect(() => { setJoinCode(code); if (code) setMode('join'); }, [code]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { if (!name.trim()) throw new Error('先给自己取个昵称。'); if (mode === 'join' && !joinCode.trim()) throw new Error('请输入朋友发来的房间码。'); const saved = mode === 'join' ? readIdentity(joinCode.trim().toUpperCase()) : null; if (saved) { onResume(saved); return; } const reply = await enterRoom(mode === 'join' ? joinCode.trim().toUpperCase() : null, { name: name.trim(), maxPlayers, timeoutSeconds }); try { localStorage.setItem('magical-athlete:name', name.trim()); } catch { /* Optional. */ } onEnter(reply); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法进入房间，请重试。'); }
    finally { setBusy(false); }
  }
  const heroIds = ['banana', 'rocket-scientist', 'egg', 'huge-baby', 'centaur'];
  return <main className="home">
    <section className="hero"><div className="hero-title"><span>各就各位，</span><h1>胡闹<br />运动会<span className="title-star">✦</span></h1><p>选个怪咖，掷个骰子。<br />和朋友一起，认真地胡闹一场。</p></div><div className="hero-art" aria-hidden="true"><div className="hero-orbit" /><div className="hero-finish"><Icon kind="flag" size={58} /></div>{heroIds.map((id, index) => <div className={`hero-racer hero-racer-${index}`} key={id}><Avatar id={id} /></div>)}<div className="hero-stamp">2～8 人<br /><strong>好友开跑!</strong></div></div></section>
    {BROWSER_HOST_MODE && <div className="browser-host-intro"><strong>打开网页，就能当房主。</strong><p>任意电脑无需安装即可开房。创建房间的浏览器负责实时计算，请保持这个标签页打开；完整对局存档保存在房主浏览器中。朋友只需相同网址和房间号。</p></div>}
    <section className="entry-panel"><div className="entry-tabs" role="tablist" aria-label="进入游戏方式"><button id="create-tab" role="tab" aria-controls="entry-form" aria-selected={mode === 'create'} onClick={() => { setMode('create'); setError(''); }}>创建房间</button><button id="join-tab" role="tab" aria-controls="entry-form" aria-selected={mode === 'join'} onClick={() => { setMode('join'); setError(''); }}>加入朋友</button></div><form id="entry-form" aria-labelledby={`${mode}-tab`} onSubmit={submit}><h2>{mode === 'create' ? '这场运动会，你来召集。' : code ? `朋友在 ${code} 等你` : '朋友的赛场在哪儿？'}</h2><label>你的昵称<input name="name" placeholder="比如：跑不动同学" autoComplete="nickname" maxLength={20} value={name} onChange={event => setName(event.target.value)} required /></label>{mode === 'join' ? <label>房间码<input name="roomCode" className="room-code-input" placeholder="输入房间码" autoCapitalize="characters" maxLength={12} value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} required /></label> : <div className="form-split"><label>房间人数上限<select value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))}>{Array.from({ length: 7 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} 人{n >= 7 ? ' · 扩展规则' : n === 2 ? ' · 双角色' : ' · 标准'}</option>)}</select></label><label>每次操作时限<select value={timeoutSeconds} onChange={event => setTimeoutSeconds(Number(event.target.value))}><option value={0}>不限时</option><option value={60}>60 秒</option><option value={90}>90 秒</option><option value={120}>120 秒</option><option value={180}>180 秒</option></select></label></div>}{maxPlayers >= 7 && mode === 'create' && <p className="form-note">7～8 人使用本项目扩展规则，初始选牌唯一；平衡性未经官方验证。</p>}{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? '正在进入…' : mode === 'create' ? '创建房间，召集朋友' : '加入这场胡闹'}<Icon kind="arrow" /></Button><p className="form-note">无需注册 · 链接邀请 · 电脑手机都能玩</p>{code && <button type="button" className="text-button" onClick={onHome}>返回首页</button>}</form></section>
    <section className="meet-racers"><div className="section-intro"><h2>谁说运动员<br />一定要会运动？</h2><p>36 位各怀绝技的怪咖。<br />点开头像，先认识几位。</p></div><div className="sample-racers">{characters.slice(0, 6).map(character => <button key={character.id} onClick={() => onDetail(character.id)}><Avatar id={character.id} /><strong>{character.nameZh}</strong></button>)}</div></section>
  </main>;
}

function Lobby({ room, busy, act, copy }: { room: RoomView; busy: boolean; act: (action: GameAction) => void; copy: (value: string, label: string) => void }) {
  const self = room.players.find(player => player.id === room.selfId)!;
  const ready = room.players.length >= 2 && room.players.every(player => player.ready && player.connected);
  const isHost = room.selfId === room.hostId;
  const invite = `${location.origin}/room/${room.code}`;
  return <div className="lobby-layout"><section className="player-area"><div className="lobby-count"><span>{room.players.length}<small> / {room.maxPlayers} 人已入座</small></span><span className="ready-count">{room.players.filter(p => p.ready).length} 人已准备</span></div><div className="lobby-seats">{Array.from({ length: room.maxPlayers }, (_, index) => { const player = room.players.find(p => p.seat === index) ?? room.players[index]; return player ? <div className={`seat ${player.id === room.selfId ? 'self-seat' : ''}`} key={player.id} style={{ '--player-color': player.color } as CSSProperties}><span className="seat-avatar">{player.name.slice(0, 1)}<span>{player.seat + 1}</span></span><div><strong>{player.name}{player.id === room.selfId && <small>你</small>}</strong><p>{player.id === room.hostId ? '房主' : '运动员'} · {player.connected ? '在线' : '暂时离线'}</p></div><span className={`ready-badge ${player.ready ? 'is-ready' : ''}`}>{player.ready ? '已准备 ✓' : '等准备'}</span></div> : <div className="seat empty-seat" key={index}><span className="empty-avatar">＋</span><span>虚位以待<small>把链接发给朋友</small></span></div>; })}</div><div className="lobby-actions"><Button secondary={self.ready} disabled={busy} onClick={() => act({ type: 'ready', ready: !self.ready })}>{self.ready ? '取消准备' : '我准备好了'}</Button>{isHost && <Button disabled={busy || !ready} onClick={() => act({ type: 'start' })}><Icon kind="flag" />开始选秀</Button>}</div><p className="helper-text">{room.players.length < 2 ? '再邀请至少一位朋友，就能开始。' : ready ? isHost ? '全员准备完毕，随时开跑！' : '全员准备完毕，等待房主开局。' : '所有人点击准备后，房主就能开始选秀。'}</p></section><aside className="lobby-invite"><div className="invite-drawing"><Icon kind="flag" size={86} /></div><h2>朋友集合！</h2><p>把专属链接发给同学，<br />打开、取名，就能入座。</p><div className="invite-code">{room.code}</div><Button onClick={() => copy(invite, '邀请链接')}><Icon kind="copy" />复制邀请链接</Button><a className="selectable-link" href={invite}>{invite}</a><p className="small-note">刷新会保留座位。<br />用同一浏览器回来即可重连。</p>{isHost && room.players.length > 1 && <details className="transfer-host"><summary>转交房主</summary>{room.players.filter(p => p.id !== room.selfId).map(player => <button key={player.id} disabled={busy} onClick={() => act({ type: 'transfer', playerId: player.id })}>交给 {player.name}</button>)}</details>}</aside></div>;
}

function CharacterCard({ id, selected, disabled, onChoose, onDetail, used }: { id: string; selected?: boolean; disabled?: boolean; onChoose?: () => void; onDetail: (id: string) => void; used?: boolean }) {
  const character = findCharacter(id);
  return <article className={`character-card ${selected ? 'selected' : ''} ${used ? 'used' : ''}`}><button className="character-art" disabled={disabled || used || !onChoose} onClick={onChoose} aria-label={`${selected ? '取消选择' : '选择'}${characterName(id)}`} aria-pressed={onChoose ? selected : undefined}><Avatar id={id} />{selected && <span className="selected-tick">✓</span>}{used && <span className="used-label">已上场</span>}</button><div className="character-copy"><h3>{characterName(id)}</h3><p className="english-name">{character?.nameEn ?? id.replace(/-/g, ' ')}</p><p className="ability-text">{character?.ability ?? '点击查看角色能力。'}</p><button className="detail-button" onClick={() => onDetail(id)}>查看能力 <span>＋</span></button></div></article>;
}
function Draft({ room, busy, act, onDetail }: { room: RoomView; busy: boolean; act: (action: GameAction) => void; onDetail: (id: string) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const draft = room.draft;
  const currentId = draft?.order[draft.cursor];
  const current = room.players.find(p => p.id === currentId);
  const mine = currentId === room.selfId;
  useEffect(() => setPick(null), [draft?.cursor, draft?.batch]);
  return <><div className={`turn-notice ${mine ? 'your-turn' : ''}`}><Icon kind="flag" /><span>{mine ? '轮到你挑选了' : `等待 ${current?.name ?? '运动员'} 挑选`}<small>每位角色仅能被一人选走，挑一位加入你的队伍。</small></span><Countdown deadline={room.deadline} /></div><div className="draft-order">{draft?.order.map((id, index) => <span key={`${id}-${index}`} className={index === draft.cursor ? 'active' : index < draft.cursor ? 'done' : ''}>{room.players.find(p => p.id === id)?.name}{index < draft.cursor ? ' ✓' : ''}</span>)}</div><div className="character-grid">{draft?.market.map(id => <CharacterCard key={id} id={id} selected={pick === id} disabled={!mine || busy} onChoose={() => setPick(pick === id ? null : id)} onDetail={onDetail} />)}</div>{mine && <div className="sticky-action"><span>{pick ? `让 ${characterName(pick)} 加入队伍` : '点击一位运动员，读懂能力再选'}</span><Button disabled={busy || !pick} onClick={() => { if (pick) act({ type: 'draft', characterId: pick }); }}>确认选择{pick ? ` · ${characterName(pick)}` : ''}</Button></div>}</>;
}
function Selection({ room, busy, act, onDetail }: { room: RoomView; busy: boolean; act: (action: GameAction) => void; onDetail: (id: string) => void }) {
  const self = room.players.find(p => p.id === room.selfId)!;
  const count = room.players.length === 2 ? 2 : 1;
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [room.round]);
  const toggle = (id: string) => setPicked(previous => previous.includes(id) ? previous.filter(value => value !== id) : count === 1 ? [id] : previous.length < count ? [...previous, id] : previous);
  return <><div className="turn-notice"><span className="secret-icon">?</span><span>{self.selected ? '你已锁定，等大家选好就揭示' : `秘密选择 ${count} 位未上场的运动员`}<small>其他玩家只能看到你是否选好，揭示前看不到角色。</small></span><Countdown deadline={room.deadline} /></div><div className="selection-progress">{room.players.map(player => <span key={player.id} className={player.selected ? 'locked' : ''}><i style={{ background: player.color }} />{player.name}<strong>{player.selected ? '已锁定 ✓' : '思考中…'}</strong></span>)}</div><div className="character-grid hand-selection">{self.hand?.map(id => <CharacterCard key={id} id={id} used={self.used.includes(id)} selected={self.selected ? self.selection?.includes(id) : picked.includes(id)} disabled={busy || self.selected} onChoose={() => toggle(id)} onDetail={onDetail} />)}</div>{!self.selected && <div className="sticky-action"><span>已选 {picked.length} / {count} 位 · 确认后统一揭示</span><Button disabled={busy || picked.length !== count} onClick={() => act({ type: 'select', characterIds: picked })}>锁定上场角色</Button></div>}</>;
}

function Race({ room, busy, act, onDetail, presentation, lowQuality, setLowQuality, reduceMotion, setReduceMotion, muted, setMuted, animationSpeed, setAnimationSpeed }: { room: RoomView; busy: boolean; act: (action: GameAction) => void; onDetail: (id: string) => void; presentation: UsePresentationResult; lowQuality: boolean; setLowQuality: (value: boolean) => void; reduceMotion: boolean; setReduceMotion: (value: boolean) => void; muted: boolean; setMuted: (value: boolean) => void; animationSpeed: number; setAnimationSpeed: (value: number) => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const active = room.racers.find(racer => racer.id === room.currentRacerId);
  const player = room.players.find(p => p.id === active?.playerId);
  const mine = player?.id === room.selfId;
  const roll = room.lastRoll;
  const { beat, playing } = presentation;
  const showing = presentation.displayRoom ?? room;
  const playbackRacer = presentation.racers.find(r => r.id === beat?.source);
  const playbackLabel = beat?.kind === 'dice' ? '正在掷骰 · 停稳后出发' : beat?.kind === 'move' ? beat.motions.some(m => m.to < m.from) ? '后退移动' : beat.motions.length > 1 ? '同时移动' : '逐格前进' : beat?.kind === 'swap' ? '交换位置' : beat?.kind === 'warp' ? '传送中' : beat?.kind === 'trip' ? '绊倒了！' : beat?.kind === 'score' ? '获得分数' : beat?.kind === 'finish' ? '冲过终点！' : '技能连锁';
  return <>
    <div className="presentation-toolbar"><span>玩具赛场 · {room.racers.length} 位运动员</span><button data-testid="presentation-settings" aria-expanded={settingsOpen} aria-controls="presentation-settings-panel" onClick={() => setSettingsOpen(!settingsOpen)}>⚙ 画面与动画</button></div>
    {settingsOpen && <div className="presentation-settings" id="presentation-settings-panel"><label><input type="checkbox" checked={lowQuality} onChange={event => setLowQuality(event.target.checked)} />低画质</label><label><input type="checkbox" checked={muted} onChange={event => setMuted(event.target.checked)} />静音</label><label><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} />减少动效</label><label>动画速度<select aria-label="动画速度" value={animationSpeed} onChange={event => setAnimationSpeed(Number(event.target.value))}><option value={1}>1× · 完整演出</option><option value={2}>2× · 快速</option><option value={4}>4× · 极速</option></select></label></div>}
    {playing ? <div className="race-turn turn-notice playback-notice" role="status" data-testid="animation-phase"><span className="turn-avatar">{playbackRacer && <Avatar id={playbackRacer.characterId} />}</span><span>{playbackLabel}<small>{beat?.events.map(event => event.text).join(' · ')}</small></span><button className="skip-animation" data-testid="skip-animation" onClick={presentation.skip}>跳过动画 »</button></div> : room.phase === 'race' && <div className={`race-turn turn-notice ${mine && !room.pending && !room.waitingFor ? 'your-turn' : ''}`} data-testid="animation-phase"><span className="turn-avatar">{active && <Avatar id={active.characterId} />}</span><span>{room.pending ? '技能发动！请做出选择' : room.waitingFor ? `等待 ${room.players.find(p => p.id === room.waitingFor)?.name ?? '其他玩家'} 响应技能` : mine ? '轮到你掷骰了' : `轮到 ${player?.name ?? '运动员'} 行动`}<small>{active ? `${characterName(active.characterId)}${active.tripped ? ' · 目前绊倒' : ''}` : '正在处理赛前能力'}</small></span><Countdown deadline={room.deadline} /></div>}
    <Suspense fallback={<div className="restore-screen" style={{ minHeight: 400 }}>立体赛场正在就位…</div>}><Board3D room={room} racers={presentation.racers} beat={beat} startedAt={presentation.startedAt} durationMs={presentation.durationMs} lowQuality={lowQuality} reducedMotion={reduceMotion} muted={muted} onDetail={onDetail} /></Suspense>
    <details className="race-roster"><summary>运动员与位置 · {room.racers.length} 位 / 点击查看能力</summary><div className="racer-strip">{showing.racers.map(racer => <RacerSummary key={racer.id} racer={racer} room={showing} onDetail={onDetail} />)}</div></details>
    {!playing && room.phase !== 'race' ? <Results room={room} busy={busy} act={act} onDetail={onDetail} /> : !playing && room.pending ? <div className="choice-panel" role="region" aria-label="待处理技能"><div><span className="burst">✦</span><h2>{room.pending.title}</h2><p>{room.pending.optional ? '这是可选技能，可选择放弃。' : '选择一个合法选项，比赛会在确认后继续。'}</p></div><div className="choice-options">{room.pending.options.map(option => <Button key={option.id} secondary={['skip', 'pass', 'decline'].includes(option.id)} disabled={busy || room.pending?.playerId !== room.selfId} onClick={() => act({ type: 'choose', choiceId: room.pending!.id, optionId: option.id })}>{option.label}</Button>)}</div></div> : <div className="race-action sticky-action"><div className="last-dice"><Dice face={playing ? undefined : roll?.face} /><span data-testid={beat?.kind === 'dice' ? undefined : 'dice-value'}>{playing ? <>{playbackLabel}<small>演出完成后继续 · 可跳过</small></> : roll ? <>{characterName(room.racers.find(r => r.id === roll.racerId)?.characterId ?? '')}<small>骰面 {roll.face} · 移动 {roll.distance} 格</small></> : <>准备好了吗？<small>点数由房间统一确认</small></>}</span></div><Button disabled={busy || playing || !mine || !!room.waitingFor} onClick={() => act({ type: 'roll' })}><Icon kind="dice" size={26} />{playing ? '正在演出…' : busy ? '正在处理…' : mine ? '掷骰子' : '等待其他玩家'}</Button></div>}
  </>;
}
function Dice({ face }: { face?: number }) {
  const spots: Record<number, [number, number][]> = { 1: [[25, 25]], 2: [[13, 13], [37, 37]], 3: [[13, 13], [25, 25], [37, 37]], 4: [[13, 13], [37, 13], [13, 37], [37, 37]], 5: [[13, 13], [37, 13], [25, 25], [13, 37], [37, 37]], 6: [[13, 12], [37, 12], [13, 25], [37, 25], [13, 38], [37, 38]] };
  return <svg className="dice" viewBox="0 0 50 50" role="img" aria-label={face ? `骰子 ${face} 点` : '等待掷骰'}><rect x="2" y="2" width="46" height="46" rx="9" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />{face ? spots[face]?.map(([x, y], index) => <circle cx={x} cy={y} r="3.4" fill="var(--ink)" key={index} />) : <text x="25" y="35" textAnchor="middle" fontSize="30" fontWeight="bold">?</text>}</svg>;
}
function RacerSummary({ racer, room, onDetail }: { racer: Racer; room: RoomView; onDetail: (id: string) => void }) {
  const player = room.players.find(p => p.id === racer.playerId);
  return <button className={`racer-summary ${racer.id === room.currentRacerId ? 'active' : ''} ${racer.eliminated ? 'eliminated' : ''}`} onClick={() => onDetail(racer.characterId)} style={{ '--player-color': player?.color } as CSSProperties}><Avatar id={racer.characterId} /><span><strong>{characterName(racer.characterId)}</strong><small>{player?.seat !== undefined ? player.seat + 1 : ''} · {player?.name}</small></span><b>{racer.eliminated ? '出局' : racer.finished ? `第${racer.rank ?? '—'}名` : `${racer.position}格`}{racer.tripped && <small>绊倒</small>}</b></button>;
}

function Results({ room, busy, act, onDetail }: { room: RoomView; busy: boolean; act: (action: GameAction) => void; onDetail: (id: string) => void }) {
  const finished = room.phase === 'finished';
  const result = room.results.at(-1);
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const winners = sorted.filter(player => player.score === sorted[0]?.score);
  return <section className="results-panel"><div className="results-title"><Icon kind="trophy" size={68} /><div><h2>{finished ? `${winners.map(p => p.name).join('、')}夺冠！` : `第 ${room.round} 场，收工！`}</h2><p>{finished ? '四场比赛，一场漂亮的胡闹。再来一局，重新选人！' : '收好奖分，下一场会更精彩。'}</p></div></div>{finished ? <div className="final-ranking">{sorted.map((player, index) => <div key={player.id} className={player.score === sorted[0]?.score ? 'winner' : ''}><span className="ranking-number">{player.score === sorted[0]?.score ? '★' : index + 1}</span><i style={{ background: player.color }} /><strong>{player.name}{player.id === room.selfId && <small>你</small>}</strong><span className="ranking-score">{player.score}<small>分</small></span></div>)}</div> : <div className="round-results">{result?.placements.map(place => <div className={`result-racer rank-${place.rank}`} key={place.racerId}><span className="rank-medal">{place.rank}</span><button onClick={() => onDetail(place.characterId)}><Avatar id={place.characterId} /></button><h3>{characterName(place.characterId)}</h3><p>{room.players.find(p => p.id === place.playerId)?.name}</p><strong>＋{place.points}<small>分</small></strong></div>)}</div>}<div className="results-actions">{room.selfId === room.hostId ? <Button disabled={busy} onClick={() => act({ type: finished ? 'rematch' : 'next' })}>{finished ? '原房间，再来一局' : '前往下一场'}<Icon kind="arrow" /></Button> : <p>等待房主{finished ? '开始新一局' : '进入下一场'}。你的位置会保留。</p>}</div></section>;
}
function Scoreboard({ room }: { room: RoomView }) { return <section className="scoreboard"><h2>积分榜 <Icon kind="trophy" size={21} /></h2><div>{[...room.players].sort((a, b) => b.score - a.score).map((player, index) => <div className={player.id === room.selfId ? 'score-self' : ''} key={player.id}><span className="score-rank">{index + 1}</span><i style={{ background: player.color }} /><strong>{player.name}{player.id === room.selfId && <small>你</small>}</strong>{!player.connected && <span className="offline-note">离线</span>}<b>{player.score}<small>分</small></b></div>)}</div></section>; }
function EventLog({ room }: { room: RoomView }) { return <section className="event-log"><h2>赛场播报 <span>最新在前</span></h2><ol aria-live="polite" aria-relevant="additions">{room.logs.slice(-18).reverse().map(event => <li key={event.id}><span>{event.id.toString().padStart(2, '0')}</span><p>{event.text}</p></li>)}{!room.logs.length && <li><p>发令枪还没响，大家蓄势待发。</p></li>}</ol></section>; }
function MyTeam({ room, onDetail }: { room: RoomView; onDetail: (id: string) => void }) {
  const self = room.players.find(p => p.id === room.selfId);
  if (!self?.hand?.length) return null;
  return <section className="my-team"><h2>我的队伍 <small>仅你可见</small></h2><div>{self.hand.map(id => <button className={self.used.includes(id) ? 'used' : ''} key={id} onClick={() => onDetail(id)}><Avatar id={id} /><span><strong>{characterName(id)}</strong><small>{self.used.includes(id) ? '已上场' : '待上场'}</small></span></button>)}</div></section>;
}
function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (!deadline) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`countdown ${seconds <= 15 ? 'urgent' : ''}`} aria-label={`剩余${seconds}秒`}>{seconds}<small>秒</small></span>;
}
function CharacterModal({ id, onClose }: { id: string; onClose: () => void }) {
  const character = findCharacter(id);
  return <Modal title={characterName(id)} onClose={onClose}><div className="character-modal"><div className="modal-avatar"><Avatar id={id} /></div><p className="english-name">{character?.nameEn ?? id}</p><h3>角色能力</h3><p className="full-ability">{character?.ability ?? '角色资料正在载入。'}</p><p className="small-note">角色中文名为本项目译名。技能与合法选项由服务器统一裁定。</p></div></Modal>;
}
function Modal({ title, children, onClose, busy = false, descriptionId }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; descriptionId?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; (panel.current?.querySelector<HTMLElement>('[data-modal-focus]') ?? panel.current)?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); if (event.key === 'Tab') { const elements = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a, input:not([disabled]), select:not([disabled]), [tabindex="0"]'); if (!elements?.length) { event.preventDefault(); panel.current?.focus(); return; } const first = elements[0], last = elements[elements.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } };
    document.addEventListener('keydown', key); return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={onClose}><div ref={panel} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={descriptionId} tabIndex={-1} onClick={event => event.stopPropagation()}><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="close-button" disabled={busy} onClick={onClose} aria-label="关闭">×</button></div>{children}</div></div>;
}
