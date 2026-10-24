import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import * as R from 'remeda';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';
import { type HsvColor, hexColorOf, hexOf, hsvOf, pureHueOf } from '../../utils/color-space/color-space.util';
import { inputValueOf } from '../../utils/input-value/input-value.util';
import { capturePointerOn } from '../../utils/pointer-fraction/pointer-fraction.util';

const DEGREES_PER_TURN = 360;
const HUE_STOP_DEGREES = 60;
const PERCENT = 100;
const SHADE_KEY_STEP = 0.05;
const HUE_KEY_STEP = 5;
const POINTER_DOWN = 'pointerdown';
const SHADE_OVERLAY = 'linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, transparent)';

const SHADE_KEY_MOVES: Readonly<Record<string, Readonly<{ saturation: number; value: number }>>> = {
  ArrowLeft: { saturation: -SHADE_KEY_STEP, value: 0 },
  ArrowRight: { saturation: SHADE_KEY_STEP, value: 0 },
  ArrowUp: { saturation: 0, value: SHADE_KEY_STEP },
  ArrowDown: { saturation: 0, value: -SHADE_KEY_STEP },
};

const HUE_KEY_MOVES: Readonly<Record<string, number>> = {
  ArrowLeft: -HUE_KEY_STEP,
  ArrowDown: -HUE_KEY_STEP,
  ArrowRight: HUE_KEY_STEP,
  ArrowUp: HUE_KEY_STEP,
};

const HUE_TRACK = `linear-gradient(to right, ${R.map(R.range(0, DEGREES_PER_TURN / HUE_STOP_DEGREES + 1), (stop) => pureHueOf((stop * HUE_STOP_DEGREES) % DEGREES_PER_TURN)).join(', ')})`;

const clampedFraction = (fraction: number): number => Math.min(1, Math.max(0, fraction));

type PointerPosition = {
  readonly x: number;
  readonly y: number;
};

const positionWithin = (area: HTMLElement, event: PointerEvent): PointerPosition => {
  const bounds = area.getBoundingClientRect();

  if (bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0 };
  }

  return { x: clampedFraction((event.clientX - bounds.left) / bounds.width), y: clampedFraction((event.clientY - bounds.top) / bounds.height) };
};

const isHeldOn = (area: HTMLElement, event: PointerEvent): boolean => event.type === POINTER_DOWN || area.hasPointerCapture(event.pointerId);

@Component({
  selector: 'app-color-mixer',
  templateUrl: './color-mixer.component.html',
  styleUrl: './color-mixer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorMixerComponent {
  public readonly color = input.required<string>();

  public readonly colorChosen = output<string>();
  public readonly cancelled = output<void>();

  private readonly _mixedState = linkedSignal<HsvColor>(() => hsvOf(this.color()));

  protected readonly texts = inject(I18nStore).texts;
  protected readonly hueTrack = HUE_TRACK;
  protected readonly picked = computed(() => hexOf(this._mixedState()));
  protected readonly shadeBackground = computed(() => `${SHADE_OVERLAY}, ${pureHueOf(this._mixedState().hue)}`);
  protected readonly shadeThumb = computed(() => ({
    left: `${this._mixedState().saturation * PERCENT}%`,
    top: `${(1 - this._mixedState().value) * PERCENT}%`,
  }));
  protected readonly hueThumbLeft = computed(() => `${(this._mixedState().hue / DEGREES_PER_TURN) * PERCENT}%`);
  protected readonly hueDegrees = computed(() => Math.round(this._mixedState().hue));
  protected readonly pureHue = computed(() => pureHueOf(this._mixedState().hue));

  protected grabShade(event: PointerEvent, area: HTMLElement): void {
    capturePointerOn(area, event);
    this.dragShade(event, area);
  }

  protected dragShade(event: PointerEvent, area: HTMLElement): void {
    if (!isHeldOn(area, event)) {
      return;
    }

    const { x, y } = positionWithin(area, event);

    this._mixedState.update((mixed) => ({ ...mixed, saturation: x, value: 1 - y }));
  }

  protected grabHue(event: PointerEvent, area: HTMLElement): void {
    capturePointerOn(area, event);
    this.dragHue(event, area);
  }

  protected dragHue(event: PointerEvent, area: HTMLElement): void {
    if (!isHeldOn(area, event)) {
      return;
    }

    const { x } = positionWithin(area, event);

    this._mixedState.update((mixed) => ({ ...mixed, hue: Math.min(x * DEGREES_PER_TURN, DEGREES_PER_TURN - 1) }));
  }

  protected nudgeShade(event: KeyboardEvent): void {
    const move = SHADE_KEY_MOVES[event.key];

    if (move === undefined) {
      return;
    }

    event.preventDefault();
    this._mixedState.update((mixed) => ({
      ...mixed,
      saturation: clampedFraction(mixed.saturation + move.saturation),
      value: clampedFraction(mixed.value + move.value),
    }));
  }

  protected nudgeHue(event: KeyboardEvent): void {
    const move = HUE_KEY_MOVES[event.key];

    if (move === undefined) {
      return;
    }

    event.preventDefault();
    this._mixedState.update((mixed) => ({ ...mixed, hue: (mixed.hue + move + DEGREES_PER_TURN) % DEGREES_PER_TURN }));
  }

  protected typeHex(event: Event): void {
    const typed = hexColorOf(inputValueOf(event));

    if (typed !== null) {
      this._mixedState.set(hsvOf(typed));
    }
  }

  protected apply(): void {
    this.colorChosen.emit(this.picked());
  }
}
