import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BrandMarkComponent } from '../../../../shared/components/brand-mark/brand-mark.component';
import { TitleBarComponent } from '../../../../shared/components/layout/title-bar/title-bar.component';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-library-top-bar',
  imports: [BrandMarkComponent, ThemeToggleComponent, TitleBarComponent],
  templateUrl: './library-top-bar.component.html',
  styleUrl: './library-top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryTopBarComponent {
  protected readonly texts = inject(I18nStore).texts;
}
