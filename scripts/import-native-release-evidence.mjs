import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { nativeReleaseFacts } from './lib/nativeReleaseEvidence.mjs';
import { digest } from './lib/releaseEvidence.mjs';
const [repo, identityPath, rawPath, outputDirectory, ...extra] = process.argv.slice(2);
if (extra.length || !['app', 'core'].includes(repo) || !identityPath || !rawPath || !outputDirectory) {
  throw Error('Usage: node scripts/import-native-release-evidence.mjs app|core IDENTITY_JSON GITEA_EXPORT_JSON NEW_OUTPUT_DIRECTORY');
}
async function input(path) {
  if (/^(?:\.env.*|\.npmrc|\.rustdesk.*|auth\.json)$/i.test(basename(path))) throw Error('Sensitive input path');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw Error('Invalid input file');
  const content = await readFile(path); if (content.length !== info.size) throw Error('Input changed');
  try { return { content, data: JSON.parse(content.toString('utf8')) }; } catch { throw Error('Invalid input JSON'); }
}
const identityFile = await input(identityPath), raw = await input(rawPath);
const identity = identityFile.data.identity ?? identityFile.data;
const facts = nativeReleaseFacts(raw.data, { identity, repo });
const output = resolve(outputDirectory), sha = value => createHash('sha256').update(value).digest('hex');
// Validate every job before creating any successful release report. Existing attempts are never replaced.
await mkdir(output);
await writeFile(join(output, `${repo}-gitea-native.json`), raw.content, { flag: 'wx' });
const gates = [];
for (const fact of facts) {
  const report = { schema: 'vizly-release-gate-v1', ...fact, status: 'passed', exitCode: 0,
    identitySha256: digest(identity), evidence: { path: `${repo}-gitea-native.json`, sha256: sha(raw.content) } };
  const content = JSON.stringify(report, null, 2) + '\n', name = `${fact.id}.json`;
  await writeFile(join(output, name), content, { flag: 'wx' });
  gates.push({ id: fact.id, path: name, sha256: sha(content) });
}
await writeFile(join(output, `${repo}-import.json`), JSON.stringify({ schema: 'vizly-native-import-v1', identitySha256: digest(identity), gates }, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ status: 'imported-native-only', gates: facts.length, repository: facts[0].repository, commit: facts[0].commit, runId: facts[0].runId }) + '\n');
