import { prepareVercelStaticArtifact } from './lib/vercel-static-artifact.mjs';
const [buildDirectory, outputDirectory, projectId, teamId, environment = 'preview', ...options] = process.argv.slice(2);
const productionWebSocketUrl = environment === 'production' ? options.shift() : undefined;
let telemetryIngestUrl;
let telemetryAuthentication = 'none';
let telemetryOrigin;
const usage = 'Usage: node scripts/prepare-vercel-static.mjs BUILD_DIRECTORY NEW_OUTPUT_DIRECTORY PROJECT_ID TEAM_ID [preview|production] [PRODUCTION_WSS_URL] [--telemetry-url HTTPS_INGEST_URL] (required for production) [--telemetry-auth vercel-oidc --telemetry-origin HTTPS_PREVIEW_ORIGIN]';
const seen = new Set();
while (options.length) {
  const flag = options.shift(); const value = options.shift();
  if (!['--telemetry-url', '--telemetry-auth', '--telemetry-origin'].includes(flag)
    || !value || value.startsWith('--') || seen.has(flag)) throw new Error(usage);
  seen.add(flag);
  if (flag === '--telemetry-url') telemetryIngestUrl = value;
  else if (flag === '--telemetry-auth') telemetryAuthentication = value;
  else telemetryOrigin = value;
}
if (!buildDirectory || !outputDirectory || !projectId || !teamId) throw new Error(usage);
const result = await prepareVercelStaticArtifact({ workspace: process.cwd(), buildDirectory, outputDirectory, projectId, teamId, environment, productionWebSocketUrl, telemetryIngestUrl, telemetryAuthentication, telemetryOrigin });
process.stdout.write(JSON.stringify(result) + '\n');
