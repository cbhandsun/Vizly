export type SafeMindMapShortcutAction =
    | 'addChild'
    | 'insertSiblingBefore'
    | 'insertSiblingAfter'
    | 'insertParent';

interface ShortcutEventLike {
    key: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    isComposing?: boolean;
}

export function getSafeMindMapShortcutAction(event: ShortcutEventLike): SafeMindMapShortcutAction | null {
    if (event.isComposing || event.altKey) return null;

    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey) {
        return 'addChild';
    }

    if (event.key !== 'Enter') {
        return null;
    }

    if (event.ctrlKey || event.metaKey) {
        return 'insertParent';
    }

    return event.shiftKey ? 'insertSiblingBefore' : 'insertSiblingAfter';
}
