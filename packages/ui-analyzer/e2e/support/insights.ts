import { expect, type Locator, type Page } from '@playwright/test';

const INSIGHTS_REQUEST_PATTERN = '**/api/analyses/*/insights';
const INSIGHTS_CONFIGURATION_PATTERN = '**/api/insights/configuration';
const EDITED_HASH = 'edited-since-the-run';
const ENGINE_FAILURE_STATUS = 500;
const ENGINE_FAILURE_BODY = 'the insights engine could not read its rules';
const OPACITY_ATTRIBUTE = 'opacity';
const STROKE_ATTRIBUTE = 'stroke';

type RunGate = {
  open: () => void;
};

export const insightsPanel = (page: Page): Locator => page.locator('.insights-panel');

export const insightBands = (page: Page): Locator => page.locator('.plot-drawing-band');

export const insightMarks = (page: Page): Locator => page.locator('.plot-drawing-mark');

const attributesOf = async (locator: Locator, attribute: string): Promise<readonly (string | null)[]> =>
  await locator.evaluateAll((nodes, name) => nodes.map((node) => node.getAttribute(name)), attribute);

export const bandOpacities = async (page: Page): Promise<readonly (string | null)[]> => await attributesOf(insightBands(page), OPACITY_ATTRIBUTE);

export const bandStrokes = async (page: Page): Promise<readonly (string | null)[]> => await attributesOf(insightBands(page), STROKE_ATTRIBUTE);

export const markOpacities = async (page: Page): Promise<readonly (string | null)[]> => await attributesOf(insightMarks(page), OPACITY_ATTRIBUTE);

export const failInsightsRuns = async (page: Page): Promise<void> => {
  await page.route(INSIGHTS_REQUEST_PATTERN, async (route) => {
    await route.fulfill({ status: ENGINE_FAILURE_STATUS, body: ENGINE_FAILURE_BODY });
  });
};

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
