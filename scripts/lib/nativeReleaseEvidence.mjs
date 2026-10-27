/** Normalize trusted Gitea API metadata plus the receipt emitted by its completed native jobs. */
export const NATIVE_CHECKS = Object.freeze({
  app: ['typecheck', 'lint', 'negative-enforcement', 'test:ci', 'build', 'collaboration:build'],
  core: ['build:sdk', 'typecheck:source', 'typecheck:test-support', 'typecheck:focus-geometry', 'typecheck:build-plugins',
    'lint:source', 'check:package-boundaries', 'check:core-package-contents', 'test'],
});
const systems = { macos: 'Darwin', windows: 'Windows', linux: 'Linux' };
const reject = reason => { throw Error(`Native release evidence: ${reason}`); };
export function nativeReleaseFacts(raw, { identity, repo }) {
  if (!['app', 'core'].includes(repo)) reject('repository role');
  const source = identity?.[repo];
  if (!source || !/^[a-f0-9]{40}$/.test(source.commit ?? '') || !/^[a-f0-9]{40}$/.test(source.tree ?? '')
    || !/^[a-f0-9]{64}$/.test(source.lockSha256 ?? '') || source.clean !== true
    || typeof source.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository)) reject('selected source identity');
  if (raw?.schema !== 'vizly-gitea-native-v1' || raw.provider !== 'gitea' || !source
    || raw.repository !== source.repository || raw.workflow !== 'devfleet-native.yaml') reject('provider or repository');
  const run = raw.run;
  if (!run || typeof run.id !== 'string' || !/^[1-9]\d*$/.test(run.id) || run.head_sha !== source.commit
    || run.status !== 'completed' || run.conclusion !== 'success') reject('run not successful for selected source');
  const required = ['macos', 'windows', 'linux', 'native-complete'];
  if (!Array.isArray(raw.jobs) || raw.jobs.length !== required.length
    || new Set(raw.jobs.map(job => job?.name)).size !== required.length
    || required.some(name => !raw.jobs.some(job => job?.name === name))) reject('incomplete native job set');
  const ids = new Set();
  for (const job of raw.jobs) {
    if (typeof job.id !== 'string' || !/^[1-9]\d*$/.test(job.id) || ids.has(job.id)
      || job.status !== 'completed' || job.conclusion !== 'success') reject('job not successful');
    ids.add(job.id);
    if (job.name === 'native-complete') continue;
    const result = job.native_result;
    if (result?.schema !== 'vizly-native-v2' || result.status !== 'passed' || result.installation_exit_code !== 0 || result.project !== repo || result.scope !== 'native-only'
      || result.deployment !== false || result.os !== systems[job.name] || result.node !== '22.23.4' || result.npm !== '12.0.1') reject('native runtime or receipt');
    if (result.source !== source.commit || result.source_after !== source.commit || result.tree !== source.tree
      || result.tree_after !== source.tree || result.lock_sha256 !== source.lockSha256
      || result.lock_sha256_after !== source.lockSha256
      || !Array.isArray(result.working_tree_before) || result.working_tree_before.length
      || !Array.isArray(result.working_tree_after) || result.working_tree_after.length) reject('native source or lock drift');
    const checks = NATIVE_CHECKS[repo];
    if (!Array.isArray(result.gates) || result.gates.length !== checks.length
      || new Set(result.gates.map(gate => gate?.name)).size !== checks.length
      || checks.some(name => !result.gates.some(gate => gate?.name === name && gate.exit_code === 0
        && typeof gate.seconds === 'number' && Number.isFinite(gate.seconds) && gate.seconds >= 0))) reject('native check missing or failed');
  }
  return required.map(name => ({ id: `${repo}-gitea-${name === 'native-complete' ? 'aggregate' : name}`,
    provider: 'gitea', repository: raw.repository, commit: source.commit, workflow: raw.workflow, runId: run.id,
    jobId: raw.jobs.find(job => job.name === name).id }));
}
