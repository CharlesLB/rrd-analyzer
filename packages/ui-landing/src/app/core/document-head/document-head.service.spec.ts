import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocumentHeadService } from './document-head.service';

const CANONICAL_LINKS = 'link[rel="canonical"]';
const STRUCTURED_DATA_SCRIPTS = 'script[type="application/ld+json"]';

const headElementsOf = (selector: string): readonly Element[] => Array.from(TestBed.inject(DOCUMENT).head.querySelectorAll(selector));

describe('DocumentHeadService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    [...headElementsOf(CANONICAL_LINKS), ...headElementsOf(STRUCTURED_DATA_SCRIPTS)].forEach((element) => {
      element.remove();
    });
  });

  it('writeMetaTags, given named and Open Graph tags, writes each under its own attribute', () => {
    const documentHead = TestBed.inject(DocumentHeadService);

    documentHead.writeMetaTags([
      { name: 'description', content: 'A viewer for RRD files' },
      { property: 'og:title', content: 'RRD Analyzer' },
    ]);

    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="description"')?.content).toBe('A viewer for RRD files');
    expect(meta.getTag('property="og:title"')?.content).toBe('RRD Analyzer');
  });

  it('writeMetaTags, for a tag already in the head, replaces its content instead of adding a second one', () => {
    const documentHead = TestBed.inject(DocumentHeadService);

    documentHead.writeMetaTags([{ name: 'robots', content: 'noindex' }]);
    documentHead.writeMetaTags([{ name: 'robots', content: 'index, follow' }]);

    expect(
      TestBed.inject(Meta)
        .getTags('name="robots"')
        .map((tag) => tag.content),
    ).toEqual(['index, follow']);
  });

  it('linkCanonical, called again as the page hydrates, keeps one canonical link pointing at the last address', () => {
    const documentHead = TestBed.inject(DocumentHeadService);

    documentHead.linkCanonical('https://rrd-analyzer.example.com/old');
    documentHead.linkCanonical('https://rrd-analyzer.example.com/');

    expect(headElementsOf(CANONICAL_LINKS).map((link) => link.getAttribute('href'))).toEqual(['https://rrd-analyzer.example.com/']);
  });

  it('embedStructuredData, called again as the page hydrates, keeps one JSON-LD script holding the last data', () => {
    const documentHead = TestBed.inject(DocumentHeadService);

    documentHead.embedStructuredData({ '@type': 'WebSite', name: 'Old name' });
    documentHead.embedStructuredData({ '@type': 'WebSite', name: 'RRD Analyzer' });

    const scripts = headElementsOf(STRUCTURED_DATA_SCRIPTS);
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0]?.textContent ?? '')).toEqual({ '@type': 'WebSite', name: 'RRD Analyzer' });
  });

  it('embedStructuredData, given text that closes a script tag, escapes it so the script cannot end early', () => {
    const documentHead = TestBed.inject(DocumentHeadService);

    documentHead.embedStructuredData({ description: '</script><script>alert(1)</script>' });

    const [script] = headElementsOf(STRUCTURED_DATA_SCRIPTS);
    expect(script?.textContent).not.toContain('</script>');
    expect(JSON.parse(script?.textContent ?? '')).toEqual({ description: '</script><script>alert(1)</script>' });
  });
});
