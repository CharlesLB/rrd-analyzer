import { expect, type Locator, type Page } from '@playwright/test';
import { canvasOf, resetLibrary, seedWorkspace } from '../support/analyzer';
import { test } from '../support/fixtures';
import {
  absoluteFromInput,
  absoluteToInput,
  applyAbsoluteRange,
  applyQuickCount,
  arrowTooltipDetail,
  arrowTooltipTitle,
  choosePreset,
  dayBackArrow,
  dayForwardArrow,
  dragAcrossChart,
  drawnLines,
  durationAndStep,
  openAbsoluteTab,
  openTimeframePopover,
  pressAcrossChart,
  timeframeLabel,
} from '../support/workspace';

const WHOLE_DATA_DURATION = /^30 d · /;
const INVALID_FORMAT = 'use the format YYYY-MM-DD HH:MM';

const calendarDay = (page: Page, day: number): Locator =>
  page.locator('.month-calendar-day:not(.month-calendar-day-outside)').getByText(String(day), { exact: true });

const absoluteProblem = (page: Page): Locator => page.locator('.absolute-range-problem');

const absoluteNotice = (page: Page): Locator => page.locator('.absolute-range-notice');

const BACKDROP_POINT = { x: 20, y: 600 } as const;

const closePopoverFromBackdrop = async (page: Page): Promise<void> => {
  await page.locator('.timeframe-popover-backdrop').click({ position: BACKDROP_POINT });
};

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
  await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
});

