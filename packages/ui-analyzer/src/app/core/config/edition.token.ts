import { InjectionToken } from '@angular/core';
import { EDITION } from './edition.config';
import type { Edition } from './edition.model';

export const APPLICATION_EDITION = new InjectionToken<Edition>('APPLICATION_EDITION', { providedIn: 'root', factory: () => EDITION });
