import * as R from 'remeda';
import type { Canvas, PlottedChart, PlottedSeries } from './plotted-chart';
import { chartOf } from './plotted-chart';

export const chartFixture = (...plotted: readonly PlottedSeries[]): PlottedChart => ({ plotted, referenceLines: [] });

export const canvasFixture = (...seriesIds: readonly string[]): Canvas => R.map(seriesIds, chartOf);
