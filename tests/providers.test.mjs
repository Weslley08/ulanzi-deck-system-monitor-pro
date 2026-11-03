import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CpuMeter, NvidiaReader, PingWindow, listDrives, numeric, parseNvidiaLine, parsePing, readDisks, readLhm, readRam, sensorsToSamples,
  thermalReader, thermalSamples,
} from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/providers.js';

const FAKE_NVIDIA = join(dirname(fileURLToPath(import.meta.url)), 'support', 'fake-nvidia.mjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (condition, ms = 5000) => {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(20);
  }
};

// ---------------------------------------------------------------- Node

test('memory is read from the system, as a share of use', () => {
  const [usage] = readRam();
  assert.equal(usage.id, 'ram.usage');
  assert.equal(usage.source, 'node');
  assert.ok(usage.value > 0 && usage.value <= 100);
});

test('the processor share is the time spent busy since the last reading, over every core', () => {
  let ticks = { idle: 0, user: 0 };
  const meter = new CpuMeter(() => [{ times: { ...ticks, nice: 0, sys: 0, irq: 0 } }, { times: { idle: ticks.idle, user: ticks.user, nice: 0, sys: 0, irq: 0 } }]);
  assert.deepEqual(meter.update(), [], 'it needs two readings');
  ticks = { idle: 750, user: 250 };
  assert.equal(meter.update()[0].value, 25);
  ticks = { idle: 750, user: 1250 };
  assert.equal(meter.update()[0].value, 100);
  assert.deepEqual(meter.update(), [], 'no time has passed, so there is nothing to divide');
});

const FAKE_DRIVES = { 'C:\\': { blocks: 1000, bfree: 250 }, 'D:\\': { blocks: 400, bfree: 400 }, 'E:\\': { blocks: 0, bfree: 0 } };
const fakeStatfs = async (path) => {
  if (path === 'F:\\') return new Promise(() => {});
  if (!FAKE_DRIVES[path]) throw new Error('no such drive');
  return FAKE_DRIVES[path];
};

test('the drives are the letters that answer, and one that hangs or has no space is left out', async () => {
  assert.deepEqual(await listDrives(fakeStatfs, 'win32'), ['C:', 'D:']);
  assert.deepEqual(await listDrives(fakeStatfs, 'darwin'), ['/']);
});

test('a drive is read as the share of its space that is used, each under its own letter', async () => {
  const readings = await readDisks(['C:', 'D:'], fakeStatfs);
  assert.deepEqual(readings.map((r) => [r.scope, r.value]), [['C:', 75], ['D:', 0]]);
  assert.ok(readings.every((r) => r.id === 'disk.usage' && r.source === 'node'));
});

test('a drive that stops answering is a missing reading, not zero and not an error for the others', async () => {
  const readings = await readDisks(['C:', 'X:'], fakeStatfs);
  assert.equal(readings[0].value, 75);
  assert.equal(readings[1].quality, 'unavailable');
});

// ---------------------------------------------------------------- nvidia-smi

test('a line of nvidia-smi is a card with its name, and anything else is not', () => {
  assert.deepEqual(parseNvidiaLine('1, NVIDIA GeForce RTX 3080, 91, 72, 6144, 12288'), { index: 1, name: 'NVIDIA GeForce RTX 3080', usage: 91, temperature: 72, used: 6144, total: 12288 });
  const missing = parseNvidiaLine('0, NVIDIA GeForce RTX 3080, [N/A], [N/A], [N/A], [N/A]');
  assert.equal(missing.name, 'NVIDIA GeForce RTX 3080');
  assert.ok([missing.usage, missing.temperature, missing.used, missing.total].every(Number.isNaN), 'a missing value is not zero');
  assert.equal(parseNvidiaLine('NVIDIA-SMI has failed because it could not communicate with the NVIDIA driver.'), null);
  assert.equal(parseNvidiaLine(''), null);
});

function reader(mode) {
  process.env.FAKE_NVIDIA_MODE = mode;
  const found = [];
  const errors = [];
  const instance = new NvidiaReader({ command: process.execPath, args: [FAKE_NVIDIA] });
  instance.start({ onSamples: (values) => found.push(values), onError: (error) => errors.push(error) });
  return { instance, found, errors };
}

const byScope = (samples) => Object.fromEntries(samples.filter((s) => s.id === 'gpu.usage').map((s) => [s.scope, s.value]));

test('every NVIDIA card is reported under its own name, with the memory as a share of use', async () => {
  const { instance, found } = reader('two');
  try {
    await until(() => found.some((values) => values.length === 6));
    const last = found.findLast((values) => values.length === 6);
    assert.deepEqual(byScope(last), { 'NVIDIA GeForce RTX 3080': 91, 'NVIDIA GeForce GTX 1060': 3 });
    assert.equal(last.find((s) => s.id === 'gpu.vram.usage' && s.scope === 'NVIDIA GeForce RTX 3080').value, 50);
    assert.equal(last.find((s) => s.id === 'gpu.temperature' && s.scope === 'NVIDIA GeForce GTX 1060').value, 40);
    assert.ok(last.every((s) => s.source === 'nvidia'));
  } finally {
    instance.stop();
  }
});

