import { prepareVercelStaticArtifact } from './lib/vercel-static-artifact.mjs';
const [buildDirectory, outputDirectory, projectId, teamId, environment = 'preview', ...options] = process.argv.slice(2);
const productionWebSocketUrl = environment === 'production' ? options.shift() : undefined;
let telemetryIngestUrl;
if (options[0] === '--telemetry-url' && options.length === 2) {
  options.shift(); telemetryIngestUrl = options.shift();
}
if (options.length || !buildDirectory || !outputDirectory || !projectId || !teamId) throw new Error('Usage: node scripts/prepare-vercel-static.mjs BUILD_DIRECTORY NEW_OUTPUT_DIRECTORY PROJECT_ID TEAM_ID [preview|production] [PRODUCTION_WSS_URL] [--telemetry-url HTTPS_INGEST_URL] (required for production)');
const result = await prepareVercelStaticArtifact({ workspace: process.cwd(), buildDirectory, outputDirectory, projectId, teamId, environment, productionWebSocketUrl, telemetryIngestUrl });
process.stdout.write(JSON.stringify(result) + '\n');
