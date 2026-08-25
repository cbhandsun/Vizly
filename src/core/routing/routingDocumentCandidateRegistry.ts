import {
  parsePersistedRoutingCandidate,
  parseRoutingOnlyDocumentSnapshot,
  type PersistedRoutingCandidate,
} from './persistedRoutingCandidate';
import { isDisplayRoutingCapabilityEnabled } from './displayRoutingCapabilities';

const MAX_DOCUMENT_ROUTING_CANDIDATES = 16;

const candidateKey = (inputSignature: string, inputGeometryDigest: string): string => (
  `${inputSignature}\u0000${inputGeometryDigest}`
);

const documentRoutingCandidates = new Map<string, PersistedRoutingCandidate>();

const rememberCandidate = (candidate: PersistedRoutingCandidate): void => {
  const key = candidateKey(candidate.inputSignature, candidate.inputGeometryDigest);
  if (documentRoutingCandidates.has(key)) documentRoutingCandidates.delete(key);
  documentRoutingCandidates.set(key, candidate);
  while (documentRoutingCandidates.size > MAX_DOCUMENT_ROUTING_CANDIDATES) {
    const oldestKey = documentRoutingCandidates.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    documentRoutingCandidates.delete(oldestKey);
  }
};

/**
 * Registers an external document snapshot as an untrusted, in-memory candidate.
 * The snapshot is parsed again here so typed callers cannot bypass the runtime
 * boundary. It is never committed or copied into the persistent L0 cache.
 */
export const registerRoutingOnlyDocumentCandidate = (value: unknown): boolean => {
  if (!isDisplayRoutingCapabilityEnabled('routingOnlyDocumentSnapshot')) return false;
  const snapshot = parseRoutingOnlyDocumentSnapshot(value);
  if (!snapshot) return false;
  rememberCandidate(snapshot.candidate);
  return true;
};

export const readRoutingOnlyDocumentCandidate = ({
  routingVersion,
  inputSignature,
  inputGeometryDigest,
}: {
  routingVersion: string;
  inputSignature: string;
  inputGeometryDigest: string;
}): PersistedRoutingCandidate | null => {
  if (!isDisplayRoutingCapabilityEnabled('routingOnlyDocumentSnapshot')) return null;
  const stored = documentRoutingCandidates.get(candidateKey(inputSignature, inputGeometryDigest));
  if (!stored) return null;
  const candidate = parsePersistedRoutingCandidate(stored, {
    routingVersion,
    inputSignature,
    inputGeometryDigest,
  });
  if (!candidate) {
    documentRoutingCandidates.delete(candidateKey(inputSignature, inputGeometryDigest));
    return null;
  }
  rememberCandidate(candidate);
  return candidate;
};

export const clearRoutingOnlyDocumentCandidates = (): void => {
  documentRoutingCandidates.clear();
};
