import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuToggleDirective } from './menu-toggle.directive';

const PLACEMENT = { top: 40, bottom: null, right: 12 };

describe('MenuToggleDirective', () => {
  let menu: MenuToggleDirective;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MenuToggleDirective] });
    menu = TestBed.inject(MenuToggleDirective);
  });

  it('opens the menu where it is told to, measuring only when it opens, and closes it on the next toggle', () => {
    const placeMenu = vi.fn(() => PLACEMENT);

    expect(menu.isOpen()).toBe(false);

    menu.toggle(placeMenu);

    expect(menu.placement()).toBe(PLACEMENT);
    expect(menu.isOpen()).toBe(true);

    menu.toggle(placeMenu);

    expect(menu.placement()).toBeNull();
    expect(placeMenu).toHaveBeenCalledTimes(1);
  });

  it('closes an open menu when asked, and stays closed when there is none', () => {
    menu.toggle(() => PLACEMENT);
    menu.close();
    menu.close();

    expect(menu.isOpen()).toBe(false);
  });
});
