import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { SILENT_HTTP_ERRORS } from './http-context.tokens';

export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const notifications = inject(NotificationService);

  return next(request).pipe(
    catchError((error: unknown) => {
      const silent = request.context.get(SILENT_HTTP_ERRORS);

      if (error instanceof HttpErrorResponse) {
        if (error.status === 0) {
          if (!silent) {
            notifications.error('Cannot reach the StockPro API. Please make sure the backend gateway is running on port 8080.');
          }
        } else if (error.status === 401) {
          if (!silent) {
            notifications.error('Your session has expired. Please sign in again.');
          }
          auth.logout();
        } else if (!silent && error.status === 403) {
          notifications.error('You do not have permission to perform this action.');
        } else if (!silent && error.status >= 500) {
          notifications.error('StockPro service is temporarily unavailable.');
        } else if (!silent && error.status > 0) {
          notifications.error(extractMessage(error));
        }
      }

      return throwError(() => error);
    })
  );
};

function extractMessage(error: HttpErrorResponse): string {
  const body = error.error as { message?: unknown } | string | null;

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  if (body && typeof body === 'object' && typeof body.message === 'string') {
    return body.message;
  }

  return 'Request failed. Please review your input and try again.';
}
