import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import { MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { Analysis } from '../../../../stores/library/models/analysis/analysis.model';
import { AnalysisRowComponent } from './analysis-row.component';

const NOW = new Date(2026, 7, 29, 15, 0).getTime();

const analysis = (overrides: Partial<Analysis> = {}): Analysis => ({
  id: 'a1',
  name: 'Atlas prod · capacity',
  canvas: [['system_cpu_user'], ['system_memory_used']],
  lastAccessedMilliseconds: NOW - 2 * MILLISECONDS_PER_HOUR,
  ...overrides,
});

const renderRow = (overrides: Partial<Analysis> = {}, missingSources: readonly string[] = []) =>
  renderWithInputs(AnalysisRowComponent, { analysis: analysis(overrides), nowMilliseconds: NOW, route: ['/workspace', 'a1'], missingSources });

describe('AnalysisRowComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  const navigationSpy = () => vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

  it('shows the name, how long ago it was opened and the open affordance', () => {
    const fixture = renderRow();

    expect(textOf(fixture, '.analysis-row-name')).toBe('Atlas prod · capacity');
    expect(textOf(fixture, '.analysis-row-access')).toBe('opened 2 h ago');
    expect(textOf(fixture, '.analysis-row-open')).toBe('Open');
  });

  it('says nothing about its files while they are all where it read them', () => {
    expect(elementOf(renderRow(), '.analysis-row-missing')).toBeNull();
  });

  it('says how many of its files are missing from the disk, naming them in the tip, before it is opened', () => {
    const fixture = renderRow({}, ['cpu.rrd', 'memory.rrd']);

    expect(textOf(fixture, '.analysis-row-missing')).toBe('! 2 files missing');
    expect(elementOf(fixture, '.analysis-row-missing')?.title).toBe('No longer where the analysis read them: cpu.rrd, memory.rrd');
  });

  it('describes the canvas it was left with, chart count and labels', () => {
    expect(textOf(renderRow(), '.analysis-row-meta')).toBe('2 charts · system_cpu_user, system_memory_used');
  });

  it('describes a canvas of one chart in the singular', () => {
    expect(textOf(renderRow({ canvas: [['system_cpu_user']] }), '.analysis-row-meta')).toBe('1 chart · system_cpu_user');
  });

  it('describes a merged chart as one chart naming every series drawn in it', () => {
    const canvas = [['system_cpu_user', 'system_cpu_system'], ['system_memory_used']];

    expect(textOf(renderRow({ canvas }), '.analysis-row-meta')).toBe('2 charts · system_cpu_user + system_cpu_system, system_memory_used');
  });

  it('describes an empty canvas by its count alone, with no labels to list', () => {
    expect(textOf(renderRow({ canvas: [] }), '.analysis-row-meta')).toBe('0 charts');
  });

  it('links the whole row to the workspace of its analysis', () => {
    const fixture = renderRow();
    const navigate = navigationSpy();

    elementOf(fixture, '.analysis-row')?.click();

    expect(TestBed.inject(Router).serializeUrl(navigate.mock.calls[0][0] as UrlTree)).toBe('/workspace/a1');
  });

  it('opens its analysis from the keyboard, as a button would', () => {
    const fixture = renderRow();
    const navigate = navigationSpy();
    const row = elementOf(fixture, '.analysis-row');

    row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(row?.getAttribute('role')).toBe('button');
    expect(TestBed.inject(Router).serializeUrl(navigate.mock.calls[0][0] as UrlTree)).toBe('/workspace/a1');
  });

  it('keeps its delete button beside the row it opens, not inside it, named for what it does', () => {
    const fixture = renderRow();
    const deleteButton = elementOf(fixture, '.analysis-row-delete');

    expect(elementOf(fixture, '.analysis-row')?.contains(deleteButton)).toBe(false);
    expect(elementOf(fixture, '.analysis-row button, .analysis-row a, .analysis-row [tabindex]')).toBeNull();
    expect(deleteButton?.getAttribute('aria-label')).toBe('delete analysis');
  });

  it('keeps delete from opening the analysis underneath it', () => {
    const fixture = renderRow();
    const navigate = navigationSpy();
    const removed = vi.fn();
    fixture.componentInstance.removed.subscribe(removed);

    elementOf(fixture, '.analysis-row-delete')?.click();

    expect(removed).toHaveBeenCalledWith('a1');
    expect(navigate).not.toHaveBeenCalled();
  });
});
