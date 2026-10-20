export const inputValueOf = (event: Event): string => (event.target as HTMLInputElement | HTMLSelectElement).value;
