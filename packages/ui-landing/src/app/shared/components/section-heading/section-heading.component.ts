import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const NO_INTRODUCTION = '';

@Component({
  selector: 'app-section-heading',
  templateUrl: './section-heading.component.html',
  styleUrl: './section-heading.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionHeadingComponent {
  public readonly eyebrow = input.required<string>();
  public readonly title = input.required<string>();
  public readonly introduction = input(NO_INTRODUCTION);
}
