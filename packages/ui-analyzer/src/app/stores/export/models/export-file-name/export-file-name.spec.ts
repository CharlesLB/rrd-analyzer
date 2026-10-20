import { describe, expect, it } from 'vitest';
import { EXPORT_EXTENSIONS, exportFileNameOf } from './export-file-name';

const WINDOW = { fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };

describe('exportFileNameOf', () => {
  it('exportFileNameOf one chart names it by the slug of its series and the window to the minute', () => {
    expect(exportFileNameOf(['atlas_system_cpu_user'], WINDOW, EXPORT_EXTENSIONS.PNG)).toBe('rrd_atlas-system-cpu-user_202608281500_202608291500.png');
  });

  it('exportFileNameOf the whole canvas names the window only', () => {
    expect(exportFileNameOf(['atlas_system_cpu_user', 'atlas_system_memory_used'], WINDOW, EXPORT_EXTENSIONS.SVG)).toBe('rrd_202608281500_202608291500.svg');
  });

  it('exportFileNameOf a series named with capitals and symbols lowercases it and turns each run of symbols into one inner hyphen', () => {
    expect(exportFileNameOf(['  Disk / Used %  '], WINDOW, EXPORT_EXTENSIONS.PNG)).toBe('rrd_disk-used_202608281500_202608291500.png');
  });
});
