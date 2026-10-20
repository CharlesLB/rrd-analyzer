import { describe, expect, it } from 'vitest';
import { rovedIndexOf, roveFocusWithin } from './roving-focus.util';

const pressed = (key: string): KeyboardEvent => new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

const listOfThree = (): HTMLElement => {
  const list = document.createElement('div');

  list.innerHTML = '<button class="stop">a</button><span>between</span><button class="stop">b</button><button class="stop">c</button>';
  document.body.appendChild(list);

  return list;
};

describe('rovedIndexOf', () => {
  it('rovedIndexOf steps to the next and the previous stop, going round at either end', () => {
    expect(rovedIndexOf('ArrowDown', 0, 3)).toBe(1);
    expect(rovedIndexOf('ArrowDown', 2, 3)).toBe(0);
    expect(rovedIndexOf('ArrowUp', 1, 3)).toBe(0);
    expect(rovedIndexOf('ArrowUp', 0, 3)).toBe(2);
  });

  it('rovedIndexOf jumps to the first and the last stop on Home and End', () => {
    expect(rovedIndexOf('Home', 2, 3)).toBe(0);
    expect(rovedIndexOf('End', 0, 3)).toBe(2);
  });

  it('rovedIndexOf from outside the stops enters at the first going down and at the last going up', () => {
    expect(rovedIndexOf('ArrowDown', -1, 3)).toBe(0);
    expect(rovedIndexOf('ArrowUp', -1, 3)).toBe(2);
  });

  it('rovedIndexOf goes nowhere for another key, or with no stop to go to', () => {
    expect(rovedIndexOf('Enter', 0, 3)).toBeNull();
    expect(rovedIndexOf('ArrowDown', -1, 0)).toBeNull();
  });
});

describe('roveFocusWithin', () => {
  it('roveFocusWithin moves the focus to the stop the key leads to and keeps the key from doing anything else', () => {
    const list = listOfThree();
    const stops = Array.from(list.querySelectorAll<HTMLElement>('.stop'));
    stops[0]?.focus();
    const down = pressed('ArrowDown');

    expect(roveFocusWithin(list, '.stop', down)).toBe(true);
    expect(document.activeElement).toBe(stops[1]);
    expect(down.defaultPrevented).toBe(true);

    roveFocusWithin(list, '.stop', pressed('End'));

    expect(document.activeElement).toBe(stops[2]);
    list.remove();
  });

  it('roveFocusWithin leaves any other key alone', () => {
    const list = listOfThree();
    const typed = pressed('a');

    expect(roveFocusWithin(list, '.stop', typed)).toBe(false);
    expect(typed.defaultPrevented).toBe(false);
    list.remove();
  });
});
