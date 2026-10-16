import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const readPreference = (): boolean => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches;

const subscribe = (onChange: () => void): (() => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const media = window.matchMedia(query);
    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }
    if (typeof media.addListener === 'function') {
        media.addListener(onChange);
        return () => media.removeListener(onChange);
    }
    return () => {};
};

/** Keep Ant Design motion in step with the OS preference, including live changes. */
export const usePrefersReducedMotion = (): boolean => useSyncExternalStore(subscribe, readPreference, () => false);
