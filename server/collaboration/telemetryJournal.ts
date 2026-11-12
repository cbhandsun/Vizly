import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { projectTelemetryPayload, type AcceptedTelemetry } from './telemetryPayload.js';
const FILES = 4;
const MAX_BYTES = 1_048_576;
const filename = (directory: string, index: number) => join(directory, `telemetry-${index}.jsonl`);
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
/** One writer per directory. Bounded local journal; deployment must provide a private directory. */
export function createTelemetryJournal(directory: string) {
  let chain = Promise.resolve();
  let pending = 0;
  const write = async (input: unknown, signal: AbortSignal) => {
    if (pending >= 8) throw Error('Telemetry journal busy');
    // Re-project at the persistence boundary even for in-process callers.
    const batch = projectTelemetryPayload(input);
    const record = JSON.stringify({ receivedAt: new Date().toISOString(), batch }) + '\n';
    if (Buffer.byteLength(record) > 32_768) throw Error('Telemetry record too large');
    pending++;
    const operation = chain.then(async () => {
      if (signal.aborted) throw Error('Telemetry write cancelled');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const current = filename(directory, 0);
      let size = 0;
      try { size = (await stat(current)).size; } catch (error) { if (!missing(error)) throw error; }
      if (size + Buffer.byteLength(record) > MAX_BYTES) {
        await rm(filename(directory, FILES - 1), { force: true });
        for (let index = FILES - 2; index >= 0; index--) {
          try { await rename(filename(directory, index), filename(directory, index + 1)); }
          catch (error) { if (!missing(error)) throw error; }
        }
      }
      if (signal.aborted) throw Error('Telemetry write cancelled');
      const file = await open(current, 'a', 0o600);
      try { await file.writeFile(record); await file.sync(); } finally { await file.close(); }
    });
    chain = operation.catch(() => {});
    try { await operation; } finally { pending--; }
  };
  return { accept: write, drain: () => chain };
}
/** Operator-only local lookup, never a public HTTP endpoint. */
export async function queryTelemetryJournal(directory: string, query: { releaseId: string; requestId?: string }) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(query.releaseId)
    || (query.requestId !== undefined && !/^[a-f0-9-]{36}$/.test(query.requestId))) throw Error('Invalid telemetry query');
  const matches: AcceptedTelemetry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < FILES; index++) {
    const path = filename(directory, index);
    let contents: string;
    try {
      if ((await stat(path)).size > MAX_BYTES) throw Error('Telemetry journal exceeds bound');
      contents = await readFile(path, 'utf8');
    } catch (error) { if (missing(error)) continue; throw error; }
    for (const line of contents.split('\n').reverse()) {
      if (!line) continue;
      let batch: AcceptedTelemetry;
      try { batch = projectTelemetryPayload(JSON.parse(line).batch); } catch { continue; }
      const identity = `${batch.streamId}:${batch.sequence}`;
      if (batch.releaseId !== query.releaseId || seen.has(identity)) continue;
      if (query.requestId && !batch.events.some(event => event.requestId === query.requestId)) continue;
      seen.add(identity); matches.push(batch);
      if (matches.length >= 1000) return matches;
    }
  }
  return matches;
}
