// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, forwardRef, type ReactNode, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controlsMock = vi.hoisted(() => ({
    dollyIn: vi.fn(),
    dollyOut: vi.fn(),
    getAzimuthalAngle: vi.fn(() => 0),
    getPolarAngle: vi.fn(() => Math.PI / 4),
    reset: vi.fn(),
    setAzimuthalAngle: vi.fn(),
    setPolarAngle: vi.fn(),
    update: vi.fn(),
}));

vi.mock('@react-three/fiber', async () => {
    const React = await import('react');
    return {
        Canvas: ({ children }: { children: ReactNode }) => createElement(
            'div',
            null,
            React.Children.toArray(children).filter((child) => (
                React.isValidElement<{ onStart?: () => void }>(child)
                && typeof child.props.onStart === 'function'
            )),
        ),
    };
});

vi.mock('@react-three/drei', () => ({
    AdaptiveDpr: () => null,
    ContactShadows: () => null,
    OrbitControls: forwardRef((
        { onStart }: { onStart?: () => void },
        ref,
    ) => {
        useImperativeHandle(ref, () => controlsMock);
        return createElement('button', { onClick: onStart, type: 'button' }, 'manual orbit');
    }),
    PerspectiveCamera: () => null,
    Sky: () => null,
}));

vi.mock('../WarehouseModel', () => ({ default: () => null }));

import i18n from '../../../i18n';
import ControlsOverlay from '../ControlsOverlay';
import Scene from '../Scene';
import { Warehouse3DProvider } from '../WarehouseContext';

describe('Warehouse 3D scene accessibility', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await i18n.changeLanguage('zh');
    });

    it('exposes a focusable scene with documented keyboard commands', () => {
        render(
            <Warehouse3DProvider>
                <Scene />
            </Warehouse3DProvider>,
        );

        const scene = screen.getByRole('region', { name: '3D 智能仓库交互场景' });
        expect(scene.getAttribute('tabindex')).toBe('0');
        expect(scene.getAttribute('aria-keyshortcuts')).toContain('ArrowLeft');
        expect(scene.getAttribute('aria-keyshortcuts')).toContain('Home');
        controlsMock.reset.mockClear();

        fireEvent.keyDown(scene, { key: 'ArrowLeft' });
        expect(controlsMock.setAzimuthalAngle).toHaveBeenCalledWith(-Math.PI / 18);

        fireEvent.keyDown(scene, { key: '+' });
        expect(controlsMock.dollyIn).toHaveBeenCalledWith(1.2);

        fireEvent.keyDown(scene, { key: 'Home' });
        expect(controlsMock.reset).toHaveBeenCalledTimes(1);
        expect(controlsMock.update).toHaveBeenCalledTimes(3);
    });

    it('hands manual camera control back to the user by stopping auto rotation', () => {
        render(
            <Warehouse3DProvider>
                <Scene />
                <ControlsOverlay />
            </Warehouse3DProvider>,
        );

        const autoRotate = screen.getByRole('button', { name: '自动旋转' });
        fireEvent.click(autoRotate);
        expect(autoRotate.getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(screen.getByRole('button', { name: 'manual orbit' }));
        expect(autoRotate.getAttribute('aria-pressed')).toBe('false');
    });
});
