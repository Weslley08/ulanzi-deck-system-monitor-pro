// Raises the version everywhere it is written: npm run bump -- 1.5.0
import { isVersion } from './lib/flow.mjs';
import { root } from './lib/project.mjs';
import { setVersion } from './lib/version.mjs';

const [version] = process.argv.slice(2);
if (!isVersion(version ?? '')) {
  console.error('Usage: npm run bump -- X.Y.Z');
  process.exit(1);
}
setVersion(root, version);
console.log(`Version set to ${version}`);
