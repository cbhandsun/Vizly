import { createContext, useContext } from 'react';

export interface A11yContextValue {
    announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

export const A11yContext = createContext<A11yContextValue>({
    announce: () => { /* noop */ },
});

export function useA11yAnnounce() {
    return useContext(A11yContext);
}
