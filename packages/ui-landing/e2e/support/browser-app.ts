import { expect, type Locator, type Page, type Request } from '@playwright/test';

const BROWSER_APP_PATH = '/app/';
export const SAMPLE_ANALYSIS = 'Sample API · production';
export const SAMPLE_LINE_COUNT = 5;
export const SAMPLE_FINDING_COUNT = 4;

const SITE_HOST = '127.0.0.1';
const READING_METHOD = 'GET';
const STEP_SECONDS = 300;
const DUMP_MIME_TYPE = 'text/xml';

export const analysisNames = (page: Page): Locator => page.locator('.analysis-row-name');

export const drawnLines = (page: Page): Locator => page.locator('.plot-drawing-line[d^="M"]');

export const openBrowserApp = async (page: Page): Promise<void> => {
  await page.goto(BROWSER_APP_PATH);
  await expect(analysisNames(page).first()).toBeVisible();
};

export const xmlDumpOf = (values: readonly number[]): string =>
  `<rrd><version>0003</version><step>${STEP_SECONDS}</step><lastupdate>${values.length * STEP_SECONDS}</lastupdate>` +
  '<ds><name>value</name><type>GAUGE</type></ds><rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>' +
  values.map((value) => `<row><v>${value}</v></row>`).join('') +
  '</database></rra></rrd>';

export const createAnalysisFrom = async (page: Page, fileName: string, content: string): Promise<void> => {
  await page.locator('.new-analysis-card').click();

  const chooser = page.waitForEvent('filechooser');

  await page.locator('.source-drop-zone').click();
  await (await chooser).setFiles({ name: fileName, mimeType: DUMP_MIME_TYPE, buffer: Buffer.from(content) });
  await expect(page.locator('.pending-source-list-name')).toHaveText([fileName]);
  await page.locator('.new-analysis-dialog-create').click();
};

type RequestRecording = {
  readonly requests: readonly Request[];
};

export const recordRequests = (page: Page): RequestRecording => {
  const requests: Request[] = [];

  page.on('request', (request) => requests.push(request));

  return { requests };
};

export const leavesTheSite = (request: Request): boolean => new URL(request.url()).hostname !== SITE_HOST;

export const sendsSomething = (request: Request): boolean => request.method() !== READING_METHOD;
