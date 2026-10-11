import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { probeS3Readiness } from './s3ReadinessProbe.mjs';
import { fileURLToPath } from 'node:url';

const fixtureImage = 'vizly-s3-fixture:source-0d7408fc9969';
const fixtureContext = fileURLToPath(new URL('../../integration/fixtures/minio/', import.meta.url));

export function prepareIsolatedS3Fixture() {
  const result = spawnSync('docker', ['build', '--tag', fixtureImage, fixtureContext], {
    encoding: 'utf8', timeout: 600000, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('Isolated S3 source fixture build failed');
}

/** @param {unknown} mode */
export async function runIsolatedS3Integration(mode) {
  if (mode !== 'service' && mode !== 'browser') throw new Error('Invalid isolated S3 integration mode');
  prepareIsolatedS3Fixture();
  const container = `vizly-s3-${mode}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const image = fixtureImage;
  const accessKey = `vizly${randomBytes(12).toString('hex')}`;
  const secretKey = randomBytes(32).toString('hex');
  const dockerEnv = { ...process.env, MINIO_ROOT_USER: accessKey, MINIO_ROOT_PASSWORD: secretKey };
  /** @param {string[]} args */
  const docker = args => {
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60000, env: dockerEnv, windowsHide: true });
    if (result.error || result.status !== 0) throw new Error('Isolated S3 Docker operation failed');
    return result.stdout.trim();
  };
  let containerId;
  try {
    containerId = docker(['run', '--detach', '--name', container, '--publish', '127.0.0.1::9000', '--tmpfs', '/data',
      '--env', 'MINIO_ROOT_USER', '--env', 'MINIO_ROOT_PASSWORD', image, 'server', '/data']);
    if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Invalid isolated S3 container identity');
    const mapping = docker(['port', containerId, '9000/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(mapping)) throw new Error('Isolated S3 port mapping is invalid');
    const endpoint = `http://${mapping}`;
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await probeS3Readiness(endpoint)) { ready = true; break; }
      await setTimeout(500);
    }
    if (!ready) throw new Error('Isolated S3 service did not become ready');
    const command = mode === 'service'
      ? ['node_modules/vitest/vitest.mjs', 'run', '--config', 'integration/vitest.config.ts']
      : ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.s3.config.ts'];
    const result = spawnSync(process.execPath, command, {
      stdio: 'inherit', timeout: mode === 'service' ? 120000 : 240000, windowsHide: true,
      env: { ...process.env, VIZLY_S3_TEST_ENDPOINT: endpoint, VIZLY_S3_TEST_ACCESS_KEY: accessKey, VIZLY_S3_TEST_SECRET_KEY: secretKey },
    });
    if (result.error || result.status !== 0) throw new Error('Isolated S3 integration gate failed');
  } finally {
    if (containerId && /^[a-f0-9]{64}$/.test(containerId)) docker(['rm', '--force', containerId]);
  }
}
