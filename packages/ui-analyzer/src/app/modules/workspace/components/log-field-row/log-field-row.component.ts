import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { type RoleValidation, VALIDATION_STATES } from '../../../../stores/logs/models/log-validation/log-validation';

export type FieldOption = {
  readonly path: string;
  readonly sample: string;
};

@Component({
  selector: 'app-log-field-row',
  templateUrl: './log-field-row.component.html',
  styleUrl: './log-field-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogFieldRowComponent {
  public readonly label = input.required<string>();
  public readonly hint = input.required<string>();
  public readonly path = input.required<string>();
  public readonly isDetected = input.required<boolean>();
  public readonly isOpen = input.required<boolean>();
  public readonly validation = input.required<RoleValidation>();
  public readonly options = input.required<readonly FieldOption[]>();

  public readonly toggled = output<void>();
  public readonly chosen = output<string>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly hasPath = computed(() => this.path() !== '');
  protected readonly isBlocked = computed(() => this.validation().state === VALIDATION_STATES.ERROR);
  protected readonly isWarned = computed(() => this.validation().state === VALIDATION_STATES.WARNING);
  protected readonly noteGlyph = computed(() => (this.validation().state === VALIDATION_STATES.OK ? GLYPHS.CHECK : GLYPHS.ATTENTION));
}
