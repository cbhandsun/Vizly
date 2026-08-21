import { persistLastViewport } from '../shared/viewportStore';

type ViewportAction = () => Promise<unknown> | unknown;

export const runAndPersistViewportAction = async ({
    action,
    getViewport,
    persistenceKey,
}: {
    action: ViewportAction;
    getViewport: () => unknown;
    persistenceKey: string;
}): Promise<boolean> => {
    await action();
    return persistLastViewport(getViewport(), persistenceKey);
};
