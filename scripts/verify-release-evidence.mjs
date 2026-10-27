import { verifyPreparedVercelDeployment } from './lib/preparedVercelDeployment.mjs';
import { verifyReleaseEvidence } from './lib/releaseEvidence.mjs';
const [artifactDirectory, manifestPath, projectId, teamId, environment, phase = 'candidate', ...extra] = process.argv.slice(2);
if (extra.length || !manifestPath || !environment) throw Error('Usage: node scripts/verify-release-evidence.mjs ARTIFACT RELEASE_MANIFEST PROJECT_ID TEAM_ID preview|production [candidate|promotion]');
const prepared = await verifyPreparedVercelDeployment({ artifactDirectory, projectId, teamId, environment });
const receipt = await verifyReleaseEvidence({ manifestPath, prepared, phase });
process.stdout.write(JSON.stringify({ action: 'verified-only', ...receipt }) + '\n');
