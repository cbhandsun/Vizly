import { nativeReleaseFacts } from './nativeReleaseEvidence.mjs';
import { CORE_QUALITY_GATES, coreQualityReleaseFacts } from './coreQualityReleaseEvidence.mjs';
import { CORE_HOST_GATES, coreHostReleaseFacts } from './coreHostReleaseEvidence.mjs';
import { REQUIRED_BUSINESS_GATES, BUSINESS_RELEASE_GATES, businessReleaseFacts } from './businessReleaseEvidence.mjs';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const ENGINEERING_GATES = Object.freeze([
  'core-build', 'core-source-types', 'core-test-support-types', 'core-focus-geometry-types', 'core-build-plugin-types',
  'core-source-lint', 'core-motion-types', 'core-motion-lint', 'core-evidence-types', 'core-evidence-lint', 'core-evidence-unit',
  'core-package-boundaries', 'core-package-contents', 'core-unit', 'core-security',
  ...CORE_HOST_GATES,
  'app-typecheck', 'app-lint', 'app-negative-gates', 'app-unit', 'app-build', 'app-collaboration-build', 'app-security',
  'app-browser-main', 'app-browser-recovery', 'app-rls', 'app-s3', 'app-browser-s3',
  ...REQUIRED_BUSINESS_GATES,
  ...['app', 'core'].flatMap(repo => ['macos', 'windows', 'linux', 'aggregate'].map(os => `${repo}-gitea-${os}`)),
]);
export const PROMOTION_GATES = Object.freeze(['staging-real-accounts', 'staging-multi-instance', 'staging-lifecycle',
  'staging-telemetry', 'rollback-save-reopen-collaboration']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const digest = value => hash(canonical(value));
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const fail = message => { throw Error(`Release evidence: ${message}`); };
const safeName = value => typeof value === 'string' && value.length > 0 && value.length <= 512
  && !value.includes('\\') && !value.includes('\0') && !value.split('/').some(part => !part || part === '.' || part === '..'
    || /^(?:\.env.*|\.npmrc|\.git|\.rustdesk.*|auth\.json)$/i.test(part));
async function safePath(root, name) {
  if (!safeName(name)) fail('unsafe path');
  let path = root;
  for (const part of name.split('/')) {
    path = join(path, part);
    if ((await lstat(path)).isSymbolicLink()) fail('symbolic link');
  }
  return path;
}
async function bytes(root, name, maximum = 2 * 1024 * 1024) {
  const path = await safePath(root, name), metadata = await lstat(path);
  if (!metadata.isFile() || metadata.size > maximum) fail('file budget');
  const value = await readFile(path);
  if (value.length !== metadata.size || value.length > maximum) fail('file changed');
  return value;
}
async function json(root, name) {
  try { return JSON.parse((await bytes(root, name)).toString('utf8')); }
  catch { fail('invalid metadata'); }
}
/** Hash the complete compiled tree, including additions; never follow links. */
export async function compiledTreeDigest(directory) {
  const root = await realpath(directory), inventory = {}; let total = 0, entries = 0;
  async function visit(name = '') {
    for (const entry of await readdir(join(root, name), { withFileTypes: true })) {
      const path = name ? `${name}/${entry.name}` : entry.name;
      if (++entries > 10000 || path.split('/').length > 32) fail('compiled tree budget');
      if (!safeName(path) || entry.isSymbolicLink()) fail('unsafe compiled tree');
      if (entry.isDirectory()) { await visit(path); continue; }
      if (!entry.isFile() || !/\.(?:js|mjs|cjs|json|html|css|wasm|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf)$/i.test(path)) fail('unexpected compiled file');
      const content = await bytes(root, path, 32 * 1024 * 1024); total += content.length;
      if (total > 256 * 1024 * 1024 || Object.keys(inventory).length >= 5000) fail('compiled tree budget');
      inventory[path] = hash(content);
    }
  }
  await visit(); if (!Object.keys(inventory).length) fail('empty compiled tree');
  return digest(inventory);
}
/** Local integrity gate, not a cryptographic CI attestation. Consume only trusted exported CI reports. */
export async function verifyReleaseEvidence({ manifestPath, prepared, phase = 'candidate' }) {
  if (!['candidate', 'promotion'].includes(phase) || typeof manifestPath !== 'string') fail('manifest and phase required');
  if (phase === 'promotion' && prepared.deploymentEnvironment !== 'production') fail('production artifact required for promotion');
  const absolute = resolve(manifestPath), root = await realpath(dirname(absolute));
  const manifest = await json(root, absolute.slice(dirname(absolute).length + 1));
  if (manifest?.schema !== 'vizly-release-v1' || !manifest.identity || !Array.isArray(manifest.gates)) fail('schema');
  const identity = manifest.identity;
  for (const repo of ['app', 'core']) {
    const source = identity[repo];
    if (!source || !commit(source.commit) || !commit(source.tree) || source.clean !== true
      || !hex(source.lockSha256)
      || typeof source.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.repository)) fail('committed source required');
  }
  for (const field of ['sdkSha256', 'frontendSha256', 'backendSha256', 'configurationSha256', 'migrationsSha256']) {
    if (!hex(identity[field])) fail('identity hash');
  }
  if (typeof identity.sdkVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(identity.sdkVersion)) fail('SDK version');
  if (identity.projectId !== prepared.projectId || identity.teamId !== prepared.teamId
    || identity.environment !== prepared.deploymentEnvironment) fail('target mismatch');
  if (await compiledTreeDigest(join(prepared.root, '.vercel/output')) !== identity.frontendSha256) fail('frontend mismatch');
  if (hash(await bytes(root, manifest.sdkArtifact, 64 * 1024 * 1024)) !== identity.sdkSha256) fail('SDK mismatch');
  const backend = await safePath(root, manifest.backendDirectory);
  if (await compiledTreeDigest(backend) !== identity.backendSha256) fail('backend mismatch');
  // Digests of redacted configuration and migration inventory, never secret values.
  if (digest(manifest.configuration) !== identity.configurationSha256 || digest(manifest.migrations) !== identity.migrationsSha256) fail('configuration or migrations mismatch');
  if (!manifest.configuration || !Array.isArray(manifest.migrations) || !manifest.migrations.length
    || manifest.migrations.some(item => !item || typeof item.version !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.version) || !hex(item.sha256))) fail('migration inventory');
  const binding = digest(identity), seen = new Set();
  if (manifest.gates.length > 100) fail('too many gates');
  for (const reference of manifest.gates) {
    if (!reference || typeof reference.id !== 'string' || seen.has(reference.id) || !hex(reference.sha256)) fail('duplicate or invalid gate');
    seen.add(reference.id);
    const reportBytes = await bytes(root, reference.path);
    if (hash(reportBytes) !== reference.sha256) fail('report changed');
    let report; try { report = JSON.parse(reportBytes.toString('utf8')); } catch { fail('report JSON'); }
    if (report?.schema !== 'vizly-release-gate-v1' || report.id !== reference.id || report.status !== 'passed'
      || report.exitCode !== 0 || report.identitySha256 !== binding) fail('gate failed or wrong identity');
    if (!report.evidence || !hex(report.evidence.sha256)) fail('raw evidence mismatch');
    const rawBytes = await bytes(root, report.evidence.path, 32 * 1024 * 1024);
    if (hash(rawBytes) !== report.evidence.sha256) fail('raw evidence mismatch');
    if (BUSINESS_RELEASE_GATES.includes(reference.id)) {
      let raw; try { raw = JSON.parse(rawBytes.toString('utf8')); } catch { fail('business report JSON'); }
      const fact = businessReleaseFacts(raw, { identity }).find(item => item.id === reference.id);
      if (!fact || ['provider', 'repository', 'commit', 'workflow', 'runId', 'jobId'].some(key => report[key] !== fact[key])) fail('business CI provenance');
    }
    if (CORE_QUALITY_GATES.includes(reference.id)) {
      let raw; try { raw = JSON.parse(rawBytes.toString('utf8')); } catch { fail('Core quality report JSON'); }
      const fact = coreQualityReleaseFacts(raw, { identity }).find(item => item.id === reference.id);
      if (!fact || ['provider', 'repository', 'commit', 'workflow', 'runId', 'jobId'].some(key => report[key] !== fact[key])) fail('Core quality CI provenance');
    }
    if (CORE_HOST_GATES.includes(reference.id)) {
      let raw; try { raw = JSON.parse(rawBytes.toString('utf8')); } catch { fail('Core host report JSON'); }
      const fact = coreHostReleaseFacts(raw, { identity }).find(item => item.id === reference.id);
      if (!fact || ['provider', 'repository', 'commit', 'workflow', 'runId', 'jobId'].some(key => report[key] !== fact[key])) fail('Core host CI provenance');
    }
    if (reference.id === 'rollback-save-reopen-collaboration'
      && report.rollbackIdentitySha256 !== digest(manifest.previousCompatible)) fail('rollback evidence mismatch');
    if (reference.id.includes('-gitea-')) {
      const repo = reference.id.startsWith('core-') ? 'core' : 'app';
      let raw; try { raw = JSON.parse(rawBytes.toString('utf8')); } catch { fail('native report JSON'); }
      const fact = nativeReleaseFacts(raw, { identity, repo }).find(item => item.id === reference.id);
      if (!fact || report.runId !== fact.runId || report.jobId !== fact.jobId || report.workflow !== fact.workflow) fail('native run/job mismatch');
      if (report.provider !== 'gitea' || report.repository !== identity[repo].repository
        || report.commit !== identity[repo].commit || typeof report.runId !== 'string' || !/^\d+$/.test(report.runId)
        || typeof report.workflow !== 'string' || !/^[A-Za-z0-9_.-]+\.ya?ml$/.test(report.workflow)) fail('CI provenance');
    }
  }
  for (const id of [...ENGINEERING_GATES, ...(phase === 'promotion' ? PROMOTION_GATES : [])]) {
    if (!seen.has(id)) fail(`missing gate ${id}`);
  }
  if (phase === 'promotion') {
    const previous = manifest.previousCompatible;
    if (!previous || !/^dpl_[A-Za-z0-9]+$/.test(previous.deploymentId) || !hex(previous.releaseIdentitySha256)
      || previous.releaseIdentitySha256 === binding || previous.databaseRollback !== 'additive-compatible') fail('compatible rollback reference');
  }
  return { identitySha256: binding, phase, gates: seen.size, source: { app: identity.app.commit, core: identity.core.commit },
    sdkSha256: identity.sdkSha256, frontendSha256: identity.frontendSha256, backendSha256: identity.backendSha256 };
}
