import { createDecipheriv } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { DAEMON_URL } from './daemon';
import { analysisRow } from './library';

const SHARE_SERVICE_HOST = '127.0.0.1';
export const SHARE_SERVICE_PORT = 34190;
export const SHARE_SERVICE_URL = `http://${SHARE_SERVICE_HOST}:${SHARE_SERVICE_PORT}`;

const SHARED_LINK_MARKER = '#/shared/';
const LINK_SEPARATOR = '/';
const KEY_ENCODING = 'base64url';
const CIPHER = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ADDITIONAL_DATA_PREFIX = 'rrd-analyzer/1/';
const STATE_SUFFIX = '/state';

export type SessionLink = {
  readonly sessionId: string;
  readonly key: Buffer;
};

type SharedFile = {
  readonly fileId: string;
  readonly name: string;
  readonly chunkCount: number;
};

export type SharedState = {
  readonly name: string;
  readonly files: readonly SharedFile[];
  readonly canvas: readonly { readonly label: string }[];
};

export const shareTrigger = (page: Page): Locator => page.locator('.share-trigger');

export const shareWarning = (page: Page): Locator => page.locator('.share-warning-dialog');

export const sharePanel = (page: Page): Locator => page.locator('.share-panel');

export const sharedFileNames = (page: Page): Locator => page.locator('.share-panel-file-name');

export const sharedFileStates = (page: Page): Locator => page.locator('.share-panel-state');

export const shareMark = (page: Page, analysisName: string): Locator => analysisRow(page, analysisName).locator('.analysis-row-share');

export const sessionLinkOf = (link: string): SessionLink => {
  const [sessionId = '', key = ''] = link.slice(link.indexOf(SHARED_LINK_MARKER) + SHARED_LINK_MARKER.length).split(LINK_SEPARATOR);

  return { sessionId, key: Buffer.from(key, KEY_ENCODING) };
};

export const liveSessionsOfTheDaemon = async (page: Page): Promise<unknown> => await (await page.request.get(`${DAEMON_URL}/api/sessions`)).json();

export const answersOfTheService = async (page: Page, paths: readonly string[]): Promise<readonly number[]> =>
  await Promise.all(paths.map(async (path) => (await page.request.get(`${SHARE_SERVICE_URL}${path}`)).status()));

export const sessionPath = (sessionId: string): string => `/api/sessions/${sessionId}`;

export const statePath = (sessionId: string): string => `${sessionPath(sessionId)}${STATE_SUFFIX}`;

export const chunkPaths = (sessionId: string, files: readonly SharedFile[]): readonly string[] =>
  files.flatMap((file) => Array.from({ length: file.chunkCount }, (_unused, index) => `${sessionPath(sessionId)}/files/${file.fileId}/chunks/${index}`));

export const sealedStateOf = async (page: Page, sessionId: string): Promise<Buffer> =>
  await (await page.request.get(`${SHARE_SERVICE_URL}${statePath(sessionId)}`)).body();

export const openedState = (link: SessionLink, sealed: Buffer): SharedState => {
  const decipher = createDecipheriv(CIPHER, link.key, sealed.subarray(0, NONCE_BYTES));

  decipher.setAAD(Buffer.from(`${ADDITIONAL_DATA_PREFIX}${link.sessionId}${STATE_SUFFIX}`));
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));

  const plaintext = Buffer.concat([decipher.update(sealed.subarray(NONCE_BYTES, sealed.length - TAG_BYTES)), decipher.final()]);

  return JSON.parse(plaintext.toString()) as SharedState;
};
