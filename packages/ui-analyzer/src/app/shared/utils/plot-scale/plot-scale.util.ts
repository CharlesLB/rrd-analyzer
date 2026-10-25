import * as R from 'remeda';

export type VerticalBand = {
  readonly top: number;
  readonly height: number;
};

type SampleExtent = {
  readonly lowest: number;
  readonly highest: number;
  readonly last: number;
};

export const sampleExtentOf = (samples: readonly (number | null)[]): SampleExtent | null => {
  const present = R.filter(samples, R.isNonNullish);
  const [first] = present;

  if (first === undefined) {
    return null;
  }

  return R.reduce(
    present,
    (extent: SampleExtent, sample) => ({ lowest: Math.min(extent.lowest, sample), highest: Math.max(extent.highest, sample), last: sample }),
    { lowest: first, highest: first, last: first },
  );
};

export type ValueRange = {
  readonly lowest: number;
  readonly highest: number;
};

const MIDDLE_OF_THE_BAND = 0.5;

const fractionOfRange = (value: number, range: ValueRange): number =>
  range.highest === range.lowest ? MIDDLE_OF_THE_BAND : (value - range.lowest) / (range.highest - range.lowest);

export const scaledY = (value: number, range: ValueRange, band: VerticalBand): number => band.top + (1 - fractionOfRange(value, range)) * band.height;

export const valueAtFraction = (range: ValueRange, fraction: number): number => range.lowest + (range.highest - range.lowest) * fraction;
