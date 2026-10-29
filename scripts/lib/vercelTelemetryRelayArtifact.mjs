import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseTelemetryIngestUrl } from './vercelDeploymentEnvironment.mjs';

const functionRoot = 'functions/__vizly_telemetry_relay.func';
const configuration = { runtime: 'nodejs24.x', handler: 'index.js', launcherType: 'Nodejs',
  shouldAddHelpers: false, maxDuration: 10 };
const packageConfiguration = { private: true, type: 'commonjs', engines: { node: '24.x' } };
/** @typedef {{authentication: 'vercel-oidc', origin: string, ingestUrl: string}} RelayOptions */
/** @typedef {RelayOptions & {files: {name: string, sha256: string}[]}} RelayReceipt */
/** @param {Uint8Array} value */
const hash = value => createHash('sha256').update(value).digest('hex');

/** @param {{environment: unknown, authentication?: unknown, origin?: unknown, ingestUrl?: unknown}} options
 * @returns {RelayOptions | undefined}
 */
export function parseTelemetryRelayOptions({ environment, authentication = 'none', origin, ingestUrl }) {
  if (authentication === 'none') {
    if (origin !== undefined) throw new Error('Telemetry relay origin requires workload authentication');
    return undefined;
  }
  if (authentication !== 'vercel-oidc' || environment !== 'preview' || typeof origin !== 'string'
    || !ingestUrl) throw new Error('Invalid protected Preview telemetry relay');
  parseTelemetryIngestUrl(origin + '/telemetry');
  if (new URL(origin).origin !== origin) throw new Error('Invalid telemetry relay origin');
  return { authentication, origin, ingestUrl: parseTelemetryIngestUrl(ingestUrl) };
}

/** Compile server code independently; no workload credential is read while preparing assets.
 * @param {string} output
 * @param {RelayOptions} options
 * @returns {Promise<RelayReceipt>}
 */
export async function prepareTelemetryRelay(output, options) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../../server/collaboration/telemetryRelayVercel.ts', import.meta.url))],
    bundle: true, platform: 'node', target: 'node24', format: 'cjs', write: false,
    minify: true, sourcemap: false, legalComments: 'none',
    define: { 'process.env.VIZLY_TELEMETRY_RELAY_ORIGIN': JSON.stringify(options.origin),
      'process.env.VIZLY_TELEMETRY_RELAY_INGEST': JSON.stringify(options.ingestUrl) },
  });
  if (result.outputFiles.length !== 1) throw new Error('Unexpected telemetry relay build output');
  const files = [
    { name: functionRoot + '/index.js', bytes: result.outputFiles[0].contents },
    { name: functionRoot + '/.vc-config.json', bytes: Buffer.from(JSON.stringify(configuration, null, 2)) },
    { name: functionRoot + '/package.json', bytes: Buffer.from(JSON.stringify(packageConfiguration, null, 2)) },
  ];
  for (const file of files) {
    if (file.bytes.length > 2 * 1024 * 1024) throw new Error('Telemetry relay artifact exceeds budget');
    const destination = join(output, '.vercel/output', file.name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes, { flag: 'wx' });
  }
  return { ...options, files: files.map(file => ({ name: file.name, sha256: hash(file.bytes) })) };
}

/** @param {string} root @param {RelayReceipt} receipt @param {RelayOptions} options */
export async function verifyTelemetryRelay(root, receipt, options) {
  if (!receipt || !isDeepStrictEqual({ authentication: receipt.authentication,
    origin: receipt.origin, ingestUrl: receipt.ingestUrl }, options)
    || !Array.isArray(receipt.files) || receipt.files.length !== 3) throw new Error('Invalid telemetry relay receipt');
  const expected = [functionRoot + '/index.js', functionRoot + '/.vc-config.json', functionRoot + '/package.json'];
  for (const [index, name] of expected.entries()) {
    const file = receipt.files[index];
    if (file?.name !== name || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error('Invalid telemetry relay inventory');
    }
    const path = join(root, '.vercel/output', name);
    const resolved = await realpath(path);
    const location = relative(root, resolved);
    if (!location || isAbsolute(location) || location === '..' || location.startsWith('../')
      || location.startsWith('..\\')) throw new Error('Telemetry relay artifact escaped upload root');
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.size > 2 * 1024 * 1024
      || hash(await readFile(path)) !== file.sha256) throw new Error('Telemetry relay artifact changed');
  }
  const actual = JSON.parse(await readFile(join(root, '.vercel/output', expected[1]), 'utf8'));
  if (!isDeepStrictEqual(actual, configuration)) throw new Error('Telemetry relay runtime configuration changed');
  const actualPackage = JSON.parse(await readFile(join(root, '.vercel/output', expected[2]), 'utf8'));
  if (!isDeepStrictEqual(actualPackage, packageConfiguration)) throw new Error('Telemetry relay package configuration changed');
  return expected.map(name => '.vercel/output/' + name);
}
