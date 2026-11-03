// Lists the test files explicitly: `node --test <dir>` behaves differently across Node versions.
// With --coverage it also measures the plugin's own code and fails below FLOORS.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { belowFloors, coverageTable, ownFiles, parseLcov, totals } from './lib/coverage.mjs';

// Initial minimum coverage for the System Monitor prototype; increase with integration tests.
const FLOORS = { lines: 80, branches: 70, functions: 60 };

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

// One file at a time: some tests start PowerShell, nvidia-smi stand-ins or a browser, and run side by side on a CI
// machine with two cores they starve each other, which made a reader that answers in milliseconds miss its limit.
// A test that hangs fails with its name after two minutes, instead of holding CI until its own limit.
const { status } = spawnSync(process.execPath, [...options, '--test-concurrency=1', '--test-timeout=120000', '--test', ...files], { cwd: root, stdio: 'inherit' });
if (!coverage || status !== 0) process.exit(status ?? 1);

const own = ownFiles(parseLcov(readFileSync(lcov, 'utf8')));
const measured = totals(own);
console.log(coverageTable(own));
console.log(`${own.length} files: ${measured.lines.toFixed(1)}% of lines, ${measured.branches.toFixed(1)}% of branches, ${measured.functions.toFixed(1)}% of functions`);
const problems = own.length ? belowFloors(measured, FLOORS) : ['no plugin code was measured'];
for (const problem of problems) console.error(`FAIL ${problem}`);
process.exit(problems.length ? 1 : 0);
