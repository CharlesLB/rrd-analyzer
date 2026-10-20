import { computed, Service, signal } from '@angular/core';
import * as R from 'remeda';

const SETTINGS_STORAGE_KEY = 'rrd-analyzer.settings';

type Settings = {
  readonly thumbnailFill: boolean;
  readonly synchronizedCrosshair: boolean;
  readonly logLanes: boolean;
};

const DEFAULT_SETTINGS: Settings = { thumbnailFill: true, synchronizedCrosshair: true, logLanes: true };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

const settingsOf = (stored: unknown): Settings =>
  isRecord(stored) ? R.mapValues(DEFAULT_SETTINGS, (fallback, name) => (typeof stored[name] === 'boolean' ? stored[name] : fallback)) : DEFAULT_SETTINGS;

const readSettings = (): Settings => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);

    return stored === null ? DEFAULT_SETTINGS : settingsOf(JSON.parse(stored));
  } catch {
    return DEFAULT_SETTINGS;
  }
};

@Service()
export class SettingsStore {
  private readonly _settingsState = signal<Settings>(readSettings());

  public readonly thumbnailFill = computed(() => this._settingsState().thumbnailFill);
  public readonly synchronizedCrosshair = computed(() => this._settingsState().synchronizedCrosshair);
  public readonly logLanes = computed(() => this._settingsState().logLanes);

  public toggleThumbnailFill(): void {
    this._change({ thumbnailFill: !this.thumbnailFill() });
  }

  public toggleSynchronizedCrosshair(): void {
    this._change({ synchronizedCrosshair: !this.synchronizedCrosshair() });
  }

  public toggleLogLanes(): void {
    this._change({ logLanes: !this.logLanes() });
  }

  private _change(changed: Partial<Settings>): void {
    const settings = { ...this._settingsState(), ...changed };

    this._settingsState.set(settings);

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      return;
    }
  }
}
