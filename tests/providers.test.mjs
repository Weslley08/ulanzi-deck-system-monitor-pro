import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CpuMeter, DiskSampler, NvidiaReader, PingWindow, flattenSensors, numeric, parseNvidiaLine, parsePing, readLhm, readRam, sensorsToSamples } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/providers.js';

const FAKE_NVIDIA = join(dirname(fileURLToPath(import.meta.url)), 'support', 'fake-nvidia.mjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (condition, ms = 5000) => {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(20);
  }
};

const sensor = (hardware, name, type, value, raw) => ({ Text: name, Value: value, RawValue: raw, Type: type, SensorId: `${hardware}/${name}` });
const hardware = (id, ...Children) => ({ HardwareId: id, Text: id, Children });
// What LibreHardwareMonitor writes: formatted values in the system's language, and the raw number beside them.
const TREE = { Children: [
  hardware('/intelcpu/0',
    sensor('/intelcpu/0', 'CPU Total', 'Load', '37,5 %', 37.5),
    sensor('/intelcpu/0', 'CPU Package', 'Temperature', '61,0 °C', 61)),
  hardware('/nvme/0', sensor('/nvme/0', 'Temperature', 'Temperature', '44 °C', 44)),
  hardware('/hdd/0', sensor('/hdd/0', 'Temperature', 'Temperature', '51 °C', 51)),
  hardware('/gpu-nvidia/0', sensor('/gpu-nvidia/0', 'GPU Core', 'Temperature', '72 °C', 72)),
] };

const byId = (samples) => Object.fromEntries(samples.map((s) => [s.id, s.value]));

test('the two temperatures LibreHardwareMonitor gives are found by hardware and type, the hottest disk winning', () => {
  assert.deepEqual(byId(sensorsToSamples(TREE)), { 'cpu.temperature': 61, 'disk.temperature': 51 });
});

test('a processor that names its temperature the AMD way is read too', () => {
  const tree = { Children: [hardware('/amdcpu/0', sensor('/amdcpu/0', 'Core (Tctl/Tdie)', 'Temperature', '55 °C', 55))] };
  assert.deepEqual(byId(sensorsToSamples(tree)), { 'cpu.temperature': 55 });
});

test('a sensor that is not there is left out, never made up as zero', () => {
  assert.deepEqual(sensorsToSamples({ Children: [] }), []);
  assert.deepEqual(sensorsToSamples({ Children: [hardware('/intelcpu/0', sensor('/intelcpu/0', 'CPU Package', 'Temperature', '-', null))] }), []);
});

test('numbers are read in either decimal style', () => {
  assert.equal(numeric('45,5 °C'), 45.5);
  assert.equal(numeric('1.2 GB'), 1.2);
  assert.equal(numeric('-'), null);
  assert.equal(flattenSensors({ Children: [{ Text: 'CPU Package', Value: '60 °C' }] }).length, 1);
});

function lhm(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/data.json` })));
}

test('LibreHardwareMonitor is read over loopback', async () => {
  const { server, url } = await lhm((req, res) => res.end(JSON.stringify(TREE)));
  try {
    assert.equal(byId(await readLhm(url))['cpu.temperature'], 61);
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

test('memory is read from the system, as a share of use', () => {
  const [usage] = readRam();
  assert.equal(usage.id, 'ram.usage');
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

test('a line of nvidia-smi is a card, and anything else is not', () => {
  assert.deepEqual(parseNvidiaLine('1, 91, 72, 6144, 12288'), { index: 1, usage: 91, temperature: 72, used: 6144, total: 12288 });
  const missing = parseNvidiaLine('0, [N/A], [N/A], [N/A], [N/A]');
  assert.equal(missing.index, 0);
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

test('the card with the most memory is the one shown, and the memory is a share of use', async () => {
  const { instance, found } = reader('normal');
  try {
    await until(() => found.length > 0);
    assert.deepEqual(byId(found.at(-1)), { 'gpu.usage': 91, 'gpu.temperature': 72, 'gpu.vram.usage': 50 });
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

test('with no nvidia-smi installed, the error says so by its code, and stopping later changes nothing', async () => {
  const errors = [];
  const missing = new NvidiaReader({ command: join(dirname(FAKE_NVIDIA), 'there-is-no-such-program') });
  missing.start({ onSamples: () => {}, onError: (error) => errors.push(error) });
  await until(() => errors.length > 0);
  assert.equal(errors[0].code, 'ENOENT');
  missing.stop();
});

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

test('the disk reader answers from a running PowerShell, as a share of busy time, and leaves when stopped', { skip: process.platform !== 'win32' }, async () => {
  const sampler = new DiskSampler();
  try {
    const first = await sampler.usage();
    assert.ok(first >= 0 && first <= 100);
    const started = performance.now();
    const second = await sampler.usage();
    assert.ok(second >= 0 && second <= 100);
    assert.ok(performance.now() - started < 2500, 'a reading from a running reader does not start another');
  } finally {
    sampler.stop();
  }
});

test('the disk reader says so on a system without it', { skip: process.platform === 'win32' }, async () => {
  await assert.rejects(new DiskSampler().usage(), /Windows/);
});
