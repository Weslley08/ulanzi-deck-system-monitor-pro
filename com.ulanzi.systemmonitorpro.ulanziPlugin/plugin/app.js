import { readFile } from 'node:fs/promises';
import { METRICS, Store } from './core.js';
import { HostConnection, silenceConsole } from './host.js';
import { Monitor } from './monitor.js';
import { clearFaceCache } from './render/renderer.js';
import { MonitorActions, PLUGIN_UUID, metricOfAction } from './ulanzi.js';

const config = JSON.parse(await readFile(new URL('./defaults.json', import.meta.url), 'utf8'));
const { Version: VERSION } = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const MAX_ATTEMPTS = 10;
const REPORT_EVERY_MS = 10 * 60_000;
const TICK_MS = 1000;

silenceConsole();
// Studio prints a plugin's stderr next to its exit code, the only trace left when there is no socket.
// Only short fixed messages go here: never an address, a path or what a provider answered.
const writeLine = (message) => process.stderr.write(`[System Monitor] ${message}\n`);
process.stderr.on('error', () => {});

const api = new HostConnection();
const store = new Store(config.display.staleAfterMs);
const reported = new Map();
const MESSAGES = {
  lhm: 'LibreHardwareMonitor does not answer. Open it as administrator and turn on Options > Remote Web Server > Run; every key but ping and loss reads N/D until then.',
  ping: 'Ping failed; the ping and loss keys read N/D.',
};

function report(source) {
  const now = Date.now();
  if (now - (reported.get(source) ?? 0) < REPORT_EVERY_MS) return;
  reported.set(source, now);
  writeLine(MESSAGES[source] ?? `${source} failed`);
}

const monitor = new Monitor({
  store,
  config,
  report,
  onStatus: () => pushStatus(),
});
const actions = new MonitorActions({
  host: api,
  store,
  thresholds: config.thresholds,
  hysteresis: config.display.hysteresisPercent,
  minUpdateMs: config.display.minUpdateMs,
  t: (key) => api.t(key),
  noteFor: (metric) => monitor.noteFor(metric),
  onChange: reconcile,
});

let ticker = null;
let retry = 0;
let reconnectTimer = null;

/** Providers run, and keys are checked for changes, only while a key on the deck needs them. */
function reconcile() {
  monitor.setDemand(actions.activeMetrics().map((id) => METRICS[id].source));
  if (actions.hasActive() && !ticker) ticker = setInterval(() => actions.renderAll(), TICK_MS);
  if (!actions.hasActive() && ticker) {
    clearInterval(ticker);
    ticker = null;
    clearFaceCache();
  }
  pushStatus();
}

/** The panel only exists while its key is selected, and the host drops messages for the others. */
function pushStatus() {
  for (const [context, instance] of actions.instances) {
    const source = METRICS[instance.metric].source;
    api.sendToPropertyInspector({ type: 'status', metric: instance.metric, source, state: monitor.statusOf(source), version: VERSION }, context);
  }
  actions.renderAll();
}

api.onAdd((event) => actions.upsert(event));
api.onParamFromApp((event) => actions.upsert(event));
api.onParamFromPlugin((event) => actions.upsert(event));
api.onSetActive((event) => actions.setActive(event));
api.onClear((event) => actions.clear(event));
// SDK raises both keydown and run for one press: handle only run.
api.onRun((event) => {
  try {
    void actions.render(event.context, true);
  } catch {
    api.showAlert(event.context);
  }
});
api.onSendToPlugin((event) => {
  if (event.payload?.type === 'hello' && metricOfAction(event.uuid)) pushStatus();
});
api.onConnected(async () => {
  retry = 0;
  await api.localizeUI();
  actions.redrawAll();
});
api.onClose(() => {
  if (reconnectTimer || retry >= MAX_ATTEMPTS) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    api.reconnect();
  }, Math.min(30_000, 1000 * 2 ** retry++));
});
// Without this listener the EventEmitter throws and the process dies. The close event follows.
api.onError(() => {});

function shutdown() {
  if (ticker) clearInterval(ticker);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  monitor.dispose();
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.on('uncaughtException', (error) => writeLine(`unexpected failure: ${error?.name}`));
process.on('unhandledRejection', (error) => writeLine(`unexpected failure: ${error?.name}`));

writeLine(`${VERSION} starting on Node ${process.version}`);
api.connect(PLUGIN_UUID);
