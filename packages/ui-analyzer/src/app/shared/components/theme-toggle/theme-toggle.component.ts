import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';
import { ThemeStore } from '../../../stores/theme/store/theme-store/theme.store';
import { GLYPHS } from '../../constants/glyphs';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  private readonly _themes = inject(ThemeStore);

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyph = GLYPHS.THEME;

  protected toggleTheme(): void {
    this._themes.toggle();
  }
}
