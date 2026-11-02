// A syntax check of the plugin's own code, with no build step because the plugin runs as plain JavaScript.
// The tests import most of it too, but a file only the real host loads (app.js, the panel) is caught here.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pluginDir, root } from './lib/project.mjs';

const SKIP = /(^|\/)(node_modules|ulanzi-api|libs|glyphs)(\/|$)/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const rel = relative(pluginDir, full).replaceAll('\\', '/');
    if (SKIP.test(rel)) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [...walk(join(pluginDir, 'plugin')), ...walk(join(pluginDir, 'property-inspector'))].filter((file) => file.endsWith('.js'));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`${files.length} files have no syntax errors (${relative(root, pluginDir)}).`);
