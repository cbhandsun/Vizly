// @vitest-environment jsdom

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useExclusiveSaveActions } from '../useExclusiveSaveActions';

describe('useExclusiveSaveActions', () => {
    it('coalesces repeated and cross-target actions while exposing the active target', async () => {
        let releaseCloudSave = () => {};
        const cloudSavePromise = new Promise<void>((resolve) => {
            releaseCloudSave = resolve;
        });
        const onCloudSave = vi.fn(() => cloudSavePromise);
        const onDirectSave = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(
            () => useExclusiveSaveActions({ onCloudSave, onDirectSave }),
            { wrapper: React.StrictMode },
        );

        let firstSave: Promise<void> | null = null;
        let duplicateSave: Promise<void> | null = null;
        let crossTargetSave: Promise<void> | null = null;
        act(() => {
            firstSave = result.current.handleCloudSave();
            duplicateSave = result.current.handleCloudSave();
            crossTargetSave = result.current.handleDirectSave();
        });

        expect(duplicateSave).toBe(firstSave);
        expect(crossTargetSave).toBe(firstSave);
        expect(result.current.pendingSaveTarget).toBe('cloud');
        expect(onCloudSave).toHaveBeenCalledTimes(1);
        expect(onDirectSave).not.toHaveBeenCalled();

        await act(async () => {
            releaseCloudSave();
            await firstSave;
        });
        expect(result.current.pendingSaveTarget).toBeNull();

        await act(async () => {
            await result.current.handleDirectSave();
        });
        expect(onDirectSave).toHaveBeenCalledTimes(1);
    });

    it('releases the gate after synchronous and asynchronous failures', async () => {
        const synchronousError = new Error('synchronous failure');
        const asynchronousError = new Error('asynchronous failure');
        const onCloudSave = vi.fn()
            .mockImplementationOnce(() => {
                throw synchronousError;
            })
            .mockRejectedValueOnce(asynchronousError)
            .mockResolvedValueOnce(undefined);
        const { result } = renderHook(() => useExclusiveSaveActions({ onCloudSave }));

        await act(async () => {
            await expect(result.current.handleCloudSave()).rejects.toBe(synchronousError);
        });
        expect(result.current.pendingSaveTarget).toBeNull();

        await act(async () => {
            await expect(result.current.handleCloudSave()).rejects.toBe(asynchronousError);
        });
        expect(result.current.pendingSaveTarget).toBeNull();

        await act(async () => {
            await expect(result.current.handleCloudSave()).resolves.toBeUndefined();
        });
        expect(onCloudSave).toHaveBeenCalledTimes(3);
    });
});
