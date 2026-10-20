import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzerGatewayStub, bundleDtoFixture, FIXTURE_UNTIL_MILLISECONDS, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { LOG_TYPE_COLORS } from '../../../../shared/constants/colors';
import { InsightsStore } from '../../../insights/store/insights-store/insights.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SeriesDataStore } from '../../../workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import { LogsStore } from './logs.store';
import { LOG_FIXTURE_COUNT, logFileFixture, logRecordsFixture, textFileFixture } from './logs.store.fixture';

describe('LogsStore', () => {
  let store: LogsStore;
  let timeWindow: TimeWindowStore;
  let toasts: ToastStore;

  const showLogs = async (file: File = logFileFixture()): Promise<void> => {
    await store.load(file);
    store.confirmSetup();
  };

  beforeEach(async () => {
    const gateway = analyzerGatewayStub({ openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture(3)) });

    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway), WorkspaceStore, SeriesDataStore, TimeWindowStore, InsightsStore, LogsStore] });
    store = TestBed.inject(LogsStore);
    timeWindow = TestBed.inject(TimeWindowStore);
    toasts = TestBed.inject(ToastStore);
    await TestBed.inject(WorkspaceStore).open('a1');
  });

  it('starts with no logs, no track and no panel', () => {
    expect(store.status()).toBe('none');
    expect(store.isTrackShown()).toBe(false);
    expect(store.panel()).toBeNull();
    expect(store.validation()).toBeNull();
  });

  it('load, for a readable file, detects the fields, opens the setup and says what was found', async () => {
    await expect(store.load(logFileFixture())).resolves.toBe(true);

    expect(store.status()).toBe('setup');
    expect(store.file()?.name).toBe('atlas-api-logs.json');
    expect(store.recordCount()).toBe(LOG_FIXTURE_COUNT);
    expect(store.draftMapping()).toEqual({ timestamp: '@timestamp', type: 'lvl', message: 'event.msg' });
    expect(store.detectedMapping()).toEqual(store.draftMapping());
    expect(store.validation()?.isValid).toBe(true);
    expect(store.isSetupOpen()).toBe(true);
    expect(store.isTrackShown()).toBe(true);
    expect(toasts.message()).toBe('6 entries parsed · 5 fields found');
  });

  it('load, for a file that is not JSON, fails with the reason and keeps the setup open on it', async () => {
    await expect(store.load(textFileFixture('{"lvl": "info" "msg"}', 'broken-export.json'))).resolves.toBe(false);

    expect(store.status()).toBe('failed');
    expect(store.failure()?.title).toContain("This file isn't valid JSON");
    expect(store.isSetupOpen()).toBe(true);
    expect(store.isTrackShown()).toBe(true);
  });

  it('load, for a file past 25 MB, refuses it without reading it', async () => {
    const file = logFileFixture();
    const read = vi.spyOn(file, 'text');
    Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 });

    await store.load(file);

    expect(store.failure()?.title).toBe('File is too large — 26.0 MB, the limit is 25 MB.');
    expect(read).not.toHaveBeenCalled();
  });

  it('load, for a file the browser cannot read, says so', async () => {
    const file = logFileFixture();
    vi.spyOn(file, 'text').mockRejectedValue(new Error('gone'));

    await store.load(file);

    expect(store.failure()).toEqual({ title: "Couldn't read the file.", detail: 'The browser could not read atlas-api-logs.json.' });
  });

  it('load, for a second file, replaces the first and takes its entries off the timeline', async () => {
    await showLogs();
    await store.load(logFileFixture(logRecordsFixture().slice(0, 2), 'second.json'));

    expect(store.status()).toBe('setup');
    expect(store.entries()).toEqual([]);
    expect(store.recordCount()).toBe(2);
  });

  it('load, for a second file, keeps the first on the track until the second has been read', async () => {
    await showLogs();
    const replacement = logFileFixture(logRecordsFixture().slice(0, 2), 'atlas-worker-logs.json');
    const reading: { finish: (text: string) => void } = { finish: () => undefined };
    vi.spyOn(replacement, 'text').mockImplementation(
      async () =>
        await new Promise<string>((resolve) => {
          reading.finish = resolve;
        }),
    );

    const loaded = store.load(replacement);

    expect(store.status()).toBe('ready');
    expect(store.isReplacing()).toBe(true);
    expect(store.file()?.name).toBe('atlas-api-logs.json');
    expect(store.entries()).toHaveLength(LOG_FIXTURE_COUNT);

    reading.finish(JSON.stringify(logRecordsFixture().slice(0, 2)));

    await expect(loaded).resolves.toBe(true);
    expect(store.isReplacing()).toBe(false);
    expect(store.file()?.name).toBe('atlas-worker-logs.json');
    expect(store.status()).toBe('setup');
    expect(store.isSetupOpen()).toBe(true);
  });

  it('load, for a second file that cannot be used, leaves the first in place and says why the second was not loaded', async () => {
    await showLogs();
    store.select(1);

    await expect(store.load(textFileFixture('{"lvl": "info" "msg"}', 'broken-export.json'))).resolves.toBe(false);

    expect(store.status()).toBe('ready');
    expect(store.failure()).toBeNull();
    expect(store.file()?.name).toBe('atlas-api-logs.json');
    expect(store.entries()).toHaveLength(LOG_FIXTURE_COUNT);
    expect(store.selectedEntry()?.index).toBe(1);
    expect(toasts.message()).toContain('broken-export.json not loaded · ');
  });

  it('confirmSetup, with a valid mapping, places the entries by time, closes the setup and says how many landed', async () => {
    await store.load(logFileFixture());

    expect(store.confirmSetup()).toBe(true);
    expect(store.status()).toBe('ready');
    expect(store.entries().map((entry) => entry.type)).toEqual(['info', 'warn', 'error', 'fatal', 'info', 'error']);
    expect(store.types()).toEqual([
      { name: 'fatal', count: 1 },
      { name: 'error', count: 2 },
      { name: 'warn', count: 1 },
      { name: 'info', count: 2 },
    ]);
    expect(store.panel()).toBeNull();
    expect(store.appliedMapping()).toEqual(store.draftMapping());
    expect(toasts.message()).toBe('6 log entries on the timeline');
  });

  it('confirmSetup, for entries without a usable time, skips them and says how many', async () => {
    await showLogs(logFileFixture([...logRecordsFixture(), { '@timestamp': 'later', lvl: 'info', event: { msg: 'lost' } }]));

    expect(store.entries()).toHaveLength(LOG_FIXTURE_COUNT);
    expect(toasts.message()).toBe('6 log entries on the timeline · 1 skipped without a time');
  });

  it('confirmSetup, while a field blocks, places nothing and asks for the fields to be fixed', async () => {
    await store.load(logFileFixture());
    store.chooseField('type', '@timestamp');

    expect(store.confirmSetup()).toBe(false);
    expect(store.status()).toBe('setup');
    expect(store.isSetupOpen()).toBe(true);
    expect(toasts.message()).toBe('fix the highlighted fields first');
  });

  it('confirmSetup, with nothing remapped since the logs were placed, only closes the setup', async () => {
    await showLogs();
    const placed = store.entries();
    store.openSetup();

    expect(store.isMappingChanged()).toBe(false);
    expect(store.confirmSetup()).toBe(true);
    expect(store.entries()).toBe(placed);
    expect(store.panel()).toBeNull();
  });

  it('chooseField, for one role, validates that role again and leaves what was found for the others as it was', async () => {
    await store.load(logFileFixture());
    const before = store.validation();

    store.chooseField('message', 'service');

    const after = store.validation();

    expect(after?.roles.message).not.toBe(before?.roles.message);
    expect(after?.roles.timestamp).toBe(before?.roles.timestamp);
    expect(after?.roles.type).toBe(before?.roles.type);
  });

  it('confirmSetup places the types the setup counted, entries without a time left out of both', async () => {
    const [first, ...rest] = logRecordsFixture();
    await store.load(logFileFixture([...rest, { ...first, '@timestamp': 'soon', lvl: 'debug' }]));
    const counted = store.validation()?.types;

    store.confirmSetup();

    expect(store.types()).toEqual(counted);
    expect(store.types().map((type) => type.name)).not.toContain('debug');
  });

  it('cancelSetup, after a field was remapped, restores the mapping the timeline was built from', async () => {
    await showLogs();
    store.openSetup();
    store.chooseField('message', 'service');

    expect(store.isMappingChanged()).toBe(true);

    store.cancelSetup();

    expect(store.draftMapping().message).toBe('event.msg');
    expect(store.panel()).toBeNull();
  });

  it('select, for an entry, opens its details and closes the insights panel', async () => {
    const closeInsights = vi.spyOn(TestBed.inject(InsightsStore), 'closePanel');
    await showLogs();

    store.select(3);

    expect(store.isDetailOpen()).toBe(true);
    expect(store.selectedEntry()?.message).toBe('OOMKilled: process exceeded memory limit');
    expect(store.selectedPosition()).toEqual({ position: 3, total: 6 });
    expect(closeInsights).toHaveBeenCalled();
  });

  it('select, for an index that holds no entry, opens nothing', async () => {
    await showLogs();

    store.select(99);

    expect(store.panel()).toBeNull();
    expect(store.selectedEntry()).toBeNull();
  });

  it('step, from the selected entry, moves to its neighbour and stops at either end', async () => {
    await showLogs();
    store.select(4);

    store.step(1);

    expect(store.selectedEntry()?.index).toBe(5);
    expect(store.canStepForward()).toBe(false);
    expect(store.canStepBackward()).toBe(true);

    store.step(1);

    expect(store.selectedEntry()?.index).toBe(5);
  });

  it('step, onto an entry outside the window, moves the window to centre on it', async () => {
    await showLogs();
    timeWindow.showTrailing(4 * MILLISECONDS_PER_HOUR);
    store.select(5);

    store.step(-1);

    const window = timeWindow.window();

    expect(store.selectedEntry()?.index).toBe(4);
    expect((window.fromMilliseconds + window.untilMilliseconds) / 2).toBe(FIXTURE_UNTIL_MILLISECONDS - 6 * MILLISECONDS_PER_HOUR);
    expect(window.untilMilliseconds - window.fromMilliseconds).toBe(4 * MILLISECONDS_PER_HOUR);
  });

  it('centerOnSelected, for the open entry, centres the window on it at the same span', async () => {
    await showLogs();
    store.select(1);

    store.centerOnSelected();

    expect(timeWindow.window()).toEqual({
      fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 28 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 4 * MILLISECONDS_PER_HOUR,
    });
  });

  it('toggleType, for a hidden type, takes its entries out of the stepping and the position', async () => {
    await showLogs();
    store.toggleType('info');
    store.select(1);

    expect(store.hiddenTypes().has('info')).toBe(true);
    expect(store.selectedPosition()).toEqual({ position: 0, total: 4 });
    expect(store.canStepBackward()).toBe(false);

    store.toggleType('info');

    expect(store.selectedPosition()).toEqual({ position: 1, total: 6 });

    store.toggleType('error');
    store.showAllTypes();

    expect(store.hiddenTypes().size).toBe(0);
  });

  it('chooseColor, for a type, recolours it until it is reset, alone or with every other', async () => {
    await showLogs();

    store.chooseColor('error', '#123456');
    store.chooseColor('info', '#654321');

    expect(store.typeColors().get('error')).toBe('#123456');
    expect(store.typeColors().get('fatal')).toBe(LOG_TYPE_COLORS.fatal);

    store.resetColor('error');

    expect(store.typeColors().get('error')).toBe(LOG_TYPE_COLORS.error);
    expect(store.chosenColors().has('info')).toBe(true);

    store.resetColors();

    expect(store.chosenColors().size).toBe(0);
  });

  it('hover, for an entry on the track, holds it until the pointer leaves', async () => {
    await showLogs();

    store.hover(2);

    expect(store.hoveredEntry()?.type).toBe('error');

    store.hover(null);

    expect(store.hoveredEntry()).toBeNull();
  });

  it('toggleShown, while the track is shown, hides it and closes the open panel without losing the logs', async () => {
    await showLogs();
    store.select(0);

    store.toggleShown();

    expect(store.isTrackShown()).toBe(false);
    expect(store.panel()).toBeNull();
    expect(store.entries()).toHaveLength(LOG_FIXTURE_COUNT);

    store.toggleShown();

    expect(store.isTrackShown()).toBe(true);
  });

  it('jumpToLogs, for logs out of the window, shows their whole span with a margin, within the data', async () => {
    const earlier = logRecordsFixture().map((record, index) => ({
      ...record,
      '@timestamp': new Date(FIXTURE_UNTIL_MILLISECONDS - 5 * MILLISECONDS_PER_DAY + index * MILLISECONDS_PER_HOUR).toISOString(),
    }));

    await showLogs(logFileFixture(earlier));

    store.jumpToLogs();

    expect(timeWindow.window()).toEqual({
      fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 5 * MILLISECONDS_PER_DAY - 15 * 60_000,
      untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 5 * MILLISECONDS_PER_DAY + 5 * MILLISECONDS_PER_HOUR + 15 * 60_000,
    });
  });

  it('jumpToLogs, for logs that all fall after the data, says so and leaves the window where it was', async () => {
    const later = logRecordsFixture().map((record, index) => ({
      ...record,
      '@timestamp': new Date(FIXTURE_UNTIL_MILLISECONDS + (index + 1) * MILLISECONDS_PER_HOUR).toISOString(),
    }));

    await showLogs(logFileFixture(later));
    const shown = timeWindow.window();

    expect(store.jumpToLogs()).toBe(false);

    expect(timeWindow.window()).toEqual(shown);
    expect(toasts.message()).toBe('every log entry is outside the time the data covers');
  });

  it('step, onto an entry the data does not reach, opens it, says so and leaves the window where it was', async () => {
    const [first, ...rest] = logRecordsFixture();
    const beyond = { ...first, '@timestamp': new Date(FIXTURE_UNTIL_MILLISECONDS + MILLISECONDS_PER_DAY).toISOString() };
    await showLogs(logFileFixture([...rest, beyond]));
    const shown = timeWindow.window();
    store.select(4);

    store.step(1);

    expect(store.selectedEntry()?.index).toBe(5);
    expect(timeWindow.window()).toEqual(shown);
    expect(toasts.message()).toBe('this entry is outside the time the data covers');
    expect(store.centerOnSelected()).toBe(false);
  });

  it('remove, for loaded logs, clears the file, the mapping, the colours and the filters, and says which file went', async () => {
    await showLogs();
    store.chooseColor('error', '#123456');
    store.toggleType('info');
    store.select(0);

    store.remove();

    expect(store.status()).toBe('none');
    expect(store.entries()).toEqual([]);
    expect(store.chosenColors().size).toBe(0);
    expect(store.hiddenTypes().size).toBe(0);
    expect(store.draftMapping()).toEqual({ timestamp: '', type: '', message: '' });
    expect(store.panel()).toBeNull();
    expect(store.isShown()).toBe(false);
    expect(toasts.message()).toBe('atlas-api-logs.json removed');
  });

  it('the Undo of the removal toast brings back the file, its mapping, its colours and its hidden types', async () => {
    await showLogs();
    store.chooseColor('error', '#123456');
    store.toggleType('info');
    const placed = store.entries();

    expect(store.remove()).toBe(true);
    expect(toasts.actionLabel()).toBe('Undo');
    toasts.runAction();

    expect(store.status()).toBe('ready');
    expect(store.file()?.name).toBe('atlas-api-logs.json');
    expect(store.entries()).toBe(placed);
    expect(store.appliedMapping()).toEqual({ timestamp: '@timestamp', type: 'lvl', message: 'event.msg' });
    expect(store.typeColors().get('error')).toBe('#123456');
    expect(store.hiddenTypes().has('info')).toBe(true);
    expect(store.isTrackShown()).toBe(true);
  });

  it('the Undo of the removal toast does nothing while another file is being read in its place', async () => {
    await showLogs();
    store.remove();
    const second = logFileFixture(logRecordsFixture().slice(0, 2), 'second.json');
    const reading: { finish: (text: string) => void } = { finish: () => undefined };
    vi.spyOn(second, 'text').mockImplementation(
      async () =>
        await new Promise<string>((resolve) => {
          reading.finish = resolve;
        }),
    );
    const loaded = store.load(second);

    toasts.runAction();
    reading.finish(JSON.stringify(logRecordsFixture().slice(0, 2)));
    await loaded;

    expect(store.file()?.name).toBe('second.json');
    expect(store.recordCount()).toBe(2);
  });

  it('remove, with no logs loaded, removes nothing and says nothing', () => {
    expect(store.remove()).toBe(false);
    expect(toasts.message()).toBeNull();
  });

  describe('across visits to an analysis', () => {
    const visit = async (analysisId: string): Promise<{ readonly logs: LogsStore; readonly leave: () => void }> => {
      const visited = createEnvironmentInjector([WorkspaceStore, TimeWindowStore, InsightsStore, LogsStore], TestBed.inject(EnvironmentInjector));
      const logs = visited.get(LogsStore);

      logs.clear();
      await visited.get(WorkspaceStore).open(analysisId);
      TestBed.tick();

      return { logs, leave: () => visited.destroy() };
    };

    const visitWithLogs = async (analysisId: string): Promise<void> => {
      const { logs, leave } = await visit(analysisId);

      await logs.load(logFileFixture());
      logs.confirmSetup();
      logs.chooseColor('error', '#123456');
      logs.toggleType('info');
      TestBed.tick();
      leave();
    };

    it('coming back to the analysis finds its log file, its mapping, its colours and its hidden types as they were left', async () => {
      await visitWithLogs('a1');

      const { logs } = await visit('a1');

      expect(logs.status()).toBe('ready');
      expect(logs.file()?.name).toBe('atlas-api-logs.json');
      expect(logs.entries()).toHaveLength(LOG_FIXTURE_COUNT);
      expect(logs.appliedMapping()).toEqual({ timestamp: '@timestamp', type: 'lvl', message: 'event.msg' });
      expect(logs.typeColors().get('error')).toBe('#123456');
      expect(logs.hiddenTypes().has('info')).toBe(true);
      expect(logs.panel()).toBeNull();
    });

    it('another analysis opens without the logs of the first', async () => {
      await visitWithLogs('a1');

      const { logs } = await visit('a2');

      expect(logs.status()).toBe('none');
    });

    it('logs removed before leaving are not there on the way back', async () => {
      await visitWithLogs('a1');
      const second = await visit('a1');
      second.logs.remove();
      TestBed.tick();
      second.leave();

      const { logs } = await visit('a1');

      expect(logs.status()).toBe('none');
    });
  });

  it('the insights panel opening closes whichever log panel is open', async () => {
    const insights = TestBed.inject(InsightsStore);
    await showLogs();
    store.select(2);

    await insights.run();
    TestBed.tick();

    expect(insights.isPanelOpen()).toBe(true);
    expect(store.panel()).toBeNull();
    expect(store.selectedEntry()).toBeNull();
  });
});
