import { describe, expect, it } from 'vitest';
import {
    parseWarehouseSceneKeyboardCommand,
    shouldShowWarehouseLabelsByDefault,
} from '../warehouse3DInteraction';

describe('warehouse 3D interaction boundaries', () => {
    it('uses a quiet label default on narrow viewports', () => {
        expect(shouldShowWarehouseLabelsByDefault(320)).toBe(false);
        expect(shouldShowWarehouseLabelsByDefault(767)).toBe(false);
        expect(shouldShowWarehouseLabelsByDefault(768)).toBe(true);
        expect(shouldShowWarehouseLabelsByDefault(4096)).toBe(true);
    });

    it('keeps the established visible default for invalid viewport input', () => {
        expect(shouldShowWarehouseLabelsByDefault(undefined)).toBe(true);
        expect(shouldShowWarehouseLabelsByDefault(null)).toBe(true);
        expect(shouldShowWarehouseLabelsByDefault('522')).toBe(true);
        expect(shouldShowWarehouseLabelsByDefault(Number.NaN)).toBe(true);
        expect(shouldShowWarehouseLabelsByDefault(Number.POSITIVE_INFINITY)).toBe(true);
        expect(shouldShowWarehouseLabelsByDefault(0)).toBe(true);
        expect(shouldShowWarehouseLabelsByDefault(-1)).toBe(true);
    });

    it('parses only supported scene keyboard commands', () => {
        expect(parseWarehouseSceneKeyboardCommand('ArrowLeft')).toBe('rotate-left');
        expect(parseWarehouseSceneKeyboardCommand('ArrowRight')).toBe('rotate-right');
        expect(parseWarehouseSceneKeyboardCommand('ArrowUp')).toBe('rotate-up');
        expect(parseWarehouseSceneKeyboardCommand('ArrowDown')).toBe('rotate-down');
        expect(parseWarehouseSceneKeyboardCommand('+')).toBe('zoom-in');
        expect(parseWarehouseSceneKeyboardCommand('=')).toBe('zoom-in');
        expect(parseWarehouseSceneKeyboardCommand('-')).toBe('zoom-out');
        expect(parseWarehouseSceneKeyboardCommand('_')).toBe('zoom-out');
        expect(parseWarehouseSceneKeyboardCommand('Home')).toBe('reset');
        expect(parseWarehouseSceneKeyboardCommand('Escape')).toBeNull();
        expect(parseWarehouseSceneKeyboardCommand('')).toBeNull();
        expect(parseWarehouseSceneKeyboardCommand(null)).toBeNull();
        expect(parseWarehouseSceneKeyboardCommand({ key: 'Home' })).toBeNull();
    });
});
