import { randomUUID } from 'node:crypto';
import type { PrivateSubscriptionDiagnostic } from './supabaseRoomNoticeBus.js';

type InstanceEvent = 'server-ready' | 'server-stopping' | 'server-stopped' | 'server-stop-failed'
  | 'runtime-ready' | 'runtime-stopping' | 'runtime-stopped' | 'runtime-stop-failed';
type AdmissionEvent = 'upgrade-started' | 'upgrade-denied' | 'permission-accepted' | 'room-loading'
  | 'room-ready' | 'room-failed' | 'socket-opened' | 'socket-closed' | 'socket-retiring'
  | 'socket-cleanup-complete' | 'expired-credential-rejected' | 'upgrade-failed';
export type RuntimeObservation = Readonly<{
  instanceId: string; elapsedMs: number;
} & ({ event: InstanceEvent; admissionId?: never }
  | { event: AdmissionEvent; admissionId: string }
  | { event: 'private-subscription'; admissionId?: never; status: PrivateSubscriptionDiagnostic['status']; reason: PrivateSubscriptionDiagnostic['reason'] })>;

/** Fresh opaque IDs and fixed categories only: no token, user, room, URL or upstream error. */
export const createRuntimeObservations = (observe?: (sample: RuntimeObservation) => void) => {
  const instanceId = randomUUID();
  const started = performance.now();
  const elapsed = (since: number) => Math.max(0, Math.round(performance.now() - since));
  const emit = (sample: RuntimeObservation) => {
    try { observe?.(Object.freeze(sample)); } catch { /* Diagnostics cannot alter admission or disposal. */ }
  };
  return Object.freeze({
    instanceId,
    event(event: InstanceEvent) { emit({ instanceId, event, elapsedMs: elapsed(started) }); },
    admission() {
      const admissionId = randomUUID(); const since = performance.now();
      return Object.freeze({ admissionId,
        event(event: AdmissionEvent) { emit({ instanceId, admissionId, event, elapsedMs: elapsed(since) }); },
      });
    },
    subscription(diagnostic: PrivateSubscriptionDiagnostic) {
      const status = diagnostic.status === 'SUBSCRIBED' || diagnostic.status === 'CHANNEL_ERROR'
        || diagnostic.status === 'TIMED_OUT' || diagnostic.status === 'CLOSED' ? diagnostic.status : 'unknown';
      const reason = diagnostic.reason === 'none' || diagnostic.reason === 'authentication'
        || diagnostic.reason === 'authorization' || diagnostic.reason === 'transport' ? diagnostic.reason : 'other';
      emit({ instanceId, event: 'private-subscription', status,
        reason, elapsedMs: elapsed(started) });
    },
  });
};
