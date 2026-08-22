const MAX_PROFILE_ENTRIES = 12;
const MAX_PROFILE_PATHS = 8;

const normalizeFunctionName = value => {
  if (typeof value !== 'string') return '<unknown>';
  const normalized = value.trim();
  return normalized || '<anonymous>';
};

const normalizeLocation = callFrame => {
  const lineNumber = Number(callFrame?.lineNumber);
  const columnNumber = Number(callFrame?.columnNumber);
  if (!Number.isInteger(lineNumber) || !Number.isInteger(columnNumber)) return null;
  return `${lineNumber + 1}:${columnNumber + 1}`;
};

const normalizeAssetKey = value => {
  if (typeof value !== 'string' || !value) return null;
  try {
    const pathname = new URL(value).pathname;
    if (!pathname.includes('/assets/')) return null;
    const assetKey = pathname.split('/').pop();
    return assetKey && /^[a-zA-Z0-9_.-]+\.js$/.test(assetKey) ? assetKey : null;
  } catch {
    return null;
  }
};

const describeFrame = callFrame => {
  const functionName = normalizeFunctionName(callFrame?.functionName);
  const assetKey = normalizeAssetKey(callFrame?.url);
  const location = normalizeLocation(callFrame);
  return `${functionName}${assetKey ? `[${assetKey}]` : ''}${location ? `@${location}` : ''}`;
};

export const summarizeDisplayRoutingCpuProfile = profile => {
  if (!profile || !Array.isArray(profile.nodes) || !Array.isArray(profile.samples)) {
    return null;
  }
  const deltas = Array.isArray(profile.timeDeltas) ? profile.timeDeltas : [];
  const nodesById = new Map(profile.nodes.map(node => [node?.id, node]));
  const parentsById = new Map();
  for (const node of profile.nodes) {
    for (const childId of Array.isArray(node?.children) ? node.children : []) {
      parentsById.set(childId, node.id);
    }
  }
  const totals = new Map();
  const pathTotals = new Map();
  let sampledMs = 0;
  for (let index = 0; index < profile.samples.length; index += 1) {
    const deltaMicroseconds = Number(deltas[index]);
    if (!Number.isFinite(deltaMicroseconds) || deltaMicroseconds <= 0) continue;
    const node = nodesById.get(profile.samples[index]);
    const callFrame = node?.callFrame;
    const functionName = normalizeFunctionName(callFrame?.functionName);
    const location = normalizeLocation(callFrame);
    const key = `${functionName}\u0000${location ?? ''}`;
    const deltaMs = deltaMicroseconds / 1_000;
    sampledMs += deltaMs;
    const current = totals.get(key);
    totals.set(key, {
      functionName,
      location,
      selfMs: (current?.selfMs ?? 0) + deltaMs,
    });
    const path = [];
    let currentId = profile.samples[index];
    while (currentId != null && path.length < 6) {
      const currentNode = nodesById.get(currentId);
      if (!currentNode) break;
      const frame = describeFrame(currentNode.callFrame);
      if (frame !== '(root)@0:0') path.unshift(frame);
      currentId = parentsById.get(currentId);
    }
    const boundedPath = path.slice(-4).join(' > ');
    pathTotals.set(boundedPath, (pathTotals.get(boundedPath) ?? 0) + deltaMs);
  }
  const entries = [...totals.values()]
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, MAX_PROFILE_ENTRIES)
    .map(entry => ({ ...entry, selfMs: Number(entry.selfMs.toFixed(1)) }));
  const hotPaths = [...pathTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_PROFILE_PATHS)
    .map(([path, selfMs]) => ({ path, selfMs: Number(selfMs.toFixed(1)) }));
  return {
    sampledMs: Number(sampledMs.toFixed(1)),
    entries,
    hotPaths,
  };
};

export const startDisplayRoutingCpuProfile = async (session, enabled) => {
  if (!enabled) return false;
  await session.send('Profiler.enable');
  await session.send('Profiler.start');
  return true;
};

export const stopDisplayRoutingCpuProfile = async (session, started) => {
  if (!started) return null;
  const result = await session.send('Profiler.stop');
  await session.send('Profiler.disable');
  return summarizeDisplayRoutingCpuProfile(result?.profile);
};

export const formatDisplayRoutingCpuProfile = summary => {
  if (!summary) return null;
  const entries = summary.entries.map(entry => (
    `${entry.functionName}${entry.location ? `@${entry.location}` : ''}=${entry.selfMs}ms`
  ));
  const hotPaths = summary.hotPaths.map(entry => `${entry.path}=${entry.selfMs}ms`);
  return `cpu-profile: sampled=${summary.sampledMs}ms; leaves=${entries.join(', ')}; `
    + `paths=${hotPaths.join(', ')}`;
};
