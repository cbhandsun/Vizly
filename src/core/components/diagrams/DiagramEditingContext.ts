import { createContext, useContext } from 'react';

const DiagramEditingContext = createContext(true);

export const DiagramEditingProvider = DiagramEditingContext.Provider;

export const useDiagramEditingAllowed = (): boolean => useContext(DiagramEditingContext);
