import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { formatMessage, formatPlural } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { formatCount } from '../../../../shared/utils/count-format/count-format.util';
import { formatFileSize } from '../../../../shared/utils/file-size/file-size.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { LogField } from '../../../../stores/logs/models/log-field/log-field';
import { LOG_ROLE_ORDER, type LogMapping, type LogRole, UNMAPPED } from '../../../../stores/logs/models/log-mapping/log-mapping';
import { colorOfType, type TypeColors } from '../../../../stores/logs/models/log-severity/log-severity';
import type { LogFailure } from '../../../../stores/logs/models/log-source/log-source';
import { LOG_STATUSES, type LogFileSummary, type LogStatus } from '../../../../stores/logs/models/log-state/log-state';
import type { MappingValidation } from '../../../../stores/logs/models/log-validation/log-validation';
import { FocusScopeDirective } from '../../directives/focus-scope/focus-scope.directive';
import { fieldSampleOf } from '../../models/field-sample/field-sample';
import { LogColorRowComponent } from '../log-color-row/log-color-row.component';
import { type FieldOption, LogFieldRowComponent } from '../log-field-row/log-field-row.component';
import { LogFileSummaryComponent } from '../log-file-summary/log-file-summary.component';
import { LogSetupFailureComponent } from '../log-setup-failure/log-setup-failure.component';
import { SidePanelComponent } from '../side-panel/side-panel.component';

const PICKER_KINDS = {
  FIELD: 'field',
  COLOR: 'color',
} as const;

type PickerKind = ValueOf<typeof PICKER_KINDS>;

type OpenPicker = {
  readonly kind: PickerKind;
  readonly name: string;
};

export type FieldChoice = {
  readonly role: LogRole;
  readonly path: string;
};

export type ColorChoice = {
  readonly type: string;
  readonly color: string;
};

const PANEL_WIDTH = 344;

@Component({
  selector: 'app-log-setup-panel',
  imports: [FocusScopeDirective, LogColorRowComponent, LogFieldRowComponent, LogFileSummaryComponent, LogSetupFailureComponent, SidePanelComponent],
  templateUrl: './log-setup-panel.component.html',
  styleUrl: './log-setup-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogSetupPanelComponent {
  public readonly status = input.required<LogStatus>();
  public readonly file = input.required<LogFileSummary | null>();
  public readonly failure = input.required<LogFailure | null>();
  public readonly notes = input.required<readonly string[]>();
  public readonly fields = input.required<readonly LogField[]>();
  public readonly recordCount = input.required<number>();
  public readonly draftMapping = input.required<LogMapping>();
  public readonly detectedMapping = input.required<LogMapping>();
  public readonly validation = input.required<MappingValidation | null>();
  public readonly typeColors = input.required<TypeColors>();
  public readonly chosenColors = input.required<TypeColors>();
  public readonly isMappingChanged = input.required<boolean>();

  public readonly closeRequested = output<void>();
  public readonly fieldChosen = output<FieldChoice>();
  public readonly colorChosen = output<ColorChoice>();
  public readonly colorReset = output<string>();
  public readonly colorsReset = output<void>();
  public readonly confirmed = output<void>();
  public readonly filePicked = output<File>();
  public readonly removeRequested = output<void>();

  public readonly isPickerOpen = computed(() => this._openPickerState() !== null);

  private readonly _openPickerState = signal<OpenPicker | null>(null);

  protected readonly texts = inject(I18nStore).texts;
  protected readonly panelWidth = PANEL_WIDTH;
  protected readonly statuses = LOG_STATUSES;
  protected readonly fileName = computed(() => this.file()?.name ?? '');
  protected readonly isReady = computed(() => this.status() === LOG_STATUSES.READY);
  protected readonly hasChosenColors = computed(() => this.chosenColors().size > 0);
  protected readonly isBlocked = computed(() => this.validation()?.isValid !== true);

  protected readonly stepLabel = computed(() => {
    const setup = this.texts().logs.setup;

    const labels: Readonly<Record<LogStatus, string>> = {
      [LOG_STATUSES.NONE]: '',
      [LOG_STATUSES.LOADING]: setup.parsingStep,
      [LOG_STATUSES.FAILED]: setup.errorStep,
      [LOG_STATUSES.SETUP]: setup.fieldsStep,
      [LOG_STATUSES.READY]: setup.fieldsStep,
    };

    return labels[this.status()];
  });

  protected readonly fileMeta = computed(() => {
    const texts = this.texts();

    return formatMessage(texts.logs.setup.fileMeta, {
      size: formatFileSize(this.file()?.sizeBytes ?? 0, texts.units),
      entries: formatPlural(texts.logs.entryCount, this.recordCount(), { count: formatCount(this.recordCount()) }),
      fields: formatPlural(texts.logs.fieldCount, this.fields().length),
    });
  });

  protected readonly fieldOptions = computed<readonly FieldOption[]>(() =>
    R.map(this.fields(), (field) => ({ path: field.path, sample: fieldSampleOf(field.sample, this.texts().logs.setup.sampleItems) })),
  );

  protected readonly fieldRows = computed(() => {
    const validation = this.validation();
    const setup = this.texts().logs.setup;

    return validation === null
      ? []
      : R.map(LOG_ROLE_ORDER, (role) => {
          const path = this.draftMapping()[role];

          return {
            role,
            label: setup[role].label,
            hint: setup[role].hint,
            path,
            isDetected: path !== UNMAPPED && this.detectedMapping()[role] === path,
            isOpen: this._isOpen(PICKER_KINDS.FIELD, role),
            validation: validation.roles[role],
          };
        });
  });

  protected readonly colorRows = computed(() =>
    R.map(this.validation()?.types ?? [], (type) => ({
      name: type.name,
      count: formatCount(type.count),
      color: colorOfType(this.typeColors(), type.name),
      isOpen: this._isOpen(PICKER_KINDS.COLOR, type.name),
      canReset: this.chosenColors().has(type.name),
    })),
  );

  protected readonly confirmLabel = computed(() => {
    const setup = this.texts().logs.setup;

    if (!this.isReady()) {
      return setup.showLogs;
    }

    return this.isMappingChanged() ? setup.apply : setup.done;
  });

  protected readonly confirmHint = computed(() => {
    const setup = this.texts().logs.setup;

    if (this.isBlocked()) {
      return setup.invalidHint;
    }

    if (this.validation()?.hasWarning === true) {
      return setup.warningHint;
    }

    return this.isReady() && !this.isMappingChanged() ? setup.unchangedHint : setup.readyHint;
  });

  public closePicker(): void {
    this._openPickerState.set(null);
  }

  protected toggleFieldPicker(role: LogRole): void {
    this._toggle(PICKER_KINDS.FIELD, role);
  }

  protected toggleColorPicker(type: string): void {
    this._toggle(PICKER_KINDS.COLOR, type);
  }

  protected chooseField(role: LogRole, path: string): void {
    this.closePicker();
    this.fieldChosen.emit({ role, path });
  }

  private _isOpen(kind: PickerKind, name: string): boolean {
    const open = this._openPickerState();

    return open !== null && open.kind === kind && open.name === name;
  }

  private _toggle(kind: PickerKind, name: string): void {
    this._openPickerState.set(this._isOpen(kind, name) ? null : { kind, name });
  }
}
