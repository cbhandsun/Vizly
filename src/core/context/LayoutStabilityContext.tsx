import { createContext, useContext } from 'react';

/**
 * Context to signal whether the diagram layout is currently stable.
 * Used to defer expensive operations (like smart edge routing) until the nodes have stopped moving.
 */
export const LayoutStabilityContext = createContext<boolean>(true);

export const useLayoutStability = () => useContext(LayoutStabilityContext);
