import { isPlatformBrowser } from '@angular/common';
import { computed, DOCUMENT, effect, inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { MEDIA_QUERIES } from '../../../../constants/media-queries';
import { useMediaQuery } from '../../../../utils/media-query/media-query.util';

const THEME_STORAGE_KEY = 'rrd-analyzer.theme';

const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
} as const;

type Theme = (typeof THEMES)[keyof typeof THEMES];

const FOLLOWS_THE_SYSTEM = null;

const readChosenTheme = (): Theme | typeof FOLLOWS_THE_SYSTEM => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    return stored === THEMES.DARK || stored === THEMES.LIGHT ? stored : FOLLOWS_THE_SYSTEM;
  } catch {
    return FOLLOWS_THE_SYSTEM;
  }
};

@Service()
export class ThemeStore {
  private readonly _isInBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _root = inject(DOCUMENT).documentElement;
  private readonly _isSystemDark = useMediaQuery(MEDIA_QUERIES.DARK_SYSTEM_THEME);
  private readonly _chosenThemeState = signal<Theme | typeof FOLLOWS_THE_SYSTEM>(this._isInBrowser ? readChosenTheme() : FOLLOWS_THE_SYSTEM);

  public readonly theme = computed<Theme>(() => this._chosenThemeState() ?? this._systemTheme());
  public readonly isDark = computed(() => this.theme() === THEMES.DARK);

  public constructor() {
    if (this._isInBrowser) {
      effect(() => this._wear(this.theme()));
    }
  }

  public toggle(): void {
    const chosen = this.isDark() ? THEMES.LIGHT : THEMES.DARK;

    this._chosenThemeState.set(chosen);
    this._persist(chosen);
  }

  private _wear(theme: Theme): void {
    this._root.classList.remove(...Object.values(THEMES));
    this._root.classList.add(theme);
  }

  private _systemTheme(): Theme {
    return this._isSystemDark() ? THEMES.DARK : THEMES.LIGHT;
  }

  private _persist(chosen: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, chosen);
    } catch {
      return;
    }
  }
}
