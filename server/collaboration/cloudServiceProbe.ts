import { randomUUID } from 'node:crypto';
import type { RoomNoticeBus } from './distributedRoomSync.js';

type ProbeStage = 'atomic-read' | 'subscribe' | 'publish' | 'delivery' | 'dispose';
type ProbeBus = RoomNoticeBus & { stop: () => Promise<void> };
export interface CloudServiceProbeDependencies {
  readMissingRoom: (id: string) => Promise<unknown>;
  createBuses: () => readonly [ProbeBus, ProbeBus];
}
export interface CloudServiceProbeReceipt {
  status: 'passed' | 'failed';
  stage: ProbeStage | 'complete';
  atomicReadAuthorized: boolean;
  privateNoticeDelivered: boolean;
  disposalSucceeded: boolean;
  actualAccountFlowVerified: false;
}

/** Operator diagnostic: random empty-room read and metadata-only private transport. */
export const probeCloudServices = async (dependencies: CloudServiceProbeDependencies): Promise<CloudServiceProbeReceipt> => {
  let stage: ProbeStage = 'atomic-read';
  let atomicReadAuthorized = false; let privateNoticeDelivered = false; let disposalSucceeded = false;
  let buses: readonly [ProbeBus, ProbeBus] | undefined;
  let deliveryTimer: ReturnType<typeof setTimeout> | undefined;
  let failed = false;
  try {
    const roomId = randomUUID();
    if (await dependencies.readMissingRoom(roomId) !== null) throw new Error('Probe room is not empty');
    atomicReadAuthorized = true;
    stage = 'subscribe';
    buses = dependencies.createBuses();
    const notice = { source: randomUUID(), generation: randomUUID(), version: '1' };
    let acceptDelivery: () => void = () => undefined;
    let rejectDelivery: () => void = () => undefined;
    const delivery = new Promise<void>((resolve, reject) => {
      acceptDelivery = resolve;
      rejectDelivery = () => reject(new Error('Probe delivery deadline'));
    });
    // A subscription failure can precede awaiting delivery; keep that rejection handled.
    void delivery.catch(() => undefined);
    await buses[1].subscribe(roomId, input => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return;
      if (Object.keys(input).length === 3 && 'source' in input && input.source === notice.source
        && 'generation' in input && input.generation === notice.generation
        && 'version' in input && input.version === notice.version) acceptDelivery();
    }, () => undefined);
    const sender = await buses[0].subscribe(roomId, () => undefined, () => undefined);
    stage = 'publish';
    // Each subscription has its own bounded admission. Start the existing delivery
    // budget only when both clients can exchange a notification.
    deliveryTimer = setTimeout(rejectDelivery, 8000);
    await sender.publish(notice);
    stage = 'delivery';
    await delivery;
    privateNoticeDelivered = true;
  } catch { failed = true; }
  finally {
    if (deliveryTimer) clearTimeout(deliveryTimer);
    if (buses) {
      const disposal = await Promise.allSettled(buses.map(bus => Promise.resolve().then(() => bus.stop())));
      disposalSucceeded = disposal.every(result => result.status === 'fulfilled');
      if (!disposalSucceeded) { failed = true; stage = 'dispose'; }
    }
  }
  return { status: failed ? 'failed' : 'passed', stage: failed ? stage : 'complete',
    atomicReadAuthorized, privateNoticeDelivered, disposalSucceeded, actualAccountFlowVerified: false };
};
