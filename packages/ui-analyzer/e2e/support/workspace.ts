import { expect, type Locator, type Page } from '@playwright/test';

type ScreenBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const PLOT_MIDDLE = 0.5;
const DRAG_STEPS = 12;
const DRAG_LIFT_STEPS = 4;
const DRAG_LIFT_OFFSET = 24;
const ABSOLUTE_TAB_LABEL = 'Absolute';
const ADD_TO_CANVAS_ITEM = 'Add to canvas';

export const timeframeLabel = (page: Page): Locator => page.locator('.time-nav-dates-label');

export const durationAndStep = (page: Page): Locator => page.locator('.time-nav-dates');

export const dayBackArrow = (page: Page): Locator => page.getByLabel('back one day');

export const dayForwardArrow = (page: Page): Locator => page.getByLabel('forward one day');

export const arrowTooltipTitle = (page: Page): Locator => page.locator('.time-nav-arrow-tip-title');

export const arrowTooltipDetail = (page: Page): Locator => page.locator('.time-nav-arrow-tip-detail');

export const analysisTitleName = (page: Page): Locator => page.locator('.analysis-title-name');

export const analysisUnavailableTitle = (page: Page): Locator => page.locator('.analysis-unavailable-title');

export const analysisUnavailableHint = (page: Page): Locator => page.locator('.analysis-unavailable-hint');

export const analysisUnavailableSources = (page: Page): Locator => page.locator('.analysis-unavailable-source');

export const backToLibrary = async (page: Page): Promise<void> => {
  await page.locator('.timeframe-bar-back').click();
};

export const chartLibraryCount = (page: Page): Locator => page.locator('.chart-library-count');

export const chartLibraryFilter = (page: Page): Locator => page.locator('.chart-library-filter input');

export const chartPanels = (page: Page): Locator => page.locator('.chart-panel');

export const chartTitles = (page: Page): Locator => page.locator('.chart-panel-header-title');

export const drawnLines = (page: Page): Locator => page.locator('.plot-drawing-line[d^="M"]');

export const statisticUnits = (page: Page): Locator => page.locator('.chart-panel-header-stats-unit');

export const currentStatValues = (page: Page): Locator => page.locator('.chart-panel-header-stat-value-current');

export const statChip = (chart: Locator, label: string): Locator => chart.locator('.chart-panel-header-stat-chip').filter({ hasText: label });

export const referenceLabels = (chart: Locator): Locator => chart.locator('.chart-plot-reference-label');

export const statValues = (page: Page, label: string): Locator =>
  page
    .locator('.chart-panel-header-stat')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('.chart-panel-header-stat-value');

export const libraryNames = (page: Page): Locator => page.locator('.library-thumbnail-name');

export const onCanvasLibraryNames = (page: Page): Locator => page.locator('.library-thumbnail-on-canvas .library-thumbnail-name');

export const libraryThumbnail = (page: Page, label: string): Locator =>
  page.locator('.library-thumbnail').filter({ has: page.getByText(label, { exact: true }) });

export const openContextMenuOn = async (page: Page, label: string): Promise<void> => {
  await libraryThumbnail(page, label).click({ button: 'right' });
  await expect(page.locator('.context-menu')).toBeVisible();
};

export const contextMenuItem = (page: Page, name: string): Locator => page.locator('.context-menu').getByRole('button', { name, exact: true });

export const addToCanvas = async (page: Page, label: string): Promise<void> => {
  await openContextMenuOn(page, label);
  await contextMenuItem(page, ADD_TO_CANVAS_ITEM).click();
};

export const openTimeframePopover = async (page: Page): Promise<void> => {
  await page.locator('.time-nav-dates').click();
  await expect(page.locator('.timeframe-popover')).toBeVisible();
};

export const choosePreset = async (page: Page, label: string): Promise<void> => {
  await openTimeframePopover(page);
  await page.locator('.quick-select-presets').getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.timeframe-popover')).toHaveCount(0);
};

export const boxOf = async (locator: Locator): Promise<ScreenBox> => {
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error('the element has no box on the screen');
  }

  return box;
};

