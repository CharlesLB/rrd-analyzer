import type { Locator, Page } from '@playwright/test';

export const analysisRows = (page: Page): Locator => page.locator('.analysis-row');

export const analysisRow = (page: Page, name: string): Locator => analysisRows(page).filter({ hasText: name });

export const analysisRowNames = (page: Page): Locator => page.locator('.analysis-row-name');

const HOUR_MILLISECONDS = 3_600_000;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

const startOfDayOf = (moment: Date): number => new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();

export const accessOnAnEarlierDay = (hoursAgo: number): string => {
  const now = new Date();
  const days = Math.round((startOfDayOf(now) - startOfDayOf(new Date(now.getTime() - hoursAgo * HOUR_MILLISECONDS))) / DAY_MILLISECONDS);

  return days === 1 ? 'opened yesterday' : `opened ${days} d ago`;
};
