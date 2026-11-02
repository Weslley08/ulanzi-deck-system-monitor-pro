// One object per key on the deck: what its metric reads right now, drawn only when it changed.
import { GROUPS, METRICS, classify, format } from './core.js';
import { ACCENTS, BAR_STEPS, GROUP_ACCENT } from './render/face.js';
import { renderFace } from './render/renderer.js';

export const PLUGIN_UUID = 'com.ulanzi.systemmonitorpro.ulanziPlugin';
const GRAPH_STEPS = 20;
const ACTION_PREFIX = `${PLUGIN_UUID}.`;

/** The panel is a web page: whatever it saves is read as input, never trusted. */
export function normalizeSettings(param) {
  const accent = Object.hasOwn(ACCENTS, param?.accent) ? param.accent : 'auto';
  return { accent, graph: !(param?.graph === false || param?.graph === 'false') };
}

/** The metric an action UUID stands for: "...cpuusage" is cpu.usage. */
export function metricOfAction(uuid) {
  const name = String(uuid ?? '');
  if (!name.startsWith(ACTION_PREFIX)) return null;
  const suffix = name.slice(ACTION_PREFIX.length);
  return Object.keys(METRICS).find((id) => id.replaceAll('.', '') === suffix) ?? null;
}

export class MonitorActions {
  /**
   * @param {{ host: any, store: import('./core.js').Store, thresholds?: Record<string, {warning: number, critical: number}>,
   *   hysteresis?: number, minUpdateMs?: number, t?: (key: string) => string, noteFor?: (metric: string) => string,
   *   onChange?: () => void, render?: (view: object) => Promise<string> }} options
   */
  constructor({ host, store, thresholds = {}, hysteresis = 0, minUpdateMs = 1000, t = (key) => key, noteFor = () => '', onChange = () => {}, render = renderFace }) {
    this.host = host;
    this.store = store;
    this.limits = thresholds;
    this.hysteresis = hysteresis;
    this.minUpdateMs = minUpdateMs;
    this.t = t;
    this.noteFor = noteFor;
    this.onChange = onChange;
    this.renderImage = render;
    /** @type {Map<string, any>} */
    this.instances = new Map();
  }

  upsert(event) {
    const metric = metricOfAction(event.uuid);
    if (!metric) return;
    const previous = this.instances.get(event.context);
    this.instances.set(event.context, {
      metric,
      settings: normalizeSettings(event.param),
      active: previous?.active ?? true,
      level: previous?.level ?? 'normal',
      token: previous?.token ?? 0,
      lastView: null,
      lastSent: 0,
    });
    void this.render(event.context, true);
    this.onChange();
  }

  setActive(event) {
    const instance = this.instances.get(event.context);
    if (!instance) return;
    instance.active = String(event.active) === 'true';
    if (instance.active) void this.render(event.context, true);
    this.onChange();
  }

  /** clear has no message.context: each item in param carries its own. */
  clear(event) {
    for (const item of event.param ?? []) this.instances.delete(item.context);
    this.onChange();
  }

  activeMetrics() {
    return [...this.instances.values()].filter((instance) => instance.active).map((instance) => instance.metric);
  }

  hasActive() {
    return this.activeMetrics().length > 0;
  }

  buildView(instance) {
    const metric = METRICS[instance.metric];
    const reading = this.store.get(instance.metric);
    const state = classify(reading, this.limits, instance.level, this.hysteresis);
    instance.level = state;
    const accent = instance.settings.accent === 'auto' ? GROUP_ACCENT[metric.group] : instance.settings.accent;
    const view = { group: GROUPS[metric.group], sub: this.t(metric.label), accent, state, value: 'N/D' };
    if (state === 'unavailable') return { ...view, note: this.t(this.noteFor(instance.metric)) };

    const { text, unit } = format(instance.metric, reading.value);
    const max = this.store.maxOf(instance.metric);
    view.value = text;
    view.unit = unit;
    view.bar = max ? Math.round(Math.min(1, Math.max(0, reading.value / max)) * BAR_STEPS) : null;
    if (instance.settings.graph) view.graph = this.#graph(instance.metric, max);
    return view;
  }

  #graph(metric, max) {
    const history = this.store.history(metric);
    if (history.length < 2) return null;
    // With no fixed scale, the graph spans its own highest point, so a quiet line still moves.
    const scale = max ?? Math.max(1, ...history);
    return history.map((value) => Math.round(Math.min(1, Math.max(0, value / scale)) * GRAPH_STEPS));
  }

  /** Draws in the background. A face that did not change is not sent again, and none faster than minUpdateMs. */
  async render(context, force = false) {
    const instance = this.instances.get(context);
    if (!instance?.active) return;
    const view = this.buildView(instance);
    const serialized = JSON.stringify(view);
    if (!force && serialized === instance.lastView) return;
    const now = Date.now();
    // Not recorded as sent, so the next pass tries again.
    if (!force && now - instance.lastSent < this.minUpdateMs) return;
    instance.lastView = serialized;
    instance.lastSent = now;
    const token = ++instance.token;
    let icon;
    try {
      icon = await this.renderImage(view);
    } catch (error) {
      this.host.logMessage?.(`render failed: ${error?.name}`, 'error');
      instance.lastView = null;
      return;
    }
    if (token !== instance.token || !instance.active || this.instances.get(context) !== instance) return;
    this.host.setBaseDataIcon(context, icon);
  }

  renderAll() {
    for (const context of this.instances.keys()) void this.render(context);
  }

  redrawAll() {
    for (const context of this.instances.keys()) void this.render(context, true);
  }
}