export const pressAcrossChart = async (page: Page, fromFraction: number, toFraction: number): Promise<void> => {
  const plot = await boxOf(page.locator('.chart-panel-overlay').first());
  const middle = plot.y + plot.height * PLOT_MIDDLE;

  await page.mouse.move(plot.x + plot.width * fromFraction, middle);
  await page.mouse.down();
  await page.mouse.move(plot.x + plot.width * toFraction, middle, { steps: DRAG_STEPS });
};

export const dragAcrossChart = async (page: Page, fromFraction: number, toFraction: number): Promise<void> => {
  await pressAcrossChart(page, fromFraction, toFraction);
  await page.mouse.up();
};

export const hoverChartAt = async (page: Page, chartIndex: number, fraction: number): Promise<void> => {
  const plot = await boxOf(page.locator('.chart-panel-overlay').nth(chartIndex));

  await page.mouse.move(plot.x + plot.width * fraction, plot.y + plot.height * PLOT_MIDDLE);
};

export const chartPanel = (page: Page, title: string): Locator =>
  chartPanels(page).filter({ has: page.locator('.chart-panel-header-title').getByText(title, { exact: true }) });

export const waitForChartsToSettle = async (page: Page): Promise<void> => {
  await chartPanels(page).evaluateAll(async (panels) => {
    await Promise.all(panels.flatMap((panel) => panel.getAnimations()).map(async (animation) => await animation.finished));
  });
};

export const chartHeader = (page: Page, title: string): Locator => chartPanel(page, title).locator('.chart-panel-header-title');

export const dragOver = async (page: Page, source: Locator, target: Locator, verticalFraction: number): Promise<void> => {
  const from = await boxOf(source);
  const to = await boxOf(target);
  const fromCentreX = from.x + from.width * PLOT_MIDDLE;
  const fromCentreY = from.y + from.height * PLOT_MIDDLE;

  await page.mouse.move(fromCentreX, fromCentreY);
  await page.mouse.down();
  await page.mouse.move(fromCentreX + DRAG_LIFT_OFFSET, fromCentreY + DRAG_LIFT_OFFSET, { steps: DRAG_LIFT_STEPS });
  await page.mouse.move(to.x + to.width * PLOT_MIDDLE, to.y + to.height * verticalFraction, { steps: DRAG_STEPS });
};

export const dragOnto = async (page: Page, source: Locator, target: Locator, verticalFraction: number): Promise<void> => {
  await dragOver(page, source, target, verticalFraction);
  await page.mouse.up();
};

export const openAbsoluteTab = async (page: Page): Promise<void> => {
  await openTimeframePopover(page);
  await page.locator('.timeframe-popover-tab').filter({ hasText: ABSOLUTE_TAB_LABEL }).click();
};

export const absoluteFromInput = (page: Page): Locator => page.locator('.absolute-range-input').first();

export const absoluteToInput = (page: Page): Locator => page.locator('.absolute-range-input').last();

export const applyAbsoluteRange = async (page: Page, fromText: string, toText: string): Promise<void> => {
  await openAbsoluteTab(page);
  await absoluteFromInput(page).fill(fromText);
  await absoluteToInput(page).fill(toText);
  await page.locator('.absolute-range-apply').click();
};

export const applyQuickCount = async (page: Page, countText: string, unitLabel: string): Promise<void> => {
  await openTimeframePopover(page);
  await page.locator('.quick-select-count').fill(countText);
  await page.locator('.quick-select-unit .option-select-trigger').click();
  await page.locator('.quick-select-unit .option-select-menu .option-menu-item').filter({ hasText: unitLabel }).click();
  await page.locator('.quick-select-apply').click();
};

export const exportMenu = (page: Page): Locator => page.locator('app-export-menu .anchored-menu');

export const openExportMenu = async (page: Page, chartTitle: string): Promise<void> => {
  await chartPanel(page, chartTitle).locator('.chart-panel-header-export').click();
  await expect(exportMenu(page)).toBeVisible();
};

export const exportMenuItem = (page: Page, title: string): Locator => page.locator('.export-menu-item').filter({ hasText: title });
