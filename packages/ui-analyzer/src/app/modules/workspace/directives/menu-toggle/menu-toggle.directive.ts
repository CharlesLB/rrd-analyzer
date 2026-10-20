import { computed, Directive, signal } from '@angular/core';
import type { PopoverPlacement } from '../../../../shared/utils/anchored-popover/anchored-popover.util';

@Directive({ selector: '[appMenuToggle]' })
export class MenuToggleDirective {
  private readonly _placementState = signal<PopoverPlacement | null>(null);

  public readonly placement = this._placementState.asReadonly();
  public readonly isOpen = computed(() => this._placementState() !== null);

  public toggle(placeMenu: () => PopoverPlacement): void {
    this._placementState.update((placement) => (placement === null ? placeMenu() : null));
  }

  public close(): void {
    this._placementState.set(null);
  }
}
