const PLACEHOLDER_PATTERN = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

export type MessageValues = Readonly<Record<string, string | number>>;

export const formatMessage = (template: string, values: MessageValues = {}): string =>
  template.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
    const value = values[name];

    return value === undefined ? placeholder : `${value}`;
  });
