import { describe, expect, it } from 'vitest';
import { isTypingTarget, type ShortcutKey, type ShortcutState, shortcutActionOf, shortcutKeyOf } from './keyboard-shortcut';

const state = (overrides: Partial<ShortcutState> = {}): ShortcutState => ({
  status: 'done',
  isPanelOpen: true,
  hasFindings: true,
  isFocusedExpanded: false,
  isTimeframeOpen: false,
  isContextMenuOpen: false,
  isExportMenuOpen: false,
  isSeriesMenuOpen: false,
  isTitleMenuOpen: false,
  isSettingsMenuOpen: false,
  logPanel: null,
  isLogSearchOpen: false,
  isLogPickerOpen: false,
  isDragUnderWay: false,
  ...overrides,
});

const pressed = (key: string, overrides: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key,
  hasModifier: false,
  isCommand: false,
  isShifted: false,
  target: document.body,
  ...overrides,
});

const withCommand = (key: string, overrides: Partial<ShortcutKey> = {}): ShortcutKey => pressed(key, { hasModifier: true, isCommand: true, ...overrides });

describe('shortcutActionOf', () => {
  it('Escape during a drag cancels the drag before it closes anything else', () => {
    expect(shortcutActionOf(pressed('Escape'), state({ isDragUnderWay: true, isTimeframeOpen: true, logPanel: 'detail' }))).toBe('cancel-drag');
  });

  it('leaves the arrow keys to a slider or a separator that has the focus, and still answers its other keys', () => {
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');

    expect(shortcutActionOf(pressed('ArrowLeft', { target: slider }), state({ logPanel: 'detail' }))).toBe('none');
    expect(shortcutActionOf(pressed('ArrowDown', { target: slider }), state())).toBe('none');
    expect(shortcutActionOf(pressed('i', { target: slider }), state())).toBe('toggle-panel');
  });

  it('runs insights from idle, toggles the panel once done, and ignores the key while running', () => {
    expect(shortcutActionOf(pressed('i'), state({ status: 'idle', isPanelOpen: false }))).toBe('run-insights');
    expect(shortcutActionOf(pressed('I'), state())).toBe('toggle-panel');
    expect(shortcutActionOf(pressed('i'), state({ status: 'running' }))).toBe('none');
  });

  it('shortcutActionOf h once a run has found something toggles the findings on the charts, panel open or not', () => {
    expect(shortcutActionOf(pressed('h'), state())).toBe('toggle-overlays');
    expect(shortcutActionOf(pressed('H'), state({ isPanelOpen: false }))).toBe('toggle-overlays');
    expect(shortcutActionOf(pressed('h'), state({ hasFindings: false }))).toBe('none');
    expect(shortcutActionOf(pressed('h'), state({ status: 'running' }))).toBe('none');
  });

  it('moves, expands and shows the focused finding while the panel lists findings', () => {
    expect(shortcutActionOf(pressed('ArrowDown'), state())).toBe('focus-next');
    expect(shortcutActionOf(pressed('ArrowUp'), state())).toBe('focus-previous');
    expect(shortcutActionOf(pressed('Enter'), state())).toBe('toggle-focused');
    expect(shortcutActionOf(pressed(' '), state())).toBe('show-focused');
    expect(shortcutActionOf(pressed('ArrowDown'), state({ isPanelOpen: false }))).toBe('none');
  });

  it('shortcutActionOf Enter or Space on a focused button, link or menu item leaves the key to it', () => {
    const button = document.createElement('button');
    const link = document.createElement('a');
    const menuItem = document.createElement('div');
    menuItem.setAttribute('role', 'menuitem');

    expect(shortcutActionOf(pressed('Enter', { target: button }), state())).toBe('none');
    expect(shortcutActionOf(pressed(' ', { target: link }), state())).toBe('none');
    expect(shortcutActionOf(pressed('Enter', { target: menuItem }), state())).toBe('none');
    expect(shortcutActionOf(pressed('ArrowDown', { target: button }), state())).toBe('focus-next');
  });

  it('shortcutActionOf a key held with Ctrl, Cmd or Alt is left to the browser and the system', () => {
    expect(shortcutActionOf(pressed('h', { hasModifier: true }), state())).toBe('none');
    expect(shortcutActionOf(pressed('i', { hasModifier: true }), state({ status: 'idle' }))).toBe('none');
  });

  it('shortcutActionOf any key typed into a field is left to the field, Escape included', () => {
    const field = document.createElement('input');

    expect(shortcutActionOf(pressed('i', { target: field }), state({ status: 'idle' }))).toBe('none');
    expect(shortcutActionOf(pressed('Escape', { target: field }), state({ isTimeframeOpen: true }))).toBe('none');
  });

  it('shortcutActionOf Escape closes the topmost layer first: menus, then the timeframe popover, then the focused finding, then the panel', () => {
    expect(shortcutActionOf(pressed('Escape'), state({ isTitleMenuOpen: true, isFocusedExpanded: true }))).toBe('close-title-menu');
    expect(shortcutActionOf(pressed('Escape'), state({ isSettingsMenuOpen: true, isContextMenuOpen: true }))).toBe('close-settings-menu');
    expect(shortcutActionOf(pressed('Escape'), state({ isContextMenuOpen: true, isTimeframeOpen: true }))).toBe('close-context-menu');
    expect(shortcutActionOf(pressed('Escape'), state({ isExportMenuOpen: true, isFocusedExpanded: true }))).toBe('close-export-menu');
    expect(shortcutActionOf(pressed('Escape'), state({ isSeriesMenuOpen: true, isFocusedExpanded: true }))).toBe('close-series-menu');
    expect(shortcutActionOf(pressed('Escape'), state({ isTimeframeOpen: true, isFocusedExpanded: true }))).toBe('close-timeframe');
    expect(shortcutActionOf(pressed('Escape'), state({ isFocusedExpanded: true }))).toBe('collapse-focused');
    expect(shortcutActionOf(pressed('Escape'), state())).toBe('close-panel');
  });

  it('shortcutActionOf Escape cancels a run under way once no menu or popover sits above it', () => {
    expect(shortcutActionOf(pressed('Escape'), state({ status: 'running', isPanelOpen: false }))).toBe('cancel-run');
    expect(shortcutActionOf(pressed('Escape'), state({ status: 'running', isTimeframeOpen: true }))).toBe('close-timeframe');
  });

  it('shortcutActionOf Escape closes a panel that found nothing, and does nothing with no layer open', () => {
    expect(shortcutActionOf(pressed('Escape'), state({ hasFindings: false }))).toBe('close-panel');
    expect(shortcutActionOf(pressed('Escape'), state({ isPanelOpen: false }))).toBe('none');
  });
});

