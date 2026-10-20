import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisDto } from '../../../../core/gateway/analyzer.dto';
import { analysisDtoFixture, analyzerGatewayStub, FIXTURE_UNTIL_MILLISECONDS, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { BrowserGateway } from '../../../../core/gateway/browser-gateway/browser.gateway';
import { countOf, elementOf, textOf, textsOf, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { BuildStore } from '../../../../stores/build/store/build-store/build.store';
import { LibraryStore } from '../../../../stores/library/store/library-store/library.store';
import { stubBrowserStorage } from '../../../../stores/theme/store/theme-store/theme.store.fixture';
import { ToastStore } from '../../../../stores/toast/store/toast-store/toast.store';
import { LibraryPageComponent } from './library-page.component';

const ANALYSES = [analysisDtoFixture({ id: 'a1', name: 'Atlas prod · capacity' }), analysisDtoFixture({ id: 'a2', name: 'HTTP latency review' })];

const renderPage = async () => {
  const fixture = TestBed.createComponent(LibraryPageComponent);
  fixture.detectChanges();
  await TestBed.inject(LibraryStore).refresh();
  fixture.detectChanges();

  return fixture;
};

describe('LibraryPageComponent', () => {
  beforeEach(() => {
    stubBrowserStorage();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideGatewayStub(analyzerGatewayStub({ listAnalyses: vi.fn().mockResolvedValue(ANALYSES) }))],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every stored analysis as a row under the previous analyses caption', async () => {
    const fixture = await renderPage();

    expect(countOf(fixture, 'app-analysis-row')).toBe(2);
    expect(textOf(fixture, '.library-caption')).toBe('Previous analyses');
  });

  it('says the library is being read until its first answer, then that it holds no analysis yet', async () => {
    const listing: { answer: (analyses: readonly AnalysisDto[]) => void } = { answer: () => undefined };
    vi.mocked(TestBed.inject(BrowserGateway).listAnalyses).mockImplementation(
      async () =>
        await new Promise<readonly AnalysisDto[]>((resolve) => {
          listing.answer = resolve;
        }),
    );
    const fixture = TestBed.createComponent(LibraryPageComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '.library-note')).toBe('Reading the library…');

    await vi.waitFor(() => expect(TestBed.inject(BrowserGateway).listAnalyses).toHaveBeenCalled());
    listing.answer([]);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(textOf(fixture, '.library-note')).toBe('No analyses yet. Create one to start charting.');
    });
  });

  it('says nothing about an empty or loading library while it lists analyses', async () => {
    const fixture = await renderPage();

    expect(elementOf(fixture, '.library-note')).toBeNull();
    expect(elementOf(fixture, '.library-failure')).toBeNull();
  });

  it('offers to read a library that could not be read again, and lists it once it can', async () => {
    vi.mocked(TestBed.inject(BrowserGateway).listAnalyses).mockRejectedValueOnce(new Error('offline'));
    const fixture = TestBed.createComponent(LibraryPageComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(textOf(fixture, '.library-failure-message')).toBe('The library could not be read.');
    });

    elementOf(fixture, '.library-failure-retry')?.click();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(countOf(fixture, 'app-analysis-row')).toBe(2);
    });
    expect(elementOf(fixture, '.library-failure')).toBeNull();
  });

  it('offers no filter while the list is short enough to read at a glance', async () => {
    const fixture = await renderPage();

    expect(elementOf(fixture, '.library-filter')).toBeNull();
  });

  it('filters a long list by name as it is typed, and says when no analysis matches', async () => {
    const manyAnalyses = Array.from({ length: 8 }, (_unused, index) =>
      analysisDtoFixture({ id: `a${index}`, name: index === 3 ? 'HTTP latency' : `Atlas ${index}` }),
    );

    vi.mocked(TestBed.inject(BrowserGateway).listAnalyses).mockResolvedValue(manyAnalyses);
    const fixture = await renderPage();

    typeInto(fixture, '.library-filter input', ' http ');
    fixture.detectChanges();

    expect(textsOf(fixture, '.analysis-row-name')).toEqual(['HTTP latency']);

    typeInto(fixture, '.library-filter input', 'postgres');
    fixture.detectChanges();

    expect(countOf(fixture, 'app-analysis-row')).toBe(0);
    expect(textOf(fixture, '.library-note')).toBe('No analyses match.');
  });

  it('opens the dialog holding the dumps dropped on the card', async () => {
    const fixture = await renderPage();
    const drop = Object.assign(new MouseEvent('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [new File(['RRD'], 'atlas.rrd')] } });

    elementOf(fixture, '.new-analysis-card')?.dispatchEvent(drop);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(textsOf(fixture, '.pending-source-list-name')).toEqual(['atlas.rrd']);
    });
  });

  it('watches native file drops for as long as it is on show, and no longer', async () => {
    const stopWatching = vi.fn();
    const watch = vi.spyOn(TestBed.inject(LibraryStore), 'watchNativeFileDrop').mockReturnValue(stopWatching);
    const fixture = await renderPage();

    expect(watch).toHaveBeenCalledTimes(1);

    fixture.destroy();

    expect(stopWatching).toHaveBeenCalledTimes(1);
  });

  it('opens the dialog only once the card asks for it', async () => {
    const fixture = await renderPage();

    expect(elementOf(fixture, 'app-new-analysis-dialog')).toBeNull();

    elementOf(fixture, '.new-analysis-card')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-new-analysis-dialog')).not.toBeNull();
  });

  it('opens the workspace of the analysis the dialog creates, closing the dialog behind it', async () => {
    const fixture = await renderPage();
    const library = TestBed.inject(LibraryStore);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    library.openDialog();
    library.addSources([{ name: 'atlas.rrd', path: '', size: 1 }]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    elementOf(fixture, '.new-analysis-dialog-create')?.click();

    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(['/workspace', 'a1']);
    });
    expect(library.isDialogOpen()).toBe(false);
  });

  it('leaves no dialog open behind it once the page is left, so coming back does not reopen it', async () => {
    const fixture = await renderPage();
    const library = TestBed.inject(LibraryStore);
    library.openDialog();

    fixture.destroy();

    expect(library.isDialogOpen()).toBe(false);
  });

  it('ages the time each analysis was opened while the page stays on show', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(FIXTURE_UNTIL_MILLISECONDS);
    const fixture = await renderPage();

    expect(textOf(fixture, '.analysis-row-access')).toBe('opened just now');

    vi.advanceTimersByTime(2 * 60_000);
    fixture.detectChanges();

    expect(textOf(fixture, '.analysis-row-access')).toBe('opened 2 min ago');
    vi.useRealTimers();
  });

  it('links each row to the workspace of its analysis', async () => {
    const fixture = await renderPage();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    elementOf(fixture, '.analysis-row')?.click();

    expect(router.serializeUrl(navigate.mock.calls[0][0] as UrlTree)).toBe('/workspace/a1');
  });

  it('takes a row away from its delete button and offers to undo, which brings the row back', async () => {
    const fixture = await renderPage();
    const toasts = TestBed.inject(ToastStore);

    elementOf(fixture, '.analysis-row-delete')?.click();
    fixture.detectChanges();

    expect(toasts.message()).toBe('analysis deleted');
    expect(countOf(fixture, 'app-analysis-row')).toBe(1);

    toasts.runAction();
    fixture.detectChanges();

    expect(countOf(fixture, 'app-analysis-row')).toBe(2);
  });

  it('deletes for good what still waited for an Undo once the page is left or the window goes', async () => {
    const fixture = await renderPage();
    const gateway = TestBed.inject(BrowserGateway);

    elementOf(fixture, '.analysis-row-delete')?.click();
    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalledWith('a1'));

    fixture.detectChanges();
    elementOf(fixture, '.analysis-row-delete')?.click();
    fixture.destroy();

    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalledWith('a2'));
  });

  it('shows the version the daemon was built as in the corner of the page', async () => {
    const fixture = await renderPage();
    await TestBed.inject(BuildStore).load();
    fixture.detectChanges();

    expect(textOf(fixture, '.library-version')).toBe('1.4.0 (abcdef0)');
  });
});
