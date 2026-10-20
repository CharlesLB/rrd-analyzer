import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { ContextMenuPlacement, MergeTarget } from '../../../../stores/workspace/models/context-menu/context-menu';
import { FocusScopeDirective } from '../../directives/focus-scope/focus-scope.directive';

@Component({
  selector: 'app-context-menu',
  imports: [FocusScopeDirective],
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextMenuComponent {
  public readonly title = input.required<string>();
  public readonly placement = input.required<ContextMenuPlacement>();
  public readonly isOnCanvas = input.required<boolean>();
  public readonly isAtTopOfLibrary = input.required<boolean>();
  public readonly mergeTargets = input.required<readonly MergeTarget[]>();

  public readonly openRequested = output<void>();
  public readonly addRequested = output<void>();
  public readonly mergeRequested = output<string>();
  public readonly moveToTopRequested = output<void>();
  public readonly removeRequested = output<void>();
  public readonly closeRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;

  protected readonly mergeItems = computed(() =>
    this.mergeTargets().map((target) => ({ target, tip: formatMessage(this.texts().contextMenu.mergeWith, { name: target.label }) })),
  );

  protected closeFromContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.closeRequested.emit();
  }
}
