// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { readCoordinationProblem } from './coordinationStatus.js';
describe('content-free coordination status boundary', () => {
  it.each(['cloud-conflict', 'cloud-unavailable'] as const)('accepts exact %s status', status => {
    const encoder = encoding.createEncoder(); encoding.writeVarString(encoder, status);
    expect(readCoordinationProblem(decoding.createDecoder(encoding.toUint8Array(encoder)))).toBe(status);
  });
  it.each(['', 'editor', '<script>fixture</script>', 'x'.repeat(1000)])('rejects unknown status', status => {
    const encoder = encoding.createEncoder(); encoding.writeVarString(encoder, status);
    expect(readCoordinationProblem(decoding.createDecoder(encoding.toUint8Array(encoder)))).toBeNull();
  });
  it('rejects truncated and trailing payloads', () => {
    expect(readCoordinationProblem(decoding.createDecoder(new Uint8Array()))).toBeNull();
    const encoder = encoding.createEncoder(); encoding.writeVarString(encoder, 'cloud-conflict'); encoding.writeVarUint(encoder, 1);
    expect(readCoordinationProblem(decoding.createDecoder(encoding.toUint8Array(encoder)))).toBeNull();
  });
});
