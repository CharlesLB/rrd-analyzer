import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';

export const downloadedBytes = async (download: Download): Promise<Buffer> => {
  const savedPath = await download.path();

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is where Playwright itself saved the download, never a value typed into the page
  return await readFile(savedPath);
};

export const downloadFrom = async (page: Page, pick: () => Promise<void>): Promise<Download> => {
  const downloading = page.waitForEvent('download');

  await pick();

  return await downloading;
};
