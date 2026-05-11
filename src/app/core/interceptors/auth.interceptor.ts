import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.token;
  const role = auth.currentUser?.role;
  const authenticatedRequest = token
    ? request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
        ...(role ? { 'X-User-Role': role } : {})
      }
    })
    : request;

  return next(authenticatedRequest);
};
