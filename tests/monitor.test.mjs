import assert from 'node:assert/strict';
import test from 'node:test';
import { Store, sample } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';
import { Monitor, Poller } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/monitor.js';

const CONFIG = {
  sampleIntervalsMs: { hardware: 250, ping: 250 },
  ping: { targets: ['127.0.0.1'], timeoutMs: 100, windowSize: 5 },
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (condition, ms = 3000) => {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(10);
  }
};

/** A stand-in for the reader of nvidia-smi that lets the test decide what it says and when. */
function fakeNvidia() {
  const reader = {
    starts: 0, stops: 0, handlers: null,
    start(handlers) { reader.starts += 1; reader.handlers = handlers; },
    stop() { reader.stops += 1; },
  };
  return reader;
}

const ok = (id, value, source) => async () => [sample(id, value, source)];
const down = (message = 'down') => async () => { throw new Error(message); };
const none = () => async () => { throw Object.assign(new Error('no thermal zone'), { code: 'MISSING' }); };

function make(tasks, env = {}, platform = 'win32', nvidia = fakeNvidia()) {
  const store = new Store(60_000);
  const reports = [];
  const statuses = [];
  const monitor = new Monitor({
    store, config: CONFIG, env: { LHM_JSON_URL: 'http://127.0.0.1:1/x', ...env }, platform, tasks, nvidia,
    report: (source, error) => reports.push([source, error.message]),
    onStatus: (source, status) => statuses.push(`${source}:${status}`),
  });
  return { monitor, store, reports, statuses, nvidia };
}

test('a poller never overlaps itself, and slows down while it keeps failing', async () => {
  const calls = [];
  let running = 0;
  let overlapped = false;
  const poller = new Poller({
    every: 250,
    maxEvery: 1000,
    task: async () => {
      running += 1;
      overlapped ||= running > 1;
      calls.push(Date.now());
      await sleep(300);
      running -= 1;
      throw new Error('down');
    },
    onResult: () => {},
    onError: () => {},
  });
  poller.start();
  await until(() => calls.length >= 3, 5000);
  poller.stop();
  assert.equal(overlapped, false);
  const gaps = calls.slice(1).map((at, i) => at - calls[i] - 300);
  assert.ok(gaps[1] > gaps[0], `the wait grows: ${gaps.join(', ')}`);
});

test('a poller that stops stays stopped, even with a task still running', async () => {
  let results = 0;
  const poller = new Poller({ every: 250, task: async () => { await sleep(50); return [1]; }, onResult: () => { results += 1; }, onError: () => {} });
  poller.start();
  poller.stop();
  await sleep(400);
  assert.equal(results, 0);
});

test('a reading this PC cannot give is not asked for again', async () => {
  let asked = 0;
  const poller = new Poller({ every: 250, task: async () => { asked += 1; throw Object.assign(new Error('no'), { code: 'MISSING' }); }, onResult: () => {}, onError: () => {} });
  poller.start();
  await sleep(700);
  assert.equal(asked, 1);
});

test('a provider runs only while a key needs it, and stops with the last one', async () => {
  const runs = { node: 0, ping: 0 };
  const { monitor, statuses } = make({
    node: async () => { runs.node += 1; return [sample('cpu.usage', 5, 'node')]; },
    ping: async () => { runs.ping += 1; return [sample('network.ping', 5, 'ping')]; },
  });
  monitor.setDemand(['network.ping']);
  await until(() => runs.ping > 0);
  assert.equal(runs.node, 0, 'no key reads the processor, so it is not asked');
  assert.equal(monitor.statusOf('ping'), 'ok');
  monitor.setDemand([]);
  const seen = runs.ping;
  await sleep(500);
  assert.equal(runs.ping, seen);
  assert.equal(monitor.statusOf('ping'), 'unused');
  assert.ok(statuses.includes('ping:unused'));
  monitor.dispose();
});

test('the processor, memory and drives are one source, asked once for however many keys read them', async () => {
  let asked = 0;
  const { monitor } = make({ node: async () => { asked += 1; return []; } });
  monitor.setDemand(['cpu.usage', 'ram.usage', 'disk.usage']);
  await sleep(100);
  assert.equal(asked, 1);
  monitor.dispose();
});

test('LibreHardwareMonitor is not even asked while the preferred source of every key works', async () => {
  let lhmAsked = 0;
  const { monitor } = make({
    windows: ok('cpu.temperature', 60, 'windows'),
    lhm: async () => { lhmAsked += 1; return []; },
  });
  monitor.setDemand(['cpu.temperature']);
  await until(() => monitor.statusOf('windows') === 'ok');
  await sleep(100);
  assert.equal(lhmAsked, 0);
  assert.equal(monitor.statusOf('lhm'), 'unused');
  monitor.dispose();
});

test('a PC with no thermal zone falls back on LibreHardwareMonitor, and says so when that is closed too', async () => {
  const { monitor, store } = make({ windows: none(), lhm: down('connect refused') });
  monitor.setDemand(['cpu.temperature']);
  await until(() => monitor.statusOf('lhm') === 'offline');
  assert.equal(monitor.statusOf('windows'), 'missing');
  assert.equal(monitor.noteFor('cpu.temperature'), 'Needs LHM');
  assert.deepEqual(monitor.describe('cpu.temperature'), { source: 'lhm', state: 'offline' });
  assert.equal(store.get('cpu.temperature').quality, 'unavailable');
  monitor.dispose();
});

