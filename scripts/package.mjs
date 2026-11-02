// Builds dist/<plugin>.zip with the plugin folder at its root, as the store expects.
// An allowlist, not a blocklist: a stray file stays out unless someone adds it here on purpose.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { PLUGIN_FOLDER, pluginDir, zipPath } from './lib/project.mjs';
import { createZip } from './lib/zip.mjs';

const TOP_LEVEL = ['manifest.json', 'package.json', 'THIRD_PARTY_NOTICES.md', 'libs', 'plugin', 'property-inspector', 'resources', 'assets', 'licenses'];
const LANGUAGE_FILE = /^[a-z]{2}(_[A-Z]{2})?\.json$/;
// Docs, types and alternative builds the runtime never loads.
const SKIP_IN_DEPENDENCY = /(^|\/)(README[^/]*|CHANGELOG[^/]*|[^/]+\.d\.ts|index\.min\.js|browser\.js)$/i;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const toZipPath = (full) => relative(pluginDir, full).replaceAll('\\', '/');

function runtimeDependencies() {
  const lock = JSON.parse(readFileSync(join(pluginDir, 'package-lock.json'), 'utf8'));
  return Object.entries(lock.packages)
    .filter(([path, info]) => path.startsWith('node_modules/') && !info.dev && !info.optional)
    .map(([path]) => path);
}

const files = readdirSync(pluginDir).filter((name) => LANGUAGE_FILE.test(name)).map((name) => join(pluginDir, name));

for (const name of TOP_LEVEL) {
  const full = join(pluginDir, name);
  if (!existsSync(full)) throw new Error(`missing from the plugin folder: ${name}`);
  // Type declarations are only read by `npm run typecheck`.
  files.push(...(statSync(full).isDirectory() ? walk(full).filter((file) => !file.endsWith('.d.ts')) : [full]));
}

for (const dependency of runtimeDependencies()) {
  const full = join(pluginDir, dependency);
  if (!existsSync(full)) throw new Error(`${dependency} is not installed. Run: npm run setup`);
  files.push(...walk(full).filter((file) => !SKIP_IN_DEPENDENCY.test(toZipPath(file))));
}

const entries = files.map((file) => ({ name: `${PLUGIN_FOLDER}/${toZipPath(file)}`, data: readFileSync(file) }));
const zip = createZip(entries);
mkdirSync(dirname(zipPath), { recursive: true });
writeFileSync(zipPath, zip);
console.log(`${relative(process.cwd(), zipPath)}: ${entries.length} files, ${(zip.length / 1024 / 1024).toFixed(2)} MB`);
