import { createContext, useContext } from 'react';

import type { EdgeLabelRect } from './edgeLabelAvoidance';

export const EdgeLabelObstacleContext = createContext<EdgeLabelRect[]>([]);

export const useEdgeLabelObstacles = (): EdgeLabelRect[] => (
  useContext(EdgeLabelObstacleContext)
);
