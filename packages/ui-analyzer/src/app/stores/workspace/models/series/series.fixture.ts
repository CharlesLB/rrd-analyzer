import { SERIES_COLORS } from '../../../../shared/constants/colors';
import type { Series } from './series.model';

const FIXTURE_STEP_MILLISECONDS = 300_000;

export const CPU_USER_SERIES: Series = {
  id: 's3',
  file: 'atlas_system_cpu_user.rrd',
  name: 'atlas_system_cpu_user',
  label: 'system_cpu_user',
  unit: '%',
  color: SERIES_COLORS[3],
  stepMilliseconds: FIXTURE_STEP_MILLISECONDS,
};

export const MEMORY_USED_SERIES: Series = {
  id: 's5',
  file: 'atlas_system_memory_used.rrd',
  name: 'atlas_system_memory_used',
  label: 'system_memory_used',
  unit: 'B',
  color: SERIES_COLORS[5],
  stepMilliseconds: FIXTURE_STEP_MILLISECONDS,
};

export const seriesFixture = (index: number, overrides: Partial<Series> = {}): Series => ({
  id: `s${index}`,
  file: `metric_${index}.rrd`,
  name: `atlas_metric_${index}`,
  label: `metric_${index}`,
  unit: '',
  color: SERIES_COLORS[0],
  stepMilliseconds: FIXTURE_STEP_MILLISECONDS,
  ...overrides,
});
