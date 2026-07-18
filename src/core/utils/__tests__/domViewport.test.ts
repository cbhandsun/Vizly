// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  projectFlowPositionToScreenPosition,
  projectScreenPositionToFlowPosition,
  readDomViewport,
  readReactFlowCanvasSize,
  readReactFlowContainerRect,
} from '../domViewport';

describe('domViewport', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads viewport transform from the react-flow viewport element', () => {
    document.body.innerHTML = '<div class="react-flow__viewport" style="transform: translate(120px, -40px) scale(1.5);"></div>';

    expect(readDomViewport()).toEqual({ x: 120, y: -40, zoom: 1.5 });
  });

  it('reads container bounds and canvas size with safe fallbacks', () => {
    document.body.innerHTML = '<div class="react-flow"></div>';
    const container = document.querySelector('.react-flow') as HTMLElement;

    Object.defineProperty(container, 'clientWidth', { value: 900, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    container.getBoundingClientRect = () => ({
      left: 15,
      top: 25,
      width: 910,
      height: 610,
      right: 925,
      bottom: 635,
      x: 15,
      y: 25,
      toJSON: () => ({}),
    });

    expect(readReactFlowContainerRect()).toEqual({
      left: 15,
      top: 25,
      width: 910,
      height: 610,
    });
    expect(readReactFlowCanvasSize()).toEqual({ width: 910, height: 610 });
  });

  it('projects between flow and screen positions using viewport and container bounds', () => {
    const viewport = { x: 100, y: 50, zoom: 2 };
    const containerRect = { left: 30, top: 40 };

    expect(projectFlowPositionToScreenPosition({
      flowX: 25,
      flowY: 35,
      viewport,
      containerRect,
    })).toEqual({ x: 180, y: 160 });

    expect(projectScreenPositionToFlowPosition({
      screenX: 180,
      screenY: 160,
      viewport,
      containerRect,
    })).toEqual({ x: 25, y: 35 });
  });
});
