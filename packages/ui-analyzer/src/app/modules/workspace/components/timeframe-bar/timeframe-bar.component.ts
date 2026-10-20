import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { BrandMarkComponent } from '../../../../shared/components/brand-mark/brand-mark.component';
import { TitleBarComponent } from '../../../../shared/components/layout/title-bar/title-bar.component';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-timeframe-bar',
  imports: [BrandMarkComponent, ThemeToggleComponent, TitleBarComponent],
  templateUrl: './timeframe-bar.component.html',
  styleUrl: './timeframe-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeframeBarComponent {
  public readonly backRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
}
