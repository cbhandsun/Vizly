import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { coreHostReleaseFacts } from './lib/coreHostReleaseEvidence.mjs';
import { digest } from './lib/releaseEvidence.mjs';

const [identityPath, rawPath, outputDirectory, ...extra] = process.argv.slice(2);
if (extra.length || !identityPath || !rawPath || !outputDirectory) {
  throw Error('Usage: node scripts/import-core-host-release-evidence.mjs IDENTITY_JSON GITEA_EXPORT_JSON NEW_OUTPUT_DIRECTORY');
}
async function input(path) {
  if (/^(?:\.env.*|\.npmrc|\.rustdesk.*|auth\.json)$/i.test(basename(path))) throw Error('Sensitive input path');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw Error('Invalid input file');
  const content = await readFile(path);
  if (content.length !== info.size) throw Error('Input changed');
  try { return { content, data: JSON.parse(content.toString('utf8')) }; } catch { throw Error('Invalid input JSON'); }
}
const identityFile = await input(identityPath), raw = await input(rawPath);
const identity = identityFile.data.identity ?? identityFile.data;
const facts = coreHostReleaseFacts(raw.data, { identity });
const output = resolve(outputDirectory), sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output);
await writeFile(join(output, 'core-gitea-host.json'), raw.content, { flag: 'wx' });
const gates = [];
for (const fact of facts) {
  const report = { schema: 'vizly-release-gate-v1', ...fact, status: 'passed', exitCode: 0,
    identitySha256: digest(identity), evidence: { path: 'core-gitea-host.json', sha256: sha(raw.content) } };
  const content = JSON.stringify(report, null, 2) + '\n', name = `${fact.id}.json`;
  await writeFile(join(output, name), content, { flag: 'wx' });
  gates.push({ id: fact.id, path: name, sha256: sha(content) });
}
await writeFile(join(output, 'core-host-import.json'), JSON.stringify({ schema: 'vizly-core-host-import-v1',
  identitySha256: digest(identity), gates }, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ status: 'imported-core-host-only', gates: facts.length,
  repository: facts[0].repository, commit: facts[0].commit, runId: facts[0].runId }) + '\n');
