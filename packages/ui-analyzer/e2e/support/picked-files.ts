import type { Page } from '@playwright/test';
import { daemonAddressed } from './daemon';
import type { PickedSources } from './new-analysis-dialog';
import type { WrittenSource } from './rrd-fixtures';

const ADD_SOURCES_PATTERN = '**/api/analyses/*/sources';
const POST_METHOD = 'POST';
const ADD_FILES_OPTION = 'Add RRD files';

type PickedFile = {
  readonly name: string;
  readonly path: string;
  readonly size: number;
};

const locatedOnDisk =
  (written: readonly WrittenSource[]) =>
  (file: PickedFile): PickedFile =>
    written.find((source) => source.name === file.name) ?? file;

export const giveThePickedFilesTheirPaths = async (page: Page, written: readonly WrittenSource[]): Promise<void> => {
  await page.route(ADD_SOURCES_PATTERN, async (route) => {
    if (route.request().method() !== POST_METHOD) {
      await route.fallback();

      return;
    }

    const body = route.request().postDataJSON() as { files: readonly PickedFile[] };
    const located = JSON.stringify({ files: body.files.map(locatedOnDisk(written)) });
    const answer = await route.fetch({ url: daemonAddressed(route.request().url()), postData: located });

    await route.fulfill({ response: answer });
  });
};

export const addSourcesFromMenu = async (page: Page, sources: PickedSources): Promise<void> => {
  const choosing = page.waitForEvent('filechooser');

  await page.locator('.analysis-title-menu-toggle').click();
  await page.locator('app-analysis-title .menu-option').filter({ hasText: ADD_FILES_OPTION }).click();
  await (await choosing).setFiles(sources);
};
