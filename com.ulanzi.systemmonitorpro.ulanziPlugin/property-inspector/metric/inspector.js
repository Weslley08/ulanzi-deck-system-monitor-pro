// The SDK writes every message to the console, including the settings of the key.
for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = () => {};

const DEFAULTS = { accent: 'auto', graph: true };
const SAVE_DELAY_MS = 300;

const $ = (selector) => document.querySelector(selector);
const form = $('#property-inspector');
const status = $('#status');

let settings = { ...DEFAULTS };

$UD.connect();

function fields() {
  return [...form.querySelectorAll('[data-field]')];
}

function fillForm() {
  for (const el of fields()) {
    const value = settings[el.dataset.field];
    if (el.type === 'checkbox') el.checked = value === true || value === 'true';
    else el.value = value ?? '';
  }
}

const save = Utils.debounce(() => {
  for (const el of fields()) settings[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
  $UD.sendParamFromPlugin({ ...settings });
}, SAVE_DELAY_MS);

function load(message) {
  if (!message?.param) return;
  settings = { ...DEFAULTS, ...message.param };
  fillForm();
}

/** What the key is waiting for, in the user's words. The plugin sends only the source and its state. */
function showStatus({ source, state }) {
  const shared = { ok: 'Reading.', starting: 'Waiting for the first reading.', unsupported: 'unsupported' };
  status.textContent = $UD.t(shared[state] ?? `${source}.${state}`);
  status.className = `tip ${state === 'ok' ? 'success' : state === 'starting' ? 'info' : 'error'}`;
}

$UD.onConnected(() => {
  if (form.dataset.bound) return;
  form.dataset.bound = 'true';
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  fillForm();
  $UD.sendToPlugin({ type: 'hello' });
});

$UD.onAdd(load);
$UD.onParamFromApp(load);
$UD.onSendToPropertyInspector((message) => {
  const payload = message?.payload;
  if (payload?.type !== 'status') return;
  showStatus(payload);
  if (payload.version) $('#version').textContent = `System Monitor Pro v${payload.version}`;
});
