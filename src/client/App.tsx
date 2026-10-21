import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameAction, Identity, PlayerView, Racer, RoomRole, RoomSummary, RoomView } from '../shared/types.js';
import { CHARACTERS } from '../shared/characters.js';
import { Avatar } from './avatars.js';
import { RulesContent } from './RulesContent.js';
import { BROWSER_HOST_MODE, connectRoom, enterRoom, forgetIdentity, leaveRoom, listRooms, readIdentity, saveIdentity, sendAction, type ConnectionState, type RoomConnection } from './network.js';
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
  const [leaving, setLeaving] = useState(false);
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
  useEffect(() => { if (connection === 'expired') document.title = '房间已到期 | 胡闹运动会'; else if (connection === 'closed' || room?.closedAt) document.title = '房间已解散 | 胡闹运动会'; else if (room) document.title = `${room.code} · ${phaseLabels[room.phase]} | 胡闹运动会`; else document.title = '胡闹运动会 · 好友联机'; }, [room, connection]);
  const act = useCallback(async (action: GameAction) => {
    if (!room || room.role === 'spectator' || room.closedAt || !socket.current?.connected || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try { const reply = await sendAction(socket.current, room, action); if (!reply.ok) { setError(reply.error ?? '此时无法进行这个操作。'); socket.current?.emit('sync'); } else sound(); return reply.ok; }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作未确认，请重新同步。'); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }, [room, sound]);
  const enter = (next: { identity: Identity; room: RoomView }) => { history.pushState({}, '', `/room/${next.room.code}`); setCode(next.room.code); setRoom(next.room); setIdentity(next.identity); setError(''); setConnection('connecting'); };
  const resume = (saved: Identity) => { saveIdentity(saved); history.pushState({}, '', `/room/${saved.roomCode}`); setCode(saved.roomCode); setRoom(null); setIdentity(saved); setError(''); setConnection('connecting'); };
  const copy = async (value: string, label: string) => { try { await navigator.clipboard.writeText(value); setNotice(`${label}已复制`); } catch { setCopyFallback(value); } };
  const home = () => { history.pushState({}, '', '/'); setCode(''); setIdentity(null); setRoom(null); setError(''); setEndRoom(false); setLeaving(false); setConnection('connecting'); setConnectionError(''); };
  const leave = async () => {
    if (!identity || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await leaveRoom(identity); socket.current?.disconnect(); home(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法退出，请重试。'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const requestLeave = () => { if (room?.hosting === 'browser' && room.authorityId === room.selfId) setLeaving(true); else void leave(); };
  const online = connection === 'online' && room?.authorityOnline !== false;
  const presentation = usePresentation(room, { speed: animationSpeed, reducedMotion: reduceMotion, reconnect: !online });
  useEffect(()=>{const cursor=presentation.state?.eventCursor;if(cursor!==undefined)socket.current?.acknowledgeEvents?.(cursor);},[presentation.state?.eventCursor]);
  const visibleRoom = presentation.displayRoom ?? room;
  const expired = connection === 'expired';
  const closed = expired || connection === 'closed' || !!room?.closedAt;
  const spectator = room?.role === 'spectator';
  const visiblePhase = visibleRoom?.phase ?? room?.phase;
  const immersive = !closed && !!room && !!visiblePhase && ['race', 'results', 'finished'].includes(visiblePhase);
  useEffect(() => { document.documentElement.dataset.view = immersive ? 'race' : 'page'; return () => { delete document.documentElement.dataset.view; }; }, [immersive]);
  return <>
    {!immersive && <header className="site-header"><button className="wordmark" disabled={busy} onClick={identity && !closed ? requestLeave : home} aria-label="胡闹运动会首页"><span className="logo-dice"><Icon kind="dice" size={28} /></span><span>胡闹运动会<small>Magical Athlete · 随时开跑</small></span></button><nav><button className="header-link" onClick={() => setRules(true)}>怎么玩</button><button className="sound-toggle" onClick={() => setMuted(!muted)} aria-label={muted ? '开启提示音' : '关闭提示音'} aria-pressed={!muted}><Icon kind={muted ? 'mute' : 'sound'} /></button></nav></header>}
    {closed ? <main className="restore-screen room-closed" data-room-closed="true"><div className="large-dice"><Icon kind="flag" size={68} /></div><h1>{expired ? '房间已到期' : '房间已解散'}</h1><p>{expired ? <>每个房间最多存在 3 小时，到期后会自动关闭。<br />返回首页即可创建或加入新的房间。</> : <>房主已结束此房间，所有玩家和观战者已退出。<br />此房间不能恢复。</>}</p><Button onClick={home}>返回首页</Button></main> : !identity ? <Home code={code} onEnter={enter} onResume={resume} onHome={home} onDetail={setDetail} /> : !room ? <main className="restore-screen"><div className="large-dice"><Icon kind="dice" size={68} /></div><h1>{connectionError.includes('计算房主网页离线') ? '等待计算房主返回' : '正在回到赛场…'}</h1><p>{connectionError || '正在恢复你的座位与对局进度。'}</p>{connection === 'offline' && <Button secondary onClick={() => socket.current?.connect()}>重新同步</Button>}{connection === 'error' && <><Button onClick={() => socket.current?.connect()}>重新连接</Button><Button secondary onClick={() => { forgetIdentity(code); setIdentity(null); }}>重新输入昵称</Button></>}<Button secondary disabled={busy} onClick={requestLeave}>{identity.role === 'spectator' ? '退出观看' : '退出房间'}</Button>{error && <p className="form-error" role="alert">{error}</p>}</main> : <>
      {!immersive && <div className="room-bar"><div className="room-label">房间 <button onClick={() => void copy(room.code, '房间码')} title="复制房间码">{room.code}<Icon kind="copy" size={15} /></button>{spectator && <span className="spectator-badge">正在观战</span>}<span className={`connection ${online ? 'is-online' : ''}`}><i />{online ? '已连接' : connection === 'connecting' ? '连接中' : '重连中'}</span></div><div className="room-actions"><button className="invite-button" onClick={() => void copy(`${location.origin}/room/${room.code}`, '邀请链接')}><Icon kind="copy" size={17} />邀请朋友</button><button className="leave-room-button" disabled={busy} onClick={requestLeave}>{spectator ? '退出观看' : '退出房间'}</button>{!spectator && room.hostId === room.selfId && <button className="end-room-button" disabled={busy || !online} onClick={() => setEndRoom(true)}>结束房间</button>}</div></div>}
      {!online && <div className="connection-banner" role="status">{connectionError || '连接暂时中断，恢复后会自动同步。'}<button onClick={() => { socket.current?.connect(); socket.current?.emit('sync'); }}>立即重连</button></div>}
      {error && !endRoom && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误提示">×</button></div>}
      <main className={`game-shell phase-${visibleRoom?.phase ?? room.phase}`} data-room-version={room.version}>
        {!immersive && <div className={`room-session-note ${spectator ? 'is-spectating' : ''}`}>{spectator && <strong>你正在观战 · 可查看公开赛况，不参与选人和操作</strong>}<span>{room.spectators?.filter(spectator => spectator.connected).length ?? 0} 人观战 · <RoomLifetime expiresAt={room.expiresAt} /></span></div>}
        {!immersive && room.hosting === 'browser' && <div className="authority-notice"><strong>计算房主：{room.players.find(player => player.id === room.authorityId)?.name ?? '创建者'}</strong><span>{room.authorityId === room.selfId ? '请保持负责计算的原浏览器标签页打开。对局存档保存在这个浏览器中。' : '计算房主页面在线时对局继续；关闭后等待其用原浏览器返回。'}</span></div>}
        {!immersive && <div className="stage-heading"><div><p className="stage-kicker">{room.phase === 'lobby' ? '朋友到齐，就开跑' : room.phase === 'draft' ? `第 ${(room.draft?.batch ?? 0) + 1} 次选秀` : `第 ${Math.max(1, room.round)} / 4 场 · ${room.track === 'mild' ? '轻松赛道' : '狂野赛道'}`}</p><h1>{phaseLabels[visibleRoom?.phase ?? room.phase]}</h1></div><span className="mode-tag">{room.mode === 'practice' ? '自己练习' : room.mode === 'ai' ? '人机对战' : room.players.length >= 7 ? '7～8 人扩展规则' : room.players.length === 2 ? '两人双角色模式' : '标准模式'}</span></div>}
        {visiblePhase === 'lobby' ? <Lobby room={room} busy={busy || !online} act={act} copy={copy} /> : <>
          {visiblePhase === 'draft' && <Draft room={visibleRoom ?? room} busy={busy || !online} act={act} onDetail={setDetail} />}
          {visiblePhase === 'selection' && <Selection room={visibleRoom ?? room} busy={busy || !online} act={act} onDetail={setDetail} />}
          {visiblePhase && ['race', 'results', 'finished'].includes(visiblePhase) && <Race room={room} busy={busy || !online} leavingBusy={busy} act={act} onDetail={setDetail} presentation={presentation} lowQuality={lowQuality} setLowQuality={setLowQuality} reduceMotion={reduceMotion} setReduceMotion={setReduceMotion} muted={muted} setMuted={setMuted} animationSpeed={animationSpeed} setAnimationSpeed={setAnimationSpeed} online={online} onRules={() => setRules(true)} onEnd={() => setEndRoom(true)} onLeave={requestLeave} onInvite={() => void copy(`${location.origin}/room/${room.code}`, '邀请链接')} />}
          {visiblePhase === 'paused' && <div className="paper-panel"><h2>比赛已保存</h2><p>需要处理规则状态后继续，当前对局与所有分数均已保留。</p><p>{room.rulesStatus}</p><Button secondary onClick={() => socket.current?.emit('sync')}>重新同步</Button></div>}
          {!immersive && <><div className="below-game"><Scoreboard room={room} /><EventLog room={room} /></div><MyTeam room={room} onDetail={setDetail} /></>}
        </>}
        {!immersive && <details className="room-details"><summary>房间设置与扩展说明</summary><p>最多 {room.maxPlayers} 人 · 操作时限 {room.timeoutSeconds === 0 ? '不限时' : `${room.timeoutSeconds} 秒`}。系统仅在合法选项中执行公开默认选择；可选技能默认放弃。</p><p>7～8 人为本项目扩展模式：每人四张独立角色，两次蛇形选秀各展示 2N 张候选牌，奖分沿用基础赛程；尚未声称与官方人数具有相同平衡性。牌堆不足等裁定可在规则说明中查看。</p><p className="rules-status">{room.rulesStatus}</p><button className="text-button" onClick={() => setRules(true)}>查看规则与操作说明</button></details>}
      </main>
    </>}
    {!immersive && <Footer />}
    {notice && <div className="toast" role="status">{notice}</div>}
    {detail && !closed && <CharacterModal id={detail} onClose={() => setDetail(null)} />}
    {copyFallback && !closed && <Modal title="手动复制" onClose={() => setCopyFallback(null)}><div className="manual-copy"><p>长按或选中下方内容，复制后发给朋友。</p><input aria-label="待复制的邀请内容" value={copyFallback} readOnly onFocus={event => event.target.select()} /><Button secondary onClick={() => setCopyFallback(null)}>完成</Button></div></Modal>}
    {rules && !closed && <Modal title="怎么玩" onClose={() => setRules(false)}><RulesContent browser={BROWSER_HOST_MODE} /></Modal>}
    {endRoom && !closed && room && !spectator && room.hostId === room.selfId && <Modal title="结束此房间？" busy={busy} descriptionId="end-room-description" onClose={() => { if (!busyRef.current) setEndRoom(false); }}><div className="end-room-confirm"><p id="end-room-description">确认后将解散整个房间，所有玩家都会退出，观战者也将离开。此操作不能撤销，房间和对局不能恢复。</p>{error && <p className="end-room-error" role="alert">{error}</p>}<div className="end-room-confirm-actions"><Button secondary data-modal-focus="" disabled={busy} onClick={() => setEndRoom(false)}>取消</Button><Button className="button-danger" disabled={busy || !online} onClick={async () => { if (await act({ type: 'close' })) setEndRoom(false); }}>{busy ? '正在结束…' : '确认结束'}</Button></div></div></Modal>}
    {leaving && !closed && <Modal title="退出计算房主页面？" busy={busy} descriptionId="leave-room-description" onClose={() => { if (!busyRef.current) setLeaving(false); }}><div className="end-room-confirm"><p id="leave-room-description">这个浏览器负责计算比赛。退出后比赛将暂停；在房间 3 小时有效期内，用原浏览器回到此房间即可继续。</p>{error && <p className="end-room-error" role="alert">{error}</p>}<div className="end-room-confirm-actions"><Button secondary disabled={busy} onClick={() => setLeaving(false)}>继续留在房间</Button><Button disabled={busy} onClick={() => void leave()}>{busy ? '正在退出…' : '确认退出房间'}</Button></div></div></Modal>}
  </>;
}

function Home({ code, onEnter, onResume, onHome, onDetail }: { code: string; onEnter: (reply: { identity: Identity; room: RoomView }) => void; onResume: (identity: Identity) => void; onHome: () => void; onDetail: (id: string) => void }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem('magical-athlete:name') ?? ''; } catch { return ''; } });
  const [joinCode, setJoinCode] = useState(code);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [timeoutSeconds, setTimeoutSeconds] = useState(120);
  const [aiCount, setAiCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'create' | 'join' | 'practice' | 'ai'>(code ? 'join' : 'create');
  const [role, setRole] = useState<RoomRole>('player');
  useEffect(() => { setJoinCode(code); if (code) setMode('join'); }, [code]);
  async function enterSelected(selectedCode?: string, selectedRole = role) {
    if (busy) return; setBusy(true); setError('');
    try {
      const nickname = name.trim() || (mode === 'practice' || mode === 'ai' ? '胡闹选手' : '');
      if (!nickname) { document.querySelector<HTMLInputElement>('[name="name"]')?.focus(); throw new Error('先给自己取个昵称，再选择房间。'); }
      const targetCode = mode === 'join' ? (selectedCode ?? joinCode).trim().toUpperCase() : null;
      if (mode === 'join' && !targetCode) throw new Error('请选择下方房间，或输入朋友发来的房间码。');
      const saved = targetCode ? readIdentity(targetCode, selectedRole) : null;
      if (saved) { onResume(saved); return; }
      const reply = await enterRoom(targetCode, { name: nickname, maxPlayers, timeoutSeconds: mode === 'practice' || mode === 'ai' ? 0 : timeoutSeconds, mode: mode === 'practice' || mode === 'ai' ? mode : 'multiplayer', aiCount, ...(mode === 'join' ? { role: selectedRole } : {}) });
      try { localStorage.setItem('magical-athlete:name', nickname); } catch { /* Optional. */ }
      onEnter(reply);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法进入房间，请重试。'); }
    finally { setBusy(false); }
  }
  function submit(event: React.FormEvent) { event.preventDefault(); void enterSelected(); }
  const heroIds = ['banana', 'rocket-scientist', 'egg', 'huge-baby', 'centaur'];
  return <main className="home">
    <section className="hero"><div className="hero-title"><span>各就各位，</span><h1>胡闹<br />运动会<span className="title-star">✦</span></h1><p>选个怪咖，掷个骰子。<br />和朋友一起，认真地胡闹一场。</p></div><div className="hero-art" aria-hidden="true"><div className="hero-orbit" /><div className="hero-finish"><Icon kind="flag" size={58} /></div>{heroIds.map((id, index) => <div className={`hero-racer hero-racer-${index}`} key={id}><Avatar id={id} /></div>)}<div className="hero-stamp">1～8 人<br /><strong>随时开跑!</strong></div></div></section>
    <section className="entry-panel">
      <div className="entry-tabs" role="tablist" aria-label="进入游戏方式">{([['create', '创建房间'], ['join', '加入朋友'], ['practice', '自己练习'], ['ai', '人机对战']] as const).map(([value, label]) => <button key={value} id={`${value}-tab`} role="tab" aria-controls="entry-form" aria-selected={mode === value} onClick={() => { setMode(value); setError(''); }}>{label}</button>)}</div>
      <form id="entry-form" className={mode === 'join' ? 'join-entry-form' : undefined} aria-labelledby={`${mode}-tab`} onSubmit={submit}>
        <h2>{mode === 'practice' ? '一个人，也能尽情胡闹。' : mode === 'ai' ? '对手已就位，随时开跑。' : mode === 'create' ? '这场运动会，你来召集。' : code ? `朋友在 ${code} 等你` : '朋友的赛场在哪儿？'}</h2>
        <label>你的昵称<input name="name" placeholder={mode === 'practice' || mode === 'ai' ? '胡闹选手（可直接开始）' : '比如：跑不动同学'} autoComplete="nickname" maxLength={20} value={name} onChange={event => setName(event.target.value)} required={mode === 'create' || mode === 'join'} /></label>
        {mode === 'join' ? <><fieldset className="join-role"><legend>加入身份</legend><label><input type="radio" name="roomRole" value="player" checked={role === 'player'} onChange={() => setRole('player')} /><span>作为选手<small>入座并参与比赛</small></span></label><label><input type="radio" name="roomRole" value="spectator" checked={role === 'spectator'} onChange={() => setRole('spectator')} /><span>作为观战者<small>满员或开赛后也能观看</small></span></label></fieldset><label>房间码<input name="roomCode" className="room-code-input" placeholder="输入房间码，或选择下方房间" autoCapitalize="characters" maxLength={12} value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} required /></label></> : mode === 'practice' ? <div className="solo-intro"><strong>专属练习赛道</strong><p>自己选人、掷骰、体验技能。四场练习，不限时。</p></div> : mode === 'ai' ? <label>AI 人数<select aria-label="AI 人数" value={aiCount} onChange={event => setAiCount(Number(event.target.value))}>{Array.from({ length: 7 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} 位 AI{n === 1 ? ' · 两人双角色' : n >= 6 ? ' · 扩展规则' : ''}</option>)}</select></label> : <div className="form-split"><label>房间人数上限<select value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))}>{Array.from({ length: 7 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} 人{n >= 7 ? ' · 扩展规则' : n === 2 ? ' · 双角色' : ' · 标准'}</option>)}</select></label><label>每次操作时限<select value={timeoutSeconds} onChange={event => setTimeoutSeconds(Number(event.target.value))}><option value={0}>不限时</option><option value={60}>60 秒</option><option value={90}>90 秒</option><option value={120}>120 秒</option><option value={180}>180 秒</option></select></label></div>}
        {maxPlayers >= 7 && mode === 'create' && <p className="form-note">7～8 人使用本项目扩展规则，初始选牌唯一；平衡性未经官方验证。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? '正在进入…' : mode === 'practice' ? '开始自己练习' : mode === 'ai' ? '开始人机对战' : mode === 'create' ? '创建房间，召集朋友' : role === 'spectator' ? '进入房间观战' : '加入这场胡闹'}<Icon kind="arrow" /></Button>
        <p className="form-note">{mode === 'practice' ? '无需等待 · 随时练习 · 自动保存' : mode === 'ai' ? 'AI 自动选秀与行动 · 遵守相同规则' : '无需注册 · 链接邀请 · 电脑手机都能玩'}</p>
        <p className="form-note room-lifetime-note">每个房间最多存在 3 小时，到期自动关闭。</p>
        {mode === 'join' && <RoomDirectory busy={busy} onJoin={(roomCode, nextRole) => { setJoinCode(roomCode); setRole(nextRole); void enterSelected(roomCode, nextRole); }} />}
        {code && <button type="button" className="text-button" onClick={onHome}>返回首页</button>}
      </form>
    </section>
    <section className="meet-racers"><div className="section-intro"><h2>谁说运动员<br />一定要会运动？</h2><p>36 位各怀绝技的怪咖。<br />点开头像，先认识几位。</p></div><div className="sample-racers">{characters.slice(0, 6).map(character => <button key={character.id} onClick={() => onDetail(character.id)}><Avatar id={character.id} /><strong>{character.nameZh}</strong></button>)}</div></section>
  </main>;
}

function RoomLifetime({ expiresAt }: { expiresAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  if (!expiresAt) return <>房间最长保留 3 小时</>;
  const minutes = Math.max(0, Math.ceil((expiresAt - now) / 60_000));
  return <span title={`到期时间：${new Date(expiresAt).toLocaleString('zh-CN')}`}>{minutes ? `剩余 ${minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ` : ''}${minutes % 60} 分钟` : '即将到期'} · 最长 3 小时</span>;
}

function RoomDirectory({ busy, onJoin }: { busy: boolean; onJoin: (code: string, role: RoomRole) => void }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      if (current) setLoading(true);
      try { const next = await listRooms(); if (current) { setRooms(next); setError(''); } }
      catch (cause) { if (current) setError(cause instanceof Error ? cause.message : '房间列表暂时无法加载，可使用房间码加入。'); }
      finally { fetching = false; if (current) setLoading(false); }
    };
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10_000);
    const focus = () => void refresh();
    addEventListener('focus', focus);
    return () => { current = false; clearInterval(timer); removeEventListener('focus', focus); };
  }, [revision]);
  return <section className="room-directory" aria-label="现有房间"><div className="room-directory-heading"><div><h3>现有房间</h3><p>选一个房间，立即加入或围观。</p></div><button type="button" className="text-button" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? '刷新中…' : '刷新列表'}</button></div>{error && <p className="directory-error" role="alert">{error}</p>}{!rooms.length ? <p className="directory-empty" role="status">{loading ? '正在寻找赛场…' : error ? '可稍后刷新，或通过房间码加入。' : '还没有房间，快去创建第一场运动会吧。'}</p> : <div className="room-directory-list">{rooms.map(room => {
    const returning = !!readIdentity(room.code, 'player');
    const canJoin = returning || (room.phase === 'lobby' && (!room.mode || room.mode === 'multiplayer') && room.playerCount < room.maxPlayers && room.authorityOnline !== false);
    return <article className="directory-room" key={room.code} data-testid={`directory-room-${room.code}`}><div className="directory-room-main"><div><strong>{room.hostName} 的房间</strong><span className={`directory-phase ${room.phase === 'lobby' ? 'is-lobby' : ''}`}>{phaseLabels[room.phase]}</span></div><p><b>{room.code}</b><span>{room.playerCount} / {room.maxPlayers} 位选手</span><span>{room.spectatorCount} 人观战</span></p><small><RoomLifetime expiresAt={room.expiresAt} />{room.authorityOnline === false && ' · 等待计算房主返回'}</small></div><div className="directory-room-actions"><Button type="button" disabled={busy || !canJoin} onClick={() => onJoin(room.code, 'player')}>{returning ? '返回房间' : room.mode === 'practice' || room.mode === 'ai' ? '专属赛场' : room.phase !== 'lobby' ? '已开赛' : room.playerCount >= room.maxPlayers ? '已满员' : '加入房间'}</Button><Button type="button" secondary disabled={busy} onClick={() => onJoin(room.code, 'spectator')}>观战</Button></div></article>;
  })}</div>}<p className="directory-footnote">列表每 10 秒自动刷新。开赛后或满员的房间仍可观战。</p></section>;
}

function Lobby({ room, busy, act, copy }: { room: RoomView; busy: boolean; act: (action: GameAction) => void; copy: (value: string, label: string) => void }) {
  const self = room.role === 'spectator' ? undefined : room.players.find(player => player.id === room.selfId);
  const ready = room.players.length >= 2 && room.players.every(player => player.ready && player.connected);
  const isHost = room.selfId === room.hostId;
  const invite = `${location.origin}/room/${room.code}`;
  return <div className="lobby-layout"><section className="player-area"><div className="lobby-count"><span>{room.players.length}<small> / {room.maxPlayers} 人已入座</small></span><span className="ready-count">{room.players.filter(p => p.ready).length} 人已准备</span></div><div className="lobby-seats">{Array.from({ length: room.maxPlayers }, (_, index) => { const player = room.players.find(p => p.seat === index); return player ? <div className={`seat ${player.id === room.selfId ? 'self-seat' : ''}`} key={player.id} style={{ '--player-color': player.color } as CSSProperties}><span className="seat-avatar">{player.name.slice(0, 1)}<span>{player.seat + 1}</span></span><div><strong>{player.name}{player.id === room.selfId && <small>你</small>}</strong><p>{player.id === room.hostId ? '房主' : '运动员'} · {player.connected ? '在线' : '暂时离线'}</p></div><span className={`ready-badge ${player.ready ? 'is-ready' : ''}`}>{player.ready ? '已准备 ✓' : '等准备'}</span></div> : <div className="seat empty-seat" key={index}><span className="empty-avatar">＋</span><span>虚位以待<small>把链接发给朋友</small></span></div>; })}</div>{self && <div className="lobby-actions"><Button secondary={self.ready} disabled={busy} onClick={() => act({ type: 'ready', ready: !self.ready })}>{self.ready ? '取消准备' : '我准备好了'}</Button>{isHost && <Button disabled={busy || !ready} onClick={() => act({ type: 'start' })}><Icon kind="flag" />开始选秀</Button>}</div>}<p className="helper-text">{!self ? '你正在观战，等待选手准备与房主开局。' : room.players.length < 2 ? '再邀请至少一位朋友，就能开始。' : ready ? isHost ? '全员准备完毕，随时开跑！' : '全员准备完毕，等待房主开局。' : '所有人点击准备后，房主就能开始选秀。'}</p></section><aside className="lobby-invite"><div className="invite-drawing"><Icon kind="flag" size={86} /></div><h2>朋友集合！</h2><p>把专属链接发给同学，<br />打开、取名，就能入座。</p><div className="invite-code">{room.code}</div><Button onClick={() => copy(invite, '邀请链接')}><Icon kind="copy" />复制邀请链接</Button><a className="selectable-link" href={invite}>{invite}</a><p className="small-note">刷新会保留座位。<br />用同一浏览器回来即可重连。</p>{isHost && room.players.length > 1 && <details className="transfer-host"><summary>转交房主</summary>{room.players.filter(p => p.id !== room.selfId).map(player => <button key={player.id} disabled={busy} onClick={() => act({ type: 'transfer', playerId: player.id })}>交给 {player.name}</button>)}</details>}</aside></div>;
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
  const mine = room.role !== 'spectator' && currentId === room.selfId;
  useEffect(() => setPick(null), [draft?.cursor, draft?.batch]);
  return <><div className={`turn-notice ${mine ? 'your-turn' : ''}`}><Icon kind="flag" /><span>{mine ? '轮到你挑选了' : `等待 ${current?.name ?? '运动员'} 挑选`}<small>每位角色仅能被一人选走，挑一位加入你的队伍。</small></span><Countdown deadline={room.deadline} /></div><div className="draft-order">{draft?.order.map((id, index) => <span key={`${id}-${index}`} className={index === draft.cursor ? 'active' : index < draft.cursor ? 'done' : ''}>{room.players.find(p => p.id === id)?.name}{index < draft.cursor ? ' ✓' : ''}</span>)}</div><div className="character-grid">{draft?.market.map(id => <CharacterCard key={id} id={id} selected={pick === id} disabled={!mine || busy} onChoose={() => setPick(pick === id ? null : id)} onDetail={onDetail} />)}</div>{mine && <div className="sticky-action"><span>{pick ? `让 ${characterName(pick)} 加入队伍` : '点击一位运动员，读懂能力再选'}</span><Button disabled={busy || !pick} onClick={() => { if (pick) act({ type: 'draft', characterId: pick }); }}>确认选择{pick ? ` · ${characterName(pick)}` : ''}</Button></div>}</>;
}
function Selection({ room, busy, act, onDetail }: { room: RoomView; busy: boolean; act: (action: GameAction) => void; onDetail: (id: string) => void }) {
  const self = room.players.find(p => p.id === room.selfId);
  const count = room.players.length === 2 ? 2 : 1;
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [room.round]);
  const toggle = (id: string) => setPicked(previous => previous.includes(id) ? previous.filter(value => value !== id) : count === 1 ? [id] : previous.length < count ? [...previous, id] : previous);
  if (room.role === 'spectator' || !self) return <><div className="turn-notice"><span className="secret-icon">?</span><span>选手正在秘密选择上场角色<small>你正在观战，角色将在所有选手锁定后一起揭示。</small></span><Countdown deadline={room.deadline} /></div><div className="selection-progress">{room.players.map(player => <span key={player.id} className={player.selected ? 'locked' : ''}><i style={{ background: player.color }} />{player.name}<strong>{player.selected ? '已锁定 ✓' : '思考中…'}</strong></span>)}</div></>;
  return <><div className="turn-notice"><span className="secret-icon">?</span><span>{self.selected ? '你已锁定，等大家选好就揭示' : `秘密选择 ${count} 位未上场的运动员`}<small>其他玩家只能看到你是否选好，揭示前看不到角色。</small></span><Countdown deadline={room.deadline} /></div><div className="selection-progress">{room.players.map(player => <span key={player.id} className={player.selected ? 'locked' : ''}><i style={{ background: player.color }} />{player.name}<strong>{player.selected ? '已锁定 ✓' : '思考中…'}</strong></span>)}</div><div className="character-grid hand-selection">{self.hand?.map(id => <CharacterCard key={id} id={id} used={self.used.includes(id)} selected={self.selected ? self.selection?.includes(id) : picked.includes(id)} disabled={busy || self.selected} onChoose={() => toggle(id)} onDetail={onDetail} />)}</div>{!self.selected && <div className="sticky-action"><span>已选 {picked.length} / {count} 位 · 确认后统一揭示</span><Button disabled={busy || picked.length !== count} onClick={() => act({ type: 'select', characterIds: picked })}>锁定上场角色</Button></div>}</>;
}

function Race({ room, busy, leavingBusy, act, onDetail, presentation, lowQuality, setLowQuality, reduceMotion, setReduceMotion, muted, setMuted, animationSpeed, setAnimationSpeed, online, onRules, onEnd, onLeave, onInvite }: { room: RoomView; busy: boolean; leavingBusy: boolean; act: (action: GameAction) => void; onDetail: (id: string) => void; presentation: UsePresentationResult; lowQuality: boolean; setLowQuality: (value: boolean) => void; reduceMotion: boolean; setReduceMotion: (value: boolean) => void; muted: boolean; setMuted: (value: boolean) => void; animationSpeed: number; setAnimationSpeed: (value: number) => void; online: boolean; onRules: () => void; onEnd: () => void; onLeave: () => void; onInvite: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const spectator = room.role === 'spectator';
  const active = room.racers.find(racer => racer.id === room.currentRacerId);
  const player = room.players.find(p => p.id === active?.playerId);
  const mine = room.role !== 'spectator' && player?.id === room.selfId;
  const { beat, playing } = presentation;
  const showing = presentation.displayRoom ?? room;
  const playbackRacer = presentation.racers.find(r => r.id === beat?.source);
  const playbackLabel = beat?.kind === 'duel-dice' ? '双方决斗掷骰' : beat?.kind === 'dice' ? '正在掷骰' : beat?.kind === 'move' ? beat.motions.some(m => m.to < m.from) ? '后退移动' : beat.motions.length > 1 ? '同时移动' : '向前出发' : beat?.kind === 'swap' ? '交换位置' : beat?.kind === 'warp' ? '传送中' : beat?.kind === 'trip' ? '绊倒了！' : beat?.kind === 'score' ? '获得分数' : beat?.kind === 'finish' ? '冲过终点！' : '技能连锁';
  const sameStage = showing.phase === room.phase && showing.round === room.round;
  const pendingChoice = !playing && sameStage ? room.pending : undefined;
  const duelChoice = pendingChoice?.kind === 'duel-roll';
  const canRoll = !busy && !playing && sameStage && mine && !room.pending && !room.waitingFor && (!room.turnStage || room.turnStage === 'roll');
  const status = playing ? `${playbackRacer ? characterName(playbackRacer.characterId) + ' · ' : ''}${playbackLabel}` : room.pending ? '选择技能后继续' : room.waitingFor ? `等待 ${room.players.find(p => p.id === room.waitingFor)?.name ?? '其他玩家'} 响应` : room.turnStage === 'starting' ? '正在处理回合开始技能' : mine ? '轮到你了，掷骰出发' : `${player?.name ?? '选手'} 正在行动`;
  return <section className="immersive-race" data-testid="immersive-race">
    <Suspense fallback={<div className="scene-loading">立体赛场正在就位…</div>}><Board3D room={showing} racers={presentation.racers} beat={beat} queue={presentation.state?.queue} startedAt={presentation.startedAt} durationMs={presentation.durationMs} lowQuality={lowQuality} reducedMotion={reduceMotion} muted={muted} onDetail={onDetail} /></Suspense>
    <div className="race-hud-top">
      <div className="race-hud-buttons"><button className="race-menu-button" data-testid="presentation-settings" aria-label="比赛菜单" aria-expanded={settingsOpen} aria-controls="presentation-settings-panel" onClick={() => setSettingsOpen(true)}><span aria-hidden="true">☰</span> 菜单</button><button className="leave-room-button" disabled={leavingBusy} onClick={onLeave}>{spectator ? '退出观看' : '退出房间'}</button></div>
      <div className="race-match-label"><strong>{spectator && '观战 · '}第 {showing.round} / 4 场 <span>· {showing.track === 'mild' ? '轻松赛道' : '魔法赛道'}</span></strong><span className={`connection ${online ? 'is-online' : ''}`}><i />{online ? '已连接' : '正在重连'}</span></div>
    </div>
    {showing.phase === 'race' && <div className={`race-status-pill ${canRoll ? 'is-mine' : ''}`} role="status" data-testid="animation-phase"><i />{status}<Countdown deadline={room.deadline} />{playing && <button className="skip-animation" data-testid="skip-animation" onClick={presentation.skip} aria-label="跳过动画">跳过 »</button>}</div>}
    <div className="floating-racers" aria-label="选手与累计分数">{showing.racers.map(racer => { const owner = room.players.find(p => p.id === racer.playerId)!; const current = (playing ? beat?.source === racer.id : active?.id === racer.id); return <button className={`floating-racer ${current ? 'is-active' : ''} ${owner.id === room.selfId ? 'is-self' : ''}`} key={racer.id} style={{ '--racer-color': owner.color } as CSSProperties} aria-label={`${characterName(racer.characterId)}，${owner.seat + 1}号${owner.id === room.selfId ? '你' : owner.name}，累计${owner.score}分，${racer.position}格，查看技能`} onClick={() => onDetail(racer.characterId)}><span className="floating-avatar"><Avatar id={racer.characterId} />{owner.id === room.selfId && <i>你</i>}</span><span className="floating-racer-score"><b>{owner.seat + 1}号</b><span>{owner.score}<small>分</small></span></span></button>; })}</div>
    {!playing && showing.phase !== 'race' ? <div className="race-results-overlay"><Results room={showing} busy={busy || !sameStage} act={act} onDetail={onDetail} /></div> : pendingChoice ? <div className={`choice-panel floating-choice ${duelChoice ? 'duel-choice' : ''}`} role="region" aria-label="待处理技能" data-testid="skill-choice"><div><span className="burst">✦</span><h2>{pendingChoice.title}</h2><p>{duelChoice ? '双方各掷一次，全部完成后一起揭晓。' : pendingChoice.optional ? '选择发动方式，或放弃本次技能。' : '选择一个目标或选项，继续比赛。'}</p></div>{spectator ? <p className="spectator-wait">正在等待选手响应技能。</p> : <div className="choice-options">{pendingChoice.options.map(option => <Button key={option.id} className={duelChoice ? 'duel-roll-button' : ''} secondary={['skip', 'pass', 'decline'].includes(option.id)} disabled={busy || pendingChoice.playerId !== room.selfId} onClick={() => act({ type: 'choose', choiceId: pendingChoice.id, optionId: option.id })}>{duelChoice && <Icon kind="dice" size={28} />}{option.label}</Button>)}</div>}</div> : showing.phase === 'race' && <div className="floating-roll"><span className="roll-caption" data-testid={beat?.kind === 'dice' || beat?.kind === 'duel-dice' ? undefined : 'dice-value'}>{playing ? '正在演出 · 可跳过' : room.lastRoll ? `上次骰面 ${room.lastRoll.face} · 移动 ${room.lastRoll.distance} 格` : '准备好就出发'}</span>{spectator ? <span className="spectator-race-label">观战中 · 赛况自动同步</span> : <Button className="race-roll-button" data-testid="roll-button" disabled={!canRoll} onClick={() => act({ type: 'roll' })}><Icon kind="dice" size={27} />{playing ? '正在演出…' : busy ? '正在处理…' : canRoll ? '掷骰子' : room.waitingFor || room.pending ? '等待技能选择' : mine ? '正在准备…' : '等待其他玩家'}</Button>}</div>}
    {settingsOpen && <Modal title="比赛菜单" onClose={() => setSettingsOpen(false)}><div className="race-menu-content" id="presentation-settings-panel">
      <div className="presentation-settings"><label><input type="checkbox" checked={lowQuality} onChange={event => setLowQuality(event.target.checked)} />低画质</label><label><input type="checkbox" checked={muted} onChange={event => setMuted(event.target.checked)} />静音</label><label><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} />减少动效</label><label>动画速度<select aria-label="动画速度" value={animationSpeed} onChange={event => setAnimationSpeed(Number(event.target.value))}><option value={1}>1× · 完整演出</option><option value={2}>2× · 快速</option><option value={4}>4× · 极速</option></select></label></div>
      <p className="race-menu-note">技能提示至少停留 1.5 秒，便于看清发动原因；加速设置主要缩短移动与掷骰演出。</p>
      <div className="race-menu-links"><Button secondary onClick={() => { setSettingsOpen(false); onRules(); }}>帮助与规则</Button>{room.mode !== 'practice' && room.mode !== 'ai' && <Button secondary onClick={onInvite}>邀请朋友</Button>}<Button secondary disabled={leavingBusy} onClick={() => { setSettingsOpen(false); onLeave(); }}>{spectator ? '退出观看' : '退出房间'}</Button>{!spectator && room.hostId === room.selfId && <button className="end-room-button" disabled={busy} onClick={() => { setSettingsOpen(false); onEnd(); }}>结束房间</button>}</div>
      <details><summary>累计积分</summary><Scoreboard room={room} /></details><details><summary>赛场播报</summary><EventLog room={room} /></details><details><summary>运动员与位置</summary><div className="racer-strip">{showing.racers.map(racer => <RacerSummary key={racer.id} racer={racer} room={showing} onDetail={id => { setSettingsOpen(false); onDetail(id); }} />)}</div></details>{!spectator && <details><summary>我的队伍</summary><MyTeam room={room} onDetail={id => { setSettingsOpen(false); onDetail(id); }} /></details>}
      <p className="race-menu-note"><RoomLifetime expiresAt={room.expiresAt} /> · {room.spectators?.filter(spectator => spectator.connected).length ?? 0} 人观战</p><p className="race-menu-note">房间 {room.code} · {room.players.length >= 7 ? '7～8 人扩展规则' : room.players.length === 2 ? '两人双角色模式' : room.mode === 'practice' ? '单人练习规则' : '标准规则'}<br />拖动平移 · 滚轮或双指缩放 · {spectator ? '跟随选手' : '回到自己'}可恢复自动观看{room.hosting === 'browser' && <><br />请保持计算房主网页打开。对局进度自动保存在原浏览器中。</>}</p>
    </div></Modal>}
  </section>;
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
  return <section className="results-panel"><div className="results-title"><Icon kind="trophy" size={68} /><div><h2>{finished ? `${winners.map(p => p.name).join('、')}夺冠！` : `第 ${room.round} 场，收工！`}</h2><p>{finished ? '四场比赛，一场漂亮的胡闹。再来一局，重新选人！' : '收好奖分，下一场会更精彩。'}</p></div></div>{finished ? <div className="final-ranking">{sorted.map((player, index) => <div key={player.id} className={player.score === sorted[0]?.score ? 'winner' : ''}><span className="ranking-number">{player.score === sorted[0]?.score ? '★' : index + 1}</span><i style={{ background: player.color }} /><strong>{player.name}{player.id === room.selfId && <small>你</small>}</strong><span className="ranking-score">{player.score}<small>分</small></span></div>)}</div> : <div className="round-results">{result?.placements.map(place => <div className={`result-racer rank-${place.rank}`} key={place.racerId}><span className="rank-medal">{place.rank}</span><button onClick={() => onDetail(place.characterId)}><Avatar id={place.characterId} /></button><h3>{characterName(place.characterId)}</h3><p>{room.players.find(p => p.id === place.playerId)?.name}</p><strong>＋{place.points}<small>分</small></strong></div>)}</div>}<div className="results-actions">{room.role !== 'spectator' && room.selfId === room.hostId ? <Button disabled={busy} onClick={() => act({ type: finished ? 'rematch' : 'next' })}>{finished ? '原房间，再来一局' : '前往下一场'}<Icon kind="arrow" /></Button> : <p>等待房主{finished ? '开始新一局' : '进入下一场'}。{room.role !== 'spectator' && '你的位置会保留。'}</p>}</div></section>;
}
function Scoreboard({ room }: { room: RoomView }) { return <section className="scoreboard"><h2>积分榜 <Icon kind="trophy" size={21} /></h2><div>{[...room.players].sort((a, b) => b.score - a.score).map((player, index) => <div className={player.id === room.selfId ? 'score-self' : ''} key={player.id}><span className="score-rank">{index + 1}</span><i style={{ background: player.color }} /><strong>{player.name}{player.id === room.selfId && <small>你</small>}</strong>{!player.connected && <span className="offline-note">离线</span>}<b>{player.score}<small>分</small></b></div>)}</div></section>; }
function EventLog({ room }: { room: RoomView }) { return <section className="event-log"><h2>赛场播报 <span>最新在前</span></h2><ol aria-live="polite" aria-relevant="additions">{room.logs.slice(-18).reverse().map(event => <li key={event.id}><span>{event.id.toString().padStart(2, '0')}</span><p>{event.text}</p></li>)}{!room.logs.length && <li><p>发令枪还没响，大家蓄势待发。</p></li>}</ol></section>; }
function MyTeam({ room, onDetail }: { room: RoomView; onDetail: (id: string) => void }) {
  const self = room.players.find(p => p.id === room.selfId);
  if (room.role === 'spectator' || !self?.hand?.length) return null;
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
