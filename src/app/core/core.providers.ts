import { EnvironmentProviders, ErrorHandler, Provider, importProvidersFrom } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { GlobalErrorHandler } from './handlers/global-error.handler';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';

export function provideCore(): Array<EnvironmentProviders | Provider> {
  return [
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideCharts(withDefaultRegisterables()),
    importProvidersFrom(MatSnackBarModule),
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler
    }
  ];
}
