export type Screenshot = {
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly isOnDarkSurround: boolean;
};

const SCREENSHOT_WIDTH = 924;
const SCREENSHOT_HEIGHT = 540;

const screenshotAt = (source: string): Screenshot => ({ source, width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT, isOnDarkSurround: false });

export const SCREENSHOTS = {
  WORKSPACE: screenshotAt('screenshots/workspace.jpg'),
  WORKSPACE_DARK: screenshotAt('screenshots/workspace-dark.jpg'),
  TIME_WINDOW: screenshotAt('screenshots/timeframe.jpg'),
  INSIGHTS: screenshotAt('screenshots/insights.jpg'),
  LOGS: screenshotAt('screenshots/logs.jpg'),
  EXPORT: { ...screenshotAt('screenshots/export.png'), isOnDarkSurround: true },
} as const;
