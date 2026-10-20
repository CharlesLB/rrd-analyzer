import { describe, expect, it, vi } from 'vitest';
import { capturePointer, horizontalFractionOf, isPrimaryPress, verticalFractionOf } from './pointer-fraction.util';

const eventOver = (width: number, clientX: number, setPointerCapture = vi.fn()): PointerEvent =>
  ({
    clientX,
    pointerId: 7,
    currentTarget: { getBoundingClientRect: () => ({ left: 100, width }), setPointerCapture },
  }) as unknown as PointerEvent;

describe('horizontalFractionOf', () => {
  it('turns a pointer position into how far along the element it sits', () => {
    expect(horizontalFractionOf(eventOver(200, 150))).toBeCloseTo(0.25);
  });

  it('clamps a pointer dragged past either edge', () => {
    expect(horizontalFractionOf(eventOver(200, 40))).toBe(0);
    expect(horizontalFractionOf(eventOver(200, 400))).toBe(1);
  });

  it('reports the start of an element that has no width yet', () => {
    expect(horizontalFractionOf(eventOver(0, 150))).toBe(0);
  });
});

describe('verticalFractionOf', () => {
  const eventAt = (clientY: number, height: number): MouseEvent =>
    ({ clientY, currentTarget: { getBoundingClientRect: () => ({ top: 100, height }) } }) as unknown as MouseEvent;

  it('verticalFractionOf measures how far down the element the pointer is, clamped to its edges', () => {
    expect(verticalFractionOf(eventAt(150, 200))).toBe(0.25);
    expect(verticalFractionOf(eventAt(400, 200))).toBe(1);
  });

  it('verticalFractionOf reads an element with no height as its top', () => {
    expect(verticalFractionOf(eventAt(150, 0))).toBe(0);
  });
});

describe('capturePointer', () => {
  it('keeps the pointer on the element the gesture started on', () => {
    const setPointerCapture = vi.fn();
    capturePointer(eventOver(200, 150, setPointerCapture));

    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });
});

describe('isPrimaryPress', () => {
  it('isPrimaryPress holds for the main button alone, not the wheel or the context button', () => {
    expect([0, 1, 2].map((button) => isPrimaryPress(new PointerEvent('pointerdown', { button })))).toEqual([true, false, false]);
  });
});