describe('isTypingTarget', () => {
  it('recognises fields the reader is typing into', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('shortcutActionOf Ctrl or Cmd with Z undoes the last canvas change, and with Shift as well redoes it, as does Ctrl or Cmd with Y', () => {
    expect(shortcutActionOf(withCommand('z'), state())).toBe('undo-canvas');
    expect(shortcutActionOf(withCommand('Z', { isShifted: true }), state())).toBe('redo-canvas');
    expect(shortcutActionOf(withCommand('y'), state())).toBe('redo-canvas');
  });

  it('shortcutActionOf leaves Ctrl or Cmd with Z to a text field, which undoes its own typing, and ignores Z alone', () => {
    const field = document.createElement('input');

    expect(shortcutActionOf(withCommand('z', { target: field }), state())).toBe('none');
    expect(shortcutActionOf(pressed('z'), state())).toBe('none');
    expect(shortcutActionOf(withCommand('i'), state({ status: 'idle' }))).toBe('none');
  });
});

describe('shortcutKeyOf', () => {
  it('shortcutKeyOf counts Ctrl, Cmd and Alt as modifiers but only Ctrl and Cmd as the command key', () => {
    expect(shortcutKeyOf(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }))).toEqual({
      key: 'z',
      hasModifier: true,
      isCommand: true,
      isShifted: true,
      target: null,
    });
    expect(shortcutKeyOf(new KeyboardEvent('keydown', { key: 'i', altKey: true }))).toMatchObject({ hasModifier: true, isCommand: false, isShifted: false });
    expect(shortcutKeyOf(new KeyboardEvent('keydown', { key: 'y', metaKey: true }))).toMatchObject({ hasModifier: true, isCommand: true });
  });

  it('shortcutActionOf, with a log entry open, finds in its JSON on command F even while typing in the search field', () => {
    const field = document.createElement('input');

    expect(shortcutActionOf(withCommand('f'), state({ logPanel: 'detail' }))).toBe('open-log-search');
    expect(shortcutActionOf(withCommand('F', { target: field }), state({ logPanel: 'detail' }))).toBe('open-log-search');
    expect(shortcutActionOf(withCommand('f'), state({ logPanel: 'setup' }))).toBe('none');
    expect(shortcutActionOf(withCommand('f'), state())).toBe('none');
  });

  it('shortcutActionOf, with a log entry open, steps matches on F3 and entries on the left and right arrows', () => {
    const detail = state({ logPanel: 'detail', isPanelOpen: false });

    expect(shortcutActionOf(pressed('F3'), detail)).toBe('next-log-match');
    expect(shortcutActionOf(pressed('F3', { isShifted: true }), detail)).toBe('previous-log-match');
    expect(shortcutActionOf(pressed('ArrowLeft'), detail)).toBe('previous-log-entry');
    expect(shortcutActionOf(pressed('ArrowRight'), detail)).toBe('next-log-entry');
    expect(shortcutActionOf(pressed('ArrowRight'), state({ isPanelOpen: false }))).toBe('none');
  });

  it('shortcutActionOf, with a log entry open, leaves the keys the entry does not use to the rest of the workspace', () => {
    const detail = state({ logPanel: 'detail' });

    expect(shortcutActionOf(pressed('i'), detail)).toBe('toggle-panel');
    expect(shortcutActionOf(pressed('ArrowDown'), detail)).toBe('focus-next');
  });

  it('shortcutActionOf escape, with a log entry open, closes the search first and the panel next', () => {
    expect(shortcutActionOf(pressed('Escape'), state({ logPanel: 'detail', isLogSearchOpen: true, isPanelOpen: false }))).toBe('close-log-search');
    expect(shortcutActionOf(pressed('Escape'), state({ logPanel: 'detail', isPanelOpen: false }))).toBe('close-log-detail');
  });

  it('shortcutActionOf escape, with the logs setup open, closes an open picker first and the setup next', () => {
    expect(shortcutActionOf(pressed('Escape'), state({ logPanel: 'setup', isLogPickerOpen: true, isPanelOpen: false }))).toBe('close-log-picker');
    expect(shortcutActionOf(pressed('Escape'), state({ logPanel: 'setup', isPanelOpen: false }))).toBe('close-log-setup');
  });

  it('shortcutActionOf escape, with a menu open over a log panel, closes the menu before the panel', () => {
    expect(shortcutActionOf(pressed('Escape'), state({ logPanel: 'detail', isExportMenuOpen: true }))).toBe('close-export-menu');
    expect(shortcutActionOf(pressed('Escape'), state({ logPanel: 'detail', status: 'running' }))).toBe('close-log-detail');
  });
});
