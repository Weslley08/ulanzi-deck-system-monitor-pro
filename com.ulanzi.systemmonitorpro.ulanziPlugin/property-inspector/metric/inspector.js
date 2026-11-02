// The SDK writes every message to the console, including the settings of the key.
for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = () => {};

const DEFAULTS = { accent: 'auto', graph: true, gpu: 'auto', drive: 'auto' };
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

/** The choices the plugin found, with the one already saved kept even when it is not there now. */
function fillChoices(select, found) {
  const saved = settings[select.dataset.field];
  const options = [...new Set([...found, ...(saved && saved !== 'auto' ? [saved] : [])])];
  const keep = select.querySelector('option[value="auto"]');
  select.replaceChildren(keep, ...options.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name })));
  select.value = saved ?? 'auto';
}

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
  $('#gpuRow').classList.toggle('hidden', payload.group !== 'gpu');
  $('#driveRow').classList.toggle('hidden', payload.group !== 'disk');
  if (payload.group === 'gpu') fillChoices($('#gpu'), payload.gpus ?? []);
  if (payload.group === 'disk') fillChoices($('#drive'), payload.drives ?? []);
  if (payload.version) $('#version').textContent = `System Monitor Pro v${payload.version}`;
});
