import { expect, test } from '@playwright/test';
import { openLanding, USER_AGENTS } from '../support/visitors';

const RELEASE_DOWNLOAD = /^https:\/\/github\.com\/CharlesLB\/rrd-analyzer\/releases\/download\/v[\d.]+\/rrd-analyzer_[\d.]+_/;

test.describe('downloads for a Windows visitor', () => {
  test.use({ userAgent: USER_AGENTS.WINDOWS });

  test('hero offers the Windows installer, linked straight to the release file', async ({ page }) => {
    await openLanding(page);

    await expect(page.locator('.hero-download-label')).toHaveText('Download for Windows');
    await expect(page.locator('.hero-download-detail')).toContainText('Installer .exe');
    await expect(page.locator('.hero-download')).toHaveAttribute('href', RELEASE_DOWNLOAD);
  });

  test('download section tags the Windows card and fills in its installer', async ({ page }) => {
    await openLanding(page);

    const windowsCard = page.locator('.platform-card-visitors');

    await expect(windowsCard.locator('.platform-card-name')).toHaveText('Windows');
    await expect(windowsCard.locator('.platform-card-badge')).toHaveText('Your system');
    await expect(windowsCard.locator('.platform-card-file-primary .platform-card-file-name')).toHaveText(/_windows_amd64_installer\.exe$/);
    await expect(page.locator('.platform-card-badge')).toHaveCount(1);
  });
});

test.describe('downloads for a Linux visitor', () => {
  test.use({ userAgent: USER_AGENTS.LINUX });

  test('hero turns to the Debian package once the page has read the browser', async ({ page }) => {
    await openLanding(page);

    await expect(page.locator('.hero-download-label')).toHaveText('Download for Linux');
    await expect(page.locator('.hero-download')).toHaveAttribute('href', /_linux_amd64\.deb$/);
    await expect(page.locator('.platform-card-visitors .platform-card-name')).toHaveText('Linux');
  });
});

test.describe('downloads for a Mac visitor', () => {
  test.use({ userAgent: USER_AGENTS.MACOS });

  test('hero sends a Mac, which has nothing to download, to the download section', async ({ page }) => {
    await openLanding(page);

    await expect(page.locator('.hero-download-label')).toHaveText('Get RRD Analyzer');
    await expect(page.locator('.hero-download')).toHaveAttribute('href', '#download');
  });

  test('macOS card is tagged as the visitor one and points at building from source in a new tab', async ({ page }) => {
    await openLanding(page);

    const macosCard = page.locator('.platform-card-visitors');

    await expect(macosCard.locator('.platform-card-name')).toHaveText('macOS');
    await expect(macosCard.locator('.platform-card-file')).toHaveAttribute('href', /#building-it-yourself$/);
    await expect(macosCard.locator('.platform-card-file')).toHaveAttribute('target', '_blank');
  });
});
