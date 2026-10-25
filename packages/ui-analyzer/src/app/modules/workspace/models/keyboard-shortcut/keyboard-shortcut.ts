import type { ValueOf } from '../../../../shared/types/value-of';
import { INSIGHT_STATUSES, type InsightStatus } from '../../../../stores/insights/models/insights-run/insights-run';
import { LOG_PANELS, type LogPanel } from '../../../../stores/logs/models/log-state/log-state';

const TYPING_TAGS: ReadonlySet<string> = new Set(['input', 'textarea', 'select']);
const ACTIVATION_TAGS: ReadonlySet<string> = new Set(['button', 'a', 'summary']);
const ACTIVATION_ROLES: ReadonlySet<string> = new Set(['button', 'link', 'menuitem', 'tab', 'option']);
const ARROW_OWNING_ROLES: ReadonlySet<string> = new Set(['slider', 'separator']);
const ARROW_KEY_PREFIX = 'Arrow';
const ROLE_ATTRIBUTE = 'role';

const SHORTCUT_KEYS = {
  INSIGHTS: 'i',
  INSIGHTS_UPPER: 'I',
  OVERLAYS: 'h',
  OVERLAYS_UPPER: 'H',
  NEXT: 'ArrowDown',
  PREVIOUS: 'ArrowUp',
  EXPAND: 'Enter',
  SHOW: ' ',
  ESCAPE: 'Escape',
  UNDO: 'z',
  UNDO_UPPER: 'Z',
  REDO: 'y',
  REDO_UPPER: 'Y',
  FIND: 'f',
  FIND_UPPER: 'F',
  NEXT_MATCH: 'F3',
  PREVIOUS_ENTRY: 'ArrowLeft',
  NEXT_ENTRY: 'ArrowRight',
} as const;

export const SHORTCUT_ACTIONS = {
  RUN_INSIGHTS: 'run-insights',
  TOGGLE_PANEL: 'toggle-panel',
  TOGGLE_OVERLAYS: 'toggle-overlays',
  FOCUS_NEXT: 'focus-next',
  FOCUS_PREVIOUS: 'focus-previous',
  TOGGLE_FOCUSED: 'toggle-focused',
  SHOW_FOCUSED: 'show-focused',
  COLLAPSE_FOCUSED: 'collapse-focused',
  CLOSE_PANEL: 'close-panel',
  CANCEL_RUN: 'cancel-run',
  CLOSE_TIMEFRAME: 'close-timeframe',
  CLOSE_TITLE_MENU: 'close-title-menu',
  CLOSE_SETTINGS_MENU: 'close-settings-menu',
  CLOSE_CONTEXT_MENU: 'close-context-menu',
  CLOSE_EXPORT_MENU: 'close-export-menu',
  CLOSE_SERIES_MENU: 'close-series-menu',
  UNDO_CANVAS: 'undo-canvas',
  REDO_CANVAS: 'redo-canvas',
  OPEN_LOG_SEARCH: 'open-log-search',
  NEXT_LOG_MATCH: 'next-log-match',
  PREVIOUS_LOG_MATCH: 'previous-log-match',
  NEXT_LOG_ENTRY: 'next-log-entry',
  PREVIOUS_LOG_ENTRY: 'previous-log-entry',
  CLOSE_LOG_SEARCH: 'close-log-search',
  CLOSE_LOG_DETAIL: 'close-log-detail',
  CLOSE_LOG_PICKER: 'close-log-picker',
  CLOSE_LOG_SETUP: 'close-log-setup',
  CANCEL_DRAG: 'cancel-drag',
  NONE: 'none',
} as const;

type ShortcutAction = ValueOf<typeof SHORTCUT_ACTIONS>;

export type PerformedShortcut = Exclude<ShortcutAction, typeof SHORTCUT_ACTIONS.NONE>;

