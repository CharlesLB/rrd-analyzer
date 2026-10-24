import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { AnchoredMenuComponent } from '../../../../shared/components/anchored-menu/anchored-menu.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { currentViewport, placeUnderAnchor, popoverAnchorOf } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { MenuToggleDirective } from '../../directives/menu-toggle/menu-toggle.directive';

const MENU_SIZE = { width: 264, heightAllowance: 146 };

@Component({
  selector: 'app-view-settings',
  imports: [AnchoredMenuComponent],
  templateUrl: './view-settings.component.html',
  styleUrl: './view-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [MenuToggleDirective],
})
export class ViewSettingsComponent {
  public readonly thumbnailFill = input.required<boolean>();
  public readonly synchronizedCrosshair = input.required<boolean>();
  public readonly logLanes = input.required<boolean>();

  public readonly thumbnailFillToggled = output<void>();
  public readonly synchronizedCrosshairToggled = output<void>();
  public readonly logLanesToggled = output<void>();

  private readonly _menu = inject(MenuToggleDirective);

  public readonly isMenuOpen = this._menu.isOpen;

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly menuWidth = MENU_SIZE.width;
  protected readonly menuPlacement = this._menu.placement;

  protected toggleMenu(toggle: HTMLElement): void {
    this._menu.toggle(() => placeUnderAnchor(popoverAnchorOf(toggle), currentViewport(), MENU_SIZE));
  }

  public closeMenu(): void {
    this._menu.close();
  }
}
