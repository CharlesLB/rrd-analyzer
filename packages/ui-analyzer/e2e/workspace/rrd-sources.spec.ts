import { expect, type Locator, type Page } from '@playwright/test';
import { resetLibrary, seedWorkspace } from '../support/analyzer';
import { test } from '../support/fixtures';
import { BINARY_RRD_FIXTURE, sourcesNamed, type WrittenSource, writeRrdFixtures } from '../support/rrd-fixtures';
import { chartLibraryCount, chartTitles, choosePreset, durationAndStep, libraryNames, statisticUnits, statValues, timeframeLabel } from '../support/workspace';

const dumps: { written: readonly WrittenSource[] } = { written: [] };

const openFromDisk = async (page: Page, fileNames: readonly string[], labels: readonly string[]): Promise<void> => {
  await seedWorkspace(page, {
    name: fileNames.join(' + '),
    files: sourcesNamed(dumps.written, fileNames),
    canvas: labels.map((label, index) => ({ seriesId: `s${index}`, label })),
  });
};

const averages = (page: Page): Locator => statValues(page, 'avg');

const chartLines = (page: Page): Locator => page.locator('.plot-drawing-line');

test.beforeAll(() => {
  dumps.written = writeRrdFixtures();
});

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('round robin databases read off disk', () => {
  test('a dump with several data sources names each series after its file and its data source', async ({ page }) => {
    await openFromDisk(page, ['atlas_cpu.xml', 'atlas_disk_io.xml'], ['cpu_user', 'cpu_system', 'disk_io']);

    await expect(chartLibraryCount(page)).toHaveText('3 of 3');
    await expect(libraryNames(page)).toHaveText(['cpu_user', 'cpu_system', 'disk_io']);
    await expect(page.locator('.library-thumbnail').first()).toHaveAttribute('title', 'atlas_cpu.xml · on canvas');
    await expect(page.locator('.library-thumbnail').last()).toHaveAttribute('title', 'atlas_disk_io.xml · on canvas');
    await expect(chartTitles(page)).toHaveText(['atlas_cpu_user', 'atlas_cpu_system', 'atlas_disk_io']);
  });

  test('a dump holding a single data source under an unprefixed name is named after the file alone', async ({ page }) => {
    await openFromDisk(page, ['temperature.xml'], ['temperature']);

    await expect(libraryNames(page)).toHaveText(['temperature']);
    await expect(page.locator('.library-thumbnail')).toHaveAttribute('title', 'temperature.xml · on canvas');
    await expect(chartTitles(page)).toHaveText(['temperature']);
  });

  test('counters and derives read as rates per second while a gauge stays unitless', async ({ page }) => {
    await openFromDisk(page, ['atlas_traffic.xml', 'atlas_disk_io.xml', 'temperature.xml'], ['traffic_in', 'traffic_out', 'disk_io', 'temperature']);

    await expect(chartTitles(page)).toHaveText(['atlas_traffic_in', 'atlas_traffic_out', 'atlas_disk_io', 'temperature']);
    await expect(statisticUnits(page)).toHaveText(['/s', '/s', '/s', 'n/a']);
    await expect(page.locator('.library-thumbnail-unit')).toHaveText(['/s', '/s', '/s', '']);
    await expect(averages(page)).toHaveText(['9232', '6144', '607', '20.8']);
  });

  test('rows a dump left unknown are counted as gaps and break the line instead of being smoothed over', async ({ page }) => {
    await openFromDisk(page, ['atlas_latency.rrd'], ['latency']);

    await expect(chartTitles(page)).toHaveText(['atlas_latency']);
    await expect(statisticUnits(page)).toHaveText(['n/a · 39 gaps']);
    await expect(page.locator('.chart-panel-header-stat-label')).toHaveText(['now', 'p95', 'max', 'avg', 'min']);
    await expect(chartLines(page)).toHaveAttribute('d', /M.*M/);
  });

  test('a binary round robin database reads without rrdtool over the last day, the last hour and the last 30 days', async ({ page }) => {
    await openFromDisk(page, [BINARY_RRD_FIXTURE.fileName], ['node_load']);
    await expect(libraryNames(page)).toHaveText(['node_load']);
    await expect(chartTitles(page)).toHaveText(['atlas_node_load']);
    await expect(statisticUnits(page)).toHaveText(['n/a']);
    await expect(averages(page)).toHaveText(['2.34']);
    await expect(chartLines(page)).not.toHaveAttribute('d', /M.*M/);

    await choosePreset(page, 'Last 1 hour');

    await expect(averages(page)).not.toHaveText(['2.34']);
    await expect(page.locator('.chart-panel-header-stat-label')).toHaveText(['now', 'p95', 'max', 'avg', 'min']);

    const hourAverage = (await averages(page).first().textContent()) ?? '';
    await choosePreset(page, 'Last 30 days');

    await expect(durationAndStep(page)).toHaveAttribute('title', /^30 d · /);
    await expect(averages(page)).not.toHaveText([hourAverage]);
    await expect(statisticUnits(page)).toHaveText(['n/a']);
    await expect(chartLines(page)).not.toHaveAttribute('d', /M.*M/);
  });

  test('data source names holding dots, dashes, spaces and slashes join the file name with single underscores', async ({ page }) => {
    await openFromDisk(page, ['atlas_net.xml'], ['net_eth0_rx_bytes', 'net_eth0_tx_bytes']);

    await expect(libraryNames(page)).toHaveText(['net_eth0_rx_bytes', 'net_eth0_tx_bytes']);
    await expect(chartTitles(page)).toHaveText(['atlas_net_eth0_rx_bytes', 'atlas_net_eth0_tx_bytes']);
    await expect(statisticUnits(page)).toHaveText(['B/s', 'B']);
  });

  test('a dump whose file name holds no letter or digit names its series source', async ({ page }) => {
    await openFromDisk(page, ['---.xml'], ['source']);

    await expect(libraryNames(page)).toHaveText(['source']);
    await expect(page.locator('.library-thumbnail')).toHaveAttribute('title', '---.xml · on canvas');
    await expect(chartTitles(page)).toHaveText(['source']);
  });

  test('a Holt-Winters prediction archive kept beside the averages is neither plotted nor summarised', async ({ page }) => {
    await openFromDisk(page, ['atlas_forecast.xml'], ['forecast']);

    await expect(chartTitles(page)).toHaveText(['atlas_forecast']);
    await expect(page.locator('.chart-panel-header-stat-value')).toHaveText(['5.47', '6.86', '6.98', '4.90', '2.79']);
    await expect(chartLines(page)).not.toHaveAttribute('d', /M.*M/);
  });

  test('rows carrying fewer values than the dump has data sources leave the missing source unknown there, while an ABSOLUTE source reads per second', async ({
    page,
  }) => {
    await openFromDisk(page, ['atlas_pair.xml'], ['pair_hits', 'pair_misses']);

    await expect(chartTitles(page)).toHaveText(['atlas_pair_hits', 'atlas_pair_misses']);
    await expect(statisticUnits(page)).toHaveText(['/s', /^n\/a · \d+ gaps$/]);
    await expect(chartLines(page).first()).not.toHaveAttribute('d', /M.*M/);
    await expect(chartLines(page).last()).toHaveAttribute('d', /M.*M/);
  });

  test('a dump holding under two days of readings narrows the last 30 days to the span it holds', async ({ page }) => {
    await openFromDisk(page, ['temperature.xml'], ['temperature']);

    await choosePreset(page, 'Last 30 days');

    await expect(timeframeLabel(page)).toHaveText('2026-08-27 23:00 to 2026-08-29 15:00');
    await expect(durationAndStep(page)).toHaveAttribute('title', /^40 h · /);
    await expect(statisticUnits(page)).toHaveText(['n/a']);
  });

  test('archives of different resolutions join into one unbroken line over the last week and the last 30 days', async ({ page }) => {
    await openFromDisk(page, ['atlas_memory.xml'], ['memory']);
    await expect(averages(page)).toHaveText(['5.4G']);

    await choosePreset(page, 'Last 7 days');

    await expect(durationAndStep(page)).toHaveAttribute('title', /^7\.0 d · /);
    await expect(averages(page)).not.toHaveText(['5.4G']);
    await expect(statisticUnits(page)).toHaveText(['B']);
    await expect(chartLines(page)).not.toHaveAttribute('d', /M.*M/);

    const weekAverage = (await averages(page).first().textContent()) ?? '';
    await choosePreset(page, 'Last 30 days');

    await expect(averages(page)).not.toHaveText([weekAverage]);
    await expect(statisticUnits(page)).toHaveText(['B']);
    await expect(chartLines(page)).not.toHaveAttribute('d', /M.*M/);
  });
});
