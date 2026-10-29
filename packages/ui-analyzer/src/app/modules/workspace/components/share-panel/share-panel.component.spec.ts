import { TestBed } from '@angular/core/testing';
import { MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { LiveSession } from '../../../../stores/sharing/models/live-session/live-session';
import { SharePanelComponent } from './share-panel.component';

const NOW = 1_000_000;

const SESSION: LiveSession = {
  analysisId: 'a1',
  sessionId: 'session-1',
  link: 'https://rrd-analyzer.example/app/#/shared/session-1/key-1',
  revision: 2,
  expiresAtMilliseconds: NOW + 37 * MILLISECONDS_PER_MINUTE,
  files: [
    { name: 'cpu.rrd', path: '/rrd/cpu.rrd', isOnline: true },
    { name: 'memory.rrd', path: '', isOnline: false },
  ],
  log: null,
};

const renderPanel = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(SharePanelComponent, { session: SESSION, nowMilliseconds: NOW, isBusy: false, ...inputs });

describe('SharePanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the link, how long the session lives without activity, and marks every file online or local', () => {
    const fixture = renderPanel();

    expect(elementOf(fixture, '.share-panel-link-field')).toHaveProperty('value', SESSION.link);
    expect(textOf(fixture, '.share-panel-expiry')).toBe('Erased 37 minutes after the last activity');
    expect(textsOf(fixture, '.share-panel-file-name')).toEqual(['cpu.rrd', 'memory.rrd']);
    expect(textsOf(fixture, '.share-panel-state')).toEqual(['online', 'local']);
    expect(elementsOf(fixture, '.share-panel-file-name').map((name) => name.title)).toEqual(['/rrd/cpu.rrd', 'memory.rrd']);
  });

  it('focuses and selects the link as it opens, so it can be copied by hand too', async () => {
    const fixture = renderPanel();

    await fixture.whenStable();
    const linkField = elementOf(fixture, '.share-panel-link-field');

    expect(document.activeElement).toBe(linkField);
    expect(linkField).toHaveProperty('selectionStart', 0);
    expect(linkField).toHaveProperty('selectionEnd', SESSION.link.length);
  });

  it('with a log in the session, lists it apart and marks whether it is online', () => {
    const fixture = renderPanel({ session: { ...SESSION, log: { name: 'service.ndjson', isOnline: false } } });

    expect(textsOf(fixture, '.share-panel-label')).toEqual(['Public link', 'Files', 'Log']);
    expect(textsOf(fixture, '.share-panel-file-name').at(-1)).toBe('service.ndjson');
    expect(textsOf(fixture, '.share-panel-state').at(-1)).toBe('local');
  });

  it('with an uploaded log, marks it online', () => {
    const fixture = renderPanel({ session: { ...SESSION, log: { name: 'service.ndjson', isOnline: true } } });

    expect(textsOf(fixture, '.share-panel-state').at(-1)).toBe('online');
  });

  it('with a minute left, speaks of one minute', () => {
    expect(textOf(renderPanel({ nowMilliseconds: SESSION.expiresAtMilliseconds - 1 }), '.share-panel-expiry')).toBe('Erased 1 minute after the last activity');
  });

  it('asks to copy the link, to end the session and to close, each from its own button', () => {
    const fixture = renderPanel();
    const asked = { copy: vi.fn(), end: vi.fn(), close: vi.fn() };
    fixture.componentInstance.copyRequested.subscribe(asked.copy);
    fixture.componentInstance.endRequested.subscribe(asked.end);
    fixture.componentInstance.closed.subscribe(asked.close);

    elementOf(fixture, '.share-panel-link-copy')?.click();
    elementOf(fixture, '.share-panel-end')?.click();
    elementOf(fixture, '.share-panel-close')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(asked.copy).toHaveBeenCalledTimes(1);
    expect(asked.end).toHaveBeenCalledTimes(1);
    expect(asked.close).toHaveBeenCalledTimes(2);
  });

  it('while the session is being ended, says so and cannot be asked again', () => {
    const fixture = renderPanel({ isBusy: true });

    expect(textOf(fixture, '.share-panel-end')).toBe('Ending…');
    expect(elementOf(fixture, '.share-panel-end')?.hasAttribute('disabled')).toBe(true);
  });

  it('closes on a click that both starts and ends on the scrim', () => {
    const fixture = renderPanel();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const scrim = elementOf(fixture, '.share-panel-scrim');

    scrim?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    scrim?.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('SharePanelComponent, compiled again from its own metadata as a TestBed override compiles it, still finds the element it focuses', async () => {
    TestBed.overrideComponent(SharePanelComponent, { set: {} });
    await TestBed.compileComponents();
    const fixture = renderPanel();

    await fixture.whenStable();

    expect(document.activeElement).toBe(elementOf(fixture, '.share-panel-link-field'));
  });
});
