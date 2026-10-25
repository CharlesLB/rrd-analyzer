import { readFile } from 'node:fs/promises';
import { DESIGN_CHECK_COLORS } from '../../src/app/shared/constants/colors.ts';

const API = 'http://127.0.0.1:34115';
const HOUR = 3_600_000;
const settle = (page, milliseconds = 450) => page.waitForTimeout(milliseconds);

const REFERENCE_FILES = [
  'atlas_runtime_goroutines.rrd',
  'atlas_runtime_gc_pause.rrd',
  'atlas_runtime_heap_objects.rrd',
  'atlas_system_cpu_user.rrd',
  'atlas_system_cpu_system.rrd',
  'atlas_system_memory_used.rrd',
  'atlas_system_network_packets_sent.rrd',
  'atlas_system_network_packets_recv.rrd',
  'atlas_http_requests_rate.rrd',
  'atlas_http_latency_p95.rrd',
];

const LABELS = {
  s0: 'runtime_goroutines',
  s1: 'runtime_gc_pause',
  s2: 'runtime_heap_objects',
  s3: 'system_cpu_user',
  s4: 'system_cpu_system',
  s5: 'system_memory_used',
  s6: 'system_network_packets_sent',
  s7: 'system_network_packets_recv',
  s8: 'http_requests_rate',
  s9: 'http_latency_p95',
};

const canvasOf = (...seriesIds) => seriesIds.map((seriesId) => ({ seriesId, label: LABELS[seriesId] }));

const REFERENCE_ANALYSES = [
  { name: 'Atlas prod · capacity', agoHours: 2, canvas: canvasOf('s3', 's5') },
  { name: 'HTTP latency review', agoHours: 30, canvas: canvasOf('s8', 's9') },
  { name: 'Network throughput', agoHours: 72, canvas: canvasOf('s6', 's7') },
];

