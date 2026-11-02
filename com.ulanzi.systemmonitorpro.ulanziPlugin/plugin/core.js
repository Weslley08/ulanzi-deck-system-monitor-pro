// What every metric is, how it reads on a key, and the shared store the providers write to.
const def = (group, label, unit, source, extra = {}) => Object.freeze({ group, label, unit, source, ...extra });

/**
 * `max` scales the bar and the graph. `maxFrom` takes it from another metric (a card's own VRAM, the PC's RAM).
 * `decimals` is fixed, and `auto` shows one decimal below 10 and none above.
 */
export const METRICS = Object.freeze({
  'cpu.usage': def('cpu', 'Usage', '%', 'lhm', { max: 100 }),
  'cpu.temperature': def('cpu', 'Temp', '°C', 'lhm', { max: 100 }),
  'cpu.clock': def('cpu', 'Clock', 'MHz', 'lhm', { max: 6000 }),
  'cpu.power': def('cpu', 'Power', 'W', 'lhm', { max: 250 }),
  'gpu.usage': def('gpu', 'Usage', '%', 'lhm', { max: 100 }),
  'gpu.temperature': def('gpu', 'Temp', '°C', 'lhm', { max: 100 }),
  'gpu.clock': def('gpu', 'Clock', 'MHz', 'lhm', { max: 3000 }),
  'gpu.power': def('gpu', 'Power', 'W', 'lhm', { max: 450 }),
  'gpu.vram.used': def('gpu', 'VRAM used', 'GB', 'lhm', { decimals: 1, maxFrom: 'gpu.vram.total' }),
  'gpu.vram.total': def('gpu', 'VRAM total', 'GB', 'lhm', { decimals: 1 }),
  'ram.used': def('ram', 'Used', 'GB', 'os', { decimals: 1, maxFrom: 'ram.total' }),
  'ram.total': def('ram', 'Total', 'GB', 'os', { decimals: 1 }),
  'ram.usage': def('ram', 'Usage', '%', 'os', { max: 100 }),
  'fps.current': def('fps', 'Current', 'FPS', 'fps', { max: 240 }),
  'fps.frametime': def('fps', 'Frame time', 'ms', 'fps', { max: 50, decimals: 1 }),
  'network.ping': def('network', 'Ping', 'ms', 'ping', { max: 200, auto: true }),
  'network.jitter': def('network', 'Jitter', 'ms', 'ping', { max: 50, decimals: 1 }),
  'network.loss': def('network', 'Loss', '%', 'ping', { max: 100, decimals: 1 }),
  'network.download': def('network', 'Download', 'Mbps', 'network', { auto: true }),
  'network.upload': def('network', 'Upload', 'Mbps', 'network', { auto: true }),
});

export const GROUPS = Object.freeze({ cpu: 'CPU', gpu: 'GPU', ram: 'RAM', fps: 'FPS', network: 'Net' });
export const SOURCES = Object.freeze(['os', 'lhm', 'network', 'ping', 'fps']);

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
  if (metric.unit === 'MHz' && value >= 1000) return { text: (value / 1000).toFixed(1), unit: 'GHz' };
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

  /** The most this metric can reach, for its bar and graph, or null when it has no scale. */
  maxOf(id) {
    const metric = METRICS[id];
    if (metric?.max) return metric.max;
    const other = metric?.maxFrom ? this.get(metric.maxFrom) : null;
    return other?.quality === 'ok' && other.value > 0 ? other.value : null;
  }
}
