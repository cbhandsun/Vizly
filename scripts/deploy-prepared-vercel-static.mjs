import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { verifyPreparedVercelDeployment } from './lib/preparedVercelDeployment.mjs';

const [artifactDirectory, projectId, teamId, scope, cliModule, environment = 'preview', ...extra] = process.argv.slice(2);
if (extra.length || !scope || !/^[a-zA-Z0-9-]{1,100}$/.test(scope) || !cliModule) throw new Error('Usage: node scripts/deploy-prepared-vercel-static.mjs ARTIFACT PROJECT_ID TEAM_ID SCOPE VERCEL_CLI_MODULE [preview|production]');
const artifact = await verifyPreparedVercelDeployment({ artifactDirectory, projectId, teamId, environment });
const cliPath = await realpath(cliModule);
process.stdout.write(JSON.stringify({ action: `verified-${artifact.deploymentEnvironment}-deployment`, ...artifact }) + '\n');
const targetFlags = artifact.deploymentEnvironment === 'production' ? ['--prod', '--skip-domain'] : [];
const child = spawn(process.execPath, [cliPath, 'deploy', '--prebuilt', ...targetFlags, '--yes', '--scope', scope], {
  cwd: artifact.root, shell: false, windowsHide: true, stdio: 'inherit',
  env: { ...process.env, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: teamId },
});
process.exitCode = await new Promise((accept, reject) => {
  child.once('error', reject); child.once('exit', code => accept(code ?? 1));
});
