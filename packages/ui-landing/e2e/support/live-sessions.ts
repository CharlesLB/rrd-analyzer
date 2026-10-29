import { type BrowserContext, expect, type Locator, type Page, type Request, type WebSocketRoute } from '@playwright/test';

const SERVICE_HOST = '127.0.0.1';
export const SHARE_SERVICE_PORT = 4302;
export const EXPIRING_SHARE_SERVICE_PORT = 4303;
export const EXPIRY_MILLISECONDS = 15_000;
export const SHARE_SERVICE_URL = `http://${SERVICE_HOST}:${SHARE_SERVICE_PORT}`;
export const EXPIRING_SHARE_SERVICE_URL = `http://${SERVICE_HOST}:${EXPIRING_SHARE_SERVICE_PORT}`;

const SHARE_SERVICE_ADDRESS = `${SERVICE_HOST}:${SHARE_SERVICE_PORT}`;
const EXPIRING_SHARE_SERVICE_ADDRESS = `${SERVICE_HOST}:${EXPIRING_SHARE_SERVICE_PORT}`;
const API_PATH = '/api/';
const SHARED_LINK_MARKER = '#/shared/';
const LINK_SEPARATOR = '/';
const CHUNK_PATH = /\/files\/[\w-]+\/chunks\/\d+$/;
const READING_METHOD = 'GET';
const CLIPBOARD_PERMISSIONS = ['clipboard-read', 'clipboard-write'];

type RequestRecording = {
  readonly requests: readonly Request[];
};

export const recordServiceCalls = (context: BrowserContext): RequestRecording => {
  const requests: Request[] = [];

  context.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith(API_PATH)) {
      requests.push(request);
    }
  });

  return { requests };
};

export const sentBodies = (recording: RequestRecording): readonly Buffer[] =>
  recording.requests.filter((request) => request.method() !== READING_METHOD).flatMap((request) => request.postDataBuffer() ?? []);

export const uploadedChunkPaths = (recording: RequestRecording): readonly string[] =>
  recording.requests
    .filter((request) => request.method() !== READING_METHOD && CHUNK_PATH.test(request.url()))
    .map((request) => new URL(request.url()).pathname);

export const sessionIdOf = (link: string): string => link.slice(link.indexOf(SHARED_LINK_MARKER) + SHARED_LINK_MARKER.length).split(LINK_SEPARATOR)[0] ?? '';

export const sessionPath = (sessionId: string): string => `/api/sessions/${sessionId}`;

export const answersOf = async (page: Page, serviceUrl: string, paths: readonly string[]): Promise<readonly number[]> =>
  await Promise.all(paths.map(async (path) => (await page.request.get(`${serviceUrl}${path}`)).status()));

const atTheExpiringService = (url: string): string => url.replace(SHARE_SERVICE_ADDRESS, EXPIRING_SHARE_SERVICE_ADDRESS);

const relayToTheExpiringService = (socket: WebSocketRoute): void => {
  const upstream = new WebSocket(atTheExpiringService(socket.url()));

  upstream.addEventListener('message', (event) => socket.send(String(event.data)));
  upstream.addEventListener('close', (event) => void socket.close({ code: event.code, reason: event.reason }));
  socket.onMessage((message) => upstream.send(typeof message === 'string' ? message : new Uint8Array(message)));
  socket.onClose(() => upstream.close());
};

export const servedByTheExpiringService = async (context: BrowserContext): Promise<void> => {
  await context.route(`${SHARE_SERVICE_URL}${API_PATH}**`, async (route) => {
    const answer = await route.fetch({ url: atTheExpiringService(route.request().url()) });

    await route.fulfill({ response: answer });
  });
  await context.routeWebSocket(`ws://${SHARE_SERVICE_ADDRESS}${API_PATH}**`, relayToTheExpiringService);
};

export const allowTheClipboard = async (context: BrowserContext): Promise<void> => {
  await context.grantPermissions(CLIPBOARD_PERMISSIONS, { origin: SHARE_SERVICE_URL });
};

export const shareTrigger = (page: Page): Locator => page.locator('.share-trigger');

export const sharePanel = (page: Page): Locator => page.locator('.share-panel');

export const sharedStates = (page: Page): Locator => page.locator('.share-panel-state');

export const chartTitles = (page: Page): Locator => page.locator('.chart-panel-header-title');

export const toastMessage = (page: Page): Locator => page.locator('.toast .toast-message');

export const liveBanner = (page: Page): Locator => page.locator('.live-session-banner');

export const shareMark = (page: Page): Locator => page.locator('.analysis-row-share');

export const sharedSessionTitle = (page: Page): Locator => page.locator('.shared-session-page-title');

export const shareLive = async (page: Page): Promise<string> => {
  await shareTrigger(page).click();
  await page.locator('.share-warning-dialog-confirm').click();
  await expect(sharePanel(page)).toBeVisible();

  return await page.locator('.share-panel-link-field').inputValue();
};
