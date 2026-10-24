import type { ValueOf } from '../../types/value-of';

const DRAG_MEDIA_TYPE = 'text/plain';
const FILES_TRANSFER_TYPE = 'Files';

export const DRAG_EFFECTS = {
  MOVE: 'move',
  COPY_MOVE: 'copyMove',
} as const;

export type DragEffect = ValueOf<typeof DRAG_EFFECTS>;

export const startDragTransfer = (event: DragEvent, payload: string, effect: DragEffect): void => {
  const transfer = event.dataTransfer;

  if (!transfer) {
    return;
  }

  transfer.setData(DRAG_MEDIA_TYPE, payload);
  transfer.effectAllowed = effect;
};

export const hasLeftTarget = (event: DragEvent): boolean => {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();

  return event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom;
};

export type FileCarryingDragEvent = DragEvent & { readonly dataTransfer: DataTransfer };

export const carriesFiles = (event: DragEvent): event is FileCarryingDragEvent => event.dataTransfer?.types.includes(FILES_TRANSFER_TYPE) ?? false;

export const firstDroppedFileOf = (event: DragEvent): File | null => event.dataTransfer?.files[0] ?? null;
