import { describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../constants/colors';
import { emptyElement, escapeXml, SVG_TAGS, spannedTextElement, styleDefinitionsOf, svgDocumentOf, textElement } from './svg-markup.util';

describe('svg markup', () => {
  it('escapeXml turns the characters markup gives meaning to into entities', () => {
    expect(escapeXml('a < b & "c" > d')).toBe('a &lt; b &amp; &quot;c&quot; &gt; d');
  });

  it('emptyElement writes the attributes in the order given, escaping their values', () => {
    expect(emptyElement(SVG_TAGS.RECT, { x: 1, fill: '"red"' })).toBe('<rect x="1" fill="&quot;red&quot;"/>');
  });

  it('textElement escapes its text, and spannedTextElement gives every span its own fill', () => {
    expect(textElement({ x: 2 }, 'cpu <user>')).toBe('<text x="2">cpu &lt;user&gt;</text>');
    expect(
      spannedTextElement({ x: 2 }, [
        { text: '1', fill: SERIES_COLORS[0] },
        { text: '2', fill: SERIES_COLORS[1] },
      ]),
    ).toBe(`<text x="2"><tspan fill="${SERIES_COLORS[0]}">1</tspan><tspan fill="${SERIES_COLORS[1]}">2</tspan></text>`);
  });

  it('svgDocumentOf opens a namespaced root, puts every element on a line of its own and closes it', () => {
    expect(svgDocumentOf({ width: 10 }, [styleDefinitionsOf('a{}'), emptyElement(SVG_TAGS.CIRCLE, { r: 1 })])).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10">\n<defs><style>a{}</style></defs>\n<circle r="1"/>\n</svg>',
    );
  });
});
