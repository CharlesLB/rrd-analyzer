import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { BrowserEditionNoticeComponent } from './browser-edition-notice.component';

describe('BrowserEditionNoticeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('says the app runs in the browser and that nothing opened in it reaches a server or outlives the tab', () => {
    const fixture = renderWithInputs(BrowserEditionNoticeComponent, { offlineDownloadUrl: '/#download' });

    expect(textOf(fixture, '.browser-edition-notice-label')).toBe('Running in your browser');
    expect(textOf(fixture, '.browser-edition-notice-privacy')).toContain('Nothing you open is uploaded or saved on our servers');
    expect(textOf(fixture, '.browser-edition-notice-privacy')).toContain('erased when you close or reload it');
  });

  it('offers the offline app at the address it is given', () => {
    const fixture = renderWithInputs(BrowserEditionNoticeComponent, { offlineDownloadUrl: '/#download' });

    expect(textOf(fixture, '.browser-edition-notice-download')).toBe('Prefer it offline? Download the app');
    expect(elementOf(fixture, '.browser-edition-notice-download')?.getAttribute('href')).toBe('/#download');
  });
});
