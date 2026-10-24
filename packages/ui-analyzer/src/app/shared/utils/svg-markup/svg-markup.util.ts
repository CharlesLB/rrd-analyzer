import * as R from 'remeda';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const LINE_BREAK = '\n';

export const SVG_TAGS = {
  ROOT: 'svg',
  DEFINITIONS: 'defs',
  STYLE: 'style',
  RECT: 'rect',
  CIRCLE: 'circle',
  LINE: 'line',
  PATH: 'path',
  TEXT: 'text',
  TEXT_SPAN: 'tspan',
} as const;

export const TEXT_ANCHORS = {
  START: 'start',
  MIDDLE: 'middle',
  END: 'end',
} as const;

type SvgAttributes = Readonly<Record<string, string | number>>;

export type TextSpan = {
  readonly text: string;
  readonly fill: string;
};

export const escapeXml = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const attributesOf = (attributes: SvgAttributes): string =>
  Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeXml(`${value}`)}"`)
    .join(' ');

export const emptyElement = (tag: string, attributes: SvgAttributes): string => `<${tag} ${attributesOf(attributes)}/>`;

export const textElement = (attributes: SvgAttributes, text: string): string =>
  `<${SVG_TAGS.TEXT} ${attributesOf(attributes)}>${escapeXml(text)}</${SVG_TAGS.TEXT}>`;

export const spannedTextElement = (attributes: SvgAttributes, spans: readonly TextSpan[]): string => {
  const content = R.map(spans, (span) => `<${SVG_TAGS.TEXT_SPAN} ${attributesOf({ fill: span.fill })}>${escapeXml(span.text)}</${SVG_TAGS.TEXT_SPAN}>`).join(
    '',
  );

  return `<${SVG_TAGS.TEXT} ${attributesOf(attributes)}>${content}</${SVG_TAGS.TEXT}>`;
};

export const styleDefinitionsOf = (css: string): string =>
  `<${SVG_TAGS.DEFINITIONS}><${SVG_TAGS.STYLE}>${escapeXml(css)}</${SVG_TAGS.STYLE}></${SVG_TAGS.DEFINITIONS}>`;

export const svgDocumentOf = (attributes: SvgAttributes, elements: readonly string[]): string =>
  [`<${SVG_TAGS.ROOT} ${attributesOf({ xmlns: SVG_NAMESPACE, ...attributes })}>`, ...elements, `</${SVG_TAGS.ROOT}>`].join(LINE_BREAK);
