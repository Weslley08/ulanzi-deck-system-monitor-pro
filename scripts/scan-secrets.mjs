// Scans every file git would commit, plus the built zip if there is one.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportFindings, scanFile } from './lib/secrets.mjs';
import { root, zipPath } from './lib/project.mjs';
import { readZip } from './lib/zip.mjs';

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => existsSync(join(root, file)));

const findings = tracked.flatMap((file) => scanFile(file, readFileSync(join(root, file))));
let count = tracked.length;

if (existsSync(zipPath)) {
  for (const [name, data] of readZip(readFileSync(zipPath))) {
    findings.push(...scanFile(`zip:${name}`, data));
    count += 1;
  }
}

if (findings.length) {
  reportFindings(findings);
  console.error(`${findings.length} possible secret(s) found.`);
  process.exit(1);
}
console.log(`No known secret patterns in ${count} files.`);
