const DATA_URL_PAYLOAD_SEPARATOR = ',';

export const dataUrlOf = async (blob: Blob): Promise<string> =>
  await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);

        return;
      }

      reject(new Error('the blob was not read as a data url'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('the blob could not be read')));
    reader.readAsDataURL(blob);
  });

export const base64Of = async (blob: Blob): Promise<string> => {
  const dataUrl = await dataUrlOf(blob);

  return dataUrl.slice(dataUrl.indexOf(DATA_URL_PAYLOAD_SEPARATOR) + 1);
};

export const blobOfBase64 = (encoded: string, type: string): Blob =>
  new Blob([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], { type });
