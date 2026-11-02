import assert from 'node:assert/strict';
import test from 'node:test';
import { METRICS, Store, classify, display, format, sample } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';

test('a missing or stale reading is N/D, never zero', () => {
  const store = new Store(1000);
  assert.equal(display(store.get('cpu.usage')), 'N/D');
  store.put([sample('cpu.usage', 40, 'test', 100)]);
  assert.equal(store.get('cpu.usage', 900).quality, 'ok');
  assert.equal(store.get('cpu.usage', 2000).quality, 'stale');
  assert.equal(display(store.get('cpu.usage', 2000)), 'N/D');
  assert.equal(display(sample('cpu.usage', Number.NaN)), 'N/D');
});

test('readings read the way a person would say them', () => {
  assert.deepEqual(format('cpu.usage', 41.6), { text: '42%', unit: '' });
  assert.deepEqual(format('gpu.vram.usage', 90.4), { text: '90%', unit: '' });
  assert.deepEqual(format('cpu.temperature', 67.4), { text: '67', unit: '°C' });
  assert.deepEqual(format('network.ping', 4.2), { text: '4.2', unit: 'ms' });
  assert.deepEqual(format('network.ping', 18.4), { text: '18', unit: 'ms' });
  assert.deepEqual(format('network.loss', 0), { text: '0.0%', unit: '' });
  assert.deepEqual(format('gpu.temperature', 45.6), { text: '46', unit: '°C' });
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

test('every metric has a name, a unit, a scale and a source the monitor knows', () => {
  const sources = new Set(['lhm', 'ping']);
  for (const [id, metric] of Object.entries(METRICS)) {
    assert.ok(metric.label && metric.unit && metric.group, id);
    assert.ok(sources.has(metric.source), id);
    assert.ok(metric.max > 0, `${id} has no scale for its bar or graph`);
  }
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
  for (let at = 0; at <= 20_000; at += 1000) store.put([sample('cpu.usage', at / 1000, 'test', at)]);
  assert.deepEqual(store.history('cpu.usage'), [10, 15, 20]);
  store.put([sample('cpu.temperature', null, 'test', 0)]);
  assert.deepEqual(store.history('cpu.temperature'), [], 'a missing reading is not a point');
});

test('a provider that failed takes its readings and graphs with it, and no one else’s', () => {
  const store = new Store(60_000);
  store.put([sample('cpu.temperature', 5, 'LHM'), sample('network.ping', 50, 'ping')]);
  store.invalidate('lhm');
  assert.equal(store.get('cpu.temperature').quality, 'unavailable');
  assert.deepEqual(store.history('cpu.temperature'), []);
  assert.equal(store.get('network.ping').quality, 'ok');
});
