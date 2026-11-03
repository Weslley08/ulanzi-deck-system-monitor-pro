// Opens the real settings panel in a real browser, against a fake Ulanzi host, and reads what ends up on the page.
// This is the test that would have caught a panel that never showed: nothing else here loads the page.
// The browser is driven through its debugging port and the page is read once the host has answered, because
// asking a headless browser to dump the page after a fixed virtual time did not wait for a WebSocket.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { PLUGIN_UUID } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/ulanzi.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(root, 'com.ulanzi.systemmonitorpro.ulanziPlugin', 'property-inspector', 'metric', 'inspector.html');
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const browser = BROWSERS.find((path) => existsSync(path));
// The plugin is Windows only, and a browser on another system leaves its profile busy for a while.
const skip = process.platform !== 'win32' ? 'the plugin is Windows only' : !browser && 'no browser here';

async function until(read, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

/** Starts a browser with a profile of its own, because one that is already open would take the page and leave. */
async function startBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'monitor-panel-'));
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  const port = await until(() => {
    try {
      return readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
    } catch {
      return null;
    }
  }, 15_000, 'the browser to start');
  const stop = () => {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch { /* it already left */ }
    // Only housekeeping: a profile that is still busy must not fail a test that already got its answer.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch { /* the system's temporary folder cleans it up */ }
  };
  return { port, stop };
}

async function pageSocket(port) {
  const list = await until(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find((target) => target.type === 'page');
  }, 10_000, 'a page to talk to');
  const socket = new WebSocket(list.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let id = 0;
  const waiting = new Map();
  socket.on('message', (raw) => {
    const message = JSON.parse(raw);
    waiting.get(message.id)?.(message);
  });
  const call = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    waiting.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { call, close: () => socket.close() };
}

/** Plays the host for one panel, answering "hello" the way the plugin does, and returns the page after it ran. */
async function openPanel(action, payload, { param = {} } = {}) {
  const uuid = `${PLUGIN_UUID}.${action}`;
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  const heard = [];
  let answered = false;
  server.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw);
      heard.push(message.cmd);
      if (message.cmd === 'connected') socket.send(JSON.stringify({ cmd: 'add', uuid, key: '0_0', actionid: 'k0', param }));
      if (message.cmd === 'sendToPlugin' && message.payload?.type === 'hello') {
        socket.send(JSON.stringify({ cmd: 'sendToPropertyInspector', uuid, key: '0_0', actionid: 'k0', payload: { type: 'status', version: '0.1.0', ...payload } }));
        answered = true;
      }
    });
  });
  const started = await startBrowser();
  try {
    const page = await pageSocket(started.port);
    const url = `${pathToFileURL(PAGE).href}?address=127.0.0.1&port=${server.address().port}&language=en&uuid=${uuid}&key=0_0&actionid=k0`;
    await page.call('Page.navigate', { url });
    await until(() => answered, 30_000, 'the panel to ask the plugin for its status');
    const read = async (expression) => (await page.call('Runtime.evaluate', { expression, returnByValue: true })).result.result.value;
    // The panel writes its version last when it acts on the answer, so that is the sign it is done. A fixed wait
    // was not enough on a slow CI machine, where the page had not yet built its lists when it was read.
    await until(async () => (await read("document.querySelector('#version').textContent")) !== '', 30_000, 'the panel to act on the answer');
    const dom = await read('document.documentElement.outerHTML');
    const chosen = JSON.parse(await read("JSON.stringify({ drive: document.querySelector('#drive').value, gpu: document.querySelector('#gpu').value, accent: document.querySelector('#accent').value, graph: document.querySelector('#graph').checked })"));
    page.close();
    return { dom, heard, chosen };
  } finally {
    server.close();
    started.stop();
  }
}

/** The opening tag of the element with this id, or fails the test when the page has none. */
function tagOf(dom, id) {
  const found = new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`).exec(dom);
  assert.ok(found, `no element ${id} on the page`);
  return found[0];
}

const hidden = (dom, id) => /\bclass="[^"]*\bhidden\b/.test(tagOf(dom, id));
const wrapperHidden = (dom) => /<div class="uspi-wrapper[^"]*\bhidden\b/.test(dom);
const optionsOf = (dom, id) => [...new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(dom)[1].matchAll(/<option[^>]*value="([^"]*)"/g)].map(([, value]) => value);

test('the panel shows itself, and a drive key shows the drive choice with the drives the plugin found', { skip }, async () => {
  const { dom, heard } = await openPanel('diskusage', { group: 'disk', source: 'node', state: 'ok', drives: ['C:', 'D:'] });
  assert.ok(heard.includes('sendToPlugin'), 'the panel asked the plugin for its status');
  assert.equal(wrapperHidden(dom), false, 'the whole panel is hidden');
  assert.equal(hidden(dom, 'driveRow'), false, 'the drive choice is hidden');
  assert.equal(hidden(dom, 'gpuRow'), true, 'a drive key has no graphics card choice');
  assert.deepEqual(optionsOf(dom, 'drive'), ['auto', 'C:', 'D:']);
  assert.match(dom, /class="tip success"/, 'the status says it is reading');
});

test('a graphics card key shows the card choice with every card, and the one already saved is kept', { skip }, async () => {
  const { dom } = await openPanel('gpuusage', { group: 'gpu', source: 'nvidia', state: 'ok', gpus: ['NVIDIA GeForce RTX 3080', 'Intel(R) Arc(TM) Graphics'] }, { param: { gpu: 'AMD Radeon RX 7800 XT' } });
  assert.equal(wrapperHidden(dom), false, 'the whole panel is hidden');
  assert.equal(hidden(dom, 'gpuRow'), false);
  assert.equal(hidden(dom, 'driveRow'), true);
  assert.deepEqual(optionsOf(dom, 'gpu'), ['auto', 'NVIDIA GeForce RTX 3080', 'Intel(R) Arc(TM) Graphics', 'AMD Radeon RX 7800 XT']);
});

test('a key that reads neither a card nor a drive shows neither choice, and still shows its status', { skip }, async () => {
  const { dom } = await openPanel('cpuusage', { group: 'cpu', source: 'node', state: 'starting' });
  assert.equal(hidden(dom, 'gpuRow'), true);
  assert.equal(hidden(dom, 'driveRow'), true);
  assert.equal(wrapperHidden(dom), false, 'the whole panel is hidden');
  assert.match(dom, /Waiting for the first reading/);
});

test('what was saved for the key is what the panel shows as chosen', { skip }, async () => {
  const { chosen } = await openPanel('diskusage', { group: 'disk', source: 'node', state: 'ok', drives: ['C:', 'D:'] }, { param: { drive: 'D:', accent: 'pink', graph: false } });
  assert.deepEqual(chosen, { drive: 'D:', gpu: 'auto', accent: 'pink', graph: false });
  const fresh = await openPanel('diskusage', { group: 'disk', source: 'node', state: 'ok', drives: ['C:'] });
  assert.deepEqual(fresh.chosen, { drive: 'auto', gpu: 'auto', accent: 'auto', graph: true }, 'a key never saved starts on the automatic choices');
});
