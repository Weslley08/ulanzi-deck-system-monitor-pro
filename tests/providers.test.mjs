import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { PingWindow, flattenSensors, numeric, parsePing, readLhm, sensorsToSamples } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/providers.js';

const sensor = (hardware, name, type, value, raw) => ({ Text: name, Value: value, RawValue: raw, Type: type, SensorId: `${hardware}/${name}` });
const hardware = (id, ...Children) => ({ HardwareId: id, Text: id, Children });
// What LibreHardwareMonitor writes: formatted values in the system's language, and the raw number beside them.
const TREE = { Children: [
  hardware('/intelcpu/0',
    sensor('/intelcpu/0', 'CPU Total', 'Load', '37,5 %', 37.5),
    sensor('/intelcpu/0', 'CPU Package', 'Temperature', '61,0 °C', 61)),
  hardware('/gpu-intel/0', sensor('/gpu-intel/0', 'GPU Core', 'Load', '3 %', 3), sensor('/gpu-intel/0', 'GPU Core', 'Temperature', '40 °C', 40)),
  hardware('/gpu-nvidia/0',
    sensor('/gpu-nvidia/0', 'GPU Core', 'Load', '91 %', 91),
    sensor('/gpu-nvidia/0', 'GPU Core', 'Temperature', '72 °C', 72),
    sensor('/gpu-nvidia/0', 'GPU Memory', 'Load', '50 %', 50)),
  hardware('/ram', sensor('/ram', 'Memory', 'Load', '58,2 %', 58.2), sensor('/ram', 'Virtual Memory', 'Load', '70 %', 70)),
  hardware('/nvme/0',
    sensor('/nvme/0', 'Used Space', 'Load', '80 %', 80),
    sensor('/nvme/0', 'Total Activity', 'Load', '12 %', 12),
    sensor('/nvme/0', 'Temperature', 'Temperature', '44 °C', 44)),
  hardware('/hdd/0',
    sensor('/hdd/0', 'Total Activity', 'Load', '35 %', 35),
    sensor('/hdd/0', 'Temperature', 'Temperature', '51 °C', 51)),
] };

const byId = (samples) => Object.fromEntries(samples.map((s) => [s.id, s.value]));

test('every reading is found by its hardware, type and name, the discrete card and the busiest disk winning', () => {
  assert.deepEqual(byId(sensorsToSamples(TREE)), {
    'cpu.usage': 37.5, 'cpu.temperature': 61,
    'gpu.usage': 91, 'gpu.temperature': 72, 'gpu.vram.usage': 50,
    'ram.usage': 58.2,
    'disk.usage': 35,
  });
});

test('the share of disk space used is not mistaken for how busy the disk is', () => {
  const tree = { Children: [hardware('/nvme/0', sensor('/nvme/0', 'Used Space', 'Load', '80 %', 80))] };
  assert.deepEqual(sensorsToSamples(tree), []);
});

test('virtual memory is not the memory', () => {
  const tree = { Children: [hardware('/ram', sensor('/ram', 'Virtual Memory', 'Load', '70 %', 70))] };
  assert.deepEqual(sensorsToSamples(tree), []);
});

test('a processor that names its temperature the AMD way is read too', () => {
  const tree = { Children: [hardware('/amdcpu/0', sensor('/amdcpu/0', 'Core (Tctl/Tdie)', 'Temperature', '55 °C', 55))] };
  assert.deepEqual(byId(sensorsToSamples(tree)), { 'cpu.temperature': 55 });
});

test('video memory is worked out from used and total when there is no share', () => {
  const card = hardware('/gpu-amd/0',
    sensor('/gpu-amd/0', 'GPU Memory Used', 'SmallData', '3072 MB', 3072),
    sensor('/gpu-amd/0', 'GPU Memory Total', 'SmallData', '12288 MB', 12288));
  assert.equal(byId(sensorsToSamples({ Children: [card] }))['gpu.vram.usage'], 25);
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