test('two cards with the same name are told apart by their number, and only then', async () => {
  const { instance, found } = reader('same');
  try {
    await until(() => found.some((values) => values.length === 6));
    assert.deepEqual(byScope(found.findLast((values) => values.length === 6)), { 'NVIDIA T4 #0': 10, 'NVIDIA T4 #1': 20 });
  } finally {
    instance.stop();
  }
});

test('a card with no sensors gives missing readings, not zeros', async () => {
  const { instance, found } = reader('na');
  try {
    await until(() => found.length > 0);
    assert.ok(found.at(-1).every((s) => s.quality === 'unavailable'));
  } finally {
    instance.stop();
  }
});

test('when nvidia-smi stops, the reader says so once', async () => {
  const { instance, errors } = reader('exit');
  await until(() => errors.length > 0);
  await sleep(200);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /stopped/);
  instance.stop();
});

test('an error message printed in place of readings is not a reading', async () => {
  const { instance, found } = reader('text');
  await sleep(500);
  instance.stop();
  assert.deepEqual(found, []);
});

test('with no nvidia-smi installed, the error says so by its code', async () => {
  const errors = [];
  const missing = new NvidiaReader({ command: join(dirname(FAKE_NVIDIA), 'there-is-no-such-program') });
  missing.start({ onSamples: () => {}, onError: (error) => errors.push(error) });
  await until(() => errors.length > 0);
  assert.equal(errors[0].code, 'ENOENT');
  missing.stop();
});

// ---------------------------------------------------------------- Thermal zone

test('the thermal reading is the hottest zone in degrees, and a PC with none says so by a code', () => {
  assert.deepEqual(thermalSamples('60.85').map((s) => [s.id, s.value, s.source]), [['cpu.temperature', 60.85, 'windows']]);
  assert.throws(() => thermalSamples('none'), { code: 'MISSING' });
  assert.throws(() => thermalSamples('something else'), /something else/);
});

test('the thermal reader answers from a running PowerShell, fast after the first time, and leaves when stopped', { skip: process.platform !== 'win32' }, async () => {
  const thermal = thermalReader();
  try {
    const first = await thermal.ask();
    assert.ok(first === 'none' || Number.isFinite(Number(first)), first);
    const started = performance.now();
    await thermal.ask();
    assert.ok(performance.now() - started < 1000, 'a reading from a running reader is fast');
    await assert.rejects(Promise.all([thermal.ask(), thermal.ask()]), /already waiting/);
  } finally {
    thermal.stop();
  }
});

test('the thermal reader says so on a system without it', { skip: process.platform === 'win32' }, async () => {
  await assert.rejects(thermalReader().ask(), /Windows/);
});

// ---------------------------------------------------------------- LibreHardwareMonitor, the reserve

const sensor = (hardware, name, type, value, raw) => ({ Text: name, Value: value, RawValue: raw, Type: type, SensorId: `${hardware}/${name}` });
const hardware = (id, text, ...Children) => ({ HardwareId: id, Text: text, Children });
// What LibreHardwareMonitor writes: formatted values in the system's language, and the raw number beside them.
const TREE = { Children: [
  hardware('/intelcpu/0', 'Intel Core i7', sensor('/intelcpu/0', 'CPU Package', 'Temperature', '61,0 °C', 61)),
  hardware('/gpu-intel/0', 'Intel Arc Graphics', sensor('/gpu-intel/0', 'GPU Core', 'Load', '3 %', 3)),
  hardware('/gpu-amd/0', 'AMD Radeon RX 7800 XT',
    sensor('/gpu-amd/0', 'GPU Core', 'Load', '91 %', 91),
    sensor('/gpu-amd/0', 'GPU Core', 'Temperature', '72 °C', 72),
    sensor('/gpu-amd/0', 'GPU Memory', 'Load', '50 %', 50)),
] };

const readings = (samples) => samples.map((s) => `${s.id}|${s.scope}=${s.value}`).sort();

test('the processor temperature and every graphics card are found, each card under its own name', () => {
  assert.deepEqual(readings(sensorsToSamples(TREE)), [
    'cpu.temperature|=61',
    'gpu.temperature|AMD Radeon RX 7800 XT=72',
    'gpu.usage|AMD Radeon RX 7800 XT=91',
    'gpu.usage|Intel Arc Graphics=3',
    'gpu.vram.usage|AMD Radeon RX 7800 XT=50',
  ]);
  assert.ok(sensorsToSamples(TREE).every((s) => s.source === 'lhm'));
});

test('a processor that names its temperature the AMD way is read too', () => {
  const tree = { Children: [hardware('/amdcpu/0', 'AMD Ryzen', sensor('/amdcpu/0', 'Core (Tctl/Tdie)', 'Temperature', '55 °C', 55))] };
  assert.deepEqual(readings(sensorsToSamples(tree)), ['cpu.temperature|=55']);
});

