import { describe, expect, it } from 'vitest';
import type { Evidence, Finding } from '../../../../stores/insights/models/finding/finding.model';
import { insightOverlaysOf } from './insight-overlay';

const WINDOW = { fromMilliseconds: 0, untilMilliseconds: 1000 };

const evidence = (direction: Evidence['direction'], fromMilliseconds: number, untilMilliseconds: number): Evidence => ({
  semantic: 'cpu.user',
  seriesId: 's3',
  source: 'atlas_system_cpu_user.rrd',
  direction,
  fromMilliseconds,
  untilMilliseconds,
  fromValue: 1,
  toValue: 2,
  unit: '%',
  spark: [],
});

const finding = (id: string, overrides: Partial<Finding> = {}): Finding => ({
  id,
  severity: 'warning',
  isInferred: false,
  match: 'evidence order matches rule',
  title: 'Sustained CPU saturation',
  fromMilliseconds: 200,
  untilMilliseconds: 400,
  cause: [],
  evidence: [evidence('rising', 200, 300), evidence('gap', 350, 390)],
  ...overrides,
});

const CLOSED = { isPanelOpen: false, hoveredFindingId: null, flashingFindingId: null };
const OPEN = { isPanelOpen: true, hoveredFindingId: null, flashingFindingId: null };

describe('insightOverlaysOf', () => {
  it('paints a faint severity band while the panel is closed, and no evidence marks', () => {
    const overlays = insightOverlaysOf([finding('fd0')], WINDOW, CLOSED);

    expect(overlays.bands).toEqual([{ x: '200.0', width: '200.0', fill: 'var(--insWarnBand)', opacity: '0.30', stroke: 'none' }]);
    expect(overlays.marks).toEqual([]);
  });

  it('paints the band in full with the panel open, and marks both ends of a rise but only the start of a gap', () => {
    const overlays = insightOverlaysOf([finding('fd0')], WINDOW, OPEN);

    expect(overlays.bands[0].opacity).toBe('1.00');
    expect(overlays.marks.map((mark) => mark.x)).toEqual(['200.0', '300.0', '350.0']);
    expect(overlays.marks[0]).toEqual({ x: '200.0', color: 'var(--insWarnFg)', opacity: '0.45' });
  });

  it('dims the findings that are not hovered', () => {
    const overlays = insightOverlaysOf([finding('fd0'), finding('fd1')], WINDOW, { ...OPEN, hoveredFindingId: 'fd1' });

    expect(overlays.bands.map((band) => band.opacity)).toEqual(['0.30', '1.00']);
    expect(overlays.marks[0].opacity).toBe('0.15');
  });

  it('strokes the flashing finding at full strength', () => {
    const overlays = insightOverlaysOf([finding('fd0')], WINDOW, { ...CLOSED, flashingFindingId: 'fd0' });

    expect(overlays.bands[0]).toMatchObject({ opacity: '1', stroke: 'var(--insWarnFg)' });
  });

  it('clips a band to the window and skips findings outside it or thinner than a unit', () => {
    const clipped = insightOverlaysOf([finding('fd0', { fromMilliseconds: -500, untilMilliseconds: 100 })], WINDOW, CLOSED);

    expect(clipped.bands[0]).toMatchObject({ x: '0.0', width: '100.0' });
    expect(insightOverlaysOf([finding('fd0', { fromMilliseconds: 1200, untilMilliseconds: 1500 })], WINDOW, OPEN)).toEqual({ bands: [], marks: [] });
    expect(insightOverlaysOf([finding('fd0', { fromMilliseconds: 500, untilMilliseconds: 500.5 })], WINDOW, OPEN).bands).toEqual([]);
  });
});
