import assert from 'node:assert/strict';
import test from 'node:test';
import { METRICS, Store, autoScope, classify, display, format, sample } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';

test('a missing or stale reading is N/D, never zero', () => {
  const store = new Store(1000);
  assert.equal(display(store.get('cpu.usage')), 'N/D');
  store.put([sample('cpu.usage', 40, 'node', 100)]);
  assert.equal(store.get('cpu.usage', '', 900).quality, 'ok');
  assert.equal(store.get('cpu.usage', '', 2000).quality, 'unavailable', 'stale');
  assert.equal(display(store.get('cpu.usage', '', 2000)), 'N/D');
  assert.equal(display(sample('cpu.usage', Number.NaN)), 'N/D');
});

test('readings read the way a person would say them', () => {
  assert.deepEqual(format('cpu.usage', 41.6), { text: '42%', unit: '' });
  assert.deepEqual(format('gpu.vram.usage', 90.4), { text: '90%', unit: '' });
  assert.deepEqual(format('disk.usage', 43.2), { text: '43%', unit: '' });
  assert.deepEqual(format('cpu.temperature', 67.4), { text: '67', unit: '°C' });
  assert.deepEqual(format('network.ping', 4.2), { text: '4.2', unit: 'ms' });
  assert.deepEqual(format('network.ping', 18.4), { text: '18', unit: 'ms' });
  assert.deepEqual(format('network.loss', 0), { text: '0.0%', unit: '' });
  assert.deepEqual(format('cpu.usage', null), { text: 'N/D', unit: '' });
});

test('there are the nine readings that were asked for, and every usage is a percentage', () => {
  assert.deepEqual(Object.keys(METRICS), [
    'cpu.usage', 'cpu.temperature', 'gpu.usage', 'gpu.temperature', 'gpu.vram.usage',
    'ram.usage', 'network.ping', 'network.loss', 'disk.usage',
  ]);
  for (const [id, metric] of Object.entries(METRICS)) {
    if (id.endsWith('.usage')) assert.equal(metric.unit, '%', id);
  }
});

test('every metric has a name, a unit, a scale and sources the monitor knows', () => {
  const sources = new Set(['node', 'ping', 'nvidia', 'windows', 'lhm']);
  for (const [id, metric] of Object.entries(METRICS)) {
    assert.ok(metric.label && metric.unit && metric.group, id);
    assert.ok(metric.sources.length > 0 && metric.sources.every((source) => sources.has(source)), id);
    assert.ok(metric.max > 0, `${id} has no scale for its bar or graph`);
  }
});

test('LibreHardwareMonitor is only ever the reserve, never the first source of a reading', () => {
  for (const [id, metric] of Object.entries(METRICS)) assert.notEqual(metric.sources[0], 'lhm', id);
});

const LIMITS = { 'cpu.temperature': { warning: 80, critical: 90 } };

test('thresholds apply to the metric they are named after', () => {
  const level = (value, previous, hysteresis) => classify(sample('cpu.temperature', value), LIMITS, previous, hysteresis);
  assert.equal(level(70), 'normal');
  assert.equal(level(80), 'warning');
  assert.equal(level(91), 'critical');
  assert.equal(classify(sample('ram.usage', 99), LIMITS), 'normal', 'no limit, no warning');
  assert.equal(classify(null, LIMITS), 'unavailable');
});

test('every threshold in the configuration names a metric', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile(new URL('../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/defaults.json', import.meta.url), 'utf8'));
  for (const [id, limit] of Object.entries(config.thresholds)) {
    assert.ok(METRICS[id], `${id} is not a metric, so it would never warn`);
    assert.ok(limit.warning < limit.critical, id);
  }
});

test('a level holds until the reading falls a little below it, so a key on the edge does not blink', () => {
  const level = (value, previous) => classify(sample('cpu.temperature', value), LIMITS, previous, 3);
  assert.equal(level(79, 'warning'), 'warning');
  assert.equal(level(77, 'warning'), 'normal');
  assert.equal(level(88, 'critical'), 'critical');
  assert.equal(level(86, 'critical'), 'warning');
  assert.equal(level(79, 'normal'), 'normal');
  assert.equal(level(79, 'unavailable'), 'normal');
});

