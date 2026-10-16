import { resolve } from 'node:path';
import { createSupabaseAuthorizer, createSupabaseOwnerAuthorizer } from './authorization.js';
import { createFilePersistence } from './persistence.js';
import { createCollaborationServer } from './server.js';
import { standardDataToCanvas } from '@vizly/core/canvas-conversion';
import { createCloudRoomSource, createCloudRoomRevisionSource } from './cloudRoomSource.js';
import { createCloudRoomCheckpoint } from './roomBootstrap.js';
import { createActiveRoomCoordinator, createRoomCoordinator } from './roomCoordinator.js';
import { createRoomRecovery } from './roomRecovery.js';

const rawPort = process.env.VIZLY_COLLABORATION_PORT ?? '5420';
const port = Number(rawPort);
const origins = new Set((process.env.VIZLY_COLLABORATION_ORIGINS ?? '').split(',').filter(Boolean));
if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535 || origins.size === 0
  || [...origins].some(origin => { try { return new URL(origin).origin !== origin; } catch { return true; } })) throw new Error('Invalid collaboration runtime configuration');
const persistence = createFilePersistence(resolve(process.env.VIZLY_COLLABORATION_DATA_DIR ?? '.collaboration-data'));
const readCloud = createCloudRoomCheckpoint(createCloudRoomSource(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_PUBLISHABLE_KEY ?? ''), standardDataToCanvas);
const coordinate = createRoomCoordinator(persistence, readCloud);
const readRevision = createCloudRoomRevisionSource(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_PUBLISHABLE_KEY ?? '');
const authorizeOwner = createSupabaseOwnerAuthorizer(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_PUBLISHABLE_KEY ?? '');
const server = createCollaborationServer({
  authorize: createSupabaseAuthorizer(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_PUBLISHABLE_KEY ?? ''),
  persistence,
  recovery: { authorizeOwner, operations: createRoomRecovery({ authorizeOwner, persistence, readCloud,
    readRevision: identity => readRevision(identity.token, identity.diagramId, identity.userId),
  }) },
  loadInitialRoom: coordinate,
  readAcceptedRoomRevision: async diagramId => (await persistence.loadRecord(diagramId))?.checkpoint?.revision,
  coordinateActiveRoom: createActiveRoomCoordinator(persistence, identity =>
    readRevision(identity.token, identity.diagramId, identity.userId), coordinate),
  origins,
  log: event => process.stderr.write(JSON.stringify({ component: 'collaboration', event }) + '\n'),
});
await server.listen(port);
process.stdout.write(JSON.stringify({ component: 'collaboration', status: 'ready', host: '127.0.0.1', port }) + '\n');
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  void server.stop().catch(() => { process.stderr.write('Collaboration shutdown failed\n'); process.exitCode = 1; });
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
