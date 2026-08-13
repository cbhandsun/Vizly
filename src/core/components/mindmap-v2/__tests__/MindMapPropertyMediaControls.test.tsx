// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MindMapPropertyMediaControls } from '../MindMapPropertyMediaControls';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: { icon?: string; count?: number }) => ({
            'plugins.mindmap.propertyMedia.iconsLabel': 'Markers',
            'plugins.mindmap.propertyMedia.selectedIcons': 'Selected markers',
            'plugins.mindmap.propertyMedia.removeIcon': `Remove ${values?.icon ?? ''} marker`,
            'plugins.mindmap.propertyMedia.addIcon': `Add ${values?.icon ?? ''} marker`,
            'plugins.mindmap.propertyMedia.iconPickerTitle': 'Choose markers',
            'plugins.mindmap.propertyMedia.iconsSelected': `${values?.count ?? 0} markers selected`,
            'plugins.mindmap.propertyMedia.addIcons': 'Add markers',
            'plugins.mindmap.propertyMedia.imageLabel': 'Image',
            'plugins.mindmap.propertyMedia.imageUrlLabel': 'Image URL',
            'plugins.mindmap.propertyMedia.imageUrlPlaceholder': 'Paste an HTTPS image URL',
            'plugins.mindmap.propertyMedia.uploadImage': 'Upload an image',
            'plugins.mindmap.propertyMedia.invalidUrl': 'Invalid image URL',
            'plugins.mindmap.propertyMedia.emptyFile': 'The selected image is empty',
            'plugins.mindmap.propertyMedia.invalidFile': 'Invalid image file',
            'plugins.mindmap.propertyMedia.readFailed': 'Image read failed',
            'plugins.mindmap.propertyMedia.unsafeContent': 'Unsafe image content',
            'plugins.mindmap.propertyMedia.previewAlt': 'Node image preview',
            'plugins.mindmap.propertyMedia.removeImage': 'Remove node image',
            'plugins.mindmap.propertyMedia.iconGroups.priority': 'Priority',
            'plugins.mindmap.propertyMedia.iconGroups.status': 'Status',
            'plugins.mindmap.propertyMedia.iconGroups.people': 'People',
            'plugins.mindmap.propertyMedia.iconGroups.objects': 'Files and tools',
        }[key] ?? key),
    }),
}));

const renderControls = (
    overrides: Partial<React.ComponentProps<typeof MindMapPropertyMediaControls>> = {},
) => {
    const props: React.ComponentProps<typeof MindMapPropertyMediaControls> = {
        icons: ['🔥'],
        imageUrl: '',
        onIconToggle: vi.fn(),
        onImageChange: vi.fn(),
        onImageUrlCommit: vi.fn(() => true),
        onImageUrlInput: vi.fn(),
        ...overrides,
    };
    const view = render(<MindMapPropertyMediaControls {...props} />);
    return { ...view, props };
};

describe('MindMapPropertyMediaControls', () => {
    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('exposes selected markers as named native remove controls', () => {
        const { props } = renderControls();
        const remove = screen.getByRole('button', { name: 'Remove 🔥 marker' });

        expect(remove.tagName).toBe('BUTTON');
        expect(remove.getAttribute('type')).toBe('button');
        fireEvent.click(remove);
        expect(props.onIconToggle).toHaveBeenCalledWith('🔥');
    });

    it('opens a named marker dialog and exposes selection state', async () => {
        const { props } = renderControls();
        const trigger = screen.getByRole('button', { name: '1 markers selected' });

        expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(trigger);
        await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

        const dialog = await screen.findByRole('dialog', { name: 'Choose markers' });
        const selectedChoice = within(dialog).getByRole('button', { name: 'Remove 🔥 marker' });
        expect(selectedChoice.getAttribute('aria-pressed')).toBe('true');
        const newChoice = within(dialog).getByRole('button', { name: 'Add 💡 marker' });
        expect(newChoice.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(newChoice);
        expect(props.onIconToggle).toHaveBeenCalledWith('💡');
    });

    it('uses a named native upload button and reports an empty file in the UI', async () => {
        const { container } = renderControls();
        const upload = screen.getByRole('button', { name: 'Upload an image' });
        const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');

        expect(upload.tagName).toBe('BUTTON');
        expect(upload.getAttribute('type')).toBe('button');
        expect(fileInput).not.toBeNull();
        if (!fileInput) throw new Error('Expected the image file input');

        fireEvent.change(fileInput, {
            target: { files: [new File([], 'empty.png', { type: 'image/png' })] },
        });
        expect((await screen.findByRole('alert')).textContent).toBe('The selected image is empty');
    });

    it('does not apply a delayed image read after the selected-node controls unmount', async () => {
        const deferredReader: {
            onload: FileReader['onload'];
            onerror: FileReader['onerror'];
            readAsDataURL: ReturnType<typeof vi.fn>;
        } = {
            onload: null,
            onerror: null,
            readAsDataURL: vi.fn(),
        };
        vi.stubGlobal('FileReader', vi.fn(() => deferredReader));
        const { container, props, unmount } = renderControls();
        const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
        if (!fileInput) throw new Error('Expected the image file input');

        fireEvent.change(fileInput, {
            target: { files: [new File(['data'], 'node.png', { type: 'image/png' })] },
        });
        unmount();
        await act(async () => {
            deferredReader.onload?.call(
                deferredReader as unknown as FileReader,
                { target: { result: 'data:image/png;base64,AAAA' } } as ProgressEvent<FileReader>,
            );
            await Promise.resolve();
        });

        expect(props.onImageChange).not.toHaveBeenCalled();
    });

    it('announces an invalid URL without persisting it', () => {
        const onImageUrlCommit = vi.fn(() => false);
        renderControls({ imageUrl: 'javascript:alert(1)', onImageUrlCommit });

        fireEvent.blur(screen.getByRole('textbox', { name: 'Image URL' }));
        expect(onImageUrlCommit).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('alert').textContent).toBe('Invalid image URL');
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('renders a localized safe preview with a named remove control', () => {
        const { props } = renderControls({ imageUrl: 'https://example.com/node.png' });
        const preview = screen.getByRole('img', { name: 'Node image preview' });
        const remove = screen.getByRole('button', { name: 'Remove node image' });

        expect(preview.getAttribute('src')).toBe('https://example.com/node.png');
        expect(remove.tagName).toBe('BUTTON');
        fireEvent.click(remove);
        expect(props.onImageChange).toHaveBeenCalledWith('');
    });
});
