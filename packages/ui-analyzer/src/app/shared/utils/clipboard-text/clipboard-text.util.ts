export const copyText = async (text: string): Promise<boolean> => {
  try {
    await globalThis.navigator.clipboard.writeText(text);

    return true;
  } catch {
    return false;
  }
};
