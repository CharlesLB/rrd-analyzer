import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-library-strip',
  templateUrl: './library-strip.component.html',
  styleUrl: './library-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryStripComponent {}
