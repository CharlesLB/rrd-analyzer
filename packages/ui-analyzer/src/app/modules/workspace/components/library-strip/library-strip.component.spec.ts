import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LibraryStripComponent } from './library-strip.component';

@Component({
  imports: [LibraryStripComponent],
  template: '<app-library-strip><span class="projected-card">cpu</span></app-library-strip>',
})
class LibraryStripHostComponent {}

describe('LibraryStripComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('lays out whatever cards it is given inside its scrolling strip', () => {
    const fixture = TestBed.createComponent(LibraryStripHostComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, '.library-strip .projected-card')?.textContent).toBe('cpu');
  });
});
