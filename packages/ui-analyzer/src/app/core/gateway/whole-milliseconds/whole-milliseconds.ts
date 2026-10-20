type MillisecondRange = {
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
};

export const wholeMillisecondsOf = <TRange extends MillisecondRange>(range: TRange): TRange => ({
  ...range,
  fromMilliseconds: Math.round(range.fromMilliseconds),
  untilMilliseconds: Math.round(range.untilMilliseconds),
});
