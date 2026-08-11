import { useEffect, useState } from 'react';

interface FlowchartToolbarPortalTargets {
    bottom: HTMLElement | null;
    center: HTMLElement | null;
    context: HTMLElement | null;
}

const EMPTY_PORTAL_TARGETS: FlowchartToolbarPortalTargets = {
    bottom: null,
    center: null,
    context: null,
};

const resolveFlowchartToolbarPortalTargets = (): FlowchartToolbarPortalTargets => ({
    bottom: document.getElementById('vizly-plugin-bottom-island-portal'),
    center: document.getElementById('vizly-plugin-center-island-portal'),
    context: document.getElementById('vizly-plugin-context-toolbar-portal'),
});

export const useFlowchartToolbarPortalTargets = (
    responsiveLayoutKey: boolean,
): FlowchartToolbarPortalTargets => {
    const [targets, setTargets] = useState<FlowchartToolbarPortalTargets>(EMPTY_PORTAL_TARGETS);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setTargets(resolveFlowchartToolbarPortalTargets());
        }, 0);
        return () => window.clearTimeout(timer);
    }, [responsiveLayoutKey]);

    return targets;
};
