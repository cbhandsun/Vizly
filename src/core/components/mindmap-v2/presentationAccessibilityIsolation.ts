interface InertAttributeSnapshot {
    element: HTMLElement;
    value: string | null;
}

const PRESENTATION_ACCESSIBLE_SELECTOR = '[data-presentation-accessible="true"]';

const collectSiblingBranches = (host: HTMLElement): HTMLElement[] => {
    const targets = new Set<HTMLElement>();
    let branch: HTMLElement | null = host;

    while (branch?.parentElement) {
        const parent: HTMLElement = branch.parentElement;
        for (const child of Array.from(parent.children)) {
            if (child !== branch && child instanceof HTMLElement) targets.add(child);
        }
        branch = parent;
    }

    return Array.from(targets);
};

const collectPresentationBackground = (host: HTMLElement): HTMLElement[] => (
    Array.from(host.children).filter((child): child is HTMLElement => (
        child instanceof HTMLElement
        && child.id !== 'me-presentation-hud'
        && !child.matches(PRESENTATION_ACCESSIBLE_SELECTOR)
    ))
);

/**
 * Keeps keyboard and assistive-technology navigation inside presentation
 * controls while leaving the visual canvas rendered behind them.
 */
export const isolatePresentationAccessibility = (host: HTMLElement | null): (() => void) => {
    if (!host?.isConnected) return () => undefined;

    const snapshots: InertAttributeSnapshot[] = [
        ...collectSiblingBranches(host),
        ...collectPresentationBackground(host),
    ].map(element => ({
        element,
        value: element.getAttribute('inert'),
    }));

    for (const { element } of snapshots) element.setAttribute('inert', '');

    let restored = false;
    return () => {
        if (restored) return;
        restored = true;
        for (const { element, value } of snapshots) {
            if (value === null) element.removeAttribute('inert');
            else element.setAttribute('inert', value);
        }
    };
};
