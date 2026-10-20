import { vi } from 'vitest';

const CLIPBOARD_PROPERTY = 'clipboard';

export class RecordedClipboardItem {
  public constructor(public readonly items: Readonly<Record<string, Promise<Blob>>>) {}
}

export type ClipboardWrite = (items: readonly RecordedClipboardItem[]) => Promise<void>;

export const stubClipboard = (write?: ClipboardWrite): void => {
  vi.stubGlobal('ClipboardItem', RecordedClipboardItem);
  Object.defineProperty(globalThis.navigator, CLIPBOARD_PROPERTY, { value: write === undefined ? {} : { write }, configurable: true });
};

export const removeClipboard = (): void => {
  Reflect.deleteProperty(globalThis.navigator, CLIPBOARD_PROPERTY);
};
