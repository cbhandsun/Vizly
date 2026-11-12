const types = ['node', 'node_modules/@typescript/native/bin/tsc', '--ignoreConfig', '--allowJs', '--checkJs', '--strict', '--noEmit',
  '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--types', 'node'];
const lint = ['node', 'node_modules/eslint/bin/eslint.js', '--no-ignore'];
export const CORE_QUALITY_CHECKS = Object.freeze([
  ['core-motion-types', [...types, 'scripts/lib/display-routing-menu-motion.mjs']],
  ['core-motion-lint', [...lint, 'scripts/lib/display-routing-menu-motion.mjs', 'scripts/lib/display-routing-menu-motion.test.mjs',
    'scripts/lib/display-routing-matrix-layout-command.mjs', '--max-warnings=0']],
  ['core-evidence-types', [...types, 'scripts/lib/ci-evidence-handler.mjs', 'scripts/upload-ci-evidence.mjs']],
  ['core-evidence-lint', [...lint, 'scripts/lib/ci-evidence-handler.mjs', 'scripts/lib/ci-evidence-handler.test.mjs',
    'scripts/lib/ci-evidence-uploader.test.mjs', 'scripts/upload-ci-evidence.mjs', '--max-warnings=0']],
  ['core-evidence-unit', ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'packages/core/vite.config.ts',
    'scripts/lib/ci-evidence-handler.test.mjs', 'scripts/lib/ci-evidence-uploader.test.mjs', '--environment=node', '--pool=forks', '--maxWorkers=1']],
  ['core-security', ['npm', 'run', 'audit:all']],
]);
export const CORE_QUALITY_GATES = Object.freeze(CORE_QUALITY_CHECKS.map(([id]) => id));

export function coreQualityReleaseFacts(raw, { identity }) {
  const reject = () => { throw Error('Core quality release evidence: incomplete, failed or mismatched execution'); };
  const source = identity?.core;
  if (!source || source.clean !== true || !/^[a-f0-9]{40}$/.test(source.commit ?? '')
    || !/^[a-f0-9]{40}$/.test(source.tree ?? '') || !/^[a-f0-9]{64}$/.test(source.lockSha256 ?? '')
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository ?? '')
    || raw?.schema !== 'vizly-gitea-quality-v1' || raw.provider !== 'gitea' || raw.repository !== source.repository
    || raw.workflow !== 'devfleet-quality.yaml') reject();
  if (typeof raw.run?.id !== 'string' || !/^[1-9]\d*$/.test(raw.run.id) || raw.run.head_sha !== source.commit
    || raw.run.status !== 'completed' || raw.run.conclusion !== 'success') reject();
  const names = ['core-quality', 'quality-complete'];
  if (!Array.isArray(raw.jobs) || raw.jobs.length !== 2 || new Set(raw.jobs.map(job => job?.name)).size !== 2
    || names.some(name => !raw.jobs.some(job => job?.name === name))) reject();
  if (raw.jobs.some(job => typeof job.id !== 'string' || !/^[1-9]\d*$/.test(job.id)
    || job.status !== 'completed' || job.conclusion !== 'success') || new Set(raw.jobs.map(job => job.id)).size !== 2) reject();
  const job = raw.jobs.find(item => item.name === 'core-quality'), result = job.quality_result;
  if (result?.schema !== 'vizly-core-quality-v1' || result.scope !== 'quality-only' || result.status !== 'passed'
    || result.installation_exit_code !== 0 || result.deployment !== false || result.os !== 'Linux'
    || result.node !== '22.23.4' || result.npm !== '12.0.1'
    || result.source !== source.commit || result.source_after !== source.commit || result.tree !== source.tree || result.tree_after !== source.tree
    || result.lock_sha256 !== source.lockSha256 || result.lock_sha256_after !== source.lockSha256
    || !Array.isArray(result.working_tree_before) || result.working_tree_before.length
    || !Array.isArray(result.working_tree_after) || result.working_tree_after.length) reject();
  if (!Array.isArray(result.gates) || result.gates.length !== 6 || new Set(result.gates.map(gate => gate?.id)).size !== 6
    || CORE_QUALITY_CHECKS.some(([id, argv]) => !result.gates.some(gate => gate?.id === id && gate.exit_code === 0
      && Number.isFinite(gate.seconds) && gate.seconds >= 0 && JSON.stringify(gate.argv) === JSON.stringify(argv)))) reject();
  return CORE_QUALITY_GATES.map(id => ({ id, provider: 'gitea', repository: source.repository, commit: source.commit,
    workflow: raw.workflow, runId: raw.run.id, jobId: job.id }));
}
