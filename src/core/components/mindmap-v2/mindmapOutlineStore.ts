/** mindmapOutlineStore.ts — 大纲面板事件总线 */
type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let _isOpen = false;

export function setOutlineOpen(open: boolean) {
    if (_isOpen === open) return;
    _isOpen = open;
    listeners.forEach(fn => fn(_isOpen));
}

export function emitToggleOutline() {
    setOutlineOpen(!_isOpen);
}

export function subscribeOutline(fn: Listener): () => void {
    listeners.add(fn);
    fn(_isOpen);
    return () => {
        listeners.delete(fn);
    };
}
export function getOutlineOpen() { return _isOpen; }
