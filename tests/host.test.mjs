import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { inspectFunnel, isOwnedProcess, normalizeProxy } from '../scripts/host.mjs';

const dns = 'race.example.ts.net';
const endpoint = `${dns}:443`;
function ownConfig() { return { TCP: { 443: { HTTPS: true } }, Web: { [endpoint]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:3000' } } } }, AllowFunnel: { [endpoint]: true } }; }

test('已有Serve并不等于公开Funnel；需要HTTPS代理与AllowFunnel共同确认', () => {
  const cfg = ownConfig();
  assert.equal(inspectFunnel(cfg, dns).public, true);
  cfg.AllowFunnel[endpoint] = false;
  assert.equal(inspectFunnel(cfg, dns).rootMatches, true);
  assert.equal(inspectFunnel(cfg, dns).public, false);
  delete cfg.TCP;
  cfg.AllowFunnel[endpoint] = true;
  assert.equal(inspectFunnel(cfg, dns).public, false);
});

test('拒绝覆盖443其他网站、其他路径、TCP转发或前台会话', () => {
  for (const modify of [
    cfg => { cfg.Web[endpoint].Handlers['/'].Proxy = 'http://127.0.0.1:9000'; },
    cfg => { cfg.Web[endpoint].Handlers['/private'] = { Path: 'C:\\private' }; },
    cfg => { cfg.TCP[443] = { TCPForward: '127.0.0.1:22' }; },
    cfg => { cfg.Foreground = { anotherSession: { TCP: { 443: { HTTPS: true } } } }; },
    cfg => { cfg.Web['other.example.ts.net:443'] = { Handlers: { '/': { Proxy: 'http://127.0.0.1:5000' } } }; },
  ]) { const cfg = ownConfig(); modify(cfg); assert.ok(inspectFunnel(cfg, dns).conflicts.length > 0); }
  assert.throws(() => inspectFunnel({ Web: 'unrecognized-format' }, dns));
});

test('仅将完整本机3000根代理当作本游戏，路径或凭据不能混淆校验', () => {
  for (const value of ['http://127.0.0.1:3000', 'http://localhost:3000/', 'localhost:3000', '3000']) assert.equal(normalizeProxy(value), 'http://127.0.0.1:3000');
  for (const value of ['http://127.0.0.1:30000', 'http://127.0.0.1:3000/private', 'https://127.0.0.1:3000', 'http://evil.example:3000', 'http://u:p@127.0.0.1:3000', 'http://127.0.0.1:3000/?private=1']) assert.equal(normalizeProxy(value), null);
  assert.equal(inspectFunnel({}, dns).conflicts.length, 0);
});

test('PID重用、不同Node路径、不同入口或附加参数均不能授权终止进程', () => {
  const entry = resolve('dist/server/server/index.js');
  const state = { pid: 90210, creationTime: '2026-10-21T00:00:00.0000000Z', entry, node: process.execPath };
  const info = { pid: state.pid, creationTime: state.creationTime, executable: state.node, args: [state.node, entry] };
  assert.equal(isOwnedProcess(state, info, entry), true);
  assert.equal(isOwnedProcess(state, { ...info, creationTime: '2026-10-21T01:00:00Z' }, entry), false);
  assert.equal(isOwnedProcess(state, { ...info, pid: 12 }, entry), false);
  assert.equal(isOwnedProcess(state, { ...info, args: [state.node, resolve('another-app.js')] }, entry), false);
  assert.equal(isOwnedProcess(state, { ...info, args: [state.node, entry, '--unrelated'] }, entry), false);
  assert.equal(isOwnedProcess(state, { ...info, executable: resolve('another-node.exe') }, entry), false);
  assert.equal(isOwnedProcess(state, null, entry), false);
  assert.equal(isOwnedProcess(state, { ...info, args: [state.node, null] }, entry), false);
});
