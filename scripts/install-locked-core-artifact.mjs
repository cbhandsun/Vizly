import { installLockedCoreArtifact } from './lib/installLockedCoreArtifact.mjs';

if (process.argv.length !== 3 || !process.argv[2]) throw new Error('Expected one compiled Core artifact path');
try {
  await installLockedCoreArtifact(process.cwd(), process.argv[2]);
  process.stdout.write('Compiled Core installed; locked host dependencies preserved.\n');
} catch {
  process.stderr.write('Compiled Core installation failed; inspect the locked host and artifact.\n');
  process.exitCode = 1;
}
