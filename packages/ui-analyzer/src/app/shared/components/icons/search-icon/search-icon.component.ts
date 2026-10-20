import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-search-icon',
  templateUrl: './search-icon.component.html',
  styleUrl: './search-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchIconComponent {}
