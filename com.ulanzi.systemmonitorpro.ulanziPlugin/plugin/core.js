// What every metric is, how it reads on a key, and the shared store the providers write to.
// A metric lists its sources in order of preference: a reading from the first one that has a fresh one wins, and
// the later ones are asked only when the earlier ones cannot answer.
const def = (group, label, unit, sources, extra = {}) => Object.freeze({ group, label, unit, sources: Object.freeze(sources), ...extra });

/**
 * Every usage is a percentage of use. `max` scales the bar and the graph, and `auto` shows one decimal
 * below 10 and none above. The order here is the order of the actions in the manifest.
 */
export const METRICS = Object.freeze({
  'cpu.usage': def('cpu', 'Usage', '%', ['node'], { max: 100 }),
  'cpu.temperature': def('cpu', 'Temp', '°C', ['windows', 'lhm'], { max: 100 }),
  'gpu.usage': def('gpu', 'Usage', '%', ['nvidia', 'lhm'], { max: 100 }),
  'gpu.temperature': def('gpu', 'Temp', '°C', ['nvidia', 'lhm'], { max: 100 }),
  'gpu.vram.usage': def('gpu', 'VRAM', '%', ['nvidia', 'lhm'], { max: 100 }),
  'ram.usage': def('ram', 'Usage', '%', ['node'], { max: 100 }),
  'network.ping': def('network', 'Ping', 'ms', ['ping'], { max: 200, auto: true }),
  'network.loss': def('network', 'Loss', '%', ['ping'], { max: 100, decimals: 1 }),
  'disk.usage': def('disk', 'Used', '%', ['node'], { max: 100 }),
});

export const GROUPS = Object.freeze({ cpu: 'CPU', gpu: 'GPU', ram: 'RAM', network: 'Net', disk: 'Disk' });
export const SOURCES = Object.freeze(['node', 'ping', 'nvidia', 'windows', 'lhm']);

/** @param {string} scope which graphics card or drive a reading is about, or '' when there is only one */
export function sample(id, value, source = 'unknown', at = Date.now(), scope = '') {
  const ok = Number.isFinite(value);
  return { id, value: ok ? value : null, unit: METRICS[id]?.unit ?? '', source, scope, at, quality: ok ? 'ok' : 'unavailable' };
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

/** A discrete card over an integrated one, because that is the one a game uses. */
const cardRank = (name) => (/nvidia|geforce|quadro|rtx|gtx/i.test(name) ? 0 : /amd|radeon/i.test(name) ? 1 : 2);

/**
 * The scope an "automatic" key reads: the discrete graphics card, or the drive Windows runs from.
 * @param {string} group
 * @param {string[]} scopes the ones that have a reading now
 */
export function autoScope(group, scopes, systemDrive = process.env.SystemDrive ?? 'C:') {
  if (group === 'gpu') return [...scopes].sort((a, b) => cardRank(a) - cardRank(b) || a.localeCompare(b))[0] ?? '';
  if (group === 'disk') return scopes.find((scope) => scope.toUpperCase() === systemDrive.toUpperCase()) ?? [...scopes].sort()[0] ?? '';
  return '';
}

export class Store {
  /** @param {number} staleMs how long a reading stays good without a new one */
  constructor(staleMs = 5000, { historyEvery = 5000, historySize = 24 } = {}) {
    /** @type {Map<string, Map<string, object>>} metric -> "source|scope" -> latest reading */
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
      const scope = item.scope ?? '';
      const bySource = this.values.get(item.id) ?? new Map();
      bySource.set(`${item.source}|${scope}`, { ...item, scope });
      this.values.set(item.id, bySource);
      if (item.quality !== 'ok') continue;
      const key = `${item.id}|${scope}`;
      const last = this.lastPushed.get(key);
      if (last !== undefined && item.at - last < this.historyEvery) continue;
      this.lastPushed.set(key, item.at);
      const history = this.histories.get(key) ?? [];
      history.push(item.value);
      if (history.length > this.historySize) history.shift();
      this.histories.set(key, history);
    }
  }

  /** The reading from the first source, in order of preference, that has a fresh one. Otherwise an unavailable one. */
  get(id, scope = '', now = Date.now()) {
    for (const source of METRICS[id]?.sources ?? []) {
      const found = this.values.get(id)?.get(`${source}|${scope}`);
      if (found && found.quality === 'ok' && now - found.at <= this.staleMs) return found;
    }
    return sample(id, null, 'none', now, scope);
  }

  history(id, scope = '') {
    return this.histories.get(`${id}|${scope}`) ?? [];
  }

  /** Every graphics card or drive that has a fresh reading for this metric, the preferred source's first. */
  scopes(id, now = Date.now()) {
    const found = [];
    for (const source of METRICS[id]?.sources ?? []) {
      for (const reading of this.values.get(id)?.values() ?? []) {
        if (reading.source === source && reading.quality === 'ok' && now - reading.at <= this.staleMs && !found.includes(reading.scope)) found.push(reading.scope);
      }
    }
    return found;
  }

  /** The provider stopped or failed: its readings are not true any more, and neither is a graph only it fed. */
  invalidate(source) {
    for (const [id, bySource] of this.values) {
      for (const [key, reading] of [...bySource]) {
        if (reading.source !== source) continue;
        bySource.delete(key);
        const left = [...bySource.values()].some((other) => other.scope === reading.scope);
        if (!left) {
          this.histories.delete(`${id}|${reading.scope}`);
          this.lastPushed.delete(`${id}|${reading.scope}`);
        }
      }
    }
  }

  /** The most this metric can reach, for its bar and graph. */
  maxOf(id) {
    return METRICS[id]?.max ?? null;
  }
}
