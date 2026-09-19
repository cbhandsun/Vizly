import { describe, expect, it } from 'vitest';

import {
  mapPrecompiledManifestEntriesByTarget,
  precompiledManifestArtifactFileSetIsFresh,
  precompiledDisplayRouteTargetKey,
  selectChangedPrecompiledDisplayRouteTargets,
} from './precompiled-display-route-changed-targets.mjs';

const targets = [
  { presetId: 'a', sourcePath: 'a.json', variantId: 'initial' },
  { presetId: 'b', sourcePath: 'b.json', variantId: 'initial' },
  { presetId: 'b', sourcePath: 'b.json', variantId: 'layout-lr' },
];
const sourceHashes = new Map([
  ['a.json', 'source-v1:a'],
  ['b.json', 'source-v1:b'],
]);
const baseManifest = {
  routingVersion: '23',
  identitySourceHash: 'source-v1:identity',
  routingSourceHash: 'source-v1:routing',
  entries: targets.map((target, index) => ({
    ...target,
    artifactFile: `route-${index}.json`,
    sourceHash: sourceHashes.get(target.sourcePath),
    inputSignature: String(index + 1),
    inputGeometryDigest: `geometry-v1:${String(index).repeat(32).slice(0, 32)}`,
    outputRouteSignature: `route-v2:1:2:${String(index).repeat(16).slice(0, 16)}`,
  })),
};

const select = manifest => selectChangedPrecompiledDisplayRouteTargets({
  targets,
  manifest,
  routingVersion: '23',
  identitySourceHash: 'source-v1:identity',
  routingSourceHash: 'source-v1:routing',
  sourceHashes,
});

describe('precompiled-display-route changed target selection', () => {
  it('selects no targets when manifest identities and source hashes are fresh', () => {
    expect(select(baseManifest)).toEqual([]);
  });

  it('selects all targets when routing or identity inputs drift', () => {
    expect(select({ ...baseManifest, routingSourceHash: 'source-v1:old' })).toEqual(targets);
    expect(select({ ...baseManifest, identitySourceHash: 'source-v1:old' })).toEqual(targets);
    expect(select({ ...baseManifest, routingVersion: '22' })).toEqual(targets);
    expect(select(null)).toEqual(targets);
  });

  it('selects only missing or source-stale target entries', () => {
    const missingLayout = {
      ...baseManifest,
      entries: baseManifest.entries.filter(entry => entry.variantId !== 'layout-lr'),
    };
    expect(select(missingLayout)).toEqual([targets[2]]);

    const sourceStale = {
      ...baseManifest,
      entries: baseManifest.entries.map(entry => (
        entry.sourcePath === 'a.json' ? { ...entry, sourceHash: 'source-v1:old' } : entry
      )),
    };
    expect(select(sourceStale)).toEqual([targets[0]]);
  });

  it('selects all targets when reusable manifest entry identity is malformed', () => {
    const malformedArtifactFile = {
      ...baseManifest,
      entries: baseManifest.entries.map((entry, index) => (
        index === 0 ? { ...entry, artifactFile: '../route-1.json' } : entry
      )),
    };
    expect(select(malformedArtifactFile)).toEqual(targets);

    const malformedGeometryDigest = {
      ...baseManifest,
      entries: baseManifest.entries.map((entry, index) => (
        index === 1 ? { ...entry, inputGeometryDigest: 'geometry-v1:not-hex' } : entry
      )),
    };
    expect(select(malformedGeometryDigest)).toEqual(targets);
  });

  it('selects all targets when manifest target entries collide', () => {
    const duplicateTarget = {
      ...baseManifest,
      entries: [
        ...baseManifest.entries,
        { ...baseManifest.entries[0], inputSignature: '999' },
      ],
    };
    expect(select(duplicateTarget)).toEqual(targets);
  });

  it('maps manifest entries by source path and variant', () => {
    const mapped = mapPrecompiledManifestEntriesByTarget(baseManifest);
    expect(mapped.get(precompiledDisplayRouteTargetKey(targets[1]))?.presetId).toBe('b');
  });

  it('checks whether the generated artifact directory matches manifest references', () => {
    const artifactFiles = baseManifest.entries.map(entry => entry.artifactFile).reverse();
    expect(precompiledManifestArtifactFileSetIsFresh({
      manifest: baseManifest,
      artifactFiles,
    })).toBe(true);
    expect(precompiledManifestArtifactFileSetIsFresh({
      manifest: baseManifest,
      artifactFiles: artifactFiles.slice(1),
    })).toBe(false);
    expect(precompiledManifestArtifactFileSetIsFresh({
      manifest: baseManifest,
      artifactFiles: [...artifactFiles, 'route-999.json'],
    })).toBe(false);
    expect(precompiledManifestArtifactFileSetIsFresh({
      manifest: {
        ...baseManifest,
        entries: [{ ...baseManifest.entries[0], artifactFile: '../route-1.json' }],
      },
      artifactFiles: ['route-1.json'],
    })).toBe(false);
  });
});
