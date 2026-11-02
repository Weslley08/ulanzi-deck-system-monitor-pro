import { HostConnection, silenceConsole } from './host.js';
import { Store } from './core.js';
import { readLhm, readRam, readWindowsCounters, NetworkCounter, pingOnce, PingWindow, readPresentMonCsv } from './providers.js';
import { MonitorActions, PLUGIN_UUID } from './ulanzi.js';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('./defaults.json', import.meta.url), 'utf8'));
silenceConsole();
const api = new HostConnection();
const store = new Store(config.display.staleAfterMs);
const actions = new MonitorActions(api, store, config.thresholds);
const counter = new NetworkCounter();
const ping = new PingWindow(config.ping.windowSize);
const timers = [];
const inFlight = new Set();
const errors = new Map();
let retry = 0;
let reconnectTimer;

function report(label, error) {
  const now = Date.now();
  if (now - (errors.get(label) || 0) < 60_000) return;
  errors.set(label, now);
  process.stderr.write('[System Monitor] ' + label + ': ' + String(error?.message || error).slice(0, 130) + '\n');
}
process.stderr.on('error', () => {});

async function collect(label, task) {
  if (inFlight.has(label)) return;
  inFlight.add(label);
  try {
    const values = await task();
    if (values?.length) { store.put(values); actions.renderAll(); }
  } catch (error) { report(label, error); }
  finally { inFlight.delete(label); }
}
function schedule(label, interval, task) {
  const run = () => void collect(label, task);
  run();
  timers.push(setInterval(run, Math.max(250, interval)));
}
// RAM must remain available even when external sensor providers are offline.
schedule('ram', config.sampleIntervalsMs.hardware, () => readRam());
schedule('lhm', config.sampleIntervalsMs.hardware, () => readLhm(process.env.LHM_JSON_URL || 'http://127.0.0.1:8085/data.json'));
if (process.env.PRESENTMON_CSV) schedule('fps', config.sampleIntervalsMs.fps, () => readPresentMonCsv(process.env.PRESENTMON_CSV));
if (process.platform === 'win32') schedule('network', config.sampleIntervalsMs.network, async () => {
  const count = await readWindowsCounters();
  return count ? counter.update(count) : [];
});
schedule('ping', config.sampleIntervalsMs.ping, async () => ping.update(await pingOnce(process.env.PING_TARGET || config.ping.targets[0], config.ping.timeoutMs)));

api.onAdd(event => actions.upsert(event));
api.onParamFromApp(event => actions.upsert(event));
api.onParamFromPlugin(event => actions.upsert(event));
api.onSetActive(event => actions.setActive(event));
api.onClear(event => actions.clear(event));
// SDK raises both keydown and run for one press: handle only run.
api.onRun(event => {
  try { actions.render(event.context, true); }
  catch (error) { report('run', error); api.showAlert(event.context); }
});
api.onConnected(() => { retry = 0; for (const context of actions.instances.keys()) actions.render(context, true); });
api.onClose(() => {
  if (reconnectTimer || retry >= 10) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    api.reconnect();
  }, Math.min(30000, 1000 * 2 ** retry++));
});
api.onError(error => report('websocket', error));
function shutdown() {
  for (const timer of timers) clearInterval(timer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
api.connect(PLUGIN_UUID);
