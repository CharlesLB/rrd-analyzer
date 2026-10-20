import * as R from 'remeda';

const COORDINATE_DECIMALS = 1;
const NOT_FOUND = -1;

export const SVG_COMMANDS = {
  MOVE: 'M',
  LINE: 'L',
  CLOSE: 'Z',
} as const;

export type PlotPoint = {
  readonly x: number;
  readonly y: number;
};

export type PresentRun = {
  readonly from: number;
  readonly until: number;
};

export const coordinateOf = (value: number): string => value.toFixed(COORDINATE_DECIMALS);

export const evenlySpacedPositionOf = (index: number, count: number, width: number): number => (width * index) / Math.max(1, count - 1);

const isPenLiftedBefore = (values: readonly (number | null)[], index: number): boolean => index === 0 || values[index - 1] === null;

export const gappedPolylineOf = (values: readonly (number | null)[], pointAt: (value: number, index: number) => PlotPoint): string =>
  R.pipe(
    values,
    R.map((value, index) => {
      if (value === null) {
        return null;
      }

      const point = pointAt(value, index);
      const command = isPenLiftedBefore(values, index) ? SVG_COMMANDS.MOVE : SVG_COMMANDS.LINE;

      return `${command}${coordinateOf(point.x)} ${coordinateOf(point.y)}`;
    }),
    R.filter(R.isNonNullish),
    R.join(' '),
  );

const runEndingAfter = (values: readonly (number | null)[], from: number): PresentRun => {
  const nextHole = values.indexOf(null, from);

  return { from, until: (nextHole === NOT_FOUND ? values.length : nextHole) - 1 };
};

export const presentRunsOf = (values: readonly (number | null)[]): readonly PresentRun[] =>
  R.pipe(
    R.range(0, values.length),
    R.filter((index) => values[index] !== null && isPenLiftedBefore(values, index)),
    R.map((from) => runEndingAfter(values, from)),
  );

type PointAt = (value: number, index: number) => PlotPoint;

const areaUnderRun = (values: readonly (number | null)[], run: PresentRun, baseline: number, pointAt: PointAt): string => {
  const edge = R.pipe(
    values.slice(run.from, run.until + 1),
    R.filter(R.isNonNullish),
    R.map((value, offset) => pointAt(value, run.from + offset)),
  );

  const first = R.first(edge);
  const last = R.last(edge);

  if (first === undefined || last === undefined) {
    return '';
  }

  return [
    `${SVG_COMMANDS.MOVE}${coordinateOf(first.x)} ${baseline}`,
    ...R.map(edge, (point) => `${SVG_COMMANDS.LINE}${coordinateOf(point.x)} ${coordinateOf(point.y)}`),
    `${SVG_COMMANDS.LINE}${coordinateOf(last.x)} ${baseline}`,
    `${SVG_COMMANDS.LINE}${coordinateOf(first.x)} ${baseline} ${SVG_COMMANDS.CLOSE}`,
  ].join(' ');
};

export const areaUnderPolylineOf = (values: readonly (number | null)[], baseline: number, pointAt: PointAt): string =>
  R.pipe(
    presentRunsOf(values),
    R.map((run) => areaUnderRun(values, run, baseline, pointAt)),
    R.join(' '),
  );
