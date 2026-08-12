// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../../i18n';

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
    beforeEach(async () => {
        await i18n.changeLanguage('zh');
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
        expect(messageState.success).toHaveBeenCalledWith('已创建图层“发布 层”');
    });

    it('localizes mutation feedback in English', async () => {
        await i18n.changeLanguage('en');
        vi.spyOn(Date, 'now').mockReturnValue(68);
        const { result } = renderHook(() => useLayerManagement());

        act(() => {
            expect(result.current.createLayer('Review')).toBe(true);
        });
        expect(messageState.success).toHaveBeenCalledWith('Created layer “Review”');

        act(() => {
            result.current.deleteLayer('layer-68');
        });
        expect(messageState.success).toHaveBeenCalledWith('Deleted layer “Review”');

        act(() => {
            result.current.deleteLayer('layer-0');
        });
        expect(messageState.warning).toHaveBeenCalledWith('The default layer cannot be deleted');
    });

    it('keeps the active creation target visible and unlocked', () => {
        const { result } = renderHook(() => useLayerManagement());

        act(() => {
            result.current.toggleVisibility('layer-review');
        });
        expect(result.current.activeLayerId).toBe('layer-0');
        expect(result.current.getLayer('layer-review')?.visible).toBe(false);

        act(() => {
            result.current.setActiveLayerId('layer-review');
        });
        expect(result.current.activeLayerId).toBe('layer-0');
        expect(messageState.warning).toHaveBeenCalledWith('请先显示该图层再设为活动图层');

        act(() => {
            result.current.toggleVisibility('layer-review');
        });
        act(() => {
            result.current.setActiveLayerId('layer-review');
        });
        expect(result.current.activeLayerId).toBe('layer-review');

        act(() => {
            result.current.toggleLock('layer-review');
        });
        expect(result.current.activeLayerId).toBe('layer-0');
        expect(result.current.getLayer('layer-review')?.locked).toBe(true);

        act(() => {
            result.current.setActiveLayerId('layer-review');
        });
        expect(messageState.warning).toHaveBeenCalledWith('请先解锁该图层再设为活动图层');
    });

    it('rejects mutations that would leave no editable active layer', () => {
        const { result } = renderHook(() => useLayerManagement());

        act(() => {
            result.current.toggleVisibility('layer-review');
        });
        act(() => {
            result.current.toggleVisibility('layer-0');
            result.current.toggleLock('layer-0');
        });

        expect(result.current.getLayer('layer-0')).toMatchObject({ visible: true, locked: false });
        expect(result.current.activeLayerId).toBe('layer-0');
        expect(messageState.warning).toHaveBeenCalledWith('请至少保留一个可见且未锁定的活动图层');
    });

    it('does not delete the active layer when no editable fallback remains', () => {
        const { result } = renderHook(() => useLayerManagement());

        act(() => {
            result.current.toggleVisibility('layer-0');
        });
        act(() => {
            result.current.deleteLayer('layer-review');
        });

        expect(result.current.layers.some(layer => layer.id === 'layer-review')).toBe(true);
        expect(result.current.activeLayerId).toBe('layer-review');
        expect(messageState.warning).toHaveBeenCalledWith('请至少保留一个可见且未锁定的活动图层');
    });

    it('repairs persisted layer state so creation always has an editable target', () => {
        localStorage.setItem(FLOWCHART_LAYERS_STORAGE_KEY, JSON.stringify([
            { id: 'layer-0', name: '默认', visible: false, locked: true, zIndex: 0 },
            { id: 'layer-review', name: '评审', visible: false, locked: false, zIndex: 1 },
        ]));
        localStorage.setItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY, 'layer-review');

        const { result } = renderHook(() => useLayerManagement());

        expect(result.current.activeLayerId).toBe('layer-0');
        expect(result.current.getLayer('layer-0')).toMatchObject({ visible: true, locked: false });
    });

    it('moves a persisted hidden active layer to an existing editable layer', () => {
        localStorage.setItem(FLOWCHART_LAYERS_STORAGE_KEY, JSON.stringify([
            { id: 'layer-0', name: '默认', visible: true, locked: false, zIndex: 0 },
            { id: 'layer-review', name: '评审', visible: false, locked: false, zIndex: 1 },
        ]));
        localStorage.setItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY, 'layer-review');

        const { result } = renderHook(() => useLayerManagement());

        expect(result.current.activeLayerId).toBe('layer-0');
        expect(result.current.getLayer('layer-review')?.visible).toBe(false);
    });
});
