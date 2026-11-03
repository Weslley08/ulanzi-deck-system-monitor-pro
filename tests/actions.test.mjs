import assert from 'node:assert/strict';
import test from 'node:test';
import { Store, sample } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';
import { MonitorActions, PLUGIN_UUID, metricOfAction, normalizeSettings } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/ulanzi.js';

const action = (name) => `${PLUGIN_UUID}.${name}`;

function setup(options = {}) {
  const sent = [];
  const views = [];
  const host = {
    setBaseDataIcon: (context, icon) => sent.push({ context, icon }),
    logMessage: () => {},
  };
  const store = new Store(60_000, { historyEvery: 0 });
  const actions = new MonitorActions({
    host,
    store,
    thresholds: { 'cpu.temperature': { warning: 80, critical: 90 } },
    hysteresis: 3,
    minUpdateMs: 0,
    render: async (view) => {
      views.push(view);
      return `data:image/png;base64,${views.length}`;
    },
    ...options,
  });
  return { actions, store, sent, views };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('an action UUID stands for one metric, and anything else for none', () => {
  assert.equal(metricOfAction(action('cpuusage')), 'cpu.usage');
  assert.equal(metricOfAction(action('gpuvramusage')), 'gpu.vram.usage');
  assert.equal(metricOfAction(action('diskusage')), 'disk.usage');
  assert.equal(metricOfAction(action('nothing')), null);
  assert.equal(metricOfAction('com.other.plugin.cpuusage'), null);
  assert.equal(metricOfAction(undefined), null);
});

test('settings from the panel are checked, with the graph on unless it was turned off', () => {
  assert.deepEqual(normalizeSettings(undefined), { accent: 'auto', graph: true, gpu: 'auto', drive: 'auto' });
  assert.deepEqual(normalizeSettings({ accent: 'pink', graph: 'false' }), { accent: 'pink', graph: false, gpu: 'auto', drive: 'auto' });
  assert.deepEqual(normalizeSettings({ accent: 'url(#x)', graph: false }), { accent: 'auto', graph: false, gpu: 'auto', drive: 'auto' });
  assert.equal(normalizeSettings({ gpu: 'NVIDIA GeForce RTX 3080', drive: 'd:' }).drive, 'D:');
  assert.equal(normalizeSettings({ gpu: 'x'.repeat(200), drive: 'C:\Windows' }).gpu, 'auto', 'too long to be a name');
  assert.equal(normalizeSettings({ drive: 'C:\Windows' }).drive, 'auto', 'a drive is a letter and nothing else');
});

test('a key is drawn at once, as N/D with the reason, and again when its reading arrives', async () => {
  const { actions, store, sent, views } = setup({ noteFor: () => 'Needs LHM', t: (key) => `t:${key}` });
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  await settle();
  assert.equal(views[0].state, 'unavailable');
  assert.equal(views[0].note, 't:Needs LHM');
  assert.equal(views[0].sub, 't:Usage');
  assert.match(sent[0].icon, /^data:image\/png;base64,/, 'a full data URI');

  store.put([sample('cpu.usage', 42, 'node')]);
  actions.renderAll();
  await settle();
  assert.equal(views[1].value, '42%');
  assert.equal(views[1].bar, 21);
  assert.equal(sent.length, 2);
});

test('a face that did not change is not drawn or sent again', async () => {
  const { actions, store, sent } = setup();
  store.put([sample('cpu.usage', 42, 'node')]);
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  await settle();
  actions.renderAll();
  actions.renderAll();
  await settle();
  assert.equal(sent.length, 1);
});

test('no key is sent more often than the minimum, and the change is not lost', async () => {
  const { actions, store, sent } = setup({ minUpdateMs: 60_000 });
  store.put([sample('cpu.usage', 10, 'node')]);
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  await settle();
  store.put([sample('cpu.usage', 11, 'node')]);
  actions.renderAll();
  await settle();
  assert.equal(sent.length, 1, 'too soon');
  actions.minUpdateMs = 0;
  actions.renderAll();
  await settle();
  assert.equal(sent.length, 2, 'it is sent on the next pass');
});

test('a key shows its warning and keeps it until the reading falls clear', async () => {
  const { actions, store, views } = setup();
  actions.upsert({ uuid: action('cputemperature'), context: 'a', param: {} });
  const read = async (value) => {
    store.put([sample('cpu.temperature', value, 'windows')]);
    actions.renderAll();
    await settle();
    return views.at(-1).state;
  };
  assert.equal(await read(70), 'normal');
  assert.equal(await read(81), 'warning');
  assert.equal(await read(79), 'warning');
  assert.equal(await read(70), 'normal');
});

test('the graph follows the history, scaled to the metric, and can be turned off', async () => {
  const { actions, store, views } = setup();
  for (const value of [0, 50, 100]) store.put([sample('cpu.usage', value, 'node')]);
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  actions.upsert({ uuid: action('cpuusage'), context: 'b', param: { graph: false } });
  await settle();
  assert.deepEqual(views.find((view) => view.graph).graph, [0, 10, 20]);
  assert.equal(views.filter((view) => !view.graph).length, 1);
});

test('the graph of a metric is scaled to the most it can reach', async () => {
  const { actions, store, views } = setup();
  for (const value of [10, 20, 40]) store.put([sample('network.ping', value, 'ping')]);
  actions.upsert({ uuid: action('networkping'), context: 'a', param: {} });
  await settle();
  assert.equal(views[0].bar, 10, '20 ms of 200');
  assert.deepEqual(views[0].graph, [1, 2, 4]);
});

test('the sources in use follow the keys that are active', () => {
  const { actions } = setup();
  assert.equal(actions.hasActive(), false);
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  actions.upsert({ uuid: action('networkping'), context: 'b', param: {} });
  assert.deepEqual(actions.activeMetrics().sort(), ['cpu.usage', 'network.ping']);
  actions.setActive({ context: 'b', active: 'false' });
  assert.deepEqual(actions.activeMetrics(), ['cpu.usage']);
  actions.clear({ param: [{ context: 'a' }] });
  assert.equal(actions.hasActive(), false);
});

test('a hidden key is not drawn, and is drawn again when it comes back', async () => {
  const { actions, sent } = setup();
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  await settle();
  actions.setActive({ context: 'a', active: false });
  actions.renderAll();
  await settle();
  assert.equal(sent.length, 1);
  actions.setActive({ context: 'a', active: 'true' });
  await settle();
  assert.equal(sent.length, 2);
});

test('a change in what is in use is announced, so the monitor can start or stop its providers', () => {
  let changes = 0;
  const { actions } = setup({ onChange: () => { changes += 1; } });
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  actions.setActive({ context: 'a', active: false });
  actions.clear({ param: [{ context: 'a' }] });
  assert.equal(changes, 3);
  actions.upsert({ uuid: 'com.other.thing', context: 'z', param: {} });
  assert.equal(changes, 3, 'an action that is not ours changes nothing');
});

test('an image that arrives after its key was removed, or newer face drawn, is dropped', async () => {
  let release;
  const { actions, sent } = setup({ render: () => new Promise((resolve) => { release = resolve; }) });
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  actions.clear({ param: [{ context: 'a' }] });
  release('data:image/png;base64,late');
  await settle();
  assert.equal(sent.length, 0);
});

test('a render that fails is logged without the reading and tried again later', async () => {
  const logged = [];
  let fail = true;
  const { actions, sent } = setup({
    render: async () => {
      if (fail) throw new TypeError('boom 42%');
      return 'data:image/png;base64,ok';
    },
  });
  actions.host.logMessage = (message) => logged.push(message);
  actions.upsert({ uuid: action('cpuusage'), context: 'a', param: {} });
  await settle();
  assert.deepEqual(logged, ['render failed: TypeError']);
  fail = false;
  actions.renderAll();
  await settle();
  assert.equal(sent.length, 1);
});

test('a graphics card key reads the card it was told to, or the discrete one when it was not told', async () => {
  const { actions, store, views } = setup();
  const now = Date.now();
  store.put([
    sample('gpu.usage', 5, 'lhm', now, 'Intel(R) Arc(TM) Graphics'),
    sample('gpu.usage', 90, 'nvidia', now, 'NVIDIA GeForce RTX 3080'),
  ]);
  actions.upsert({ uuid: action('gpuusage'), context: 'auto', param: {} });
  actions.upsert({ uuid: action('gpuusage'), context: 'integrated', param: { gpu: 'Intel(R) Arc(TM) Graphics' } });
  await settle();
  assert.deepEqual(views.map((view) => view.value).sort(), ['5%', '90%']);
});

test('a drive key reads the drive it was told to, or the one Windows runs from', async () => {
  const { actions, store, views } = setup();
  const now = Date.now();
  store.put([sample('disk.usage', 43, 'node', now, 'C:'), sample('disk.usage', 91, 'node', now, 'D:')]);
  actions.upsert({ uuid: action('diskusage'), context: 'system', param: {} });
  actions.upsert({ uuid: action('diskusage'), context: 'data', param: { drive: 'D:' } });
  actions.upsert({ uuid: action('diskusage'), context: 'gone', param: { drive: 'Z:' } });
  await settle();
  assert.deepEqual(views.map((view) => view.value).sort(), ['43%', '91%', 'N/D']);
});

test('the panel is told every card and drive there is', () => {
  const { actions, store } = setup();
  const now = Date.now();
  store.put([sample('gpu.usage', 1, 'nvidia', now, 'RTX'), sample('disk.usage', 1, 'node', now, 'C:'), sample('disk.usage', 1, 'node', now, 'D:')]);
  assert.deepEqual(actions.choices(), { gpus: ['RTX'], drives: ['C:', 'D:'] });
});

test('a drive key says which drive it reads, and a key with no reading yet still says what it measures', async () => {
  const { actions, store, views } = setup();
  const now = Date.now();
  actions.upsert({ uuid: action('diskusage'), context: 'early', param: {} });
  await settle();
  assert.equal(views[0].sub, 'Used', 'no drive is known yet');
  store.put([sample('disk.usage', 43, 'node', now, 'C:'), sample('disk.usage', 91, 'node', now, 'D:')]);
  actions.upsert({ uuid: action('diskusage'), context: 'system', param: {} });
  actions.upsert({ uuid: action('diskusage'), context: 'data', param: { drive: 'D:' } });
  await settle();
  assert.deepEqual(views.slice(1).map((view) => view.sub).sort(), ['C:', 'D:']);
  assert.equal(views.find((view) => view.sub === 'D:').group, 'Disk');
});
