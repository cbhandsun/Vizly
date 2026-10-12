import * as Y from 'yjs';
import { MAX_DOCUMENT_BYTES, validateDocument } from './boundary.js';

/** A shared-store receipt must include every submitted struct and deletion. */
export const acceptPersistedRoomState = (submitted: Uint8Array, receipt: unknown): Uint8Array => {
  const accepted: unknown = receipt === undefined ? submitted : receipt;
  if (!(accepted instanceof Uint8Array) || !accepted.byteLength || accepted.byteLength > MAX_DOCUMENT_BYTES
    || !(submitted instanceof Uint8Array) || !submitted.byteLength || submitted.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error('Invalid room persistence receipt');
  }
  const doc = new Y.Doc();
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, submitted);
    if (!validateDocument(candidate)) throw new Error('Invalid submitted room');
    Y.applyUpdate(doc, accepted);
    if (!validateDocument(doc)) throw new Error('Invalid accepted room');
    const committed = Y.encodeStateAsUpdate(doc);
    Y.applyUpdate(doc, submitted);
    if (!Buffer.from(committed).equals(Buffer.from(Y.encodeStateAsUpdate(doc)))) {
      throw new Error('Room persistence omitted submitted changes');
    }
    return Uint8Array.from(committed);
  } finally {
    candidate.destroy();
    doc.destroy();
  }
};
