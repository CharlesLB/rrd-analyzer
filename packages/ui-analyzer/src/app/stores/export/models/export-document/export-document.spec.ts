import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { Finding, Severity } from '../../../insights/models/finding/finding.model';
import { CPU_USER_SERIES, MEMORY_USED_SERIES } from '../../../workspace/models/series/series.fixture';
import type { SeriesSample } from '../../../workspace/models/series/series.model';
import { DARK_EXPORT_PALETTE, LIGHT_EXPORT_PALETTE } from '../export-palette/export-palette';
import type { ExportChart, ExportDocumentRequest } from '../export-request/export-request';
import { exportDocumentOf } from './export-document';

const FROM = new Date(2026, 7, 28, 15, 0).getTime();
const UNTIL = new Date(2026, 7, 29, 15, 0).getTime();
const EXPORTED_AT = new Date(2026, 8, 18, 20, 20).getTime();
const messages = messagesFor();

const findingAt = (severity: Severity, startFraction: number, endFraction: number): Finding => ({
  id: `${severity}-${startFraction}`,
  severity,
  isInferred: false,
  match: '',
  title: '',
  fromMilliseconds: FROM + (UNTIL - FROM) * startFraction,
  untilMilliseconds: FROM + (UNTIL - FROM) * endFraction,
  cause: [],
  evidence: [],
});

const chartOf = (series = CPU_USER_SERIES, samples: readonly SeriesSample[] = [20, 40, null, 34.6]): ExportChart => ({ lines: [{ series, samples, axis: 0 }] });

const MERGED_CHART: ExportChart = {
  lines: [
    { series: CPU_USER_SERIES, samples: [20, 40, null, 34.6], axis: 0 },
    { series: MEMORY_USED_SERIES, samples: [4.1e9, 4.4e9, null, null], axis: 1 },
  ],
};

const documentOf = (overrides: Partial<ExportDocumentRequest> = {}) =>
  exportDocumentOf({
    analysisName: 'Atlas prod · capacity',
    charts: [chartOf()],
    window: { fromMilliseconds: FROM, untilMilliseconds: UNTIL },
    findings: [],
    palette: LIGHT_EXPORT_PALETTE,
    exportedAtMilliseconds: EXPORTED_AT,
    embeddedFontFace: '',
    texts: {
      brand: messages.application.name,
      mergedSeparator: messages.application.mergedSeparator,
      document: messages.export.document,
      severities: messages.insights.severities,
      units: messages.units,
    },
    ...overrides,
  });

const linesOf = (markup: string, prefix: string): readonly string[] => markup.split('\n').filter((line) => line.startsWith(prefix));