export type ShortcutState = {
  readonly status: InsightStatus;
  readonly isPanelOpen: boolean;
  readonly hasFindings: boolean;
  readonly isFocusedExpanded: boolean;
  readonly isTimeframeOpen: boolean;
  readonly isContextMenuOpen: boolean;
  readonly isExportMenuOpen: boolean;
  readonly isSeriesMenuOpen: boolean;
  readonly isTitleMenuOpen: boolean;
  readonly isSettingsMenuOpen: boolean;
  readonly logPanel: LogPanel | null;
  readonly isLogSearchOpen: boolean;
  readonly isLogPickerOpen: boolean;
  readonly isDragUnderWay: boolean;
};

export type ShortcutKey = {
  readonly key: string;
  readonly hasModifier: boolean;
  readonly isCommand: boolean;
  readonly isShifted: boolean;
  readonly target: EventTarget | null;
};

export const shortcutKeyOf = (event: KeyboardEvent): ShortcutKey => ({
  key: event.key,
  hasModifier: event.ctrlKey || event.metaKey || event.altKey,
  isCommand: event.ctrlKey || event.metaKey,
  isShifted: event.shiftKey,
  target: event.target,
});

export const isTypingTarget = (target: EventTarget | null): boolean => target instanceof HTMLElement && TYPING_TAGS.has(target.tagName.toLowerCase());

const isActivationTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (ACTIVATION_TAGS.has(target.tagName.toLowerCase()) || ACTIVATION_ROLES.has(target.getAttribute(ROLE_ATTRIBUTE) ?? '') || target.isContentEditable);

const ownsArrowKeys = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ARROW_OWNING_ROLES.has(target.getAttribute(ROLE_ATTRIBUTE) ?? '');

const isActivationKey = (key: string): boolean => key === SHORTCUT_KEYS.EXPAND || key === SHORTCUT_KEYS.SHOW;

const logEscapeActionOf = (state: ShortcutState): ShortcutAction | null => {
  if (state.logPanel === LOG_PANELS.DETAIL) {
    return state.isLogSearchOpen ? SHORTCUT_ACTIONS.CLOSE_LOG_SEARCH : SHORTCUT_ACTIONS.CLOSE_LOG_DETAIL;
  }

  if (state.logPanel === LOG_PANELS.SETUP) {
    return state.isLogPickerOpen ? SHORTCUT_ACTIONS.CLOSE_LOG_PICKER : SHORTCUT_ACTIONS.CLOSE_LOG_SETUP;
  }

  return null;
};

const logDetailKeyAction = (pressed: ShortcutKey): ShortcutAction | null => {
  switch (pressed.key) {
    case SHORTCUT_KEYS.NEXT_MATCH:
      return pressed.isShifted ? SHORTCUT_ACTIONS.PREVIOUS_LOG_MATCH : SHORTCUT_ACTIONS.NEXT_LOG_MATCH;
    case SHORTCUT_KEYS.PREVIOUS_ENTRY:
      return SHORTCUT_ACTIONS.PREVIOUS_LOG_ENTRY;
    case SHORTCUT_KEYS.NEXT_ENTRY:
      return SHORTCUT_ACTIONS.NEXT_LOG_ENTRY;
    default:
      return null;
  }
};

const isFindKey = (key: string): boolean => key === SHORTCUT_KEYS.FIND || key === SHORTCUT_KEYS.FIND_UPPER;

const escapeActionOf = (state: ShortcutState): ShortcutAction => {
  if (state.isDragUnderWay) {
    return SHORTCUT_ACTIONS.CANCEL_DRAG;
  }

  if (state.isTitleMenuOpen) {
    return SHORTCUT_ACTIONS.CLOSE_TITLE_MENU;
  }

  if (state.isSettingsMenuOpen) {
    return SHORTCUT_ACTIONS.CLOSE_SETTINGS_MENU;
  }

  if (state.isContextMenuOpen) {
    return SHORTCUT_ACTIONS.CLOSE_CONTEXT_MENU;
  }

  if (state.isExportMenuOpen) {
    return SHORTCUT_ACTIONS.CLOSE_EXPORT_MENU;
  }

  if (state.isSeriesMenuOpen) {
    return SHORTCUT_ACTIONS.CLOSE_SERIES_MENU;
  }

  if (state.isTimeframeOpen) {
    return SHORTCUT_ACTIONS.CLOSE_TIMEFRAME;
  }

  const logEscape = logEscapeActionOf(state);

  if (logEscape !== null) {
    return logEscape;
  }

  if (state.status === INSIGHT_STATUSES.RUNNING) {
    return SHORTCUT_ACTIONS.CANCEL_RUN;
  }

  if (!state.isPanelOpen) {
    return SHORTCUT_ACTIONS.NONE;
  }

  return state.hasFindings && state.isFocusedExpanded ? SHORTCUT_ACTIONS.COLLAPSE_FOCUSED : SHORTCUT_ACTIONS.CLOSE_PANEL;
};

