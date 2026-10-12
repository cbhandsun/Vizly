import { prepareVercelStaticArtifact } from './lib/vercel-static-artifact.mjs';
const [buildDirectory, outputDirectory, projectId, teamId, environment = 'preview', productionWebSocketUrl, ...extra] = process.argv.slice(2);
if (extra.length || !buildDirectory || !outputDirectory || !projectId || !teamId) throw new Error('Usage: node scripts/prepare-vercel-static.mjs BUILD_DIRECTORY NEW_OUTPUT_DIRECTORY PROJECT_ID TEAM_ID [preview|production] [PRODUCTION_WSS_URL]');
const result = await prepareVercelStaticArtifact({ workspace: process.cwd(), buildDirectory, outputDirectory, projectId, teamId, environment, productionWebSocketUrl });
process.stdout.write(JSON.stringify(result) + '\n');
