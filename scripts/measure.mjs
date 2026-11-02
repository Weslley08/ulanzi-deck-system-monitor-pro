// Measures what the plugin costs the user's machine. Run before each release and put the numbers in the notes:
//   node scripts/measure.mjs [idleSeconds]
// It runs the real plugin against a fake Ulanzi host and a program that prints what nvidia-smi prints, with the real
// processor, memory, drive, thermal zone and ping readings. So it measures the plugin and its PowerShell reader, and
// not Ulanzi Studio, a real NVIDIA card, LibreHardwareMonitor (which is never asked here) or a deck.
import { execFileSync, fork } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { pluginDir, root } from './lib/project.mjs';

const IDLE_SECONDS = Number(process.argv[2] ?? 60);
const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8'));
const metricsPreload = pathToFileURL(join(root, 'tests', 'support', 'metrics.mjs')).href;
const KEYS = ['cpu.usage', 'cpu.temperature', 'gpu.usage', 'gpu.temperature', 'gpu.vram.usage', 'ram.usage', 'network.ping', 'network.loss', 'disk.usage'];

const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(server, 'listening');
let socket;
let images = 0;
let bytes = 0;
let firstImageAt;
let connected;
const ready = new Promise((resolve) => { connected = resolve; });
server.on('connection', (client) => {
  socket = client;
  client.on('message', (raw) => {
    const message = JSON.parse(raw);
    const data = message.cmd === 'state' ? message.param?.statelist?.[0]?.data : null;
    if (data) {
      firstImageAt ??= performance.now();
      images += 1;
      bytes += data.length;
    }
  });
  connected();
});
const send = (message) => socket.send(JSON.stringify(message));

const plugin = fork(join(pluginDir, 'plugin', 'app.js'), ['127.0.0.1', String(server.address().port), 'en'], {
  execArgv: ['--import', metricsPreload],
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  env: {
    ...process.env,
    LHM_JSON_URL: '',
    PING_TARGET: '127.0.0.1',
    // A program that prints what nvidia-smi prints, because a build machine has no NVIDIA card.
    NVIDIA_SMI: process.execPath,
    NVIDIA_SMI_ARGS: JSON.stringify([join(root, 'tests', 'support', 'fake-nvidia.mjs')]),
    FAKE_NVIDIA_MODE: 'two',
  },
});
const metrics = async () => {
  plugin.send('metrics');
  const [reply] = await once(plugin, 'message');
  return reply;
};

/** The thermal reader is a separate PowerShell process: its memory and CPU belong to the plugin's cost. */
function children() {
  if (process.platform !== 'win32') return { memory: 0, cpuMs: 0, count: 0 };
  try {
    const script = `$c=@(Get-CimInstance Win32_Process -Filter "ParentProcessId=${plugin.pid}" | Where-Object { $_.Name -match 'powershell' }); $m=0;$t=0; foreach($p in $c){$m+=$p.WorkingSetSize; $t+=(Get-Process -Id $p.ProcessId).TotalProcessorTime.TotalMilliseconds}; "$m $t $($c.Count)"`;
    const [memory, cpuMs, count] = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim().split(' ').map(Number);
    return { memory, cpuMs, count };
  } catch {
    return { memory: 0, cpuMs: 0, count: 0 };
  }
}

async function settled(ms = 30_000) {
  const end = performance.now() + ms;
  let seen = images;
  let lastChange = performance.now();
  while (performance.now() - lastChange < 800) {
    if (performance.now() > end) throw new Error('the images never settled');
    if (images !== seen) {
      seen = images;
      lastChange = performance.now();
    }
    await sleep(10);
  }
  return lastChange;
}

const MB = (value) => `${(value / 1024 / 1024).toFixed(1)} MB`;
await ready;
await sleep(300);
const atStart = await metrics();

const startedAt = performance.now();
for (const [i, metric] of KEYS.entries()) {
  send({ cmd: 'add', uuid: `${manifest.UUID}.${metric.replaceAll('.', '')}`, key: `${i}_0`, actionid: `k${i}`, param: {} });
}
// The first readings take a moment: the processor needs two, and the thermal reader waits for PowerShell to start.
await sleep(8000);
await settled();
const firstPaint = firstImageAt - startedAt;
const afterRender = await metrics();
const reader = children();
const imagesAtRender = images;
const bytesAtRender = bytes;

await sleep(IDLE_SECONDS * 1000);
const afterIdle = await metrics();
const readerAfterIdle = children();
const imagesWhileIdle = images - imagesAtRender;
const imageBytes = (bytes - bytesAtRender) / Math.max(1, imagesWhileIdle);

// Taking every key off the deck must stop the providers and the readers.
send({ cmd: 'clear', param: KEYS.map((metric, i) => ({ uuid: `${manifest.UUID}.${metric.replaceAll('.', '')}`, key: `${i}_0`, actionid: `k${i}` })) });
await sleep(2500);
const afterClear = await metrics();
const readerAfterClear = children();

plugin.kill();
for (const client of server.clients) client.terminate();
server.close();

const cpuPercent = (from, to, ms) => (((to.cpuMs - from.cpuMs) / ms) * 100).toFixed(2);
const idleMs = IDLE_SECONDS * 1000;
console.log(`Node ${process.version} on ${process.platform}, ${KEYS.length} keys, fake host and a stand-in for nvidia-smi`);
console.log(`Memory with keys drawn      ${MB(afterRender.rss)} (heap ${MB(afterRender.heapUsed)}, WASM and buffers ${MB(afterRender.external)})`);
console.log(`Memory after ${IDLE_SECONDS} s idle       ${MB(afterIdle.rss)}`);
console.log(`Memory after keys left      ${MB(afterClear.rss)}`);
console.log(`CPU while readings move     ${cpuPercent(afterRender, afterIdle, idleMs)}% of one core, ${(imagesWhileIdle / IDLE_SECONDS).toFixed(1)} images a second in all`);
console.log(`First key image             ${firstPaint.toFixed(0)} ms after the keys were added`);
console.log(`Drawing in the first 8 s    ${(afterRender.cpuMs - atStart.cpuMs).toFixed(0)} ms of CPU, ${imagesAtRender} images`);
console.log(`Image sent per key          ${(imageBytes / 1024).toFixed(1)} KB`);
if (process.platform === 'win32') {
  console.log(`Thermal reader memory       ${MB(readerAfterIdle.memory || reader.memory)} in a separate PowerShell process`);
  console.log(`Thermal reader CPU          ${(((readerAfterIdle.cpuMs - reader.cpuMs) / idleMs) * 100).toFixed(2)}% of one core`);
  console.log(`After keys left             ${readerAfterClear.count ? `${readerAfterClear.count} PowerShell still open` : 'reader closed'}`);
}
