import { inject } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';
import { I18nStore } from '../../stores/i18n/store/i18n-store/i18n.store';
import { LibraryPageComponent } from './pages/library-page/library-page.component';

const libraryTitle: ResolveFn<string> = () => inject(I18nStore).texts().application.libraryTitle;

export const libraryRoutes: Routes = [{ path: '', component: LibraryPageComponent, title: libraryTitle }];
