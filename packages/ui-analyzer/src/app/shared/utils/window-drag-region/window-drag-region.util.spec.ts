import { afterEach, describe, expect, it } from 'vitest';
import { isWindowDragRegion } from './window-drag-region.util';

const elementMarked = (value: string): HTMLElement => {
  const element = document.createElement('div');
  element.style.setProperty('--wails-draggable', value);
  document.body.append(element);

  return element;
};

describe('isWindowDragRegion', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('recognises an element marked as a place to drag the window from', () => {
    expect(isWindowDragRegion(elementMarked('drag'))).toBe(true);
  });

  it('refuses an element exempted from dragging, and one never marked at all', () => {
    expect(isWindowDragRegion(elementMarked('no-drag'))).toBe(false);
    expect(isWindowDragRegion(document.body.appendChild(document.createElement('button')))).toBe(false);
  });

  it('refuses a target that is not an element', () => {
    expect(isWindowDragRegion(null)).toBe(false);
    expect(isWindowDragRegion(document.createTextNode('RRD Analyzer'))).toBe(false);
  });
});
