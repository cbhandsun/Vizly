import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import { parseCloudDiagramRevision } from './cloudRevision.js';

export const CLOUD_REVISION_MESSAGE = 6;
const MAX_VECTOR_BYTES = 128 * 1024;
export interface AcceptedCloudRevision { revision: string; vector: Uint8Array }

const readVector = (bytes: Uint8Array): Map<number, number> | null => {
  if (bytes.length === 0 || bytes.length > MAX_VECTOR_BYTES) return null;
  try {
    const decoder = decoding.createDecoder(bytes);
    const count = decoding.readVarUint(decoder);
    if (count > 8192) return null;
    const entries = new Map<number, number>();
    for (let index = 0; index < count; index++) {
      const client = decoding.readVarUint(decoder), clock = decoding.readVarUint(decoder);
      if (client > 0xffffffff || !Number.isSafeInteger(clock) || clock < 1 || entries.has(client)) return null;
      entries.set(client, clock);
    }
    return decoding.hasContent(decoder) ? null : entries;
  } catch { return null; }
};

/** The accepted checkpoint revision is paired with the already sent document. */
export const writeAcceptedCloudRevision = (encoder: encoding.Encoder, revision: string, doc: Y.Doc): void => {
  const vector = Y.encodeStateVector(doc);
  if (!parseCloudDiagramRevision(revision) || !readVector(vector)) throw new Error('Invalid accepted cloud revision');
  encoding.writeVarString(encoder, revision);
  encoding.writeVarUint8Array(encoder, vector);
};
export const readAcceptedCloudRevision = (decoder: decoding.Decoder): AcceptedCloudRevision | null => {
  try {
    const revision = parseCloudDiagramRevision(decoding.readVarString(decoder));
    const vector = decoding.readVarUint8Array(decoder);
    return revision && readVector(vector) && !decoding.hasContent(decoder)
      ? { revision, vector: Uint8Array.from(vector) } : null;
  } catch { return null; }
};
export const hasAcceptedCloudState = (doc: Y.Doc, accepted: AcceptedCloudRevision): boolean => {
  const expected = readVector(accepted.vector);
  if (!expected || expected.size === 0) return false;
  const current = Y.decodeStateVector(Y.encodeStateVector(doc));
  return [...expected].every(([client, clock]) => (current.get(client) ?? 0) >= clock);
};
