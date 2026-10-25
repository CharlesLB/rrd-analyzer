import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, Injector, inject, input, output, signal, viewChild } from '@angular/core';
import { FormField, FormRoot, form, submit } from '@angular/forms/signals';
import { formatPlural } from '@rrd-analyzer/shared';
import { AnchoredMenuComponent } from '../../../../shared/components/anchored-menu/anchored-menu.component';
import { MenuOptionComponent } from '../../../../shared/components/menu-option/menu-option.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { currentViewport, leftEdgeAnchorOf, placeUnderLeftEdge } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { MenuToggleDirective } from '../../directives/menu-toggle/menu-toggle.directive';
import { analysisNameDraftOf, analysisNameDraftSchema, renamedTo } from '../../models/analysis-name-draft/analysis-name-draft';

const MENU_WIDTH = 236;

@Component({
  selector: 'app-analysis-title',
  imports: [AnchoredMenuComponent, FormField, FormRoot, MenuOptionComponent],
  templateUrl: './analysis-title.component.html',
  styleUrl: './analysis-title.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [MenuToggleDirective],
})
export class AnalysisTitleComponent {
  public readonly name = input.required<string>();
  public readonly sourceFileCount = input.required<number>();
  public readonly isCompact = input.required<boolean>();

  public readonly renamed = output<string>();
  public readonly sourcesExportRequested = output<void>();
  public readonly sourcesAddRequested = output<void>();

  private readonly _menu = inject(MenuToggleDirective);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  public readonly isMenuOpen = this._menu.isOpen;

  private readonly _injector = inject(Injector);
  private readonly _nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');
  private readonly _draft = signal(analysisNameDraftOf(''));

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly menuWidth = MENU_WIDTH;
  protected readonly isEditing = signal(false);
  protected readonly menuPlacement = this._menu.placement;
  protected readonly sourcesDetail = computed(() => formatPlural(this.texts().analysisTitle.sourcesDetail, this.sourceFileCount()));

  protected readonly nameForm = form(this._draft, analysisNameDraftSchema, {
    submission: {
      action: async () => this._commit(),
      onInvalid: () => this.cancelEditing(),
    },
  });

  protected startEditing(): void {
    this.closeMenu();
    this._draft.set(analysisNameDraftOf(this.name()));
    this.isEditing.set(true);
    afterNextRender(() => this._nameField()?.nativeElement.select(), { injector: this._injector });
  }

  protected cancelEditing(): void {
    this.isEditing.set(false);
  }

  protected async finishEditing(): Promise<void> {
    if (this.isEditing()) {
      await submit(this.nameForm);
    }
  }

  protected toggleMenu(): void {
    this._menu.toggle(() => placeUnderLeftEdge(leftEdgeAnchorOf(this._host.nativeElement), currentViewport(), MENU_WIDTH));
  }

  public closeMenu(): void {
    this._menu.close();
  }

  protected exportSources(): void {
    this.closeMenu();
    this.sourcesExportRequested.emit();
  }

  protected addSources(): void {
    this.closeMenu();
    this.sourcesAddRequested.emit();
  }

  private _commit(): void {
    const name = renamedTo(this._draft(), this.name());

    this.isEditing.set(false);

    if (name !== null) {
      this.renamed.emit(name);
    }
  }
}