describe('exportDocumentOf', () => {
  it('exportDocumentOf with one chart titles the frame after the series and names the analysis beside the window', () => {
    const exported = documentOf();

    expect(exported).toMatchObject({ width: 1920, height: 1080, background: LIGHT_EXPORT_PALETTE.background, shadedFindingCount: 0 });
    expect(exported.markup).toContain('>atlas_system_cpu_user</text>');
    expect(exported.markup).toContain('>2026-08-28 15:00  →  2026-08-29 15:00   ·   24 h window   ·   Atlas prod · capacity</text>');
    expect(exported.markup).toContain('>%   ·   last 34.6%   ·   peak 40.0%</text>');
    expect(exported.markup).toContain('>960 samples per series   ·   exported 2026-09-18 20:20</text>');
  });

  it('exportDocumentOf with several charts shares the frame between them so that together they fill it', () => {
    const exported = documentOf({ charts: [chartOf(), chartOf(MEMORY_USED_SERIES, [4.1e9, 4.4e9])] });
    const cards = linesOf(exported.markup, '<rect x="40"');

    expect(exported.markup).toContain(`font-weight="700" fill="${LIGHT_EXPORT_PALETTE.text}">Atlas prod · capacity</text>`);
    expect(exported.markup).toContain('24 h window   ·   2 charts</text>');
    expect(cards).toEqual([
      `<rect x="40" y="122.0" width="1840" height="431.0" rx="14" fill="${LIGHT_EXPORT_PALETTE.card}" stroke="${LIGHT_EXPORT_PALETTE.line}"/>`,
      `<rect x="40" y="571.0" width="1840" height="431.0" rx="14" fill="${LIGHT_EXPORT_PALETTE.card}" stroke="${LIGHT_EXPORT_PALETTE.line}"/>`,
    ]);
  });

  it('exportDocumentOf with a hole in the samples lifts the pen over it instead of bridging it', () => {
    const [path] = linesOf(documentOf().markup, '<path');

    expect(path).toBe(
      `<path d="M152.0 820.8 L720.0 657.6 M1856.0 701.7" fill="none" stroke="${CPU_USER_SERIES.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  });

  it('exportDocumentOf with a chart that has no reading says so beside its unit', () => {
    expect(documentOf({ charts: [chartOf(MEMORY_USED_SERIES, [null, null])] }).markup).toContain('>B   ·   no data</text>');
  });

  it('exportDocumentOf with findings shades each narrower than half the window on every chart and labels it on the first chart only', () => {
    const exported = documentOf({
      charts: [chartOf(), chartOf(MEMORY_USED_SERIES, [4.1e9, 4.4e9])],
      findings: [findingAt('critical', 0.4, 0.6), findingAt('warning', 0.1, 0.7), findingAt('info', 1.1, 1.3)],
    });

    expect(exported.shadedFindingCount).toBe(1);
    expect(linesOf(exported.markup, '<rect x="833.6"')).toHaveLength(4);
    expect(linesOf(exported.markup, '<text x="839.6"')).toEqual([
      `<text x="839.6" y="188.0" font-size="12" font-weight="700" fill="${LIGHT_EXPORT_PALETTE.severities.critical}">CRITICAL</text>`,
    ]);
    expect(exported.markup).toContain('>1 finding shaded by severity   ·   960 samples per series');
  });

  it('exportDocumentOf in the dark theme paints every color as a literal hex from the dark palette', () => {
    const exported = documentOf({ palette: DARK_EXPORT_PALETTE, findings: [findingAt('critical', 0.4, 0.6)] });

    expect(exported.background).toBe(DARK_EXPORT_PALETTE.background);
    expect(exported.markup).toContain(`fill="${DARK_EXPORT_PALETTE.severities.critical}" fill-opacity="0.12"`);
    expect(exported.markup).not.toContain('var(');
  });

  it('exportDocumentOf with markup in a series name escapes it as text', () => {
    const exported = documentOf({ charts: [chartOf({ ...CPU_USER_SERIES, name: 'cpu <user> & "system"' })] });

    expect(exported.markup).toContain('>cpu &lt;user&gt; &amp; &quot;system&quot;</text>');
  });

  it('exportDocumentOf with a font face embeds it right after the root element', () => {
    const [root, embedded] = documentOf({ embeddedFontFace: "@font-face{font-family:'Nunito';src:url(data:font/woff2;base64,AAAA)}" }).markup.split('\n');

    expect(root).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="Nunito, Helvetica, Arial, sans-serif">',
    );
    expect(embedded).toBe("<defs><style>@font-face{font-family:'Nunito';src:url(data:font/woff2;base64,AAAA)}</style></defs>");
  });

  it('exportDocumentOf with a merged chart draws it as one card with a swatch and a line per series, titled after all of them', () => {
    const exported = documentOf({ charts: [MERGED_CHART] });

    expect(linesOf(exported.markup, '<rect x="40"')).toHaveLength(1);
    expect(linesOf(exported.markup, '<circle')).toHaveLength(2);
    expect(linesOf(exported.markup, '<path').map((path) => path.match(/stroke="(#\w+)"/)?.[1])).toEqual([CPU_USER_SERIES.color, MEMORY_USED_SERIES.color]);
    expect(exported.markup).toContain(`font-weight="700" fill="${LIGHT_EXPORT_PALETTE.text}">atlas_system_cpu_user + atlas_system_memory_used</text>`);
  });

  it('exportDocumentOf with a merged chart labels its second axis on the left too, beside the first, in the series color, and narrows the plot to make room', () => {
    const exported = documentOf({ charts: [MERGED_CHART] });
    const [cpuPath] = linesOf(exported.markup, '<path');
    const [firstAxisLabel] = linesOf(exported.markup, '<text x="234"');
    const [secondAxisLabel] = linesOf(exported.markup, '<text x="138"');

    expect(firstAxisLabel).toMatch(/>100\.0%<\/text>$/);
    expect(firstAxisLabel).toContain(`fill="${CPU_USER_SERIES.color}">`);
    expect(secondAxisLabel).toContain(`text-anchor="end" font-size="14" fill="${MEMORY_USED_SERIES.color}">`);
    expect(secondAxisLabel).toMatch(/>4\.\d\d GiB<\/text>$/);
    expect(cpuPath).toContain('M248.0 ');
    expect(cpuPath).toMatch(/ M1856\.0 [\d.]+"/);
  });

  it('exportDocumentOf with a merged chart sums up the last reading of each series in its color', () => {
    expect(documentOf({ charts: [MERGED_CHART] }).markup).toContain(
      `<tspan fill="${CPU_USER_SERIES.color}">34.6%</tspan><tspan fill="${LIGHT_EXPORT_PALETTE.muted}">   ·   </tspan><tspan fill="${MEMORY_USED_SERIES.color}">4.10 GiB</tspan>`,
    );
  });

  it('exportDocumentOf keeps every chart on the one time axis when only one of them needs a second axis', () => {
    const exported = documentOf({ charts: [MERGED_CHART, chartOf()] });
    const paths = linesOf(exported.markup, '<path');

    expect(paths.at(-1)).toMatch(/^<path d="M248\.0 [\d.]+.* M1856\.0 [\d.]+"/);
  });
});
