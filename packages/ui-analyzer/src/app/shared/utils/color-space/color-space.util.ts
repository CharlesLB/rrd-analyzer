export type HsvColor = {
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HEX_DIGITS = /^#?([0-9a-f]{6})$/i;
const HEX_RADIX = 16;
const CHANNEL_MAXIMUM = 255;
const DEGREES_PER_TURN = 360;
const DEGREES_PER_SECTOR = 60;
const HEX_PREFIX = '#';
const CHANNEL_WIDTH = 2;
const PADDING_DIGIT = '0';
const RED_OFFSET = 0;
const GREEN_OFFSET = 2;
const BLUE_OFFSET = 4;
const RED_SECTOR_START = 5;
const GREEN_SECTOR_START = 3;
const BLUE_SECTOR_START = 1;
const SECTOR_COUNT = 6;
const GREEN_HUE_OFFSET = 2;
const BLUE_HUE_OFFSET = 4;
const SECTORS_BEFORE_FALL = 4;

export const isHexColor = (text: string): boolean => HEX_COLOR.test(text);

export const hexColorOf = (typed: string): string | null => {
  const digits = HEX_DIGITS.exec(typed.trim())?.[1];

  return digits === undefined ? null : `${HEX_PREFIX}${digits.toLowerCase()}`;
};

const channelOf = (hex: string, offset: number): number => Number.parseInt(hex.slice(1 + offset, 1 + offset + CHANNEL_WIDTH), HEX_RADIX) / CHANNEL_MAXIMUM;

const hueOf = (red: number, green: number, blue: number, highest: number, spread: number): number => {
  if (spread === 0) {
    return 0;
  }

  if (highest === red) {
    return (DEGREES_PER_SECTOR * ((green - blue) / spread) + DEGREES_PER_TURN) % DEGREES_PER_TURN;
  }

  return highest === green ? DEGREES_PER_SECTOR * ((blue - red) / spread + GREEN_HUE_OFFSET) : DEGREES_PER_SECTOR * ((red - green) / spread + BLUE_HUE_OFFSET);
};

export const hsvOf = (hex: string): HsvColor => {
  const [red, green, blue] = [channelOf(hex, RED_OFFSET), channelOf(hex, GREEN_OFFSET), channelOf(hex, BLUE_OFFSET)];
  const highest = Math.max(red, green, blue);
  const spread = highest - Math.min(red, green, blue);

  return { hue: hueOf(red, green, blue, highest, spread), saturation: highest === 0 ? 0 : spread / highest, value: highest };
};

const channelAt = (color: HsvColor, sectorStart: number): number => {
  const position = (sectorStart + color.hue / DEGREES_PER_SECTOR) % SECTOR_COUNT;

  return color.value - color.value * color.saturation * Math.max(0, Math.min(position, SECTORS_BEFORE_FALL - position, 1));
};

const hexDigitsOf = (channel: number): string =>
  Math.round(Math.min(1, Math.max(0, channel)) * CHANNEL_MAXIMUM)
    .toString(HEX_RADIX)
    .padStart(CHANNEL_WIDTH, PADDING_DIGIT);

export const hexOf = (color: HsvColor): string =>
  `${HEX_PREFIX}${hexDigitsOf(channelAt(color, RED_SECTOR_START))}${hexDigitsOf(channelAt(color, GREEN_SECTOR_START))}${hexDigitsOf(channelAt(color, BLUE_SECTOR_START))}`;

export const pureHueOf = (hue: number): string => hexOf({ hue, saturation: 1, value: 1 });
