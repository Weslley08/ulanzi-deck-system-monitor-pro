import assert from 'node:assert/strict';
import test from 'node:test';
import { Store, sample } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';
import { Monitor, Poller } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/monitor.js';

const CONFIG = {
  sampleIntervalsMs: { hardware: 250, fps: 250, network: 250, ping: 250 },
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

function make(tasks, env = {}, platform = 'win32') {
  const store = new Store(60_000);
  const reports = [];
  const statuses = [];
  const monitor = new Monitor({
    store, config: CONFIG, env: { LHM_JSON_URL: 'http://127.0.0.1:1/x', PRESENTMON_CSV: 'C:/frames.csv', ...env }, platform, tasks,
    report: (source, error) => reports.push([source, error.message]),
    onStatus: (source, status) => statuses.push(`${source}:${status}`),
  });
  return { monitor, store, reports, statuses };
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
    lhm: async () => { runs.lhm += 1; return [sample('cpu.usage', 5, 'LHM')]; },
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
  store.put([sample('cpu.usage', 5, 'LHM')]);
  monitor.setDemand(['lhm']);
  await until(() => monitor.statusOf('lhm') === 'offline');
  assert.equal(store.get('cpu.usage').quality, 'unavailable', 'the old reading is not kept as if it were true');
  assert.equal(monitor.noteFor('cpu.usage'), 'LHM closed');
  assert.equal(reports[0][0], 'lhm');
  monitor.dispose();
});

test('it recovers by itself when the program starts', async () => {
  let up = false;
  const { monitor, store } = make({ lhm: async () => { if (!up) throw new Error('down'); return [sample('cpu.usage', 9, 'LHM')]; } });
  monitor.setDemand(['lhm']);
  await until(() => monitor.statusOf('lhm') === 'offline');
  up = true;
  await until(() => monitor.statusOf('lhm') === 'ok', 5000);
  assert.equal(store.get('cpu.usage').value, 9);
  monitor.dispose();
});

test('with its address turned off, LibreHardwareMonitor is not asked at all', () => {
  let asked = 0;
  const { monitor } = make({ lhm: async () => { asked += 1; return []; } }, { LHM_JSON_URL: '' });
  monitor.setDemand(['lhm']);
  assert.equal(monitor.statusOf('lhm'), 'unconfigured');
  assert.equal(monitor.noteFor('cpu.usage'), 'Not set up');
  assert.equal(asked, 0);
});

test('frame rate needs its file, and shows no game while the file has no frames', async () => {
  const unset = make({ fps: async () => [] }, { PRESENTMON_CSV: '' });
  unset.monitor.setDemand(['fps']);
  assert.equal(unset.monitor.noteFor('fps.current'), 'Not set up');

  const { monitor, store } = make({ fps: async () => [] });
  store.put([sample('fps.current', 60, 'PresentMon CSV')]);
  monitor.setDemand(['fps']);
  await until(() => monitor.statusOf('fps') === 'idle');
  assert.equal(monitor.noteFor('fps.current'), 'No game');
  assert.equal(store.get('fps.current').quality, 'unavailable');
  monitor.dispose();
});

test('network readings need Windows, and say so elsewhere', () => {
  const { monitor } = make({ network: async () => [] }, {}, 'linux');
  monitor.setDemand(['network']);
  assert.equal(monitor.statusOf('network'), 'unsupported');
  assert.equal(monitor.noteFor('network.download'), 'Windows only');
});

test('the first network reading takes two samples, and until then the key says it is measuring', async () => {
  const { monitor } = make({ network: async () => [] });
  monitor.setDemand(['network']);
  await sleep(300);
  assert.equal(monitor.statusOf('network'), 'starting');
  assert.equal(monitor.noteFor('network.download'), 'Measuring');
  monitor.dispose();
});

test('a source with data but no sensor for a metric says so', async () => {
  const { monitor } = make({ lhm: async () => [sample('cpu.usage', 1, 'LHM')] });
  monitor.setDemand(['lhm']);
  await until(() => monitor.statusOf('lhm') === 'ok');
  assert.equal(monitor.noteFor('gpu.temperature'), 'No sensor');
  assert.deepEqual(monitor.snapshot().lhm, 'ok');
  monitor.dispose();
});
