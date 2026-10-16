import { randomUUID } from 'node:crypto';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_VALUES = 100_000;

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Checkpoint must be a plain JSON object');
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value */
function serialize(value) {
  record(value);
  /** @type {unknown[]} */
  const pending = [value];
  const visited = new Set();
  let count = 0;
  while (pending.length) {
    const item = pending.pop();
    if (++count > MAX_VALUES) throw new RangeError('Checkpoint structure exceeds budget');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
    if (typeof item === 'number' && Number.isFinite(item)) continue;
    if (typeof item !== 'object') throw new TypeError('Checkpoint contains a non-JSON value');
    if (visited.has(item)) throw new TypeError('Checkpoint must not contain repeated references');
    visited.add(item);
    if (!Array.isArray(item)) record(item);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue;
      if (descriptor.get || descriptor.set || key === 'toJSON'
        || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new TypeError('Checkpoint contains an unsafe JSON property');
      }
      pending.push(descriptor.value);
    }
  }
  const bytes = Buffer.from(JSON.stringify(value) + '\n');
  if (bytes.length > MAX_BYTES) throw new RangeError('Checkpoint exceeds byte budget');
  return bytes;
}

/** @param {unknown} directory @param {unknown} fileName */
async function location(directory, fileName) {
  if (typeof directory !== 'string' || directory.length > 32_768
    || !isAbsolute(directory) || [...directory].some(character => character.charCodeAt(0) < 32)
    || /^(?:\\\\|\/\/)/.test(directory)
    || typeof fileName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$/.test(fileName)) {
    throw new TypeError('Invalid checkpoint location');
  }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new TypeError('Checkpoint directory must be owned and regular');
  const root = await realpath(directory);
  const path = join(root, fileName);
  try {
    const existing = await lstat(path);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new TypeError('Checkpoint must be a regular file');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  return { root, path, fileName };
}

/**
 * Readers observe the previous complete checkpoint or the new complete one.
 * Write failures leave the previous checkpoint intact; only this writer's
 * exclusively created temporary file can be removed during cleanup.
 * @param {unknown} directory @param {unknown} fileName @param {unknown} value
 */
export async function writeJsonCheckpointAtomic(directory, fileName, value) {
  const bytes = serialize(value);
  const target = await location(directory, fileName);
  const temporary = join(target.root, `.${target.fileName}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  let replaced = false;
  try {
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    for (let attempt = 0; ; attempt += 1) {
      try { await rename(temporary, target.path); break; }
      catch (error) {
        if (process.platform !== 'win32' || attempt === 2 || !(error instanceof Error)
          || !('code' in error) || !['EPERM', 'EBUSY'].includes(String(error.code))) throw error;
        await new Promise(accept => setTimeout(accept, 20 * (attempt + 1)));
      }
    }
    replaced = true;
  } finally {
    if (!replaced) await unlink(temporary);
  }
}

/**
 * A legacy non-atomic producer may briefly truncate its checkpoint. Retry only
 * syntax failures while its explicitly supplied writer process is live; stable
 * corruption, absent/dead writers and exhausted attempts always reject.
 * @param {unknown} directory @param {unknown} fileName @param {unknown} [liveWriterPid]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJsonCheckpoint(directory, fileName, liveWriterPid) {
  if (liveWriterPid !== undefined && (typeof liveWriterPid !== 'number'
    || !Number.isInteger(liveWriterPid) || liveWriterPid <= 0 || liveWriterPid > 2_147_483_647)) {
    throw new TypeError('Invalid checkpoint writer identity');
  }
  const target = await location(directory, fileName);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const handle = await open(target.path, 'r');
    let bytes;
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new TypeError('Checkpoint must be a regular file');
      if (info.size > MAX_BYTES) throw new RangeError('Checkpoint exceeds byte budget');
      const buffer = Buffer.alloc(info.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      if (offset > info.size) throw new SyntaxError('Checkpoint changed during bounded read');
      bytes = buffer.subarray(0, offset);
    } finally { await handle.close(); }
    /** @type {unknown} */
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); }
    catch {
      if (typeof liveWriterPid !== 'number' || attempt === 2) throw new SyntaxError('Checkpoint JSON is incomplete or invalid');
      try { process.kill(liveWriterPid, 0); }
      catch { throw new SyntaxError('Checkpoint JSON is invalid and its writer is not live'); }
      await new Promise(accept => setTimeout(accept, 20 * (attempt + 1)));
      continue;
    }
    return record(parsed);
  }
  throw new SyntaxError('Checkpoint JSON is invalid');
}
