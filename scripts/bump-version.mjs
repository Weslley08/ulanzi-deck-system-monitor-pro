// Raises the version everywhere it is written: npm run bump -- 1.5.0
import { root } from './lib/project.mjs';
import { setVersion } from './lib/version.mjs';

const [version] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run bump -- X.Y.Z');
  process.exit(1);
}
setVersion(root, version);
console.log(`Version set to ${version}`);
