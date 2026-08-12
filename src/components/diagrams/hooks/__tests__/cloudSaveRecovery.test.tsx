// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const notificationMocks = vi.hoisted(() => ({
    destroy: vi.fn(),
    warning: vi.fn(),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appNotification: notificationMocks,
}));

import { showCloudSaveConfigurationRecovery } from '../cloudSaveRecovery';

describe('showCloudSaveConfigurationRecovery', () => {
    it('keeps an actionable configuration notice open until the user chooses a path', () => {
        showCloudSaveConfigurationRecovery({
            title: 'S3 not configured',
            description: 'Configure cloud storage before saving.',
            actionLabel: 'Configure',
        });

        const options = notificationMocks.warning.mock.calls[0]?.[0];
        expect(options).toMatchObject({
            key: 'cloud-save-configuration-required',
            message: 'S3 not configured',
            description: 'Configure cloud storage before saving.',
            duration: 0,
            placement: 'topRight',
        });

        render(<>{options?.btn}</>);
        const configure = screen.getByRole('link', { name: 'Configure' });
        expect(configure.getAttribute('href')).toBe('#/storage-config');

        fireEvent.click(configure);
        expect(notificationMocks.destroy).toHaveBeenCalledWith('cloud-save-configuration-required');
    });
});