test('the store keeps two minutes of graph, one point every few seconds', () => {
  const store = new Store(60_000, { historyEvery: 5000, historySize: 3 });
  for (let at = 0; at <= 20_000; at += 1000) store.put([sample('cpu.usage', at / 1000, 'node', at)]);
  assert.deepEqual(store.history('cpu.usage'), [10, 15, 20]);
  store.put([sample('cpu.temperature', null, 'windows', 0)]);
  assert.deepEqual(store.history('cpu.temperature'), [], 'a missing reading is not a point');
});

test('a reading comes from the first source that has a fresh one, and the reserve answers only when it must', () => {
  const store = new Store(60_000);
  store.put([sample('cpu.temperature', 70, 'lhm')]);
  assert.equal(store.get('cpu.temperature').value, 70, 'only the reserve has one');
  store.put([sample('cpu.temperature', 61, 'windows')]);
  assert.equal(store.get('cpu.temperature').value, 61, 'the preferred source wins as soon as it has one');
  store.invalidate('windows');
  assert.equal(store.get('cpu.temperature').value, 70, 'and the reserve is back when it has none');
});

test('each graphics card and drive keeps its own reading and its own graph', () => {
  const store = new Store(60_000, { historyEvery: 0 });
  store.put([
    sample('gpu.usage', 10, 'nvidia', Date.now(), 'NVIDIA GeForce RTX 3080'),
    sample('gpu.usage', 80, 'nvidia', Date.now(), 'NVIDIA GeForce GTX 1060'),
    sample('disk.usage', 40, 'node', Date.now(), 'C:'),
    sample('disk.usage', 90, 'node', Date.now(), 'D:'),
  ]);
  assert.equal(store.get('gpu.usage', 'NVIDIA GeForce GTX 1060').value, 80);
  assert.equal(store.get('disk.usage', 'D:').value, 90);
  assert.equal(store.get('disk.usage', 'E:').quality, 'unavailable', 'a drive that is not there');
  assert.deepEqual(store.history('gpu.usage', 'NVIDIA GeForce RTX 3080'), [10]);
  assert.deepEqual(store.scopes('disk.usage'), ['C:', 'D:']);
});

test('the same card read by the preferred source and by the reserve is one card', () => {
  const store = new Store(60_000);
  store.put([sample('gpu.usage', 5, 'nvidia', Date.now(), 'RTX'), sample('gpu.usage', 6, 'lhm', Date.now(), 'RTX'), sample('gpu.usage', 7, 'lhm', Date.now(), 'Radeon')]);
  assert.deepEqual(store.scopes('gpu.usage'), ['RTX', 'Radeon']);
});

test('an automatic key reads the discrete card, NVIDIA first, and the drive Windows runs from', () => {
  assert.equal(autoScope('gpu', ['Intel(R) Arc(TM) Graphics', 'NVIDIA GeForce RTX 3080']), 'NVIDIA GeForce RTX 3080');
  assert.equal(autoScope('gpu', ['Intel(R) Arc(TM) Graphics', 'AMD Radeon RX 7800 XT']), 'AMD Radeon RX 7800 XT');
  assert.equal(autoScope('gpu', []), '');
  assert.equal(autoScope('disk', ['D:', 'C:'], 'C:'), 'C:');
  assert.equal(autoScope('disk', ['D:', 'E:'], 'C:'), 'D:', 'the first one when the system drive is not listed');
  assert.equal(autoScope('cpu', ['x']), '');
});

test('a provider that failed takes its readings and graphs with it, and no one else’s', () => {
  const store = new Store(60_000);
  store.put([sample('cpu.temperature', 5, 'windows'), sample('network.ping', 50, 'ping')]);
  store.invalidate('windows');
  assert.equal(store.get('cpu.temperature').quality, 'unavailable');
  assert.deepEqual(store.history('cpu.temperature'), []);
  assert.equal(store.get('network.ping').quality, 'ok');
});

test('a graph that two sources fed is kept when only one of them fails', () => {
  const store = new Store(60_000, { historyEvery: 0 });
  store.put([sample('gpu.usage', 5, 'nvidia', Date.now(), 'RTX'), sample('gpu.usage', 6, 'lhm', Date.now(), 'RTX')]);
  store.invalidate('lhm');
  assert.equal(store.history('gpu.usage', 'RTX').length, 2);
  store.invalidate('nvidia');
  assert.deepEqual(store.history('gpu.usage', 'RTX'), []);
});
