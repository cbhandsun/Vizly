import { createContext, useContext } from 'react';

export type BaseReactFlowViewportSemanticSync = (
  viewport: { x: number; y: number; zoom: number },
) => void;

export const BaseReactFlowViewportSemanticContext =
  createContext<BaseReactFlowViewportSemanticSync | null>(null);

export const useBaseReactFlowViewportSemanticSync = () =>
  useContext(BaseReactFlowViewportSemanticContext);
