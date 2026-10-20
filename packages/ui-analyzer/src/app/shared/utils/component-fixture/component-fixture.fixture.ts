import type { Type } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

export const renderWithInputs = <TComponent>(component: Type<TComponent>, inputs: Readonly<Record<string, unknown>>): ComponentFixture<TComponent> => {
  const fixture = TestBed.createComponent(component);

  Object.entries(inputs).forEach(([name, value]) => {
    fixture.componentRef.setInput(name, value);
  });
  fixture.detectChanges();

  return fixture;
};

export const hostOf = (fixture: ComponentFixture<unknown>): HTMLElement => {
  const host: HTMLElement = fixture.nativeElement;

  return host;
};

export const elementOf = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null => hostOf(fixture).querySelector<HTMLElement>(selector);

export const elementsOf = (fixture: ComponentFixture<unknown>, selector: string): readonly HTMLElement[] =>
  Array.from(hostOf(fixture).querySelectorAll<HTMLElement>(selector));

export const textOf = (fixture: ComponentFixture<unknown>, selector: string): string => elementOf(fixture, selector)?.textContent?.trim() ?? '';

export const countOf = (fixture: ComponentFixture<unknown>, selector: string): number => elementsOf(fixture, selector).length;

export const textsOf = (fixture: ComponentFixture<unknown>, selector: string): readonly string[] =>
  elementsOf(fixture, selector).map((element) => element.textContent?.trim() ?? '');

export const typeInto = (fixture: ComponentFixture<unknown>, selector: string, value: string): void => {
  const field = hostOf(fixture).querySelector<HTMLInputElement>(selector);

  if (field === null) {
    throw new Error(`no field matches ${selector}`);
  }

  field.value = value;
  field.dispatchEvent(new Event('input'));
};

export const cssColorOf = (color: string): string => {
  const probe = document.createElement('div');

  probe.style.background = color;

  return probe.style.background;
};
