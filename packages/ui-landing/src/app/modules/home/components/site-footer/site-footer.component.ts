import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { PROJECT_LINKS } from '../../../../core/config/landing.config';
import { BrandComponent } from '../../../../shared/components/brand/brand.component';
import { ExternalLinkComponent } from '../../../../shared/components/external-link/external-link.component';
import { ThemeIconComponent } from '../../../../shared/components/icons/theme-icon/theme-icon.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-site-footer',
  imports: [BrandComponent, ExternalLinkComponent, ThemeIconComponent],
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  public readonly themeToggled = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly links = PROJECT_LINKS;

  protected toggleTheme(): void {
    this.themeToggled.emit();
  }
}
