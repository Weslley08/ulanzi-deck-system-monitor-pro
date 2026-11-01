// Reads what `node --test --experimental-test-coverage` writes. Node 20 has no thresholds of its own.

const OWN_CODE = /com\.ulanzi\.climapro\.ulanziPlugin\/plugin\//;
// Verbatim SDK copies and generated outlines say nothing about the tests of this project.
const NOT_OURS = /\/(node_modules|ulanzi-api|glyphs)\//;

const COUNTERS = { LF: 'linesFound', LH: 'linesHit', BRF: 'branchesFound', BRH: 'branchesHit', FNF: 'functionsFound', FNH: 'functionsHit' };

/** @returns {{file: string, linesFound: number, linesHit: number, branchesFound: number, branchesHit: number, functionsFound: number, functionsHit: number}[]} */
export function parseLcov(text) {
  const files = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      current = { file: line.slice(3).replaceAll('\\', '/'), linesFound: 0, linesHit: 0, branchesFound: 0, branchesHit: 0, functionsFound: 0, functionsHit: 0 };
    } else if (line === 'end_of_record' && current) {
      files.push(current);
      current = null;
    } else if (current) {
      const [tag, value] = line.split(':');
      if (COUNTERS[tag]) current[COUNTERS[tag]] = Number(value);
    }
  }
  return files;
}

export const ownFiles = (files) => files.filter(({ file }) => OWN_CODE.test(file) && !NOT_OURS.test(file));

const percent = (hit, found) => (found ? (100 * hit) / found : 100);

export function totals(files) {
  const sum = (field) => files.reduce((total, file) => total + file[field], 0);
  return {
    lines: percent(sum('linesHit'), sum('linesFound')),
    branches: percent(sum('branchesHit'), sum('branchesFound')),
    functions: percent(sum('functionsHit'), sum('functionsFound')),
  };
}

/** @returns {string[]} one line for each total below its floor */
export function belowFloors(measured, floors) {
  return Object.entries(floors)
    .filter(([name, floor]) => measured[name] < floor)
    .map(([name, floor]) => `${name} coverage is ${measured[name].toFixed(1)}%, below the floor of ${floor}%`);
}

export function coverageTable(files) {
  const cell = (hit, found) => percent(hit, found).toFixed(1).padStart(6);
  const rows = [...files]
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((row) => `${cell(row.linesHit, row.linesFound)} ${cell(row.branchesHit, row.branchesFound)} ${cell(row.functionsHit, row.functionsFound)}  ${row.file.replace(/^.*\/plugin\//, '')}`);
  return [' lines branch  funcs  file', ...rows].join('\n');
}
