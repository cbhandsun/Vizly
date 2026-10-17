import type { ReactNode } from 'react';
import { render } from '@testing-library/react';

/** Exercise the same deferred runtime mount used by the real viewer. */
export const renderCollaborationHook = <T,>(useHook: () => T, runtime: (value: T) => ReactNode) => {
    let current: T | undefined;
    const Harness = () => {
        current = useHook();
        return runtime(current);
    };
    const view = render(<Harness />);
    return { ...view, result: { get current(): T {
        if (current === undefined) throw new Error('Collaboration harness has not rendered');
        return current;
    } } };
};
