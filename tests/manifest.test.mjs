import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { METRICS } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/core.js';
import { metricOfAction } from '../com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/ulanzi.js';
import { ACTIONS, LOCALIZATION } from '../scripts/lib/actions.mjs';
import { PLUGIN_FOLDER, pluginDir } from '../scripts/lib/project.mjs';

const read = (file) => JSON.parse(readFileSync(join(pluginDir, file), 'utf8'));
const manifest = read('manifest.json');

test('there is one action for each metric, in the same order as the names', () => {
  assert.deepEqual(manifest.Actions.map((a) => metricOfAction(a.UUID)), Object.keys(METRICS));
  assert.deepEqual(ACTIONS.map((a) => a.id), Object.keys(METRICS));
});

test('the manifest follows what the store and the SDK ask for', () => {
  assert.equal(manifest.UUID, PLUGIN_FOLDER);
  assert.equal(manifest.UUID.split('.').length, 4);
  assert.ok(manifest.Category.length <= 30);
  assert.ok(manifest.Name.length <= 40 && manifest.Description.length <= 300 && manifest.Detail.length <= 1000);
  assert.deepEqual(manifest.OS.map((os) => os.Platform), ['windows']);
  for (const action of manifest.Actions) {
    assert.ok(action.UUID.split('.').length > 4, action.UUID);
    assert.ok(action.Name.length <= 30, action.Name);
    assert.equal(action.DisableAutomaticStates, true);
    assert.equal(action.SupportedInMultiActions, false);
    for (const file of [action.Icon, action.PropertyInspectorPath, ...action.States.map((s) => s.Image)]) assert.ok(existsSync(join(pluginDir, file)), file);
  }
});

test('the manifest is what the build writes from the one table, so the names cannot drift', () => {
  for (const [i, action] of manifest.Actions.entries()) {
    assert.equal(action.Name, ACTIONS[i].en[0]);
    assert.equal(action.Tooltip, ACTIONS[i].en[1]);
  }
});

test('each language lists the actions in the same order, because Studio matches them by position', () => {
  for (const file of ['en.json', 'pt_BR.json', 'pt_PT.json']) {
    const language = read(file);
    assert.equal(language.Actions.length, manifest.Actions.length, file);
    assert.ok(language.Name && language.Description, file);
    for (const action of language.Actions) assert.ok(action.Name.length <= 30 && action.Tooltip, `${file}: ${action.Name}`);
  }
  assert.deepEqual(read('pt_PT.json'), read('pt_BR.json'));
});

test('every text the keys or the panel show has a Portuguese version', () => {
  const html = readFileSync(join(pluginDir, 'property-inspector', 'metric', 'inspector.html'), 'utf8');
  const keys = new Set([...html.matchAll(/data-localize[^>]*>([^<]+)</g)].map(([, text]) => text.trim()));
  for (const metric of Object.values(METRICS)) keys.add(metric.label);
  for (const note of ['LHM closed', 'No reading', 'Not set up', 'No sensor', 'No NVIDIA', 'No data', 'Measuring', 'Used']) keys.add(note);
  const portuguese = read('pt_BR.json').Localization;
  const missing = [...keys].filter((key) => !(key in portuguese));
  assert.deepEqual(missing, []);
  for (const state of ['lhm.offline', 'lhm.unconfigured', 'nvidia.missing', 'nvidia.offline', 'windows.missing', 'windows.offline', 'node.offline', 'ping.offline']) {
    assert.ok(LOCALIZATION.en[state] && LOCALIZATION.pt[state], state);
  }
});

test('the plugin and the panel use only the SDK files that ship', () => {
  for (const file of ['plugin/ulanzi-api/index.js', 'libs/js/ulanziApi.js', 'libs/css/uspi.css', manifest.Icon, manifest.CategoryIcon, ...manifest.Banner]) {
    assert.ok(existsSync(join(pluginDir, file)), file);
  }
});
