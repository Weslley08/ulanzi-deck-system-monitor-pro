// Runs each provider only while a key on the deck needs it, and says what state each one is in.
import { METRICS, SOURCES } from './core.js';
import { PingWindow, pingOnce, readLhm } from './providers.js';

const MIN_EVERY_MS = 250;
const DEFAULT_LHM_URL = 'http://127.0.0.1:8085/data.json';
// A program that is not running should not be asked every second.
const LHM_MAX_EVERY_MS = 15_000;

/** One task on a timer that never overlaps itself, and slows down while it keeps failing. */
export class Poller {
  #timer = null;
  #stopped = true;
  #delay;

  constructor({ task, every, maxEvery = every, onResult, onError }) {
    this.task = task;
    this.every = Math.max(MIN_EVERY_MS, every);
    this.maxEvery = Math.max(this.every, maxEvery);
    this.onResult = onResult;
    this.onError = onError;
    this.#delay = this.every;
  }

  start() {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#delay = this.every;
    void this.#run();
  }

  async #run() {
    try {
      const result = await this.task();
      if (this.#stopped) return;
      this.#delay = this.every;
      this.onResult(result);
    } catch (error) {
      if (this.#stopped) return;
      this.#delay = Math.min(this.maxEvery, this.#delay * 2);
      this.onError(error);
    }
    if (!this.#stopped) this.#timer = setTimeout(() => void this.#run(), this.#delay);
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
  }
}

export class Monitor {
  #pollers = new Map();
  #status = new Map();

  /**
   * @param {{ store: import('./core.js').Store, config: any, env?: Record<string, string | undefined>,
   *   tasks?: Record<string, () => Promise<any[]> | any[]>,
   *   report?: (source: string, error: Error) => void, onStatus?: (source: string, status: string) => void }} options
   */
  constructor({ store, config, env = process.env, tasks, report = () => {}, onStatus = () => {} }) {
    this.store = store;
    this.config = config;
    this.report = report;
    this.onStatus = onStatus;
    this.lhmUrl = env.LHM_JSON_URL ?? DEFAULT_LHM_URL;
    const pingTarget = env.PING_TARGET || config.ping.targets[0];
    const window = new PingWindow(config.ping.windowSize);
    this.tasks = tasks ?? {
      lhm: () => readLhm(this.lhmUrl),
      ping: async () => window.update(await pingOnce(pingTarget, config.ping.timeoutMs)),
    };
  }

  /** @param {Iterable<string>} wanted the sources the keys on the deck read from */
  setDemand(wanted) {
    const needed = new Set(wanted);
    for (const source of SOURCES) {
      const running = this.#pollers.has(source) || this.#status.has(source);
      if (needed.has(source) && !running) this.#start(source);
      else if (!needed.has(source) && running) this.#stop(source);
    }
  }

  statusOf(source) {
    return this.#status.get(source) ?? 'unused';
  }

  snapshot() {
    return Object.fromEntries(SOURCES.map((source) => [source, this.statusOf(source)]));
  }

  /** The short reason a metric has no reading, as a key for the language files. */
  noteFor(metric) {
    const source = METRICS[metric]?.source;
    switch (this.statusOf(source)) {
      case 'offline': return source === 'lhm' ? 'LHM closed' : 'No reading';
      case 'unconfigured': return 'Not set up';
      case 'ok': return source === 'lhm' ? 'No sensor' : 'No data';
      default: return 'Measuring';
    }
  }

  #setStatus(source, status) {
    if (this.#status.get(source) === status) return;
    this.#status.set(source, status);
    this.onStatus(source, status);
  }

  #start(source) {
    if (source === 'lhm' && !this.lhmUrl) {
      this.#setStatus(source, 'unconfigured');
      return;
    }
    this.#setStatus(source, 'starting');
    const every = source === 'lhm' ? this.config.sampleIntervalsMs.hardware : this.config.sampleIntervalsMs.ping;
    const poller = new Poller({
      task: this.tasks[source],
      every,
      maxEvery: source === 'lhm' ? LHM_MAX_EVERY_MS : every,
      onResult: (values) => {
        if (values.length) this.store.put(values);
        this.#setStatus(source, 'ok');
      },
      onError: (error) => {
        this.store.invalidate(source);
        this.#setStatus(source, 'offline');
        this.report(source, error);
      },
    });
    this.#pollers.set(source, poller);
    poller.start();
  }

  #stop(source) {
    this.#pollers.get(source)?.stop();
    this.#pollers.delete(source);
    this.#status.delete(source);
    this.store.invalidate(source);
    this.onStatus(source, 'unused');
  }

  dispose() {
    for (const source of SOURCES) if (this.#pollers.has(source) || this.#status.has(source)) this.#stop(source);
  }
}
