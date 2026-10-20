import type { ApplicationRef } from '@angular/core';
import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { serverConfig } from './app/app.config.server';

const bootstrap = async (context: BootstrapContext): Promise<ApplicationRef> => await bootstrapApplication(AppComponent, serverConfig, context);

export default bootstrap;
