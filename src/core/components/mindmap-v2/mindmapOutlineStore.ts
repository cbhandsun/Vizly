/** mindmapOutlineStore.ts — 大纲面板事件总线 */
type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let _isOpen = false;

export function emitToggleOutline() {
    _isOpen = !_isOpen;
    listeners.forEach(fn => fn(_isOpen));
}
export function subscribeOutline(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function getOutlineOpen() { return _isOpen; }