test('the reserve answers when the preferred source has nothing', async () => {
  const { monitor, store } = make({ windows: none(), lhm: ok('cpu.temperature', 70, 'lhm') });
  monitor.setDemand(['cpu.temperature']);
  await until(() => store.get('cpu.temperature').value === 70);
  monitor.dispose();
});

test('without NVIDIA, an AMD card is read from the reserve', async () => {
  const { monitor, store, nvidia } = make({ lhm: ok('gpu.usage', 33, 'lhm') });
  monitor.setDemand(['gpu.usage']);
  assert.equal(monitor.statusOf('lhm'), 'unused', 'NVIDIA is given its chance first');
  nvidia.handlers.onError(Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' }));
  assert.equal(monitor.statusOf('nvidia'), 'missing');
  await until(() => store.get('gpu.usage').value === 33);
  monitor.dispose();
});

test('with an NVIDIA card, the reserve is never asked', async () => {
  let lhmAsked = 0;
  const { monitor, store, nvidia } = make({ lhm: async () => { lhmAsked += 1; return []; } });
  monitor.setDemand(['gpu.usage', 'gpu.temperature', 'gpu.vram.usage']);
  nvidia.handlers.onSamples([sample('gpu.usage', 80, 'nvidia', Date.now(), 'RTX')]);
  assert.equal(monitor.statusOf('nvidia'), 'ok');
  assert.equal(store.get('gpu.usage', 'RTX').value, 80);
  await sleep(100);
  assert.equal(lhmAsked, 0);
  monitor.dispose();
});

test('the graphics card reader starts with the first GPU key and stops with the last', () => {
  const { monitor, nvidia } = make({});
  monitor.setDemand(['gpu.usage']);
  monitor.setDemand(['gpu.usage', 'gpu.temperature']);
  assert.equal(nvidia.starts, 1, 'a second key does not start a second one');
  monitor.setDemand([]);
  assert.equal(nvidia.stops, 1);
  assert.equal(monitor.statusOf('nvidia'), 'unused');
});

test('when nvidia-smi stops for another reason it is started again, after a wait', async () => {
  const { monitor, nvidia } = make({});
  monitor.setDemand(['gpu.usage']);
  nvidia.handlers.onError(new Error('nvidia-smi stopped (1)'));
  assert.equal(monitor.statusOf('nvidia'), 'offline');
  assert.equal(nvidia.starts, 1);
  await until(() => nvidia.starts === 2, 4000);
  monitor.dispose();
});

test('a restart that was waiting is cancelled when the last GPU key leaves', async () => {
  const { monitor, nvidia } = make({});
  monitor.setDemand(['gpu.usage']);
  nvidia.handlers.onError(new Error('nvidia-smi stopped (1)'));
  monitor.setDemand([]);
  await sleep(2500);
  assert.equal(nvidia.starts, 1);
});

test('it recovers by itself when the reserve program starts', async () => {
  let up = false;
  const { monitor, store } = make({ windows: none(), lhm: async () => { if (!up) throw new Error('down'); return [sample('cpu.temperature', 9, 'lhm')]; } });
  monitor.setDemand(['cpu.temperature']);
  await until(() => monitor.statusOf('lhm') === 'offline');
  up = true;
  await until(() => monitor.statusOf('lhm') === 'ok', 5000);
  assert.equal(store.get('cpu.temperature').value, 9);
  monitor.dispose();
});

test('with its address turned off, the reserve is not asked at all', () => {
  let asked = 0;
  const { monitor } = make({ windows: none(), lhm: async () => { asked += 1; return []; } }, { LHM_JSON_URL: '' });
  monitor.setDemand(['cpu.temperature']);
  return until(() => monitor.statusOf('lhm') === 'unconfigured').then(() => {
    assert.equal(monitor.noteFor('cpu.temperature'), 'Not set up');
    assert.equal(asked, 0);
  });
});

test('on a system that is not Windows, the readers that need it say so and the reserve takes over', async () => {
  const { monitor } = make({ lhm: down() }, {}, 'darwin');
  monitor.setDemand(['cpu.temperature', 'gpu.usage']);
  assert.equal(monitor.statusOf('windows'), 'missing');
  assert.equal(monitor.statusOf('nvidia'), 'missing');
  await until(() => monitor.statusOf('lhm') === 'offline');
  monitor.dispose();
});

test('the first source says nothing wrong while it is still starting', async () => {
  const { monitor } = make({ node: async () => { await sleep(200); return []; } });
  monitor.setDemand(['cpu.usage']);
  assert.equal(monitor.statusOf('node'), 'starting');
  assert.equal(monitor.noteFor('cpu.usage'), 'Measuring');
  monitor.dispose();
});

test('a source with data but no reading for a metric says so', async () => {
  const { monitor } = make({ node: ok('ram.usage', 50, 'node') });
  monitor.setDemand(['cpu.usage']);
  await until(() => monitor.statusOf('node') === 'ok');
  assert.equal(monitor.noteFor('cpu.usage'), 'No data');
  assert.deepEqual(monitor.snapshot(), { node: 'ok', ping: 'unused', nvidia: 'unused', windows: 'unused', lhm: 'unused' });
  monitor.dispose();
});
