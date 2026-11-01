// Scanners only catch known shapes. This is a safety net, not a guarantee that nothing leaked.
const PATTERNS = [
  ['WeatherAPI.com key', /\b[0-9a-f]{31,32}\b/],
  ['key in a URL', /[?&]key=(?!\$\{|YOUR|xxx)[A-Za-z0-9]{16,}/i],
  ['saved API key', /["']?apiKey["']?\s*[:=]\s*["'][A-Za-z0-9]{20,}["']/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
];

const BINARY = /\.(png|jpe?g|gif|ico|wasm|woff2?|zip)$/i;
// Commit hashes pinned on purpose. A key in these files would still match the other patterns.
const HASHES_ARE_EXPECTED = /(^|\/)(package-lock\.json|sdk-lock\.json|\.github\/workflows\/[^/]+)$/;
const FORBIDDEN_FILE = /(^|\/)(\.env(\.[^/]*)?|id_rsa|[^/]+\.pem|[^/]+\.p12|[^/]+\.pfx)$/;

/** @returns {{file: string, line: number, type: string}[]} */
export function scanFile(file, data) {
  const path = file.replaceAll('\\', '/');
  if (FORBIDDEN_FILE.test(path)) return [{ file: path, line: 0, type: 'file that must not be shared' }];
  if (BINARY.test(path)) return [];
  const findings = [];
  data.toString('utf8').split('\n').forEach((text, index) => {
    for (const [type, pattern] of PATTERNS) {
      if (type === 'WeatherAPI.com key' && HASHES_ARE_EXPECTED.test(path)) continue;
      if (pattern.test(text)) findings.push({ file: path, line: index + 1, type });
    }
  });
  return findings;
}

export function reportFindings(findings) {
  // The match itself is left out so the scanner does not print the secret into a public CI log.
  for (const { file, line, type } of findings) console.error(`${file}:${line}: ${type}`);
}
