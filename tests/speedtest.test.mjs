import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Store, speedSample } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';
import { Poller } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/monitor.js';
import { PingWindow, parsePingBurst } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/providers.js';
import { measureDownload, measureUpload, runSpeedTest } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/speedtest.js';

const FAST = { streams: 2, warmupMs: 150, measureMs: 600, graceMs: 800 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A server that sends and takes data at a fixed pace, so the speed it should be measured at is known. */
async function pacedServer({ bytesPerSecond, status = 200 } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url.split('?')[0]}`);
    if (status !== 200) {
      res.writeHead(status).end();
      req.resume();
      return;
    }
    if (req.method === 'POST') {
      // Reading slowly is what slows the sender down.
      let paused = false;
      req.on('data', (chunk) => {
        if (paused) return;
        paused = true;
        req.pause();
        setTimeout(() => { paused = false; req.resume(); }, (chunk.length / bytesPerSecond) * 1000);
      });
      req.on('end', () => res.writeHead(200).end());
      return;
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    const chunk = Buffer.alloc(16 * 1024);
    const timer = setInterval(() => res.write(chunk), (chunk.length / bytesPerSecond) * 1000);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => { server.closeAllConnections(); server.close(); },
  };
}

test('a download is measured in megabits per second, from after the warm-up', async () => {
  // 500 KB/s on each of two connections is 8 megabits per second.
  const server = await pacedServer({ bytesPerSecond: 500_000 });
  try {
    const mbps = await measureDownload({ ...FAST, baseUrl: server.url });
    assert.ok(mbps > 5 && mbps < 11, `${mbps} Mbps`);
    assert.ok(server.requests.every((request) => request === 'GET /__down'));
  } finally {
    server.close();
  }
});

test('an upload counts requests the server answered, and the download and upload are both returned', async () => {
  const server = await pacedServer({ bytesPerSecond: 1_000_000 });
  try {
    const { download, upload } = await runSpeedTest({ ...FAST, baseUrl: server.url });
    assert.ok(download > 0 && upload > 0, `${download} / ${upload}`);
    assert.ok(server.requests.includes('POST /__up'));
  } finally {
    server.close();
  }
});

test('a download stops at the most it may move', async () => {
  const server = await pacedServer({ bytesPerSecond: 20_000_000 });
  try {
    const started = Date.now();
    await measureDownload({ ...FAST, measureMs: 5000, maxBytes: 3_000_000, baseUrl: server.url });
    assert.ok(Date.now() - started < 3000, 'it did not wait out the time');
  } finally {
    server.close();
  }
});

test('a server that refuses is a failure, and not a speed of zero', async () => {
  const server = await pacedServer({ status: 503 });
  try {
    await assert.rejects(measureDownload({ ...FAST, baseUrl: server.url }), /status 503/);
    await assert.rejects(measureUpload({ ...FAST, baseUrl: server.url }), /status 503/);
    assert.deepEqual((await runSpeedTest({ ...FAST, baseUrl: server.url }).catch((error) => error.message)), 'status 503');
  } finally {
    server.close();
  }
});

test('nothing listening is a failure', async () => {
  await assert.rejects(measureDownload({ ...FAST, baseUrl: 'http://127.0.0.1:1' }));
});

test('a speed reading holds until the next one, however long that is', () => {
  const store = new Store(5000);
  store.put([speedSample(120, 30, 1000)]);
  const later = store.get('network.speed', '', 1000 + 3 * 60 * 60_000);
  assert.equal(later.value, 120);
  assert.equal(later.upload, 30);
  store.put([speedSample(null, null, 2000)]);
  assert.equal(store.get('network.speed', '', 3000).quality, 'unavailable', 'a failed test is not shown as the old one');
});

test('a source asked less often does not read N/D between readings', () => {
  const store = new Store(5000);
  store.put([{ id: 'network.ping', value: 20, unit: 'ms', source: 'ping', scope: '', at: 0, quality: 'ok' }]);
  assert.equal(store.get('network.ping', '', 60_000).quality, 'unavailable');
  store.setStale('ping', 120_000);
  assert.equal(store.get('network.ping', '', 60_000).quality, 'ok');
});

test('a burst of pings is read one for each reply, in any language, with the lost ones as null', () => {
  const output = [
    'Disparando contra 1.1.1.1 com 32 bytes de dados:',
    'Resposta de 1.1.1.1: bytes=32 tempo=14ms TTL=58',
    'Esgotado o tempo limite do pedido.',
    'Resposta de 1.1.1.1: bytes=32 tempo<1ms TTL=58',
    'Resposta de 192.168.0.9: Host de destino inacessível.',
    'Estatísticas do ping: Mínimo = 1ms, Máximo = 14ms, Média = 7ms',
  ].join('\r\n');
  assert.deepEqual(parsePingBurst(output, 4), [14, 1, null, null]);
  assert.deepEqual(parsePingBurst('Request timed out.\r\nRequest timed out.', 2), [null, null]);
  assert.deepEqual(parsePingBurst('Reply from 1.2.3.4: TTL expired in transit.', 1), [null]);
  assert.deepEqual(parsePingBurst('64 bytes from 1.1.1.1: icmp_seq=1 ttl=60 time=3.42 ms', 1), [3.42]);
});

test('the ping is the middle reply, the jitter is the step between replies, and the loss is over all sent', () => {
  const window = new PingWindow(20);
  const [ping, loss, jitter] = window.update([10, 12, 10, 90, 12, null, null, 10]);
  assert.equal(ping.value, 11);
  assert.equal(loss.value, 25);
  assert.equal(jitter.id, 'network.jitter');
  // Steps: 2, 2, 80, 78, 2.
  assert.ok(Math.abs(jitter.value - 32.8) < 1e-9, String(jitter.value));
  assert.equal(new PingWindow(5).update([7])[2].value, null, 'one reply has nothing to differ from');
});

test('a poller that is manual runs only when asked, and not twice at once', async () => {
  let runs = 0;
  let release;
  const poller = new Poller({
    task: () => { runs += 1; return new Promise((resolve) => { release = resolve; }); },
    every: 0, onResult: () => {}, onError: () => {},
  });
  poller.start();
  await sleep(30);
  assert.equal(runs, 0, 'nothing at the start');
  assert.equal(poller.nudge(), true);
  assert.equal(poller.nudge(), false, 'it is running');
  release([]);
  await sleep(30);
  assert.equal(poller.nudge(), true);
  assert.equal(runs, 2);
  release([]);
  poller.stop();
});

test('a poller can be asked to wait before its first run, and to change its pace', async () => {
  let runs = 0;
  const poller = new Poller({ task: async () => { runs += 1; return []; }, every: 5000, firstDelay: 60, onResult: () => {}, onError: () => {} });
  poller.start();
  await sleep(20);
  assert.equal(runs, 0);
  await sleep(120);
  assert.equal(runs, 1);
  poller.setEvery(250);
  await sleep(600);
  assert.ok(runs >= 2, `${runs} runs after its pace changed`);
  poller.stop();
  const after = runs;
  await sleep(400);
  assert.equal(runs, after);
});
