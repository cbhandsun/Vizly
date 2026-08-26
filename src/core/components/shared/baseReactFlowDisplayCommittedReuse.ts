import type { Edge } from '@xyflow/react';

import {
  canReuseBaseReactFlowDisplayCommittedSnapshot,
  doesBaseReactFlowDisplayCommittedBaselineMatchIdentity,
  type BaseReactFlowDisplayCommittedSnapshotBaseline,
  type BaseReactFlowDisplayCommittedSnapshotHit,
} from './baseReactFlowDisplayCommittedSnapshot';

export type BaseReactFlowDisplayCommittedReuse = Readonly<{
  retainedEntry: BaseReactFlowDisplayCommittedSnapshotBaseline | null;
  reusableEntry: BaseReactFlowDisplayCommittedSnapshotHit | null;
  authorityBaseline: BaseReactFlowDisplayCommittedSnapshotBaseline | null;
  authorityEdges: Edge[];
  outputRouteSignature: string | undefined;
}>;

export const resolveBaseReactFlowDisplayCommittedReuse = ({
  forceFreshFullRoute,
  retainedBaseline,
  committedEntry,
  inputSignature,
  inputGeometryDigest,
}: {
  forceFreshFullRoute: boolean;
  retainedBaseline: BaseReactFlowDisplayCommittedSnapshotBaseline | null;
  committedEntry: BaseReactFlowDisplayCommittedSnapshotHit | null;
  inputSignature: string;
  inputGeometryDigest: string;
}): BaseReactFlowDisplayCommittedReuse => {
  const eligibleBaseline = forceFreshFullRoute ? null : retainedBaseline;
  const retainedEntry = doesBaseReactFlowDisplayCommittedBaselineMatchIdentity(
    eligibleBaseline,
    inputSignature,
    inputGeometryDigest,
  ) ? eligibleBaseline : null;
  const reusableEntry = canReuseBaseReactFlowDisplayCommittedSnapshot(
    eligibleBaseline,
    committedEntry,
    inputSignature,
    inputGeometryDigest,
  ) ? committedEntry : null;
  const authorityBaseline = reusableEntry?.baseline ?? retainedEntry;
  return {
    retainedEntry,
    reusableEntry,
    authorityBaseline,
    authorityEdges: reusableEntry?.edges ?? authorityBaseline?.sourceEdges ?? [],
    outputRouteSignature: reusableEntry?.outputRouteSignature
      ?? retainedEntry?.outputRouteSignature,
  };
};
