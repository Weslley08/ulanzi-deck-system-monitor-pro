import assert from 'node:assert/strict';
import test from 'node:test';
import { Store, sample } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';
import { Monitor, Poller } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/monitor.js';

const CONFIG = {
  sampleIntervalsMs: { hardware: 250, ping: 250, disk: 250 },
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

test('a provider runs only while a key needs it, and stops with the last one', async () => {
  const runs = { os: 0, lhm: 0 };
  const { monitor, statuses } = make({
    os: async () => { runs.os += 1; return [sample('ram.usage', 50, 'os')]; },
    lhm: async () => { runs.lhm += 1; return [sample('cpu.temperature', 5, 'LHM')]; },
  });
  monitor.setDemand(['os']);
  await until(() => runs.os > 0);
  assert.equal(runs.lhm, 0, 'no key reads the hardware, so it is not asked');
  assert.equal(monitor.statusOf('os'), 'ok');
  assert.equal(monitor.statusOf('lhm'), 'unused');
  monitor.setDemand([]);
  const seen = runs.os;
  await sleep(500);
  assert.equal(runs.os, seen);
  assert.equal(monitor.statusOf('os'), 'unused');
  assert.ok(statuses.includes('os:unused'));
  monitor.dispose();
});

test('LibreHardwareMonitor not running marks its keys unavailable once and says why', async () => {
  const { monitor, store, reports } = make({ lhm: async () => { throw new Error('connect refused'); } });
  store.put([sample('cpu.temperature', 5, 'LHM')]);
  monitor.setDemand(['lhm']);
  await until(() => monitor.statusOf('lhm') === 'offline');
  assert.equal(store.get('cpu.temperature').quality, 'unavailable', 'the old reading is not kept as if it were true');
  assert.equal(monitor.noteFor('cpu.temperature'), 'LHM closed');
  assert.equal(reports[0][0], 'lhm');
  monitor.dispose();
});

test('it recovers by itself when the program starts', async () => {
  let up = false;
  const { monitor, store } = make({ lhm: async () => { if (!up) throw new Error('down'); return [sample('cpu.temperature', 9, 'LHM')]; } });
  monitor.setDemand(['lhm']);
  await until(() => monitor.statusOf('lhm') === 'offline');
  up = true;
  await until(() => monitor.statusOf('lhm') === 'ok', 5000);
  assert.equal(store.get('cpu.temperature').value, 9);
  monitor.dispose();
});

test('with its address turned off, LibreHardwareMonitor is not asked at all', () => {
  let asked = 0;
  const { monitor } = make({ lhm: async () => { asked += 1; return []; } }, { LHM_JSON_URL: '' });
  monitor.setDemand(['lhm']);
  assert.equal(monitor.statusOf('lhm'), 'unconfigured');
  assert.equal(monitor.noteFor('cpu.temperature'), 'Not set up');
  assert.equal(asked, 0);
});

test('the graphics card reader starts with the first GPU key and stops with the last', () => {
  const { monitor, nvidia } = make({});
  monitor.setDemand(['nvidia']);
  monitor.setDemand(['nvidia', 'os']);
  assert.equal(nvidia.starts, 1, 'a second key does not start a second one');
  monitor.setDemand([]);
  assert.equal(nvidia.stops, 1);
  assert.equal(monitor.statusOf('nvidia'), 'unused');
});

test('readings from the graphics card reach the store, and a stop takes them away', () => {
  const { monitor, store, nvidia } = make({});
  monitor.setDemand(['nvidia']);
  nvidia.handlers.onSamples([sample('gpu.usage', 80, 'nvidia-smi')]);
  assert.equal(monitor.statusOf('nvidia'), 'ok');
  assert.equal(store.get('gpu.usage').value, 80);
  nvidia.handlers.onError(new Error('nvidia-smi stopped'));
  assert.equal(monitor.statusOf('nvidia'), 'offline');
  assert.equal(store.get('gpu.usage').quality, 'unavailable');
  monitor.dispose();
});

test('without nvidia-smi the keys say so, and it is not started again and again', async () => {
  const { monitor, nvidia } = make({});
  monitor.setDemand(['nvidia']);
  nvidia.handlers.onError(Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' }));
  assert.equal(monitor.statusOf('nvidia'), 'missing');
  assert.equal(monitor.noteFor('gpu.usage'), 'No NVIDIA');
  await sleep(100);
  assert.equal(nvidia.starts, 1);
});

test('when nvidia-smi stops for another reason it is started again, after a wait', async () => {
  const { monitor, nvidia } = make({});
  monitor.setDemand(['nvidia']);
  nvidia.handlers.onError(new Error('nvidia-smi stopped (1)'));
  assert.equal(nvidia.starts, 1);
  await until(() => nvidia.starts === 2, 4000);
  monitor.dispose();
  assert.equal(monitor.statusOf('nvidia'), 'unused');
});

test('a restart that was waiting is cancelled when the last GPU key leaves', async () => {
  const { monitor, nvidia } = make({});
  monitor.setDemand(['nvidia']);
  nvidia.handlers.onError(new Error('nvidia-smi stopped (1)'));
  monitor.setDemand([]);
  await sleep(2500);
  assert.equal(nvidia.starts, 1);
});

test('disk and graphics readings need Windows, and say so elsewhere', () => {
  const { monitor } = make({}, {}, 'linux');
  monitor.setDemand(['windows', 'nvidia']);
  assert.equal(monitor.statusOf('windows'), 'unsupported');
  assert.equal(monitor.noteFor('disk.usage'), 'Windows only');
  assert.equal(monitor.statusOf('nvidia'), 'unsupported');
});

test('a source with data but no sensor for a metric says so', async () => {
  const { monitor } = make({ lhm: async () => [sample('cpu.temperature', 1, 'LHM')] });
  monitor.setDemand(['lhm']);
  await until(() => monitor.statusOf('lhm') === 'ok');
  assert.equal(monitor.noteFor('disk.temperature'), 'No sensor');
  assert.deepEqual(monitor.snapshot().lhm, 'ok');
  monitor.dispose();
});
