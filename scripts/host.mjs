import { spawn, execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve, normalize, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'dist', 'server', 'server', 'index.js');
const LOCAL = join(ROOT, '.local');
const STATE = join(LOCAL, 'host.json');
const TARGET = 'http://127.0.0.1:3000';
const FUNNEL_FLAGS = ['--bg', '--https=443', '--set-path=/'];
const pause = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
const run = (file, args, timeout = 8000) => execute(file, args, { windowsHide: true, timeout, maxBuffer: 1024 * 1024, encoding: 'utf8' });
const canonical = path => process.platform === 'win32' ? normalize(path).toLowerCase() : normalize(path);

export function normalizeProxy(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(/^\d+$/.test(value) ? `http://127.0.0.1:${value}` : value.includes('://') ? value : `http://${value}`);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '3000' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
    return TARGET;
  } catch { return null; }
}

/** Read-only classification based on official ipn.ServeConfig. Never rewrite unknown config. */
export function inspectFunnel(config, dnsName) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('无法识别 Funnel 配置，未作任何更改。');
  for (const key of ['TCP', 'Web', 'Foreground', 'AllowFunnel']) if (config[key] != null && (typeof config[key] !== 'object' || Array.isArray(config[key]))) throw Error('Funnel配置结构无法识别，未作任何更改。');
  const endpoint = `${dnsName}:443`;
  const conflicts = [];
  const foreground = Object.values(config.Foreground ?? {});
  for (const cfg of foreground) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw Error('前台Funnel配置无法识别，未作任何更改。');
    if (cfg?.TCP?.['443'] || Object.keys(cfg?.Web ?? {}).some(key => key.endsWith(':443'))) conflicts.push('443已有前台Serve/Funnel会话');
  }
  const tcp = config.TCP?.['443'];
  if (tcp && (tcp.HTTPS !== true || tcp.TCPForward || tcp.TerminateTLS)) conflicts.push('443已有其他TCP转发');
  const web = config.Web ?? {};
  const entries = Object.entries(web).filter(([key]) => key.endsWith(':443'));
  for (const [key, value] of entries) {
    if (key !== endpoint) { conflicts.push('443已有其他主机名的配置'); continue; }
    const handlers = value?.Handlers;
    if (!handlers || typeof handlers !== 'object') { conflicts.push('443的HTTP配置不可识别'); continue; }
    for (const [path, handler] of Object.entries(handlers)) {
      if (path !== '/') conflicts.push(`443已有其他路径 ${path}`);
      else if (!handler || normalizeProxy(handler.Proxy) !== TARGET || handler.Path || handler.Text || handler.Redirect) conflicts.push('443根路径已指向其他服务');
    }
  }
  const handler = web[endpoint]?.Handlers?.['/'];
  const rootMatches = !!handler && normalizeProxy(handler.Proxy) === TARGET && !handler.Path && !handler.Text && !handler.Redirect;
  if (tcp && !rootMatches && !conflicts.length) conflicts.push('443已被占用但未识别到本游戏代理');
  return { rootMatches, public: rootMatches && tcp?.HTTPS === true && config.AllowFunnel?.[endpoint] === true, conflicts };
}

function readState() {
  if (!existsSync(STATE)) return null;
  let state;
  try { state = JSON.parse(readFileSync(STATE, 'utf8')); } catch { throw Error('.local/host.json无法读取。请保留该文件并检查，脚本不会猜测PID。'); }
  if (state.version !== 1 || canonical(state.root ?? '') !== canonical(ROOT) || canonical(state.entry ?? '') !== canonical(ENTRY)) throw Error('启动记录不属于当前项目目录，未终止任何进程。');
  return state;
}
function saveState(state) {
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(`${STATE}.tmp`, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(`${STATE}.tmp`, STATE);
}
function argumentsFromWindows(commandLine) {
  return commandLine?.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part) ?? [];
}
export function isOwnedProcess(state, info, entry = ENTRY) {
  if (!state || !info || !Number.isSafeInteger(state.pid) || state.pid < 1 || info.pid !== state.pid || !state.creationTime || state.creationTime !== info.creationTime) return false;
  const args = info.args ?? argumentsFromWindows(info.commandLine);
  return args.length === 2 && args.every(arg => typeof arg === 'string') && canonical(args[1]) === canonical(entry) && canonical(info.executable ?? args[0]) === canonical(state.node ?? '') && canonical(state.entry ?? '') === canonical(entry);
}
async function processInfo(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  if (process.platform !== 'win32') return null; // Windows launcher refuses unverifiable ownership elsewhere.
  const script = `$taskProcess=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction Stop; if($taskProcess){[PSCustomObject]@{pid=[int]$taskProcess.ProcessId;executable=$taskProcess.ExecutablePath;commandLine=$taskProcess.CommandLine;creationTime=$taskProcess.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress}`;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  return stdout.trim() ? JSON.parse(stdout) : null;
}
async function stopOwnedProcess(state) {
  const info = await processInfo(state?.pid);
  if (!info) return false;
  if (!isOwnedProcess(state, info)) throw Error('保存的PID已被其他进程使用，或启动参数不再匹配。未终止该进程。');
  process.kill(state.pid, 'SIGTERM');
  for (let i = 0; i < 20; i++) { await pause(150); try { process.kill(state.pid, 0); } catch { return true; } }
  throw Error('本项目进程尚未退出，请检查任务管理器；未终止其他进程。');
}

