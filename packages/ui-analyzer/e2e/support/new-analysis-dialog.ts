import { expect, type FileChooser, type JSHandle, type Locator, type Page } from '@playwright/test';
import { openLibrary } from './analyzer';

export type PickedSources = Parameters<FileChooser['setFiles']>[0];

export type DroppedFile = {
  readonly name: string;
  readonly size: number;
};

const DRAG_EVENTS = {
  OVER: 'dragover',
  LEAVE: 'dragleave',
  DROP: 'drop',
} as const;

export const emptyDump = (name: string, size: number) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(size) });

export const newAnalysisDialog = (page: Page): Locator => page.locator('.new-analysis-dialog');

export const sourceNames = (page: Page): Locator => page.locator('.pending-source-list-name');

export const sourceSizes = (page: Page): Locator => page.locator('.pending-source-list-size');

export const sourceCountLabel = (page: Page): Locator => page.locator('.pending-source-list-count');

export const readinessHint = (page: Page): Locator => page.locator('.new-analysis-dialog-hint');

export const createButton = (page: Page): Locator => page.locator('.new-analysis-dialog-create');

export const nameInput = (page: Page): Locator => page.locator('.new-analysis-dialog-input');

export const dropZone = (page: Page): Locator => page.locator('.source-drop-zone');

export const openNewAnalysisDialog = async (page: Page): Promise<void> => {
  await openLibrary(page);
  await page.locator('.new-analysis-card').click();
  await expect(newAnalysisDialog(page)).toBeVisible();
};

export const pickSources = async (page: Page, sources: PickedSources): Promise<void> => {
  const choosing = page.waitForEvent('filechooser');

  await dropZone(page).click();

  const chooser = await choosing;

  await chooser.setFiles(sources);
};

const transferOf = async (page: Page, files: readonly DroppedFile[]): Promise<JSHandle<DataTransfer>> =>
  await page.evaluateHandle(
    (described) =>
      described.reduce((transfer, file) => {
        transfer.items.add(new File([new Uint8Array(file.size)], file.name));

        return transfer;
      }, new DataTransfer()),
    files,
  );

export const dragFilesOverDropZone = async (page: Page, files: readonly DroppedFile[]): Promise<void> => {
  await dropZone(page).dispatchEvent(DRAG_EVENTS.OVER, { dataTransfer: await transferOf(page, files) });
};

export const dragFilesAwayFromDropZone = async (page: Page, files: readonly DroppedFile[]): Promise<void> => {
  await dropZone(page).dispatchEvent(DRAG_EVENTS.LEAVE, { dataTransfer: await transferOf(page, files) });
};

export const dropFilesOnDropZone = async (page: Page, files: readonly DroppedFile[]): Promise<void> => {
  await dropZone(page).dispatchEvent(DRAG_EVENTS.DROP, { dataTransfer: await transferOf(page, files) });
};
