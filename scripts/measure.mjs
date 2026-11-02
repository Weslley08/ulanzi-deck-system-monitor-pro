// Measures what the plugin costs the user's machine. Run before each release and put the numbers
// in the release notes: node scripts/measure.mjs [keys] [idleSeconds]
// This runs against a fake host, so it measures the plugin and not Ulanzi Studio.
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { pluginDir, root } from './lib/project.mjs';

const KEYS = Number(process.argv[2] ?? 6);
const IDLE_SECONDS = Number(process.argv[3] ?? 60);
const GLOW_SECONDS = Math.min(IDLE_SECONDS, 20);
const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8'));
const THEMES = ['sky', 'minimal', 'thermal', 'lcd', 'neon', 'almanac'];
const preload = (file) => pathToFileURL(join(root, 'test', 'support', file)).href;
const inRepo = (path) => import(pathToFileURL(join(root, path)).href);
const { capEntry, capFeed, iso, square } = await inRepo('test/support/cap-builder.mjs');
const { CapFeedReader } = await inRepo('com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/cap-feed.js');

const HOUR = 3_600_000;
const FEED_ENTRIES = 40;
const SEVEN_MB_RING = Array.from({ length: 11_000 }, (_, i) => `${(-10 - Math.cos(i / 1750)).toFixed(3)},${(-50 - Math.sin(i / 1750)).toFixed(3)}`).join(' ');
const SAO_PAULO = square(-23.53, -46.62);

/**
 * SYNTHETIC, in the proportions of the real feed: 40 entries and about 7 MB of polygons.
 * Most have expired at any moment, and when the real one was read, one alert was in force.
 */
function syntheticFeed({ inForce, severity = 'Severe', polygon = SEVEN_MB_RING }) {
  const now = Date.now();
  return capFeed(Array.from({ length: FEED_ENTRIES }, (_, i) => capEntry({
    id: `${i}/2026`,
    severity,
    sent: iso(now - HOUR),
    expires: iso(now + (i < inForce ? HOUR : -HOUR / 2)),
    polygons: [polygon],
  })), iso(now));
}

/** An average, because Windows reports CPU time in steps of about 15 ms. */
function readFeed(xml, times = 30) {
  let alerts = 0;
  const start = process.cpuUsage();
  for (let run = 0; run < times; run += 1) {
    const reader = new CapFeedReader(Date.now());
    for (let i = 0; i < xml.length; i += 64 * 1024) reader.push(xml.slice(i, i + 64 * 1024));
    alerts = reader.finish().alerts.length;
  }
  const { user, system } = process.cpuUsage(start);
  return { cpuMs: (user + system) / 1000 / times, alerts };
}

const workDir = mkdtempSync(join(tmpdir(), 'clima-pro-measure-'));
const quietXml = syntheticFeed({ inForce: 1 });
const busyXml = syntheticFeed({ inForce: FEED_ENTRIES });
const quietFeed = join(workDir, 'quiet.xml');
const glowFeed = join(workDir, 'glow.xml');
writeFileSync(quietFeed, quietXml);
writeFileSync(glowFeed, capFeed([capEntry({ id: 'x/2026', severity: 'Extreme', sent: iso(Date.now() - HOUR), expires: iso(Date.now() + HOUR), polygons: [SAO_PAULO] })], iso(Date.now())));
const feedMB = (quietXml.length / 1024 / 1024).toFixed(1);
const quietRead = readFeed(quietXml);
const busyRead = readFeed(busyXml, 5);

const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(server, 'listening');

let socket;
let images = 0;
let bytes = 0;
let onConnection = () => {};
server.on('connection', (client) => {
  socket = client;
  client.on('message', (raw) => {
    const message = JSON.parse(raw);
    const data = message.cmd === 'state' ? message.param?.statelist?.[0]?.data : null;
    if (data) {
      images += 1;
      bytes += data.length;
    }
  });
  onConnection();
});

async function launch(feed) {
  const connected = new Promise((resolve) => { onConnection = resolve; });
  const plugin = fork(join(pluginDir, 'plugin', 'app.js'), ['127.0.0.1', String(server.address().port), 'en'], {
    execArgv: ['--import', preload('fake-fetch.mjs'), '--import', preload('metrics.mjs')],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, FAKE_ALERT_FEED: feed },
  });
  await connected;
  await sleep(200);
  return plugin;
}

