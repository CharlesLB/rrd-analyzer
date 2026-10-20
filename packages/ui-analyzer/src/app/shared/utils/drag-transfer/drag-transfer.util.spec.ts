import { describe, expect, it, vi } from 'vitest';
import { carriesFiles, DRAG_EFFECTS, firstDroppedFileOf, hasLeftTarget, startDragTransfer } from './drag-transfer.util';

describe('startDragTransfer', () => {
  it('carries the payload as plain text with the allowed effect', () => {
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: 'none' };

    startDragTransfer({ dataTransfer } as unknown as DragEvent, 's3', DRAG_EFFECTS.COPY_MOVE);

    expect(setData).toHaveBeenCalledWith('text/plain', 's3');
    expect(dataTransfer.effectAllowed).toBe('copyMove');
  });

  it('does nothing for an event without a data transfer', () => {
    expect(() => startDragTransfer({ dataTransfer: null } as DragEvent, 's3', DRAG_EFFECTS.MOVE)).not.toThrow();
  });
});

describe('hasLeftTarget', () => {
  const eventAt = (clientX: number, clientY: number): DragEvent =>
    ({ clientX, clientY, currentTarget: { getBoundingClientRect: () => ({ left: 100, right: 300, top: 50, bottom: 150 }) } }) as unknown as DragEvent;

  it('keeps a drag that only crossed into a child of the element', () => {
    expect(hasLeftTarget(eventAt(200, 100))).toBe(false);
    expect(hasLeftTarget(eventAt(100, 50))).toBe(false);
  });

  it('sees a drag that went past any edge of the element as gone', () => {
    expect(hasLeftTarget(eventAt(99, 100))).toBe(true);
    expect(hasLeftTarget(eventAt(300, 100))).toBe(true);
    expect(hasLeftTarget(eventAt(200, 49))).toBe(true);
    expect(hasLeftTarget(eventAt(200, 150))).toBe(true);
  });
});

describe('carriesFiles', () => {
  it('carriesFiles, for a drag from the file manager, says yes, and for a chart being dragged, no', () => {
    expect(carriesFiles({ dataTransfer: { types: ['Files'] } } as unknown as DragEvent)).toBe(true);
    expect(carriesFiles({ dataTransfer: { types: ['text/plain'] } } as unknown as DragEvent)).toBe(false);
    expect(carriesFiles({ dataTransfer: null } as DragEvent)).toBe(false);
  });
});

describe('firstDroppedFileOf', () => {
  it('firstDroppedFileOf, for a drop of several files, takes the first, and nothing when no file was dropped', () => {
    const file = new File(['[]'], 'logs.json');

    expect(firstDroppedFileOf({ dataTransfer: { files: [file, new File([''], 'other.json')] } } as unknown as DragEvent)).toBe(file);
    expect(firstDroppedFileOf({ dataTransfer: { files: [] } } as unknown as DragEvent)).toBeNull();
  });
});
