const usage = 'Usage: node scripts/query-telemetry.mjs --storage file|supabase --release HASH [--request UUID] [--directory PRIVATE_LOG_DIRECTORY]';
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(usage + '\n');
  } else {
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const name = args[index], value = args[index + 1];
      if (!['--storage', '--release', '--request', '--directory'].includes(name)
        || Object.hasOwn(options, name) || typeof value !== 'string' || !value.length
        || value.length > 4096 || [...value].some(character => character.charCodeAt(0) < 32)) throw Error('Invalid query arguments');
      options[name] = value;
    }
    const storage = options['--storage'], releaseId = options['--release'], requestId = options['--request'];
    if (!['file', 'supabase'].includes(storage) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(releaseId ?? '')
      || (requestId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId))
      || (storage === 'file' && !options['--directory']) || (storage === 'supabase' && options['--directory'])) {
      throw Error('Invalid query arguments');
    }
    let snapshots;
    if (storage === 'file') {
      const { queryTelemetryJournal } = await import('../dist-collaboration/telemetryJournal.js');
      snapshots = await queryTelemetryJournal(options['--directory'], { releaseId, requestId });
    } else {
      const { createSupabaseTelemetryJournal } = await import('../dist-collaboration/supabaseTelemetryJournal.js');
      const journal = createSupabaseTelemetryJournal(process.env.SUPABASE_URL, process.env.SUPABASE_SERVER_KEY);
      try { snapshots = await journal.query({ releaseId, requestId }); } finally { await journal.drain(); }
    }
    process.stdout.write(JSON.stringify({ schema: 'vizly-telemetry-query-v1', status: 'query-complete',
      storage, releaseId, requestId: requestId ?? null, snapshotCount: snapshots.length,
      counterSemantics: 'Use the highest retained sequence per stream; cumulative snapshots are not additive or a complete long-term SLO.',
      snapshots }) + '\n');
  }
} catch {
  process.stderr.write('Telemetry query failed. Check arguments, compiled server, private target configuration and migration status.\n' + usage + '\n');
  process.exitCode = 1;
}
