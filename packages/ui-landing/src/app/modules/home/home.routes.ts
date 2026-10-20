import { inject } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';
import { I18nStore } from '../../stores/i18n/store/i18n-store/i18n.store';
import { HomePageComponent } from './pages/home-page/home-page.component';

const homeTitle: ResolveFn<string> = () => inject(I18nStore).texts().meta.title;

export const homeRoutes: Routes = [{ path: '', component: HomePageComponent, title: homeTitle }];
