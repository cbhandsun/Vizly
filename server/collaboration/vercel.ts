import { createProductionCollaborationRuntime } from './productionRuntime.js';

const runtime = createProductionCollaborationRuntime(process.env, undefined,
  event => process.stderr.write(JSON.stringify({ component: 'collaboration', event }) + '\n'));
process.once('SIGTERM', () => { void runtime.stop().catch(() => {
  process.stderr.write('Collaboration shutdown failed\n'); process.exitCode = 1;
}); });
export default runtime.http;
