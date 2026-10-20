import { expect, type Page } from '@playwright/test';

export const USER_AGENTS = {
  WINDOWS: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  LINUX: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  MACOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  IPHONE: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
} as const;

export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;

const HEADER_HEIGHT = 64;
const SCROLL_TOLERANCE = 2;

const WORN_THEME = /\b(light|dark)\b/;

export const openLanding = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(WORN_THEME);
};

export const sectionTopOf = async (page: Page, sectionId: string): Promise<number> =>
  await page.locator(`#${sectionId}`).evaluate((section) => section.getBoundingClientRect().top);

export const isJustBelowTheHeader = (top: number): boolean => Math.abs(top - HEADER_HEIGHT) <= SCROLL_TOLERANCE;
