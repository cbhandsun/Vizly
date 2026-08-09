export const PRO_TIMELINE_SNAPSHOT_EVENT = 'diagram:save-snapshot';

export function requestProTimelineSnapshot(target?: EventTarget | null): boolean {
    const eventTarget = target ?? (typeof window === 'undefined' ? null : window);
    if (!eventTarget) return false;
    eventTarget.dispatchEvent(new CustomEvent(PRO_TIMELINE_SNAPSHOT_EVENT));
    return true;
}
