// What every metric is, how it reads on a key, and the shared store the providers write to.
const def = (group, label, unit, source, extra = {}) => Object.freeze({ group, label, unit, source, ...extra });

/**
 * Every usage is a percentage of use. `max` scales the bar and the graph, and `auto` shows one decimal
 * below 10 and none above. The order here is the order of the actions in the manifest.
 */
export const METRICS = Object.freeze({
  'cpu.usage': def('cpu', 'Usage', '%', 'lhm', { max: 100 }),
  'cpu.temperature': def('cpu', 'Temp', '°C', 'lhm', { max: 100 }),
  'gpu.usage': def('gpu', 'Usage', '%', 'lhm', { max: 100 }),
  'gpu.temperature': def('gpu', 'Temp', '°C', 'lhm', { max: 100 }),
  'gpu.vram.usage': def('gpu', 'VRAM', '%', 'lhm', { max: 100 }),
  'ram.usage': def('ram', 'Usage', '%', 'lhm', { max: 100 }),
  'network.ping': def('network', 'Ping', 'ms', 'ping', { max: 200, auto: true }),
  'network.loss': def('network', 'Loss', '%', 'ping', { max: 100, decimals: 1 }),
  'disk.usage': def('disk', 'Usage', '%', 'lhm', { max: 100 }),
  'disk.temperature': def('disk', 'Temp', '°C', 'lhm', { max: 100 }),
});

export const GROUPS = Object.freeze({ cpu: 'CPU', gpu: 'GPU', ram: 'RAM', network: 'Net', disk: 'Disk' });
export const SOURCES = Object.freeze(['lhm', 'ping']);

export function sample(id, value, source = 'unknown', at = Date.now()) {
  const ok = Number.isFinite(value);
  return { id, value: ok ? value : null, unit: METRICS[id]?.unit ?? '', source, at, quality: ok ? 'ok' : 'unavailable' };
}

/**
 * normal, warning, critical or unavailable. Once raised, a level holds until the value falls a few
 * percent below its limit, so a reading on the edge does not make the key blink.
 */
export function classify(s, limits = {}, previous = 'normal', hysteresis = 0) {
  if (!s || s.quality !== 'ok') return 'unavailable';
  const limit = limits[s.id];
  if (!limit) return 'normal';
  const keep = 1 - hysteresis / 100;
  if (s.value >= limit.critical || (previous === 'critical' && s.value >= limit.critical * keep)) return 'critical';
  const raised = previous === 'warning' || previous === 'critical';
  if (s.value >= limit.warning || (raised && s.value >= limit.warning * keep)) return 'warning';
  return 'normal';
}

/** @returns {{ text: string, unit: string }} the unit is shown under the number, except a percent, which stays with it */
export function format(id, value) {
  const metric = METRICS[id];
  if (!metric || !Number.isFinite(value)) return { text: 'N/D', unit: '' };
  const decimals = metric.auto ? (Math.abs(value) < 10 ? 1 : 0) : (metric.decimals ?? 0);
  const text = decimals ? value.toFixed(decimals) : String(Math.round(value));
  return metric.unit === '%' ? { text: `${text}%`, unit: '' } : { text, unit: metric.unit };
}

export function display(s) {
  if (!s || s.quality !== 'ok') return 'N/D';
  const { text, unit } = format(s.id, s.value);
  return unit ? `${text} ${unit}` : text;
}

export class Store {
  /** @param {number} staleMs how long a reading stays good without a new one */
  constructor(staleMs = 5000, { historyEvery = 5000, historySize = 24 } = {}) {
    this.values = new Map();
    this.histories = new Map();
    this.lastPushed = new Map();
    this.staleMs = staleMs;
    this.historyEvery = historyEvery;
    this.historySize = historySize;
  }

  put(items) {
    for (const item of items) {
      if (!item?.id) continue;
      this.values.set(item.id, item);
      if (item.quality !== 'ok') continue;
      const last = this.lastPushed.get(item.id);
      if (last !== undefined && item.at - last < this.historyEvery) continue;
      this.lastPushed.set(item.id, item.at);
      const history = this.histories.get(item.id) ?? [];
      history.push(item.value);
      if (history.length > this.historySize) history.shift();
      this.histories.set(item.id, history);
    }
  }

  get(id, now = Date.now()) {
    const value = this.values.get(id);
    if (!value) return sample(id, null);
    return now - value.at > this.staleMs ? { ...value, value: null, quality: 'stale' } : value;
  }

  history(id) {
    return this.histories.get(id) ?? [];
  }

  /** The provider stopped or failed: its readings are not true any more, and neither is their graph. */
  invalidate(source) {
    for (const [id, metric] of Object.entries(METRICS)) {
      if (metric.source !== source) continue;
      this.values.delete(id);
      this.histories.delete(id);
      this.lastPushed.delete(id);
    }
  }

  /** The most this metric can reach, for its bar and graph. */
  maxOf(id) {
    return METRICS[id]?.max ?? null;
  }
}