const metricsOf = async (plugin) => {
  plugin.send('metrics');
  const [reply] = await once(plugin, 'message');
  return reply;
};
const send = (message) => socket.send(JSON.stringify(message));
const MB = (value) => `${(value / 1024 / 1024).toFixed(1)} MB`;
const key = (i) => ({ uuid: manifest.Actions[0].UUID, key: `${i}_0`, actionid: `a${i}` });
const addKeys = () => {
  send({ cmd: 'didReceiveGlobalSettings', uuid: manifest.UUID, key: '', actionid: '', settings: { apiKey: 'MEASURE000000000' } });
  for (let i = 0; i < KEYS; i += 1) {
    send({ cmd: 'add', ...key(i), param: { theme: THEMES[i % THEMES.length], location: `city ${i}` } });
  }
};

/** Waits until at least `count` images arrived and no more are coming. Returns when the last one did. */
async function settled(count, ms = 20_000) {
  const end = performance.now() + ms;
  let seen = images;
  let lastChange = performance.now();
  while (images < count || performance.now() - lastChange < 500) {
    if (performance.now() > end) throw new Error(`only ${images} of ${count} images arrived`);
    if (images !== seen) {
      seen = images;
      lastChange = performance.now();
    }
    await sleep(5);
  }
  return lastChange;
}

const plugin = await launch(quietFeed);
const metrics = () => metricsOf(plugin);
const atStart = await metrics();

const startedAt = performance.now();
addKeys();
const firstPaint = (await settled(KEYS)) - startedAt;
// The first check of the alert feed is part of what the keys cost.
await sleep(1000);
const afterRender = await metrics();
const imageSize = bytes / images;

await sleep(IDLE_SECONDS * 1000);
const afterIdle = await metrics();

const presses = 60;
const beforePresses = await metrics();
for (let i = 0; i < presses; i += 1) {
  send({ cmd: 'run', ...key(i % KEYS) });
  await sleep(50);
}
await settled(0, 30_000);
const afterPresses = await metrics();
plugin.kill();

const cpuPercent = (from, to, ms) => (((to.cpuMs - from.cpuMs) / ms) * 100).toFixed(2);

// All keys under an extreme alert: the most the plugin ever sends without being asked.
const glowing = await launch(glowFeed);
addKeys();
await settled(KEYS);
await sleep(1000);
const glowStart = await metricsOf(glowing);
const imagesAtGlowStart = images;
await sleep(GLOW_SECONDS * 1000);
const glowEnd = await metricsOf(glowing);
const glowImages = images - imagesAtGlowStart;
glowing.kill();

console.log(`Node ${process.version}, ${KEYS} keys, ${KEYS} different places`);
console.log(`Memory at start, no keys    ${MB(atStart.rss)}`);
console.log(`Memory with keys drawn      ${MB(afterRender.rss)} (heap ${MB(afterRender.heapUsed)}, WASM and buffers ${MB(afterRender.external)})`);
console.log(`Memory after ${IDLE_SECONDS} s idle       ${MB(afterIdle.rss)}`);
console.log(`Memory after ${presses} presses      ${MB(afterPresses.rss)}`);
console.log(`CPU idle                    ${cpuPercent(afterRender, afterIdle, IDLE_SECONDS * 1000)}% of one core`);
console.log(`First paint of every key    ${firstPaint.toFixed(0)} ms, ${(afterRender.cpuMs - atStart.cpuMs).toFixed(0)} ms of CPU`);
console.log(`One press                   ${((afterPresses.cpuMs - beforePresses.cpuMs) / presses).toFixed(1)} ms of CPU`);
console.log(`Image sent per key          ${(imageSize / 1024).toFixed(1)} KB`);
console.log(`Reading a ${feedMB} MB alert feed  ${quietRead.cpuMs.toFixed(1)} ms of CPU with ${quietRead.alerts} in force, ${busyRead.cpuMs.toFixed(0)} ms with all ${busyRead.alerts}`);
console.log(`CPU with every key glowing  ${cpuPercent(glowStart, glowEnd, GLOW_SECONDS * 1000)}% of one core, ${(glowImages / GLOW_SECONDS).toFixed(1)} images a second in all`);

for (const client of server.clients) client.terminate();
server.close();
rmSync(workDir, { recursive: true, force: true });
