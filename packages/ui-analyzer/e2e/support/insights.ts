import { expect, type Locator, type Page } from '@playwright/test';

const INSIGHTS_REQUEST_PATTERN = '**/api/analyses/*/insights';
const INSIGHTS_CONFIGURATION_PATTERN = '**/api/insights/configuration';
const EDITED_HASH = 'edited-since-the-run';

type RunGate = {
  open: () => void;
};

export const insightsPanel = (page: Page): Locator => page.locator('.insights-panel');

export const insightBands = (page: Page): Locator => page.locator('.plot-drawing-band');

export const editInsightRulesWhileAway = async (page: Page): Promise<void> => {
  await page.route(INSIGHTS_CONFIGURATION_PATTERN, async (route) => {
    await route.fulfill({ json: { rulesetHash: EDITED_HASH, classifierHash: EDITED_HASH } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
};

export const insightsCount = (page: Page): Locator => page.locator('.insights-trigger-count');

export const findingCards = (page: Page): Locator => page.locator('.finding-card');

export const findingTitles = (page: Page): Locator => page.locator('.finding-card-title');

export const runInsights = async (page: Page): Promise<void> => {
  await page.locator('.insights-trigger-idle').click();
  await expect(insightsPanel(page)).toBeVisible();
};

export const chooseInsightsScope = async (page: Page, label: string): Promise<void> => {
  await page.locator('.insights-panel-scope .option-select-trigger').click();
  await page.locator('.insights-panel-scope .option-select-menu .option-menu-item').filter({ hasText: label }).click();
};

export const holdInsightsRuns = async (page: Page): Promise<() => void> => {
  const gate: RunGate = { open: () => undefined };

  const opened = new Promise<void>((resolve) => {
    gate.open = () => resolve();
  });

  await page.route(INSIGHTS_REQUEST_PATTERN, async (route) => {
    await opened;
    await route.fallback();
  });

  return () => gate.open();
};
