import { describe, expect, it } from 'vitest';
import { haveSameDesignerHeaderLayoutState } from '../ui/designerHeaderMemoState';

const state = {
    layoutBusy: false,
    lastDomainStrategy: 'domain-dagre',
    lastDomainDirection: 'TB',
    lastNodeLayout: 'dagre',
};

describe('haveSameDesignerHeaderLayoutState', () => {
    it('invalidates the header memo when the layout transaction settles', () => {
        expect(haveSameDesignerHeaderLayoutState(
            { ...state, layoutBusy: true },
            state,
        )).toBe(false);
    });

    it('invalidates the header memo when any selected layout dimension changes', () => {
        expect(haveSameDesignerHeaderLayoutState(state, {
            ...state,
            lastDomainStrategy: 'domain-vertical',
        })).toBe(false);
        expect(haveSameDesignerHeaderLayoutState(state, {
            ...state,
            lastDomainDirection: 'LR',
        })).toBe(false);
        expect(haveSameDesignerHeaderLayoutState(state, {
            ...state,
            lastNodeLayout: 'grid',
        })).toBe(false);
    });

    it('keeps the memo stable when layout state is unchanged', () => {
        expect(haveSameDesignerHeaderLayoutState(state, { ...state })).toBe(true);
    });
});
