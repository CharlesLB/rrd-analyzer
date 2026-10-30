import { DOCUMENT, inject, Service } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import type { MetaTag, StructuredData } from './document-head.model';

const LINK_ELEMENT = 'link';
const SCRIPT_ELEMENT = 'script';
const RELATION_ATTRIBUTE = 'rel';
const ADDRESS_ATTRIBUTE = 'href';
const TYPE_ATTRIBUTE = 'type';
const CANONICAL_RELATION = 'canonical';
const STRUCTURED_DATA_TYPE = 'application/ld+json';
const CANONICAL_LINK_SELECTOR = `${LINK_ELEMENT}[${RELATION_ATTRIBUTE}="${CANONICAL_RELATION}"]`;
const STRUCTURED_DATA_SELECTOR = `${SCRIPT_ELEMENT}[${TYPE_ATTRIBUTE}="${STRUCTURED_DATA_TYPE}"]`;
const MARKUP_OPENING = /</g;
const ESCAPED_MARKUP_OPENING = '\\u003c';

@Service()
export class DocumentHeadService {
  private readonly _document = inject(DOCUMENT);
  private readonly _meta = inject(Meta);

  public writeMetaTags(tags: readonly MetaTag[]): void {
    tags.forEach((tag) => {
      this._meta.updateTag(tag);
    });
  }

  public linkCanonical(url: string): void {
    const link = this._document.head.querySelector(CANONICAL_LINK_SELECTOR) ?? this._appendedHeadElement(LINK_ELEMENT, RELATION_ATTRIBUTE, CANONICAL_RELATION);

    link.setAttribute(ADDRESS_ATTRIBUTE, url);
  }

  public embedStructuredData(data: StructuredData): void {
    const script =
      this._document.head.querySelector(STRUCTURED_DATA_SELECTOR) ?? this._appendedHeadElement(SCRIPT_ELEMENT, TYPE_ATTRIBUTE, STRUCTURED_DATA_TYPE);

    script.textContent = JSON.stringify(data).replace(MARKUP_OPENING, ESCAPED_MARKUP_OPENING);
  }

  private _appendedHeadElement(tagName: string, attribute: string, value: string): Element {
    const element = this._document.createElement(tagName);

    element.setAttribute(attribute, value);
    this._document.head.appendChild(element);

    return element;
  }
}
