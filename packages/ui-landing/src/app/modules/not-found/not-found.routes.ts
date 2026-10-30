import { inject } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';
import { I18nStore } from '../../stores/i18n/store/i18n-store/i18n.store';
import { NotFoundPageComponent } from './pages/not-found-page/not-found-page.component';

const notFoundTitle: ResolveFn<string> = () => inject(I18nStore).texts().notFound.title;

export const notFoundRoutes: Routes = [{ path: '', component: NotFoundPageComponent, title: notFoundTitle }];
