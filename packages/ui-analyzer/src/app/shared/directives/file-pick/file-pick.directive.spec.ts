import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf } from '../../utils/component-fixture/component-fixture.fixture';
import { FilePickDirective } from './file-pick.directive';

@Component({
  imports: [FilePickDirective],
  template: '<button type="button" appFilePick=".json,.ndjson" (filePicked)="picked($event)">Choose</button>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  public readonly picked = vi.fn();
}

const pickerOf = (): HTMLInputElement | null => document.body.querySelector<HTMLInputElement>('input[type="file"]');

describe('FilePickDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('opens the system file picker for the accepted extensions when its host is clicked', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    elementOf(fixture, 'button')?.click();

    expect(pickerOf()?.accept).toBe('.json,.ndjson');
    expect(pickerOf()?.style.display).toBe('none');

    pickerOf()?.dispatchEvent(new Event('cancel'));
  });

  it('hands over the file that was picked and leaves no picker behind', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    elementOf(fixture, 'button')?.click();
    const picker = pickerOf();
    const file = new File(['[]'], 'logs.json');
    Object.defineProperty(picker, 'files', { value: [file] });

    picker?.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(fixture.componentInstance.picked).toHaveBeenCalledWith(file);
    expect(pickerOf()).toBeNull();
  });

  it('hands over nothing when the picker is dismissed', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    elementOf(fixture, 'button')?.click();

    pickerOf()?.dispatchEvent(new Event('cancel'));
    await fixture.whenStable();

    expect(fixture.componentInstance.picked).not.toHaveBeenCalled();
    expect(pickerOf()).toBeNull();
  });
});
