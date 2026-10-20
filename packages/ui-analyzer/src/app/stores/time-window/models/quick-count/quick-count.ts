const WHOLE_NUMBER = /^\d+$/;
const DECIMAL_RADIX = 10;
const SMALLEST_QUICK_COUNT = 1;

export const quickCountOf = (text: string): number | null => {
  const typed = text.trim();
  const count = WHOLE_NUMBER.test(typed) ? Number.parseInt(typed, DECIMAL_RADIX) : null;

  return count !== null && count >= SMALLEST_QUICK_COUNT ? count : null;
};
