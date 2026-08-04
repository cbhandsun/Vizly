// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    FLOWCHART_ACTIVE_LAYER_STORAGE_KEY,
    FLOWCHART_LAYERS_STORAGE_KEY,
} from '../../../../utils/layerStorage';
import { useLayerManagement } from '../useLayerManagement';

const messageState = vi.hoisted(() => ({
    success: vi.fn(),
    warning: vi.fn(),
}));

vi.mock('../../../../utils/antdStaticBridge', () => ({
    appMessage: messageState,
}));

const seedLayers = () => {
    localStorage.setItem(FLOWCHART_LAYERS_STORAGE_KEY, JSON.stringify([
        { id: 'layer-0', name: '默认', visible: true, locked: false, zIndex: 0 },
        { id: 'layer-review', name: '评审', visible: true, locked: false, zIndex: 1 },
    ]));
    localStorage.setItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY, 'layer-review');
};

describe('useLayerManagement name boundary', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        messageState.success.mockReset();
        messageState.warning.mockReset();
        seedLayers();
    });

    it('rejects empty, duplicate, and missing-target mutations before state changes', () => {
        const { result } = renderHook(() => useLayerManagement());

        act(() => {
            expect(result.current.createLayer('  ')).toBe(false);
            expect(result.current.createLayer('默\u200B认')).toBe(false);
            expect(result.current.renameLayer('layer-review', '默认')).toBe(false);
            expect(result.current.renameLayer('missing', '有效名称')).toBe(false);
        });

        expect(result.current.layers.map(layer => layer.name)).toEqual(['默认', '评审']);
        expect(messageState.warning).toHaveBeenCalledWith('图层名称不能为空');
        expect(messageState.warning).toHaveBeenCalledWith('图层名称不能重复');
        expect(messageState.success).not.toHaveBeenCalled();
    });

    it('accepts normalized unique names and reports successful mutations', () => {
        vi.spyOn(Date, 'now').mockReturnValue(67);
        const { result } = renderHook(() => useLayerManagement());

        act(() => {
            expect(result.current.renameLayer('layer-review', '  复核\u200B层  ')).toBe(true);
        });
        expect(result.current.layers.find(layer => layer.id === 'layer-review')?.name).toBe('复核层');

        act(() => {
            expect(result.current.createLayer('  发布\n  层  ')).toBe(true);
        });
        expect(result.current.layers.find(layer => layer.id === 'layer-67')?.name).toBe('发布 层');
        expect(result.current.activeLayerId).toBe('layer-67');
        expect(messageState.success).toHaveBeenCalledWith('已创建图层 "发布 层"');
    });
});
