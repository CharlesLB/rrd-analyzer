import { Directive, DOCUMENT, inject, input, output } from '@angular/core';
import { pickFiles } from '../../utils/file-picker/file-picker.util';

@Directive({
  selector: '[appFilePick]',
  host: { '(click)': 'browse()' },
})
export class FilePickDirective {
  public readonly accept = input.required<string>({ alias: 'appFilePick' });

  public readonly filePicked = output<File>();

  private readonly _document = inject(DOCUMENT);

  protected async browse(): Promise<void> {
    const [file] = await pickFiles(this._document, { accept: this.accept(), allowsMany: false });

    if (file !== undefined) {
      this.filePicked.emit(file);
    }
  }
}
