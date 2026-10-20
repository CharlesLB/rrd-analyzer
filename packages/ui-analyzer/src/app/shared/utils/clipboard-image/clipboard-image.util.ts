export const canCopyImages = (): boolean => typeof ClipboardItem !== 'undefined' && typeof globalThis.navigator?.clipboard?.write === 'function';

export const copyImage = async (image: Promise<Blob>, mimeType: string): Promise<void> => {
  await navigator.clipboard.write([new ClipboardItem({ [mimeType]: image })]);
};
