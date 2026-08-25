import { useEffect, useRef } from 'react';

import {
  canReuseBaseReactFlowDisplayCommittedSnapshot,
  type BaseReactFlowDisplayCommittedSnapshotBaseline,
  type BaseReactFlowDisplayCommittedSnapshotHit,
} from './baseReactFlowDisplayCommittedSnapshot';

export const useBaseReactFlowDisplayCommittedBaseline = ({
  committedEntry,
  forceFreshFullRoute,
  inputSignature,
  inputGeometryDigest,
}: Readonly<{
  committedEntry: BaseReactFlowDisplayCommittedSnapshotHit | null;
  forceFreshFullRoute: boolean;
  inputSignature: string;
  inputGeometryDigest: string;
}>) => {
  const baselineRef = useRef<BaseReactFlowDisplayCommittedSnapshotBaseline | null>(null);

  useEffect(() => {
    if (forceFreshFullRoute) {
      baselineRef.current = null;
      return;
    }
    if (canReuseBaseReactFlowDisplayCommittedSnapshot(
      baselineRef.current,
      committedEntry,
      inputSignature,
      inputGeometryDigest,
    )) baselineRef.current = committedEntry.baseline;
  }, [committedEntry, forceFreshFullRoute, inputGeometryDigest, inputSignature]);

  return baselineRef;
};