const insightsKeyAction = (status: InsightStatus): ShortcutAction => {
  if (status === INSIGHT_STATUSES.DONE) {
    return SHORTCUT_ACTIONS.TOGGLE_PANEL;
  }

  return status === INSIGHT_STATUSES.IDLE ? SHORTCUT_ACTIONS.RUN_INSIGHTS : SHORTCUT_ACTIONS.NONE;
};

const panelKeyAction = (key: string): ShortcutAction | null => {
  switch (key) {
    case SHORTCUT_KEYS.NEXT:
      return SHORTCUT_ACTIONS.FOCUS_NEXT;
    case SHORTCUT_KEYS.PREVIOUS:
      return SHORTCUT_ACTIONS.FOCUS_PREVIOUS;
    case SHORTCUT_KEYS.EXPAND:
      return SHORTCUT_ACTIONS.TOGGLE_FOCUSED;
    case SHORTCUT_KEYS.SHOW:
      return SHORTCUT_ACTIONS.SHOW_FOCUSED;
    default:
      return null;
  }
};

const commandActionOf = (pressed: ShortcutKey): ShortcutAction => {
  const { key } = pressed;

  if (key === SHORTCUT_KEYS.UNDO || key === SHORTCUT_KEYS.UNDO_UPPER) {
    return pressed.isShifted ? SHORTCUT_ACTIONS.REDO_CANVAS : SHORTCUT_ACTIONS.UNDO_CANVAS;
  }

  return key === SHORTCUT_KEYS.REDO || key === SHORTCUT_KEYS.REDO_UPPER ? SHORTCUT_ACTIONS.REDO_CANVAS : SHORTCUT_ACTIONS.NONE;
};

export const shortcutActionOf = (pressed: ShortcutKey, state: ShortcutState): ShortcutAction => {
  const { key } = pressed;

  if (pressed.isCommand && isFindKey(key) && state.logPanel === LOG_PANELS.DETAIL) {
    return SHORTCUT_ACTIONS.OPEN_LOG_SEARCH;
  }

  if (isTypingTarget(pressed.target)) {
    return SHORTCUT_ACTIONS.NONE;
  }

  if (pressed.isCommand) {
    return commandActionOf(pressed);
  }

  if (pressed.hasModifier || (isActivationKey(key) && isActivationTarget(pressed.target))) {
    return SHORTCUT_ACTIONS.NONE;
  }

  if (key.startsWith(ARROW_KEY_PREFIX) && ownsArrowKeys(pressed.target)) {
    return SHORTCUT_ACTIONS.NONE;
  }

  if (key === SHORTCUT_KEYS.ESCAPE) {
    return escapeActionOf(state);
  }

  const logDetailAction = state.logPanel === LOG_PANELS.DETAIL ? logDetailKeyAction(pressed) : null;

  if (logDetailAction !== null) {
    return logDetailAction;
  }

  if (key === SHORTCUT_KEYS.INSIGHTS || key === SHORTCUT_KEYS.INSIGHTS_UPPER) {
    return insightsKeyAction(state.status);
  }

  if (key === SHORTCUT_KEYS.OVERLAYS || key === SHORTCUT_KEYS.OVERLAYS_UPPER) {
    return state.status === INSIGHT_STATUSES.DONE && state.hasFindings ? SHORTCUT_ACTIONS.TOGGLE_OVERLAYS : SHORTCUT_ACTIONS.NONE;
  }

  return (state.isPanelOpen && state.hasFindings ? panelKeyAction(key) : null) ?? SHORTCUT_ACTIONS.NONE;
};
