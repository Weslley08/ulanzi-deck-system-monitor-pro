// Checks the zip the consumer actually receives, not the repository: the store's pre-publish
// checklist, a secret scan, and a real start of the unpacked plugin.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { PLUGIN_FOLDER, root, zipPath } from './lib/project.mjs';
import { reportFindings, scanFile } from './lib/secrets.mjs';
import { readZip } from './lib/zip.mjs';

const MAX_SIZE = 50 * 1024 * 1024;
const FORBIDDEN = /(^|\/)(\.env[^/]*|\.git[^/]*|\.npmrc|\.claude|CLAUDE\.md|package-lock\.json|[^/]+\.map|[^/]+\.log|test|scripts|docs|store)(\/|$)/;

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

const zipBytes = readFileSync(zipPath);
const zip = readZip(zipBytes);
const file = (path) => zip.get(`${PLUGIN_FOLDER}/${path}`);
const has = (path) => Boolean(file(path));

function pngSize(data) {
  if (!data || data.toString('latin1', 1, 4) !== 'PNG') return null;
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

check(zipBytes.length <= MAX_SIZE, 'zip is over the 50 MB store limit');
for (const name of zip.keys()) {
  check(name.startsWith(`${PLUGIN_FOLDER}/`), `outside the plugin folder: ${name}`);
  check(!name.includes('..'), `path escapes the folder: ${name}`);
  const inPlugin = name.slice(PLUGIN_FOLDER.length + 1);
  if (!inPlugin.startsWith('node_modules/')) check(!FORBIDDEN.test(inPlugin), `must not ship: ${name}`);
  check(!/\.(exe|dll|node|dylib|so)$/.test(name), `native binary: ${name}`);
}

let manifest;
try {
  manifest = JSON.parse(file('manifest.json').toString('utf8'));
} catch {
  problems.push('manifest.json is missing or is not valid JSON');
}

if (manifest) {
  for (const field of ['Author', 'Name', 'Description', 'Detail', 'Icon', 'Version', 'Category', 'CategoryIcon', 'Banner', 'UUID', 'Type', 'CodePath', 'Actions', 'OS']) {
    check(manifest[field], `manifest: missing ${field}`);
  }
  check(manifest.Type === 'JavaScript', 'manifest: Type must be JavaScript');
  check(/^\d+\.\d+\.\d+$/.test(manifest.Version), 'manifest: Version must be x.y.z');
  check(manifest.UUID.split('.').length === 4, 'manifest: UUID must have 4 segments');
  check(manifest.Inspect === undefined, 'manifest: Inspect opens a debug port and must not ship');
  check(manifest.Software?.MinVersion && !manifest.Software.MinimumVersion, 'manifest: use Software.MinVersion');
  check(has(manifest.CodePath), `manifest: CodePath not in zip: ${manifest.CodePath}`);
  check(manifest.Category.length <= 30, 'manifest: Category over 30 characters');
  check(manifest.Name.length <= 40, 'manifest: Name over the form limit of 40 characters');
  check(manifest.Description.length <= 300, 'manifest: Description over the form limit of 300 characters');
  check(manifest.Detail.length <= 1000, 'manifest: Detail over the form limit of 1000 characters');

  const iconSize = pngSize(file(manifest.Icon));
  check(iconSize?.[0] === 196 && iconSize?.[1] === 196, 'manifest: Icon must be a 196x196 PNG');
  check(has(manifest.CategoryIcon), `missing: ${manifest.CategoryIcon}`);

  check(manifest.Banner.length >= 1 && manifest.Banner.length <= 3, 'manifest: 1 to 3 banners');
  for (const banner of manifest.Banner) {
    const size = pngSize(file(banner));
    check(size && Math.abs(size[0] / size[1] - 1.5) < 0.01, `banner must be 3:2: ${banner}`);
  }

  for (const action of manifest.Actions) {
    check(action.UUID.startsWith(`${manifest.UUID}.`) && action.UUID.split('.').length > 4, `bad action UUID: ${action.UUID}`);
    check(action.Name.length <= 30, `action name over 30 characters: ${action.Name}`);
    check(has(action.Icon), `missing: ${action.Icon}`);
    check(has(action.PropertyInspectorPath), `missing: ${action.PropertyInspectorPath}`);
    check(action.States.length >= 1 && action.States.length <= 2, 'store recommends 1 or 2 states');
    for (const state of action.States) check(has(state.Image), `missing: ${state.Image}`);
  }

  const languages = [...zip.keys()].map((name) => name.slice(PLUGIN_FOLDER.length + 1)).filter((name) => /^[a-z]{2}(_[A-Z]{2})?\.json$/.test(name));
  check(languages.includes('en.json'), 'missing en.json');
  for (const language of languages) {
    const parsed = JSON.parse(file(language).toString('utf8'));
    check(parsed.Name && parsed.Description, `${language}: missing Name or Description`);
    check(parsed.Actions?.length === manifest.Actions.length, `${language}: Actions do not line up with the manifest`);
  }
}

for (const dependency of Object.keys(JSON.parse(file('package.json').toString('utf8')).dependencies)) {
  check(has(`node_modules/${dependency}/package.json`), `dependency not bundled: ${dependency}`);
}
check(has('THIRD_PARTY_NOTICES.md'), 'missing THIRD_PARTY_NOTICES.md');
check(has('plugin/ulanzi-api/LICENSE'), 'SDK license must ship with the SDK');
check(has('libs/LICENSE'), 'SDK license must ship with the SDK');

const secrets = [...zip].flatMap(([name, data]) => scanFile(name, data));
if (secrets.length) {
  reportFindings(secrets);
  problems.push(`${secrets.length} possible secret(s) in the zip`);
}

/** The test nobody else runs: does the plugin start from nothing but the zip's own files? */
async function smokeTest() {
  const dir = mkdtempSync(join(tmpdir(), 'clima-pro-zip-'));
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  let plugin;
  try {
    for (const [name, data] of zip) {
      const target = join(dir, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
    }
    const reachedIcon = new Promise((resolve, reject) => {
      const limit = setTimeout(() => reject(new Error('no key image within 15 s')), 15_000);
      server.on('connection', (socket) => {
        socket.on('message', (raw) => {
          const message = JSON.parse(raw);
          if (message.cmd === 'connected') {
            socket.send(JSON.stringify({ cmd: 'didReceiveGlobalSettings', uuid: manifest.UUID, key: '', actionid: '', settings: { apiKey: 'SMOKETEST0000000' } }));
            socket.send(JSON.stringify({ cmd: 'add', uuid: manifest.Actions[0].UUID, key: '0_0', actionid: 'smoke', param: { theme: 'almanac' } }));
          }
          const image = message.cmd === 'state' ? message.param?.statelist?.[0]?.data : null;
          // The first face is the loading screen; wait for the weather itself.
          if (image?.startsWith('data:image/png;base64,') && image.length > 2000) {
            clearTimeout(limit);
            resolve();
          }
        });
      });
    });
    const fakeFetch = pathToFileURL(join(root, 'test', 'support', 'fake-fetch.mjs')).href;
    plugin = spawn(process.execPath, ['--import', fakeFetch, join(dir, PLUGIN_FOLDER, manifest.CodePath), '127.0.0.1', String(server.address().port), 'en'], { stdio: 'ignore' });
    await Promise.race([reachedIcon, once(plugin, 'exit').then(([code]) => Promise.reject(new Error(`plugin exited with ${code}`)))]);
  } catch (error) {
    problems.push(`unpacked plugin failed to run: ${error.message}`);
  } finally {
    plugin?.kill();
    if (plugin && plugin.exitCode === null) await once(plugin, 'exit');
    for (const client of server.clients) client.terminate();
    server.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (manifest) await smokeTest();

if (problems.length) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`OK ${zip.size} files, ${(zipBytes.length / 1024 / 1024).toFixed(2)} MB, version ${manifest.Version}; the unpacked plugin started and drew a key.`);
