import { useMemo } from 'react';
import {
  resolveBaseReactFlowPrecompiledCapturePresetId,
  resolveBaseReactFlowPrecompiledRegenerationPresetIdFromWindow,
} from './baseReactFlowPrecompiledCaptureMode';
import { resolveBaseReactFlowDisplayQualityPolicy } from './baseReactFlowDisplayWorkerClient';

interface DisplayQualityPolicyInput {
  nodeCount: number;
  edgeCount: number;
  isLargeGraph: boolean;
}

export const useBaseReactFlowDisplayQualityPolicy = ({
  nodeCount,
  edgeCount,
  isLargeGraph,
}: DisplayQualityPolicyInput) => {
  const precompiledRegenerationPresetId =
    resolveBaseReactFlowPrecompiledRegenerationPresetIdFromWindow();
  const displayQualityPolicy = useMemo(() => (
    resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount,
      edgeCount,
      isLargeGraph,
      forceFullQuality: typeof window !== 'undefined'
        && resolveBaseReactFlowPrecompiledCapturePresetId({
          search: window.location.search,
          hash: window.location.hash,
        }) !== null,
    })
  ), [edgeCount, isLargeGraph, nodeCount]);

  return {
    displayQualityPolicy,
    forceFreshFullRoute: precompiledRegenerationPresetId !== null,
    precompiledRegenerationPresetId,
  };
};