async function findTailscale() {
  const candidates = [process.env.TAILSCALE_EXE, process.env.ProgramFiles && join(process.env.ProgramFiles, 'Tailscale', 'tailscale.exe'), process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Tailscale', 'tailscale.exe')].filter(Boolean);
  for (const path of candidates) if (existsSync(path)) return path;
  try { const { stdout } = await run(process.platform === 'win32' ? 'where.exe' : 'which', ['tailscale']); return stdout.split(/\r?\n/).find(path => path.trim() && existsSync(path.trim()))?.trim() ?? null; } catch { return null; }
}
async function tailscaleStatus(executable) {
  if (!executable) return { installed: false, authenticated: false, message: '未安装Tailscale。请先按 docs/local-host.md 完成首次安装和登录。' };
  try {
    // `status --json` can return valid NeedsLogin JSON with a nonzero exit code.
    let output;
    try { output = (await run(executable, ['status', '--json'])).stdout; }
    catch (error) { if (error.stdout?.trim()) output = error.stdout; else throw error; }
    const value = JSON.parse(output); const dnsName = String(value.Self?.DNSName ?? '').replace(/\.$/, '').toLowerCase();
    const authenticated = value.BackendState === 'Running' && /^[a-z0-9][a-z0-9.-]*\.ts\.net$/.test(dnsName) && value.Self?.Expired !== true;
    return { installed: true, executable, authenticated, backendState: value.BackendState, dnsName: authenticated ? dnsName : null, message: authenticated ? 'Tailscale已登录并运行。' : '请打开Tailscale桌面应用，完成登录并连接后，再启动游戏。' };
  } catch { return { installed: true, executable, authenticated: false, message: 'Tailscale服务尚未运行或无法读取状态。请打开Tailscale并检查连接。' }; }
}
async function funnelConfig(executable) {
  const { stdout } = await run(executable, ['funnel', 'status', '--json']);
  return JSON.parse(stdout.trim() || '{}');
}
async function health() {
  try { const response = await fetch(`${TARGET}/api/health`, { signal: AbortSignal.timeout(1200), cache: 'no-store' }); const json = await response.json(); return response.ok && json.ok === true && json.storage === 'sqlite'; } catch { return false; }
}
async function portAvailable() {
  return new Promise(resolvePort => { const server = createServer(); server.once('error', () => resolvePort(false)); server.listen(3000, '127.0.0.1', () => server.close(() => resolvePort(true))); });
}
async function check() {
  const status = await tailscaleStatus(await findTailscale());
  let funnel = null;
  if (status.authenticated) { try { funnel = inspectFunnel(await funnelConfig(status.executable), status.dnsName); } catch { funnel = { message: 'Funnel配置读取失败；检查未修改配置。' }; } }
  console.log(JSON.stringify({ mode: 'check-only', nodeVersion: process.version, buildPresent: existsSync(ENTRY) && existsSync(join(ROOT, 'dist', 'client', 'index.html')), tailscale: status, funnel, localGameHealthy: await health() }, null, 2));
  console.log(status.message);
}
function assertVersion() { if (Number(process.versions.node.split('.')[0]) < 24) throw Error('需要Node.js 24或更新版本；请安装或使用Codex附带运行时。'); }

async function start() {
  assertVersion();
  if (process.platform !== 'win32') throw Error('此启动器按Windows进程校验实现。其他系统请按README手动启动服务。');
  if (!existsSync(ENTRY) || !existsSync(join(ROOT, 'dist', 'client', 'index.html'))) throw Error('尚未构建生产版本。请先运行 pnpm install --frozen-lockfile 和 pnpm build。');
  const status = await tailscaleStatus(await findTailscale());
  if (!status.authenticated) throw Error(status.message);
  const origin = `https://${status.dnsName}`;
  let config = inspectFunnel(await funnelConfig(status.executable), status.dnsName);
  if (config.conflicts.length) throw Error(`${config.conflicts.join('；')}。为保留现有服务，启动器没有覆盖配置。`);
  let state = readState();
  const existing = state ? await processInfo(state.pid) : null;
  if (existing && !isOwnedProcess(state, existing)) throw Error('启动记录中的PID不属于本项目，未启动第二个服务，也未终止该进程。');
  if (existing && state.origin !== origin) throw Error('设备域名已变化，请先运行停止游戏，再重新启动以设置正确来源。');
  if (!existing) {
    if (!await portAvailable()) throw Error('本机3000端口已有其他进程。请先关闭冲突的服务；启动器不会终止未知进程。');
    mkdirSync(LOCAL, { recursive: true });
    const logPath = join(LOCAL, 'game-server.log'); const log = openSync(logPath, 'a');
    let child;
    try { child = spawn(process.execPath, [ENTRY], { cwd: ROOT, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3000', DATA_DIR: join(ROOT, 'data'), PUBLIC_ORIGIN: origin, TRUST_PROXY: '1', ACTION_TIMEOUT_SECONDS: process.env.ACTION_TIMEOUT_SECONDS ?? '120' } }); } finally { closeSync(log); }
    let spawnError; child.once('error', error => { spawnError = error; });
    for (let i = 0; i < 30 && !spawnError && child.exitCode === null; i++) { if (await health()) break; await pause(200); }
    if (spawnError || !await health()) { try { child.kill(); } catch {} throw Error(`游戏服务启动失败，请查看 ${logPath}`); }
    const info = await processInfo(child.pid);
    if (!info?.creationTime) { child.kill(); throw Error('无法核验新进程的创建时间，已停止本次新建服务。'); }
    state = { version: 1, root: ROOT, entry: ENTRY, node: process.execPath, pid: child.pid, creationTime: info.creationTime, startedAt: new Date().toISOString(), origin, target: TARGET, funnelManaged: false, logPath };
    if (!isOwnedProcess(state, info)) { child.kill(); throw Error('新进程路径校验失败，已停止本次新建服务。'); }
    saveState(state); child.unref();
  } else if (!await health()) throw Error('本项目进程仍在但健康检查失败。请运行停止游戏后再启动，并查看.local/game-server.log。');
  if (!config.public) {
    state.funnelAttempted = true; saveState(state);
    console.log('本机游戏已启动，正在启用当前设备的Funnel HTTPS入口。首次使用可能需要你在Tailscale网页批准。');
    try {
      const result = await run(status.executable, ['funnel', ...FUNNEL_FLAGS, TARGET], 15000);
      if (result.stdout.trim()) console.log(result.stdout.trim()); if (result.stderr.trim()) console.error(result.stderr.trim());
    } catch (error) {
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim();
      if (output) console.log(output);
      console.log('Funnel尚未确认启用。本机游戏已保留运行；请完成上方官方网页授权，再次双击启动游戏。不会自动批准、改账号或创建付费资源。');
      process.exitCode = 2; return;
    }
  }
  config = inspectFunnel(await funnelConfig(status.executable), status.dnsName);
  if (!config.public || config.conflicts.length) throw Error('Funnel尚未显示本游戏的精确代理，未声称网站已经上线。请检查Tailscale授权并重试。');
  state.funnelManaged = true; state.readyAt = new Date().toISOString(); saveState(state);
  console.log(`\n游戏已启动：${origin}\n把这一个网址发给朋友，建房后分享房间号即可。\nSQLite保存在 ${join(ROOT, 'data')}\n结束时双击“停止游戏.cmd”。新DNS/证书可能需要几分钟生效，请再用手机网络打开验证。`);
}

async function stop() {
  const state = readState();
  if (!state) { console.log('没有本启动器的运行记录，未终止任何进程或更改Funnel。'); return; }
  let warning = false;
  if (state.funnelManaged || state.funnelAttempted) {
    const status = await tailscaleStatus(await findTailscale());
    if (status.authenticated && `https://${status.dnsName}` === state.origin) {
      try {
        const config = inspectFunnel(await funnelConfig(status.executable), status.dnsName);
        if (config.rootMatches && !config.conflicts.length) {
          await run(status.executable, ['funnel', ...FUNNEL_FLAGS, TARGET, 'off'], 12000);
          const after = inspectFunnel(await funnelConfig(status.executable), status.dnsName);
          if (after.rootMatches && after.public) throw Error('Funnel关闭尚未确认');
          state.funnelManaged = false; state.funnelAttempted = false; saveState(state);
        } else if (config.rootMatches || config.public) { warning = true; console.error('Funnel配置已有其他条目，未修改。请按docs/local-host.md检查，只移除本游戏根路径。'); }
        else { state.funnelManaged = false; state.funnelAttempted = false; saveState(state); }
      } catch { warning = true; console.error('无法确认关闭Funnel；没有使用reset。请在Tailscale中检查本游戏代理。'); }
    } else { warning = true; console.error('Tailscale未连接或设备域名已变化，未改当前Funnel配置。请连接后再次运行停止游戏。'); }
  }
  const stopped = await stopOwnedProcess(state);
  if (!warning && !state.funnelManaged) unlinkSync(STATE);
  console.log(stopped ? '本项目游戏进程已停止。已确认对局仍保存在data目录。' : '记录中的本项目进程已经退出，未终止其他进程。');
  if (warning) process.exitCode = 2;
}

export async function main(args = process.argv.slice(2)) {
  if (args.some(arg => !['--check', '--start', '--stop'].includes(arg)) || args.length > 1) throw Error('用法：node scripts/host.mjs [--check|--start|--stop]');
  if (args[0] === '--check') return check();
  if (args[0] === '--stop') return stop();
  return start();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