test.describe('timeframe', () => {
  test('timeframe presets rename the window with its duration and step, and mark the preset in use', async ({ page }) => {
    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
    await expect(durationAndStep(page)).toHaveAttribute('title', '24 h · step 6 min');
    await openTimeframePopover(page);
    await expect(page.locator('.quick-select-preset')).toHaveText([
      'Last 15 minutes',
      'Last 30 minutes',
      'Last 1 hour',
      'Last 6 hours',
      'Last 12 hours',
      'Last 24 hours',
      'Last 7 days',
      'Last 30 days',
      'Last 3 months',
    ]);
    await expect(page.locator('.quick-select-preset-active')).toHaveText('Last 24 hours');

    await page.locator('.quick-select-presets').getByRole('button', { name: 'Last 7 days', exact: true }).click();

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);
    await expect(timeframeLabel(page)).toHaveText('Last 7 days');
    await expect(durationAndStep(page)).toHaveAttribute('title', '7.0 d · step 39 min');

    await openTimeframePopover(page);

    await expect(page.locator('.quick-select-preset-active')).toHaveText('Last 7 days');

    await page.locator('.quick-select-presets').getByRole('button', { name: 'Last 24 hours', exact: true }).click();

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
    await expect(durationAndStep(page)).toHaveAttribute('title', '24 h · step 6 min');
  });

  test('quick select applies a typed count in the chosen unit, named by a preset when one matches', async ({ page }) => {
    await openTimeframePopover(page);
    await expect(page.locator('.quick-select-count')).toHaveValue('24');
    await expect(page.locator('.quick-select-unit .option-select-trigger')).toContainText('hours');

    await page.locator('.quick-select-count').fill('6');
    await page.locator('.quick-select-apply').click();

    await expect(timeframeLabel(page)).toHaveText('Last 6 hours');
    await expect(durationAndStep(page)).toHaveAttribute('title', '6.0 h · step 1 min');

    await openTimeframePopover(page);
    await page.locator('.quick-select-count').fill('3');
    await page.locator('.quick-select-unit .option-select-trigger').click();

    await expect(page.locator('.quick-select-unit .option-select-menu .option-menu-label')).toHaveText(['minutes', 'hours', 'days']);

    await page.locator('.quick-select-unit .option-select-menu .option-menu-item').filter({ hasText: 'days' }).click();

    await expect(page.locator('.quick-select-unit .option-select-trigger')).toContainText('days');

    await page.locator('.quick-select-apply').click();

    await expect(timeframeLabel(page)).toHaveText('2026-08-26 15:00 to 2026-08-29 15:00');
    await expect(durationAndStep(page)).toHaveAttribute('title', '3.0 d · step 17 min');
  });

  test('absolute range applies typed ends, and says beside the fields why a malformed end or a To before From is not applied', async ({ page }) => {
    await openTimeframePopover(page);
    await page.locator('.timeframe-popover-tab').filter({ hasText: 'Absolute' }).click();
    const fromInput = page.locator('.absolute-range-input').first();
    const toInput = page.locator('.absolute-range-input').last();
    await expect(fromInput).toHaveValue('2026-08-28 15:00');
    await expect(toInput).toHaveValue('2026-08-29 15:00');
    await expect(page.locator('.absolute-range-bounds')).toHaveText('Data: 2026-07-30 15:00 to 2026-08-29 15:00');

    await fromInput.fill('last tuesday');
    await page.locator('.absolute-range-apply').click();

    await expect(absoluteProblem(page)).toHaveText(INVALID_FORMAT);
    await expect(fromInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.timeframe-popover')).toBeVisible();

    await fromInput.fill('2026-08-22 20:30');
    await toInput.fill('2026-08-20 08:30');

    await expect(absoluteProblem(page)).toHaveText('"To" must be after "From"');

    await page.locator('.absolute-range-apply').click();

    await expect(page.locator('.timeframe-popover')).toBeVisible();
    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');

    await fromInput.fill('2026-08-20 08:30');
    await toInput.fill('2026-08-22 20:30');
    await page.locator('.absolute-range-apply').click();

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);
    await expect(timeframeLabel(page)).toHaveText('2026-08-20 08:30 to 2026-08-22 20:30');
    await expect(durationAndStep(page)).toHaveAttribute('title', '2.5 d · step 14 min');
  });

  test('absolute calendar fills From on the picked day keeping its time, then moves on to fill To', async ({ page }) => {
    await openTimeframePopover(page);
    await page.locator('.timeframe-popover-tab').filter({ hasText: 'Absolute' }).click();
    const daysInMonth = page.locator('.month-calendar-day:not(.month-calendar-day-outside)');
    await expect(page.locator('.month-calendar-title')).toHaveText('August 2026');
    await expect(page.locator('.month-calendar-hint')).toHaveText('Picking a day fills the From field. Edit the time directly in the field.');

    await daysInMonth.filter({ hasText: /^\s*14\s*$/ }).click();

    await expect(page.locator('.absolute-range-input').first()).toHaveValue('2026-08-14 15:00');
    await expect(page.locator('.month-calendar-hint')).toHaveText('Picking a day fills the To field. Edit the time directly in the field.');

    await daysInMonth.filter({ hasText: /^\s*16\s*$/ }).click();
    await page.locator('.absolute-range-apply').click();

    await expect(timeframeLabel(page)).toHaveText('2026-08-14 15:00 to 2026-08-16 15:00');
    await expect(durationAndStep(page)).toHaveAttribute('title', '2.0 d · step 11 min');
  });

  test('dragging across a chart zooms into the span, and a double-click steps back out', async ({ page }) => {
    await dragAcrossChart(page, 0.25, 0.75);

    await expect(timeframeLabel(page)).toHaveText(/^2026-08-28 2\d:\d\d to 2026-08-29 0\d:\d\d$/);
    await expect(durationAndStep(page)).toHaveAttribute('title', '12 h · step 3 min');

    await page.locator('.chart-panel-overlay').first().dblclick();

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
    await expect(durationAndStep(page)).toHaveAttribute('title', '24 h · step 6 min');
  });

  test('‹ and › shift the window by exactly one day and back to the latest data', async ({ page }) => {
    await dayBackArrow(page).click();

    await expect(timeframeLabel(page)).toHaveText('2026-08-27 15:00 to 2026-08-28 15:00');
    await expect(durationAndStep(page)).toHaveAttribute('title', '24 h · step 6 min');

    await dayBackArrow(page).click();

    await expect(timeframeLabel(page)).toHaveText('2026-08-26 15:00 to 2026-08-27 15:00');

    await dayForwardArrow(page).click();
    await dayForwardArrow(page).click();

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('a day shift lands on the undo stack, so a double-click on a chart puts the window back', async ({ page }) => {
    await dayBackArrow(page).click();

    await expect(timeframeLabel(page)).toHaveText('2026-08-27 15:00 to 2026-08-28 15:00');

    await page.locator('.chart-panel-overlay').first().dblclick();

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('an arrow names the shift it would make, and the disabled one still says why it cannot', async ({ page }) => {
    await dayBackArrow(page).hover();

    await expect(arrowTooltipTitle(page)).toHaveText('Back 1 day');
    await expect(arrowTooltipDetail(page)).toHaveText('27/08 15:00  →  28/08 15:00');

    await expect(dayForwardArrow(page)).toBeDisabled();

    await dayForwardArrow(page).hover({ force: true });

    await expect(arrowTooltipTitle(page)).toHaveText('End of data');
    await expect(arrowTooltipDetail(page)).toHaveText('Files end 29/08 15:00');
  });
  test('quick select given zero, a negative count, a fraction or text marks the count invalid and applies nothing', async ({ page }) => {
    await openTimeframePopover(page);

    await ['0', 'a few', '-3', '2.9'].reduce(async (previous, typed) => {
      await previous;
      await page.locator('.quick-select-count').fill(typed);
      await page.locator('.quick-select-apply').click();

      await expect(page.locator('.quick-select-problem')).toHaveText('type a whole number, 1 or more');
      await expect(page.locator('.quick-select-count')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('.timeframe-popover')).toBeVisible();
    }, Promise.resolve());

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('quick select given a count padded with spaces reads the number, and Enter in the field applies it', async ({ page }) => {
    await openTimeframePopover(page);
    await page.locator('.quick-select-count').fill(' 12 ');
    await page.locator('.quick-select-count').press('Enter');

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);
    await expect(timeframeLabel(page)).toHaveText('Last 12 hours');
  });

  test('quick select asking for fewer than 15 minutes is widened to the last 15 minutes', async ({ page }) => {
    await applyQuickCount(page, '5', 'minutes');

    await expect(timeframeLabel(page)).toHaveText('Last 15 minutes');
    await expect(durationAndStep(page)).toHaveAttribute('title', /^15 min · /);
  });

  test('preset or quick select asking for more history than the data holds shows all of it, named by the preset it matches', async ({ page }) => {
    await choosePreset(page, 'Last 3 months');

    await expect(timeframeLabel(page)).toHaveText('Last 30 days');
    await expect(durationAndStep(page)).toHaveAttribute('title', WHOLE_DATA_DURATION);

    await openTimeframePopover(page);

    await expect(page.locator('.quick-select-preset-active')).toHaveText('Last 30 days');

    await page.locator('.quick-select-count').fill('999');
    await page.locator('.quick-select-unit .option-select-trigger').click();
    await page.locator('.quick-select-unit .option-select-menu .option-menu-item').filter({ hasText: 'days' }).click();
    await page.locator('.quick-select-apply').click();

    await expect(durationAndStep(page)).toHaveAttribute('title', WHOLE_DATA_DURATION);
  });

  test('duration and step of a window shorter than two hours never reads a step of 0 min', async ({ page }) => {
    await choosePreset(page, 'Last 1 hour');

    await expect(durationAndStep(page)).not.toHaveAttribute('title', /step 0 min/, { timeout: 3000 });
  });

  test('quick select unit menu checks the unit in use and closes once another unit is chosen', async ({ page }) => {
    await openTimeframePopover(page);

    await page.locator('.quick-select-unit .option-select-trigger').click();

    await expect(page.locator('.quick-select-unit .option-select-menu .option-menu-item-selected .option-menu-label')).toHaveText('hours');
    await expect(page.locator('.quick-select-unit .option-select-menu .option-menu-check')).toHaveText(['', '✓', '']);

    await page.locator('.quick-select-unit .option-select-menu .option-menu-item').filter({ hasText: 'minutes' }).click();

    await expect(page.locator('.quick-select-unit .option-select-menu')).toHaveCount(0);
    await expect(page.locator('.quick-select-unit .option-select-trigger')).toContainText('minutes');
  });

  test('timeframe popover closes without applying anything when its backdrop is clicked', async ({ page }) => {
    await openTimeframePopover(page);
    await page.locator('.quick-select-count').fill('6');
    await page.locator('.quick-select-unit .option-select-trigger').click();

    await closePopoverFromBackdrop(page);

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);
    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');

    await openTimeframePopover(page);

    await expect(page.locator('.quick-select-unit .option-select-menu')).toHaveCount(0);
  });

  test('timeframe popover closes on Escape, from one of its fields as from anywhere else on it', async ({ page }) => {
    await openTimeframePopover(page);
    await page.locator('.quick-select-count').press('Escape');

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);

    await openAbsoluteTab(page);
    await absoluteFromInput(page).press('Escape');

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);

    await openTimeframePopover(page);
    await page.locator('.timeframe-popover-tab-active').focus();
    await page.keyboard.press('Escape');

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);
  });

  test('timeframe popover reopens on the tab used last, with its fields reset to the window on screen', async ({ page }) => {
    await openAbsoluteTab(page);
    await absoluteFromInput(page).fill('not a timestamp');
    await closePopoverFromBackdrop(page);

    await openTimeframePopover(page);

    await expect(page.locator('.timeframe-popover-tab-active')).toHaveText('Absolute');
    await expect(absoluteFromInput(page)).toHaveValue('2026-08-28 15:00');
    await expect(absoluteToInput(page)).toHaveValue('2026-08-29 15:00');
  });

  test('absolute range accepts a T between date and time, single-digit month, day and hour, and spaces around the text', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-8-20T8:30', '  2026-08-21 09:00  ');

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);
    await expect(timeframeLabel(page)).toHaveText('2026-08-20 08:30 to 2026-08-21 09:00');
  });

  test('absolute range refuses equal ends as To not after From, and a malformed To on its own', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-08-20 08:30', '2026-08-20 08:30');

    await expect(absoluteProblem(page)).toHaveText('"To" must be after "From"');
    await expect(page.locator('.timeframe-popover')).toBeVisible();

    await absoluteToInput(page).fill('tomorrow');
    await page.locator('.absolute-range-apply').click();

    await expect(absoluteProblem(page)).toHaveText(INVALID_FORMAT);
    await expect(absoluteToInput(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('absolute range refuses a date that does not exist, such as February 31, instead of moving it into March', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-02-31 08:30', '2026-08-01 00:00');

    await expect(absoluteProblem(page)).toHaveText(INVALID_FORMAT);
  });

  test('absolute range shorter than 15 minutes is widened to 15 minutes from its start', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-08-20 08:30', '2026-08-20 08:35');

    await expect(timeframeLabel(page)).toHaveText('2026-08-20 08:30 to 2026-08-20 08:45');
    await expect(absoluteNotice(page)).toHaveText('adjusted to fit the data: now 2026-08-20 08:30 to 2026-08-20 08:45');
    await expect(absoluteToInput(page)).toHaveValue('2026-08-20 08:45');
    await expect(durationAndStep(page)).toHaveAttribute('title', /^15 min · /);
  });

  test('absolute range reaching back before the first reading starts at the first reading', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-01-01 00:00', '2026-08-01 00:00');

    await expect(timeframeLabel(page)).toHaveText('2026-07-30 15:00 to 2026-08-01 00:00');
    await expect(absoluteNotice(page)).toHaveText('adjusted to fit the data: now 2026-07-30 15:00 to 2026-08-01 00:00');
  });

  test('absolute range entirely before the first reading is moved inside the data, onto its first 15 minutes, and a double-click leaves it', async ({
    page,
  }) => {
    await applyAbsoluteRange(page, '2026-01-01 00:00', '2026-02-01 00:00');

    await expect(timeframeLabel(page)).toHaveText('2026-07-30 15:00 to 2026-07-30 15:15');
    await expect(durationAndStep(page)).toHaveAttribute('title', /^15 min · /);
    await expect(drawnLines(page)).toHaveCount(2);

    await closePopoverFromBackdrop(page);
    await page.locator('.chart-panel-overlay').first().dblclick();

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('absolute range shorter than 15 minutes that starts just before the first reading is widened inside the data', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-07-30 14:50', '2026-07-30 14:55');

    await expect(timeframeLabel(page)).toHaveText('2026-07-30 15:00 to 2026-07-30 15:15');
  });

  test('absolute range entirely after the last reading falls back to the last 15 minutes of data', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-09-10 00:00', '2026-09-20 00:00');

    await expect(timeframeLabel(page)).toHaveText('Last 15 minutes');
  });

  test('absolute calendar steps between months with ‹ and ›', async ({ page }) => {
    await openAbsoluteTab(page);

    await page.locator('.month-calendar-step').first().click();

    await expect(page.locator('.month-calendar-title')).toHaveText('July 2026');

    await page.locator('.month-calendar-step').last().click();
    await page.locator('.month-calendar-step').last().click();

    await expect(page.locator('.month-calendar-title')).toHaveText('September 2026');
    await expect(page.locator('.month-calendar-weekday')).toHaveText(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  test('absolute calendar marks days without data as unavailable and ignores clicks on them', async ({ page }) => {
    await openAbsoluteTab(page);

    await expect(calendarDay(page, 30)).toHaveClass(/month-calendar-day-unavailable/);
    await expect(calendarDay(page, 29)).not.toHaveClass(/month-calendar-day-unavailable/);
    await expect(calendarDay(page, 30)).toHaveAttribute('aria-disabled', 'true');

    await calendarDay(page, 30).click({ force: true });

    await expect(absoluteFromInput(page)).toHaveValue('2026-08-28 15:00');
    await expect(page.locator('.month-calendar-hint')).toHaveText('Picking a day fills the From field. Edit the time directly in the field.');

    await page.locator('.month-calendar-step').first().click();

    await expect(calendarDay(page, 29)).toHaveClass(/month-calendar-day-unavailable/);
    await expect(calendarDay(page, 30)).not.toHaveClass(/month-calendar-day-unavailable/);
  });

  test('absolute calendar highlights both picked days as the ends of the range and the days between them', async ({ page }) => {
    await openAbsoluteTab(page);

    await calendarDay(page, 14).click();
    await calendarDay(page, 17).click();

    await expect(absoluteToInput(page)).toHaveValue('2026-08-17 15:00');
    await expect(page.locator('.month-calendar-day-edge')).toHaveText(['14', '17']);
    await expect(page.locator('.month-calendar-day-between')).toHaveText(['15', '16']);
  });

  test('absolute calendar picking a day for a From that is not a timestamp fills that day at midnight', async ({ page }) => {
    await openAbsoluteTab(page);
    await absoluteFromInput(page).fill('whenever');

    await calendarDay(page, 10).click();

    await expect(absoluteFromInput(page)).toHaveValue('2026-08-10 00:00');
  });

  test('absolute calendar with the To field focused fills To, at 23:59 when To is not a timestamp, and puts the two ends in order when the day is before From', async ({
    page,
  }) => {
    await openAbsoluteTab(page);
    await absoluteToInput(page).fill('later');

    await absoluteToInput(page).focus();

    await expect(page.locator('.month-calendar-hint')).toHaveText('Picking a day fills the To field. Edit the time directly in the field.');

    await calendarDay(page, 21).click();

    await expect(absoluteFromInput(page)).toHaveValue('2026-08-21 23:59');
    await expect(absoluteToInput(page)).toHaveValue('2026-08-28 15:00');

    await calendarDay(page, 29).click();

    await expect(absoluteToInput(page)).toHaveValue('2026-08-29 15:00');
    await expect(absoluteFromInput(page)).toHaveValue('2026-08-21 23:59');
  });

  test('a double-click with no zoom to undo shows all the data', async ({ page }) => {
    await page.locator('.chart-panel-overlay').first().dblclick();

    await expect(timeframeLabel(page)).toHaveText('Last 30 days');
    await expect(durationAndStep(page)).toHaveAttribute('title', WHOLE_DATA_DURATION);

    await choosePreset(page, 'Last 24 hours');
    await page.locator('.chart-panel-overlay').first().dblclick();
    await page.locator('.chart-panel-overlay').first().dblclick();
    await page.locator('.chart-panel-overlay').first().dblclick();

    await expect(durationAndStep(page)).toHaveAttribute('title', WHOLE_DATA_DURATION);
  });

  test('zooming in twice steps back out one level at a time with a double-click', async ({ page }) => {
    await dragAcrossChart(page, 0.25, 0.75);
    await expect(durationAndStep(page)).toHaveAttribute('title', '12 h · step 3 min');
    await dragAcrossChart(page, 0.25, 0.75);
    await expect(durationAndStep(page)).toHaveAttribute('title', /^6\.0 h · /);

    await page.locator('.chart-panel-overlay').first().dblclick();

    await expect(durationAndStep(page)).toHaveAttribute('title', '12 h · step 3 min');

    await page.locator('.chart-panel-overlay').first().dblclick();

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('dragging right to left across a chart zooms into the same span as dragging left to right', async ({ page }) => {
    await dragAcrossChart(page, 0.75, 0.25);

    await expect(timeframeLabel(page)).toHaveText(/^2026-08-28 2\d:\d\d to 2026-08-29 0\d:\d\d$/);
    await expect(durationAndStep(page)).toHaveAttribute('title', '12 h · step 3 min');
  });

  test('a click or a drag across less than about one percent of the chart does not zoom', async ({ page }) => {
    await page.locator('.chart-panel-overlay').first().click();
    await dragAcrossChart(page, 0.5, 0.505);

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
    await expect(page.locator('.chart-panel-selection')).toHaveCount(0);
  });

  test('dragging across a chart shows the selection band on every chart while the button is held, and removes it on release', async ({ page }) => {
    await pressAcrossChart(page, 0.2, 0.6);

    await expect(page.locator('.chart-panel-selection')).toHaveCount(2);
    await expect(page.locator('.chart-panel-selection').first()).toHaveAttribute('style', /left: (19\.\d+|20\.\d+|20)%; width: (39\.\d+|40\.\d+|39|40)%/);

    await page.mouse.up();

    await expect(page.locator('.chart-panel-selection')).toHaveCount(0);
    await expect(durationAndStep(page)).toHaveAttribute('title', /^9\.\d h · /);
  });

  test('zooming into less than 15 minutes of a one-hour window is widened to 15 minutes', async ({ page }) => {
    await choosePreset(page, 'Last 1 hour');

    await dragAcrossChart(page, 0.4, 0.45);

    await expect(durationAndStep(page)).toHaveAttribute('title', /^15 min · /);
    await expect(timeframeLabel(page)).toHaveText(/^2026-08-29 14:2\d to 2026-08-29 14:(3\d|4[0-4])$/);
  });

  test('› at the latest data is disabled, so it leaves nothing to undo', async ({ page }) => {
    await expect(dayForwardArrow(page)).toBeDisabled();

    await dayBackArrow(page).click();

    await expect(dayForwardArrow(page)).toBeEnabled();
  });

  test('‹ pressed less than a day from the first reading stops on it, keeping the length of the window, and then disables itself', async ({ page }) => {
    await applyAbsoluteRange(page, '2026-07-31 15:00', '2026-08-07 15:00');

    await dayBackArrow(page).click();

    await expect(timeframeLabel(page)).toHaveText('2026-07-30 15:00 to 2026-08-06 15:00');
    await expect(durationAndStep(page)).toHaveAttribute('title', /^7\.0 d · /);
    await expect(dayBackArrow(page)).toBeDisabled();
  });
});
