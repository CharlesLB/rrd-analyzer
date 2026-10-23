declare const RELEASE_VERSION: string;

const REPOSITORY_URL = 'https://github.com/CharlesLB/rrd-analyzer';

export const LANDING_CONFIGURATION = {
  releaseVersion: RELEASE_VERSION,
  repositoryUrl: REPOSITORY_URL,
} as const;

export const PROJECT_LINKS = {
  repository: REPOSITORY_URL,
  releases: `${REPOSITORY_URL}/releases`,
  releaseNotes: `${REPOSITORY_URL}/releases/tag/v${RELEASE_VERSION}`,
  issues: `${REPOSITORY_URL}/issues`,
  buildFromSource: `${REPOSITORY_URL}#building-it-yourself`,
  donation: 'https://ko-fi.com/charleslb',
  browserApp: 'app/',
} as const;
