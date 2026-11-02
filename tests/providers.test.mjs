import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { NetworkCounter, NetworkSampler, PingWindow, flattenSensors, numeric, parsePing, readLhm, readPresentMonCsv, readRam, sensorsToSamples } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/providers.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sensor = (hardware, name, type, value, raw) => ({ Text: name, Value: value, RawValue: raw, Type: type, SensorId: `${hardware}/${name}` });
const hardware = (id, ...Children) => ({ HardwareId: id, Text: id, Children });
// What LibreHardwareMonitor writes: formatted values in the system's language, and the raw number beside them.
const TREE = { Children: [
  hardware('/intelcpu/0',
    sensor('/intelcpu/0', 'CPU Total', 'Load', '37,5 %', 37.5),
    sensor('/intelcpu/0', 'CPU Package', 'Temperature', '61,0 °C', 61),
    sensor('/intelcpu/0', 'CPU Core #1', 'Clock', '4300 MHz', 4300),
    sensor('/intelcpu/0', 'CPU Core #2', 'Clock', '4500 MHz', 4500),
    sensor('/intelcpu/0', 'CPU Package', 'Power', '55,2 W', 55.2)),
  hardware('/gpu-intel/0', sensor('/gpu-intel/0', 'GPU Core', 'Load', '3 %', 3)),
  hardware('/gpu-nvidia/0',
    sensor('/gpu-nvidia/0', 'GPU Core', 'Load', '91 %', 91),
    sensor('/gpu-nvidia/0', 'GPU Core', 'Temperature', '72 °C', 72),
    sensor('/gpu-nvidia/0', 'GPU Core', 'Clock', '1900 MHz', 1900),
    sensor('/gpu-nvidia/0', 'GPU Package', 'Power', '210 W', 210),
    sensor('/gpu-nvidia/0', 'GPU Memory Used', 'SmallData', '6144 MB', 6144),
    sensor('/gpu-nvidia/0', 'GPU Memory Total', 'SmallData', '12288 MB', 12288)),
] };

const byId = (samples) => Object.fromEntries(samples.map((s) => [s.id, s.value]));

test('sensors are found by their hardware and type, and the discrete card wins over the integrated one', () => {
  const found = byId(sensorsToSamples(TREE));
  assert.deepEqual(found, {
    'cpu.usage': 37.5, 'cpu.temperature': 61, 'cpu.clock': 4400, 'cpu.power': 55.2,
    'gpu.usage': 91, 'gpu.temperature': 72, 'gpu.clock': 1900, 'gpu.power': 210, 'gpu.vram.used': 6, 'gpu.vram.total': 12,
  });
});

test('a processor that names its clock and temperature the AMD way is read too', () => {
  const tree = { Children: [hardware('/amdcpu/0',
    sensor('/amdcpu/0', 'Core (Tctl/Tdie)', 'Temperature', '55 °C', 55),
    sensor('/amdcpu/0', 'Cores (Average)', 'Clock', '3900 MHz', 3900),
    sensor('/amdcpu/0', 'Package', 'Power', '88 W', 88))] };
  assert.deepEqual(byId(sensorsToSamples(tree)), { 'cpu.temperature': 55, 'cpu.clock': 3900, 'cpu.power': 88 });
});

test('a sensor that is not there is left out, never made up as zero', () => {
  assert.deepEqual(sensorsToSamples({ Children: [] }), []);
  assert.deepEqual(sensorsToSamples({ Children: [hardware('/intelcpu/0', sensor('/intelcpu/0', 'CPU Total', 'Load', '-', null))] }), []);
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
    assert.equal(byId(await readLhm(url))['cpu.usage'], 37.5);
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

test('memory is read from the system', () => {
  const [total, used, usage] = readRam();
  assert.ok(total.value > 0 && used.value > 0 && usage.value > 0 && usage.value <= 100);
});

test('throughput in Mbps, and a change of adapters starts over instead of spiking', () => {
  const counter = new NetworkCounter();
  assert.deepEqual(counter.update({ rx: 0, tx: 0, at: 1000, adapters: 1 }), []);
  const [down, up] = counter.update({ rx: 1_000_000, tx: 500_000, at: 2000, adapters: 1 });
  assert.equal(down.value, 8);
  assert.equal(up.value, 4);
  assert.deepEqual(counter.update({ rx: 900_000_000, tx: 500_000, at: 3000, adapters: 2 }), [], 'a new adapter brings its whole history');
  assert.equal(counter.update({ rx: 901_000_000, tx: 600_000, at: 4000, adapters: 2 }).length, 2);
  assert.deepEqual(counter.update({ rx: 5, tx: 5, at: 5000, adapters: 2 }), [], 'counters that restart');
  counter.reset();
  assert.deepEqual(counter.update({ rx: 10, tx: 10, at: 6000, adapters: 2 }), []);
});

test('ping is read in any language of Windows, and a failure is not a time', () => {
  assert.equal(parsePing('Resposta de 1.1.1.1: bytes=32 tempo=4ms TTL=60\r\n Mínimo = 4ms, Máximo = 4ms'), 4);
  assert.equal(parsePing('Respuesta desde 1.1.1.1: bytes=32 tiempo<1ms TTL=60'), 1);
  assert.equal(parsePing('Antwort von 1.1.1.1: Bytes=32 Zeit=12ms TTL=60'), 12);
  assert.equal(parsePing('64 bytes from 1.1.1.1: icmp_seq=1 ttl=60 time=3.42 ms'), 3.42);
  assert.equal(parsePing('Esgotado o tempo limite do pedido.'), null);
  assert.equal(parsePing('Resposta de 192.168.0.9: Host de destino inacessível.'), null);
});

test('ping, jitter and loss over a window', () => {
  const ping = new PingWindow(3);
  ping.update(20);
  ping.update(null);
  const [average, jitter, loss] = ping.update(40);
  assert.equal(average.value, 30);
  assert.equal(jitter.value, 20);
  assert.ok(Math.abs(loss.value - 100 / 3) < 1e-9);
  const lost = new PingWindow(2);
  lost.update(null);
  assert.equal(lost.update(null)[0].quality, 'unavailable');
});

test('the frame rate comes from the last line of the PresentMon file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-csv-'));
  try {
    const file = join(dir, 'frames.csv');
    writeFileSync(file, 'Application,MsBetweenPresents\ngame.exe,8\ngame.exe,6.25\n');
    const [frame, fps] = await readPresentMonCsv(file);
    assert.equal(frame.value, 6.25);
    assert.equal(fps.value, 160);
    writeFileSync(file, 'Application,MsBetweenPresents\n');
    assert.deepEqual(await readPresentMonCsv(file), []);
    assert.deepEqual(await readPresentMonCsv(''), []);
    await assert.rejects(readPresentMonCsv(join(dir, 'missing.csv')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the network reader answers a reading from a running PowerShell, and leaves when stopped', { skip: process.platform !== 'win32' }, async () => {
  const sampler = new NetworkSampler();
  try {
    const first = await sampler.sample();
    assert.ok(first.rx >= 0 && first.tx >= 0 && first.adapters >= 0);
    const started = performance.now();
    const second = await sampler.sample();
    assert.ok(second.rx >= first.rx);
    assert.ok(performance.now() - started < 500, 'a reading from a running reader is fast');
    await assert.rejects(Promise.all([sampler.sample(), sampler.sample()]), /already waiting/);
  } finally {
    sampler.stop();
  }
});

test('the network reader says so on a system without it', { skip: process.platform === 'win32' }, async () => {
  await assert.rejects(new NetworkSampler().sample(), /Windows/);
});