const createAnalyses = async (page, analyses) =>
  await page.evaluate(
    async ({ api, hour, files, analyses: rows }) => {
      const identifiers = [];

      for (const analysis of rows) {
        const response = await fetch(`${api}/api/dev/analyses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: analysis.name,
            files: files.map((name) => ({ name, path: '', size: 1024 })),
            canvas: analysis.canvas,
            lastAccessedMilliseconds: Date.now() - analysis.agoHours * hour,
          }),
        });

        identifiers.push((await response.json()).id);
      }

      return identifiers;
    },
    { api: API, hour: HOUR, files: REFERENCE_FILES, analyses },
  );

const openMenu = async (page) => {
  await createAnalyses(page, REFERENCE_ANALYSES);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.analysis-row');
  await settle(page, 700);
};

const openWorkspace = async (page, canvas, name = 'Atlas prod · capacity') => {
  const [analysisId] = await createAnalyses(page, [{ name, agoHours: 2, canvas }]);

  await page.goto(`${page.url().split('#')[0]}#/workspace/${analysisId}`);
  await page.waitForSelector('.timeframe-bar');
  await page.waitForFunction(() => document.querySelectorAll('.library-thumbnail .sparkline-line[d^="M"]').length > 0);

  if (canvas.length > 0) {
    await page.waitForFunction(() => document.querySelectorAll('.plot-drawing-line[d^="M"]').length > 0);
  }

  await settle(page, 900);
};

const openCapacityWorkspace = async (page) => await openWorkspace(page, canvasOf('s3', 's5'));

const PRESETS = {
  LAST_HOUR: 'Last 1 hour',
  LAST_DAY: 'Last 24 hours',
  LAST_WEEK: 'Last 7 days',
};

const REFERENCE_RUN_TIMES = {
  EXPANDED: '2026-09-13T23:47:55-03:00',
  STALE: '2026-09-13T23:48:44-03:00',
  EMPTY: '2026-09-13T23:54:48-03:00',
  RANKED: '2026-09-13T23:54:58-03:00',
};

const INSIGHT_SCOPES = {
  ALL: 'all data',
  VIEWPORT: 'current viewport',
};

const REST_POINTER = { x: 120, y: 520 };

const TOOLTIP_FRACTIONS = {
  BEFORE_FLIP: 0.4197,
  PAST_FLIP: 0.6801,
};

const REFERENCE_EXPORT_TIMES = {
  SINGLE: '2026-09-18T20:20:00-03:00',
  MULTI: '2026-09-18T20:22:00-03:00',
  DARK: '2026-09-18T20:23:00-03:00',
};

const FINDING_WINDOW = { from: '2026-08-17 11:07', to: '2026-08-19 00:28' };

const EXPORT_VIEWER = {
  LEFT: 16,
  TOP: 19,
  WIDTH: 892,
  HEIGHT: 501,
  LIGHT_SURROUND: DESIGN_CHECK_COLORS.lightExportSurround,
  DARK_SURROUND: DESIGN_CHECK_COLORS.darkExportSurround,
};

const CLOCK_LEAD_MILLISECONDS = 5000;
const REFERENCE_PROGRESS_MILLISECONDS = 1720;

const choosePreset = async (page, label) => {
  await page.click('.timeframe-bar-timeframe');
  await settle(page, 300);
  await page.locator('.quick-select-preset').filter({ hasText: label }).first().click();
  await settle(page, 600);
};

const addZoomHistory = async (page) => await choosePreset(page, PRESETS.LAST_DAY);

const restPointer = async (page) => await page.mouse.move(REST_POINTER.x, REST_POINTER.y);

const runInsightsAt = async (page, referenceTime) => {
  await page.clock.setFixedTime(new Date(referenceTime));
  await page.click('.insights-trigger-idle');
  await page.waitForSelector('.insights-panel');
  await restPointer(page);
  await settle(page, 600);
};

const chooseInsightsScope = async (page, label) => {
  await page.click('.insights-panel-scope .option-select-trigger');
  await settle(page, 300);
  await page.locator('.option-menu-item').filter({ hasText: label }).click();
};

const rerunInsights = async (page) => {
  await page.click('.insights-panel-stale-rerun');
  await page.waitForSelector('.insights-trigger-running');
  await page.waitForSelector('.insights-panel');
  await restPointer(page);
  await settle(page, 600);
};

const rerunOverViewport = async (page) => {
  await chooseInsightsScope(page, INSIGHT_SCOPES.VIEWPORT);
  await rerunInsights(page);
};

const closeInsights = async (page) => {
  await page.click('.insights-panel-close');
  await restPointer(page);
  await settle(page, 500);
};

const leaveDarkWeekWarning = async (page) => {
  await openWorkspace(page, canvasOf('s3'));
  await toggleTheme(page);
  await choosePreset(page, PRESETS.LAST_WEEK);
  await runInsightsAt(page, REFERENCE_RUN_TIMES.EXPANDED);
  await rerunOverViewport(page);
  await closeInsights(page);
};

const openWeekWithInsights = async (page) => {
  await openCapacityWorkspace(page);
  await choosePreset(page, PRESETS.LAST_WEEK);
  await runInsightsAt(page, REFERENCE_RUN_TIMES.EXPANDED);
};

const openHourOfThreeCharts = async (page) => {
  await openWorkspace(page, canvasOf('s3', 's9', 's5'), 'Untitled analysis');
  await choosePreset(page, PRESETS.LAST_HOUR);
};

const hoverPlotAt = async (page, fraction) => {
  const point = await plotPoint(page, fraction);

  await page.mouse.move(point.x, point.y, { steps: 5 });
  await settle(page, 400);
};

const applyAbsoluteRange = async (page, range) => {
  await page.click('.timeframe-bar-timeframe');
  await settle(page, 300);
  await page.click('.timeframe-popover-tab >> nth=1');
  await page.fill('.absolute-range-input >> nth=0', range.from);
  await page.fill('.absolute-range-input >> nth=1', range.to);
  await page.click('.absolute-range-apply');
  await settle(page, 700);
};

const openFindingWindowWithInsights = async (page) => {
  await openCapacityWorkspace(page);
  await runInsightsAt(page, REFERENCE_RUN_TIMES.EXPANDED);
  await closeInsights(page);
  await applyAbsoluteRange(page, FINDING_WINDOW);
};

// eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is where Playwright saved the download it just intercepted, never a value from the page
const downloadedBytes = async (download) => await readFile(await download.path());

const exportFromMenu = async (page, itemSelector) => {
  await page.click('.chart-panel-header-export >> nth=0');
  await settle(page, 300);
  const downloading = page.waitForEvent('download');
  await page.click(itemSelector);

  return await downloadedBytes(await downloading);
};

const showExportedImage = async (page, bytes, surround) => {
  const source = `data:image/png;base64,${bytes.toString('base64')}`;

  await page.setContent(
    `<body style="margin:0;background:${surround}"><img src="${source}" style="position:absolute;left:${EXPORT_VIEWER.LEFT}px;top:${EXPORT_VIEWER.TOP}px;width:${EXPORT_VIEWER.WIDTH}px;height:${EXPORT_VIEWER.HEIGHT}px"></body>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete === true);
};

const openTimeframe = async (page) => {
  await openCapacityWorkspace(page);
  await page.click('.timeframe-bar-timeframe');
  await settle(page, 500);
};

const plotPoint = async (page, fraction, chartIndex = 0) => {
  const box = await page.locator('.chart-panel-overlay').nth(chartIndex).boundingBox();

  return { x: box.x + box.width * fraction, y: box.y + box.height * 0.5 };
};

const thumbnail = (page, label) => page.locator('.library-thumbnail').filter({ hasText: label }).first();

const rightClickThumbnail = async (page, label) => {
  const card = thumbnail(page, label);

  await card.scrollIntoViewIfNeeded();

  const box = await card.boundingBox();

  await page.mouse.click(box.x + 141, box.y + 36, { button: 'right' });
  await settle(page, 350);
};

const resetLibraryScroll = async (page) => {
  await page.evaluate(() => {
    const list = document.querySelector('.chart-library-list');

    if (list !== null) {
      list.scrollTop = 0;
    }
  });
};

const addFromLibrary = async (page, label) => {
  await rightClickThumbnail(page, label);
  await page.click('.context-menu-item:has-text("Add to canvas")');
  await resetLibraryScroll(page);
  await settle(page, 700);
};

const dragThumbnailOverChart = async (page, label, verticalFraction) => {
  const source = await thumbnail(page, label).boundingBox();
  const target = await page.locator('.chart-panel').first().boundingBox();

  await page.mouse.move(source.x + source.width / 2, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 40, source.y + 40, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height * verticalFraction, { steps: 12 });
  await settle(page, 500);
};

const filterLibrary = async (page, text) => {
  await page.fill('.chart-library-filter input', text);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await settle(page, 500);
};

const toggleTheme = async (page) => {
  await page.click('.theme-toggle');
  await settle(page, 500);
};

export const scenarios = {
  '01-menu-light': openMenu,

  '02-workspace-overview-light': openCapacityWorkspace,

  '03-timeframe-quick-select': openTimeframe,

  '04-timeframe-unit-dropdown': async (page) => {
    await openTimeframe(page);
    await page.click('.quick-select-unit .option-select-trigger');
    await settle(page, 400);
  },

  '05-timeframe-absolute-calendar': async (page) => {
    await openTimeframe(page);
    await page.click('.timeframe-popover-tab >> nth=1');
    await settle(page, 300);
    await page
      .locator('.month-calendar-day:not(.month-calendar-day-outside)')
      .filter({ hasText: /^\s*14\s*$/ })
      .first()
      .click();
    await page.mouse.move(900, 530);
    await settle(page, 400);
  },

  '06-chart-crosshair-readout': async (page) => {
    await openCapacityWorkspace(page);
    await addZoomHistory(page);
    const point = await plotPoint(page, 0.5805);
    await page.mouse.move(point.x, point.y, { steps: 5 });
    await settle(page, 400);
  },

  '07-chart-drag-selection': async (page) => {
    await openCapacityWorkspace(page);
    await addZoomHistory(page);
    const start = await plotPoint(page, 0.3);
    const end = await plotPoint(page, 0.6299);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await settle(page, 400);
  },

  '08-window-zoomed-absolute-label': async (page) => {
    await openCapacityWorkspace(page);
    await addZoomHistory(page);
    const start = await plotPoint(page, 0.3);
    const end = await plotPoint(page, 0.6299);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    await page.mouse.move(120, 520);
    await settle(page, 900);
  },

  '09-library-context-menu-add': async (page) => {
    await openCapacityWorkspace(page);
    await addZoomHistory(page);
    await rightClickThumbnail(page, 'runtime_gc_pause');
  },

  '10-library-context-menu-remove': async (page) => {
    await openWorkspace(page, canvasOf('s3', 's5', 's1', 's8'));
    await addZoomHistory(page);
    await rightClickThumbnail(page, 'system_cpu_user');
  },

  '11-toast-added-to-canvas': async (page) => {
    await openWorkspace(page, canvasOf('s3', 's5', 's1', 's8'));
    await addZoomHistory(page);
    await addFromLibrary(page, 'system_network_packets_sent');
  },

  '12-drop-indicator-before': async (page) => {
    await openWorkspace(page, canvasOf('s3'));
    await addZoomHistory(page);
    await dragThumbnailOverChart(page, 'runtime_gc_pause', 0.1);
  },

  '13-drop-indicator-replace': async (page) => {
    await openWorkspace(page, canvasOf('s3'));
    await addZoomHistory(page);
    await dragThumbnailOverChart(page, 'runtime_gc_pause', 0.5);
  },

  '14-drop-indicator-after': async (page) => {
    await openWorkspace(page, canvasOf('s3'));
    await addZoomHistory(page);
    await dragThumbnailOverChart(page, 'runtime_gc_pause', 0.9);
  },

  '15-canvas-limit-five-toast': async (page) => {
    await openWorkspace(page, canvasOf('s3', 's5', 's0', 's1', 's8'));
    await addZoomHistory(page);
    await addFromLibrary(page, 'runtime_heap_objects');
  },

  '16-canvas-three-charts': async (page) => {
    await openWorkspace(page, canvasOf('s3', 's9'), 'Untitled analysis');
    await addFromLibrary(page, 'system_memory_used');
  },

  '17-library-filtered': async (page) => {
    await openWorkspace(page, canvasOf('s3'));
    await addZoomHistory(page);
    await filterLibrary(page, 'cpu');
  },

  '18-library-no-match': async (page) => {
    await openWorkspace(page, canvasOf('s3'));
    await addZoomHistory(page);
    await filterLibrary(page, 'zzz');
  },

  '19-library-collapsed-rail': async (page) => {
    await openCapacityWorkspace(page);
    await addZoomHistory(page);
    await page.click('.chart-library-toggle');
    await settle(page, 700);
  },

  '21-toast-csv-exported': async (page) => {
    await openWorkspace(page, canvasOf('s3'));
    await addZoomHistory(page);
    await page.click('.chart-panel-header-export >> nth=0');
    await settle(page, 300);
    await page.locator('app-export-menu .menu-option').filter({ hasText: 'CSV data' }).click();
    await restPointer(page);
    await settle(page, 700);
  },

  '22-insights-running-progress': async (page) => {
    await openCapacityWorkspace(page);
    await choosePreset(page, PRESETS.LAST_WEEK);
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + CLOCK_LEAD_MILLISECONDS);
    await page.click('.insights-trigger-idle');
    await page.clock.runFor(REFERENCE_PROGRESS_MILLISECONDS);
    await settle(page, 300);
  },

  '23-insights-expanded-critical': openWeekWithInsights,

  '24-insights-ranked-collapsed': async (page) => {
    await openHourOfThreeCharts(page);
    await runInsightsAt(page, REFERENCE_RUN_TIMES.RANKED);
    await page.click('.finding-card-title >> nth=0');
    await restPointer(page);
    await settle(page, 500);
  },

  '25-insights-scope-dropdown': async (page) => {
    await openWeekWithInsights(page);
    await page.click('.insights-panel-scope .option-select-trigger');
    await restPointer(page);
    await settle(page, 400);
  },

  '26-insights-show-on-chart-stale': async (page) => {
    await openCapacityWorkspace(page);
    await choosePreset(page, PRESETS.LAST_WEEK);
    await runInsightsAt(page, REFERENCE_RUN_TIMES.EXPANDED);
    await page.clock.setFixedTime(new Date(REFERENCE_RUN_TIMES.STALE));
    await rerunOverViewport(page);
    await page.keyboard.press('Space');
    await settle(page, 1400);
  },

  '27-insights-no-findings': async (page) => {
    await openHourOfThreeCharts(page);
    await runInsightsAt(page, REFERENCE_RUN_TIMES.EMPTY);
    await rerunOverViewport(page);
  },

  '28-dark-workspace': async (page) => {
    await leaveDarkWeekWarning(page);
    await choosePreset(page, PRESETS.LAST_DAY);
  },

  '29-dark-menu': async (page) => {
    await openMenu(page);
    await toggleTheme(page);
  },

  '30-dark-empty-canvas-new-analysis': async (page) => {
    await leaveDarkWeekWarning(page);
    await openWorkspace(page, [], 'Untitled analysis');
  },

  '01-tooltip-crosshair': async (page) => {
    await openCapacityWorkspace(page);
    await hoverPlotAt(page, TOOLTIP_FRACTIONS.BEFORE_FLIP);
  },

  '02-tooltip-dark': async (page) => {
    await openCapacityWorkspace(page);
    await toggleTheme(page);
    await hoverPlotAt(page, TOOLTIP_FRACTIONS.PAST_FLIP);
  },

  '03-export-menu': async (page) => {
    await openCapacityWorkspace(page);
    await page.click('.chart-panel-header-export >> nth=0');
    await restPointer(page);
    await settle(page, 400);
  },

  '04-export-output-single': async (page) => {
    await openCapacityWorkspace(page);
    await page.clock.setFixedTime(new Date(REFERENCE_EXPORT_TIMES.SINGLE));
    await showExportedImage(page, await exportFromMenu(page, 'app-export-menu .menu-option >> nth=0'), EXPORT_VIEWER.LIGHT_SURROUND);
  },

  '05-export-output-multi': async (page) => {
    await openFindingWindowWithInsights(page);
    await page.clock.setFixedTime(new Date(REFERENCE_EXPORT_TIMES.MULTI));
    await showExportedImage(page, await exportFromMenu(page, '.export-menu-all'), EXPORT_VIEWER.LIGHT_SURROUND);
  },

  '06-export-output-dark': async (page) => {
    await openFindingWindowWithInsights(page);
    await toggleTheme(page);
    await page.clock.setFixedTime(new Date(REFERENCE_EXPORT_TIMES.DARK));
    await showExportedImage(page, await exportFromMenu(page, 'app-export-menu .menu-option >> nth=0'), EXPORT_VIEWER.DARK_SURROUND);
  },
};
