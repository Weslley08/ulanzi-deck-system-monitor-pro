// Lists the test files explicitly: `node --test <dir>` behaves differently across Node versions.
// With --coverage it also measures the plugin's own code and fails below FLOORS.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { belowFloors, coverageTable, ownFiles, parseLcov, totals } from './lib/coverage.mjs';

// Just under what the tests reached on Windows, the lowest because a plugin killed there writes no coverage.
// Losing tests fails, and small changes do not. Linux, where CI measures, reached 99.3, 94.4 and 98.5.
const FLOORS = { lines: 96, branches: 92, functions: 92 };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => join('tests', name));

const coverage = process.argv.includes('--coverage');
const lcov = join(root, 'coverage', 'lcov.info');
if (coverage) mkdirSync(dirname(lcov), { recursive: true });
const options = coverage
  ? ['--experimental-test-coverage', '--test-reporter=lcov', `--test-reporter-destination=${lcov}`, '--test-reporter=spec', '--test-reporter-destination=stdout']
  : [];

const { status } = spawnSync(process.execPath, [...options, '--test', ...files], { cwd: root, stdio: 'inherit' });
if (!coverage || status !== 0) process.exit(status ?? 1);

const own = ownFiles(parseLcov(readFileSync(lcov, 'utf8')));
const measured = totals(own);
console.log(coverageTable(own));
console.log(`${own.length} files: ${measured.lines.toFixed(1)}% of lines, ${measured.branches.toFixed(1)}% of branches, ${measured.functions.toFixed(1)}% of functions`);
const problems = own.length ? belowFloors(measured, FLOORS) : ['no plugin code was measured'];
for (const problem of problems) console.error(`FAIL ${problem}`);
process.exit(problems.length ? 1 : 0);
