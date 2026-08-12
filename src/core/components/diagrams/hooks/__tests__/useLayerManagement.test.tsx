// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../../i18n';

import {
    FLOWCHART_ACTIVE_LAYER_STORAGE_KEY,
    FLOWCHART_LAYERS_STORAGE_KEY,
} from '../../../../utils/layerStorage';
import { useLayerManagement } from '../useLayerManagement';

const messageState = vi.hoisted(() => ({
    destroy: vi.fn(),
    open: vi.fn(),
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
        messageState.open.mockReset();
        messageState.destroy.mockReset();
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
        expect(messageState.open).toHaveBeenCalledWith(expect.objectContaining({
            type: 'success',
            duration: 8,
        }));

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

    it('moves deleted-layer content to the active fallback and offers direct undo', () => {
        const nodesRef = {
            current: [
                { id: 'review-node', position: { x: 0, y: 0 }, data: { layer: 'layer-review' } },
                { id: 'default-node', position: { x: 100, y: 0 }, data: { layer: 'layer-0' } },
            ] as Node[],
        };
        const edgesRef = {
            current: [
                { id: 'review-edge', source: 'review-node', target: 'default-node', data: { layer: 'layer-review' } },
            ] as Edge[],
        };
        const setNodes = vi.fn((update: SetStateAction<Node[]>) => {
            nodesRef.current = typeof update === 'function' ? update(nodesRef.current) : update;
        });
        const setEdges = vi.fn((update: SetStateAction<Edge[]>) => {
            edgesRef.current = typeof update === 'function' ? update(edgesRef.current) : update;
        });
        const { result } = renderHook(() => useLayerManagement({
            nodesRef,
            edgesRef,
            setNodes,
            setEdges,
        }));

        act(() => {
            result.current.deleteLayer('layer-review');
        });

        expect(result.current.activeLayerId).toBe('layer-0');
        expect(nodesRef.current.find(node => node.id === 'review-node')?.data.layer).toBe('layer-0');
        expect(edgesRef.current[0]?.data?.layer).toBe('layer-0');
        const messageConfig = messageState.open.mock.calls.at(-1)?.[0];
        render(messageConfig.content);

        fireEvent.click(screen.getByRole('button', { name: '撤销图层删除' }));

        expect(result.current.layers.map(layer => layer.id)).toEqual(['layer-0', 'layer-review']);
        expect(result.current.activeLayerId).toBe('layer-review');
        expect(nodesRef.current.find(node => node.id === 'review-node')?.data.layer).toBe('layer-review');
        expect(edgesRef.current[0]?.data?.layer).toBe('layer-review');
        expect(messageState.destroy).toHaveBeenCalledWith('designer.layers.delete.layer-review');
        expect(messageState.success).toHaveBeenCalledWith('已恢复图层“评审”');
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
