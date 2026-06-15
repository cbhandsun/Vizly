import { createContext } from 'react';
import type { Theme } from '../../themes/types/ThemeTypes';
import type { EdgeUpdateCallbacks } from './EdgeUpdateContext';

export const EdgeUpdateContext = createContext<EdgeUpdateCallbacks | null>(null);
export const EdgeThemeContext = createContext<Theme | null>(null);

export const noopEdgeUpdateCallbacks: EdgeUpdateCallbacks = {
    onLabelOffsetChange: () => { },
    onLabelStyleChange: () => { },
    onWaypointsChange: () => { },
    onLabelChange: () => { },
};
