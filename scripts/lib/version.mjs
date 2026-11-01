import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_FOLDER } from './project.mjs';

// Edits the text and not the parsed JSON, because writing JSON back reformats the rest of the file.
// A lockfile holds the version twice at its top, and every dependency's own version further down.
const VERSION_FILES = [
  { path: `${PLUGIN_FOLDER}/manifest.json`, field: 'Version', times: 1 },
  { path: `${PLUGIN_FOLDER}/package.json`, field: 'version', times: 1 },
  { path: `${PLUGIN_FOLDER}/package-lock.json`, field: 'version', times: 2 },
  { path: 'package.json', field: 'version', times: 1 },
  { path: 'package-lock.json', field: 'version', times: 2 },
];

const read = (dir, path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));

export const manifestVersion = (dir) => read(dir, `${PLUGIN_FOLDER}/manifest.json`).Version;

/** @returns {string[]} one line for each file that does not say this version */
export function versionMismatches(dir, version) {
  return VERSION_FILES.flatMap(({ path, field }) => {
    const found = read(dir, path)[field];
    return found === version ? [] : [`${path} says ${found}`];
  });
}

export function setVersion(dir, version) {
  for (const { path, field, times } of VERSION_FILES) {
    let left = times;
    const text = readFileSync(join(dir, path), 'utf8');
    const updated = text.replace(new RegExp(`"${field}":\\s*"[^"]*"`, 'g'), (match) => (left-- > 0 ? `"${field}": "${version}"` : match));
    writeFileSync(join(dir, path), updated);
  }
}
