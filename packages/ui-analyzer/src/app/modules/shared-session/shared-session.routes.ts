import { inject } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';
import { I18nStore } from '../../stores/i18n/store/i18n-store/i18n.store';
import { SharedSessionPageComponent } from './pages/shared-session-page/shared-session-page.component';

const sharedSessionTitle: ResolveFn<string> = () => inject(I18nStore).texts().sharing.viewer.banner;

export const sharedSessionRoutes: Routes = [{ path: ':sessionId/:key', component: SharedSessionPageComponent, title: sharedSessionTitle }];
