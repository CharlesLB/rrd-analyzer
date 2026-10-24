import { describe, expect, it, vi } from 'vitest';
import { offsetRightOf, placeUnderAnchor, placeUnderLeftEdge } from './anchored-popover.util';

const MENU_SIZE = { width: 254, heightAllowance: 290 };

describe('placeUnderAnchor', () => {
  it('placeUnderAnchor opens six pixels under the anchor, its right edge aligned with the anchor’s', () => {
    expect(placeUnderAnchor({ top: 72.4, bottom: 94.4, right: 877.6 }, { width: 924, height: 540 }, MENU_SIZE)).toEqual({
      top: 100,
      bottom: null,
      right: 46,
    });
  });

  it('placeUnderAnchor keeps ten pixels from the right edge of the viewport', () => {
    expect(placeUnderAnchor({ top: 18, bottom: 40, right: 1436 }, { width: 1440, height: 900 }, MENU_SIZE)).toEqual({
      top: 46,
      bottom: null,
      right: 10,
    });
  });

  it('placeUnderAnchor opens upward when there is no room below and more above', () => {
    expect(placeUnderAnchor({ top: 556.2, bottom: 578.2, right: 1236 }, { width: 1280, height: 720 }, MENU_SIZE)).toEqual({
      top: null,
      bottom: 170,
      right: 44,
    });
  });

  it('placeUnderAnchor measures the room below against the height the popover asks for', () => {
    expect(placeUnderAnchor({ top: 556.2, bottom: 578.2, right: 1236 }, { width: 1280, height: 720 }, { width: 254, heightAllowance: 100 })).toEqual({
      top: 584,
      bottom: null,
      right: 44,
    });
  });
});

describe('placeUnderAnchor near the left edge', () => {
  it('placeUnderAnchor moves a menu wider than the room left of its anchor right until it is ten pixels in', () => {
    expect(placeUnderAnchor({ top: 60, bottom: 82, right: 200 }, { width: 700, height: 900 }, { width: 330, heightAllowance: 260 })).toEqual({
      top: 88,
      bottom: null,
      right: 360,
    });
  });
});

describe('placeUnderLeftEdge', () => {
  it('placeUnderLeftEdge opens six pixels under the anchor, its left edge aligned with the anchor’s', () => {
    expect(placeUnderLeftEdge({ left: 80.4, bottom: 40 }, { width: 1440, height: 900 }, 240)).toEqual({ top: 46, bottom: null, right: 1120 });
  });

  it('placeUnderLeftEdge keeps ten pixels from the right edge of a viewport narrower than the menu needs', () => {
    expect(placeUnderLeftEdge({ left: 300, bottom: 40 }, { width: 500, height: 900 }, 240)).toEqual({ top: 46, bottom: null, right: 10 });
  });
});

const boxedAt = (left: number, right: number): HTMLElement => {
  const element = document.createElement('div');

  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left, right } as DOMRect);

  return element;
};

describe('offsetRightOf', () => {
  it('offsetRightOf measures the right edge of an element from the left edge of the container it is positioned in', () => {
    const element = boxedAt(300, 420);
    Object.defineProperty(element, 'offsetParent', { value: boxedAt(120, 900) });

    expect(offsetRightOf(element)).toBe(300);
  });

  it('offsetRightOf of an element positioned in no container measures it from the left edge of the page', () => {
    const element = boxedAt(300, 420);
    Object.defineProperty(element, 'offsetParent', { value: null });

    expect(offsetRightOf(element)).toBe(420);
  });
});
