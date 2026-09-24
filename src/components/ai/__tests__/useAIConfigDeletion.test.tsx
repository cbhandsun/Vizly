import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AIConfigState } from '../aiConfigStorage';
import { useAIConfigDeletion } from '../useAIConfigDeletion';

const initialConfig: AIConfigState = {
    activeModelKey: 'custom-one:active-model',
    systemPrompt: 'prompt',
    providers: [
        {
            id: 'custom-one',
            name: 'Custom One',
            enabled: true,
            baseUrl: 'https://one.example/v1',
            apiKey: '',
            models: [{ id: 'active-model', name: 'Active Model', enabled: true }],
        },
        {
            id: 'custom-two',
            name: 'Custom Two',
            enabled: true,
            baseUrl: 'https://two.example/v1',
            apiKey: '',
            models: [{ id: 'fallback-model', name: 'Fallback Model', enabled: true }],
        },
    ],
};

afterEach(cleanup);

const Harness = () => {
    const [config, setConfig] = React.useState(initialConfig);
    const [selectedProviderId, setSelectedProviderId] = React.useState('custom-one');
    const fallbackFocusRef = React.useRef<HTMLButtonElement>(null);
    const deletion = useAIConfigDeletion({
        fallbackFocusRef,
        setConfig,
        setSelectedProviderId,
    });
    const provider = config.providers.find(item => item.id === 'custom-one');
    const model = provider?.models.find(item => item.id === 'active-model');

    return (
        <>
            <button ref={fallbackFocusRef} type="button">Close config</button>
            {provider && (
                <button
                    type="button"
                    onClick={event => deletion.requestProviderDeletion(provider, event)}
                >
                    Request provider deletion
                </button>
            )}
            {provider && model && (
                <button
                    type="button"
                    onClick={event => deletion.requestModelDeletion(provider.id, model, true, event)}
                >
                    Request model deletion
                </button>
            )}
            {deletion.pendingDeletion && (
                <>
                    <button type="button" onClick={deletion.cancelDeletion}>Cancel deletion</button>
                    <button type="button" onClick={deletion.confirmDeletion}>Confirm deletion</button>
                </>
            )}
            <output data-testid="active-model">{config.activeModelKey}</output>
            <output data-testid="providers">{config.providers.map(item => item.id).join(',')}</output>
            <output data-testid="selected-provider">{selectedProviderId}</output>
        </>
    );
};

describe('useAIConfigDeletion', () => {
    it('keeps the draft untouched when deletion is cancelled', async () => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Request provider deletion' });
        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));

        expect(screen.getByTestId('providers').textContent).toBe('custom-one,custom-two');
        expect(screen.getByTestId('active-model').textContent).toBe('custom-one:active-model');
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('repairs active selection and focus after confirming provider deletion', async () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: 'Request provider deletion' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));

        expect(screen.getByTestId('providers').textContent).toBe('custom-two');
        expect(screen.getByTestId('active-model').textContent).toBe('custom-two:fallback-model');
        expect(screen.getByTestId('selected-provider').textContent).toBe('global_settings');
        await waitFor(() => expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'Close config' }),
        ));
    });

    it('removes an active model only after confirmation', () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole('button', { name: 'Request model deletion' }));

        expect(screen.getByTestId('active-model').textContent).toBe('custom-one:active-model');
        fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
        expect(screen.getByTestId('active-model').textContent).toBe('custom-two:fallback-model');
    });
});
