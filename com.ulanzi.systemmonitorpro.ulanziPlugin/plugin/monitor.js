// Runs each provider only while a key on the deck needs it, and says what state each one is in.
import { METRICS, SOURCES, speedSample } from './core.js';
import { CpuMeter, NvidiaReader, PingWindow, listDrives, pingBurst, readDisks, readLhm, readRam, thermalReader, thermalSamples } from './providers.js';
import { runSpeedTest } from './speedtest.js';

const MIN_EVERY_MS = 250;
const DEFAULT_LHM_URL = 'http://127.0.0.1:8085/data.json';
// A program that is not running should not be asked every second.
const LHM_MAX_EVERY_MS = 15_000;
const RESTART_MIN_MS = 2000;
const RESTART_MAX_MS = 30_000;
// How full a drive is changes slowly, and a drive that is slow to answer should not be asked every second.
const DISK_EVERY_MS = 10_000;
const DRIVES_EVERY_MS = 60_000;
// A speed test moves a lot of data, so a key pressed again right after one does not start another.
const SPEED_NUDGE_GAP_MS = 20_000;

/** For tests and measurements, which stand in for nvidia-smi with another program. Anything unreadable is ignored. */
function extraArgs(text) {
  try {
    const list = JSON.parse(text ?? '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * One task on a timer that never overlaps itself, and slows down while it keeps failing.
 * An `every` of 0 means it runs only when asked to, with `nudge`.
 */
export class Poller {
  #timer = null;
  #stopped = true;
  #running = false;
  #lastRun = 0;
  #delay;

  constructor({ task, every, maxEvery = every, firstDelay = 0, nudgeGapMs = 0, onResult, onError, onBusy = () => {} }) {
    this.task = task;
    this.every = every === 0 ? 0 : Math.max(MIN_EVERY_MS, every);
    this.maxEvery = Math.max(this.every, maxEvery);
    this.firstDelay = firstDelay;
    this.nudgeGapMs = nudgeGapMs;
    this.onResult = onResult;
    this.onError = onError;
    this.onBusy = onBusy;
    this.#delay = this.every;
  }

  start() {
    this.#stopped = false;
    this.#delay = this.every;
    // A run that was on its way when the poller was stopped carries on, and schedules the next one itself.
    if (this.#running) return;
    if (this.every === 0) return;
    if (this.firstDelay > 0) this.#timer = setTimeout(() => void this.#run(), this.firstDelay);
    else void this.#run();
  }

  async #run() {
    this.#timer = null;
    if (this.#running) return;
    this.#running = true;
    this.#lastRun = Date.now();
    this.onBusy(true);
    let again = true;
    try {
      const result = await this.task();
      if (this.#stopped) again = false;
      else {
        this.#delay = this.every;
        this.onResult(result);
      }
    } catch (error) {
      if (this.#stopped) again = false;
      else {
        this.#delay = Math.min(this.maxEvery, this.#delay * 2);
        this.onError(error);
        // A reading this PC cannot give is not asked for again.
        if (error?.code === 'MISSING') {
          this.#stopped = true;
          again = false;
        }
      }
    } finally {
      this.#running = false;
      this.onBusy(false);
    }
    if (again && !this.#stopped && this.every > 0) this.#timer = setTimeout(() => void this.#run(), this.#delay);
  }

  /** Runs now instead of when it is due, unless it is already running or ran a moment ago. */
  nudge() {
    if (this.#stopped || this.#running || Date.now() - this.#lastRun < this.nudgeGapMs) return false;
    clearTimeout(this.#timer);
    void this.#run();
    return true;
  }

  /** A new pace takes effect from now, unless the poller is in the middle of a run. */
  setEvery(every) {
    const next = every === 0 ? 0 : Math.max(MIN_EVERY_MS, every);
    if (next === this.every) return;
    this.every = next;
    this.maxEvery = next;
    this.#delay = next;
    if (this.#stopped || this.#running) return;
    if (next === 0) {
      clearTimeout(this.#timer);
      this.#timer = null;
      return;
    }
    // Still waiting for its first run: that wait stands, unless there was none because it was manual.
    if (this.#lastRun === 0 && this.#timer) return;
    clearTimeout(this.#timer);
    const wait = this.#lastRun === 0 ? this.firstDelay : Math.max(0, next - (Date.now() - this.#lastRun));
    this.#timer = setTimeout(() => void this.#run(), wait);
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}

export class Monitor {
  #pollers = new Map();
  #restarts = new Map();
  #status = new Map();
  #wanted = [];
  #reconciling = false;
  #busy = new Set();
  #intervals = {};

  /**
   * @param {{ store: import('./core.js').Store, config: any, env?: Record<string, string | undefined>,
   *   platform?: string, tasks?: Record<string, () => Promise<any[]> | any[]>,
   *   nvidia?: { start: Function, stop: Function },
   *   report?: (source: string, error: Error) => void, onStatus?: (source: string, status: string) => void }} options
   */
  constructor({ store, config, env = process.env, platform = process.platform, tasks, nvidia, report = () => {}, onStatus = () => {} }) {
    this.store = store;
    this.config = config;
    this.platform = platform;
    this.report = report;
    this.onStatus = onStatus;
    this.lhmUrl = env.LHM_JSON_URL ?? DEFAULT_LHM_URL;
    this.nvidia = nvidia ?? new NvidiaReader({ command: env.NVIDIA_SMI || undefined, args: extraArgs(env.NVIDIA_SMI_ARGS) });
    this.thermal = thermalReader();
    const pingTarget = env.PING_TARGET || config.ping.targets[0];
    const window = new PingWindow(config.ping.windowSize);
    const cpu = new CpuMeter();
    let drives = [];
    let drivesAt = 0;
    let disks = [];
    let disksAt = 0;
    this.tasks = tasks ?? {
      node: async () => {
        const now = Date.now();
        if (now - drivesAt >= DRIVES_EVERY_MS) {
          drives = await listDrives(undefined, platform);
          drivesAt = now;
        }
        if (now - disksAt >= DISK_EVERY_MS) {
          disks = await readDisks(drives);
          disksAt = now;
        }
        // The disks are sent again with each reading, so that they stay fresh between their own, slower, readings.
        return [...cpu.update(), ...readRam(), ...disks.map((disk) => ({ ...disk, at: now }))];
      },
      lhm: () => readLhm(this.lhmUrl),
      ping: async () => window.update(await pingBurst(pingTarget, config.ping.count ?? 1, config.ping.timeoutMs)),
      speed: async () => {
        const { download, upload } = await runSpeedTest({ ...config.speed, baseUrl: env.SPEED_BASE_URL || config.speed?.baseUrl });
        return [speedSample(download, upload)];
      },
      windows: async () => thermalSamples(await this.thermal.ask()),
    };
  }

  /**
   * @param {Iterable<string>} metrics the metrics the keys on the deck read. Each one is read from its first source,
   *   and from the next only while the first cannot answer.
   */
  setDemand(metrics, intervals = {}) {
    this.#wanted = [...metrics];
    this.#intervals = intervals;
    this.#reconcile();
    // A source asked less often must not read N/D in between, so its readings stay good for longer.
    this.store.setStale('ping', this.#every('ping') * 2 + (this.config.ping.count ?? 1) * 1000 + this.config.ping.timeoutMs + 2000);
    for (const source of ['ping', 'speed']) this.#pollers.get(source)?.setEvery(this.#every(source));
  }

  isBusy(source) {
    return this.#busy.has(source);
  }

  /** Runs a source's task now, as when a key is pressed. */
  runNow(source) {
    return this.#pollers.get(source)?.nudge() ?? false;
  }

  #needed() {
    const needed = new Set();
    for (const id of this.#wanted) {
      for (const source of METRICS[id]?.sources ?? []) {
        needed.add(source);
        const status = this.#status.get(source);
        // A source that works, or has not answered yet, is enough. The reserve is asked only when it cannot.
        if (status === undefined || status === 'ok' || status === 'starting') break;
      }
    }
    return needed;
  }

  #reconcile() {
    if (this.#reconciling) return;
    this.#reconciling = true;
    try {
      // Starting a source can change a status at once, so this goes on until nothing changes.
      for (let pass = 0; pass < SOURCES.length + 1; pass += 1) {
        const needed = this.#needed();
        let changed = false;
        for (const source of SOURCES) {
          const running = this.#pollers.has(source) || this.#restarts.has(source) || this.#status.has(source);
          if (needed.has(source) && !running) {
            this.#start(source);
            changed = true;
          } else if (!needed.has(source) && running) {
            this.#stop(source);
            changed = true;
          }
        }
        if (!changed) break;
      }
    } finally {
      this.#reconciling = false;
    }
  }

  statusOf(source) {
    return this.#status.get(source) ?? 'unused';
  }

  snapshot() {
    return Object.fromEntries(SOURCES.map((source) => [source, this.statusOf(source)]));
  }

  /** The source that is the last word on this metric now, and what it says: the last one asked for in its list. */
  describe(metric) {
    const sources = METRICS[metric]?.sources ?? [];
    const asked = sources.filter((source) => this.statusOf(source) !== 'unused');
    const source = asked.at(-1) ?? sources[0];
    return { source, state: this.statusOf(source) };
  }

  /** The short reason a metric has no reading, as a key for the language files. */
  noteFor(metric) {
    const { source, state } = this.describe(metric);
    switch (state) {
      case 'offline': return source === 'lhm' ? 'Needs LHM' : 'No reading';
      case 'missing': return source === 'nvidia' ? 'No NVIDIA' : 'No sensor';
      case 'unconfigured': return 'Not set up';
      case 'ok': return 'No data';
      default:
        if (metric === 'network.speed') return this.#busy.has('speed') ? 'Testing' : 'Press to test';
        return 'Measuring';
    }
  }

  #setStatus(source, status) {
    if (this.#status.get(source) === status) return;
    this.#status.set(source, status);
    this.onStatus(source, status);
    this.#reconcile();
  }

  #every(source) {
    const { sampleIntervalsMs: every } = this.config;
    const chosen = this.#intervals[source];
    const fallback = { node: every.hardware, lhm: every.hardware, ping: every.ping, speed: every.speed ?? 30 * 60_000, windows: every.hardware }[source];
    return Number.isFinite(chosen) && chosen >= 0 ? chosen : fallback;
  }

  #start(source) {
    if (source === 'lhm' && !this.lhmUrl) {
      this.#status.set(source, 'unconfigured');
      this.onStatus(source, 'unconfigured');
      return;
    }
    if ((source === 'nvidia' || source === 'windows') && this.platform !== 'win32') {
      this.#status.set(source, 'missing');
      this.onStatus(source, 'missing');
      return;
    }
    this.#status.set(source, 'starting');
    this.onStatus(source, 'starting');
    if (source === 'nvidia') {
      this.#startNvidia();
      return;
    }
    const every = this.#every(source);
    // A speed test costs data, so one that is already held is not repeated each time the deck changes page.
    const last = source === 'speed' ? this.store.get('network.speed') : null;
    const firstDelay = last?.quality === 'ok' ? Math.max(0, last.at + every - Date.now()) : 0;
    const poller = new Poller({
      task: this.tasks[source],
      every,
      maxEvery: source === 'lhm' ? LHM_MAX_EVERY_MS : every,
      firstDelay,
      nudgeGapMs: source === 'speed' ? SPEED_NUDGE_GAP_MS : 0,
      onBusy: (busy) => { if (busy) this.#busy.add(source); else this.#busy.delete(source); },
      onResult: (values) => {
        if (values.length) this.store.put(values);
        this.#setStatus(source, 'ok');
      },
      onError: (error) => {
        this.store.invalidate(source);
        if (error.code === 'MISSING') {
          this.#setStatus(source, 'missing');
          return;
        }
        this.#setStatus(source, 'offline');
        this.report(source, error);
      },
    });
    this.#pollers.set(source, poller);
    poller.start();
  }

  /** nvidia-smi is a program that stays up, so it is restarted when it stops, unless it is not installed. */
  #startNvidia(wait = RESTART_MIN_MS) {
    this.#restarts.delete('nvidia');
    this.nvidia.start({
      onSamples: (values) => {
        this.store.put(values);
        this.#setStatus('nvidia', 'ok');
      },
      onError: (error) => {
        this.store.invalidate('nvidia');
        if (error.code === 'ENOENT') {
          this.#setStatus('nvidia', 'missing');
          return;
        }
        this.#restarts.set('nvidia', setTimeout(() => this.#startNvidia(Math.min(RESTART_MAX_MS, wait * 2)), wait));
        this.#setStatus('nvidia', 'offline');
        this.report('nvidia', error);
      },
    });
  }

  #stop(source) {
    this.#pollers.get(source)?.stop();
    this.#pollers.delete(source);
    clearTimeout(this.#restarts.get(source));
    this.#restarts.delete(source);
    this.#status.delete(source);
    this.#busy.delete(source);
    // The last speed test is still what the line did, and a new one costs data.
    if (source !== 'speed') this.store.invalidate(source);
    if (source === 'nvidia') this.nvidia.stop();
    if (source === 'windows') this.thermal.stop();
    this.onStatus(source, 'unused');
  }

  dispose() {
    this.#wanted = [];
    for (const source of SOURCES) {
      if (this.#pollers.has(source) || this.#restarts.has(source) || this.#status.has(source)) this.#stop(source);
    }
    this.thermal.stop();
    this.nvidia.stop();
  }
}
