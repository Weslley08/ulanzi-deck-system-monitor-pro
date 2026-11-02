// The SDK is copied into the plugin, so npm audit and Dependabot cannot see it. This pins each file
// to a known upstream commit, catches local edits, and with --upstream reports when Ulanzi publishes changes.
//   node scripts/check-sdk.mjs             verify the copies against sdk-lock.json
//   node scripts/check-sdk.mjs --upstream  also compare the pinned commits with upstream
//   node scripts/check-sdk.mjs --write     record the current copies (only after reviewing an update)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pluginDir, root } from './lib/project.mjs';

const LOCK = join(root, 'sdk-lock.json');
const lock = JSON.parse(readFileSync(LOCK, 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Line endings depend on the machine that checked the files out, and every SDK file is text.
const sha256 = (path) => createHash('sha256').update(readFileSync(path, 'latin1').replaceAll('\r\n', '\n'), 'latin1').digest('hex');

function currentFiles(copy) {
  const dir = join(pluginDir, copy.path);
  return Object.fromEntries(walk(dir).map((file) => [relative(dir, file).replaceAll('\\', '/'), sha256(file)]));
}

if (process.argv.includes('--write')) {
  for (const copy of lock.copies) copy.files = currentFiles(copy);
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  console.log('sdk-lock.json updated. Remember to update the pinned commits too.');
  process.exit(0);
}

const problems = [];
for (const copy of lock.copies) {
  const current = currentFiles(copy);
  for (const [file, hash] of Object.entries(copy.files)) {
    if (!existsSync(join(pluginDir, copy.path, file))) problems.push(`${copy.path}/${file}: deleted`);
    else if (current[file] !== hash) problems.push(`${copy.path}/${file}: differs from upstream ${copy.commit.slice(0, 7)}`);
  }
  for (const file of Object.keys(current)) {
    if (!copy.files[file]) problems.push(`${copy.path}/${file}: not part of the SDK`);
  }
}

if (process.argv.includes('--upstream')) {
  for (const copy of lock.copies) {
    const head = execFileSync('git', ['ls-remote', copy.repo, 'HEAD'], { encoding: 'utf8' }).split(/\s/)[0];
    if (head !== copy.commit) problems.push(`${copy.repo}: upstream moved to ${head.slice(0, 7)}, pinned ${copy.commit.slice(0, 7)}. Review the diff.`);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`SDK copies match the pinned commits (${lock.copies.map((copy) => copy.commit.slice(0, 7)).join(', ')}).`);
