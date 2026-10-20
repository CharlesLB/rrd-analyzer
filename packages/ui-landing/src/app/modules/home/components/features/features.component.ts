import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SectionHeadingComponent } from '../../../../shared/components/section-heading/section-heading.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { SECTION_IDS } from '../../models/page-sections/page-sections.model';
import { SCREENSHOTS } from '../../models/screenshots/screenshots.model';
import { FeatureRowComponent } from '../feature-row/feature-row.component';

const LOG_TYPE_COLORS = {
  fatal: 'var(--logFatal)',
  error: 'var(--logError)',
  warning: 'var(--logWarning)',
  info: 'var(--logInfo)',
  debug: 'var(--logDebug)',
} as const;

type LogType = keyof typeof LOG_TYPE_COLORS;

const LOG_TYPES: readonly LogType[] = ['fatal', 'error', 'warning', 'info', 'debug'];

@Component({
  selector: 'app-features',
  imports: [SectionHeadingComponent, FeatureRowComponent],
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturesComponent {
  protected readonly texts = inject(I18nStore).texts;
  protected readonly sectionId = SECTION_IDS.FEATURES;
  protected readonly screenshots = SCREENSHOTS;
  protected readonly bullet = GLYPHS.BULLET;
  protected readonly logTypes = computed(() =>
    LOG_TYPES.map((logType) => ({ name: logType, label: this.texts().features.logs.logTypes[logType], color: LOG_TYPE_COLORS[logType] })),
  );
}
