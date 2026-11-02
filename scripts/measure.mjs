// Measures what the plugin costs the user's machine. Run before each release and put the numbers in the notes:
//   node scripts/measure.mjs [idleSeconds]
// It runs the real plugin against a fake Ulanzi host and a fake LibreHardwareMonitor on loopback whose numbers move
// on every request, the worst case for redrawing, with the real ping. So it measures the plugin, and not Ulanzi
// Studio, a real LibreHardwareMonitor or a deck.
import { fork } from 'node:child_process';
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
const KEYS = ['cpu.usage', 'cpu.temperature', 'gpu.usage', 'gpu.temperature', 'gpu.vram.usage', 'ram.usage', 'network.ping', 'network.loss', 'disk.usage'];

let tick = 0;
const sensor = (hardware, name, type, value, unit) => ({ Text: name, Value: `${value.toFixed(1)} ${unit}`, RawValue: value, Type: type, SensorId: `${hardware}/${name}` });
const lhm = createServer((request, response) => {
  tick += 1;
  const wave = (base, spread) => Math.min(100, Math.max(0, base + Math.sin(tick / 3) * spread));
  const tree = { Children: [
    { HardwareId: '/intelcpu/0', Text: 'CPU', Children: [
      sensor('/intelcpu/0', 'CPU Total', 'Load', wave(40, 25), '%'),
      sensor('/intelcpu/0', 'CPU Package', 'Temperature', wave(62, 12), '°C'),
    ] },
    { HardwareId: '/gpu-nvidia/0', Text: 'GPU', Children: [
      sensor('/gpu-nvidia/0', 'GPU Core', 'Load', wave(55, 30), '%'),
      sensor('/gpu-nvidia/0', 'GPU Core', 'Temperature', wave(60, 10), '°C'),
      sensor('/gpu-nvidia/0', 'GPU Memory', 'Load', wave(50, 20), '%'),
    ] },
    { HardwareId: '/ram', Text: 'Memory', Children: [sensor('/ram', 'Memory', 'Load', wave(55, 10), '%')] },
    { HardwareId: '/nvme/0', Text: 'Disk', Children: [sensor('/nvme/0', 'Total Activity', 'Load', wave(20, 15), '%')] },
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
  },
});
const metrics = async () => {
  plugin.send('metrics');
  const [reply] = await once(plugin, 'message');
  return reply;
};

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
const imagesAtRender = images;
const bytesAtRender = bytes;

await sleep(IDLE_SECONDS * 1000);
const afterIdle = await metrics();
const imagesWhileIdle = images - imagesAtRender;
const imageBytes = (bytes - bytesAtRender) / Math.max(1, imagesWhileIdle);

// Taking every key off the deck must stop the providers and the readers.
send({ cmd: 'clear', param: KEYS.map((metric, i) => ({ uuid: `${manifest.UUID}.${metric.replaceAll('.', '')}`, key: `${i}_0`, actionid: `k${i}` })) });
await sleep(2500);
const afterClear = await metrics();

plugin.kill();
for (const client of server.clients) client.terminate();
server.close();
lhm.close();

const cpuPercent = (from, to, ms) => (((to.cpuMs - from.cpuMs) / ms) * 100).toFixed(2);
const idleMs = IDLE_SECONDS * 1000;
console.log(`Node ${process.version} on ${process.platform}, ${KEYS.length} keys, fake host and fake LibreHardwareMonitor`);
console.log(`Memory with keys drawn      ${MB(afterRender.rss)} (heap ${MB(afterRender.heapUsed)}, WASM and buffers ${MB(afterRender.external)})`);
console.log(`Memory after ${IDLE_SECONDS} s idle       ${MB(afterIdle.rss)}`);
console.log(`Memory after keys left      ${MB(afterClear.rss)}`);
console.log(`CPU while readings move     ${cpuPercent(afterRender, afterIdle, idleMs)}% of one core, ${(imagesWhileIdle / IDLE_SECONDS).toFixed(1)} images a second in all`);
console.log(`First key image             ${firstPaint.toFixed(0)} ms after the keys were added`);
console.log(`Drawing in the first 6 s    ${(afterRender.cpuMs - atStart.cpuMs).toFixed(0)} ms of CPU, ${imagesAtRender} images`);
console.log(`Image sent per key          ${(imageBytes / 1024).toFixed(1)} KB`);
