// Measures what the plugin costs the user's machine. Run before each release and put the numbers in the notes:
//   node scripts/measure.mjs [idleSeconds]
// It runs the real plugin against a fake Ulanzi host, a fake LibreHardwareMonitor on loopback and a program that
// prints what nvidia-smi prints, with real processor, memory, ping and (on Windows) disk counters. So it measures
// the plugin and its disk reader, and not Ulanzi Studio, a real LibreHardwareMonitor, nvidia-smi or a deck.
import { execFileSync, fork } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { pluginDir, root } from './lib/project.mjs';

const IDLE_SECONDS = Number(process.argv[2] ?? 60);
const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8'));
const metricsPreload = pathToFileURL(join(root, 'tests', 'support', 'metrics.mjs')).href;
const KEYS = ['cpu.usage', 'cpu.temperature', 'gpu.usage', 'gpu.temperature', 'gpu.vram.usage', 'ram.usage', 'network.ping', 'network.loss', 'disk.usage', 'disk.temperature'];

// The two temperatures only LibreHardwareMonitor gives, moving on every request, the worst case for redrawing.
let tick = 0;
const sensor = (hardware, name, value) => ({ Text: name, Value: `${value.toFixed(1)} °C`, RawValue: value, Type: 'Temperature', SensorId: `${hardware}/${name}` });
const lhm = createServer((request, response) => {
  tick += 1;
  const wave = (base, spread) => base + Math.sin(tick / 3) * spread;
  const tree = { Children: [
    { HardwareId: '/intelcpu/0', Text: 'CPU', Children: [sensor('/intelcpu/0', 'CPU Package', wave(62, 12))] },
    { HardwareId: '/nvme/0', Text: 'Disk', Children: [sensor('/nvme/0', 'Temperature', wave(45, 6))] },
  ] };
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(tree));
});
await new Promise((resolve) => lhm.listen(0, '127.0.0.1', resolve));

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
    LHM_JSON_URL: `http://127.0.0.1:${lhm.address().port}/data.json`,
    PING_TARGET: '127.0.0.1',
    // A program that prints what nvidia-smi prints, because a build machine has no NVIDIA card.
    NVIDIA_SMI: process.execPath,
    NVIDIA_SMI_ARGS: JSON.stringify([join(root, 'tests', 'support', 'fake-nvidia.mjs')]),
  },
});
const metrics = async () => {
  plugin.send('metrics');
  const [reply] = await once(plugin, 'message');
  return reply;
};

/** The disk reader is a separate PowerShell process: its memory and CPU belong to the plugin's cost. */
function helper() {
  if (process.platform !== 'win32') return { memory: 0, cpuMs: 0 };
  try {
    const script = `$c=Get-CimInstance Win32_Process -Filter "ParentProcessId=${plugin.pid}"; $m=0;$t=0; foreach($p in $c){$m+=$p.WorkingSetSize; $t+=(Get-Process -Id $p.ProcessId).TotalProcessorTime.TotalMilliseconds}; "$m $t"`;
    const [memory, cpuMs] = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim().split(' ').map(Number);
    return { memory, cpuMs };
  } catch {
    return { memory: 0, cpuMs: 0 };
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
// The first readings take a moment, and the processor and disk ones need two. Wait for the numbers, not for the first N/D.
await sleep(6000);
await settled();
const firstPaint = firstImageAt - startedAt;
const afterRender = await metrics();
const helperAfterRender = helper();
const imagesAtRender = images;
const bytesAtRender = bytes;

await sleep(IDLE_SECONDS * 1000);
const afterIdle = await metrics();
const helperAfterIdle = helper();
const imagesWhileIdle = images - imagesAtRender;
const imageBytes = (bytes - bytesAtRender) / Math.max(1, imagesWhileIdle);

// Taking every key off the deck must stop the providers and the readers.
send({ cmd: 'clear', param: KEYS.map((metric, i) => ({ uuid: `${manifest.UUID}.${metric.replaceAll('.', '')}`, key: `${i}_0`, actionid: `k${i}` })) });
await sleep(2500);
const afterClear = await metrics();
const helperAfterClear = helper();

plugin.kill();
for (const client of server.clients) client.terminate();
server.close();
lhm.close();

const cpuPercent = (from, to, ms) => (((to.cpuMs - from.cpuMs) / ms) * 100).toFixed(2);
const helperPercent = (from, to, ms) => (((to.cpuMs - from.cpuMs) / ms) * 100).toFixed(2);
const idleMs = IDLE_SECONDS * 1000;
console.log(`Node ${process.version} on ${process.platform}, ${KEYS.length} keys, fake host and fake LibreHardwareMonitor`);
console.log(`Memory with keys drawn      ${MB(afterRender.rss)} (heap ${MB(afterRender.heapUsed)}, WASM and buffers ${MB(afterRender.external)})`);
console.log(`Memory after ${IDLE_SECONDS} s idle       ${MB(afterIdle.rss)}`);
console.log(`Memory after keys left      ${MB(afterClear.rss)}`);
console.log(`CPU while readings move     ${cpuPercent(afterRender, afterIdle, idleMs)}% of one core, ${(imagesWhileIdle / IDLE_SECONDS).toFixed(1)} images a second in all`);
console.log(`First key image             ${firstPaint.toFixed(0)} ms after the keys were added`);
console.log(`Drawing in the first 6 s    ${(afterRender.cpuMs - atStart.cpuMs).toFixed(0)} ms of CPU, ${imagesAtRender} images`);
console.log(`Image sent per key          ${(imageBytes / 1024).toFixed(1)} KB`);
if (process.platform === 'win32') {
  console.log(`Disk reader memory       ${MB(helperAfterIdle.memory)} in a separate PowerShell process`);
  console.log(`Disk reader CPU          ${helperPercent(helperAfterRender, helperAfterIdle, idleMs)}% of one core`);
  console.log(`After keys left             reader ${helperAfterClear.memory ? MB(helperAfterClear.memory) : 'closed'}`);
}
