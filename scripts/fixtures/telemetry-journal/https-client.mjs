import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { createServer } from 'node:https';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createProductionCollaborationRuntime } from '../../../dist-collaboration/productionRuntime.js';
import { createSupabaseTelemetryJournal } from '../../../dist-collaboration/supabaseTelemetryJournal.js';
import { OPERATIONS } from '../../../dist-collaboration/operationTelemetry.js';

const input = async () => { let data = ''; for await (const chunk of process.stdin) data += chunk; return JSON.parse(data); };
if (process.argv[2] === 'worker') {
  const environment = await input();
  const runtime = createProductionCollaborationRuntime(environment);
  const address = await runtime.listen(0);
  process.stdout.write(JSON.stringify({ pid: process.pid, url: address.url.replace('ws:', 'http:') }) + '\n');
  process.once('SIGTERM', () => { void runtime.stop().then(() => process.exit(0), () => process.exit(1)); });
} else {
  const fixture = await input();
  const cases = [], workers = [], directories = [];
  const releaseId = 'a'.repeat(40), streamId = randomUUID(), requestId = randomUUID();
  const batch = sequence => ({ schema: 'vizly-telemetry-v1', releaseId, streamId, sequence, dropped: 0,
    metrics: Object.fromEntries(OPERATIONS.map(operation => [operation, { started: 1, success: 1, failure: 0, cancelled: 0 }])),
    events: [{ schema: 'vizly-operation-v1', releaseId, requestId, operation: 'save', outcome: 'success', code: null, durationMs: 4 }],
    secret: 'FORBIDDEN_TELEMETRY_CANARY' });
  const forwards = new Map(), cancelled = new Set(), delayed = new Set();
  let oversizedAck = false, gateway, journal;
  const unavailable = error => error instanceof Error && error.message === 'Telemetry storage unavailable';
  const check = (name, predicate) => { assert.ok(predicate); cases.push(name); };
  const command = async (args, environment = {}) => {
    const child = spawn(process.execPath, args, { env: { PATH: '/usr/bin:/bin', ...environment }, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; child.stdout.on('data', data => { output += data; });
    const [code] = await once(child, 'exit');
    return { code, output };
  };
  const stop = async worker => {
    if (worker.child.exitCode !== null) { assert.equal(worker.child.exitCode, 0); return; }
    const exited = once(worker.child, 'exit'); worker.child.kill('SIGTERM');
    const [code] = await exited; assert.equal(code, 0);
  };
  try {
    assert.equal(process.version, 'v22.23.4');
    gateway = createServer({ key: await readFile('/server.key'), cert: await readFile('/server.crt') }, (request, response) => {
      void (async () => {
        if (request.method !== 'POST' || !['/rest/v1/rpc/vizly_record_telemetry', '/rest/v1/rpc/vizly_query_telemetry'].includes(request.url)) {
          response.writeHead(404); response.end(); return;
        }
        let body = ''; for await (const chunk of request) body += chunk;
        const value = JSON.parse(body), sequence = value.p_batch?.sequence;
        if (sequence === 90 || sequence === 91) {
          delayed.add(sequence);
          const waiting = setTimeout(() => { if (!response.destroyed) { response.writeHead(504); response.end(); } }, 6500);
          response.once('close', () => { clearTimeout(waiting); if (!response.writableEnded) cancelled.add(sequence); });
          return;
        }
        let token;
        if (request.headers.apikey === fixture.secretKey) token = fixture.service;
        else if (request.headers.apikey === fixture.publishable) {
          token = request.headers.authorization === 'Bearer ' + fixture.authenticated ? fixture.authenticated : fixture.anon;
        } else { response.writeHead(401); response.end(); return; }
        if (sequence !== undefined) {
          assert.ok(!body.includes('FORBIDDEN_TELEMETRY_CANARY'));
          assert.ok(!body.includes(fixture.secretKey));
          forwards.set(sequence, (forwards.get(sequence) ?? 0) + 1);
        }
        const upstream = await fetch('http://rest:3000' + request.url.replace('/rest/v1', ''), {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body, signal: AbortSignal.timeout(8000), redirect: 'error',
        });
        const text = await upstream.text();
        if (oversizedAck && sequence === 3 && upstream.ok) {
          oversizedAck = false; response.writeHead(200, { 'content-type': 'application/json' }); response.end(' '.repeat(4097));
        } else { response.writeHead(upstream.status, { 'content-type': 'application/json' }); response.end(text); }
      })().catch(() => { if (!response.headersSent) response.writeHead(503); response.end(); });
    });
    gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
    const url = 'https://127.0.0.1:' + gateway.address().port;
    const publicRpc = (name, value, authenticated = false) => fetch(url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: fixture.publishable,
        ...(authenticated ? { authorization: 'Bearer ' + fixture.authenticated } : {}) }, body: JSON.stringify(value),
    });
    // Wait for actual PostgREST schema cache, without silently skipping unavailable infrastructure.
    journal = createSupabaseTelemetryJournal(url, fixture.secretKey);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { assert.deepEqual(await journal.query({ releaseId }), []); ready = true; break; } catch { /* bounded readiness */ }
      await new Promise(accept => setTimeout(accept, 250));
    }
    check('real-postgrest-ready', ready);
    const untrusted = await command(['--input-type=module', '-e',
      'try { await fetch(process.argv[1]); process.exit(1); } catch(error) { process.stdout.write(String(error.cause?.code)); }', url]);
    check('untrusted-ca-rejected', untrusted.code === 0 && ['UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(untrusted.output));
    const start = async () => {
      const directory = await mkdtemp(join(tmpdir(), 'telemetry-worker-')); directories.push(directory);
      const child = spawn(process.execPath, ['/client.mjs', 'worker'], { cwd: directory,
        env: { PATH: '/usr/bin:/bin', NODE_EXTRA_CA_CERTS: '/ca.crt' }, stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = createInterface({ input: child.stdout });
      const first = once(lines, 'line');
      child.stdin.end(JSON.stringify({ VERCEL: '1', VIZLY_TELEMETRY_ENABLED: 'true', VIZLY_RELEASE_ID: releaseId,
        SUPABASE_URL: url, SUPABASE_SERVER_KEY: fixture.secretKey, SUPABASE_PUBLISHABLE_KEY: fixture.publishable,
        VIZLY_COLLABORATION_ORIGINS: 'https://app.example.test' }));
      const [line] = await first; lines.close();
      const info = JSON.parse(line); assert.equal(info.pid, child.pid);
      const worker = { child, directory, ...info }; workers.push(worker); return worker;
    };
    const post = (worker, value, origin = 'https://app.example.test') => fetch(worker.url + '/telemetry', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value),
    });
    const first = await start();
    check('production-http-ingest', (await post(first, batch(1))).status === 202);
    check('origin-rejected', (await post(first, batch(2), 'https://evil.example.test')).status === 403);
    check('no-public-query', (await fetch(first.url + '/telemetry?release=' + releaseId)).status === 404);
    await stop(first); await assert.rejects(access(join(first.directory, '.telemetry-data')));
    await rm(first.directory, { recursive: true, force: true });
    const second = await start();
    check('fresh-process-and-directory', second.pid !== first.pid && second.directory !== first.directory);
    const lookup = await command(['/query.mjs', '--storage', 'supabase', '--release', releaseId, '--request', requestId], {
      NODE_EXTRA_CA_CERTS: '/ca.crt', SUPABASE_URL: url, SUPABASE_SERVER_KEY: fixture.secretKey,
    });
    const found = JSON.parse(lookup.output);
    check('operator-query-after-process-replacement', lookup.code === 0 && found.status === 'query-complete'
      && found.snapshotCount === 1 && found.snapshots[0].sequence === 1 && !lookup.output.includes('FORBIDDEN_TELEMETRY_CANARY'));
    check('replacement-process-ingest', (await post(second, batch(2))).status === 202);
    await stop(second); await assert.rejects(access(join(second.directory, '.telemetry-data')));
    check('automatic-cloud-selection-no-file-fallback', true);
    for (const authenticated of [false, true]) {
      for (const [name, value] of [['vizly_record_telemetry', { p_batch: { ...batch(8), secret: undefined } }],
        ['vizly_query_telemetry', { p_release_id: releaseId, p_request_id: null }]]) {
        const denied = await publicRpc(name, value, authenticated), error = await denied.json();
        check(`${authenticated ? 'authenticated' : 'anon'}-${name}-sql-denied`, [401, 403].includes(denied.status) && error.code === '42501');
      }
    }
    oversizedAck = true;
    await assert.rejects(journal.accept(batch(3), new AbortController().signal), unavailable);
    check('oversized-ack-rejected-after-real-commit', (await journal.query({ releaseId })).filter(row => row.sequence === 3).length === 1);
    await journal.accept(batch(3), new AbortController().signal);
    check('lost-ack-retry-idempotent', (await journal.query({ releaseId })).length === 3 && forwards.get(3) === 2);
    const abort = new AbortController();
    const cancelledWrite = journal.accept(batch(90), abort.signal);
    // Observe receipt before aborting, so a scheduling delay cannot turn this into a preflight-only test.
    for (let attempt = 0; attempt < 50 && !delayed.has(90); attempt++) await new Promise(accept => setTimeout(accept, 20));
    assert.ok(delayed.has(90)); abort.abort();
    await assert.rejects(cancelledWrite, unavailable);
    await assert.rejects(journal.accept(batch(91), new AbortController().signal), unavailable);
    await new Promise(accept => setTimeout(accept, 200));
    check('caller-abort-closes-real-tls-request', cancelled.has(90) && !forwards.has(90));
    check('deadline-closes-real-tls-request-without-retry', cancelled.has(91) && !forwards.has(91));
    check('cancelled-writes-absent', (await journal.query({ releaseId })).length === 3);
    process.stdout.write(JSON.stringify({ status: 'passed', node: process.version, cases, caseCount: cases.length }) + '\n');
  } catch {
    process.exitCode = 1;
    process.stdout.write(JSON.stringify({ status: 'failed', completedCases: cases }) + '\n');
  } finally {
    for (const worker of workers) { if (worker.child.exitCode === null) await stop(worker).catch(() => { worker.child.kill('SIGKILL'); }); }
    await journal?.drain();
    if (gateway) { gateway.closeAllConnections(); await new Promise(accept => gateway.close(accept)); }
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
  }
}