test('video memory is worked out from used and total when there is no share', () => {
  const card = hardware('/gpu-amd/0', 'AMD Radeon',
    sensor('/gpu-amd/0', 'GPU Memory Used', 'SmallData', '3072 MB', 3072),
    sensor('/gpu-amd/0', 'GPU Memory Total', 'SmallData', '12288 MB', 12288));
  assert.deepEqual(readings(sensorsToSamples({ Children: [card] })), ['gpu.vram.usage|AMD Radeon=25']);
});

test('two cards with the same name are told apart by their number', () => {
  const tree = { Children: [
    hardware('/gpu-amd/0', 'AMD Radeon', sensor('/gpu-amd/0', 'GPU Core', 'Load', '10 %', 10)),
    hardware('/gpu-amd/1', 'AMD Radeon', sensor('/gpu-amd/1', 'GPU Core', 'Load', '20 %', 20)),
  ] };
  assert.deepEqual(readings(sensorsToSamples(tree)), ['gpu.usage|AMD Radeon #0=10', 'gpu.usage|AMD Radeon #1=20']);
});

test('a sensor that is not there is left out, never made up as zero', () => {
  assert.deepEqual(sensorsToSamples({ Children: [] }), []);
  assert.deepEqual(sensorsToSamples({ Children: [hardware('/intelcpu/0', 'CPU', sensor('/intelcpu/0', 'CPU Package', 'Temperature', '-', null))] }), []);
});

test('numbers are read in either decimal style', () => {
  assert.equal(numeric('45,5 °C'), 45.5);
  assert.equal(numeric('1.2 GB'), 1.2);
  assert.equal(numeric('-'), null);
});

function lhm(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/data.json` })));
}

test('LibreHardwareMonitor is read over loopback', async () => {
  const { server, url } = await lhm((req, res) => res.end(JSON.stringify(TREE)));
  try {
    assert.ok(readings(await readLhm(url)).includes('cpu.temperature|=61'));
  } finally {
    server.close();
  }
});

test('a program that is not running, or answers wrongly, is an error to report, not an empty reading', async () => {
  const closed = await lhm((req, res) => res.end());
  closed.server.close();
  await assert.rejects(readLhm(closed.url));
  const wrong = await lhm((req, res) => { res.statusCode = 500; res.end('no'); });
  const html = await lhm((req, res) => res.end('<html>not json</html>'));
  const slow = await lhm(() => {});
  try {
    await assert.rejects(readLhm(wrong.url), /HTTP 500/);
    await assert.rejects(readLhm(html.url), /not its data/);
    await assert.rejects(readLhm(slow.url, { timeout: 100 }), /in time/);
  } finally {
    for (const { server } of [wrong, html, slow]) server.closeAllConnections();
    for (const { server } of [wrong, html, slow]) server.close();
  }
});

test('only a loopback address is ever asked, because the address comes from the environment', async () => {
  await assert.rejects(readLhm('http://192.168.1.5:8085/data.json'), /loopback/);
  await assert.rejects(readLhm('https://127.0.0.1/data.json'), /loopback/);
  await assert.rejects(readLhm('not an address'), /invalid/);
  assert.deepEqual(await readLhm(''), []);
});

test('an answer too large to be sensor data is refused', async () => {
  const { server, url } = await lhm((req, res) => { res.write(Buffer.alloc(5 * 1024 * 1024, 32)); res.end(); });
  try {
    await assert.rejects(readLhm(url));
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

// ---------------------------------------------------------------- Ping

test('ping is read in any language of Windows, and a failure is not a time', () => {
  assert.equal(parsePing('Resposta de 1.1.1.1: bytes=32 tempo=4ms TTL=60\r\n Mínimo = 4ms, Máximo = 4ms'), 4);
  assert.equal(parsePing('Respuesta desde 1.1.1.1: bytes=32 tiempo<1ms TTL=60'), 1);
  assert.equal(parsePing('Antwort von 1.1.1.1: Bytes=32 Zeit=12ms TTL=60'), 12);
  assert.equal(parsePing('64 bytes from 1.1.1.1: icmp_seq=1 ttl=60 time=3.42 ms'), 3.42);
  assert.equal(parsePing('Esgotado o tempo limite do pedido.'), null);
  assert.equal(parsePing('Resposta de 192.168.0.9: Host de destino inacessível.'), null);
});

test('ping and the share of pings with no answer, over a window', () => {
  const ping = new PingWindow(3);
  ping.update(20);
  ping.update(null);
  const [average, loss] = ping.update(40);
  assert.equal(average.value, 30);
  assert.ok(Math.abs(loss.value - 100 / 3) < 1e-9);
  const lost = new PingWindow(2);
  lost.update(null);
  assert.equal(lost.update(null)[0].quality, 'unavailable');
});
