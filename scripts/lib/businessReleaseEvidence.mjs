export const BUSINESS_CHECKS = Object.freeze([
  ['app-database-paths', 'test:database'], ['app-rls', 'test:rls'], ['app-s3', 'test:s3'],
  ['app-collaboration-build', 'collaboration:build'],
  ['app-collaboration-auth-load', 'collaboration:auth-load'],
  ['app-collaboration-mixed-load', 'collaboration:mixed-load'],
]);
export const REQUIRED_BUSINESS_GATES = Object.freeze([
  'app-database-paths', 'app-collaboration-auth-load', 'app-collaboration-mixed-load',
  'app-browser-compatibility',
]);
export const BROWSER_CHECKS = Object.freeze([
  ['app-browser-runtime', 'playwright:install'],
  ['app-browser-main', 'test:e2e:main'], ['app-browser-recovery', 'test:e2e:recovery'],
  ['app-browser-s3', 'test:e2e:s3'], ['app-browser-compatibility', 'test:e2e:compatibility'],
]);
export const businessProfile = id => id === 'app-security' ? 'security' : id.startsWith('app-browser-') ? 'browser' : 'integration';
export const BUSINESS_RELEASE_GATES = Object.freeze([...BUSINESS_CHECKS.map(([id]) => id), 'app-security',
  ...BROWSER_CHECKS.slice(1).map(([id]) => id)]);

const browserPassed = value => value && ['expected', 'unexpected', 'skipped', 'flaky', 'cases'].every(key =>
  Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 100000)
  && value.expected > 0 && value.cases === value.expected && value.unexpected === 0 && value.skipped === 0 && value.flaky === 0
  && typeof value.reportSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.reportSha256);

/** Verify original executor results, not just a passing release wrapper. */
function verifyExecution(raw, identity, profile) {
  const reject = () => { throw Error('Business release evidence: incomplete, failed or mismatched execution'); };
  const source = identity?.app;
  if (!source || source.clean !== true || !/^[a-f0-9]{40}$/.test(source.commit ?? '')
    || !/^[a-f0-9]{40}$/.test(source.tree ?? '') || !/^[a-f0-9]{64}$/.test(source.lockSha256 ?? '')) reject();
  if (raw?.schema !== (profile === 'browser' ? 'vizly-business-v2' : 'vizly-business-v1') || raw.scope !== profile || raw.status !== 'passed'
    || raw.installation_exit_code !== 0 || raw.deployment !== false || raw.os !== 'Linux'
    || raw.node !== '22.23.4' || raw.npm !== '12.0.1') reject();
  if (raw.source !== source.commit || raw.source_after !== source.commit
    || raw.tree !== source.tree || raw.tree_after !== source.tree
    || raw.lock_sha256 !== source.lockSha256 || raw.lock_sha256_after !== source.lockSha256
    || !Array.isArray(raw.working_tree_before) || raw.working_tree_before.length
    || !Array.isArray(raw.working_tree_after) || raw.working_tree_after.length) reject();
  const checks = profile === 'integration' ? BUSINESS_CHECKS : profile === 'browser' ? BROWSER_CHECKS : [['app-security', 'audit:all']];
  if (!Array.isArray(raw.gates) || raw.gates.length !== checks.length
    || new Set(raw.gates.map(gate => gate?.id)).size !== checks.length
    || checks.some(([id, command]) => !raw.gates.some(gate => gate?.id === id && gate.command === command
      && gate.exit_code === 0 && Number.isFinite(gate.seconds) && gate.seconds >= 0
      && (!command.startsWith('test:e2e:') || browserPassed(gate.browser))))) reject();
}

export function verifyBusinessReleaseEvidence(raw, identity) {
  verifyExecution(raw, identity, 'integration');
  return REQUIRED_BUSINESS_GATES.filter(id => businessProfile(id) === 'integration');
}

/** Require the complete successful Gitea run, including security and aggregate. */
export function businessReleaseFacts(raw, { identity }) {
  const reject = () => { throw Error('Business release evidence: invalid CI provenance or incomplete run'); };
  const source = identity?.app;
  if (!source || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository ?? '')
    || raw?.schema !== 'vizly-gitea-business-v1' || raw.provider !== 'gitea'
    || raw.repository !== source.repository || raw.workflow !== 'devfleet-business.yaml') reject();
  const run = raw.run;
  if (!run || !/^[1-9]\d*$/.test(run.id ?? '') || typeof run.id !== 'string'
    || run.head_sha !== source.commit || run.status !== 'completed' || run.conclusion !== 'success') reject();
  const names = ['business-integration', 'business-security', 'business-browser', 'business-complete'];
  if (!Array.isArray(raw.jobs) || raw.jobs.length !== names.length
    || new Set(raw.jobs.map(job => job?.name)).size !== names.length
    || names.some(name => !raw.jobs.some(job => job?.name === name))) reject();
  const ids = new Set();
  for (const job of raw.jobs) {
    if (typeof job.id !== 'string' || !/^[1-9]\d*$/.test(job.id) || ids.has(job.id)
      || job.status !== 'completed' || job.conclusion !== 'success') reject();
    ids.add(job.id);
    if (job.name !== 'business-complete') verifyExecution(job.business_result, identity, job.name.slice('business-'.length));
  }
  return BUSINESS_RELEASE_GATES.map(id => ({ id, provider: 'gitea', repository: source.repository,
    commit: source.commit, workflow: raw.workflow, runId: run.id,
    jobId: raw.jobs.find(job => job.name === `business-${businessProfile(id)}`).id }));
}
