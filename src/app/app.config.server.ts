import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideNoopAnimations(),
    provideServerRendering(withRoutes(serverRoutes)),
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
