import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { DownloadIconComponent } from './download-icon.component';

describe('DownloadIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws an arrow coming down onto a tray, hidden from a reader since the control around it carries the name', () => {
    const fixture = TestBed.createComponent(DownloadIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, 'path')).toBe(3);
    expect(elementOf(fixture, '.download-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
