import { standardDataToCanvas } from '@vizly/core/canvas-conversion';
import { createSupabaseRoomRuntime } from './supabaseRoomRuntime.js';
import { parseProductionCollaborationConfiguration } from './productionConfiguration.js';
import { createSupabaseAuthorizer, createSupabaseOwnerAuthorizer, type AuthorizeDiagram } from './authorization.js';
import { createCloudRoomSource, createCloudRoomRevisionSource } from './cloudRoomSource.js';
import { createCloudRoomCheckpoint, type BootstrapIdentity } from './roomBootstrap.js';
import type { RoomCheckpoint } from './roomCheckpoint.js';
import { createRoomCoordinator, createActiveRoomCoordinator } from './roomCoordinator.js';
import { createRoomRecovery } from './roomRecovery.js';
import { createCollaborationServer, type CollaborationServerOptions } from './server.js';

export interface ProductionCollaborationDependencies {
  runtime: Pick<ReturnType<typeof createSupabaseRoomRuntime>, 'persistence' | 'acquireRoomLease' | 'openRoomSynchronization' | 'stop'>;
  authorize: AuthorizeDiagram;
  authorizeOwner: AuthorizeDiagram;
  readCloud: (identity: BootstrapIdentity) => Promise<RoomCheckpoint>;
  readRevision: (identity: BootstrapIdentity) => Promise<string>;
}
/** Composition only: durable admission, authorization, synchronization and recovery share one lifecycle. */
export const createProductionCollaborationRuntime = (environment: Record<string, unknown>,
  supplied?: ProductionCollaborationDependencies, log?: CollaborationServerOptions['log']) => {
  const config = parseProductionCollaborationConfiguration(environment);
  const dependencies = supplied ?? (() => {
    const readRevision = createCloudRoomRevisionSource(config.supabaseUrl, config.publishableKey);
    return {
      runtime: createSupabaseRoomRuntime(config.supabaseUrl, config.serverKey),
      authorize: createSupabaseAuthorizer(config.supabaseUrl, config.publishableKey),
      authorizeOwner: createSupabaseOwnerAuthorizer(config.supabaseUrl, config.publishableKey),
      readCloud: createCloudRoomCheckpoint(createCloudRoomSource(config.supabaseUrl, config.publishableKey), standardDataToCanvas),
      readRevision: (identity: BootstrapIdentity) => readRevision(identity.token, identity.diagramId, identity.userId),
    };
  })();
  const { runtime, authorize, authorizeOwner, readCloud, readRevision } = dependencies;
  const coordinate = createRoomCoordinator(runtime.persistence, readCloud);
  const server = createCollaborationServer({ authorize, origins: config.origins, log,
    persistence: runtime.persistence, acquireRoomLease: runtime.acquireRoomLease,
    openRoomSynchronization: runtime.openRoomSynchronization,
    loadInitialRoom: coordinate,
    readAcceptedRoomRevision: async id => (await runtime.persistence.loadRecord(id))?.checkpoint?.revision,
    coordinateActiveRoom: createActiveRoomCoordinator(runtime.persistence, readRevision, coordinate),
    recovery: { authorizeOwner, operations: createRoomRecovery({ authorizeOwner, persistence: runtime.persistence, readCloud, readRevision }) },
  });
  let stopping: Promise<void> | undefined; let serverStopping: Promise<void> | undefined;
  return { ...server,
    stop() {
      if (stopping) return stopping;
      stopping = Promise.resolve().then(async () => {
        const servers = await Promise.allSettled([serverStopping]);
        const stores = await Promise.allSettled([Promise.resolve().then(() => runtime.stop())]);
        if ([...servers, ...stores].some(result => result.status === 'rejected')) throw new Error('Production collaboration disposal failed');
      });
      // Fence requests immediately; finish their cleanup before disposing shared stores.
      try { serverStopping = server.stop(); }
      catch { serverStopping = Promise.reject(new Error('Production collaboration disposal failed')); }
      return stopping;
    },
  };
};
