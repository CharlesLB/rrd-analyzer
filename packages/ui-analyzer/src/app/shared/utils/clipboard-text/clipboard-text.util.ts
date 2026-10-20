const TEXT_AREA_ELEMENT = 'textarea';
const COPY_COMMAND = 'copy';
const FIXED_POSITION = 'fixed';
const INVISIBLE_OPACITY = '0';

const copyThroughSelection = (text: string, document: Document): boolean => {
  const holder = document.createElement(TEXT_AREA_ELEMENT);

  holder.value = text;
  holder.style.position = FIXED_POSITION;
  holder.style.opacity = INVISIBLE_OPACITY;
  document.body.appendChild(holder);
  holder.select();

  try {
    return document.execCommand(COPY_COMMAND);
  } catch {
    return false;
  } finally {
    holder.remove();
  }
};

export const copyText = async (text: string, document: Document): Promise<boolean> => {
  try {
    await globalThis.navigator.clipboard.writeText(text);

    return true;
  } catch {
    return copyThroughSelection(text, document);
  }
};
